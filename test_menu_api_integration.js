const http = require('http');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

// Original createPool
const originalCreatePool = mysql.createPool;

// Mock database data
const mockMenuItems = [
    { id: 1, nombre: 'Inicio', funcionalidad_id: 1, parent_id: null, publico: 1, orden: 1 },
    { id: 2, nombre: 'Ideas', funcionalidad_id: 2, parent_id: null, publico: 1, orden: 2 },
    { id: 3, nombre: 'Servicios', funcionalidad_id: null, parent_id: null, publico: 1, orden: 3 },
    { id: 16, nombre: 'Asesorías Financieras', funcionalidad_id: 9, parent_id: 3, publico: 1, orden: 1 },
    { id: 17, nombre: 'Asesoría de Pensiones', funcionalidad_id: 10, parent_id: 3, publico: 1, orden: 2 },
    { id: 18, nombre: 'Ideas Innovadoras', funcionalidad_id: 11, parent_id: 3, publico: 1, orden: 3 },
    { id: 19, nombre: 'Emprendimientos', funcionalidad_id: 12, parent_id: 3, publico: 1, orden: 4 },
    { id: 20, nombre: 'Clases de Inglés', funcionalidad_id: 13, parent_id: 3, publico: 1, orden: 5 },
    { id: 21, nombre: 'Perfilamiento', funcionalidad_id: 14, parent_id: 3, publico: 1, orden: 6 },
    { id: 12, nombre: 'Recursos Gratis', funcionalidad_id: 15, parent_id: null, publico: 1, orden: 4 },
    { id: 13, nombre: 'Contáctanos', funcionalidad_id: 16, parent_id: null, publico: 1, orden: 5 },
    { id: 14, nombre: 'Acerca de', funcionalidad_id: null, parent_id: null, publico: 1, orden: 6 },
    { id: 15, nombre: 'Administración', funcionalidad_id: 8, parent_id: null, publico: 0, orden: 7 },
    { id: 99, nombre: 'Contenedor Privado Test', funcionalidad_id: null, parent_id: null, publico: 1, orden: 8 },
    { id: 100, nombre: 'Hijo Privado', funcionalidad_id: 999, parent_id: 99, publico: 0, orden: 1 }
];

let mockAllowedFunctionalities = [];
let mockNextAdminCount = 1; // By default, simulate 1 active admin left

const dbExecuteMock = async (query, params) => {
    if (query.includes('COUNT(DISTINCT ur.usuario_id)')) {
        return [[{ count: mockNextAdminCount }]];
    }
    if (query.includes('GET_LOCK')) {
        return [[{ acquired: 1 }]];
    }
    if (query.includes('RELEASE_LOCK')) {
        return [[{ released: 1 }]];
    }
    if (query.includes('FROM menu_items')) {
        return [mockMenuItems];
    } else if (query.includes('FROM usuario_roles') && !query.includes('DELETE FROM') && !query.includes('INSERT INTO')) {
    // Only check constraints on SELECT statements for usuario_roles, skip INSERT/DELETE
    if (query.includes('f.funcionalidad_id') && (!query.includes('r.activo = TRUE') || !query.includes('p.activo = TRUE') || !query.includes('f.activo = TRUE') || !query.includes('JOIN funcionalidades'))) {
         // For the /api/menu check which requires functionality active checking too
         throw new Error("Security SQL constraint missing: The authorization query must validate that roles, permissions and functionalities are active.");
    } else if (query.includes('SELECT') && (!query.includes('r.activo = TRUE') || !query.includes('p.activo = TRUE'))) {
         throw new Error("Security SQL constraint missing: The authorization query must validate that roles and permissions are active.");
    }

        // return allowed permissions
        return [mockAllowedFunctionalities.map(id => ({ funcionalidad_id: id }))];
    } else if (query.includes('FROM roles') && query.includes('COUNT(*)')) {
        // Simulate that roles 1, 2, 3, 99 exist and are active (if requested).
        // We return 0 for role 9999 so it fails validation
        let count = 0;
        if (params && Array.isArray(params)) {
            for (const roleId of params) {
                if ([1, 2, 3, 99].includes(roleId)) {
                     // wait, role 2 was previously "inactive" in mockRolesState! Let's match it!
                     // In mockRolesState: 1 is active, 2 is inactive, 3 is active, 99 is active
                     if (roleId === 2 && query.includes('activo = TRUE')) {
                         continue;
                     }
                     count++;
                }
            }
        }
        return [[{ count: count }]];
    } else if (query.includes('FROM permisos') && query.includes('COUNT(*)')) {
        // Simulate permission existence check
        let count = 0;
        if (params && Array.isArray(params)) {
            count = params.length; // Just simulate all requested permissions exist for simplicity
        }
        return [[{ count: count }]];
    } else if (query.includes('FROM roles') && query.includes('SELECT id')) {
        return [[{ id: params ? params[0] : 1 }]];
    } else if (query.includes('FROM funcionalidades') && query.includes('SELECT id')) {
        return [[{ id: params ? params[0] : 1 }]];
    } else if (query.includes('FROM usuarios')) {
        return [[{ id: 1, usuario: 'testuser', rol: 'admin' }]];
    } else if (query.includes('FROM rol_permisos') && query.includes('COUNT(*)')) {
        // Explicitly simulate database state for roles and permissions via an object map
        const mockRolesState = {
            1: { rolActivo: true, adminAccessActivo: true, hasAdminAccess: true },
            2: { rolActivo: false, adminAccessActivo: true, hasAdminAccess: true },
            3: { rolActivo: true, adminAccessActivo: false, hasAdminAccess: true },
            99: { rolActivo: true, adminAccessActivo: true, hasAdminAccess: false }
        };

        let count = 0;
        if (params && Array.isArray(params)) {
            for (const roleId of params) {
                const roleState = mockRolesState[roleId];
                if (roleState && roleState.hasAdminAccess) {
                    const rolActivoConditionMet = query.includes('r.activo = TRUE') ? roleState.rolActivo : true;
                    const permActivoConditionMet = query.includes('p.activo = TRUE') ? roleState.adminAccessActivo : true;

                    if (rolActivoConditionMet && permActivoConditionMet) {
                        count++;
                    }
                }
            }
        }
        return [[{ count: count }]];
    }
    return [[]];
};

mysql.createPool = () => ({
    getConnection: async () => ({
        release: () => {},
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        execute: dbExecuteMock // Use the same mock executor for transaction connections
    }),
    execute: dbExecuteMock
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

        const expectedItems = ['Inicio', 'Ideas', 'Servicios', 'Recursos Gratis', 'Contáctanos', 'Acerca de'];
        expectedItems.forEach(item => {
            if (!menu.some(i => i.nombre === item)) throw new Error("Missing expected public item: " + item);
        });

        const servicios = menu.find(i => i.nombre === 'Servicios');
        if (!servicios || servicios.hijos.length !== 6) throw new Error("Servicios should have 6 visible submenus");

        if (menu.some(i => i.nombre === 'Administración')) throw new Error("Should not see Administración");
        if (menu.some(i => i.nombre === 'Contenedor Privado Test')) throw new Error("Should not see empty private container");

        console.log("Unauthenticated check passed: Initial public items, Servicios and submenus present. Restricted items hidden.");


        // Test 1b: Invalid Token
        let invalidTokenRes = await makeRequest('invalid-token.string');
        let invalidMenu = invalidTokenRes.data;
        if (!invalidMenu.some(i => i.nombre === 'Inicio') || invalidMenu.some(i => i.nombre === 'Administración')) {
            throw new Error("Invalid token should be treated as guest");
        }
        console.log("Invalid token check passed.");

        // Test 1c: Expired Token
        const expiredToken = jwt.sign({ id: 1, usuario: 'test' }, process.env.AUTH_SECRET, { expiresIn: '-1s' });
        let expiredTokenRes = await makeRequest(expiredToken);
        let expiredMenu = expiredTokenRes.data;
        if (!expiredMenu.some(i => i.nombre === 'Inicio') || expiredMenu.some(i => i.nombre === 'Administración')) {
            throw new Error("Expired token should be treated as guest");
        }
        console.log("Expired token check passed.");

        // Test 1d: Unauthenticated doesn't get inactive permissions
        mockAllowedFunctionalities = [8]; // Simulating DB returned a permission, but no token provided
        let unauthTokenRes = await makeRequest(null);
        let unauthMenu = unauthTokenRes.data;
        if (unauthMenu.some(i => i.nombre === 'Administración')) {
            throw new Error("Guest with empty token should not use DB permissions");
        }
        console.log("Unauthenticated permission isolation check passed.");


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

        // Test 4: Inactive Roles/Permissions/Functionalities
        // This is tested by the mock verifying the SQL query string for 'activo = TRUE' clauses.
        // If the query has them, the DB naturally filters them out.
        // We simulate the DB returning nothing because the item was inactive.
        mockAllowedFunctionalities = [];
        res = await makeRequest(token);
        menu = res.data;
        if (menu.some(i => i.nombre === 'Administración')) throw new Error("Inactive functionality should not be visible.");
        console.log("Inactive permissions SQL and visibility check passed.");

        // Test 5: Check that usuarios.rol doesn't grant admin access
        // We will make a direct request to /api/admin/check with a user that has NO effective permissions in DB.
        mockAllowedFunctionalities = []; // No permissions effectively
        const adminCheckRolFailRes = await fetch(`http://localhost:3001/api/admin/check`, {
            headers: {
                'Cookie': `auth_token=${token}`
            }
        });

        if (adminCheckRolFailRes.status !== 403) {
            console.error(`Integration test failed: usuarios.rol check bypasses real authorization. Expected 403, got ${adminCheckRolFailRes.status}`);
            process.exit(1);
        }
        console.log("Obsolete usuarios.rol fallback check passed (unauthorized when missing effective permissions).");

        // Test 6: Prevent administrative lockout
        mockAllowedFunctionalities = ['admin.access']; // Allow requireAdmin middleware to pass

        // Test global admin count dropping to 0
        mockNextAdminCount = 0;

        // Attempt 1: Empty array (drops admin count to 0)
        const lockoutFailRes1 = await fetch(`http://localhost:3001/api/admin/usuario_roles/1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${token}` },
            body: JSON.stringify({ roles: [] })
        });
        if (lockoutFailRes1.status !== 400) {
            console.error(`Integration test failed: Global lockout prevention failed for empty array. Expected 400, got ${lockoutFailRes1.status}`);
            process.exit(1);
        }

        // Attempt 2: Assigning a role that leaves global admins at 0 (e.g., removing admin role from last admin)
        const lockoutFailRes2 = await fetch(`http://localhost:3001/api/admin/usuario_roles/1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${token}` },
            body: JSON.stringify({ roles: [99] }) // Valid role, but leaves admin count at 0
        });
        if (lockoutFailRes2.status !== 400) {
            console.error(`Integration test failed: Global lockout prevention failed when assigning non-admin roles. Expected 400, got ${lockoutFailRes2.status}`);
            process.exit(1);
        }

        // Attempt 3: Valid active assignment where global count remains >= 1
        mockNextAdminCount = 1;
        const lockoutSuccessRes = await fetch(`http://localhost:3001/api/admin/usuario_roles/1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${token}` },
            body: JSON.stringify({ roles: [1] }) // Simulating assigning an active admin role
        });
        if (lockoutSuccessRes.status !== 200) {
            console.error(`Integration test failed: Valid role assignment should pass lockout check. Expected 200, got ${lockoutSuccessRes.status}`);
            process.exit(1);
        }

        // Attempt 4: Non-existent roles trigger 400
        const nonExistentRolesRes = await fetch(`http://localhost:3001/api/admin/usuario_roles/1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cookie': `auth_token=${token}` },
            body: JSON.stringify({ roles: [9999] }) // 9999 is not in the mock list
        });
        if (nonExistentRolesRes.status !== 400) {
            console.error(`Integration test failed: Non-existent role assignment should return 400. Expected 400, got ${nonExistentRolesRes.status}`);
            process.exit(1);
        }

        console.log("Administrative lockout prevention check passed.");

        console.log("All integration tests passed successfully.");
        // Terminate the process to close the server
        process.exit(0);

    } catch (e) {
        console.error("Integration Test failed: ", e.message);
        process.exit(1);
    }
}

testMenuAPI();
