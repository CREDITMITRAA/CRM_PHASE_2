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

// Enhanced Backup configuration
const BACKUP_CONFIG = {
  databases: {
    crm: {
      backupFolder: `backups/${process.env.NODE_ENV}/crm`,
      fullBackupInterval: 7, // Days between full backups
      tableSizeThreshold: 100000, // Switch to incremental for tables larger than this
    },
    sajan: {
      backupFolder: `backups/${process.env.NODE_ENV}/sajan`,
      fullBackupInterval: 7,
      tableSizeThreshold: 100000,
    },
  },
  versionHistory: {
    full: 4, // Keep last 4 full backups
    incremental: 30, // Keep last 30 days of incremental backups
  },
};

// Track backup strategy per table
const tableBackupStrategies = new Map();

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
    forceFullBackup = false,
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

        // Check if we should do a full backup for this database
        const shouldDoFullBackup = await shouldPerformFullBackup(dbName, forceFullBackup === 'true');

        if (shouldDoFullBackup) {
          emitLog(`🎯 Performing FULL backup for ${dbName} (scheduled interval)`);
          await setLastFullBackupTime(dbName, new Date().toISOString());
        }

        // Backup each table
        for (const tableName of tablesToBackup) {
          await backupTable(
            sequelize,
            dbName,
            tableName,
            backupFolder,
            shouldDoFullBackup,
            dbConfig.tableSizeThreshold
          );
        }

        // Clean up old versions for this database
        await cleanupOldVersions(dbName, dbConfig.backupFolder, shouldDoFullBackup);
        
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

async function backupTable(sequelize, dbName, tableName, backupFolder, forceFull, sizeThreshold) {
  emitLog(`\n📊 Processing table: ${tableName}`);

  try {
    // Check table size to determine strategy
    const tableSize = await getTableSize(sequelize, tableName);
    const isLargeTable = tableSize > sizeThreshold;
    
    // Determine backup strategy
    let backupStrategy;
    if (forceFull) {
      backupStrategy = 'full';
    } else if (isLargeTable) {
      backupStrategy = await determineLargeTableStrategy(dbName, tableName);
    } else {
      backupStrategy = 'full'; // Small tables always get full backups
    }

    let query, backupType;

    if (backupStrategy === 'full') {
      query = `SELECT * FROM ${tableName}`;
      backupType = "FULL";
    } else {
      // Incremental backup
      const lastBackupTime = await getLastBackupTime(dbName, tableName);
      const hasUpdatedAt = await hasUpdatedAtColumn(sequelize, tableName);
      
      if (!hasUpdatedAt) {
        emitLog(`⚠️ Table ${tableName} has no updatedAt column, falling back to full backup`);
        query = `SELECT * FROM ${tableName}`;
        backupType = "FULL";
      } else if (!lastBackupTime) {
        emitLog(`🆕 First backup for large table ${tableName}, doing full backup`);
        query = `SELECT * FROM ${tableName}`;
        backupType = "FULL";
      } else {
        query = `SELECT * FROM ${tableName} WHERE updatedAt > '${lastBackupTime}'`;
        backupType = "INCREMENTAL";
      }
    }

    emitLog(`🔍 Executing ${backupType} backup query: ${query}`);
    const [rows] = await sequelize.query(query);
    emitLog(`📝 Found ${rows.length} records to backup`);

    if (rows.length === 0) {
      emitLog("⏩ No data to backup, skipping");
      return;
    }

    // Convert to CSV
    const csvData = parse(rows);
    const s3Key = `${backupFolder}/${tableName}.csv`;

    emitLog(`📤 Uploading to S3: ${s3Key}`);
    await s3.putObject({
      Bucket: BACKUP_BUCKET,
      Key: s3Key,
      Body: csvData,
      ContentType: "text/csv",
    }).promise();

    emitLog(`✅ Successfully backed up ${tableName} (${backupType})`);

    // Update backup time markers
    if (backupType === "INCREMENTAL" && rows.length > 0) {
      const latestRecordTime = getLatestTimestamp(rows, "updatedAt");
      await setLastBackupTime(dbName, tableName, latestRecordTime);
      emitLog(`🕒 Updated last backup time for ${tableName} to ${latestRecordTime}`);
    }

    // Store the strategy used for this table
    tableBackupStrategies.set(`${dbName}_${tableName}`, backupStrategy);

  } catch (error) {
    emitLog(`❌ Failed to backup table ${tableName}: ${error.message}`, true);
    throw error;
  }
}

async function getTableSize(sequelize, tableName) {
  try {
    const [result] = await sequelize.query(
      `SELECT COUNT(*) as count FROM ${tableName}`
    );
    return result[0].count;
  } catch (error) {
    emitLog(`⚠️ Could not get table size for ${tableName}, assuming small`);
    return 0;
  }
}

async function hasUpdatedAtColumn(sequelize, tableName) {
  const [columns] = await sequelize.query(
    `SHOW COLUMNS FROM ${tableName} LIKE 'updatedAt'`
  );
  return columns.length > 0;
}

async function determineLargeTableStrategy(dbName, tableName) {
  // For large tables, use incremental unless it's time for a full backup
  const lastFullBackup = await getLastFullBackupTime(dbName);
  if (!lastFullBackup) return 'full';
  
  const daysSinceFullBackup = Math.floor(
    (new Date() - new Date(lastFullBackup)) / (1000 * 60 * 60 * 24)
  );
  
  return daysSinceFullBackup >= BACKUP_CONFIG.databases[dbName].fullBackupInterval 
    ? 'full' 
    : 'incremental';
}

async function shouldPerformFullBackup(dbName, forceFull) {
  if (forceFull) return true;
  
  const lastFullBackup = await getLastFullBackupTime(dbName);
  if (!lastFullBackup) return true;
  
  const daysSinceFullBackup = Math.floor(
    (new Date() - new Date(lastFullBackup)) / (1000 * 60 * 60 * 24)
  );
  
  return daysSinceFullBackup >= BACKUP_CONFIG.databases[dbName].fullBackupInterval;
}

async function getLastFullBackupTime(dbName) {
  try {
    const markerKey = `backup_markers/${dbName}/last_full_backup.txt`;
    const data = await s3.getObject({
      Bucket: BACKUP_BUCKET,
      Key: markerKey,
    }).promise();
    return data.Body.toString("utf-8");
  } catch (err) {
    if (err.code === "NoSuchKey") return null;
    throw err;
  }
}

async function setLastFullBackupTime(dbName, timestamp) {
  const markerKey = `backup_markers/${dbName}/last_full_backup.txt`;
  await s3.putObject({
    Bucket: BACKUP_BUCKET,
    Key: markerKey,
    Body: timestamp,
    ContentType: "text/plain",
  }).promise();
}

// Enhanced cleanup that understands backup types
async function cleanupOldVersions(dbName, backupFolder, isFullBackup) {
  try {
    emitLog(`\n🧹 Checking for old backups to clean up in ${dbName}...`);

    const list = await s3.listObjectsV2({
      Bucket: BACKUP_BUCKET,
      Prefix: backupFolder + "/",
      Delimiter: "/",
    }).promise();

    const versions = list.CommonPrefixes?.map((p) => p.Prefix) || [];
    versions.sort().reverse();

    if (isFullBackup) {
      // For full backups, keep only the last X full backups
      const fullBackups = await identifyFullBackups(dbName, versions);
      if (fullBackups.length > BACKUP_CONFIG.versionHistory.full) {
        const toDelete = fullBackups.slice(BACKUP_CONFIG.versionHistory.full);
        await deleteBackupVersions(toDelete);
      }
    } else {
      // For incremental backups, clean up by age
      const oldIncrementals = await getOldIncrementalBackups(versions);
      if (oldIncrementals.length > 0) {
        await deleteBackupVersions(oldIncrementals);
      }
    }
  } catch (err) {
    console.error(`⚠️ Failed to clean up old versions in ${dbName}:`, err);
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

function emitLog(message, isError = false) {
  console.log(message); // still log to backend console
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
  tableBackupStrategies, // Export for monitoring
};