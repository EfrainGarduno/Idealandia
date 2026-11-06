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

// In-memory simulation state for dynamic tests
let simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

// Define user states
// user 10: Temp access to ideas (expires at 12:30:00), NO role with ideas.read
// user 11: Temp access to ideas (expires at 12:30:00), HAS role with ideas.read
// user 12: Permanent access to ideas, HAS role with ideas.read
// user 13: Temp access to ideas, HAS role with ideas.read, NO ideas.delete
// user 14: Auditor (temp access to administracion ID 8, HAS usuarios.read, NO admin.access, NO roles.delete)
// user 15: Revoked access scenario (initially active, then set to revocado)
// user 16: Future scheduled access (starts at 14:00:00)
// user 17: Administrator (active rol 'administrador' with all 21 permissions: admin.access, usuarios.*, roles.*, permisos.*, funcionalidades.*, menus.*)
// user 18: Permanent direct access to administracion ID 8, NO role permissions
// user 19: Expired temp access to administracion ID 8 (ended at 12:00), NO admin role
// user 20: User with creaciones role (creaciones.read, creaciones.create)
// user 21: Nivel 2 EXCLUSIVO por ROL (tiene rol con usuarios.read vinculado a funcionalidad administracion, CERO asignaciones en usuario_funcionalidades)
// user 22: Nivel 2 EXCLUSIVO por ASIGNACIÓN TEMPORAL (tiene acceso temporal directo a ID 8 en usuario_funcionalidades, CERO roles administrativos)

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
    21: { id: 21, usuario: 'role_only_admin_entry_user', jwt_version: 1 },
    22: { id: 22, usuario: 'temporal_only_admin_entry_user', jwt_version: 1 },
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
    } else if (userId === 22) {
        // user 22: Asignación temporal exclusiva a administracion ID 8 (de 11:00 a 13:00)
        records.push({
            id: 110,
            funcionalidad_id: 8,
            codigo: 'administracion',
            ruta: '/admin',
            tipo_acceso: 'temporal',
            fecha_inicio: new Date('2026-11-05T11:00:00-06:00').getTime(),
            fecha_fin: new Date('2026-11-05T13:00:00-06:00').getTime(),
            estado: 'activo'
        });
    }
    // user 21 no tiene registros en usuario_funcionalidades
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
        // Administrador con rol 'administrador' completo (21 permisos)
        return [
            'admin.access',
            'usuarios.read', 'usuarios.create', 'usuarios.update', 'usuarios.delete',
            'roles.read', 'roles.create', 'roles.update', 'roles.delete',
            'permisos.read', 'permisos.create', 'permisos.update', 'permisos.delete',
            'funcionalidades.read', 'funcionalidades.create', 'funcionalidades.update', 'funcionalidades.delete',
            'menus.read', 'menus.create', 'menus.update', 'menus.delete'
        ];
    }
    if (userId === 20) {
        return ['creaciones.read', 'creaciones.create'];
    }
    if (userId === 21) {
        // user 21: Acceso exclusivo por rol: tiene usuarios.read vinculado a administracion en funcionalidad_permisos
        return ['usuarios.read'];
    }
    // user 22 no tiene roles administrativos
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
                // 1. Roles route: vincula funcionalidad_permisos con f.id = 8 ('administracion')
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
                // Si el rol tiene CUALQUIER permiso administrativo vinculado a administracion (usuarios.*, roles.*, etc.):
                const hasAdminPerm = rolePerms.some(p => 
                    p.startsWith('usuarios.') || p.startsWith('roles.') || p.startsWith('permisos.') ||
                    p.startsWith('funcionalidades.') || p.startsWith('menus.') || p === 'admin.access'
                );
                if (hasAdminPerm || uid === 17) {
                    if (targetCodes.length === 0 || targetCodes.includes('administracion') || targetCodes.includes('admin')) {
                        results.push({ id: 8, codigo: 'administracion', ruta: '/admin', funcionalidad_id: 8 });
                    }
                }

                // 2. Direct accesses route (usuario_funcionalidades)
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
            if (q.startsWith("SELECT ID, CODIGO, NOMBRE, DESCRIPCION, RUTA, ACTIVO FROM FUNCIONALIDADES")) {
                return [[
                    { id: 1, codigo: 'inicio', nombre: 'Inicio', ruta: '/', activo: 1 },
                    { id: 2, codigo: 'ideas', nombre: 'Ideas', ruta: '/ideas', activo: 1 },
                    { id: 8, codigo: 'administracion', nombre: 'Administración', ruta: '/admin', activo: 1 }
                ]];
            }
            if (q.startsWith("SELECT ID, NOMBRE, FUNCIONALIDAD_ID, PARENT_ID, ORDEN, PUBLICO, ACTIVO FROM MENU_ITEMS")) {
                return [[
                    { id: 1, nombre: 'Inicio', funcionalidad_id: 1, parent_id: null, orden: 1, publico: 1, activo: 1 },
                    { id: 15, nombre: 'Administración', funcionalidad_id: 8, parent_id: null, orden: 7, publico: 0, activo: 1 }
                ]];
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
    console.log("  INICIANDO SUITE DE PRUEBAS DE VENCIMIENTO DINÁMICO Y RBAC (COMPLETA)");
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
    const token21 = jwt.sign({ id: 21, usuario: 'role_only_admin_entry_user', jwt_version: 1 }, process.env.AUTH_SECRET);
    const token22 = jwt.sign({ id: 22, usuario: 'temporal_only_admin_entry_user', jwt_version: 1 }, process.env.AUTH_SECRET);

    // -------------------------------------------------------------------------
    // ESCENARIO 1: requireFunctionality('admin') encuentra correctamente 'administracion'
    // -------------------------------------------------------------------------
    console.log("----------------------------------------------------------------------");
    console.log("Escenario 1: Normalización de alias ('admin' -> 'administracion')");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    const accessWithAlias = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 14, 'admin');
    if (!accessWithAlias) {
        throw new Error("[Escenario 1] checkUserFunctionalityAccess con 'admin' debe resolver true para funcionalidad 'administracion'");
    }
    console.log("  ✓ checkUserFunctionalityAccess(pool, 14, 'admin') resolvió TRUE contra registro 'administracion'.");

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

    simulatedCurrentTime = new Date('2026-11-05T12:05:00-06:00').getTime();
    const negAlias = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 19, 'admin');
    const negCanon = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 19, 'administracion');
    if (negAlias !== false || negCanon !== false) {
        throw new Error("[Escenario 2 Negativo] Ambos deben ser FALSE para acceso vencido");
    }
    console.log("  ✓ Equivalencia negativa confirmada: tanto 'admin' como 'administracion' devuelven FALSE tras vencimiento.");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    // -------------------------------------------------------------------------
    // ESCENARIO 3: Nivel 2 Independiente A: Acceso a Administración exclusivamente por ROL
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 3: Acceso a Administración exclusivamente por ROL (sin asignación directa)");
    console.log("----------------------------------------------------------------------");
    // User 21 tiene únicamente rol con usuarios.read y CERO asignaciones directas
    const user21Directs = getUserAccessRecords(21);
    if (user21Directs.length !== 0) throw new Error("[Escenario 3] User 21 no debe tener asignaciones directas.");

    const roleOnlyCheckRes = await makeRequest('GET', '/api/admin/check', token21);
    if (roleOnlyCheckRes.status !== 200) {
        throw new Error(`[Escenario 3 Check] Expected 200 for user with admin role permission, got ${roleOnlyCheckRes.status}`);
    }
    console.log("  ✓ Nivel 2 superado: GET /api/admin/check respondió 200 OK vía permiso de rol ('usuarios.read') vinculado a funcionalidad.");

    const roleOnlyUsersRes = await makeRequest('GET', '/api/admin/usuarios', token21);
    if (roleOnlyUsersRes.status !== 200) {
        throw new Error(`[Escenario 3 Usuarios] Expected 200 for user with usuarios.read, got ${roleOnlyUsersRes.status}`);
    }
    console.log("  ✓ Nivel 3 autorizado: GET /api/admin/usuarios respondió 200 OK.");

    // Aislamiento CRUD: No puede gestionar funcionalidades, menús ni accesos
    const roleOnlyFuncRes = await makeRequest('GET', '/api/admin/funcionalidades', token21);
    if (roleOnlyFuncRes.status !== 403 || roleOnlyFuncRes.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error("[Escenario 3 Aislamiento Func] Debió rechazar con 403 RBAC_PERMISSION_DENIED");
    }
    const roleOnlyMenusRes = await makeRequest('GET', '/api/admin/menus', token21);
    if (roleOnlyMenusRes.status !== 403 || roleOnlyMenusRes.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error("[Escenario 3 Aislamiento Menus] Debió rechazar con 403 RBAC_PERMISSION_DENIED");
    }
    console.log("  ✓ Aislamiento CRUD comprobado: Usuario por rol sin permisos de funcionalidades o menús recibe 403 RBAC_PERMISSION_DENIED.");

    // -------------------------------------------------------------------------
    // ESCENARIO 4: Nivel 2 Independiente B: Acceso a Administración exclusivamente por ASIGNACIÓN TEMPORAL DIRECTA
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 4: Acceso a Administración exclusivamente por ASIGNACIÓN TEMPORAL (sin roles)");
    console.log("----------------------------------------------------------------------");
    // User 22 tiene asignación temporal directa de 11:00 a 13:00 y CERO roles
    const user22Roles = getUserRolePermissions(22);
    if (user22Roles.length !== 0) throw new Error("[Escenario 4] User 22 no debe tener roles.");

    // 4a. Mientras la asignación está vigente (12:00 < 13:00)
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();
    const tempOnlyCheckActive = await makeRequest('GET', '/api/admin/check', token22);
    if (tempOnlyCheckActive.status !== 200) {
        throw new Error(`[Escenario 4a Check] Expected 200 while temporal assignment is active, got ${tempOnlyCheckActive.status}`);
    }
    console.log("  ✓ Nivel 2 superado mientras está vigente: GET /api/admin/check respondió 200 OK vía usuario_funcionalidades.");

    // 4b. Aislamiento CRUD estricto: El acceso temporal no concede permisos CRUD
    const tempOnlyUsers = await makeRequest('GET', '/api/admin/usuarios', token22);
    if (tempOnlyUsers.status !== 403 || tempOnlyUsers.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Escenario 4b Usuarios] Expected 403 RBAC_PERMISSION_DENIED, got ${tempOnlyUsers.status}`);
    }
    const tempOnlyFuncs = await makeRequest('GET', '/api/admin/funcionalidades', token22);
    if (tempOnlyFuncs.status !== 403 || tempOnlyFuncs.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Escenario 4b Funcs] Expected 403 RBAC_PERMISSION_DENIED, got ${tempOnlyFuncs.status}`);
    }
    const tempOnlyMenus = await makeRequest('GET', '/api/admin/menus', token22);
    if (tempOnlyMenus.status !== 403 || tempOnlyMenus.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Escenario 4b Menus] Expected 403 RBAC_PERMISSION_DENIED, got ${tempOnlyMenus.status}`);
    }
    const tempOnlyAccesos = await makeRequest('POST', '/api/admin/accesos', token22, { usuarios: [1], funcionalidad_id: 2, tipo_acceso: 'temporal' });
    if (tempOnlyAccesos.status !== 403 || tempOnlyAccesos.data?.code !== 'RBAC_PERMISSION_DENIED') {
        throw new Error(`[Escenario 4b Accesos] Expected 403 RBAC_PERMISSION_DENIED, got ${tempOnlyAccesos.status}`);
    }
    console.log("  ✓ Aislamiento CRUD estricto: Acceso temporal directo no otorga privilegios CRUD (usuarios, funcs, menús, accesos responden 403 RBAC_PERMISSION_DENIED).");

    // 4c. Expiración al llegar a fecha_fin (13:05 > 13:00)
    simulatedCurrentTime = new Date('2026-11-05T13:05:00-06:00').getTime();
    const tempOnlyCheckExpired = await makeRequest('GET', '/api/admin/check', token22);
    if (tempOnlyCheckExpired.status !== 403 || tempOnlyCheckExpired.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Escenario 4c Check] Expected 403 RBAC_ACCESS_DENIED after expiration, got ${tempOnlyCheckExpired.status}`);
    }
    const tempOnlyUsersExpired = await makeRequest('GET', '/api/admin/usuarios', token22);
    if (tempOnlyUsersExpired.status !== 403 || tempOnlyUsersExpired.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Escenario 4c Usuarios] Expected 403 RBAC_ACCESS_DENIED after expiration, got ${tempOnlyUsersExpired.status}`);
    }
    const tempOnlyMenuExpired = await makeRequest('GET', '/api/menu', token22);
    if (tempOnlyMenuExpired.data.some(item => item.nombre === 'Administración')) {
        throw new Error("[Escenario 4c Menu] 'Administración' debe desaparecer del menú al vencer.");
    }
    console.log("  ✓ Expiración automática confirmada: Tras fecha_fin, GET /api/admin/check y /api/admin/usuarios responden 403 RBAC_ACCESS_DENIED y menú se oculta.");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    // -------------------------------------------------------------------------
    // ESCENARIO 5: Pruebas de Regresión para los 3 Errores de Administración (Admin Rol Completo)
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 5: Pruebas de Regresión de los 3 Errores Observados");
    console.log("----------------------------------------------------------------------");
    // Regresión 1: Pestaña Funcionalidades
    const funcRes = await makeRequest('GET', '/api/admin/funcionalidades', token17);
    if (funcRes.status !== 200 || !Array.isArray(funcRes.data)) {
        throw new Error(`[Regresión 1 Funcionalidades] Expected 200 array for GET /api/admin/funcionalidades, got ${funcRes.status}`);
    }
    console.log("  ✓ Regresión 1 Resuelta: GET /api/admin/funcionalidades respondió HTTP 200 OK con catálogo de funcionalidades.");

    // Regresión 2: Pestaña Menús
    const menusRes = await makeRequest('GET', '/api/admin/menus', token17);
    if (menusRes.status !== 200 || !Array.isArray(menusRes.data)) {
        throw new Error(`[Regresión 2 Menús] Expected 200 array for GET /api/admin/menus, got ${menusRes.status}`);
    }
    console.log("  ✓ Regresión 2 Resuelta: GET /api/admin/menus respondió HTTP 200 OK con catálogo de menús.");

    // Regresión 3: Modal Otorgar Acceso (flujo paralelo Promise.all idéntico a admin.js líneas 364-368)
    const [modalFuncRes, modalUserRes] = await Promise.all([
        makeRequest('GET', '/api/admin/funcionalidades', token17),
        makeRequest('GET', '/api/admin/usuarios', token17)
    ]);
    if (modalFuncRes.status !== 200 || modalUserRes.status !== 200) {
        throw new Error(`[Regresión 3 Modal] Ambas peticiones paralelas deben ser 200 OK`);
    }
    if (!Array.isArray(modalFuncRes.data) || !Array.isArray(modalUserRes.data)) {
        throw new Error(`[Regresión 3 Modal] Ambas peticiones deben devolver colecciones válidas`);
    }
    console.log("  ✓ Regresión 3 Resuelta: Promise.all([/api/admin/funcionalidades, /api/admin/usuarios]) respondió 200 OK sin excepciones, modal listo para renderizar.");

    // -------------------------------------------------------------------------
    // ESCENARIO 6: Acceso permanente a ID 8 conserva vigencia indefinida
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 6: Acceso permanente a ID 8 conserva vigencia indefinida (2030)");
    console.log("----------------------------------------------------------------------");
    simulatedCurrentTime = new Date('2030-01-01T00:00:00-06:00').getTime();
    const permAdminCheck = await makeRequest('GET', '/api/admin/check', token18);
    if (permAdminCheck.status !== 200) {
        throw new Error(`[Escenario 6] Expected 200 OK in 2030 for permanent direct access, got ${permAdminCheck.status}`);
    }
    const permMenu = await makeRequest('GET', '/api/menu', token18);
    if (!permMenu.data.some(item => item.nombre === 'Administración')) {
        throw new Error("[Escenario 6 Menu] 'Administración' debe mantenerse visible permanentemente.");
    }
    console.log("  ✓ Acceso permanente a ID 8 respondió 200 OK en 2030 y menú activo indefinidamente.");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    // -------------------------------------------------------------------------
    // ESCENARIO 7: Revocación dinámica y conservación con rol alternativo
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 7: Revocación dinámica y rol activo alternativo");
    console.log("----------------------------------------------------------------------");
    user15State = 'revocado';
    const revokedRes = await makeRequest('GET', '/api/ideas', token15);
    if (revokedRes.status !== 403 || revokedRes.data?.code !== 'RBAC_ACCESS_DENIED') {
        throw new Error(`[Escenario 7a] Expected 403 RBAC_ACCESS_DENIED for revoked state, got ${revokedRes.status}`);
    }
    console.log("  ✓ Acceso revocado en BD respondió inmediatamente 403 RBAC_ACCESS_DENIED.");

    simulatedCurrentTime = new Date('2026-11-05T12:35:00-06:00').getTime(); // Post temporal expiration of user 11
    const roleRetainedRes = await makeRequest('GET', '/api/ideas', token11);
    if (roleRetainedRes.status !== 200 || !roleRetainedRes.data?.ideas) {
        throw new Error(`[Escenario 7b] Expected 200 OK because user has active role with ideas.read, got ${roleRetainedRes.status}`);
    }
    console.log("  ✓ Vencimiento temporal superado por rol activo independiente mantiene 200 OK.");
    simulatedCurrentTime = new Date('2026-11-05T12:00:00-06:00').getTime();

    // -------------------------------------------------------------------------
    // ESCENARIO 8: Integridad de otras funcionalidades y sesión JWT
    // -------------------------------------------------------------------------
    console.log("\n----------------------------------------------------------------------");
    console.log("Escenario 8: Integridad de otras funcionalidades (ideas, creaciones) y sesión JWT");
    console.log("----------------------------------------------------------------------");
    const creacionesAccess = await serverModule.checkUserFunctionalityAccess(capturedDbPool, 20, 'creaciones');
    if (!creacionesAccess) {
        throw new Error("[Escenario 8] checkUserFunctionalityAccess para 'creaciones' debe ser TRUE");
    }
    console.log("  ✓ Funcionalidad 'creaciones' no se vio afectada y resolvió TRUE.");

    const normalizedIdeas = serverModule.normalizeFunctionalityCode('ideas');
    const normalizedCreaciones = serverModule.normalizeFunctionalityCode('creaciones');
    if (normalizedIdeas !== 'ideas' || normalizedCreaciones !== 'creaciones') {
        throw new Error("[Escenario 8] normalizeFunctionalityCode no debe modificar códigos ajenos a admin");
    }
    console.log("  ✓ Códigos ajenos a admin conservados intactos por normalizeFunctionalityCode.");

    simulatedCurrentTime = new Date('2026-11-05T13:30:00-06:00').getTime();
    const meRes = await makeRequest('GET', '/api/me', token10);
    if (meRes.status !== 200 || meRes.data?.user?.id !== 10) {
        throw new Error(`[Escenario 8 Session] Expected 200 on /api/me with valid JWT, got ${meRes.status}`);
    }
    console.log("  ✓ Sesión JWT preservada en /api/me con usuario autenticado aún con accesos vencidos.");

    console.log("\n======================================================================");
    console.log("  TODAS LAS PRUEBAS AUTOMATIZADAS DE RBAC PASARON EXITOSAMENTE (100%)");
    console.log("======================================================================\n");
    process.exit(0);
}

runTests().catch(err => {
    console.error("TEST SUITE FAILED:", err);
    process.exit(1);
});
