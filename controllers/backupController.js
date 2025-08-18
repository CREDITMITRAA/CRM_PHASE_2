const { Op, Sequelize } = require("sequelize");
const path = require("path");
const AWS = require("aws-sdk");
const { parse } = require("json2csv");
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");
const { getIo } = require("../socket/socket");

// Configure AWS S3
const s3 = new AWS.S3();
const BACKUP_BUCKET = process.env.AWS_S3_BACKUP_BUCKET_NAME;

// Database connection configurations
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

// Backup configuration
const BACKUP_CONFIG = {
  databases: {
    crm: {
      backupFolder: `backups/${process.env.NODE_ENV}/crm`,
    },
    sajan: {
      backupFolder: `backups/${process.env.NODE_ENV}/sajan`,
    },
  },
  versionHistory: 5, // Keep last 5 versionss
};

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
        max: 1, // Use single connection for backup operation
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    }
  );
}

async function createBackup(req, res) {
  const {
    isManualBackup = false,
    specificDatabases = null,
    specificTables = null,
  } = req.query;
  const today = new Date();
  const day = today.getUTCDate();

  // Skip on odd days for automatic backups
  if (!isManualBackup && day % 2 !== 0) {
    emitLog("⏭️ Skipping backup, as today is an odd day.");
    if (res) return ApiResponse(res, "error", 400, "Skipped Backup Today!");
    return;
  }

  try {
    emitLog("🚀 Starting backup process...");

    // Determine which databases to backup
    const databasesToBackup = specificDatabases
      ? specificDatabases.split(",").filter((db) => BACKUP_CONFIG.databases[db])
      : Object.keys(BACKUP_CONFIG.databases);

    if (databasesToBackup.length === 0) {
      emitLog("⚠️ No valid databases specified for backup");
      if (res)
        return ApiResponse(res, "error", 400, "No valid databases specified");
      return;
    }

    // Process each database
    for (const dbName of databasesToBackup) {
      const dbConfig = BACKUP_CONFIG.databases[dbName];
      emitLog(`\n💾 Processing database: ${dbName}`);

      // Create database connection
      const sequelize = await createSequelizeInstance(DB_CONFIG[dbName]);

      try {
        // Verify connection
        await sequelize.authenticate();
        emitLog(`🔗 Database connection established for ${dbName}`);

        // Create timestamp for versioning
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupVersion = `v${timestamp}`;
        const backupFolder = `${dbConfig.backupFolder}/${backupVersion}`;

        // Get all tables in this database
        const [tables] = await sequelize.query("SHOW TABLES");
        const tableNames = tables.map((row) => Object.values(row)[0]);

        // Filter tables if specific ones requested
        const tablesToBackup = specificTables
          ? specificTables.split(",").filter((t) => tableNames.includes(t))
          : tableNames;

        // Backup each table
        for (const tableName of tablesToBackup) {
          emitLog(`\n📊 Processing table: ${tableName}`);

          // Check if table has updatedAt column
          const [columns] = await sequelize.query(
            `SHOW COLUMNS FROM ${tableName} LIKE 'updatedAt'`
          );
          const hasUpdatedAt = columns.length > 0;
          const incrementalField = hasUpdatedAt ? "updatedAt" : null;

          let query = `SELECT * FROM ${tableName}`;
          let backupType = "FULL";

          // For incremental backups, get last backup time
          if (incrementalField) {
            const lastBackupTime = await getLastBackupTime(dbName, tableName);
            if (lastBackupTime) {
              query += ` WHERE ${incrementalField} > '${lastBackupTime}'`;
              backupType = "INCREMENTAL";
            }
          }

          emitLog(`🔍 Executing ${backupType} backup query: ${query}`);

          const [rows] = await sequelize.query(query);
          emitLog(`📝 Found ${rows.length} records to backup`);

          if (rows.length === 0) {
            emitLog("⏩ No new data to backup, skipping");
            continue;
          }

          // Convert to CSV
          const csvData = parse(rows);
          const s3Key = `${backupFolder}/${tableName}.csv`;

          emitLog(`📤 Uploading to S3: ${s3Key}`);
          await s3
            .putObject({
              Bucket: BACKUP_BUCKET,
              Key: s3Key,
              Body: csvData,
              ContentType: "text/csv",
            })
            .promise();

          emitLog(`✅ Successfully backed up ${tableName} (${backupType})`);

          // Update the last backup time marker if incremental
          if (incrementalField && rows.length > 0) {
            const latestRecordTime = getLatestTimestamp(rows, incrementalField);
            await setLastBackupTime(dbName, tableName, latestRecordTime);
            emitLog(
              `🕒 Updated last backup time for ${tableName} to ${latestRecordTime}`
            );
          }
        }

        // Clean up old versions for this database
        await cleanupOldVersions(dbName, dbConfig.backupFolder);
      } finally {
        // Close the connection when done
        await sequelize.close();
        emitLog(`🔌 Closed database connection for ${dbName}`);
      }
    }

    emitLog("\n🎉 Backup process completed successfully!");
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

// Helper function to get the last backup time for a table
async function getLastBackupTime(dbName, tableName) {
  try {
    const markerKey = `backup_markers/${dbName}/${tableName}_last_backup.txt`;
    const data = await s3
      .getObject({
        Bucket: BACKUP_BUCKET,
        Key: markerKey,
      })
      .promise();

    return data.Body.toString("utf-8");
  } catch (err) {
    if (err.code === "NoSuchKey") {
      emitLog(
        `🆕 No previous backup marker found for ${dbName}.${tableName}, doing full backup`
      );
      return null;
    }
    throw err;
  }
}

// Helper function to set the last backup time for a table
async function setLastBackupTime(dbName, tableName, timestamp) {
  const markerKey = `backup_markers/${dbName}/${tableName}_last_backup.txt`;
  await s3
    .putObject({
      Bucket: BACKUP_BUCKET,
      Key: markerKey,
      Body: timestamp,
      ContentType: "text/plain",
    })
    .promise();
}

// Helper to get latest timestamp from results
function getLatestTimestamp(rows, field) {
  return rows
    .reduce((latest, row) => {
      const current = new Date(row[field]);
      return current > latest ? current : latest;
    }, new Date(0))
    .toISOString();
}

// Clean up old backup versions
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
    versions.sort().reverse(); // Sort newest first

    if (versions.length > BACKUP_CONFIG.versionHistory) {
      const toDelete = versions.slice(BACKUP_CONFIG.versionHistory);
      emitLog(
        `🗑️ Found ${toDelete.length} old versions to delete in ${dbName}`
      );

      for (const version of toDelete) {
        // List all files in this version
        const files = await s3
          .listObjectsV2({
            Bucket: BACKUP_BUCKET,
            Prefix: version,
          })
          .promise();

        if (files.Contents?.length > 0) {
          await s3
            .deleteObjects({
              Bucket: BACKUP_BUCKET,
              Delete: {
                Objects: files.Contents.map((f) => ({ Key: f.Key })),
              },
            })
            .promise();
          emitLog(`♻️ Deleted version: ${version}`);
        }
      }
    } else {
      emitLog(`👍 No old versions need cleanup in ${dbName}`);
    }
  } catch (err) {
    console.error(`⚠️ Failed to clean up old versions in ${dbName}:`, err);
  }
}

function emitLog(message, isError = false) {
  console.log(message); // still log to backend console
  const io = getIo();
  try {
    process.env.ADMIN_USER_IDS
      ? process.env.ADMIN_USER_IDS.split(",").map((id) => id.trim())
      : [].forEach(() => {
          io.to(`user_${userId}`).emit("backup-log", {
            message,
            isError,
            timestamp: new Date().toISOString(),
          });
        });
  } catch (emitError) {
    console.error("Failed to emit log:", emitError);
    process.env.ADMIN_USER_IDS
      ? process.env.ADMIN_USER_IDS.split(",").map((id) => id.trim())
      : [].forEach(() => {
          io.to(`user_${userId}`).emit("backup-log", {
            message,
            isError,
            timestamp: new Date().toISOString(),
          });
        });
  }
}

module.exports = {
  createBackup,
};
