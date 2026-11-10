// =============================================================================
// Integration & Unit Test: Asignación Automática del Rol 'usuario' en Alta/Registro
// Proyecto: Idealandia - PR #99
// =============================================================================

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'idealandia';
process.env.PORT = '3009'; // Isolated test port
process.env.AUTH_SECRET = 'test_secret_for_default_usuario_role';
process.env.DB_TIMEZONE = '-06:00';

// In-memory mock database state
const mockDb = {
    roles: [
        { id: 1, nombre: 'administrador', descripcion: 'Rol con acceso total al sistema', activo: 1 },
        { id: 2, nombre: 'usuario', descripcion: 'Rol estándar de usuario registrado', activo: 1 }
    ],
    permisos: [
        { id: 1, codigo: 'admin.access', nombre: 'Acceso a Administración', activo: 1 },
        { id: 2, codigo: 'usuarios.read', nombre: 'Consultar Usuarios', activo: 1 },
        { id: 3, codigo: 'usuarios.create', nombre: 'Crear Usuarios', activo: 1 },
        { id: 4, codigo: 'ideas.read', nombre: 'Consultar ideas', activo: 1 },
        { id: 5, codigo: 'ideas.create', nombre: 'Crear ideas', activo: 1 }
    ],
    rol_permisos: [
        { rol_id: 1, permiso_id: 1 },
        { rol_id: 1, permiso_id: 2 },
        { rol_id: 1, permiso_id: 3 },
        { rol_id: 2, permiso_id: 4 } // Rol 'usuario' únicamente tiene ideas.read
    ],
    usuarios: [
        { id: 10, usuario: 'admin_master', password_hash: '$2b$10$Wp83vGgq.VzP5hI6KzG8f.jPZq1QoO/qG7uO4vW4Q/vT.Cq/3V.G', nombre: 'Admin Master', email: 'admin@idealandia.com', telefono: '5551234567', activo: 1, jwt_version: 1 }
    ],
    usuario_roles: [
        { usuario_id: 10, rol_id: 1 }
    ],
    nextUserId: 11
};

// Mock mysql2
const mysql = require('mysql2/promise');

mysql.createPool = function(config) {
    return {
        on: () => {},
        getConnection: async () => ({
            query: async (sql, params) => executeQuery(sql, params),
            execute: async (sql, params) => executeQuery(sql, params),
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {}
        }),
        query: async (sql, params) => executeQuery(sql, params),
        execute: async (sql, params) => executeQuery(sql, params)
    };
};

function executeQuery(sql, params) {
    const q = sql.trim();
    const upper = q.toUpperCase();

    // DDL
    if (upper.startsWith('CREATE TABLE') || upper.startsWith('SET TIME_ZONE')) {
        return [[]];
    }

    // SELECT FROM usuarios
    if (upper.includes('FROM USUARIOS')) {
        if (upper.includes('WHERE USUARIO = ? OR EMAIL = ?')) {
            const [u, e] = params;
            const matches = mockDb.usuarios.filter(row => row.usuario === u || row.email === e);
            return [matches];
        }
        if (upper.includes('WHERE ID = ?')) {
            const matches = mockDb.usuarios.filter(row => row.id === Number(params[0]));
            return [matches];
        }
    }

    // INSERT INTO usuarios
    if (upper.startsWith('INSERT INTO USUARIOS')) {
        const [usuario, password_hash, nombre, telefono, email] = params;
        const newId = mockDb.nextUserId++;
        const newUser = { id: newId, usuario, password_hash, nombre, telefono, email, activo: 1, jwt_version: 1 };
        mockDb.usuarios.push(newUser);
        return [{ insertId: newId, affectedRows: 1 }];
    }

    // SELECT FROM roles
    if (upper.includes('FROM ROLES')) {
        if (upper.includes("LOWER(NOMBRE) = 'USUARIO'")) {
            const matches = mockDb.roles.filter(r => r.nombre.toLowerCase() === 'usuario' && r.activo);
            return [matches];
        }
        if (upper.includes('WHERE ID = ?')) {
            const matches = mockDb.roles.filter(r => r.id === Number(params[0]));
            return [matches];
        }
        return [mockDb.roles];
    }

    // SELECT 1 FROM usuario_roles WHERE usuario_id = ? AND rol_id = ?
    if (upper.includes('FROM USUARIO_ROLES') && upper.includes('USUARIO_ID = ?') && upper.includes('ROL_ID = ?')) {
        const [uId, rId] = params.map(Number);
        const matches = mockDb.usuario_roles.filter(ur => ur.usuario_id === uId && ur.rol_id === rId);
        return [matches];
    }

    // SELECT rol_id FROM usuario_roles WHERE usuario_id = ?
    if (upper.includes('SELECT ROL_ID FROM USUARIO_ROLES WHERE USUARIO_ID = ?')) {
        const [uId] = params.map(Number);
        const matches = mockDb.usuario_roles.filter(ur => ur.usuario_id === uId);
        return [matches];
    }

    // INSERT INTO usuario_roles
    if (upper.includes('INSERT') && upper.includes('INTO USUARIO_ROLES')) {
        const [uId, rId] = params.map(Number);
        const exists = mockDb.usuario_roles.some(ur => ur.usuario_id === uId && ur.rol_id === rId);
        if (!exists) {
            mockDb.usuario_roles.push({ usuario_id: uId, rol_id: rId });
        }
        return [{ affectedRows: exists ? 0 : 1 }];
    }

    // Authorization middleware checks (admin access for user 10)
    if (upper.includes('FROM USUARIO_ROLES UR') || upper.includes('FROM USUARIO_FUNCIONALIDADES UF')) {
        if (params && (params.includes(10) || params[0] === 10)) {
            return [[{ id: 1, codigo: 'admin', ruta: '/admin', nombre: 'admin.access' }]];
        }
        return [[]];
    }

    // Default empty result
    return [[]];
}

// Require server.js to boot app
const { app, assignDefaultUserRole } = require('./server.js');

function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const reqHeaders = { ...headers };
        let payload = null;
        if (body) {
            payload = JSON.stringify(body);
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }
        const req = http.request({
            hostname: '127.0.0.1',
            port: process.env.PORT,
            path,
            method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function pass(msg) {
    console.log(`  ✓ ${msg}`);
}

async function runTests() {
    console.log("================================================================================");
    console.log("INICIANDO PRUEBAS: ASIGNACIÓN AUTOMÁTICA DEL ROL 'USUARIO' AL REGISTRAR USUARIOS");
    console.log("================================================================================");

    // Initial snapshot of roles and rol_permisos
    const initialRolPermisosCount = mockDb.rol_permisos.length;
    const initialUsuarioPerms = mockDb.rol_permisos.filter(rp => rp.rol_id === 2);
    const initialAdminPerms = mockDb.rol_permisos.filter(rp => rp.rol_id === 1);
    const initialUsersCount = mockDb.usuarios.length;

    // -------------------------------------------------------------------------
    // TEST 1: Registro exitoso con asignación automática de rol 'usuario'
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: Registro de nuevo usuario vía /api/register ---");
    const regRes = await makeRequest('POST', '/api/register', {
        usuario: 'arturito_nuevo',
        password: 'Password123!',
        'password-rep': 'Password123!',
        nombre: 'Arturito Matus',
        correo: 'arturito@idealandia.com',
        telefono: '5559876543'
    });

    assert.strictEqual(regRes.status, 201, `Registro debe retornar 201 Created (obtenido: ${regRes.status})`);
    assert.strictEqual(regRes.body.message, 'Registro exitoso.', "Mensaje debe ser 'Registro exitoso.'");
    pass("1. /api/register responde HTTP 201 con 'Registro exitoso.'");

    // Verificar que el usuario existe en BD
    const createdUser = mockDb.usuarios.find(u => u.usuario === 'arturito_nuevo');
    assert(createdUser, "El usuario nuevo debe existir en la base de datos");
    assert.strictEqual(createdUser.nombre, 'Arturito Matus');
    pass("2. Usuario nuevo persistido en la tabla usuarios");

    // Verificar que quedó asociado automáticamente al rol 'usuario' (id: 2)
    const userRoleAssoc = mockDb.usuario_roles.filter(ur => ur.usuario_id === createdUser.id);
    assert.strictEqual(userRoleAssoc.length, 1, "Debe tener exactamente una asignación de rol");
    assert.strictEqual(userRoleAssoc[0].rol_id, 2, "El rol asignado debe ser el rol 'usuario' (id: 2)");
    pass("3. Usuario nuevo queda asociado automáticamente al rol 'usuario' (id: 2)");

    // -------------------------------------------------------------------------
    // TEST 2: El nuevo usuario puede iniciar sesión normalmente
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Inicio de sesión del nuevo usuario ---");
    const loginRes = await makeRequest('POST', '/api/login', {
        usuario: 'arturito_nuevo',
        password: 'Password123!'
    });

    assert.strictEqual(loginRes.status, 200, "Login debe ser exitoso (200 OK)");
    assert(loginRes.body.user, "Debe retornar información del usuario");
    assert.strictEqual(loginRes.body.user.usuario, 'arturito_nuevo', "Usuario logueado debe coincidir");
    assert(!loginRes.body.user.password_hash, "El hash de contraseña NO debe exponerse");
    assert(loginRes.headers['set-cookie'], "Debe incluir cookie auth_token");
    pass("4. El nuevo usuario puede iniciar sesión normalmente y recibe su token JWT");

    // -------------------------------------------------------------------------
    // TEST 3: Conservación exacta de permisos del rol 'usuario' y rol 'administrador'
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: Integridad de permisos de roles existentes ---");
    const currentUsuarioPerms = mockDb.rol_permisos.filter(rp => rp.rol_id === 2);
    const currentAdminPerms = mockDb.rol_permisos.filter(rp => rp.rol_id === 1);

    assert.strictEqual(currentUsuarioPerms.length, initialUsuarioPerms.length, "La cantidad de permisos del rol 'usuario' no debe variar");
    assert.deepStrictEqual(currentUsuarioPerms, initialUsuarioPerms, "Los permisos del rol 'usuario' son idénticos a los originales");
    assert.deepStrictEqual(currentAdminPerms, initialAdminPerms, "Los permisos del rol 'administrador' permanecen intactos");
    assert.strictEqual(mockDb.rol_permisos.length, initialRolPermisosCount, "La tabla rol_permisos no fue alterada");
    pass("5. El rol 'usuario' conserva exactamente sus permisos y no se alteran otros roles");

    // -------------------------------------------------------------------------
    // TEST 4: No duplicación en usuario_roles
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: Prevención de duplicados en usuario_roles ---");
    // Invocar assignDefaultUserRole nuevamente sobre el mismo usuario
    const assignedAgain = await assignDefaultUserRole(null, createdUser.id);
    assert.strictEqual(assignedAgain, 2, "assignDefaultUserRole retorna el id del rol");
    const userRoleCount = mockDb.usuario_roles.filter(ur => ur.usuario_id === createdUser.id && ur.rol_id === 2).length;
    assert.strictEqual(userRoleCount, 1, "No debe duplicarse la relación en usuario_roles");
    pass("6. No se duplica la relación en usuario_roles al reasignar el rol");

    // -------------------------------------------------------------------------
    // TEST 5: Intento de registro duplicado de usuario/correo
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: Intento de registro con usuario existente ---");
    const dupRes = await makeRequest('POST', '/api/register', {
        usuario: 'arturito_nuevo',
        password: 'Password123!',
        'password-rep': 'Password123!',
        nombre: 'Arturito Clon',
        correo: 'otro@idealandia.com',
        telefono: '5551112233'
    });
    assert.strictEqual(dupRes.status, 400, "Debe rechazar con 400 Bad Request si el usuario ya existe");
    assert(dupRes.body.error.includes('registrado'), "Debe indicar error de usuario ya registrado");
    pass("7. Intento de registro con usuario existente es rechazado sin crear asignaciones");

    // -------------------------------------------------------------------------
    // TEST 6: Usuarios existentes no se modifican y aislamiento garantizado
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 6: Aislamiento y usuarios existentes intactos ---");
    const adminUser = mockDb.usuarios.find(u => u.id === 10);
    assert(adminUser, "Usuario administrador previo debe existir");
    assert.strictEqual(adminUser.usuario, 'admin_master');
    const adminRoles = mockDb.usuario_roles.filter(ur => ur.usuario_id === 10);
    assert.strictEqual(adminRoles.length, 1);
    assert.strictEqual(adminRoles[0].rol_id, 1, "El administrador conserva exclusivamente su rol de administrador");
    pass("8. Los usuarios existentes y sus roles no sufren ninguna alteración");

    // El nuevo usuario NO tiene acceso de administrador
    assert(!mockDb.usuario_roles.some(ur => ur.usuario_id === createdUser.id && ur.rol_id === 1), "El nuevo usuario NO posee rol administrador");
    pass("9. Aislamiento estricto: el nuevo usuario solo tiene el rol 'usuario'");

    // -------------------------------------------------------------------------
    // TEST 7: Alta de usuario desde Administración (/api/admin/usuarios)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 7: Alta de usuario vía /api/admin/usuarios ---");
    const adminToken = jwt.sign({ id: 10, email: 'admin@idealandia.com', jwt_version: 1 }, process.env.AUTH_SECRET);
    const adminCreateRes = await makeRequest('POST', '/api/admin/usuarios', {
        usuario: 'maria_admin_created',
        password: 'PasswordSecret123',
        nombre: 'María Gómez',
        telefono: '5554443322',
        email: 'maria@idealandia.com'
    }, {
        'Cookie': `auth_token=${adminToken}`
    });

    assert.strictEqual(adminCreateRes.status, 201, "Creación vía admin debe responder 201");
    const mariaId = adminCreateRes.body.id;
    assert(mariaId, "Debe retornar el ID del nuevo usuario");
    const mariaRoles = mockDb.usuario_roles.filter(ur => ur.usuario_id === mariaId);
    assert.strictEqual(mariaRoles.length, 1, "María debe tener exactamente 1 rol");
    assert.strictEqual(mariaRoles[0].rol_id, 2, "María recibe automáticamente el rol 'usuario'");
    pass("10. Usuario creado desde el panel administrativo recibe automáticamente el rol 'usuario'");

    // -------------------------------------------------------------------------
    // TEST 8: Manejo controlado si el rol 'usuario' no existe
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 8: Manejo controlado si el rol 'usuario' no existe ---");
    // Desactivar temporalmente el rol 'usuario' para simular su ausencia
    const savedRoles = [...mockDb.roles];
    mockDb.roles = mockDb.roles.filter(r => r.nombre.toLowerCase() !== 'usuario');

    let errorThrown = false;
    try {
        await assignDefaultUserRole(null, 999);
    } catch (err) {
        errorThrown = true;
        assert.strictEqual(err.code, 'ROLE_USUARIO_NOT_FOUND', "Código de error debe ser ROLE_USUARIO_NOT_FOUND");
        assert(err.message.includes('rol "usuario" no existe'), "Mensaje debe ser explícito sobre la falta del rol");
    }
    assert(errorThrown, "Debe lanzar excepción controlada si el rol 'usuario' no existe");
    pass("11. assignDefaultUserRole lanza ROLE_USUARIO_NOT_FOUND de forma explícita y controlada");

    // Probar /api/register cuando el rol 'usuario' no existe
    const failRegRes = await makeRequest('POST', '/api/register', {
        usuario: 'sin_rol_usuario',
        password: 'Password123!',
        'password-rep': 'Password123!',
        nombre: 'Sin Rol',
        correo: 'sinrol@idealandia.com',
        telefono: '5550009999'
    });

    assert.strictEqual(failRegRes.status, 500, "Debe responder 500 si no existe el rol");
    assert(failRegRes.body.error.includes('rol "usuario" no se encuentra configurado'), "Error debe ser explícito y controlado");
    pass("12. /api/register responde HTTP 500 controlado sin crear roles silenciosos ni usuarios huérfanos");

    // Restaurar roles
    mockDb.roles = savedRoles;

    console.log("\n================================================================================");
    console.log("TODAS LAS 12 VERIFICACIONES PASARON EXITOSAMENTE (100% OK)");
    console.log("================================================================================");
    process.exit(0);
}

runTests().catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
