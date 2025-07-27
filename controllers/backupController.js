const { Sequelize } = require("sequelize");
const AWS = require("aws-sdk");
const { parse } = require("json2csv");
const { getIo } = require("../socket/socket");
const { DATE_STR } = require("../config/backupConfig");
const path = require("path");
const fs = require("fs");

const s3 = new AWS.S3();

// Track last backup timestamps for each table
const lastBackupTimestamps = new Map();

async function createBackup({ isManualBackup = false, userId = null, fullRefresh = false }) {
    const io = getIo();
    const today = new Date();
    const day = today.getUTCDate();

    if (!isManualBackup && day % 2 !== 0) {
        const message = "Skipping backup, as today is an odd day.";
        io.emit('backup-event', {
            type: 'backup-skipped',
            data: { message, userId }
        });
        return { skipped: true, message };
    }

    try {
        // Get list of all databases (excluding system databases)
        const [databases] = await sequelize.query(`
            SELECT schema_name as database_name 
            FROM information_schema.schemata 
            WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        `);

        // Notify backup start
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

        for (const { database_name } of databases) {
            // Create a new connection for each database
            const dbConnection = new Sequelize(
                database_name,
                process.env.DB_USER,
                process.env.DB_PASSWORD,
                {
                    host: process.env.DB_HOST,
                    dialect: 'mysql',
                    logging: false
                }
            );

            try {
                // Notify database processing start
                io.emit('backup-event', {
                    type: 'database-start',
                    data: { 
                        databaseName: database_name,
                        startTime: new Date().toISOString(),
                        userId
                    }
                });

                // Get all tables in this database
                const [tables] = await dbConnection.query(`
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = ?
                `, [database_name]);

                let processedTables = 0;

                for (const { table_name } of tables) {
                    const tableKey = `${database_name}.${table_name}`;
                    const lastBackup = lastBackupTimestamps.get(tableKey) || new Date(0);
                    
                    // Notify table processing start
                    io.emit('backup-event', {
                        type: 'table-start',
                        data: { 
                            databaseName: database_name,
                            tableName: table_name,
                            startTime: new Date().toISOString(),
                            userId
                        }
                    });

                    let rows;
                    let backupType = 'full';

                    // Check if table has updated_at column for delta backup
                    const [columns] = await dbConnection.query(`
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_schema = ? 
                        AND table_name = ? 
                        AND column_name IN ('updated_at', 'modified_at')
                    `, [database_name, table_name]);

                    const hasTimestampColumn = columns.length > 0;

                    if (!fullRefresh && hasTimestampColumn) {
                        // Delta backup - only get records modified since last backup
                        rows = await dbConnection.query(`
                            SELECT * FROM ?? 
                            WHERE updated_at > ?
                            ORDER BY updated_at ASC
                        `, [table_name, lastBackup]);
                        
                        backupType = 'delta';
                    } else {
                        // Full backup - get all records
                        rows = await dbConnection.query(`SELECT * FROM ??`, [table_name]);
                    }

                    if (rows[0].length === 0) {
                        io.emit('backup-event', {
                            type: 'table-skipped',
                            data: { 
                                databaseName: database_name,
                                tableName: table_name,
                                reason: rows[0].length === 0 ? 'no-changes' : 'empty-table',
                                backupType,
                                userId
                            }
                        });
                        continue;
                    }

                    // Get the newest timestamp for delta tracking
                    let newestTimestamp = lastBackup;
                    if (hasTimestampColumn) {
                        newestTimestamp = new Date(Math.max(
                            ...rows[0].map(row => new Date(row.updated_at || row.modified_at))
                        ));
                    }

                    // Convert to CSV
                    const csvData = parse(rows[0]);
                    const s3Key = `backups/${DATE_STR}/${database_name}/${table_name}_${backupType}.csv`;

                    // Upload to S3
                    await s3.putObject({
                        Bucket: process.env.AWS_S3_BACKUP_BUCKET_NAME,
                        Key: s3Key,
                        Body: csvData,
                        ContentType: "text/csv",
                    }).promise();

                    // Update last backup timestamp
                    if (newestTimestamp > lastBackup) {
                        lastBackupTimestamps.set(tableKey, newestTimestamp);
                    }

                    processedTables++;
                    
                    // Notify table completion
                    io.emit('backup-event', {
                        type: 'table-complete',
                        data: { 
                            databaseName: database_name,
                            tableName: table_name,
                            recordCount: rows[0].length,
                            processedTables,
                            totalTables: tables.length,
                            backupType,
                            completionTime: new Date().toISOString(),
                            newestTimestamp: newestTimestamp.toISOString(),
                            userId
                        }
                    });
                }

                processedDatabases++;
                
                // Notify database completion
                io.emit('backup-event', {
                    type: 'database-complete',
                    data: { 
                        databaseName: database_name,
                        processedTables,
                        totalTables: tables.length,
                        processedDatabases,
                        totalDatabases: databases.length,
                        completionTime: new Date().toISOString(),
                        userId
                    }
                });

            } finally {
                // Close the database connection
                await dbConnection.close();
            }
        }

        // Notify backup completion
        io.emit('backup-event', {
            type: 'backup-complete',
            data: { 
                processedDatabases,
                totalDatabases: databases.length,
                completionTime: new Date().toISOString(),
                userId
            }
        });

        // Persist backup timestamps to file
        const timestampsFile = path.join(__dirname, '..', 'data', 'backupTimestamps.json');
        fs.writeFileSync(timestampsFile, JSON.stringify(Object.fromEntries(lastBackupTimestamps)));

        return { 
            success: true, 
            processedDatabases,
            backupType: fullRefresh ? 'full' : 'delta'
        };
    } catch (err) {
        io.emit('backup-event', {
            type: 'backup-error',
            data: { 
                error: err.message,
                time: new Date().toISOString(),
                userId
            }
        });
        throw err;
    }
}

// Load previous timestamps on startup
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