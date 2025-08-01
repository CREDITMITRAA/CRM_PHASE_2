const { ApiResponse } = require("../utilities/api-responses/ApiResponse")
const { CallLog } = require("../models"); // Ensure correct path to models
// const ffmpeg = require("fluent-ffmpeg")
const multer = require('multer')
const fs = require('fs')
const path = require("path");
// const ffmpegStatic = require("ffmpeg-static");
const os = require('os')

// ffmpeg.setFfmpegPath(ffmpegStatic);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const savePath = path.join(os.homedir(), "Downloads"); // Change path if needed
        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
        }
        cb(null, savePath);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // Store with original filename
    }
});

async function createCallLog(req, res) {
    try {
        const { phone_number, call_type, status, audio_file, employee_name, employee_id, duration } = req.body;
        console.log('request received ...', req.body);
        

        if (!phone_number || !call_type) {
            return ApiResponse(res, "error", 400, "Phone number and call type are required!");
        }

        if (req.file) {
            const downloadsPath = path.join(os.homedir(), "Downloads", req.file.originalname);
            fs.renameSync(req.file.path, downloadsPath); // Move file to Downloads
            console.log("File saved at:", downloadsPath);
        } else {
            console.log("No file uploaded.");
        }

        const newCallLog = await CallLog.create({
            phone_number,
            call_type,
            employee_id,
            employee_name,
            duration,
            status: status || "active" // Default to 'active' if not provided
        });

        return ApiResponse(res, "success", 201, "Call log created successfully!", newCallLog);
    } catch (error) {
        return ApiResponse(res, "error", 500, error?.message || "Failed to create call log!", null, error);
    }
}

// async function convert(req, res) {
//     if (!req.file) {
//         return res.status(400).send("No file uploaded.");
//     }

//     const inputPath = req.file.path; // MP4 file path
//     const desktopPath = path.join(os.homedir(), "Desktop");
//     const outputPath = path.join(os.homedir(), "Downloads", req.file.filename + ".mp3");
//     console.log("Saving file at:", outputPath);


//     ffmpeg(inputPath)
//         .toFormat("mp3")
//         .on("end", () => {
//             console.log("Conversion completed:", outputPath);

//             // Send the MP3 file as a response for download
//             res.download(outputPath, "converted.mp3", (err) => {
//                 if (err) console.error("Error sending file:", err);

//                 // Cleanup: Delete both files after sending
//                 fs.unlinkSync(inputPath);
//                 // fs.unlinkSync(outputPath);
//             });
//         })
//         .on("error", (err) => {
//             console.error("Error converting file:", err);
//             res.status(500).send("Error converting file.");
//         })
//         .save(outputPath);
// }

module.exports = {
    createCallLog,
    // convert
};