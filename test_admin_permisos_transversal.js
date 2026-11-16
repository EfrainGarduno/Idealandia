// =============================================================================
// Test Suite: Matriz Transversal de Permisos Administrativos y Asociados
// Cobertura:
//  - Escenario A: Usuario A (Administrador Completo)
//  - Escenario B: Usuario B (Administración + solo Asociados Consulta)
//    * No carga Usuarios ni hace fetch a /api/admin/usuarios
//    * No carga Roles, Permisos, Funcionalidades, Menús, Accesos
//    * Selecciona y carga automáticamente la primera pestaña autorizada: Asociados
//    * Acciones restringidas (autorizar, rechazar, pedir_info) devuelven 403 y
//      muestran "Acceso no autorizado o vencido para esta funcionalidad."
//  - Escenario C: Usuario C (Administración + Usuarios Consulta)
//    * Solo pestaña Usuarios visible y activa; Asociados bloqueado
//  - Escenario D: Usuario D (Sin acceso a Administración)
//    * /api/admin/mis-permisos responde 403; UI cierra sección admin
//  - Escenario E: Aislamiento estricto de DOM y prevención de datos en caché
// =============================================================================

require('dotenv').config();
const PORT = 3098;
process.env.PORT = String(PORT);

const assert = require('assert');
const http = require('http');
const mysql = require('mysql2/promise');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const serverExports = require('./server');
const app = serverExports.app;

let pool;
let userA_Token = '';
let userB_Token = '';
let userC_Token = '';
let userD_Token = '';

const testPrefix = `test_perm_${Date.now()}`;
const createdUserIds = [];
const createdRoleIds = [];
const createdAccessIds = [];

function request(method, reqPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: reqPath,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        if (payload) {
            options.headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(resData);
                } catch (e) {
                    parsed = resData;
                }
                resolve({
                    status: res.status || res.statusCode,
                    headers: res.headers,
                    data: parsed
                });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('================================================================');
    console.log('🚀 INICIANDO PRUEBAS DE PERMISOS ADMINISTRATIVOS TRANSVERSALES');
    console.log('================================================================');

    pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia_dev',
        waitForConnections: true,
        connectionLimit: 5
    });

    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(`✓ Conectado a base de datos y servidor listo en puerto ${PORT}`);

    try {
        // 1. Obtener ID de funcionalidad 'administracion'
        const [funcRows] = await pool.query(
            "SELECT id, codigo FROM funcionalidades WHERE codigo IN ('admin', 'administracion') LIMIT 1"
        );
        assert(funcRows.length > 0, "Debe existir funcionalidad administracion en la BD");
        const adminFuncId = funcRows[0].id;

        // 2. Obtener IDs de permisos necesarios
        const [permRows] = await pool.query(
            "SELECT id, codigo FROM permisos WHERE codigo IN ('asociados.read', 'usuarios.read', 'asociados.autorizar', 'asociados.rechazar', 'asociados.pedir_informacion')"
        );
        const permMap = {};
        permRows.forEach(p => { permMap[p.codigo] = p.id; });
        assert(permMap['asociados.read'], "Permiso asociados.read debe existir");
        assert(permMap['usuarios.read'], "Permiso usuarios.read debe existir");

        // 3. Crear Usuario A: Administrador Completo
        const [adminRows] = await pool.query(
            `SELECT u.id, u.usuario FROM usuarios u
             INNER JOIN usuario_roles ur ON u.id = ur.usuario_id
             INNER JOIN roles r ON ur.rol_id = r.id
             WHERE r.nombre = 'administrador' AND u.activo = 1 LIMIT 1`
        );
        assert(adminRows.length > 0, "Debe existir al menos un administrador");
        const userA_Id = adminRows[0].id;
        userA_Token = jwt.sign(
            { id: userA_Id, usuario: adminRows[0].usuario, rol: 'administrador', jwt_version: 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // 4. Crear Usuario B: Solo Administración + Asociados Consulta (vía rol específico)
        const [roleBRes] = await pool.query(
            "INSERT INTO roles (nombre, descripcion, activo) VALUES (?, ?, 1)",
            [`rol_b_${testPrefix}`, 'Rol solo asociados consulta']
        );
        const roleB_Id = roleBRes.insertId;
        createdRoleIds.push(roleB_Id);

        // Asignar permiso asociados.read al rol B
        await pool.query(
            "INSERT INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)",
            [roleB_Id, permMap['asociados.read']]
        );

        // Insertar usuario B
        const [userBRes] = await pool.query(
            "INSERT INTO usuarios (usuario, password_hash, nombre, email, activo) VALUES (?, 'hash', 'Usuario B', ?, 1)",
            [`user_b_${testPrefix}`, `user_b_${testPrefix}@test.com`]
        );
        const userB_Id = userBRes.insertId;
        createdUserIds.push(userB_Id);

        // Asignar rol B y acceso a funcionalidad administracion
        await pool.query("INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)", [userB_Id, roleB_Id]);
        const [accB] = await pool.query(
            "INSERT INTO usuario_funcionalidades (usuario_id, funcionalidad_id, tipo_acceso, estado, asignado_por) VALUES (?, ?, 'permanente', 'activo', ?)",
            [userB_Id, adminFuncId, userA_Id]
        );
        createdAccessIds.push(accB.insertId);

        userB_Token = jwt.sign(
            { id: userB_Id, usuario: `user_b_${testPrefix}`, rol: `rol_b_${testPrefix}`, jwt_version: 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // 5. Crear Usuario C: Administración + Usuarios Consulta
        const [roleCRes] = await pool.query(
            "INSERT INTO roles (nombre, descripcion, activo) VALUES (?, ?, 1)",
            [`rol_c_${testPrefix}`, 'Rol solo usuarios consulta']
        );
        const roleC_Id = roleCRes.insertId;
        createdRoleIds.push(roleC_Id);

        await pool.query(
            "INSERT INTO rol_permisos (rol_id, permiso_id) VALUES (?, ?)",
            [roleC_Id, permMap['usuarios.read']]
        );

        const [userCRes] = await pool.query(
            "INSERT INTO usuarios (usuario, password_hash, nombre, email, activo) VALUES (?, 'hash', 'Usuario C', ?, 1)",
            [`user_c_${testPrefix}`, `user_c_${testPrefix}@test.com`]
        );
        const userC_Id = userCRes.insertId;
        createdUserIds.push(userC_Id);

        await pool.query("INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)", [userC_Id, roleC_Id]);
        const [accC] = await pool.query(
            "INSERT INTO usuario_funcionalidades (usuario_id, funcionalidad_id, tipo_acceso, estado, asignado_por) VALUES (?, ?, 'permanente', 'activo', ?)",
            [userC_Id, adminFuncId, userA_Id]
        );
        createdAccessIds.push(accC.insertId);

        userC_Token = jwt.sign(
            { id: userC_Id, usuario: `user_c_${testPrefix}`, rol: `rol_c_${testPrefix}`, jwt_version: 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // 6. Crear Usuario D: Usuario estándar sin acceso a Administración
        const [userDRes] = await pool.query(
            "INSERT INTO usuarios (usuario, password_hash, nombre, email, activo) VALUES (?, 'hash', 'Usuario D', ?, 1)",
            [`user_d_${testPrefix}`, `user_d_${testPrefix}@test.com`]
        );
        const userD_Id = userDRes.insertId;
        createdUserIds.push(userD_Id);

        userD_Token = jwt.sign(
            { id: userD_Id, usuario: `user_d_${testPrefix}`, rol: 'usuario', jwt_version: 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        console.log('✓ Usuarios de prueba A, B, C y D creados y configurados con RBAC.');

        // =====================================================================
        // TEST BACKEND: Endpoint /api/admin/mis-permisos
        // =====================================================================
        console.log('\n--- TEST 1: Endpoint /api/admin/mis-permisos ---');
        
        // Usuario A (admin): retorna permisos completos incluyendo asociados.read y usuarios.read
        const resPermsA = await request('GET', '/api/admin/mis-permisos', null, {
            'Cookie': `auth_token=${userA_Token}`
        });
        assert.strictEqual(resPermsA.status, 200);
        assert(Array.isArray(resPermsA.data.permisos));
        assert(resPermsA.data.permisos.includes('usuarios.read'));
        assert(resPermsA.data.permisos.includes('asociados.read'));
        console.log('  ✓ Usuario A recibe permisos completos.');

        // Usuario B: debe recibir únicamente asociados.read
        const resPermsB = await request('GET', '/api/admin/mis-permisos', null, {
            'Cookie': `auth_token=${userB_Token}`
        });
        assert.strictEqual(resPermsB.status, 200);
        assert(resPermsB.data.permisos.includes('asociados.read'));
        assert(!resPermsB.data.permisos.includes('usuarios.read'));
        assert(!resPermsB.data.permisos.includes('asociados.autorizar'));
        console.log('  ✓ Usuario B recibe únicamente asociados.read.');

        // Usuario C: debe recibir únicamente usuarios.read
        const resPermsC = await request('GET', '/api/admin/mis-permisos', null, {
            'Cookie': `auth_token=${userC_Token}`
        });
        assert.strictEqual(resPermsC.status, 200);
        assert(resPermsC.data.permisos.includes('usuarios.read'));
        assert(!resPermsC.data.permisos.includes('asociados.read'));
        console.log('  ✓ Usuario C recibe únicamente usuarios.read.');

        // Usuario D: sin acceso a administracion -> 403
        const resPermsD = await request('GET', '/api/admin/mis-permisos', null, {
            'Cookie': `auth_token=${userD_Token}`
        });
        assert.strictEqual(resPermsD.status, 403);
        assert.strictEqual(resPermsD.data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        assert.strictEqual(resPermsD.data.code, 'RBAC_ACCESS_DENIED');
        console.log('  ✓ Usuario D rechazado con HTTP 403 RBAC_ACCESS_DENIED y mensaje estándar.');

        // =====================================================================
        // TEST BACKEND: Seguridad Estricta de Endpoints sin Permiso
        // =====================================================================
        console.log('\n--- TEST 2: Protección de Endpoints Backend y Mensajes Limpios ---');

        // Usuario B intenta llamar /api/admin/usuarios -> DEBE RECIBIR 403
        const resB_Users = await request('GET', '/api/admin/usuarios', null, {
            'Cookie': `auth_token=${userB_Token}`
        });
        assert.strictEqual(resB_Users.status, 403);
        assert.strictEqual(resB_Users.data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        assert.strictEqual(resB_Users.data.code, 'RBAC_PERMISSION_DENIED');
        assert.strictEqual(resB_Users.data.permiso, 'usuarios.read');
        console.log('  ✓ Usuario B a /api/admin/usuarios: Rechazado con 403 y mensaje limpio sin tecnicismos.');

        // Usuario B intenta acciones de Asociados (autorizar, rechazar, mas-info) -> DEBE RECIBIR 403
        const resB_Aut = await request('POST', '/api/admin/asociados/999/autorizar', {}, {
            'Cookie': `auth_token=${userB_Token}`
        });
        assert.strictEqual(resB_Aut.status, 403);
        assert.strictEqual(resB_Aut.data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        assert.strictEqual(resB_Aut.data.code, 'RBAC_PERMISSION_DENIED');
        assert.strictEqual(resB_Aut.data.permiso, 'asociados.autorizar');
        console.log('  ✓ Usuario B a autorizar: Rechazado con 403 y mensaje estándar.');

        const resB_Rech = await request('POST', '/api/admin/asociados/999/rechazar', { observaciones: 'test' }, {
            'Cookie': `auth_token=${userB_Token}`
        });
        assert.strictEqual(resB_Rech.status, 403);
        assert.strictEqual(resB_Rech.data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        assert.strictEqual(resB_Rech.data.code, 'RBAC_PERMISSION_DENIED');
        assert.strictEqual(resB_Rech.data.permiso, 'asociados.rechazar');
        console.log('  ✓ Usuario B a rechazar: Rechazado con 403 y mensaje estándar.');

        const resB_Info = await request('POST', '/api/admin/asociados/999/mas-informacion', { observaciones: 'test' }, {
            'Cookie': `auth_token=${userB_Token}`
        });
        assert.strictEqual(resB_Info.status, 403);
        assert.strictEqual(resB_Info.data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        assert.strictEqual(resB_Info.data.code, 'RBAC_PERMISSION_DENIED');
        assert.strictEqual(resB_Info.data.permiso, 'asociados.pedir_informacion');
        console.log('  ✓ Usuario B a pedir mas-info: Rechazado con 403 y mensaje estándar.');

        // Usuario C intenta llamar /api/admin/asociados -> DEBE RECIBIR 403
        const resC_Asoc = await request('GET', '/api/admin/asociados', null, {
            'Cookie': `auth_token=${userC_Token}`
        });
        assert.strictEqual(resC_Asoc.status, 403);
        assert.strictEqual(resC_Asoc.data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        console.log('  ✓ Usuario C a /api/admin/asociados: Rechazado con 403 y mensaje estándar.');

        // =====================================================================
        // TEST FRONTEND / JSDOM: Carga Inteligente de Módulos y Pestañas
        // =====================================================================
        console.log('\n--- TEST 3: Interfaz y Comportamiento DOM de Pestañas en JSDOM ---');

        const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const adminJsContent = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');

        // Helper para inicializar JSDOM simulando un usuario específico
        function createAdminDOM(userToken, userPerms) {
            const dom = new JSDOM(htmlContent, {
                runScripts: "dangerously",
                url: "http://localhost/"
            });
            const { window } = dom;

            let fetchCalls = [];
            let modalCalls = [];

            window.showModal = (msg) => { modalCalls.push(msg); };
            window.showConfirm = (msg) => Promise.resolve(true);

            window.fetch = async (url, opts = {}) => {
                fetchCalls.push(url);
                if (url === '/api/admin/mis-permisos') {
                    if (!userPerms) {
                        return {
                            status: 403,
                            ok: false,
                            json: async () => ({ error: 'Acceso no autorizado o vencido para esta funcionalidad.', code: 'RBAC_ACCESS_DENIED' })
                        };
                    }
                    return {
                        status: 200,
                        ok: true,
                        json: async () => ({ permisos: userPerms })
                    };
                }
                if (url === '/api/admin/usuarios') {
                    if (userPerms && userPerms.includes('usuarios.read')) {
                        return {
                            status: 200,
                            ok: true,
                            json: async () => [
                                { id: 1, usuario: 'admin', nombre: 'Admin Master', email: 'admin@test.com', activo: 1 }
                            ]
                        };
                    }
                    return {
                        status: 403,
                        ok: false,
                        json: async () => ({ error: 'Acceso no autorizado o vencido para esta funcionalidad.', code: 'RBAC_PERMISSION_DENIED', permiso: 'usuarios.read' })
                    };
                }
                if (url.startsWith('/api/admin/asociados')) {
                    if (userPerms && userPerms.includes('asociados.read')) {
                        return {
                            status: 200,
                            ok: true,
                            json: async () => [
                                { id: 10, nombre: 'Candidato Asoc', usuario: 'asoc1', email: 'asoc1@test.com', estatus: 'por_aprobar' }
                            ]
                        };
                    }
                    return {
                        status: 403,
                        ok: false,
                        json: async () => ({ error: 'Acceso no autorizado o vencido para esta funcionalidad.', code: 'RBAC_PERMISSION_DENIED', permiso: 'asociados.read' })
                    };
                }
                return {
                    status: 200,
                    ok: true,
                    json: async () => []
                };
            };

            window.eval(adminJsContent);
            if (typeof window.initAdminTabs === 'function') {
                window.initAdminTabs();
            }
            window.showConfirm = () => Promise.resolve(true);
            window.showModal = (msg) => {
                modalCalls.push(msg);
                return Promise.resolve(true);
            };
            return { window, dom, fetchCalls, modalCalls };
        }

        // --- SUBTEST 3.1: Usuario B (Solo Asociados Consulta) ---
        console.log('\n  -> [Subtest 3.1] Usuario B abre Administración:');
        const domB = createAdminDOM(userB_Token, ['asociados.read']);
        const winB = domB.window;

        // Simular que se muestra la sección admin
        const adminSecB = winB.document.getElementById('admin');
        adminSecB.style.display = 'flex';
        await winB.syncAdminTabsAndPermissions();

        // 1. Validar pestañas visibles vs ocultas
        const btnUsuariosB = winB.document.querySelector('.admin-tab-btn[data-tab="admin-usuarios"]');
        const btnAsociadosB = winB.document.querySelector('.admin-tab-btn[data-tab="admin-asociados"]');
        const btnRolesB = winB.document.querySelector('.admin-tab-btn[data-tab="admin-roles"]');
        const btnPermisosB = winB.document.querySelector('.admin-tab-btn[data-tab="admin-permisos"]');

        assert.strictEqual(btnUsuariosB.style.display, 'none', 'Pestaña Usuarios debe estar oculta para Usuario B');
        assert.strictEqual(btnRolesB.style.display, 'none', 'Pestaña Roles debe estar oculta para Usuario B');
        assert.strictEqual(btnPermisosB.style.display, 'none', 'Pestaña Permisos debe estar oculta para Usuario B');
        assert.strictEqual(btnAsociadosB.style.display, '', 'Pestaña Asociados debe estar VISIBLE para Usuario B');
        assert(btnAsociadosB.classList.contains('active'), 'Pestaña Asociados debe estar ACTIVA automáticamente');

        // 2. Comprobar que NO se llamó al endpoint de Usuarios ni se renderizó nada en Usuarios
        const usersFetchCalled = domB.fetchCalls.some(url => url === '/api/admin/usuarios');
        assert.strictEqual(usersFetchCalled, false, '¡CRUCIAL! /api/admin/usuarios NUNCA debe ser consultado por Usuario B');
        
        const tbodyUsuariosB = winB.document.getElementById('admin-usuarios-tbody');
        assert.strictEqual(tbodyUsuariosB.innerHTML, '', 'La tabla de usuarios DEBE estar vacía (0 filas)');

        // 3. Comprobar que SÍ se llamó al endpoint de Asociados y se renderizó
        const asocFetchCalled = domB.fetchCalls.some(url => url.startsWith('/api/admin/asociados'));
        assert(asocFetchCalled, '/api/admin/asociados debió ser consultado');
        const tbodyAsocB = winB.document.getElementById('admin-asociados-tbody');
        assert(tbodyAsocB.children.length > 0, 'La tabla de asociados debe tener las filas renderizadas');

        // 4. Intentar forzar clic en pestaña Usuarios
        btnUsuariosB.removeAttribute('disabled');
        btnUsuariosB.click();
        assert.strictEqual(domB.fetchCalls.some(url => url === '/api/admin/usuarios'), false, 'Clic forzado en Usuarios no debe disparar fetch');
        const modalMsgB = (winB.document.getElementById('custom-modal-message') && winB.document.getElementById('custom-modal-message').textContent) || '';
        assert(domB.modalCalls.includes('Acceso no autorizado o vencido para esta funcionalidad.') || modalMsgB.includes('Acceso no autorizado o vencido para esta funcionalidad.'), 'Debe mostrar modal no autorizado');

        // 5. Intentar invocación directa a loadUsuarios() por script
        await winB.loadUsuarios();
        assert.strictEqual(domB.fetchCalls.some(url => url === '/api/admin/usuarios'), false, 'loadUsuarios() directo no debe disparar fetch');
        assert.strictEqual(tbodyUsuariosB.innerHTML, '', 'Tabla de usuarios debe permanecer completamente vacía');

        console.log('  ✓ Usuario B: Asociados cargado automáticamente, Usuarios nunca consultado, tabla de usuarios limpia.');

        // --- SUBTEST 3.2: Usuario B ejecuta acciones en Asociados ---
        console.log('\n  -> [Subtest 3.2] Usuario B intenta acciones sin permiso en Asociados:');
        domB.modalCalls.length = 0;

        // Mock de fetch para simular 403 en acciones
        const prevFetch = winB.fetch;
        winB.fetch = async (url, opts = {}) => {
            if (url.includes('/autorizar') || url.includes('/rechazar') || url.includes('/mas-informacion')) {
                return {
                    status: 403,
                    ok: false,
                    json: async () => ({
                        error: 'Acceso no autorizado o vencido para esta funcionalidad.',
                        code: 'RBAC_PERMISSION_DENIED'
                    })
                };
            }
            return prevFetch(url, opts);
        };

        winB.showConfirm = () => Promise.resolve(true);
        winB.showModal = (msg) => {
            domB.modalCalls.push(msg);
            return Promise.resolve(true);
        };

        await winB.autorizarAsociado({ id: 10, nombre: 'Candidato Asoc', correo_validado: 1 });
        const modalMsgAut = (winB.document.getElementById('custom-modal-message') && winB.document.getElementById('custom-modal-message').textContent) || '';
        assert(domB.modalCalls.includes('Acceso no autorizado o vencido para esta funcionalidad.') || modalMsgAut.includes('Acceso no autorizado o vencido para esta funcionalidad.'), 'Autorizar sin permiso debe mostrar mensaje amigable estándar');
        assert(!domB.modalCalls.some(m => m.includes('Permiso denegado')) && !modalMsgAut.includes('Permiso denegado'), 'NO debe mostrar "Permiso denegado"');

        console.log('  ✓ Acciones de Asociados sin permiso muestran mensaje homologado sin tecnicismos.');

        // --- SUBTEST 3.3: Usuario C (Administración + Usuarios Consulta) ---
        console.log('\n  -> [Subtest 3.3] Usuario C abre Administración:');
        const domC = createAdminDOM(userC_Token, ['usuarios.read']);
        const winC = domC.window;

        const adminSecC = winC.document.getElementById('admin');
        adminSecC.style.display = 'flex';
        await winC.syncAdminTabsAndPermissions();

        const btnUsuariosC = winC.document.querySelector('.admin-tab-btn[data-tab="admin-usuarios"]');
        const btnAsociadosC = winC.document.querySelector('.admin-tab-btn[data-tab="admin-asociados"]');

        assert.strictEqual(btnUsuariosC.style.display, '', 'Pestaña Usuarios debe estar visible para Usuario C');
        assert(btnUsuariosC.classList.contains('active'), 'Pestaña Usuarios debe ser la activa');
        assert.strictEqual(btnAsociadosC.style.display, 'none', 'Pestaña Asociados debe estar oculta para Usuario C');

        const usersFetchCalledC = domC.fetchCalls.some(url => url === '/api/admin/usuarios');
        assert(usersFetchCalledC, '/api/admin/usuarios debió ser consultado');
        const asocFetchCalledC = domC.fetchCalls.some(url => url.startsWith('/api/admin/asociados'));
        assert.strictEqual(asocFetchCalledC, false, '/api/admin/asociados NUNCA debió ser consultado por Usuario C');

        console.log('  ✓ Usuario C: Usuarios cargado automáticamente, Asociados oculto y nunca consultado.');

        // --- SUBTEST 3.4: Usuario D (Sin acceso a Administración) ---
        console.log('\n  -> [Subtest 3.4] Usuario D intenta abrir Administración:');
        const domD = createAdminDOM(userD_Token, null);
        const winD = domD.window;

        const adminSecD = winD.document.getElementById('admin');
        adminSecD.style.display = 'flex';
        await winD.syncAdminTabsAndPermissions();

        assert.strictEqual(adminSecD.style.display, 'none', 'Sección admin debe ocultarse automáticamente');
        const modalMsgD = (winD.document.getElementById('custom-modal-message') && winD.document.getElementById('custom-modal-message').textContent) || '';
        assert(domD.modalCalls.includes('Acceso no autorizado o vencido para esta funcionalidad.') || modalMsgD.includes('Acceso no autorizado o vencido para esta funcionalidad.'), 'Debe notificar al usuario');
        console.log('  ✓ Usuario D: Bloqueado completamente de la administración.');

        // --- SUBTEST 3.5: Prevención de Datos en Caché / Limpieza al cambiar de usuario ---
        console.log('\n  -> [Subtest 3.5] Verificación de limpieza estricta de DOM y caché entre sesiones:');
        // Partimos de un DOM con datos cargados en usuarios
        const domE = createAdminDOM(userA_Token, ['usuarios.read', 'asociados.read']);
        const winE = domE.window;
        await winE.loadUsuarios();
        assert(winE.document.getElementById('admin-usuarios-tbody').children.length > 0, 'La tabla de usuarios debe tener filas cargadas inicialmente');

        // Simulamos que el usuario cierra admin o cambia a sesión restringida
        winE.clearAllAdminTables();
        assert.strictEqual(winE.document.getElementById('admin-usuarios-tbody').innerHTML, '', 'clearAllAdminTables debe limpiar inmediatamente tbody de usuarios');
        assert.strictEqual(winE.document.getElementById('admin-asociados-tbody').innerHTML, '', 'clearAllAdminTables debe limpiar inmediatamente tbody de asociados');

        console.log('  ✓ Limpieza de memoria y DOM garantizada al cerrar administración o cambiar permisos.');

        console.log('\n================================================================');
        console.log('🎉 TODAS LAS PRUEBAS DE LA MATRIZ DE PERMISOS PASARON CON ÉXITO');
        console.log('================================================================');

    } catch (err) {
        console.error('❌ Error capturado en runTests:', err);
        throw err;
    } finally {
        // Limpiar datos de prueba de MySQL
        console.log('\n🧹 Limpiando registros de prueba creados...');
        if (createdAccessIds.length > 0) {
            await pool.query(`DELETE FROM usuario_funcionalidades WHERE id IN (${createdAccessIds.join(',')})`);
        }
        if (createdUserIds.length > 0) {
            await pool.query(`DELETE FROM usuario_roles WHERE usuario_id IN (${createdUserIds.join(',')})`);
            await pool.query(`DELETE FROM usuarios WHERE id IN (${createdUserIds.join(',')})`);
        }
        if (createdRoleIds.length > 0) {
            await pool.query(`DELETE FROM rol_permisos WHERE rol_id IN (${createdRoleIds.join(',')})`);
            await pool.query(`DELETE FROM roles WHERE id IN (${createdRoleIds.join(',')})`);
        }
        await pool.end();
        console.log('✓ Base de datos limpia.');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('❌ Error en pruebas:', err);
    process.exit(1);
});
