const { Op } = require("sequelize")
const { Company, sequelize } = require("../models")
const { ApiResponse } = require("../utilities/api-responses/ApiResponse")
const ExcelJS = require("exceljs")
const fs = require("fs")
const path = require("path")

async function searchCompanyForCategory(req,res){
    try {
        const { companyName, category } = req.query

        if(!companyName){
            return ApiResponse(res, "ERROR", 400, "Company name is required !")
        }

        // Build where conditions for case-insensitive partial matching
        const whereConditions = {
            company_name: sequelize.where(
                sequelize.fn('LOWER', sequelize.col('company_name')),
                'LIKE',
                `%${companyName.toLowerCase()}%`
            )
        }

        // Optionally filter by category if provided
        if(category){
            whereConditions.company_category = sequelize.where(
                sequelize.fn('LOWER', sequelize.col('company_category')),
                'LIKE',
                `%${category.toLowerCase()}%`
            )
        }

        // Search for companies with partial matching (case-insensitive)
        const companies = await Company.findAll({
            where: whereConditions,
            attributes: ['id', 'company_name', 'company_category'],
            limit: 50 // Limit results to prevent too many results
        })

        return ApiResponse(
            res,
            "success",
            200,
            "Companies retrieved successfully",
            companies,
            null,
            null
        )
    } catch (error) {
        return ApiResponse(
            res,
            "error",
            500,
            error?.message || "Failed to search companies",
            null,
            error,
            null
        )
    }
}

async function uploadCompaniesFromFile(req, res) {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    const transaction = await sequelize.transaction();
    let filePath = null;
    let workbook = null;

    // Helper function to send SSE progress updates
    const sendProgress = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const file = req.file;
        
        if (!file) {
            sendProgress({
                status: 'error',
                message: 'No file uploaded',
                percentage: 0
            });
            res.end();
            return;
        }

        filePath = file.path;
        const fileExtension = path.extname(file.originalname).toLowerCase();
        const validExtensions = ['.xlsx', '.xls'];
        
        if (!validExtensions.includes(fileExtension)) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            sendProgress({
                status: 'error',
                message: 'Invalid file format. Please upload an Excel file (.xlsx or .xls).',
                percentage: 0
            });
            res.end();
            return;
        }

        // Send progress: File validated
        sendProgress({
            status: 'processing',
            message: 'File validated. Reading Excel file...',
            percentage: 5
        });

        // Memory-efficient processing: Use smaller batch sizes and process incrementally
        const batchSize = 500; // Reduced batch size for memory efficiency
        const processingBatchSize = 100; // Process rows in smaller chunks
        const errors = [];
        let totalRows = 0;
        let parsedRows = 0;
        let insertedCount = 0;
        let deletedCount = 0;

        // Process Excel file
        workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        sendProgress({
            status: 'processing',
            message: 'Excel file loaded. Parsing data...',
            percentage: 10
        });

        const worksheet = workbook.getWorksheet(1);
        
        if (!worksheet) {
            await transaction.rollback();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            workbook = null; // Clear reference
            sendProgress({
                status: 'error',
                message: 'Excel file is empty or has no data rows.',
                percentage: 0
            });
            res.end();
            return;
        }

        // Read header row
        const headerRow = worksheet.getRow(1);
        const headers = {};
        let companyNameIndex = -1;
        let categoryIndex = -1;
        
        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const headerValue = cell.value?.toString().trim() || '';
            const normalizedHeader = headerValue.toLowerCase().replace(/[_\s-]/g, '');
            headers[colNumber] = headerValue;
            
            // Match company name column - various formats
            if (companyNameIndex === -1) {
                if (normalizedHeader === 'companyname' || 
                    normalizedHeader === 'company_name' ||
                    normalizedHeader === 'name' ||
                    (normalizedHeader.includes('company') && normalizedHeader.includes('name'))) {
                    companyNameIndex = colNumber;
                }
            }
            
            // Match category column - various formats
            if (categoryIndex === -1) {
                if (normalizedHeader === 'companycategory' || 
                    normalizedHeader === 'company_category' ||
                    normalizedHeader === 'category' ||
                    normalizedHeader.includes('category')) {
                    categoryIndex = colNumber;
                }
            }
        });
        
        // Log detected columns for debugging
        if (companyNameIndex !== -1 && categoryIndex !== -1) {
            console.log(`Excel columns detected - Company Name column: ${companyNameIndex} ("${headers[companyNameIndex]}"), Category column: ${categoryIndex} ("${headers[categoryIndex]}")`);
        } else {
            console.log(`Excel columns found: ${Object.values(headers).join(', ')}`);
        }

        if (companyNameIndex === -1 || categoryIndex === -1) {
            await transaction.rollback();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            workbook = null; // Clear reference
            const foundHeaders = Object.values(headers).join(', ');
            sendProgress({
                status: 'error',
                message: `Excel file must contain columns: "Company Name" and "Company Category" or "Category". Found headers: ${foundHeaders || 'None'}`,
                percentage: 0
            });
            res.end();
            return;
        }

        sendProgress({
            status: 'processing',
            message: 'Headers validated. Counting rows...',
            percentage: 15
        });

        // Count total rows efficiently (without loading all into memory)
        totalRows = worksheet.rowCount - 1; // Exclude header
        if (totalRows <= 0) {
            await transaction.rollback();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            workbook = null; // Clear reference
            sendProgress({
                status: 'error',
                message: 'Excel file has no data rows.',
                percentage: 0
            });
            res.end();
            return;
        }

        sendProgress({
            status: 'processing',
            message: `Found ${totalRows} rows. Deleting existing records...`,
            percentage: 20
        });

        // Delete all existing companies before inserting new ones (within transaction)
        deletedCount = await Company.destroy({
            where: {},
            transaction,
            force: true // Hard delete
        });

        sendProgress({
            status: 'processing',
            message: `Deleted ${deletedCount} existing companies. Processing and inserting records...`,
            percentage: 25,
            deletedRecords: deletedCount
        });

        // Memory-efficient processing: Process rows in batches and insert incrementally
        // Use Set for deduplication (more memory efficient than Map for this use case)
        const seenCompanies = new Set();
        let currentBatch = [];
        let validCompaniesCount = 0;
        let duplicateCount = 0;

        // Process rows in chunks to avoid loading everything into memory
        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const companyName = row.getCell(companyNameIndex).value?.toString().trim();
            const companyCategory = row.getCell(categoryIndex).value?.toString().trim();

            // Skip empty rows
            if (!companyName && !companyCategory) {
                continue;
            }

            // Validate required fields
            if (!companyName) {
                errors.push({
                    row: rowNumber,
                    company_name: "N/A",
                    company_category: companyCategory || "N/A",
                    reason: "Company name is required"
                });
                continue;
            }

            if (!companyCategory) {
                errors.push({
                    row: rowNumber,
                    company_name: companyName,
                    company_category: "N/A",
                    reason: "Company category is required"
                });
                continue;
            }

            // Check for duplicates (case-insensitive)
            const normalizedName = companyName.toLowerCase().trim();
            if (seenCompanies.has(normalizedName)) {
                duplicateCount++;
                continue;
            }

            // Add to seen set and batch
            seenCompanies.add(normalizedName);
            currentBatch.push({
                company_name: companyName.trim(),
                company_category: companyCategory.trim()
            });

            validCompaniesCount++;
            parsedRows++;

            // Insert in batches to avoid memory buildup
            if (currentBatch.length >= batchSize) {
                try {
                    await Company.bulkCreate(currentBatch, {
                        transaction,
                        ignoreDuplicates: false
                    });
                    
                    insertedCount += currentBatch.length;
                    
                    // Clear batch to free memory
                    currentBatch = [];
                    
                    // Send progress update
                    const progress = 25 + Math.round((parsedRows / totalRows) * 70);
                    sendProgress({
                        status: 'processing',
                        message: `Processing: ${parsedRows}/${totalRows} rows (${insertedCount} inserted)`,
                        percentage: progress,
                        parsedRows: parsedRows,
                        totalRows: totalRows,
                        inserted: insertedCount
                    });

                    // Force garbage collection hint periodically (if available)
                    if (parsedRows % (batchSize * 10) === 0 && global.gc) {
                        global.gc(); // Call GC if available (requires --expose-gc flag)
                    }
                } catch (batchError) {
                    console.error(`Error processing batch at row ${rowNumber}:`, batchError);
                    await transaction.rollback();
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                    workbook = null; // Clear reference
                    sendProgress({
                        status: 'error',
                        message: `Failed to insert batch at row ${rowNumber}: ${batchError.message}`,
                        percentage: 0
                    });
                    res.end();
                    return;
                }
            }

            // Send progress every processingBatchSize rows
            if (parsedRows % processingBatchSize === 0) {
                const progress = 25 + Math.round((parsedRows / totalRows) * 70);
                sendProgress({
                    status: 'processing',
                    message: `Processing: ${parsedRows}/${totalRows} rows`,
                    percentage: progress,
                    parsedRows: parsedRows,
                    totalRows: totalRows,
                    inserted: insertedCount
                });
            }
        }

        // Insert remaining batch
        if (currentBatch.length > 0) {
            try {
                await Company.bulkCreate(currentBatch, {
                    transaction,
                    ignoreDuplicates: false
                });
                insertedCount += currentBatch.length;
                currentBatch = []; // Clear batch
            } catch (batchError) {
                console.error(`Error processing final batch:`, batchError);
                await transaction.rollback();
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                workbook = null; // Clear reference
                sendProgress({
                    status: 'error',
                    message: `Failed to insert final batch: ${batchError.message}`,
                    percentage: 0
                });
                res.end();
                return;
            }
        }

        if (insertedCount === 0) {
            await transaction.rollback();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            workbook = null; // Clear reference
            sendProgress({
                status: 'error',
                message: 'No valid companies found in the file.',
                percentage: 0,
                data: {
                    totalRows: totalRows,
                    validCompanies: 0,
                    invalidCompanies: errors.length,
                    errors: errors.length > 0 ? errors.slice(0, 100) : null // Limit error output
                }
            });
            res.end();
            return;
        }

        // Only commit if all batches were processed successfully
        await transaction.commit();
        console.log(`Transaction committed successfully. Replaced ${deletedCount} old records with ${insertedCount} new records.`);

        // Clear workbook reference to free memory
        workbook = null;

        sendProgress({
            status: 'success',
            message: `File processed successfully. Replaced ${deletedCount} old records with ${insertedCount} new records.`,
            percentage: 100,
            data: {
                deletedRecords: deletedCount,
                totalRows: totalRows,
                processedRecords: parsedRows,
                insertedRecords: insertedCount,
                duplicateRecords: duplicateCount,
                errors: errors.length > 0 ? errors.slice(0, 100) : null // Limit error output
            }
        });

        // Clean up uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Clear large objects
        seenCompanies.clear();

        res.end();

    } catch (error) {
        await transaction.rollback();
        
        // Clean up uploaded file
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Clear workbook reference
        workbook = null;

        sendProgress({
            status: 'error',
            message: error?.message || 'Internal server error',
            percentage: 0
        });
        res.end();
    }
}

module.exports = {
    searchCompanyForCategory,
    uploadCompaniesFromFile
}