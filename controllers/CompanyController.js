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

        const results = [];
        let processedCount = 0;
        const batchSize = 1000;
        const errors = [];

        // Process Excel file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        sendProgress({
            status: 'processing',
            message: 'Excel file loaded. Parsing data...',
            percentage: 10
        });

        const worksheet = workbook.getWorksheet(1);
        
        if (!worksheet || worksheet.rowCount < 2) {
            await transaction.rollback();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
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
            // Examples: "Company Name", "company_name", "CompanyName", "name", etc.
            if (companyNameIndex === -1) {
                if (normalizedHeader === 'companyname' || 
                    normalizedHeader === 'company_name' ||
                    normalizedHeader === 'name' ||
                    (normalizedHeader.includes('company') && normalizedHeader.includes('name'))) {
                    companyNameIndex = colNumber;
                }
            }
            
            // Match category column - various formats
            // Examples: "Company Category", "company_category", "CompanyCategory", "category", etc.
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
            message: 'Headers validated. Parsing rows...',
            percentage: 15
        });

        const totalRows = worksheet.rowCount - 1; // Exclude header
        let parsedRows = 0;

        // Parse data rows
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

            results.push({
                company_name: companyName,
                company_category: companyCategory
            });

            parsedRows++;
            
            // Send progress every 100 rows
            if (parsedRows % 100 === 0) {
                const parsePercentage = 15 + Math.round((parsedRows / totalRows) * 20);
                sendProgress({
                    status: 'processing',
                    message: `Parsing rows: ${parsedRows}/${totalRows}`,
                    percentage: parsePercentage,
                    parsedRows: parsedRows,
                    totalRows: totalRows
                });
            }
        }

        if (results.length === 0) {
            await transaction.rollback();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            sendProgress({
                status: 'error',
                message: 'No valid companies found in the file.',
                percentage: 0,
                data: {
                    totalRows: results.length + errors.length,
                    validCompanies: 0,
                    invalidCompanies: errors.length,
                    errors: errors
                }
            });
            res.end();
            return;
        }

        sendProgress({
            status: 'processing',
            message: `Parsed ${results.length} companies. Removing duplicates...`,
            percentage: 40
        });

        // Remove duplicates (case-insensitive) - keep last occurrence
        const companiesMap = new Map();
        results.forEach(company => {
            const normalizedName = company.company_name.toLowerCase().trim();
            companiesMap.set(normalizedName, {
                company_name: company.company_name.trim(),
                company_category: company.company_category.trim()
            });
        });

        const uniqueCompanies = Array.from(companiesMap.values());

        sendProgress({
            status: 'processing',
            message: `Found ${uniqueCompanies.length} unique companies. Deleting existing records...`,
            percentage: 45
        });

        // Delete all existing companies before inserting new ones (within transaction)
        const deletedCount = await Company.destroy({
            where: {},
            transaction,
            force: true // Hard delete
        });

        sendProgress({
            status: 'processing',
            message: `Deleted ${deletedCount} existing companies. Inserting new records...`,
            percentage: 50,
            deletedRecords: deletedCount
        });

        let insertedCount = 0;
        const totalBatches = Math.ceil(uniqueCompanies.length / batchSize);

        // Process in batches
        for (let i = 0; i < uniqueCompanies.length; i += batchSize) {
            const batch = uniqueCompanies.slice(i, i + batchSize);
            const currentBatch = Math.floor(i / batchSize) + 1;
            
            try {
                // Use bulkCreate for better performance
                await Company.bulkCreate(batch, {
                    transaction,
                    ignoreDuplicates: false // No need to ignore since we deleted all
                });
                
                processedCount += batch.length;
                insertedCount += batch.length;
                
                // Calculate progress percentage (50% to 95% for batch processing)
                const batchProgress = 50 + Math.round((processedCount / uniqueCompanies.length) * 45);
                
                sendProgress({
                    status: 'processing',
                    message: `Processing batch ${currentBatch}/${totalBatches}: ${processedCount}/${uniqueCompanies.length} records`,
                    percentage: batchProgress,
                    currentBatch: currentBatch,
                    totalBatches: totalBatches,
                    processed: processedCount,
                    total: uniqueCompanies.length,
                    inserted: insertedCount
                });
            } catch (batchError) {
                console.error(`Error processing batch starting at record ${i}:`, batchError);
                await transaction.rollback();
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                sendProgress({
                    status: 'error',
                    message: `Failed to insert batch starting at record ${i}: ${batchError.message}`,
                    percentage: 0
                });
                res.end();
                return;
            }
        }

        // Only commit if all batches were processed successfully
        await transaction.commit();
        console.log(`Transaction committed successfully. Replaced ${deletedCount} old records with ${insertedCount} new records.`);

        sendProgress({
            status: 'success',
            message: `File processed successfully. Replaced ${deletedCount} old records with ${insertedCount} new records.`,
            percentage: 100,
            data: {
                deletedRecords: deletedCount,
                totalRecords: results.length,
                processedRecords: processedCount,
                insertedRecords: insertedCount,
                duplicateRecords: uniqueCompanies.length - insertedCount,
                errors: errors.length > 0 ? errors : null
            }
        });

        // Clean up uploaded file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.end();

    } catch (error) {
        await transaction.rollback();
        
        // Clean up uploaded file
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

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