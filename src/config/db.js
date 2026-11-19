const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  timezone: '+05:30'
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+05:30'", (error) => {
    if (error) {
      console.error('Unable to set MySQL session timezone to Asia/Kolkata:', error.message);
      connection.destroy();
    }
  });
});

module.exports = pool;
