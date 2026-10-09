const http = require('http');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// Original createPool
const originalCreatePool = mysql.createPool;

// Mock database data
const mockMenuItems = [
    { id: 1, nombre: 'Inicio', funcionalidad_id: 1, parent_id: null, publico: 1, orden: 1 },
    { id: 3, nombre: 'Servicios', funcionalidad_id: null, parent_id: null, publico: 1, orden: 3 },
    { id: 16, nombre: 'Asesorías Financieras', funcionalidad_id: 9, parent_id: 3, publico: 1, orden: 1 },
    { id: 14, nombre: 'Acerca de', funcionalidad_id: null, parent_id: null, publico: 1, orden: 6 },
    { id: 15, nombre: 'Administración', funcionalidad_id: 8, parent_id: null, publico: 0, orden: 7 },
    { id: 99, nombre: 'Contenedor Privado Test', funcionalidad_id: null, parent_id: null, publico: 1, orden: 8 },
    { id: 100, nombre: 'Hijo Privado', funcionalidad_id: 999, parent_id: 99, publico: 0, orden: 1 }
];

let mockAllowedFunctionalities = [];

mysql.createPool = () => ({
    getConnection: async () => ({ release: () => {} }),
    execute: async (query, params) => {
        if (query.includes('FROM menu_items')) {
            return [mockMenuItems];
        } else if (query.includes('FROM usuario_roles')) {
            // return allowed permissions
            return [mockAllowedFunctionalities.map(id => ({ funcionalidad_id: id }))];
        } else if (query.includes('FROM usuarios')) {
            return [[{ id: 1, usuario: 'testuser' }]];
        }
        return [[]];
    }
});

process.env.AUTH_SECRET = 'test_secret_integration';
process.env.PORT = 3001;

// Start server
const serverInstance = require('./server.js'); // Assuming server.js exports server or we just let it run in background

async function testMenuAPI() {
    console.log("Testing real /api/menu endpoint...");

    const makeRequest = (token) => {
        return new Promise((resolve) => {
            const options = {
                hostname: '127.0.0.1',
                port: 3001,
                path: '/api/menu',
                method: 'GET',
                headers: token ? { 'Cookie': `auth_token=${token}` } : {}
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
            });
            req.end();
        });
    };

    // Wait for server to boot up
    await new Promise(r => setTimeout(r, 1000));

    try {
        // Test 1: Unauthenticated
        mockAllowedFunctionalities = [];
        let res = await makeRequest(null);
        let menu = res.data;

        if (!menu.some(i => i.nombre === 'Inicio')) throw new Error("Missing Inicio");
        if (!menu.some(i => i.nombre === 'Acerca de')) throw new Error("Missing Acerca de");
        if (menu.some(i => i.nombre === 'Administración')) throw new Error("Should not see Administración");
        if (menu.some(i => i.nombre === 'Contenedor Privado Test')) throw new Error("Should not see empty private container");

        console.log("Unauthenticated check passed.");

        // Test 2: Authenticated with specific permission
        const token = jwt.sign({ id: 1, usuario: 'test' }, process.env.AUTH_SECRET);
        mockAllowedFunctionalities = [999]; // Give access to Hijo Privado

        res = await makeRequest(token);
        menu = res.data;

        if (menu.some(i => i.nombre === 'Administración')) throw new Error("Should not see Administración without permission");

        const container = menu.find(i => i.nombre === 'Contenedor Privado Test');
        if (!container || !container.hijos.some(h => h.nombre === 'Hijo Privado')) {
             throw new Error("Should see container and its private child when authorized");
        }

        console.log("Authorized check passed.");

        // Test 3: Admin
        mockAllowedFunctionalities = [8]; // Give access to Administración
        res = await makeRequest(token);
        menu = res.data;

        if (!menu.some(i => i.nombre === 'Administración')) throw new Error("Should see Administración with permission");

        console.log("Admin check passed.");
        console.log("All integration tests passed successfully.");
        // Terminate the process to close the server
        process.exit(0);

    } catch (e) {
        console.error("Integration Test failed: ", e.message);
        process.exit(1);
    }
}

testMenuAPI();
