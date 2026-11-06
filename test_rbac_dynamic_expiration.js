const http = require('http');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

// Environment setup for isolated integration test
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'idealandia';
process.env.PORT = '3008';
process.env.AUTH_SECRET = 'test_secret_for_rbac_dynamic_expiration';
process.env.DB_TIMEZONE = '-06:00';

// In-memory simulation state for the 8 test scenarios
let simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

// Define user states
// user 10: Temp access to ideas (expires at 12:30:00), NO role with ideas.read
// user 11: Temp access to ideas (expires at 12:30:00), HAS role with ideas.read
// user 12: Permanent access to ideas, HAS role with ideas.read
// user 13: Temp access to ideas, HAS role with ideas.read, NO ideas.delete
// user 14: Auditor (temp access to admin, HAS usuarios.read, NO admin.access, NO roles.delete)
// user 15: Revoked access scenario (initially active, then set to revocado)
// user 16: Future scheduled access (starts at 14:00:00)

const mockUsers = {
    10: { id: 10, usuario: 'temp_no_crud', jwt_version: 1 },
    11: { id: 11, usuario: 'role_and_temp', jwt_version: 1 },
    12: { id: 12, usuario: 'permanent_user', jwt_version: 1 },
    13: { id: 13, usuario: 'read_only_user', jwt_version: 1 },
    14: { id: 14, usuario: 'auditor_user', jwt_version: 1 },
    15: { id: 15, usuario: 'revoked_user', jwt_version: 1 },
    16: { id: 16, usuario: 'future_user', jwt_version: 1 },
};

let user15State = 'activo';

function getUserAccessRecords(userId) {
    const records = [];
    if (userId === 10) {
        records.push({
            id: 101,
            funcionalidad_id: 2,
            codigo: 'ideas',
            ruta: '/ideas',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T11:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T12:30:00-06:00').getTime(),
            estado: 'activo'
        });
    } else if (userId === 11) {
        records.push({
            id: 102,
            funcionalidad_id: 2,
            codigo: 'ideas',
            ruta: '/ideas',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T11:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T12:30:00-06:00').getTime(),
            estado: 'activo'
        });
    } else if (userId === 12) {
        records.push({
            id: 103,
            funcionalidad_id: 2,
            codigo: 'ideas',
            ruta: '/ideas',
            tipo_acceso: 'permanente',
            fecha_inicio: null,
            fecha_fin: null,
            estado: 'activo'
        });
    } else if (userId === 13) {
        records.push({
            id: 104,
            funcionalidad_id: 2,
            codigo: 'ideas',
            ruta: '/ideas',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T11:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T13:00:00-06:00').getTime(),
            estado: 'activo'
        });
    } else if (userId === 14) {
        records.push({
            id: 105,
            funcionalidad_id: 8,
            codigo: 'admin',
            ruta: '/admin',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T11:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T13:00:00-06:00').getTime(),
            estado: 'activo'
        });
    } else if (userId === 15) {
        records.push({
            id: 106,
            funcionalidad_id: 2,
            codigo: 'ideas',
            ruta: '/ideas',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T11:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T13:00:00-06:00').getTime(),
            estado: user15State
        });
    } else if (userId === 16) {
        records.push({
            id: 107,
            funcionalidad_id: 2,
            codigo: 'ideas',
            ruta: '/ideas',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T14:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T16:00:00-06:00').getTime(),
            estado: 'activo'
        });
    }
    return records;
}

function getUserRolePermissions(userId) {
    // Map permissions by user
    if (userId === 11 || userId === 12 || userId === 13) {
        return ['ideas.read'];
    }
    if (userId === 14) {
        return ['usuarios.read']; // Auditor has usuarios.read, NOT admin.access or roles.delete
    }
    return [];
}

// Mock database pool
mysql.createPool = function(config) {
    return {
        on: (event, handler) => {},
        getConnection: async () => ({
            query: async () => {},
            execute: async () => [[]],
            release: () => {}
        }),
        execute: async (query, params) => {
            const q = query.trim().toUpperCase();

            // verifyToken
            if (q.startsWith("SELECT JWT_VERSION FROM USUARIOS WHERE ID = ?")) {
                const uid = parseInt(params[0]);
                if (mockUsers[uid]) return [[{ jwt_version: mockUsers[uid].jwt_version }]];
                return [[]];
            }

            // GET /api/me
            if (q.startsWith("SELECT ID, USUARIO, NOMBRE, TELEFONO, EMAIL FROM USUARIOS WHERE ID = ?")) {
                const uid = parseInt(params[0]);
                if (mockUsers[uid]) {
                    return [[{ id: uid, usuario: mockUsers[uid].usuario, nombre: mockUsers[uid].usuario, telefono: '555', email: 'test@example.com' }]];
                }
                return [[]];
            }

            // Menu Items
            if (q.includes("FROM MENU_ITEMS WHERE ACTIVO = TRUE")) {
                return [[
                    { id: 1, nombre: 'Inicio', funcionalidad_id: 1, parent_id: null, publico: 1, orden: 1 },
                    { id: 2, nombre: 'Ideas', funcionalidad_id: 2, parent_id: null, publico: 0, orden: 2 },
                    { id: 15, nombre: 'Administración', funcionalidad_id: 8, parent_id: null, publico: 0, orden: 7 }
                ]];
            }

            // Menu Timing Calculation
            if (q.includes("MIN(CASE WHEN TIPO_ACCESO = 'TEMPORAL'")) {
                const uid = parseInt(params[0]);
                const records = getUserAccessRecords(uid).filter(r => r.estado === 'activo');
                let minFin = null;
                let minIni = null;

                records.forEach(r => {
                    if (r.tipo_acceso === 'temporal') {
                        if (r.fecha_inicio <= simulatedCurrentTime && r.fecha_fin > simulatedCurrentTime) {
                            if (!minFin || r.fecha_fin < minFin) minFin = r.fecha_fin;
                        } else if (r.fecha_inicio > simulatedCurrentTime) {
                            if (!minIni || r.fecha_inicio < minIni) minIni = r.fecha_inicio;
                        }
                    }
                });

                return [[{
                    proximo_vencimiento: minFin ? new Date(minFin).toISOString() : null,
                    proxima_activacion: minIni ? new Date(minIni).toISOString() : null
                }]];
            }

            // Functionality Access UNION Query (used in checkUserFunctionalityAccess and /api/menu)
            if (q.includes("UNION") && (q.includes("USUARIO_ROLES") || q.includes("USUARIO_FUNCIONALIDADES"))) {
                const uid = parseInt(params[0]);
                let funcCode = null;
                if (q.includes("F.CODIGO = ?") && params.length >= 2 && isNaN(params[1])) {
                    funcCode = String(params[1]).toLowerCase();
                }

                const results = [];
                // 1. Roles route
                const rolePerms = getUserRolePermissions(uid);
                if (rolePerms.some(p => p.startsWith('ideas.')) && (!funcCode || funcCode === 'ideas')) {
                    results.push({ id: 2, codigo: 'ideas', ruta: '/ideas', funcionalidad_id: 2 });
                }
                if (rolePerms.some(p => p.startsWith('admin.')) && (!funcCode || funcCode === 'admin')) {
                    results.push({ id: 8, codigo: 'admin', ruta: '/admin', funcionalidad_id: 8 });
                }

                // 2. Direct accesses route
                const direct = getUserAccessRecords(uid);
                direct.forEach(r => {
                    if (r.estado === 'activo') {
                        let active = false;
                        if (r.tipo_acceso === 'permanente') {
                            active = true;
                        } else if (r.tipo_acceso === 'temporal') {
                            if (r.fecha_inicio <= simulatedCurrentTime && r.fecha_fin > simulatedCurrentTime) {
                                active = true;
                            }
                        }
                        if (active && (!funcCode || funcCode === r.codigo)) {
                            results.push({ id: r.funcionalidad_id, codigo: r.codigo, ruta: r.ruta, funcionalidad_id: r.funcionalidad_id });
                        }
                    }
                });

                return [results];
            }

            // Granular Permission Query (checkUserPermission)
            if (q.includes("FROM USUARIO_ROLES UR") && q.includes("P.CODIGO = ?")) {
                const uid = parseInt(params[0]);
                const permCode = params[1];
                const perms = getUserRolePermissions(uid);
                if (perms.includes(permCode)) {
                    return [[{ id: 99, codigo: permCode, nombre: permCode }]];
                }
                return [[]];
            }

            // Ideas CRUD queries
            if (q.startsWith("SELECT ID, USUARIO_ID, TITULO, DESCRIPCION, ESTADO, FECHA FROM IDEAS")) {
                return [[{ id: 1, usuario_id: params[0], titulo: 'Idea de Prueba', descripcion: 'Desc', estado: 'pendiente', fecha: new Date() }]];
            }
            if (q.startsWith("DELETE FROM IDEAS WHERE ID = ?")) {
                return [[{ affectedRows: 1 }]];
            }

            // Admin endpoints queries
            if (q.startsWith("SELECT ID, USUARIO, NOMBRE, TELEFONO, EMAIL FROM USUARIOS")) {
                return [[{ id: 1, usuario: 'admin', nombre: 'Admin User', telefono: '123', email: 'admin@idealandia.com' }]];
            }
            if (q.startsWith("SELECT ID, NOMBRE FROM ROLES WHERE ID = ?")) {
                return [[{ id: 1, nombre: 'Admin' }]];
            }

            return [[]];
        }
    };
};

const server = require('./server');

function makeRequest(method, path, token, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: process.env.PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Cookie': `auth_token=${token}` } : {})
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = data ? JSON.parse(data) : null;
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, data: parsed });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log("======================================================================");
    console.log("  INICIANDO SUITE DE PRUEBAS DE VENCIMIENTO DINÁMICO Y RBAC (8 CASOS)");
    console.log("======================================================================\n");

    // Wait for server to boot
    await new Promise(r => setTimeout(r, 1200));

    const token10 = jwt.sign({ id: 10, usuario: 'temp_no_crud', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token11 = jwt.sign({ id: 11, usuario: 'role_and_temp', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token12 = jwt.sign({ id: 12, usuario: 'permanent_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token13 = jwt.sign({ id: 13, usuario: 'read_only_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token14 = jwt.sign({ id: 14, usuario: 'auditor_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token15 = jwt.sign({ id: 15, usuario: 'revoked_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token16 = jwt.sign({ id: 16, usuario: 'future_user', jwt_version: 1 }, process.env.AUTH_SECRET);

    // -------------------------------------------------------------------------
    // CASO 1: Acceso exclusivamente temporal a Ideas sin permiso CRUD (ideas.read)
    // -------------------------------------------------------------------------
    console.log("----------------------------------------------------------------------");
    console.log("Caso 1: Acceso exclusivamente temporal a Ideas sin ideas.read por roles");
    console.log("----------------------------------------------------------------------");
    
    // ANTES del vencimiento (12:00:00 < 12:30:00)
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();
    let res = await makeRequest('GET', '/api/ideas', token10);
    if (res.status !== 403 || res.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Caso 1 Antes] Expected 403 RBAC_PERMISSION_DENIED, got ${res.status} ${JSON.stringify(res.data)}`);
    }
    console.log("  ✓ Antes de expirar: GET /api/ideas respondió 403 RBAC_PERMISSION_DENIED (acceso funcional ok, falta permiso CRUD).");

    let menuRes = await makeRequest('GET', '/api/menu', token10);
    if (!menuRes.data.some(item => item.nombre === 'Ideas')) {
        throw new Error(`[Caso 1 Antes Menu] Expected 'Ideas' in menu, got: ${JSON.stringify(menuRes.data)}`);
    }
    console.log("  ✓ Antes de expirar: GET /api/menu muestra 'Ideas'.");

    // DESPUÉS del vencimiento (12:31:00 > 12:30:00)
    simulatedCurrentTime = new Date('2026-11-05T12:31:00-06:00').getTime();
    res = await makeRequest('GET', '/api/ideas', token10);
    if (res.status !== 403 || res.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Caso 1 Después] Expected 403 RBAC_ACCESS_DENIED, got ${res.status} ${JSON.stringify(res.data)}`);
    }
    console.log("  ✓ Después de expirar: GET /api/ideas respondió 403 RBAC_ACCESS_DENIED (funcionalidad expirada).");

    menuRes = await makeRequest('GET', '/api/menu', token10);
    if (menuRes.data.some(item => item.nombre === 'Ideas')) {
        throw new Error(`[Caso 1 Después Menu] Expected 'Ideas' to disappear from menu, but it is present.`);
    }
    console.log("  ✓ Después de expirar: GET /api/menu ocultó 'Ideas' automáticamente.");

    // -------------------------------------------------------------------------
    // CASO 2: Acceso simultáneo por rol y temporal
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Caso 2: Acceso simultáneo por rol (ideas.read) y asignación temporal");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2026-11-05T12:35:00-06:00').getTime(); // Post-temporal expiration
    res = await makeRequest('GET', '/api/ideas', token11);
    if (res.status !== 200 || !res.data?.ideas) {
        throw new Error(`[Caso 2] Expected 200 OK after temporal expiration due to active role, got ${res.status}`);
    }
    menuRes = await makeRequest('GET', '/api/menu', token11);
    if (!menuRes.data.some(item => item.nombre === 'Ideas')) {
        throw new Error(`[Caso 2 Menu] Expected 'Ideas' to remain visible via role.`);
    }
    console.log("  ✓ Tras expirar asignación temporal: GET /api/ideas mantiene 200 OK y 'Ideas' permanece en menú por rol activo.");

    // -------------------------------------------------------------------------
    // CASO 3: Acceso directo permanente
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Caso 3: Acceso directo permanente (tipo_acceso = 'permanente', estado = 'activo')");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2030-01-01T00:00:00-06:00').getTime(); // Far in the future
    res = await makeRequest('GET', '/api/ideas', token12);
    if (res.status !== 200) {
        throw new Error(`[Caso 3] Expected 200 OK for permanent access, got ${res.status}`);
    }
    menuRes = await makeRequest('GET', '/api/menu', token12);
    if (!menuRes.data.some(item => item.nombre === 'Ideas')) {
        throw new Error(`[Caso 3 Menu] Expected 'Ideas' to be visible indefinitely.`);
    }
    console.log("  ✓ Acceso permanente: conserva vigencia indefinidamente sin requerir fecha de vencimiento (200 OK en 2030).");

    // -------------------------------------------------------------------------
    // CASO 4: Separación estricta de permisos CRUD en funcionalidades
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Caso 4: Separación estricta CRUD (Usuario con ideas.read pero sin ideas.delete)");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();
    const readRes = await makeRequest('GET', '/api/ideas', token13);
    if (readRes.status !== 200) {
        throw new Error(`[Caso 4 Read] Expected 200 for ideas.read, got ${readRes.status}`);
    }
    console.log("  ✓ Lectura permitida: GET /api/ideas respondió 200 OK.");

    const deleteRes = await makeRequest('DELETE', '/api/ideas/1', token13);
    if (deleteRes.status !== 403 || deleteRes.data?.code !== 'RBAC_PERMISSION_DENIED' || deleteRes.data?.permiso !== 'ideas.delete') {
        throw new Error(`[Caso 4 Delete] Expected 403 RBAC_PERMISSION_DENIED for ideas.delete, got ${deleteRes.status} ${JSON.stringify(deleteRes.data)}`);
    }
    console.log("  ✓ Eliminación denegada: DELETE /api/ideas/1 respondió 403 RBAC_PERMISSION_DENIED (se requiere ideas.delete).");

    // -------------------------------------------------------------------------
    // CASO 5: Acceso al módulo Administración (Caso Auditor)
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Caso 5: Acceso al módulo Administración (Auditor con acceso temporal a admin y usuarios.read)");
    console.log("----------------------------------------------------------------------");
    // 1. Entrar al módulo admin
    const adminCheckRes = await makeRequest('GET', '/api/admin/check', token14);
    if (adminCheckRes.status !== 200) {
        throw new Error(`[Caso 5 Check] Expected 200 for auditor entry to admin module, got ${adminCheckRes.status}`);
    }
    console.log("  ✓ Acceso al módulo Administración: GET /api/admin/check respondió 200 OK (sin requerir admin.access).");

    // 2. Consultar usuarios (tiene usuarios.read)
    const usuariosRes = await makeRequest('GET', '/api/admin/usuarios', token14);
    if (usuariosRes.status !== 200) {
        throw new Error(`[Caso 5 Usuarios] Expected 200 for usuarios.read, got ${usuariosRes.status}`);
    }
    console.log("  ✓ Lectura de usuarios permitida: GET /api/admin/usuarios respondió 200 OK.");

    // 3. Eliminar roles (carece de roles.delete)
    const deleteRoleRes = await makeRequest('DELETE', '/api/admin/roles/1', token14);
    if (deleteRoleRes.status !== 403 || deleteRoleRes.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Caso 5 Delete Role] Expected 403 RBAC_PERMISSION_DENIED, got ${deleteRoleRes.status}`);
    }
    console.log("  ✓ Eliminación de rol denegada: DELETE /api/admin/roles/1 respondió 403 RBAC_PERMISSION_DENIED.");

    // 4. Asignar accesos temporales (carece de admin.access)
    const postAccesosRes = await makeRequest('POST', '/api/admin/accesos', token14, {
        usuarios: [1], funcionalidad_id: 2, tipo_acceso: 'temporal',
        fecha_inicio: '2026-11-05 12:00:00', fecha_fin: '2026-11-05 13:00:00'
    });
    if (postAccesosRes.status !== 403 || postAccesosRes.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Caso 5 Post Accesos] Expected 403 RBAC_PERMISSION_DENIED, got ${postAccesosRes.status}`);
    }
    console.log("  ✓ Asignación de accesos denegada: POST /api/admin/accesos respondió 403 RBAC_PERMISSION_DENIED (falta admin.access).");

    // -------------------------------------------------------------------------
    // CASO 6: Revocación desde otro dispositivo
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Caso 6: Revocación dinámica de acceso (Cambio de estado a 'revocado')");
    console.log("----------------------------------------------------------------------");
    user15State = 'revocado';
    res = await makeRequest('GET', '/api/ideas', token15);
    if (res.status !== 403 || res.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Caso 6] Expected 403 RBAC_ACCESS_DENIED immediately after revocation in DB, got ${res.status}`);
    }
    menuRes = await makeRequest('GET', '/api/menu', token15);
    if (menuRes.data.some(item => item.nombre === 'Ideas')) {
        throw new Error(`[Caso 6 Menu] Expected 'Ideas' to be absent after revocation.`);
    }
    console.log("  ✓ Inmediatamente tras revocación remota en BD: GET /api/ideas respondió 403 RBAC_ACCESS_DENIED y menú se ocultó.");

    // -------------------------------------------------------------------------
    // CASO 7: Acceso programado en el futuro
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Caso 7: Acceso programado en el futuro (fecha_inicio > NOW())");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime(); // scheduled for 14:00
    res = await makeRequest('GET', '/api/ideas', token16);
    if (res.status !== 403 || res.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Caso 7] Expected 403 RBAC_ACCESS_DENIED before start time, got ${res.status}`);
    }
    const metaMenuRes = await makeRequest('GET', '/api/menu?meta=true', token16);
    if (metaMenuRes.data.menu.some(item => item.nombre === 'Ideas')) {
        throw new Error(`[Caso 7 Menu] Scheduled functionality should not be visible before start time.`);
    }
    if (!metaMenuRes.data.proxima_activacion) {
        throw new Error(`[Caso 7 Timing] Expected proxima_activacion in meta response.`);
    }
    console.log(`  ✓ Antes del inicio programado: GET /api/ideas denegado (403 RBAC_ACCESS_DENIED) y proxima_activacion reportada (${metaMenuRes.data.proxima_activacion}).`);

    // -------------------------------------------------------------------------
    // CASO 8: Sesión continua no interrumpida
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Caso 8: Sesión continua no interrumpida (Separación de sesión y permisos)");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2026-11-05T12:35:00-06:00').getTime(); // user10 expired
    const meRes = await makeRequest('GET', '/api/me', token10);
    if (meRes.status !== 200 || meRes.data?.user?.id !== 10) {
        throw new Error(`[Caso 8] Expected 200 OK on /api/me with valid user session, got ${meRes.status}`);
    }
    console.log("  ✓ Con accesos expirados, la sesión JWT permanece activa: GET /api/me respondió 200 OK con usuario autenticado.");

    console.log("\n======================================================================");
    console.log("  TODAS LAS PRUEBAS AUTOMATIZADAS (CASOS 1 A 8) PASARON EXITOSAMENTE");
    console.log("======================================================================\n");
    process.exit(0);
}

runTests().catch(err => {
    console.error("TEST SUITE FAILED:", err);
    process.exit(1);
});
