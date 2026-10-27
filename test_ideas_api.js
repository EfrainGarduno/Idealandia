const http = require('http');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const request = (options, postData) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: data ? JSON.parse(data) : null }));
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
};

async function runTests() {
    console.log("Starting Ideas API tests...");

    let pool;
    let dbAvailable = false;
    try {
        pool = await mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'idealandia'
        });
        await pool.execute('SELECT 1');
        dbAvailable = true;
    } catch(e) {
        console.log("Skipping DB tests because DB is down. (test_ideas_api.js requires a real running database to test isolation appropriately)");
        return;
    }

    const TEST_PORT = 3009;
    const { spawn } = require('child_process');
    const serverProcess = spawn('node', ['server.js'], { env: { ...process.env, AUTH_SECRET: 'testnode_ideas', PORT: TEST_PORT } });
    await new Promise(r => setTimeout(r, 2000));

    try {
        if (dbAvailable) {
            // Add user A and B
            const hash = await bcrypt.hash('testpassword', 10);
            await pool.execute("INSERT IGNORE INTO usuarios (id, usuario, password_hash, email, activo) VALUES (300, 'userA', ?, 'userA@test.com', 1)", [hash]);
            await pool.execute("INSERT IGNORE INTO usuarios (id, usuario, password_hash, email, activo) VALUES (301, 'userB', ?, 'userB@test.com', 1)", [hash]);

            // Add ideas for user A and B
            await pool.execute("INSERT INTO ideas (usuario_id, titulo, descripcion, estado) VALUES (300, 'Idea A1', 'Desc A1 keyword', 'pendiente')");
            await pool.execute("INSERT INTO ideas (usuario_id, titulo, descripcion, estado) VALUES (300, 'Idea A2', 'Desc A2 something', 'completada')");
            await pool.execute("INSERT INTO ideas (usuario_id, titulo, descripcion, estado) VALUES (301, 'Idea B1', 'Desc B1 keyword', 'pendiente')");

            // Login user A
            let loginA = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'userA', password: 'testpassword' }));
            const jwtCookieA = loginA.headers['set-cookie'][0].split(';')[0];

            // 1. Get all ideas for A
            let req1 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/ideas', method: 'GET', headers: { 'Cookie': jwtCookieA } });
            if (req1.status !== 200 || req1.data.ideas.length !== 2) throw new Error("Failed to get all ideas for user A.");

            // 2. Filter by state
            let req2 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/ideas?estado=completada', method: 'GET', headers: { 'Cookie': jwtCookieA } });
            if (req2.status !== 200 || req2.data.ideas.length !== 1 || req2.data.ideas[0].titulo !== 'Idea A2') throw new Error("Failed to filter by state.");

            // 3. Filter by keyword
            let req3 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/ideas?q=keyword', method: 'GET', headers: { 'Cookie': jwtCookieA } });
            if (req3.status !== 200 || req3.data.ideas.length !== 1 || req3.data.ideas[0].titulo !== 'Idea A1') throw new Error("Failed to filter by keyword.");

            // 4. Test unauthenticated request
            let req4 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/ideas', method: 'GET' });
            if (req4.status !== 401) throw new Error("Failed to reject unauthenticated request.");

            // 5. Test isolation (B should not be visible to A)
            // Even when B has a matching keyword "keyword", A should only see their own.
            // Verified in test 3 since it only returned 1 idea (Idea A1).
            console.log("All Ideas API tests passed successfully!");
        }
    } catch (e) {
        console.error("Test failed:", e);
        process.exitCode = 1;
    } finally {
        serverProcess.kill();

        // Clean up
        if (dbAvailable) {
            try {
                await pool.execute("DELETE FROM ideas WHERE usuario_id IN (300, 301)");
                await pool.execute("DELETE FROM usuarios WHERE id IN (300, 301)");
            } catch(e) {}
            if (pool) await pool.end();
        }
    }
}

runTests();
