const { Sequelize } = require('sequelize');

// Create a connection pool
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    pool: {
        max: 40, // Maximum number of connections in the pool
        min: 8,  // Minimum number of connections in the pool
        acquire: 60000, // Maximum time, in ms, a connection can be idle before being released
        idle: 10000, // Maximum time, in ms, that pool will try to get a connection before throwing error
    },
    logging: false, // Set to `true` to log SQL queries for debugging
});

module.exports = sequelize;