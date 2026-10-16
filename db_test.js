const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'test'
  });
  const [rows] = await connection.query('SHOW TABLES');
  console.log(rows);

  for (const row of rows) {
    const tableName = Object.values(row)[0];
    const [cols] = await connection.query(`SHOW COLUMNS FROM ${tableName}`);
    console.log(tableName, cols.map(c => c.Field));
  }

  connection.end();
}
run();
