const fs = require("fs");
const os = require("os");
const path = require("path");
const { Sequelize } = require("sequelize");
const AWS = require("aws-sdk");
const { parse, Parser } = require("json2csv");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { getIo } = require("../socket/socket");

// ------- Config -------
const s3 = new AWS.S3();
const BACKUP_BUCKET = process.env.AWS_S3_BACKUP_BUCKET_NAME;

// DB configs
const DB_CONFIG = {
  crm: {
    database: process.env.CRM_DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    dialect: "mysql",
  },
  sajan: {
    database: process.env.SAJAN_DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    dialect: "mysql",
  },
};

// Backup config
const BACKUP_CONFIG = {
  databases: {
    crm: { backupFolder: `backups/${process.env.NODE_ENV}/crm` },
    sajan: { backupFolder: `backups/${process.env.NODE_ENV}/sajan` },
  },
  versionHistory: {
    full: 4, // keep last 4 versions
  },
  chunkSize: Number(process.env.BACKUP_CHUNK_SIZE || 10000),
  tmpDir: process.env.BACKUP_TMP_DIR || os.tmpdir(),
};

// ------- DB -------
async function createSequelizeInstance(dbConfig) {
  return new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
      host: dbConfig.host,
      dialect: dbConfig.dialect,
      logging: false,
      pool: {
        max: 1,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      dialectOptions: {
        supportBigNumbers: true,
        bigNumberStrings: true,
      },
    }
  );
}

// ------- Entry point -------
async function createBackup(req, res) {
  const {
    isManualBackup = false,
    specificDatabases = null,
    specificTables = null,
  } = req.query;

  const today = new Date();
  const day = today.getUTCDate();

  if (!isManualBackup && day % 2 !== 0) {
    emitLog("⏭️ Skipping backup, as today is an odd day.");
    if (res) return ApiResponse(res, "error", 400, "Skipped Backup Today!");
    return;
  }

  try {
    emitLog("🚀 Starting FULL backup process (chunked, memory-safe)...");

    const databasesToBackup = specificDatabases
      ? specificDatabases.split(",").filter((db) => BACKUP_CONFIG.databases[db])
      : Object.keys(BACKUP_CONFIG.databases);

    if (databasesToBackup.length === 0) {
      emitLog("⚠️ No valid databases specified for backup");
      if (res) return ApiResponse(res, "error", 400, "No valid databases specified");
      return;
    }

    for (const dbName of databasesToBackup) {
      const dbConfig = BACKUP_CONFIG.databases[dbName];
      emitLog(`\n💾 Processing database: ${dbName}`);

      const sequelize = await createSequelizeInstance(DB_CONFIG[dbName]);

      try {
        await sequelize.authenticate();
        emitLog(`🔗 Database connection established for ${dbName}`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupVersion = `v${timestamp}`;
        const backupFolder = `${dbConfig.backupFolder}/${backupVersion}`;

        // Discover tables
        const [tables] = await sequelize.query("SHOW TABLES");
        const tableNames = tables.map((row) => Object.values(row)[0]);

        const tablesToBackup = specificTables
          ? specificTables.split(",").filter((t) => tableNames.includes(t))
          : tableNames;

        // ---- Compute total rows across DB for overall progress ----
        emitLog("📊 Counting total rows across all tables...");
        let dbTotalRows = 0;
        const tableRowCounts = {};
        for (const t of tablesToBackup) {
          const count = await getTableRowCount(sequelize, t);
          tableRowCounts[t] = count;
          dbTotalRows += count;
        }
        emitLog(`📊 Database ${dbName} total rows: ${dbTotalRows}`);

        let dbProcessedRows = 0;
        const dbStartTime = Date.now();

        // Backup sequentially
        for (const tableName of tablesToBackup) {
          const tableTotal = tableRowCounts[tableName];
          dbProcessedRows = await backupTableChunked(
            sequelize,
            dbName,
            tableName,
            backupFolder,
            tableTotal,
            dbProcessedRows,
            dbTotalRows,
            dbStartTime
          );
        }

        await cleanupOldVersions(dbName, dbConfig.backupFolder);
      } finally {
        await sequelize.close();
        emitLog(`🔌 Closed database connection for ${dbName}`);
      }
    }

    emitLog("\n🎉 FULL Backup process completed successfully!");
    if (res) return ApiResponse(res, "success", 200, "Backup successful");
  } catch (err) {
    console.error("❌ Backup failed:", err);
    emitLog("❌ Backup failed:" + err);
    if (res)
      return ApiResponse(res, "error", 500, err?.message || "Backup failed", {
        error: err.message,
      });
  }
}

// ------- Chunked table backup with per-table + overall progress -------
async function backupTableChunked(
  sequelize,
  dbName,
  tableName,
  backupFolder,
  totalRows,
  dbProcessedRows,
  dbTotalRows,
  dbStartTime
) {
  emitLog(`\n📊 Processing table (chunked): ${tableName}`);

  const tmpCsvPath = path.join(
    BACKUP_CONFIG.tmpDir,
    `${dbName}_${tableName}_${Date.now()}.csv`
  );

  try { if (fs.existsSync(tmpCsvPath)) fs.unlinkSync(tmpCsvPath); } catch {}

  const chunkSize = BACKUP_CONFIG.chunkSize;

  if (totalRows === 0) {
    emitLog("⏩ No data to backup, skipping");
    return dbProcessedRows;
  }

  let offset = 0;
  let wroteHeader = false;
  let processed = 0;
  const tableStartTime = Date.now();

  while (true) {
    const query = `SELECT * FROM \`${tableName}\` LIMIT ${chunkSize} OFFSET ${offset}`;
    const [rows] = await sequelize.query(query, { raw: true });
    if (!rows || rows.length === 0) break;

    if (!wroteHeader) {
      const csvWithHeader = parse(rows);
      fs.appendFileSync(tmpCsvPath, csvWithHeader + "\n", "utf8");
      wroteHeader = true;
    } else {
      const parser = new Parser({ header: false, fields: Object.keys(rows[0]) });
      const csvNoHeader = parser.parse(rows);
      fs.appendFileSync(tmpCsvPath, csvNoHeader + "\n", "utf8");
    }

    processed += rows.length;
    offset += rows.length;
    dbProcessedRows += rows.length;

    // ---- Per-table progress ----
    const percentTable = ((processed / totalRows) * 100).toFixed(2);
    const elapsedTable = (Date.now() - tableStartTime) / 1000;
    const rowsPerSecTable = processed / (elapsedTable || 1);
    const etaTable = rowsPerSecTable > 0 ? (totalRows - processed) / rowsPerSecTable : 0;
    const etaStrTable = `${Math.floor(etaTable / 60)}m ${Math.round(etaTable % 60)}s`;

    emitLog(
      `📦 ${tableName}: ${processed}/${totalRows} rows (${percentTable}%) | ETA: ${etaStrTable}`
    );

    // ---- Overall DB progress ----
    const percentDB = ((dbProcessedRows / dbTotalRows) * 100).toFixed(2);
    const elapsedDB = (Date.now() - dbStartTime) / 1000;
    const rowsPerSecDB = dbProcessedRows / (elapsedDB || 1);
    const etaDB = rowsPerSecDB > 0 ? (dbTotalRows - dbProcessedRows) / rowsPerSecDB : 0;
    const etaStrDB = `${Math.floor(etaDB / 60)}m ${Math.round(etaDB % 60)}s`;

    emitLog(
      `🌐 Overall DB Progress: ${dbProcessedRows}/${dbTotalRows} rows (${percentDB}%) | ETA: ${etaStrDB}`
    );

    if (rows.length < chunkSize) break;
  }

  const s3Key = `${backupFolder}/${tableName}.csv`;
  emitLog(`📤 Uploading to S3: ${s3Key}`);

  await s3
    .upload({
      Bucket: BACKUP_BUCKET,
      Key: s3Key,
      Body: fs.createReadStream(tmpCsvPath),
      ContentType: "text/csv",
    })
    .promise();

  emitLog(`✅ Successfully backed up ${tableName} (FULL, chunked)`);

  try {
    if (fs.existsSync(tmpCsvPath)) fs.unlinkSync(tmpCsvPath);
  } catch (e) {
    emitLog(`⚠️ Could not delete temp file ${tmpCsvPath}: ${e.message}`, true);
  }

  return dbProcessedRows;
}

// Row count helper
async function getTableRowCount(sequelize, tableName) {
  try {
    const [res] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``);
    const cnt = Array.isArray(res) ? res[0].cnt : res.cnt;
    return Number(cnt || 0);
  } catch (e) {
    emitLog(`⚠️ Could not get row count for ${tableName}, proceeding anyway: ${e.message}`);
    return 0;
  }
}

// ------- Retain only last N full backups -------
async function cleanupOldVersions(dbName, backupFolder) {
  try {
    emitLog(`\n🧹 Checking for old backups to clean up in ${dbName}...`);

    const list = await s3
      .listObjectsV2({
        Bucket: BACKUP_BUCKET,
        Prefix: backupFolder + "/",
        Delimiter: "/",
      })
      .promise();

    const versions = list.CommonPrefixes?.map((p) => p.Prefix) || [];
    versions.sort().reverse();

    if (versions.length > BACKUP_CONFIG.versionHistory.full) {
      const toDelete = versions.slice(BACKUP_CONFIG.versionHistory.full);
      await deleteBackupVersions(toDelete);
    }
  } catch (err) {
    console.error(`⚠️ Failed to clean up old versions in ${dbName}:`, err);
  }
}

async function deleteBackupVersions(versions) {
  for (const version of versions) {
    emitLog(`🗑️ Deleting old backup version: ${version}`);
    const list = await s3
      .listObjectsV2({
        Bucket: BACKUP_BUCKET,
        Prefix: version,
      })
      .promise();

    if ((list.Contents || []).length > 0) {
      await s3
        .deleteObjects({
          Bucket: BACKUP_BUCKET,
          Delete: {
            Objects: list.Contents.map((item) => ({ Key: item.Key })),
          },
        })
        .promise();
    }
  }
}

// ------- Logging -------
function emitLog(message, isError = false) {
  console.log(message);
  const io = getIo();
  try {
    const adminIds = process.env.ADMIN_USER_IDS
      ? process.env.ADMIN_USER_IDS.split(",").map((id) => id.trim())
      : [];

    adminIds.forEach((userId) => {
      io.to(`user_${userId}`).emit("backup-log", {
        message,
        isError,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (emitError) {
    console.error("Failed to emit log:", emitError);
  }
}

module.exports = {
  createBackup,
};
