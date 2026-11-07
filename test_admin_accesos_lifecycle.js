const http = require('http');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { JSDOM } = require('jsdom');

// Isolated environment configuration
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'idealandia';
process.env.PORT = '3009';
process.env.AUTH_SECRET = 'test_secret_for_admin_accesos_lifecycle';
process.env.DB_TIMEZONE = '-06:00';

// In-memory test state for usuario_funcionalidades with unambiguous dates
let accessRecords = {
    101: {
        id: 101,
        usuario_id: 2,
        usuario_nombre: 'Usuario Dos',
        funcionalidad_id: 2,
        funcionalidad_nombre: 'Ideas',
        tipo_acceso: 'temporal',
        fecha_inicio: '2026-01-01 09:00:00',
        fecha_fin: '2030-01-01 18:00:00',
        estado: 'revocado',
        asignado_por_nombre: 'Admin'
    },
    106: {
        id: 106,
        usuario_id: 2,
        usuario_nombre: 'Usuario Dos',
        funcionalidad_id: 2,
        funcionalidad_nombre: 'Ideas',
        tipo_acceso: 'temporal',
        fecha_inicio: '2026-01-01 09:00:00',
        fecha_fin: '2026-01-02 18:00:00', // Vencido para prueba de edición
        estado: 'activo',
        asignado_por_nombre: 'Admin'
    },
    102: {
        id: 102,
        usuario_id: 2,
        usuario_nombre: 'Usuario Dos',
        funcionalidad_id: 2,
        funcionalidad_nombre: 'Ideas',
        tipo_acceso: 'temporal',
        fecha_inicio: '2026-01-01 09:00:00',
        fecha_fin: '2026-01-02 18:00:00', // Vencido para prueba de eliminación
        estado: 'activo',
        asignado_por_nombre: 'Admin'
    },
    103: {
        id: 103,
        usuario_id: 2,
        usuario_nombre: 'Usuario Dos',
        funcionalidad_id: 2,
        funcionalidad_nombre: 'Ideas',
        tipo_acceso: 'temporal',
        fecha_inicio: '2026-01-01 09:00:00',
        fecha_fin: '2030-01-01 18:00:00', // Activo vigente
        estado: 'activo',
        asignado_por_nombre: 'Admin'
    },
    104: {
        id: 104,
        usuario_id: 2,
        usuario_nombre: 'Usuario Dos',
        funcionalidad_id: 2,
        funcionalidad_nombre: 'Ideas',
        tipo_acceso: 'temporal',
        fecha_inicio: '2030-01-01 09:00:00', // Programado futuro
        fecha_fin: '2030-01-02 18:00:00',
        estado: 'activo',
        asignado_por_nombre: 'Admin'
    },
    105: {
        id: 105,
        usuario_id: 2,
        usuario_nombre: 'Usuario Dos',
        funcionalidad_id: 2,
        funcionalidad_nombre: 'Ideas',
        tipo_acceso: 'permanente',
        fecha_inicio: null,
        fecha_fin: null,
        estado: 'activo',
        asignado_por_nombre: 'Admin'
    }
};

// Users:
// User 1: Administrator (full access + admin.access)
// User 2: Auditor (has usuarios.read, but NO admin.access)
// User 3: Standard User (no admin role)
const mockUsers = {
    1: { id: 1, usuario: 'admin', jwt_version: 1 },
    2: { id: 2, usuario: 'auditor', jwt_version: 1 },
    3: { id: 3, usuario: 'normal', jwt_version: 1 }
};

// Mock mysql.createPool
const originalCreatePool = mysql.createPool;
mysql.createPool = function(config) {
    return {
        query: async function() { return [[]]; },
        execute: async function(sql, params = []) {
            const q = sql.trim().toUpperCase();

            // Session / timezone / ping
            if (q.includes("SET TIME_ZONE") || q.includes("SELECT 1")) {
                return [[]];
            }

            // User validation for JWT
            if (q.includes("FROM USUARIOS") && q.includes("WHERE ID = ?")) {
                const u = mockUsers[params[0]];
                if (u) return [[{ id: u.id, usuario: u.usuario, jwt_version: u.jwt_version, activo: 1 }]];
                return [[]];
            }

            // Functionality Level 2 check
            if (q.includes("UNION") && (q.includes("USUARIO_ROLES") || q.includes("USUARIO_FUNCIONALIDADES"))) {
                const uid = parseInt(params[0]);
                if (uid === 1 || uid === 2) {
                    // Admin & Auditor have Level 2 access to admin module
                    return [[{ id: 8, codigo: 'administracion', ruta: '/admin', funcionalidad_id: 8 }]];
                }
                return [[]]; // User 3 has NO access
            }

            // Level 3 permission check
            if (q.includes("FROM USUARIO_ROLES UR") && q.includes("WHERE UR.USUARIO_ID = ? AND P.CODIGO = ?")) {
                const uid = parseInt(params[0]);
                const perm = params[1];
                if (uid === 1) return [[{ id: 1, codigo: perm, nombre: perm }]]; // Admin has all perms
                if (uid === 2 && perm === 'usuarios.read') return [[{ id: 2, codigo: 'usuarios.read', nombre: 'usuarios.read' }]];
                return [[]]; // No admin.access for User 2 or 3
            }

            // Query accesos (GET /api/admin/accesos)
            if (q.includes("FROM USUARIO_FUNCIONALIDADES UF") && q.includes("ORDER BY UF.CREATED_AT DESC")) {
                return [Object.values(accessRecords)];
            }

            // SELECT for PUT or DELETE /api/admin/accesos/:id
            if (q.startsWith("SELECT") && q.includes("FROM USUARIO_FUNCIONALIDADES") && q.includes("WHERE ID = ?")) {
                const recId = parseInt(params[0]);
                const rec = accessRecords[recId];
                if (!rec) return [[]];

                const nowMs = Date.now();
                const isVencido = rec.tipo_acceso === 'temporal' && rec.fecha_fin && (new Date(rec.fecha_fin).getTime() < nowMs);
                return [[{
                    id: rec.id,
                    estado: rec.estado,
                    tipo_acceso: rec.tipo_acceso,
                    fecha_inicio: rec.fecha_inicio,
                    fecha_fin: rec.fecha_fin,
                    is_vencido: isVencido ? 1 : 0
                }]];
            }

            // UPDATE /api/admin/accesos/:id
            if (q.startsWith("UPDATE USUARIO_FUNCIONALIDADES SET TIPO_ACCESO = ?")) {
                const recId = parseInt(params[3]);
                if (accessRecords[recId]) {
                    accessRecords[recId].tipo_acceso = params[0];
                    accessRecords[recId].fecha_inicio = params[1];
                    accessRecords[recId].fecha_fin = params[2];
                    return [[{ affectedRows: 1 }]];
                }
                return [[{ affectedRows: 0 }]];
            }

            // DELETE /api/admin/accesos/:id
            if (q.startsWith("DELETE FROM USUARIO_FUNCIONALIDADES WHERE ID = ?")) {
                const recId = parseInt(params[0]);
                if (accessRecords[recId]) {
                    delete accessRecords[recId];
                    return [[{ affectedRows: 1 }]];
                }
                return [[{ affectedRows: 0 }]];
            }

            return [[]];
        },
        getConnection: async function() {
            return {
                beginTransaction: async () => {},
                commit: async () => {},
                rollback: async () => {},
                release: () => {},
                execute: async (sql, params) => this.execute(sql, params)
            };
        }
    };
};

// Require server with mocked pool
const app = require('./server').app;

function makeRequest(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Cookie'] = `auth_token=${token}`;
            headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: process.env.PORT,
            path,
            method,
            headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function runTests() {
    console.log('======================================================================');
    console.log('  SUITE DE PRUEBAS: REGLAS DE CICLO DE VIDA DE ACCESOS TEMPORALES');
    console.log('======================================================================\n');

    const adminToken = jwt.sign({ id: 1, usuario: 'admin', jwt_version: 1 }, process.env.AUTH_SECRET);
    const auditorToken = jwt.sign({ id: 2, usuario: 'auditor', jwt_version: 1 }, process.env.AUTH_SECRET);
    const userToken = jwt.sign({ id: 3, usuario: 'normal', jwt_version: 1 }, process.env.AUTH_SECRET);

    try {
        // ---------------------------------------------------------------------
        // 1. Edición de Accesos por Estatus (PUT /api/admin/accesos/:id)
        // ---------------------------------------------------------------------
        console.log('--- Bloque 1: Reglas de Edición (PUT /api/admin/accesos/:id) ---');

        // 1.1 Acceso REVOCADO: Debe rechazar edición con HTTP 400
        const editRevocado = await makeRequest('PUT', '/api/admin/accesos/101', {
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 10:00:00',
            fecha_fin: '2030-01-01 15:00:00'
        }, adminToken);

        if (editRevocado.status === 400 && editRevocado.data.error.includes('revocado')) {
            console.log('  ✓ [1.1] Edición de acceso REVOCADO rechazada con HTTP 400:', editRevocado.data.error);
        } else {
            throw new Error(`[1.1] Fallo: Esperado 400 para revocado, obtenido ${editRevocado.status} ${JSON.stringify(editRevocado.data)}`);
        }

        // 1.2 Acceso VENCIDO: Debe permitir edición con HTTP 200 (para extender o reactivar)
        const editVencido = await makeRequest('PUT', '/api/admin/accesos/106', {
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 09:00:00',
            fecha_fin: '2030-12-31 18:00:00'
        }, adminToken);

        if (editVencido.status === 200) {
            console.log('  ✓ [1.2] Edición de acceso VENCIDO permitida con HTTP 200 (ampliación de vigencia).');
        } else {
            throw new Error(`[1.2] Fallo: Esperado 200 para vencido, obtenido ${editVencido.status} ${JSON.stringify(editVencido.data)}`);
        }

        // 1.3 Acceso ACTIVO (Vigente): Debe permitir edición con HTTP 200
        const editActivo = await makeRequest('PUT', '/api/admin/accesos/103', {
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 11:00:00',
            fecha_fin: '2030-01-01 17:00:00'
        }, adminToken);

        if (editActivo.status === 200) {
            console.log('  ✓ [1.3] Edición de acceso ACTIVO permitida con HTTP 200.');
        } else {
            throw new Error(`[1.3] Fallo: Esperado 200 para activo, obtenido ${editActivo.status}`);
        }

        // ---------------------------------------------------------------------
        // 2. Eliminación de Accesos por Estatus (DELETE /api/admin/accesos/:id)
        // ---------------------------------------------------------------------
        console.log('\n--- Bloque 2: Reglas de Eliminación (DELETE /api/admin/accesos/:id) ---');

        // 2.1 Acceso ACTIVO (Vigente): NO debe poder eliminarse -> HTTP 400
        const delActivo = await makeRequest('DELETE', '/api/admin/accesos/103', null, adminToken);
        if (delActivo.status === 400 && delActivo.data.error.includes('vencido o revocado')) {
            console.log('  ✓ [2.1] Eliminación de acceso ACTIVO/VIGENTE rechazada con HTTP 400:', delActivo.data.error);
        } else {
            throw new Error(`[2.1] Fallo: Esperado 400 para activo vigente, obtenido ${delActivo.status}`);
        }

        // 2.2 Acceso PROGRAMADO (Futuro): NO debe poder eliminarse -> HTTP 400
        const delProgramado = await makeRequest('DELETE', '/api/admin/accesos/104', null, adminToken);
        if (delProgramado.status === 400 && delProgramado.data.error.includes('vencido o revocado')) {
            console.log('  ✓ [2.2] Eliminación de acceso PROGRAMADO (futuro) rechazada con HTTP 400.');
        } else {
            throw new Error(`[2.2] Fallo: Esperado 400 para programado, obtenido ${delProgramado.status}`);
        }

        // 2.3 Acceso PERMANENTE ACTIVO: NO debe poder eliminarse -> HTTP 400
        const delPermanente = await makeRequest('DELETE', '/api/admin/accesos/105', null, adminToken);
        if (delPermanente.status === 400 && delPermanente.data.error.includes('vencido o revocado')) {
            console.log('  ✓ [2.3] Eliminación de acceso PERMANENTE ACTIVO rechazada con HTTP 400.');
        } else {
            throw new Error(`[2.3] Fallo: Esperado 400 para permanente activo, obtenido ${delPermanente.status}`);
        }

        // 2.4 Acceso VENCIDO: SÍ debe poder eliminarse -> HTTP 200
        const delVencido = await makeRequest('DELETE', '/api/admin/accesos/102', null, adminToken);
        if (delVencido.status === 200) {
            console.log('  ✓ [2.4] Eliminación de acceso VENCIDO completada exitosamente con HTTP 200.');
            if (accessRecords[102]) throw new Error('[2.4] Fallo: Registro 102 aún existe en memoria!');
        } else {
            throw new Error(`[2.4] Fallo: Esperado 200 para vencido, obtenido ${delVencido.status} ${JSON.stringify(delVencido.data)}`);
        }

        // 2.5 Acceso REVOCADO: SÍ debe poder eliminarse -> HTTP 200
        const delRevocado = await makeRequest('DELETE', '/api/admin/accesos/101', null, adminToken);
        if (delRevocado.status === 200) {
            console.log('  ✓ [2.5] Eliminación de acceso REVOCADO completada exitosamente con HTTP 200.');
            if (accessRecords[101]) throw new Error('[2.5] Fallo: Registro 101 aún existe en memoria!');
        } else {
            throw new Error(`[2.5] Fallo: Esperado 200 para revocado, obtenido ${delRevocado.status}`);
        }

        // 2.6 Acceso INEXISTENTE: Debe responder HTTP 404
        const delInexistente = await makeRequest('DELETE', '/api/admin/accesos/999', null, adminToken);
        if (delInexistente.status === 404) {
            console.log('  ✓ [2.6] Eliminación de acceso inexistente respondió HTTP 404 correctamente.');
        } else {
            throw new Error(`[2.6] Fallo: Esperado 404 para inexistente, obtenido ${delInexistente.status}`);
        }

        // ---------------------------------------------------------------------
        // 3. Verificación de Seguridad y Autorizaciones RBAC
        // ---------------------------------------------------------------------
        console.log('\n--- Bloque 3: Seguridad y Autorizaciones RBAC ---');

        // 3.1 Usuario con acceso al módulo admin pero SIN permiso admin.access (Auditor)
        const auditorPut = await makeRequest('PUT', '/api/admin/accesos/103', { tipo_acceso: 'permanente' }, auditorToken);
        if (auditorPut.status === 403 && auditorPut.data.code === 'RBAC_PERMISSION_DENIED') {
            console.log('  ✓ [3.1] PUT rechazado a auditor sin admin.access (HTTP 403 RBAC_PERMISSION_DENIED).');
        } else {
            throw new Error(`[3.1] Fallo en RBAC PUT: obtenido ${auditorPut.status}`);
        }

        const auditorDel = await makeRequest('DELETE', '/api/admin/accesos/103', null, auditorToken);
        if (auditorDel.status === 403 && auditorDel.data.code === 'RBAC_PERMISSION_DENIED') {
            console.log('  ✓ [3.2] DELETE rechazado a auditor sin admin.access (HTTP 403 RBAC_PERMISSION_DENIED).');
        } else {
            throw new Error(`[3.2] Fallo en RBAC DELETE: obtenido ${auditorDel.status}`);
        }

        // 3.2 Usuario sin acceso a funcionalidad admin (Nivel 2 denegado)
        const userDel = await makeRequest('DELETE', '/api/admin/accesos/103', null, userToken);
        if (userDel.status === 403 && userDel.data.code === 'RBAC_ACCESS_DENIED') {
            console.log('  ✓ [3.3] DELETE rechazado a usuario sin funcionalidad admin (HTTP 403 RBAC_ACCESS_DENIED).');
        } else {
            throw new Error(`[3.3] Fallo en RBAC Nivel 2: obtenido ${userDel.status}`);
        }

        // ---------------------------------------------------------------------
        // 4. Verificación de Lógica de Interfaz de Usuario (JSDOM)
        // ---------------------------------------------------------------------
        console.log('\n--- Bloque 4: Verificación de Reglas de Interfaz (JSDOM) ---');

        const mockAccesosList = [
            { id: 201, usuario_nombre: 'U1', funcionalidad_nombre: 'F1', tipo_acceso: 'temporal', estado: 'revocado' },
            { id: 202, usuario_nombre: 'U2', funcionalidad_nombre: 'F2', tipo_acceso: 'temporal', estado: 'activo', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-02' }, // vencido
            { id: 203, usuario_nombre: 'U3', funcionalidad_nombre: 'F3', tipo_acceso: 'temporal', estado: 'activo', fecha_inicio: '2026-01-01', fecha_fin: '2030-01-01' }, // activo vigente
            { id: 204, usuario_nombre: 'U4', funcionalidad_nombre: 'F4', tipo_acceso: 'temporal', estado: 'activo', fecha_inicio: '2030-01-01', fecha_fin: '2030-01-02' }, // programado
            { id: 205, usuario_nombre: 'U5', funcionalidad_nombre: 'F5', tipo_acceso: 'permanente', estado: 'activo' } // permanente activo
        ];

        const dom = new JSDOM(`<!DOCTYPE html><html><body>
            <table><tbody id="admin-usuarios-tbody"></tbody></table>
            <table><tbody id="admin-roles-tbody"></tbody></table>
            <table><tbody id="admin-permisos-tbody"></tbody></table>
            <table><tbody id="admin-funcionalidades-tbody"></tbody></table>
            <table><tbody id="admin-menus-tbody"></tbody></table>
            <table><tbody id="admin-accesos-tbody"></tbody></table>
            <div id="custom-modal"><div id="custom-modal-message"></div><div id="custom-modal-buttons"></div></div>
        </body></html>`, { runScripts: "dangerously" });

        const { window } = dom;

        // Mock fetch en window para todos los módulos administrativos
        window.fetch = async (url) => {
            if (url === '/api/admin/accesos') {
                return { ok: true, json: async () => mockAccesosList };
            }
            if (url === '/api/admin/usuarios') {
                return { ok: true, json: async () => [{ id: 1, usuario: 'admin', nombre: 'Admin', email: 'admin@test.com' }] };
            }
            if (url === '/api/admin/roles') {
                return { ok: true, json: async () => [{ id: 1, nombre: 'administrador', descripcion: 'Admin', activo: 1 }] };
            }
            if (url === '/api/admin/permisos') {
                return { ok: true, json: async () => [{ id: 1, codigo: 'admin.access', nombre: 'Admin Access', descripcion: 'Full', activo: 1 }] };
            }
            if (url === '/api/admin/funcionalidades') {
                return { ok: true, json: async () => [{ id: 8, codigo: 'administracion', nombre: 'Administración', descripcion: 'Admin', activo: 1 }] };
            }
            if (url === '/api/admin/menus') {
                return { ok: true, json: async () => [{ id: 15, nombre: 'Administración', funcionalidad_id: 8, parent_id: null, orden: 7, publico: 0, activo: 1 }] };
            }
            return { ok: true, json: async () => ({}) };
        };

        // Cargar admin.js en el entorno JSDOM
        const fs = require('fs');
        const path = require('path');
        const adminJsCode = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');
        window.eval(adminJsCode);

        // Ejecutar loadAccesos
        await window.eval('loadAccesos()');

        const rows = window.document.querySelectorAll('#admin-accesos-tbody tr');
        if (rows.length !== 5) throw new Error(`Esperadas 5 filas, encontradas ${rows.length}`);

        // Fila 0: Revocado
        const rowRevocado = rows[0];
        const editBtnRevocado = Array.from(rowRevocado.querySelectorAll('button')).find(b => b.textContent === 'Editar');
        const delBtnRevocado = Array.from(rowRevocado.querySelectorAll('button')).find(b => b.textContent === 'Eliminar');
        if (!editBtnRevocado || !editBtnRevocado.disabled) throw new Error('[UI 4.1] El botón Editar en Revocado debe ser DISABLED');
        if (!delBtnRevocado) throw new Error('[UI 4.1] El botón Eliminar en Revocado debe estar PRESENTE');
        console.log('  ✓ [UI 4.1] Fila Revocado: Botón Editar está Disabled y Botón Eliminar está presente.');

        // Fila 1: Vencido
        const rowVencido = rows[1];
        const editBtnVencido = Array.from(rowVencido.querySelectorAll('button')).find(b => b.textContent === 'Editar');
        const delBtnVencido = Array.from(rowVencido.querySelectorAll('button')).find(b => b.textContent === 'Eliminar');
        if (!editBtnVencido || editBtnVencido.disabled) throw new Error('[UI 4.2] El botón Editar en Vencido debe estar HABILITADO');
        if (!delBtnVencido) throw new Error('[UI 4.2] El botón Eliminar en Vencido debe estar PRESENTE');
        console.log('  ✓ [UI 4.2] Fila Vencido: Botón Editar está habilitado y Botón Eliminar está presente.');

        // Fila 2: Activo Vigente
        const rowActivo = rows[2];
        const editBtnActivo = Array.from(rowActivo.querySelectorAll('button')).find(b => b.textContent === 'Editar');
        const delBtnActivo = Array.from(rowActivo.querySelectorAll('button')).find(b => b.textContent === 'Eliminar');
        if (!editBtnActivo || editBtnActivo.disabled) throw new Error('[UI 4.3] El botón Editar en Activo debe estar HABILITADO');
        if (delBtnActivo) throw new Error('[UI 4.3] El botón Eliminar en Activo Vigente NO debe estar presente');
        console.log('  ✓ [UI 4.3] Fila Activo Vigente: Botón Editar habilitado y Botón Eliminar oculto.');

        // Fila 3: Programado (Futuro)
        const rowProgramado = rows[3];
        const delBtnProgramado = Array.from(rowProgramado.querySelectorAll('button')).find(b => b.textContent === 'Eliminar');
        if (delBtnProgramado) throw new Error('[UI 4.4] El botón Eliminar en Programado NO debe estar presente');
        console.log('  ✓ [UI 4.4] Fila Programado: Botón Eliminar oculto.');

        // Fila 4: Permanente Activo
        const rowPermanente = rows[4];
        const delBtnPermanente = Array.from(rowPermanente.querySelectorAll('button')).find(b => b.textContent === 'Eliminar');
        if (delBtnPermanente) throw new Error('[UI 4.5] El botón Eliminar en Permanente Activo NO debe estar presente');
        console.log('  ✓ [UI 4.5] Fila Permanente Activo: Botón Eliminar oculto.');

        // 4.6 Guardia defensiva en showEditAccesoModal
        let modalShown = false;
        window.showModal = () => { modalShown = true; };
        window.eval('showEditAccesoModal({ id: 999, estado: "revocado" })');
        const modalOverlay = window.document.getElementById('custom-modal');
        if (modalOverlay.classList.contains('active')) {
            throw new Error('[UI 4.6] showEditAccesoModal no debe abrir el modal para registros revocados!');
        }
        console.log('  ✓ [UI 4.6] showEditAccesoModal bloqueó la invocación para registro revocado.');

        console.log('\n--- Bloque 5: Verificación del Sistema Homologado de Acciones Administrativas (UI/A11y) ---');

        // 5.1 Verificación de clases, tooltips, iconos y grupo en Accesos Temporales
        const actionsGroupAcceso = rowRevocado.querySelector('.admin-actions-group');
        if (!actionsGroupAcceso) throw new Error('[UI 5.1] Falta contenedor .admin-actions-group en fila de accesos');
        if (!editBtnRevocado.classList.contains('admin-action-btn') || !editBtnRevocado.classList.contains('admin-action-btn--edit')) {
            throw new Error('[UI 5.1] Botón Editar debe tener clases .admin-action-btn y .admin-action-btn--edit');
        }
        if (!editBtnRevocado.getAttribute('title') || !editBtnRevocado.getAttribute('aria-label')) {
            throw new Error('[UI 5.1] Botón Editar debe tener atributos title y aria-label para accesibilidad');
        }
        if (!editBtnRevocado.querySelector('i.fa-pen')) {
            throw new Error('[UI 5.1] Botón Editar debe renderizar el icono FontAwesome fa-pen');
        }
        if (!delBtnRevocado.classList.contains('admin-action-btn--delete') || !delBtnRevocado.querySelector('i.fa-trash-can')) {
            throw new Error('[UI 5.1] Botón Eliminar debe tener clase .admin-action-btn--delete e icono fa-trash-can');
        }
        console.log('  ✓ [UI 5.1] Accesos Temporales: Clases .admin-actions-group, .admin-action-btn, tooltips, a11y e iconos verificados.');

        // 5.2 Homologación en Módulo Usuarios
        await window.eval('loadUsuarios()');
        const rowUsuario = window.document.querySelector('#admin-usuarios-tbody tr');
        if (!rowUsuario) throw new Error('[UI 5.2] No se renderizó fila en Usuarios');
        const userActionsGroup = rowUsuario.querySelector('.admin-actions-group');
        const userEditBtn = userActionsGroup ? userActionsGroup.querySelector('.admin-action-btn--edit') : null;
        const userDelBtn = userActionsGroup ? userActionsGroup.querySelector('.admin-action-btn--delete') : null;
        const userRolesPill = rowUsuario.querySelector('.admin-pill-btn');
        if (!userActionsGroup || !userEditBtn || !userDelBtn || !userRolesPill) {
            throw new Error('[UI 5.2] Usuarios debe tener .admin-actions-group con edit, delete y .admin-pill-btn para roles');
        }
        console.log('  ✓ [UI 5.2] Módulo Usuarios: Acciones homologadas (.admin-action-btn--edit, .admin-action-btn--delete) y .admin-pill-btn verificados.');

        // 5.3 Homologación en Módulo Roles
        await window.eval('loadRoles()');
        const rowRol = window.document.querySelector('#admin-roles-tbody tr');
        if (!rowRol) throw new Error('[UI 5.3] No se renderizó fila en Roles');
        const rolActionsGroup = rowRol.querySelector('.admin-actions-group');
        const rolEditBtn = rolActionsGroup ? rolActionsGroup.querySelector('.admin-action-btn--edit') : null;
        const rolDelBtn = rolActionsGroup ? rolActionsGroup.querySelector('.admin-action-btn--delete') : null;
        const rolPermsPill = rowRol.querySelector('.admin-pill-btn');
        if (!rolActionsGroup || !rolEditBtn || !rolDelBtn || !rolPermsPill) {
            throw new Error('[UI 5.3] Roles debe tener .admin-actions-group con edit, delete y .admin-pill-btn para permisos');
        }
        console.log('  ✓ [UI 5.3] Módulo Roles: Acciones homologadas y botón píldora de permisos verificados.');

        // 5.4 Homologación en Módulo Permisos
        await window.eval('loadPermisos()');
        const rowPermiso = window.document.querySelector('#admin-permisos-tbody tr');
        if (!rowPermiso) throw new Error('[UI 5.4] No se renderizó fila en Permisos');
        const permActionsGroup = rowPermiso.querySelector('.admin-actions-group');
        const permEditBtn = permActionsGroup ? permActionsGroup.querySelector('.admin-action-btn--edit') : null;
        const permDelBtn = permActionsGroup ? permActionsGroup.querySelector('.admin-action-btn--delete') : null;
        if (!permActionsGroup || !permEditBtn || !permDelBtn) {
            throw new Error('[UI 5.4] Permisos debe tener .admin-actions-group con botones edit y delete');
        }
        console.log('  ✓ [UI 5.4] Módulo Permisos: Acciones homologadas verificadas.');

        // 5.5 Homologación en Módulo Funcionalidades
        await window.eval('loadFuncionalidades()');
        const rowFunc = window.document.querySelector('#admin-funcionalidades-tbody tr');
        if (!rowFunc) throw new Error('[UI 5.5] No se renderizó fila en Funcionalidades');
        const funcActionsGroup = rowFunc.querySelector('.admin-actions-group');
        const funcEditBtn = funcActionsGroup ? funcActionsGroup.querySelector('.admin-action-btn--edit') : null;
        const funcPermsBtn = funcActionsGroup ? funcActionsGroup.querySelector('.admin-action-btn--perms') : null;
        const funcDelBtn = funcActionsGroup ? funcActionsGroup.querySelector('.admin-action-btn--delete') : null;
        if (!funcActionsGroup || !funcEditBtn || !funcPermsBtn || !funcDelBtn) {
            throw new Error('[UI 5.5] Funcionalidades debe tener .admin-actions-group con edit, perms y delete');
        }
        console.log('  ✓ [UI 5.5] Módulo Funcionalidades: Barra compacta de acciones (edit, perms, delete) verificada.');

        // 5.6 Homologación en Módulo Menús
        await window.eval('loadMenus()');
        const rowMenu = window.document.querySelector('#admin-menus-tbody tr');
        if (!rowMenu) throw new Error('[UI 5.6] No se renderizó fila en Menús');
        const menuActionsGroup = rowMenu.querySelector('.admin-actions-group');
        const menuEditBtn = menuActionsGroup ? menuActionsGroup.querySelector('.admin-action-btn--edit') : null;
        const menuToggleBtn = menuActionsGroup ? menuActionsGroup.querySelector('.admin-action-btn--toggle-active, .admin-action-btn--toggle-inactive') : null;
        const menuDelBtn = menuActionsGroup ? menuActionsGroup.querySelector('.admin-action-btn--delete') : null;
        if (!menuActionsGroup || !menuEditBtn || !menuToggleBtn || !menuDelBtn) {
            throw new Error('[UI 5.6] Menús debe tener .admin-actions-group con edit, toggle y delete');
        }
        console.log('  ✓ [UI 5.6] Módulo Menús: Acciones homologadas (edit, toggle con icono interactivo, delete) verificadas.');

        console.log('\n======================================================================');
        console.log('  ✅ TODAS LAS PRUEBAS DE CICLO DE VIDA, RBAC Y HOMOLOGACIÓN DE ACCIONES PASARON CON ÉXITO (100%)');
        console.log('======================================================================');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ ERROR EN SUITE DE PRUEBAS:', err.message);
        process.exit(1);
    }
}

// Start test execution
runTests();
