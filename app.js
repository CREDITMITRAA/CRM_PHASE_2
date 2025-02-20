require('dotenv').config()
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
// const morgan = require('morgan');
const { sequelize } = require('./models'); // Sequelize instance
const routes = require('./routes/index');
const { ApiResponse } = require('./utilities/api-responses/ApiResponse');
const cron = require('node-cron');
const { createBackup } = require('./controllers/backupController');
const socketIo = require('socket.io');
const { initializeSocket } = require('./socket/socket');

const app = express();

// Middleware
app.use(helmet()); // For security headers
app.use(bodyParser.json()); // Parse incoming JSON requests
app.use(bodyParser.urlencoded({ extended: true })); // Parse URL-encoded data
// app.use(morgan('dev')); // Log HTTP requests
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN_URL,
  // origin: 'http://crm.creditmitra.in',  // Your frontend URL for PRODUCTION
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,  // Allow credentials (cookies, tokens)
}));
app.options('*', cors());  // Handle preflight OPTIONS requests

// Test endpoint
app.get('/', (req, res) => {
  return ApiResponse(res, 'success', 200, 'API is running smoothly');
});

// Routes
app.use('/api', routes);

// Error handling middleware for 404
app.use((req, res, next) => {
  ApiResponse(res, 'error', 404, 'Endpoint not found');
});

// Error handling middleware for server errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  ApiResponse(
    res,
    'error',
    500,
    'Internal Server Error',
    null,
    { message: err.message }
  );
});

// Start the server
const PORT = process.env.PORT || 3000;

cron.schedule("30 5 * * *", async () => {
  console.log("⏳ Running scheduled database backup...");
  await createBackup(); // No req, res here
});


let server;
let io;
// Sync Sequelize models and start the server
sequelize
  .authenticate()
  .then(() => {
    console.log('Database connected successfully.');
    return sequelize.sync({ alter: process.env.ALTER_SEQUALIZE === 'TRUE' && true, force: process.env.FORCE_SEQUALIZE === 'TRUE' && true, logging:process.env.LOG_SQL === 'TRUE' && console.log }); // Sync models with DB
  })
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
    initializeSocket(server)
  })
  .catch((err) => {
    console.error('Failed to connect to the database:', err.message);
  });

 io = socketIo(server,{
  cors:{
    origin:process.env.FRONTEND_ORIGIN_URL,
    methods:["GET","POST"]
  }
})

// let count = 0;
// io.on("connect", (socket)=>{
//   console.log("A user connected ", socket.id);
//   socket.on("disconnect", () => {
//     console.log("User disconnected !", socket.id);
    
//   }),
//   socket.on("count", ()=>{
//     console.log("count received");
//   })
// })

module.exports = {app,io};