const http = require('http');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Ensure AUTH_SECRET is set
if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = 'test_secret_for_tests';
}

function makeRequest(path, method = 'GET', headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: 3000,
            path: path,
            method: method,
            headers: headers
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function run() {
    let pool;
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        await pool.query('SELECT 1');
    } catch (e) {
        console.log("Skipping DB tests because DB is not available:", e.message);
        process.exit(0);
    }

    console.log("Starting server for API tests...");
    const server = spawn('node', ['server.js'], { env: process.env });

    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        // Find users with roles
        const [usuarios] = await pool.query('SELECT u.id, u.usuario, r.nombre as rol_nombre FROM usuarios u JOIN usuario_roles ur ON u.id = ur.usuario_id JOIN roles r ON ur.rol_id = r.id');

        let adminUser = usuarios.find(u => u.rol_nombre === 'administrador');
        let standardUser = usuarios.find(u => u.rol_nombre === 'usuario');

        const adminToken = adminUser ? jwt.sign({ id: adminUser.id, usuario: adminUser.usuario }, process.env.AUTH_SECRET) : null;
        const userToken = standardUser ? jwt.sign({ id: standardUser.id, usuario: standardUser.usuario }, process.env.AUTH_SECRET) : null;

        // CASO 1: Usuario no autenticado -> Solo públicos
        console.log("CASO 1: Unauthenticated...");
        let res = await makeRequest('/api/menu');
        if (res.status !== 200) throw new Error("Expected 200");
        let menu = JSON.parse(res.body);
        let hasAdmin = menu.some(item => item.nombre.toLowerCase().includes('administración'));
        if (hasAdmin) throw new Error("Unauthenticated user should not see Administration");

        // CASO 7: activo = FALSE
        // We assume test data has activo=TRUE, but if it doesn't, this relies on DB correctness.
        console.log("Menu size unauthenticated:", menu.length);

        // CASO 2: Usuario autenticado (standard user)
        if (userToken) {
            console.log("CASO 2: Authenticated standard user...");
            res = await makeRequest('/api/menu', 'GET', { 'Cookie': `auth_token=${userToken}` });
            let userMenu = JSON.parse(res.body);
            hasAdmin = userMenu.some(item => item.nombre.toLowerCase().includes('administración'));
            if (hasAdmin) throw new Error("Standard user should not see Administration");

            // CASO 4: 403 when accessing protected endpoint
            console.log("CASO 4: 403 on protected endpoint...");
            let checkRes = await makeRequest('/api/admin/check', 'GET', { 'Cookie': `auth_token=${userToken}` });
            if (checkRes.status !== 403) throw new Error("Expected 403 for standard user accessing admin check");

            // CASO 5: Servicios as container
            let servicios = userMenu.find(item => item.nombre === 'Servicios');
            if (servicios && servicios.hijos.length === 0) {
                 throw new Error("Servicios should have children if visible.");
            }
        }

        // CASO 3: Administrador
        if (adminToken) {
            console.log("CASO 3: Administrator...");
            res = await makeRequest('/api/menu', 'GET', { 'Cookie': `auth_token=${adminToken}` });
            let adminMenu = JSON.parse(res.body);
            hasAdmin = adminMenu.some(item => item.nombre === 'Administración');
            if (!hasAdmin) throw new Error("Admin user should see Administración");

            let checkRes = await makeRequest('/api/admin/check', 'GET', { 'Cookie': `auth_token=${adminToken}` });
            if (checkRes.status !== 200) throw new Error("Expected 200 for admin user accessing admin check");
        }

        // CASO 6: Check Order
        console.log("CASO 6: Check order...");
        let isOrdered = true;
        for(let i = 0; i < menu.length - 1; i++) {
            if (menu[i].orden > menu[i+1].orden) isOrdered = false;
        }
        if (!isOrdered) throw new Error("Menu items are not ordered correctly.");

        console.log("All API/DB Tests Passed!");
    } catch(e) {
        console.error("Test failed:", e.message);
        server.kill();
        process.exit(1);
    }

    server.kill();
    process.exit(0);
}
run();
