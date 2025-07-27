require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { sequelize } = require('./models');
const routes = require('./routes/index');
const { ApiResponse } = require('./utilities/api-responses/ApiResponse');
const cron = require('node-cron');
const { createBackup } = require('./controllers/backupController');
const socketIo = require('socket.io');
const { initializeSocket } = require('./socket/socket');

const app = express();
const allowedOrigins = process.env.FRONTEND_ORIGIN_URL.split(",");

// Increase timeout settings
app.use((req, res, next) => {
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000);
  next();
});

// Middleware
app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.options('*', cors());

// Routes and error handling
app.get('/', (req, res) => {
  return ApiResponse(res, 'success', 200, 'API is running smoothly');
});
app.use('/api', routes);
app.use((req, res, next) => ApiResponse(res, 'error', 404, 'Endpoint not found'));
app.use((err, req, res, next) => {
  console.error(err.stack);
  ApiResponse(res, 'error', 500, 'Internal Server Error', null, { message: err.message });
});

// Start server
const PORT = process.env.PORT || 3000;
let server, io;

// Scheduled backup
cron.schedule("30 5 * * *", async () => {
  console.log("⏳ Running scheduled database backup...");
  await createBackup({ isManualBackup: false });
});

// Database and server initialization
sequelize.authenticate()
  .then(() => {
    console.log('Database connected successfully.');
    return sequelize.sync({ 
      alter: process.env.ALTER_SEQUALIZE === 'TRUE',
      force: process.env.FORCE_SEQUALIZE === 'TRUE',
      logging: process.env.LOG_SQL === 'TRUE' && console.log
    });
  })
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
    
    // Socket.IO with multiple origins
    io = socketIo(server, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket']
    });
    
    // Add connection logging
    io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
    
    initializeSocket(io);
  })
  .catch((err) => {
    console.error('Failed to connect to the database:', err.message);
  });

module.exports = { app, io };