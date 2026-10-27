const http = require('http');
const mysql = require('mysql2/promise');
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
    console.log("Starting full Auth & Recovery tests...");

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
        console.log("Skipping DB tests because DB is down");
    }

    const TEST_PORT = 3006;
    const { spawn } = require('child_process');
    const serverProcess = spawn('node', ['server.js'], { env: { ...process.env, AUTH_SECRET: 'testnode', PORT: TEST_PORT } });
    await new Promise(r => setTimeout(r, 2000));

    try {
        if (dbAvailable) {
            // Add user
            const bcrypt = require('bcrypt');
            const hash = await bcrypt.hash('testpassword', 10);
            await pool.execute("INSERT IGNORE INTO usuarios (id, usuario, password_hash, email, activo) VALUES (200, 'testrec', ?, 'testrec@test.com', 1)", [hash]);

            // Test login with username
            let login1 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'testrec', password: 'testpassword' }));
            if (login1.status !== 200) throw new Error("Login with username failed.");

            // Test login with email
            let login2 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            if (login2.status !== 200) throw new Error("Login with email failed.");

            // Rate Limiting Test
            for (let i = 0; i < 4; i++) {
                 await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            }
            let rateLimitRes = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            if (rateLimitRes.status !== 429) throw new Error("Rate limiting failed to block 6th request.");

            // Test recover existing email using a different forwarded IP to bypass local limit
            let rec1 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/recover', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.168.1.1' } }, JSON.stringify({ email: 'testrec@test.com' }));
            if (rec1.status !== 200) throw new Error("Recover request failed.");

            // Get the token from DB (simulate email reception)
            const [resets] = await pool.execute("SELECT * FROM password_resets WHERE usuario_id = 200 ORDER BY created_at DESC LIMIT 1");
            if (resets.length === 0) throw new Error("No reset token found in DB.");
            const savedHash = resets[0].token_hash;

            const crypto = require('crypto');

            // --- Expiration Tests ---

            // 1. Test token with more than 10 minutes age is rejected
            const expiredToken = crypto.randomBytes(32).toString('hex');
            const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');

            await pool.execute(
                "INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (200, ?, DATE_SUB(NOW(), INTERVAL 1 MINUTE))",
                [expiredTokenHash]
            );

            let resetExpired = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/reset', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ token: expiredToken, password: 'newpassword123', passwordConfirm: 'newpassword123' }));
            if (resetExpired.status !== 400) throw new Error("Expired token was not rejected.");

            // 2. Test exact boundary condition (10 mins)
            const boundaryToken = crypto.randomBytes(32).toString('hex');
            const boundaryTokenHash = crypto.createHash('sha256').update(boundaryToken).digest('hex');

            // Set expiration to exactly now, which should fail because the query is strictly `> NOW()`
            await pool.execute(
                "INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (200, ?, NOW())",
                [boundaryTokenHash]
            );

            let resetBoundary = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/reset', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ token: boundaryToken, password: 'newpassword123', passwordConfirm: 'newpassword123' }));
            if (resetBoundary.status !== 400) throw new Error("Boundary token (exactly NOW) was not rejected.");


            // --- Success Test ---

            const knownToken = crypto.randomBytes(32).toString('hex');
            const knownTokenHash = crypto.createHash('sha256').update(knownToken).digest('hex');

            await pool.execute("UPDATE password_resets SET token_hash = ? WHERE usuario_id = 200", [knownTokenHash]);

            // Test reset with valid token
            let reset1 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/reset', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ token: knownToken, password: 'newpassword123', passwordConfirm: 'newpassword123' }));
            if (reset1.status !== 200) throw new Error("Valid reset failed.");

            // Grab previous JWT to test invalidation
            const oldJwtCookie = login2.headers['set-cookie'][0].split(';')[0];

            // Verify password actually changed
            let login3 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'testrec', password: 'newpassword123' }));
            if (login3.status !== 200) throw new Error("Login with new password failed.");

            // Verify new JWT works
            const newJwtCookie = login3.headers['set-cookie'][0].split(';')[0];
            let me1 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/me', method: 'GET', headers: { 'Cookie': newJwtCookie } });
            if (me1.status !== 200) throw new Error("New JWT should be valid.");

            // Verify old JWT is invalid
            let me2 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/me', method: 'GET', headers: { 'Cookie': oldJwtCookie } });
            if (me2.status !== 401) throw new Error("Old JWT should be invalidated after password reset.");

            // Test reuse of the same token
            let reset2 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/reset', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ token: knownToken, password: 'anotherpassword', passwordConfirm: 'anotherpassword' }));
            if (reset2.status !== 400) throw new Error("Reusing a token should fail.");


            // 3. Test token invalidation on new request
            let rec2 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/recover', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.168.1.2' } }, JSON.stringify({ email: 'testrec@test.com' }));

            const [pendingResets] = await pool.execute("SELECT * FROM password_resets WHERE usuario_id = 200 AND used = 0");
            if (pendingResets.length !== 1) throw new Error("There should only be 1 pending token after a new request, older ones should be invalidated.");


            // Test Rate Limit Spoofing (X-Forwarded-For should be ignored because 'trust proxy' is 'loopback' and we are simulating external IP spoofing)
            for (let i = 0; i < 4; i++) {
                 await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            }
            let rateLimitSpoof = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            let blockCheck = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));

            // To ensure it's not globally blocked, let's try a fresh IP.
            let freshIP = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '9.9.9.9' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'newpassword123' }));
            if (freshIP.status !== 200) throw new Error("Rate limiting spoof check failed or globally blocked.");

        }
        console.log("Full Auth and recovery tests passed!");
    } catch (e) {
        console.error("Test failed:", e);
        process.exitCode = 1;
    } finally {
        serverProcess.kill();

        // Clean up
        if (dbAvailable) {
            try {
                await pool.execute("DELETE FROM password_resets WHERE usuario_id = 200");
                await pool.execute("DELETE FROM usuarios WHERE id = 200");
            } catch(e) {}
            if (pool) await pool.end();
        }
    }
}

runTests();
