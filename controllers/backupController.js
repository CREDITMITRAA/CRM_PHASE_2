const fs = require("fs");
const os = require("os");
const path = require("path");
const { Sequelize } = require("sequelize");
const AWS = require("aws-sdk");
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

// Large tables configuration - ADD YOUR LARGE TABLES HERE
const LARGE_TABLES = {
  crm: [
    // Add large CRM tables here (tables with large JSON data, blobs, etc.)
    // Example: 'users', 'documents'
  ],
  sajan: [
    'B2CReports', // This is already identified as large
    'CibilReports',
    'ExperianReports'
    // ADD OTHER LARGE SAJAN TABLES HERE
    // Example: 'LargeDataTable1', 'LargeDataTable2'
  ]
};

// Optimized backup config
const BACKUP_CONFIG = {
  databases: {
    crm: { backupFolder: `backups/${process.env.NODE_ENV}/crm` },
    sajan: { backupFolder: `backups/${process.env.NODE_ENV}/sajan` },
  },
  versionHistory: {
    full: 2,
  },
  // Chunk sizes optimized for data size, not just row count
  normalChunkSize: 2000,    // For normal tables - can be larger since they're small in data size
  largeTableChunkSize: 100, // For large tables (like B2CReports with JSON data)
  tmpDir: process.env.BACKUP_TMP_DIR || os.tmpdir(),
};

// ------- DB Connection -------
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
      benchmark: false,
      typeValidation: false,
      operatorsAliases: false,
    }
  );
}

// ------- Entry Point -------
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
    emitLog("🚀 Starting OPTIMIZED backup process...");
    emitLog("💡 Using data-size optimized chunk sizes");

    const databasesToBackup = specificDatabases
      ? specificDatabases.split(",").filter((db) => BACKUP_CONFIG.databases[db])
      : Object.keys(BACKUP_CONFIG.databases);

    if (databasesToBackup.length === 0) {
      emitLog("⚠️ No valid databases specified for backup");
      if (res) return ApiResponse(res, "error", 400, "No valid databases specified");
      return;
    }

    for (const dbName of databasesToBackup) {
      await backupDatabaseOptimized(dbName, specificTables);
    }

    emitLog("\n🎉 Backup completed successfully!");
    if (res) return ApiResponse(res, "success", 200, "Backup successful");
  } catch (err) {
    console.error("❌ Backup failed:", err);
    emitLog("❌ Backup failed: " + err.message);
    if (res) {
      return ApiResponse(res, "error", 500, err?.message || "Backup failed");
    }
  }
}

// Optimized database backup
async function backupDatabaseOptimized(dbName, specificTables) {
  emitLog(`\n💾 Processing database: ${dbName}`);
  
  const sequelize = await createSequelizeInstance(DB_CONFIG[dbName]);

  try {
    await sequelize.authenticate();
    emitLog(`🔗 Database connection established`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupVersion = `v${timestamp}`;
    const backupFolder = `${BACKUP_CONFIG.databases[dbName].backupFolder}/${backupVersion}`;

    // Get table list
    const [tables] = await sequelize.query("SHOW TABLES");
    const tableNames = tables.map((row) => Object.values(row)[0]);

    const tablesToBackup = specificTables
      ? specificTables.split(",").filter((t) => tableNames.includes(t))
      : tableNames;

    if (tablesToBackup.length === 0) {
      emitLog("ℹ️ No tables to backup");
      return;
    }

    // Identify large tables based on configuration
    const dbLargeTables = LARGE_TABLES[dbName] || [];
    emitLog(`📋 Large tables for ${dbName}: ${dbLargeTables.join(', ') || 'None'}`);
    
    // Get row counts
    emitLog("📊 Counting rows...");
    const tableRowCounts = {};
    const tableIsLarge = {};
    
    for (const tableName of tablesToBackup) {
      tableRowCounts[tableName] = await getTableRowCount(sequelize, tableName);
      tableIsLarge[tableName] = dbLargeTables.includes(tableName);
      
      if (tableIsLarge[tableName]) {
        emitLog(`⚠️  ${tableName}: ${tableRowCounts[tableName]} rows (LARGE TABLE - using small chunks)`);
      }
    }

    const totalRows = Object.values(tableRowCounts).reduce((sum, count) => sum + count, 0);
    emitLog(`📊 Total rows to backup: ${totalRows}`);

    let processedRows = 0;
    const startTime = Date.now();

    // Backup tables - large tables last to avoid memory pressure early
    const sortedTables = [...tablesToBackup].sort((a, b) => {
      // Large tables go last
      if (tableIsLarge[a] && !tableIsLarge[b]) return 1;
      if (!tableIsLarge[a] && tableIsLarge[b]) return -1;
      // Both same type, sort by row count
      return tableRowCounts[a] - tableRowCounts[b];
    });

    emitLog(`🔄 Backup order: ${sortedTables.join(' → ')}`);

    for (const tableName of sortedTables) {
      const tableRows = tableRowCounts[tableName];
      const isLargeTable = tableIsLarge[tableName];
      
      processedRows = await backupTableOptimized(
        sequelize,
        dbName,
        tableName,
        backupFolder,
        tableRows,
        processedRows,
        totalRows,
        startTime,
        isLargeTable
      );

      // ✅ PERFECT TIME FOR GC: After table upload and before next table
      await forceGarbageCollection(`After uploading ${tableName}`);
    }

    // Cleanup old versions
    await cleanupOldVersions(dbName, BACKUP_CONFIG.databases[dbName].backupFolder);
    
  } finally {
    await sequelize.close();
    emitLog(`🔌 Database connection closed`);
  }
}

// Optimized table backup
async function backupTableOptimized(
  sequelize,
  dbName,
  tableName,
  backupFolder,
  totalRows,
  totalProcessedRows,
  totalAllRows,
  startTime,
  isLargeTable
) {
  const chunkSize = isLargeTable ? BACKUP_CONFIG.largeTableChunkSize : BACKUP_CONFIG.normalChunkSize;
  
  emitLog(`\n📊 Table: ${tableName} ${isLargeTable ? '(LARGE DATA - optimized)' : '(normal)'}`);
  emitLog(`📦 Chunk size: ${chunkSize}, Total rows: ${totalRows}`);

  if (totalRows === 0) {
    emitLog("⏩ No data, skipping");
    return totalProcessedRows;
  }

  const tmpCsvPath = path.join(BACKUP_CONFIG.tmpDir, `backup_${dbName}_${tableName}_${Date.now()}.csv`);
  
  try {
    const fileStream = fs.createWriteStream(tmpCsvPath, { encoding: 'utf8' });
    let offset = 0;
    let processed = 0;
    let headerWritten = false;

    // Batch processing for better performance
    const batchSize = isLargeTable ? 50 : 200; // Smaller batches for large tables

    while (processed < totalRows) {
      // Query optimized chunks
      const query = `SELECT * FROM \`${tableName}\` LIMIT ${chunkSize} OFFSET ${offset}`;
      const [rows] = await sequelize.query(query, { raw: true });

      if (!rows || rows.length === 0) break;

      // Write header once
      if (!headerWritten) {
        const headers = Object.keys(rows[0]);
        fileStream.write(headers.join(',') + '\n');
        headerWritten = true;
      }

      // Process in optimized batches
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const csvLines = [];
        
        for (const row of batch) {
          csvLines.push(convertRowToCSVOptimized(row, isLargeTable));
        }
        
        fileStream.write(csvLines.join('\n') + '\n');
      }

      processed += rows.length;
      offset += rows.length;
      totalProcessedRows += rows.length;

      // Progress reporting
      const progressInterval = isLargeTable ? 1000 : 5000; // More frequent for large tables
      if (processed % progressInterval === 0 || processed === totalRows) {
        const percentTable = ((processed / totalRows) * 100).toFixed(1);
        const percentTotal = ((totalProcessedRows / totalAllRows) * 100).toFixed(1);
        const elapsed = (Date.now() - startTime) / 1000;
        const rowsPerSec = totalProcessedRows / (elapsed || 1);
        
        emitLog(
          `📦 ${tableName}: ${processed}/${totalRows} (${percentTable}%) | Total: ${percentTotal}% | Speed: ${Math.round(rowsPerSec)} rows/sec`
        );
      }

      if (rows.length < chunkSize) break;
    }

    // Close file stream
    fileStream.end();
    await new Promise((resolve) => fileStream.on('finish', resolve));

    // Upload to S3
    const s3Key = `${backupFolder}/${tableName}.csv`;
    emitLog(`📤 Uploading to S3: ${s3Key}`);

    await uploadToS3Streaming(tmpCsvPath, s3Key);
    emitLog(`✅ Successfully backed up ${tableName} (${processed} rows)`);

  } catch (error) {
    emitLog(`❌ Failed to backup ${tableName}: ${error.message}`, true);
    throw error;
  } finally {
    // Cleanup temp file
    try {
      if (fs.existsSync(tmpCsvPath)) {
        fs.unlinkSync(tmpCsvPath);
      }
    } catch (e) {
      emitLog(`⚠️ Could not delete temp file: ${e.message}`);
    }
  }

  return totalProcessedRows;
}

// ✅ ADDED: Force garbage collection
async function forceGarbageCollection(context) {
  if (!global.gc) {
    return; // GC not exposed, skip silently
  }

  const beforeMemory = getMemoryUsage();
  
  // Run GC multiple times for thorough cleanup
  global.gc();
  await new Promise(resolve => setTimeout(resolve, 50));
  global.gc();
  
  const afterMemory = getMemoryUsage();
  const freedMemory = beforeMemory - afterMemory;
  
  if (freedMemory > 5) { // Only log if significant memory was freed
    emitLog(`🧹 GC [${context}]: Freed ${freedMemory}MB (${beforeMemory}MB → ${afterMemory}MB)`);
  }
}

// ✅ ADDED: Get memory usage
function getMemoryUsage() {
  const used = process.memoryUsage();
  return Math.round(used.heapUsed / 1024 / 1024);
}

// Optimized CSV conversion with special handling for large tables
function convertRowToCSVOptimized(row, isLargeTable) {
  const values = [];
  
  for (const key in row) {
    const field = row[key];
    
    if (field === null || field === undefined) {
      values.push('');
      continue;
    }
    
    if (typeof field === 'object') {
      // For large tables, be more careful with JSON serialization
      try {
        if (isLargeTable) {
          // For large tables, limit very large JSON objects
          let jsonStr = JSON.stringify(field);
          // If it's extremely large, truncate (but this is rare)
          if (jsonStr.length > 100000) { // 100KB per field
            jsonStr = JSON.stringify({ 
              _truncated: true,
              _original_size: jsonStr.length,
              _message: 'Field truncated due to large size'
            });
          }
          values.push(`"${jsonStr.replace(/"/g, '""')}"`);
        } else {
          // For normal tables, just stringify
          values.push(`"${JSON.stringify(field).replace(/"/g, '""')}"`);
        }
      } catch (e) {
        values.push(`"${String(field).replace(/"/g, '""')}"`);
      }
      continue;
    }
    
    const str = String(field);
    // Fast check for characters that require quoting
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      values.push(`"${str.replace(/"/g, '""')}"`);
    } else {
      values.push(str);
    }
  }
  
  return values.join(',');
}

// Stream upload to S3
async function uploadToS3Streaming(filePath, s3Key) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(filePath);
    const upload = s3.upload({
      Bucket: BACKUP_BUCKET,
      Key: s3Key,
      Body: readStream,
      ContentType: "text/csv",
    });

    upload.send((err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// Fast row count helper
async function getTableRowCount(sequelize, tableName) {
  try {
    const [res] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM \`${tableName}\``);
    return Number(res[0].cnt || 0);
  } catch (e) {
    emitLog(`⚠️ Could not get row count for ${tableName}, assuming 0: ${e.message}`);
    return 0;
  }
}

// ------- Cleanup -------
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