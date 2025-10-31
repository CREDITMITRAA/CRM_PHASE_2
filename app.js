require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const { sequelize } = require("./models");
const routes = require("./routes/index");
const { ApiResponse } = require("./utilities/api-responses/ApiResponse");
const cron = require("node-cron");
const { createBackup } = require("./controllers/backupController");
const socketIo = require("socket.io");
const { initializeSocket } = require("./socket/socket");
const verifyFacebookSignature = require("./middlewares/verifyFacebookSignature");
const facebookWebhookRoutes = require("./routes/facebookWebhookRoutes");
const { sendRecentTaskNotifications } = require("./services/NotificationServices");
const admin = require("firebase-admin");
const fs = require("fs");

// ================== FIREBASE INITIALIZATION ==================
const serviceAccountPath = "./calldialerapp-86ee1-firebase-adminsdk-fbsvc-1d1a0959d1.json";
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ Missing firebase-service-account.json file!");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

console.log("🔥 Firebase Admin initialized successfully");

// ================== EXPRESS APP CONFIG ==================
const app = express();
const allowedOrigins = process.env.FRONTEND_ORIGIN_URL?.split(",") || ["*"];

app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.options("*", cors());
app.use("/webhook", bodyParser.json({ verify: verifyFacebookSignature }));
app.use("/webhook", facebookWebhookRoutes);
app.use("/api", routes);

// ================== DEVICE MANAGEMENT ==================
let deviceTokens = new Set();
deviceTokens.add("dik4YFJkTDSHJHqiIX2HR-:APA91bE-XfK7IiOzENLZlPxvIsHvcqir4ii6CDdW2JblKZZLdfnWexbrU70Tl97-VRZfRm6hi6i8Wx9qDdkNzTyFN8XRDeMsPVbJ7zhYqYF4CPOpRJGD41s")

// Register device token
app.post("/register-device", (req, res) => {
  const { token } = req.body;
  if (!token)
    return res.status(400).json({ success: false, message: "Missing token" });

  deviceTokens.add(token);
  console.log("✅ Device registered:", token.slice(0, 25) + "...");
  res.json({
    success: true,
    message: "Device registered successfully",
    deviceCount: deviceTokens.size,
  });
});

// List all devices
app.get("/devices", (req, res) => {
  res.json({
    success: true,
    deviceCount: deviceTokens.size,
    devices: Array.from(deviceTokens).map((t) => ({
      token: t.slice(0, 25) + "...",
      fullLength: t.length,
    })),
  });
});

// Delete one device
app.delete("/devices/:token", (req, res) => {
  const { token } = req.params;
  if (deviceTokens.has(token)) {
    deviceTokens.delete(token);
    return res.json({ success: true, message: "Device removed" });
  }
  res.status(404).json({ success: false, message: "Device not found" });
});

// Clear all devices
app.delete("/devices", (req, res) => {
  const count = deviceTokens.size;
  deviceTokens.clear();
  res.json({ success: true, message: `Cleared ${count} devices` });
});

// ================== TRIGGER DIAL ==================
app.post("/trigger-dial", async (req, res) => {
  const { phone_number } = req.body;
  if (!phone_number)
    return res
      .status(400)
      .json({ success: false, message: "Missing phone number" });

  if (deviceTokens.size === 0)
    return res
      .status(400)
      .json({ success: false, message: "No registered devices found" });

  console.log(`📤 Sending dial command to ${deviceTokens.size} devices: ${phone_number}`);
  let successCount = 0;

  for (const token of deviceTokens) {
    try {
      await admin.messaging().send({
  token,
  // notification: {
  //   title: "Incoming Call 📞",
  //   body: `Call from ${phone_number}`,
  // },
  data: { 
    action: "DIAL", 
    phone_number: String(phone_number)
  },
  android: {
    priority: "high",
  }
});

      console.log(`✅ Sent to: ${token.slice(0, 25)}...`);
      successCount++;
    } catch (err) {
      console.error(`❌ Failed for ${token.slice(0, 25)}...`, err.message);
    }
  }

  res.json({
    success: true,
    message: `Dial command sent to ${successCount}/${deviceTokens.size} devices`,
  });
});

// ================== HEALTH CHECK ==================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🚀 FCM Dialer Server is running",
    endpoints: {
      register_device: "POST /register-device",
      trigger_dial: "POST /trigger-dial",
      list_devices: "GET /devices",
      clear_devices: "DELETE /devices",
    },
    stats: { deviceCount: deviceTokens.size },
  });
});

// ================== ERROR HANDLERS ==================
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  ApiResponse(res, "error", 500, "Internal Server Error", null, {
    message: err.message,
  });
});

app.use((req, res) => {
  ApiResponse(res, "error", 404, "Endpoint not found");
});

// ================== SERVER START ==================
const PORT = process.env.PORT || 3001;

sequelize
  .authenticate()
  .then(() => {
    console.log("Database connected successfully.");
    return sequelize.sync({
      alter: process.env.ALTER_SEQUALIZE === "TRUE",
    });
  })
  .then(() => {
    const server = app.listen(PORT, () =>
      console.log(`🚀 Server is running at http://localhost:${PORT}`)
    );
    initializeSocket(server);
  })
  .catch((err) => console.error("DB connection failed:", err.message));

// ================== CRON JOBS ==================
cron.schedule("30 5 * * *", async () => {
  console.log("⏳ Running scheduled database backup...");
  await createBackup();
});

cron.schedule("* * * * *", () => sendRecentTaskNotifications());

// ================== PROCESS HANDLERS ==================
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
  setTimeout(() => process.exit(1), 5000);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  setTimeout(() => process.exit(1), 5000);
});

module.exports = { app };
