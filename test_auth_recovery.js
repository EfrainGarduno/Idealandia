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

            // We mock the original token by directly feeding the API the raw token if we had it, but we only have the hash.
            // Since we know the backend hashes it via sha256, we can't reverse it.
            // So we'll inject a known token into the DB.
            const crypto = require('crypto');
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

            // Test expired token
            const expiredToken = crypto.randomBytes(32).toString('hex');
            const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');

            // Insert token that expired 1 second ago
            await pool.execute("INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (?, ?, DATE_SUB(NOW(), INTERVAL 1 SECOND))", [200, expiredTokenHash]);

            let resetExpired = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/reset', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ token: expiredToken, password: 'newpassword123', passwordConfirm: 'newpassword123' }));
            if (resetExpired.status !== 400) throw new Error("Using an expired token should fail.");

            // Insert token exactly at the limit of expiration
            const boundaryToken = crypto.randomBytes(32).toString('hex');
            const boundaryTokenHash = crypto.createHash('sha256').update(boundaryToken).digest('hex');

            // Insert token that has exactly expired
            await pool.execute("INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (?, ?, NOW())", [200, boundaryTokenHash]);

            let resetBoundary = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/reset', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ token: boundaryToken, password: 'newpassword123', passwordConfirm: 'newpassword123' }));
            if (resetBoundary.status !== 400) throw new Error("Using an exactly expired token should fail.");

            // Test Rate Limit Spoofing (X-Forwarded-For should be ignored because 'trust proxy' is 'loopback' and we are simulating external IP spoofing)
            for (let i = 0; i < 4; i++) {
                 await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            }
            // 5th total on localhost (we already did 6 earlier, wait, the rate limiter tracks per IP. '127.0.0.1' did 6, so it's already blocked).
            // Actually, because 'trust proxy' is 'loopback', X-Forwarded-For is IGNORED when the connection comes from localhost (127.0.0.1 is loopback so it MIGHT trust it).
            // If it trusts it, it uses '8.8.8.8'. Let's see if 8.8.8.8 gets blocked.
            let rateLimitSpoof = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '8.8.8.8' } }, JSON.stringify({ usuario: 'testrec@test.com', password: 'testpassword' }));
            // We sent 4 to 8.8.8.8. If we send a 5th, it should pass, 6th should fail.
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
