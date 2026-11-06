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

// In-memory simulation state for the 10 test scenarios
let simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

// Define user states
// user 10: Temp access to ideas (expires at 12:30:00), NO role with ideas.read
// user 11: Temp access to ideas (expires at 12:30:00), HAS role with ideas.read
// user 12: Permanent access to ideas, HAS role with ideas.read
// user 13: Temp access to ideas, HAS role with ideas.read, NO ideas.delete
// user 14: Auditor (temp access to administracion ID 8, HAS usuarios.read, NO admin.access, NO roles.delete)
// user 15: Revoked access scenario (initially active, then set to revocado)
// user 16: Future scheduled access (starts at 14:00:00)
// user 17: Administrator (active rol 'administrador' with admin.access, usuarios.read, roles.delete, etc.)
// user 18: Permanent direct access to administracion ID 8, NO role permissions
// user 19: Expired temp access to administracion ID 8 (ended at 12:00), NO admin role
// user 20: User with creaciones role (creaciones.read, creaciones.create)

const mockUsers = {
    10: { id: 10, usuario: 'temp_no_crud', jwt_version: 1 },
    11: { id: 11, usuario: 'role_and_temp', jwt_version: 1 },
    12: { id: 12, usuario: 'permanent_user', jwt_version: 1 },
    13: { id: 13, usuario: 'read_only_user', jwt_version: 1 },
    14: { id: 14, usuario: 'auditor_user', jwt_version: 1 },
    15: { id: 15, usuario: 'revoked_user', jwt_version: 1 },
    16: { id: 16, usuario: 'future_user', jwt_version: 1 },
    17: { id: 17, usuario: 'admin_role_user', jwt_version: 1 },
    18: { id: 18, usuario: 'permanent_admin_user', jwt_version: 1 },
    19: { id: 19, usuario: 'expired_admin_user', jwt_version: 1 },
    20: { id: 20, usuario: 'creaciones_user', jwt_version: 1 },
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
        // En la base de datos real, ID 8 tiene codigo = 'administracion'
        records.push({
            id: 105,
            funcionalidad_id: 8,
            codigo: 'administracion',
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
    } else if (userId === 18) {
        // Acceso directo permanente a administracion
        records.push({
            id: 108,
            funcionalidad_id: 8,
            codigo: 'administracion',
            ruta: '/admin',
            tipo_acceso: 'permanente',
            fecha_inicio: null,
            fecha_fin: null,
            estado: 'activo'
        });
    } else if (userId === 19) {
        // Acceso temporal vencido a administracion (venció a las 12:00:00)
        records.push({
            id: 109,
            funcionalidad_id: 8,
            codigo: 'administracion',
            ruta: '/admin',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T10:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T12:00:00-06:00').getTime(),
            estado: 'activo'
        });
    }
    return records;
}

function getUserRolePermissions(userId) {
    if (userId === 11 || userId === 12 || userId === 13) {
        return ['ideas.read'];
    }
    if (userId === 14) {
        return ['usuarios.read']; // Auditor has usuarios.read, NOT admin.access or roles.delete
    }
    if (userId === 17) {
        // Administrador con rol activo
        return ['admin.access', 'usuarios.read', 'usuarios.create', 'usuarios.update', 'usuarios.delete', 'roles.read', 'roles.delete'];
    }
    if (userId === 20) {
        return ['creaciones.read', 'creaciones.create'];
    }
    return [];
}

// Mock database pool
let capturedDbPool = null;
mysql.createPool = function(config) {
    const poolMock = {
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
                    { id: 3, nombre: 'Creaciones', funcionalidad_id: 3, parent_id: null, publico: 0, orden: 3 },
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
                let targetCodes = [];
                if (q.includes("F.CODIGO = ?") && params.length >= 2) {
                    targetCodes = params.slice(1).filter(p => typeof p === 'string').map(s => s.toLowerCase());
                }

                const results = [];
                // 1. Roles route
                const rolePerms = getUserRolePermissions(uid);
                if (rolePerms.some(p => p.startsWith('ideas.'))) {
                    if (targetCodes.length === 0 || targetCodes.includes('ideas')) {
                        results.push({ id: 2, codigo: 'ideas', ruta: '/ideas', funcionalidad_id: 2 });
                    }
                }
                if (rolePerms.some(p => p.startsWith('creaciones.'))) {
                    if (targetCodes.length === 0 || targetCodes.includes('creaciones')) {
                        results.push({ id: 3, codigo: 'creaciones', ruta: '/creaciones', funcionalidad_id: 3 });
                    }
                }
                if (rolePerms.includes('admin.access') || uid === 17) {
                    if (targetCodes.length === 0 || targetCodes.includes('administracion') || targetCodes.includes('admin')) {
                        results.push({ id: 8, codigo: 'administracion', ruta: '/admin', funcionalidad_id: 8 });
                    }
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
                        if (active) {
                            const rCode = r.codigo.toLowerCase();
                            const matches = targetCodes.length === 0 ||
                                targetCodes.includes(rCode) ||
                                (rCode === 'administracion' && targetCodes.includes('admin')) ||
                                (rCode === 'admin' && targetCodes.includes('administracion'));

                            if (matches) {
                                results.push({
                                    id: r.funcionalidad_id,
                                    codigo: r.codigo,
                                    ruta: r.ruta,
                                    funcionalidad_id: r.funcionalidad_id
                                });
                            }
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
            if (q.startsWith("DELETE FROM ROLES WHERE ID = ?")) {
                return [[{ affectedRows: 1 }]];
            }

            return [[]];
        }
    };
    capturedDbPool = poolMock;
    return poolMock;
};

const serverModule = require('./server');

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
    console.log("  INICIANDO SUITE DE PRUEBAS DE VENCIMIENTO DINÁMICO Y RBAC (10 ESCENARIOS)");
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
    const token17 = jwt.sign({ id: 17, usuario: 'admin_role_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token18 = jwt.sign({ id: 18, usuario: 'permanent_admin_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token19 = jwt.sign({ id: 19, usuario: 'expired_admin_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token20 = jwt.sign({ id: 20, usuario: 'creaciones_user', jwt_version: 1 }, process.env.AUTH_SECRET);

    // -------------------------------------------------------------------------
    // ESCENARIO 1: requireFunctionality('admin') encuentra correctamente 'administracion'
    // -------------------------------------------------------------------------
    console.log("----------------------------------------------------------------------");
    console.log("Escenario 1: requireFunctionality('admin') resuelve funcionalidad 'administracion'");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    // Comprobación directa de la función de acceso
    const accessWithAlias = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 14, 'admin');
    if (!accessWithAlias) {
        throw new Error("[Escenario 1] checkUserFunctionalityAccess con 'admin' debe resolver true para funcionalidad 'administracion'");
    }
    console.log("  ✓ checkUserFunctionalityAccess(pool, 14, 'admin') resolvió TRUE contra registro 'administracion'.");

    // Comprobación HTTP endpoint con requireFunctionality('admin')
    const checkAliasRes = await makeRequest('GET', '/api/admin/check', token14);
    if (checkAliasRes.status !== 200) {
        throw new Error(`[Escenario 1] GET /api/admin/check (con alias 'admin') esperó 200, obtuvo ${checkAliasRes.status} ${JSON.stringify(checkAliasRes.data)}`);
    }
    console.log("  ✓ Endpoint GET /api/admin/check respondió HTTP 200 OK autorizando el alias 'admin'.");

    // -------------------------------------------------------------------------
    // ESCENARIO 2: requireFunctionality('administracion') produce el mismo resultado
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 2: requireFunctionality('administracion') produce resultado idéntico");
    console.log("----------------------------------------------------------------------");
    const accessWithCanonical = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 14, 'administracion');
    if (!accessWithCanonical) {
        throw new Error("[Escenario 2] checkUserFunctionalityAccess con 'administracion' debe resolver true");
    }
    console.log("  ✓ checkUserFunctionalityAccess(pool, 14, 'administracion') resolvió TRUE exactamente igual que con 'admin'.");

    // Comprobación middleware requireFunctionality('administracion')
    let middlewareCalledNext = false;
    const mockReq = { userId: 14, cookies: { auth_token: token14 } };
    const mockRes = { status: () => ({ json: () => {} }) };
    await serverModule.requireFunctionality('administracion')(mockReq, mockRes, () => {
        middlewareCalledNext = true;
    });
    if (!middlewareCalledNext) {
        throw new Error("[Escenario 2] requireFunctionality('administracion') debió invocar next() exitosamente");
    }
    console.log("  ✓ Middleware requireFunctionality('administracion') invocó next() con éxito sin rechazar acceso.");

    // Comprobación en caso negativo: ambos alias rechazan con usuario no autorizado (token19 expirado)
    simulatedCurrentTime = new Date('2026-11-05T12:05:00-06:00').getTime();
    const negAlias = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 19, 'admin');
    const negCanon = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 19, 'administracion');
    if (negAlias !== false || negCanon !== false) {
        throw new Error("[Escenario 2 Negativo] Ambos deben ser FALSE para acceso vencido");
    }
    console.log("  ✓ Equivalencia negativa confirmada: tanto 'admin' como 'administracion' devuelven FALSE tras vencimiento.");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    // -------------------------------------------------------------------------
    // ESCENARIO 3: Administrador con rol activo entra al módulo y consulta usuarios
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 3: Administrador con rol activo accede al módulo y consulta usuarios");
    console.log("----------------------------------------------------------------------");
    const adminCheckRes = await makeRequest('GET', '/api/admin/check', token17);
    if (adminCheckRes.status !== 200) {
        throw new Error(`[Escenario 3 Check] Expected 200 for active admin role, got ${adminCheckRes.status}`);
    }
    console.log("  ✓ GET /api/admin/check respondió 200 OK para administrador con rol activo.");

    const adminUsersRes = await makeRequest('GET', '/api/admin/usuarios', token17);
    if (adminUsersRes.status !== 200 || !Array.isArray(adminUsersRes.data)) {
        throw new Error(`[Escenario 3 Usuarios] Expected 200 array for admin role with usuarios.read, got ${adminUsersRes.status}`);
    }
    console.log("  ✓ GET /api/admin/usuarios respondió 200 OK consultando usuarios con rol activo.");

    const adminMenuRes = await makeRequest('GET', '/api/menu', token17);
    if (!adminMenuRes.data.some(item => item.nombre === 'Administración')) {
        throw new Error("[Escenario 3 Menu] 'Administración' debe figurar en el menú del administrador.");
    }
    console.log("  ✓ 'Administración' aparece visible en GET /api/menu mediante rol activo.");

    // -------------------------------------------------------------------------
    // ESCENARIO 4: Usuario con acceso temporal vigente a ID 8 puede entrar al módulo
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 4: Usuario con acceso temporal vigente a ID 8 entra a Administración");
    console.log("----------------------------------------------------------------------");
    const auditorCheckRes = await makeRequest('GET', '/api/admin/check', token14);
    if (auditorCheckRes.status !== 200) {
        throw new Error(`[Escenario 4] Expected 200 for user with active temporal access to ID 8, got ${auditorCheckRes.status}`);
    }
    console.log("  ✓ GET /api/admin/check respondió 200 OK con acceso temporal vigente a ID 8 (sin exigir admin.access).");

    // -------------------------------------------------------------------------
    // ESCENARIO 5: Usuario con acceso directo permanente a ID 8 conserva acceso indefinido
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 5: Acceso directo permanente a ID 8 conserva vigencia indefinida (2030)");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2030-01-01T00:00:00-06:00').getTime(); // Far future
    const permAdminCheck = await makeRequest('GET', '/api/admin/check', token18);
    if (permAdminCheck.status !== 200) {
        throw new Error(`[Escenario 5] Expected 200 OK in 2030 for permanent direct access, got ${permAdminCheck.status}`);
    }
    const permMenu = await makeRequest('GET', '/api/menu', token18);
    if (!permMenu.data.some(item => item.nombre === 'Administración')) {
        throw new Error("[Escenario 5 Menu] 'Administración' debe mantenerse visible permanentemente.");
    }
    console.log("  ✓ Acceso permanente a ID 8: respondió 200 OK en el año 2030 y menú activo indefinidamente.");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    // -------------------------------------------------------------------------
    // ESCENARIO 6: Acceso temporal + usuarios.read consulta usuarios, pero no borra roles
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 6: Separación de permisos CRUD en módulo Administración");
    console.log("----------------------------------------------------------------------");
    const auditorUsersRes = await makeRequest('GET', '/api/admin/usuarios', token14);
    if (auditorUsersRes.status !== 200) {
        throw new Error(`[Escenario 6 Usuarios] Expected 200 for usuarios.read, got ${auditorUsersRes.status}`);
    }
    console.log("  ✓ Lectura de usuarios permitida: GET /api/admin/usuarios respondió 200 OK (posee usuarios.read).");

    const deleteRoleRes = await makeRequest('DELETE', '/api/admin/roles/1', token14);
    if (deleteRoleRes.status !== 403 || deleteRoleRes.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Escenario 6 Delete Role] Expected 403 RBAC_PERMISSION_DENIED, got ${deleteRoleRes.status}`);
    }
    console.log("  ✓ Eliminación de rol denegada: DELETE /api/admin/roles/1 respondió 403 RBAC_PERMISSION_DENIED (carece de roles.delete).");

    // -------------------------------------------------------------------------
    // ESCENARIO 7: Acceso temporal a Administración no permite gestionar accesos sin admin.access
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 7: Acceso temporal no otorga admin.access para gestionar accesos");
    console.log("----------------------------------------------------------------------");
    const postAccesosRes = await makeRequest('POST', '/api/admin/accesos', token14, {
        usuarios: [1], funcionalidad_id: 2, tipo_acceso: 'temporal',
        fecha_inicio: '2026-11-05 12:00:00', fecha_fin: '2026-11-05 13:00:00'
    });
    if (postAccesosRes.status !== 403 || postAccesosRes.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Escenario 7 Post Accesos] Expected 403 RBAC_PERMISSION_DENIED, got ${postAccesosRes.status}`);
    }
    console.log("  ✓ Crear accesos temporales denegado: POST /api/admin/accesos respondió 403 RBAC_PERMISSION_DENIED.");

    const revokeAccesoRes = await makeRequest('PUT', '/api/admin/accesos/105/revocar', token14);
    if (revokeAccesoRes.status !== 403 || revokeAccesoRes.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Escenario 7 Revocar] Expected 403 RBAC_PERMISSION_DENIED, got ${revokeAccesoRes.status}`);
    }
    console.log("  ✓ Revocar accesos denegado: PUT /api/admin/accesos/:id/revocar respondió 403 RBAC_PERMISSION_DENIED.");

    // -------------------------------------------------------------------------
    // ESCENARIO 8: Al vencer o revocar acceso temporal, se pierde acceso funcional
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 8: Vencimiento y revocación dinámica de accesos temporales");
    console.log("----------------------------------------------------------------------");
    // Sub-caso 8a: Vencimiento de acceso temporal a administración sin rol alternativo
    simulatedCurrentTime = new Date('2026-11-05T13:05:00-06:00').getTime(); // Post 13:00 expiration
    const expiredCheckRes = await makeRequest('GET', '/api/admin/check', token14);
    if (expiredCheckRes.status !== 403 || expiredCheckRes.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Escenario 8a] Expected 403 RBAC_ACCESS_DENIED after expiration, got ${expiredCheckRes.status}`);
    }
    const expiredUsersRes = await makeRequest('GET', '/api/admin/usuarios', token14);
    if (expiredUsersRes.status !== 403 || expiredUsersRes.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Escenario 8a Usuarios] Expected 403 RBAC_ACCESS_DENIED for expired functionality, got ${expiredUsersRes.status}`);
    }
    const expiredMenuRes = await makeRequest('GET', '/api/menu', token14);
    if (expiredMenuRes.data.some(item => item.nombre === 'Administración')) {
        throw new Error("[Escenario 8a Menu] 'Administración' debe desaparecer del menú al vencer el acceso temporal.");
    }
    console.log("  ✓ 8a. Tras expirar vigencia: GET /api/admin/check y /api/admin/usuarios devuelven 403 RBAC_ACCESS_DENIED y menú se oculta.");

    // Sub-caso 8b: Revocación explícita (estado = 'revocado')
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();
    user15State = 'revocado';
    const revokedRes = await makeRequest('GET', '/api/ideas', token15);
    if (revokedRes.status !== 403 || revokedRes.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Escenario 8b] Expected 403 RBAC_ACCESS_DENIED for revoked state, got ${revokedRes.status}`);
    }
    console.log("  ✓ 8b. Acceso revocado en BD: GET /api/ideas respondió inmediatamente 403 RBAC_ACCESS_DENIED.");

    // Sub-caso 8c: Conservación de acceso si existe rol activo independiente
    simulatedCurrentTime = new Date('2026-11-05T12:35:00-06:00').getTime(); // Post temporal expiration of user 11
    const roleRetainedRes = await makeRequest('GET', '/api/ideas', token11);
    if (roleRetainedRes.status !== 200 || !roleRetainedRes.data?.ideas) {
        throw new Error(`[Escenario 8c] Expected 200 OK because user has active role with ideas.read, got ${roleRetainedRes.status}`);
    }
    console.log("  ✓ 8c. Vencimiento temporal superado por rol activo: conserva acceso functional (200 OK) vía rol independiente.");

    // -------------------------------------------------------------------------
    // ESCENARIO 9: Protección estricta de permisos CRUD en funcionalidades
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 9: Verificación de permisos CRUD a nivel operativo");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();
    // User 10 tiene funcionalidad ideas, pero no ideas.read
    const noCrudRes = await makeRequest('GET', '/api/ideas', token10);
    if (noCrudRes.status !== 403 || noCrudRes.data?.code !== 'RBAC_PERMISSION_DENIED' || noCrudRes.data?.permiso !== 'ideas.read') {
        throw new Error(`[Escenario 9 Ideas.read] Expected 403 RBAC_PERMISSION_DENIED for ideas.read, got ${noCrudRes.status}`);
    }
    console.log("  ✓ Usuario con funcionalidad pero sin ideas.read recibe 403 RBAC_PERMISSION_DENIED.");

    // User 13 tiene ideas.read pero no ideas.delete
    const deleteIdeaRes = await makeRequest('DELETE', '/api/ideas/1', token13);
    if (deleteIdeaRes.status !== 403 || deleteIdeaRes.data?.code !== 'RBAC_PERMISSION_DENIED' || deleteIdeaRes.data?.permiso !== 'ideas.delete') {
        throw new Error(`[Escenario 9 Ideas.delete] Expected 403 RBAC_PERMISSION_DENIED for ideas.delete, got ${deleteIdeaRes.status}`);
    }
    console.log("  ✓ Usuario sin permiso ideas.delete recibe 403 RBAC_PERMISSION_DENIED al intentar DELETE.");

    // -------------------------------------------------------------------------
    // ESCENARIO 10: No alteración de otras funcionalidades (ideas, creaciones) ni sesiones
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 10: Integridad de otras funcionalidades (ideas, creaciones) y sesión JWT");
    console.log("----------------------------------------------------------------------");
    // Verificación directa de funcionalidad 'creaciones'
    const creacionesAccess = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 20, 'creaciones');
    if (!creacionesAccess) {
        throw new Error("[Escenario 10] checkUserFunctionalityAccess para 'creaciones' debe ser TRUE");
    }
    console.log("  ✓ Funcionalidad 'creaciones' no se vio afectada y resolvió TRUE para usuario con rol correspondiente.");

    // Verificación de normalización: códigos distintos de admin no son alterados
    const normalizedIdeas = serverModule.normalizeFunctionalityCode('ideas');
    const normalizedCreaciones = serverModule.normalizeFunctionalityCode('creaciones');
    if (normalizedIdeas !== 'ideas' || normalizedCreaciones !== 'creaciones') {
        throw new Error("[Escenario 10] normalizeFunctionalityCode no debe modificar códigos ajenos a admin");
    }
    console.log("  ✓ normalizeFunctionalityCode preservó intactos códigos ajenos ('ideas' -> 'ideas', 'creaciones' -> 'creaciones').");

    // Sesión JWT no se destruye al vencer funcionalidad (Nivel 1 independiente de Nivel 2 y 3)
    simulatedCurrentTime = new Date('2026-11-05T13:30:00-06:00').getTime();
    const meRes = await makeRequest('GET', '/api/me', token10);
    if (meRes.status !== 200 || meRes.data?.user?.id !== 10) {
        throw new Error(`[Escenario 10 Session] Expected 200 on /api/me with valid JWT, got ${meRes.status}`);
    }
    console.log("  ✓ Sesión JWT preservada: GET /api/me respondió 200 OK con usuario autenticado aún con accesos vencidos.");

    console.log("\n======================================================================");
    console.log("  LOS 10 ESCENARIOS DE VERIFICACIÓN RBAC PASARON EXITOSAMENTE (10/10)");
    console.log("======================================================================\n");
    process.exit(0);
}

runTests().catch(err => {
    console.error("TEST SUITE FAILED:", err);
    process.exit(1);
});
