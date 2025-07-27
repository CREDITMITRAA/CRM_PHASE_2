const { Sequelize } = require("sequelize");
const AWS = require("aws-sdk");
const { parse } = require("json2csv");
const { getIo } = require("../socket/socket");
const { DATE_STR } = require("../config/backupConfig");
const path = require("path");
const fs = require("fs");
const { sequelize } = require("../models");

const s3 = new AWS.S3();
const lastBackupTimestamps = new Map(); // Track last backup timestamps

async function processDatabase(databaseName, io, userId, fullRefresh) {
  const dbConnection = new Sequelize(
    databaseName,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    }
  );

  try {
    io.emit('backup-event', {
      type: 'database-start',
      data: { databaseName, startTime: new Date().toISOString(), userId }
    });

    const [tables] = await dbConnection.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
      {
        replacements: [databaseName],
        type: Sequelize.QueryTypes.SELECT
      }
    );

    let processedTables = 0;

    for (const { table_name } of tables) {
      const tableKey = `${databaseName}.${table_name}`;
      const lastBackup = lastBackupTimestamps.get(tableKey) || new Date(0);

      io.emit('backup-event', {
        type: 'table-start',
        data: { databaseName, tableName: table_name, startTime: new Date().toISOString(), userId }
      });

      let rows = [];
      let backupType = 'full';

      const [columns] = await dbConnection.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_schema = ? AND table_name = ? AND column_name IN ('updated_at', 'modified_at')`,
        {
          replacements: [databaseName, table_name],
          type: Sequelize.QueryTypes.SELECT
        }
      );

      const hasTimestampColumn = columns.length > 0;

      if (!fullRefresh && hasTimestampColumn) {
        [rows] = await dbConnection.query(
          `SELECT * FROM \`${table_name}\` 
           WHERE updated_at > ? ORDER BY updated_at ASC`,
          {
            replacements: [lastBackup],
            type: Sequelize.QueryTypes.SELECT
          }
        );
        backupType = 'delta';
      } else {
        [rows] = await dbConnection.query(
          `SELECT * FROM \`${table_name}\``,
          { type: Sequelize.QueryTypes.SELECT }
        );
      }

      if (rows.length === 0) {
        io.emit('backup-event', {
          type: 'table-skipped',
          data: {
            databaseName,
            tableName: table_name,
            reason: 'no-changes',
            backupType,
            userId
          }
        });
        continue;
      }

      let newestTimestamp = lastBackup;
      if (hasTimestampColumn) {
        newestTimestamp = new Date(Math.max(...rows.map(row =>
          new Date(row.updated_at || row.modified_at)
        )));
      }

      const csvData = parse(rows);
      const s3Key = `backups/${DATE_STR}/${databaseName}/${table_name}_${backupType}.csv`;

      await s3.putObject({
        Bucket: process.env.AWS_S3_BACKUP_BUCKET_NAME,
        Key: s3Key,
        Body: csvData,
        ContentType: "text/csv",
      }).promise();

      if (newestTimestamp > lastBackup) {
        lastBackupTimestamps.set(tableKey, newestTimestamp);
      }

      processedTables++;

      io.emit('backup-event', {
        type: 'table-complete',
        data: {
          databaseName,
          tableName: table_name,
          recordCount: rows.length,
          processedTables,
          totalTables: tables.length,
          backupType,
          completionTime: new Date().toISOString(),
          newestTimestamp: newestTimestamp.toISOString(),
          userId
        }
      });
    }

    io.emit('backup-event', {
      type: 'database-complete',
      data: {
        databaseName,
        processedTables,
        totalTables: tables.length,
        completionTime: new Date().toISOString(),
        userId
      }
    });

    return processedTables;
  } finally {
    await dbConnection.close();
  }
}

async function createBackup(req, res) {
  const { isManualBackup = false, userId = null, fullRefresh = false } = req.body;
  console.log('backup request received = ', req.body);

  const io = getIo();
  const today = new Date();
  const day = today.getUTCDate();

  if (!isManualBackup && day % 2 !== 0) {
    const message = "Skipping backup, as today is an odd day.";
    io.emit('backup-event', {
      type: 'backup-skipped',
      data: { message, userId }
    });
    return res.json({ skipped: true, message });
  }

  try {
    const [databases] = await sequelize.query(
      `SELECT schema_name as database_name 
       FROM information_schema.schemata 
       WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    io.emit('backup-event', {
      type: 'backup-start',
      data: {
        isManualBackup,
        fullRefresh,
        totalDatabases: databases.length,
        startTime: new Date().toISOString(),
        userId
      }
    });

    let processedDatabases = 0;
    const CHUNK_SIZE = 2;

    for (let i = 0; i < databases.length; i += CHUNK_SIZE) {
      const chunk = databases.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async ({ database_name }) => {
        const tablesProcessed = await processDatabase(database_name, io, userId, fullRefresh);
        processedDatabases++;
        return tablesProcessed;
      }));
    }

    io.emit('backup-event', {
      type: 'backup-complete',
      data: {
        processedDatabases,
        totalDatabases: databases.length,
        completionTime: new Date().toISOString(),
        userId
      }
    });

    const timestampsFile = path.join(__dirname, '..', 'data', 'backupTimestamps.json');
    fs.writeFileSync(timestampsFile, JSON.stringify(Object.fromEntries(lastBackupTimestamps)));

    return res.json({
      success: true,
      processedDatabases,
      backupType: fullRefresh ? 'full' : 'delta'
    });
  } catch (err) {
    console.error('Backup error:', err);
    io.emit('backup-event', {
      type: 'backup-error',
      data: {
        error: err.message,
        time: new Date().toISOString(),
        userId
      }
    });
    return res.status(500).json({ success: false, error: err.message });
  }
}

function loadBackupTimestamps() {
  try {
    const timestampsFile = path.join(__dirname, '..', 'data', 'backupTimestamps.json');
    if (fs.existsSync(timestampsFile)) {
      const data = JSON.parse(fs.readFileSync(timestampsFile));
      for (const [key, value] of Object.entries(data)) {
        lastBackupTimestamps.set(key, new Date(value));
      }
    }
  } catch (err) {
    console.error('Error loading backup timestamps:', err);
  }
}

loadBackupTimestamps();

module.exports = {
  createBackup
};
