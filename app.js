require("dotenv").config();
require("./config/firebase");
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

// ================== EXPRESS APP CONFIG ==================
const app = express();
const allowedOrigins = process.env.FRONTEND_ORIGIN_URL?.split(",") || ["*"];
app.set('trust proxy', true); // Trust all proxies

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
    return sequelize.sync({ alter: process.env.ALTER_SEQUALIZE === 'TRUE' && true, force: process.env.FORCE_SEQUALIZE === 'TRUE' && true, logging:process.env.LOG_SQL === 'TRUE' && console.log });
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
