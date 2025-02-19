const { Op, where, Sequelize } = require("sequelize");
const { sequelize } = require("../models");
const path = require("path");
const AWS = require("aws-sdk");
const ExcelJS = require('exceljs');
const { parse } = require("json2csv");
const cron = require('node-cron');
const { ApiResponse } = require("../utilities/api-responses/ApiResponse");

const DATE_STR = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
const FILE_NAME = `backups/database-backup-${DATE_STR}.xlsx`; // Store in 'backups/' folder

const s3 = new AWS.S3();

async function createBackup(req, res) {
    const {isManualBackup=false} = req.query
    const today = new Date();
    const day = today.getUTCDate(); // Use UTC for consistency

    if (!isManualBackup && day % 2 !== 0) {
        console.log("Skipping backup, as today is an odd day.");
        if (res) return ApiResponse(res, 'error', 400, "Skipped Backup Today !")
        return;
    }

    try {
        console.log("Connected! Exporting data...");

        // Get all table names
        const [tables] = await sequelize.query("SHOW TABLES");
        const tableNames = tables.map((row) => Object.values(row)[0]);

        for (const tableName of tableNames) {
            console.log(`Exporting table: ${tableName}`);

            const [rows] = await sequelize.query(`SELECT * FROM ${tableName}`);
            if (rows.length === 0) continue; // Skip empty tables

            // Convert JSON to CSV
            const csvData = parse(rows);

            // Define S3 path for the CSV file
            const s3Key = `backups/database-backup-${DATE_STR}/${tableName}.csv`;

            // Upload CSV file to S3
            await s3
                .putObject({
                    Bucket: process.env.AWS_S3_BACKUP_BUCKET_NAME,
                    Key: s3Key,
                    Body: csvData,
                    ContentType: "text/csv",
                })
                .promise();

            console.log(`✅ ${tableName}.csv uploaded successfully`);
        }

        console.log("Backup process completed.");

        if (res) return res.status(200).json({ message: "Backup successful!" });
    } catch (err) {
        console.error("❌ Error:", err);
        if (res) return res.status(500).json({ error: "Failed to export database" });
    }
}

module.exports = {
    createBackup
}