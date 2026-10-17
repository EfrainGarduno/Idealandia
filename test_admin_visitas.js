const http = require('http');
const fs = require('fs');
const mysql = require('mysql2/promise');
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

async function createTestAdminToken(pool) {
    try {
        await pool.execute("INSERT IGNORE INTO usuarios (id, usuario, password_hash, email, activo, jwt_version) VALUES (998, 'testadmin998', 'mock', 'testadmin998@test.com', 1, 1)");
        await pool.execute("INSERT IGNORE INTO roles (id, nombre, descripcion, activo) VALUES (999, 'TestAdminRole', 'Mock', 1)");
        await pool.execute("INSERT IGNORE INTO permisos (id, nombre, codigo, descripcion, activo) VALUES (999, 'Admin Access', 'admin.access', 'Mock', 1)");
        await pool.execute("INSERT IGNORE INTO usuario_roles (usuario_id, rol_id) VALUES (998, 999)");
        await pool.execute("INSERT IGNORE INTO rol_permisos (rol_id, permiso_id) VALUES (999, 999)");
    } catch(e) {}

    let jwt_version = 1;
    try {
        const [rows] = await pool.execute("SELECT jwt_version FROM usuarios WHERE id = 998");
        if (rows.length > 0 && rows[0].jwt_version) jwt_version = rows[0].jwt_version;
    } catch(e) {}

    const payload = { id: 998, email: "testadmin998@test.com", dbtest: true, jwt_version };
    const token = jwt.sign(payload, 'testnode');
    return `auth_token=${token}`;
}

async function createTestUserToken(pool, userId) {
    try {
        await pool.execute("INSERT IGNORE INTO usuarios (id, usuario, password_hash, email, activo, jwt_version) VALUES (?, ?, 'mock', ?, 1, 1)", [userId, `testuser${userId}`, `testuser${userId}@test.com`]);
    } catch(e) {}

    let jwt_version = 1;
    try {
        const [rows] = await pool.execute("SELECT jwt_version FROM usuarios WHERE id = ?", [userId]);
        if (rows.length > 0 && rows[0].jwt_version) jwt_version = rows[0].jwt_version;
    } catch(e) {}

    const payload = { id: userId, email: `testuser${userId}@test.com`, dbtest: true, jwt_version };
    const token = jwt.sign(payload, 'testnode');
    return `auth_token=${token}`;
}

async function runTests() {
    console.log("Starting visits counter and user deletion tests...");

    let backup = null;
    if (fs.existsSync('visitas.json')) {
        backup = fs.readFileSync('visitas.json', 'utf8');
    }

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

    // START SERVER ON CUSTOM PORT
    const TEST_PORT = 3005;
    const { spawn } = require('child_process');
    const serverProcess = spawn('node', ['server.js'], { env: { ...process.env, AUTH_SECRET: 'testnode', PORT: TEST_PORT } });
    serverProcess.stdout.on('data', (data) => console.log(`SERVER STDOUT: ${data}`));
    serverProcess.stderr.on('data', (data) => console.error(`SERVER STDERR: ${data}`));
    await new Promise(r => setTimeout(r, 2000));

    try {
        // --- VISITS TESTS ---
        let res1 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/visitas', method: 'GET' });
        let initialCounter = res1.data.visitas;

        let cookies = res1.headers['set-cookie'];
        if (!cookies || !cookies.some(c => c.includes('visited=true'))) throw new Error("Cookie visited=true not set");
        const cookieHeader = cookies[0].split(';')[0];

        let res2 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/visitas', method: 'GET', headers: { 'Cookie': cookieHeader } });
        if (res2.data.visitas !== initialCounter) throw new Error("Visit counter should not increment with cookie.");

        let res3 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/visitas', method: 'GET' });
        if (res3.data.visitas !== initialCounter + 1) throw new Error("Visit counter should increment without cookie.");

        // Concurrent requests to test the queue
        let concurrentRequests = [];
        for (let i = 0; i < 50; i++) {
            concurrentRequests.push(request({ hostname: 'localhost', port: TEST_PORT, path: '/api/visitas', method: 'GET' }));
        }
        await Promise.all(concurrentRequests);

        let res4 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/visitas', method: 'GET', headers: { 'Cookie': cookieHeader } });
        if (res4.data.visitas !== initialCounter + 51) throw new Error(`Concurrent visit counter failed. Expected ${initialCounter + 51}, got ${res4.data.visitas}`);

        console.log("Visit counter tests passed!");

        // --- DELETE USER TESTS ---
        if (dbAvailable) {
            const adminCookie = await createTestAdminToken(pool);
            const nonAdminCookie = await createTestUserToken(pool, 100);

            await createTestUserToken(pool, 101);
            await pool.execute("INSERT IGNORE INTO ideas (id, usuario_id, titulo, descripcion, estado) VALUES (999, 101, 'Test Idea', 'Desc', 'pendiente')");

            // Test Delete self
            let delRes1 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/admin/usuarios/998', method: 'DELETE', headers: { 'Cookie': adminCookie }});
            if (delRes1.status !== 400 || !delRes1.data.error.includes("propio usuario")) throw new Error("Self-delete should fail.");

            // Test Delete user with ideas
            let delRes2 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/admin/usuarios/101', method: 'DELETE', headers: { 'Cookie': adminCookie }});
            if (delRes2.status !== 400 || !delRes2.data.error.includes("ideas asociadas")) throw new Error("Delete with ideas should fail.");

            // Test Delete unauthorized (No cookie)
            let delRes3 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/admin/usuarios/100', method: 'DELETE' });
            if (delRes3.status !== 401) throw new Error("Unauthorized delete (no token) should fail.");

            // Test Delete unauthorized (Non-admin token)
            let delRes3b = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/admin/usuarios/100', method: 'DELETE', headers: { 'Cookie': nonAdminCookie } });
            if (delRes3b.status !== 403) throw new Error("Unauthorized delete (non-admin) should fail with 403.");

            // Test Delete success
            let delRes4 = await request({ hostname: 'localhost', port: TEST_PORT, path: '/api/admin/usuarios/100', method: 'DELETE', headers: { 'Cookie': adminCookie }});
            if (delRes4.status !== 200) throw new Error(`Valid delete failed. Status: ${delRes4.status}`);

            console.log("Delete user tests passed!");
        }
    } catch (e) {
        console.error("Test failed:", e);
        process.exitCode = 1;
    } finally {
        serverProcess.kill();
        if (backup) {
             fs.writeFileSync('visitas.json', backup);
        } else {
             if (fs.existsSync('visitas.json')) fs.unlinkSync('visitas.json');
        }

        // Clean up
        if (dbAvailable) {
            try {
                await pool.execute("DELETE FROM rol_permisos WHERE rol_id = 999");
                await pool.execute("DELETE FROM usuario_roles WHERE rol_id = 999");
                await pool.execute("DELETE FROM roles WHERE id = 999");
                await pool.execute("DELETE FROM permisos WHERE id = 999");
                await pool.execute("DELETE FROM ideas WHERE id = 999");
                await pool.execute("DELETE FROM usuarios WHERE id IN (998, 100, 101)");
            } catch(e) {}
            if (pool) await pool.end();
        }
    }

    console.log("Integration tests completed.");
    process.exit();
}

runTests();
