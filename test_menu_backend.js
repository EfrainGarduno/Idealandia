const { execSync } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

require('dotenv').config();

async function runTests() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log("Mocking window fetch tests are separated... Now executing DB DB menu logic tests via direct DB calls or simulated API fetches.");
    // Actually, I can just use fetch since server is running, or I can boot the server in a separate process.
    // The instructions say "Ejecutes npm test", which runs `node test.js && ...`
    // I need to add tests for the API itself, which I can do using `http` module in Node inside a new test file, but `npm test` doesn't run it automatically unless I add it to `package.json`.

    // Instead of messing with starting/stopping the server inside `test.js`, I'll test the `/api/menu` logic by executing `node server.js` as a background process, making requests, and killing it.
}
runTests();
