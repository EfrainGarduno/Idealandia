const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
require('dotenv').config();

async function runTests() {
    console.log("Starting E2E Password Recovery UI tests...");

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
        process.exit(0);
    }

    const TEST_PORT = 3007;
    const serverProcess = spawn('node', ['server.js'], { env: { ...process.env, AUTH_SECRET: 'testnode_ui', PORT: TEST_PORT } });
    await new Promise(r => setTimeout(r, 2000));

    let browser;
    try {
        if (dbAvailable) {
            // Add user
            const hash = await bcrypt.hash('oldpassword', 10);
            await pool.execute("INSERT IGNORE INTO usuarios (id, usuario, password_hash, email, activo) VALUES (201, 'testui', ?, 'testui@test.com', 1)", [hash]);

            // Generate Token
            const knownToken = crypto.randomBytes(32).toString('hex');
            const knownTokenHash = crypto.createHash('sha256').update(knownToken).digest('hex');
            const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
            await pool.execute(
                'INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (?, ?, ?)',
                [201, knownTokenHash, expiresAt]
            );

            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext();
            const page = await context.newPage();

            // Test 1: Valid token allows showing the form
            console.log("Test 1: Navigate to URL with valid token");
            await page.goto(`http://localhost:${TEST_PORT}/?token=${knownToken}`);

            // Wait for DOM and timeout (fetch verify endpoint)
            await page.waitForTimeout(1000);

            // Check if reset section is visible
            const isResetVisible = await page.evaluate(() => {
                const el = document.getElementById('reset');
                return el && window.getComputedStyle(el).display !== 'none';
            });
            if (!isResetVisible) throw new Error("Reset form is not visible for valid token.");

            // Test 2: Invalid token does not show form
            console.log("Test 2: Navigate to URL with invalid token");
            await page.goto(`http://localhost:${TEST_PORT}/?token=invalidtoken123`);
            await page.waitForTimeout(1000);

            const isResetVisibleInvalid = await page.evaluate(() => {
                const el = document.getElementById('reset');
                return el && window.getComputedStyle(el).display !== 'none';
            });
            if (isResetVisibleInvalid) throw new Error("Reset form is visible for invalid token.");

            // Check modal message for invalid token
            const modalMessageInvalid = await page.evaluate(() => {
                const el = document.getElementById('custom-modal-message');
                return el ? el.innerText : '';
            });
            if (!modalMessageInvalid.includes('inválido')) throw new Error("No correct error message shown for invalid token. " + modalMessageInvalid);

            // Close modal (simulate clicking anywhere or OK if it had a button, but here we can just reload)
            await page.evaluate(() => document.getElementById('custom-modal').style.display = 'none');

            // Test 3: Expired token does not show form
            console.log("Test 3: Navigate to URL with expired token");
            const expiredToken = crypto.randomBytes(32).toString('hex');
            const expiredTokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
            const pastDate = new Date(Date.now() - 30 * 60 * 1000); // 30 mins in past
            await pool.execute(
                'INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (?, ?, ?)',
                [201, expiredTokenHash, pastDate]
            );

            await page.goto(`http://localhost:${TEST_PORT}/?token=${expiredToken}`);
            await page.waitForTimeout(1000);

            const isResetVisibleExpired = await page.evaluate(() => {
                const el = document.getElementById('reset');
                return el && window.getComputedStyle(el).display !== 'none';
            });
            if (isResetVisibleExpired) throw new Error("Reset form is visible for expired token.");

            const modalMessageExpired = await page.evaluate(() => {
                const el = document.getElementById('custom-modal-message');
                return el ? el.innerText : '';
            });
            if (!modalMessageExpired.includes('caducado')) throw new Error("No correct error message shown for expired token. " + modalMessageExpired);

            // Test 4: Verify server rejects expired token on POST /api/reset (simulating condition where it expires while form is open)
            console.log("Test 4: POST /api/reset with expired token");
            const fetchExpiredRes = await page.evaluate(async (token) => {
                const res = await fetch('/api/reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: token, password: 'new', passwordConfirm: 'new' })
                });
                const data = await res.json();
                return { status: res.status, error: data.error };
            }, expiredToken);

            if (fetchExpiredRes.status === 200 || !fetchExpiredRes.error) throw new Error("Server did not reject expired token on POST.");

            // Back to valid token for the final reset test
            console.log("Test 5: Fill form and submit with valid token");
            await page.goto(`http://localhost:${TEST_PORT}/?token=${knownToken}`);
            await page.waitForTimeout(1000);

            // Fill the form
            await page.fill('#reset-password', 'newpasswordui');
            await page.fill('#reset-password-confirm', 'newpasswordui');

            // Handle alert popup
            page.on('dialog', async dialog => {
                if(dialog.message().includes('Contraseña actualizada')) {
                    await dialog.accept();
                } else if (dialog.message().includes('Error')) {
                     throw new Error(`Unexpected error alert: ${dialog.message()}`);
                } else {
                     await dialog.accept();
                }
            });

            await page.click('#btn-reset');
            await page.waitForTimeout(500);

            // Wait for section change (should redirect to login or at least modal shown)

            // Check old password login via API
            const http = require('http');
            const request = (options, postData) => {
                return new Promise((resolve, reject) => {
                    const req = http.request(options, (res) => {
                        resolve({ status: res.statusCode });
                    });
                    req.on('error', reject);
                    if (postData) req.write(postData);
                    req.end();
                });
            };

            let loginOld = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'testui', password: 'oldpassword' }));
            if (loginOld.status === 200) throw new Error("Login with old password should fail.");

            let loginNew = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ usuario: 'testui', password: 'newpasswordui' }));
            if (loginNew.status !== 200) throw new Error("Login with new password failed.");

            console.log("UI Recovery flow tests passed!");
        }
    } catch (e) {
        console.error("Test failed:", e);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        serverProcess.kill();

        // Clean up
        if (dbAvailable) {
            try {
                await pool.execute("DELETE FROM password_resets WHERE usuario_id = 201");
                await pool.execute("DELETE FROM usuarios WHERE id = 201");
            } catch(e) {}
            if (pool) await pool.end();
        }
        process.exit(process.exitCode || 0);
    }
}

runTests();
