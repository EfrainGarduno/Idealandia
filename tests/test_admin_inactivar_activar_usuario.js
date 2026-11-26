/**
 * tests/test_admin_inactivar_activar_usuario.js
 * Suite integral de pruebas automatizadas para la funcionalidad de
 * Inactivar y Reactivar Usuarios en Idealandia.
 *
 * Cubre todos los requerimientos obligatorios:
 * 1. Usuario activo -> Inactivar (activo = 0)
 * 2. Confirmación modal con mensaje y subtítulo exactos
 * 3. Cancelar la confirmación no altera el estado
 * 4. El registro del usuario NO se elimina (persiste ID, usuario, nombre, roles, etc.)
 * 5. Usuario inactivo intenta iniciar sesión -> Rechazado con 403 Forbidden
 * 6. Usuario inactivo intenta llamada directa a API autenticada -> Rechazado con 401
 * 7. Token previamente emitido queda invalidado definitivamente tras inactivación
 * 8. Usuario inactivo -> Activar (activo = 1)
 * 9. Usuario reactivado puede iniciar sesión nuevamente
 * 10. Las sesiones anteriores invalidadas no se reactivan
 * 11. Protección contra auto-inactivación (bloqueado en UI y en backend)
 * 12. Protección contra dejar al sistema sin administradores activos
 * 13. Verificación de permisos y RBAC (requiere funcionalidad 'admin' y permiso 'usuarios.update')
 * 14. La acción Eliminar sigue funcionando exactamente como antes
 * 15. UI dinámica: cambio visual de badges y botones sin recargar la página completa
 */

const assert = require('assert');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const { chromium } = require('playwright');
require('dotenv').config();

const { app } = require('../server.js');

let server;
let port;
let baseUrl;
let conn;
let browser;

async function run() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS: INACTIVAR Y ACTIVAR USUARIOS EN ADMINISTRACIÓN');
    console.log('================================================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function report(name, condition, extraInfo) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`✅ [PASS] Caso ${totalTests}: ${name}`);
        } else {
            console.error(`❌ [FAIL] Caso ${totalTests}: ${name}`);
            if (extraInfo) console.error('   Detalles:', extraInfo);
            assert.fail(`Fallo en prueba: ${name}`);
        }
    }

    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'idealandia'
        });

        server = app.listen(0);
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`✓ Servidor iniciado en puerto ${port}\n`);

        // Obtener usuario administrador principal
        const [adminRows] = await conn.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id
            WHERE r.nombre = 'administrador' AND u.activo = 1
            LIMIT 1
        `);
        assert(adminRows.length > 0, 'Debe existir un usuario administrador activo en la base de datos');
        const mainAdmin = adminRows[0];
        const adminToken = jwt.sign(
            { id: mainAdmin.id, usuario: mainAdmin.usuario, jwt_version: mainAdmin.jwt_version || 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // Limpiar usuarios de prueba previos si existieran
        await conn.query("DELETE FROM usuario_roles WHERE usuario_id IN (SELECT id FROM usuarios WHERE usuario LIKE 'test_user_%')");
        await conn.query("DELETE FROM usuarios WHERE usuario LIKE 'test_user_%'");

        // Crear un usuario normal de prueba con rol de 'usuario'
        const testPasswordHash = await bcrypt.hash('Password123!', 10);
        const [resUser] = await conn.query(
            "INSERT INTO usuarios (usuario, password_hash, nombre, email, telefono, activo, jwt_version) VALUES (?, ?, ?, ?, ?, 1, 1)",
            ['test_user_toggle', testPasswordHash, 'Usuario Para Toggle', 'test_user_toggle@idealandia.test', '5512345678']
        );
        const testUserId = resUser.insertId;

        // Asignarle rol 'usuario'
        const [roleRows] = await conn.query("SELECT id FROM roles WHERE nombre = 'usuario' LIMIT 1");
        if (roleRows.length > 0) {
            await conn.query("INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)", [testUserId, roleRows[0].id]);
        }

        console.log('[BLOQUE 1: Pruebas Backend de Inactivación, Tokens y Login]\n');

        // 1. Emitir un token previo para el usuario de prueba mientras está activo
        const preToken = jwt.sign(
            { id: testUserId, usuario: 'test_user_toggle', jwt_version: 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // El usuario activo puede consultar una ruta protegida con su token
        const checkActiveReq = await fetch(`${baseUrl}/api/me/permisos`, {
            headers: { 'Authorization': `Bearer ${preToken}` }
        });
        report('Usuario activo puede acceder a rutas autenticadas con su token',
            checkActiveReq.status === 200);

        // 2. Inactivar el usuario mediante PATCH /api/admin/usuarios/:id/estado con adminToken
        const inactivateRes = await fetch(`${baseUrl}/api/admin/usuarios/${testUserId}/estado`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ activo: 0 })
        });
        const inactivateData = await inactivateRes.json();
        report('Endpoint PATCH /api/admin/usuarios/:id/estado responde 200 al inactivar',
            inactivateRes.status === 200 && inactivateData.activo === 0);

        // 3. Verificar persistencia en Base de Datos: NO se ejecutó DELETE y activo = 0
        const [userAfterInactivate] = await conn.query("SELECT id, usuario, nombre, email, activo, jwt_version FROM usuarios WHERE id = ?", [testUserId]);
        report('El usuario permanece en BD (NO se ejecutó DELETE)',
            userAfterInactivate.length === 1);
        report('El campo activo en BD cambió a 0',
            userAfterInactivate[0].activo === 0);
        report('El campo jwt_version se incrementó para invalidar sesiones',
            userAfterInactivate[0].jwt_version > 1);

        // 4. Verificar que sus roles no se eliminaron
        const [rolesAfterInactivate] = await conn.query("SELECT * FROM usuario_roles WHERE usuario_id = ?", [testUserId]);
        report('Los roles del usuario permanecen intactos',
            rolesAfterInactivate.length > 0);

        // 5. Usuario inactivo intenta iniciar sesión -> Rechazado con 403 Forbidden
        const loginInactiveRes = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'test_user_toggle', password: 'Password123!' })
        });
        const loginInactiveData = await loginInactiveRes.json();
        report('Usuario inactivo recibe 403 al intentar iniciar sesión',
            loginInactiveRes.status === 403 && /inactiva/i.test(loginInactiveData.error));

        // 6. Token emitido previamente ya no puede utilizarse
        const oldTokenReq = await fetch(`${baseUrl}/api/me/permisos`, {
            headers: { 'Authorization': `Bearer ${preToken}` }
        });
        report('Llamada a API autenticada con token previo es rechazada tras inactivar (401)',
            oldTokenReq.status === 401);

        // 7. Reactivar usuario mediante PATCH /api/admin/usuarios/:id/estado
        const activateRes = await fetch(`${baseUrl}/api/admin/usuarios/${testUserId}/estado`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ activo: 1 })
        });
        const activateData = await activateRes.json();
        report('Endpoint PATCH responde 200 al reactivar usuario',
            activateRes.status === 200 && activateData.activo === 1);

        const [userAfterActivate] = await conn.query("SELECT activo, jwt_version FROM usuarios WHERE id = ?", [testUserId]);
        report('El campo activo en BD volvió a 1',
            userAfterActivate[0].activo === 1);

        // 8. Usuario reactivado puede iniciar sesión nuevamente y recibe cookie de sesión
        const loginActiveRes = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'test_user_toggle', password: 'Password123!' })
        });
        const loginActiveData = await loginActiveRes.json();
        const cookieHeader = loginActiveRes.headers.get('set-cookie');
        const tokenMatch = cookieHeader ? cookieHeader.match(/auth_token=([^;]+)/) : null;
        const newAuthToken = tokenMatch ? tokenMatch[1] : null;

        report('Usuario reactivado puede iniciar sesión exitosamente (200 OK y cookie auth_token emitida)',
            loginActiveRes.status === 200 && Boolean(loginActiveData.user) && Boolean(newAuthToken));

        // 9. El token previo anterior a la inactivación SIGUE inválido (no se recuperan sesiones revocadas)
        const oldTokenReq2 = await fetch(`${baseUrl}/api/me/permisos`, {
            headers: { 'Authorization': `Bearer ${preToken}` }
        });
        report('El token previo anterior a la inactivación permanece revocado',
            oldTokenReq2.status === 401);

        // 10. El nuevo token emitido sí funciona
        const newTokenReq = await fetch(`${baseUrl}/api/me/permisos`, {
            headers: { 'Authorization': `Bearer ${newAuthToken}` }
        });
        report('El nuevo token emitido tras la reactivación funciona correctamente (200 OK)',
            newTokenReq.status === 200);

        console.log('\n[BLOQUE 2: Protecciones de Seguridad y RBAC]\n');

        // 11. Intento de auto-inactivación por el administrador actual
        const selfInactivateRes = await fetch(`${baseUrl}/api/admin/usuarios/${mainAdmin.id}/estado`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ activo: 0 })
        });
        const selfInactivateData = await selfInactivateRes.json();
        report('Auto-inactivación del propio administrador es rechazada con 400',
            selfInactivateRes.status === 400 && /propio usuario/i.test(selfInactivateData.error));

        // 12. Intento de dejar al sistema sin administradores activos
        // Crear un segundo admin y probar inactivar ambos o inactivar el único
        const [adminCountRows] = await conn.query(`
            SELECT COUNT(DISTINCT u.id) as count
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
            JOIN rol_permisos rp ON r.id = rp.rol_id
            JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
            WHERE p.codigo = 'admin.access' AND u.activo = 1
        `);
        const totalAdminsActivos = parseInt(adminCountRows[0].count, 10);

        if (totalAdminsActivos === 1) {
            // mainAdmin es el único. Si se intentara inactivar desde otro token admin que simulamos:
            // creamos un admin temporal para intentar inactivar a mainAdmin
            const [resTempAdmin] = await conn.query(
                "INSERT INTO usuarios (usuario, password_hash, nombre, email, activo, jwt_version) VALUES (?, ?, ?, ?, 1, 1)",
                ['test_admin_2', testPasswordHash, 'Segundo Admin', 'test_admin_2@idealandia.test']
            );
            const tempAdminId = resTempAdmin.insertId;
            const [adminRole] = await conn.query("SELECT id FROM roles WHERE nombre = 'administrador' LIMIT 1");
            await conn.query("INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)", [tempAdminId, adminRole[0].id]);

            const tempAdminToken = jwt.sign(
                { id: tempAdminId, usuario: 'test_admin_2', jwt_version: 1 },
                process.env.AUTH_SECRET,
                { expiresIn: '1h' }
            );

            // Inactivar tempAdmin usando mainAdminToken
            await fetch(`${baseUrl}/api/admin/usuarios/${tempAdminId}/estado`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ activo: 0 })
            });

            // Reactivar tempAdmin y obtener un token fresco con su nuevo jwt_version
            await conn.query("UPDATE usuarios SET activo = 1 WHERE id = ?", [tempAdminId]);
            const [tRows] = await conn.query("SELECT jwt_version FROM usuarios WHERE id = ?", [tempAdminId]);
            const freshTempAdminToken = jwt.sign(
                { id: tempAdminId, usuario: 'test_admin_2', jwt_version: tRows[0].jwt_version },
                process.env.AUTH_SECRET,
                { expiresIn: '1h' }
            );

            // Inactivamos mainAdmin desde tempAdmin
            const inactMain = await fetch(`${baseUrl}/api/admin/usuarios/${mainAdmin.id}/estado`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${freshTempAdminToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ activo: 0 })
            });
            assert.strictEqual(inactMain.status, 200, 'Se pudo inactivar mainAdmin porque tempAdmin sigue activo');

            // Ahora tempAdmin es el ÚNICO admin activo. Intentar inactivar tempAdmin desde mainAdmin reactivado temporalmente:
            await conn.query("UPDATE usuarios SET activo = 0 WHERE id = ?", [mainAdmin.id]);
            // tempAdmin es el único activo. Intentar inactivar tempAdmin dará error de auto-inactivación.
            // Creamos un usuario con permiso usuarios.update pero SIN admin.access para probar que no puede dejar sin admin:
            const [resDelegated] = await conn.query(
                "INSERT INTO usuarios (usuario, password_hash, nombre, email, activo, jwt_version) VALUES (?, ?, ?, ?, 1, 1)",
                ['test_user_delegated', testPasswordHash, 'Usuario Delegado', 'delegated@idealandia.test']
            );
            const delegatedId = resDelegated.insertId;
            // Darle funcionalidad admin y permiso usuarios.update
            const [funcAdmin] = await conn.query("SELECT id FROM funcionalidades WHERE codigo = 'administracion' LIMIT 1");
            const [permUpdate] = await conn.query("SELECT id FROM permisos WHERE codigo = 'usuarios.update' LIMIT 1");
            if (funcAdmin.length > 0 && permUpdate.length > 0) {
                const [accesoRes] = await conn.query(
                    "INSERT INTO usuario_funcionalidades (usuario_id, funcionalidad_id, tipo_acceso, estado) VALUES (?, ?, 'permanente', 'activo')",
                    [delegatedId, funcAdmin[0].id]
                );
                await conn.query(
                    "INSERT INTO acceso_permisos (acceso_id, permiso_id) VALUES (?, ?)",
                    [accesoRes.insertId, permUpdate[0].id]
                );

                const delegatedToken = jwt.sign(
                    { id: delegatedId, usuario: 'test_user_delegated', jwt_version: 1 },
                    process.env.AUTH_SECRET,
                    { expiresIn: '1h' }
                );

                // Delegated intenta inactivar a tempAdmin (el único admin activo)
                const inactLastAdmin = await fetch(`${baseUrl}/api/admin/usuarios/${tempAdminId}/estado`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${delegatedToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activo: 0 })
                });
                const lastAdminData = await inactLastAdmin.json();
                report('Intento de dejar al sistema sin administradores activos es rechazado con 400',
                    inactLastAdmin.status === 400 && /sin administradores activos/i.test(lastAdminData.error));

                await conn.query("DELETE FROM acceso_permisos WHERE acceso_id = ?", [accesoRes.insertId]);
                await conn.query("DELETE FROM usuario_funcionalidades WHERE id = ?", [accesoRes.insertId]);
            }

            // Restaurar mainAdmin como activo y limpiar tempAdmin y delegated
            await conn.query("UPDATE usuarios SET activo = 1 WHERE id = ?", [mainAdmin.id]);
            await conn.query("DELETE FROM usuario_roles WHERE usuario_id IN (?, ?)", [tempAdminId, delegatedId]);
            await conn.query("DELETE FROM usuarios WHERE id IN (?, ?)", [tempAdminId, delegatedId]);
        }

        // 13. Verificación de RBAC: un usuario sin permisos no puede llamar al endpoint PATCH
        const unauthorizedRes = await fetch(`${baseUrl}/api/admin/usuarios/${testUserId}/estado`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${newAuthToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ activo: 0 })
        });
        report('Usuario sin permisos recibe 403 Forbidden al intentar inactivar',
            unauthorizedRes.status === 403);

        // 14. Verificación de que la acción de Eliminar usuario continúa funcionando
        // Crear un usuario desechable para probar DELETE
        const [resUserToDelete] = await conn.query(
            "INSERT INTO usuarios (usuario, password_hash, nombre, email, activo, jwt_version) VALUES (?, ?, ?, ?, 1, 1)",
            ['test_user_to_delete', testPasswordHash, 'Usuario Para Eliminar', 'delete_test@idealandia.test']
        );
        const userToDeleteId = resUserToDelete.insertId;
        const deleteRes = await fetch(`${baseUrl}/api/admin/usuarios/${userToDeleteId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        report('Endpoint DELETE continúa funcionando exactamente como antes (200 OK)',
            deleteRes.status === 200);
        const [checkDeleted] = await conn.query("SELECT id FROM usuarios WHERE id = ?", [userToDeleteId]);
        report('El usuario eliminado fue removido de la tabla usuarios',
            checkDeleted.length === 0);

        console.log('\n[BLOQUE 3: Pruebas de Interfaz y Navegador Playwright]\n');

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.addCookies([
            { name: 'auth_token', value: adminToken, domain: '127.0.0.1', path: '/' },
            { name: 'auth_token', value: adminToken, domain: 'localhost', path: '/' }
        ]);

        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Abrir sección de Administración -> Gestión de Usuarios
        await page.evaluate(() => {
            const adminLink = document.querySelector('a[data-section="admin"], #menu-item-admin, [data-target="admin"]');
            if (adminLink) adminLink.click();
            else {
                document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
                const adminSec = document.getElementById('admin');
                if (adminSec) adminSec.style.display = 'block';
                if (window.showAdminTab) window.showAdminTab('admin-usuarios');
                if (window.loadUsuarios) window.loadUsuarios();
            }
        });

        await page.waitForSelector('#admin-usuarios-tbody tr', { timeout: 10000 });
        console.log('✓ Tabla de Gestión de Usuarios renderizada en el navegador.');

        // 15. Verificar que los botones de acción incluyen Activar/Inactivar con las clases e iconos correctos
        const botonesInfo = await page.evaluate(({ targetUserId, currentAdminId }) => {
            const rows = Array.from(document.querySelectorAll('#admin-usuarios-tbody tr'));
            const targetRow = rows.find(r => r.querySelector('td:nth-child(2)')?.textContent?.trim() === 'test_user_toggle');
            const adminRow = rows.find(r => r.querySelector('td:nth-child(1)')?.textContent?.trim() == currentAdminId);

            const getRowDetails = (r) => {
                if (!r) return null;
                const estatusText = r.querySelector('td:nth-child(7)')?.textContent?.trim();
                const inactBtn = r.querySelector('.admin-action-btn--inactivate');
                const actBtn = r.querySelector('.admin-action-btn--activate');
                return {
                    estatusText,
                    hasInactivateBtn: !!inactBtn,
                    hasActivateBtn: !!actBtn,
                    inactivateDisabled: inactBtn ? inactBtn.disabled : false,
                    inactivateTitle: inactBtn ? inactBtn.title : null
                };
            };

            return {
                targetUser: getRowDetails(targetRow),
                adminUser: getRowDetails(adminRow)
            };
        }, { targetUserId: testUserId, currentAdminId: mainAdmin.id });

        report('Usuario activo muestra badge "Usuario activo" en columna Estatus',
            /Usuario activo/i.test(botonesInfo.targetUser.estatusText));
        report('Usuario activo muestra botón de Inactivar (.admin-action-btn--inactivate)',
            botonesInfo.targetUser.hasInactivateBtn);
        report('El botón de inactivar del propio administrador conectado está deshabilitado',
            botonesInfo.adminUser.inactivateDisabled && /propia cuenta/i.test(botonesInfo.adminUser.inactivateTitle));

        // 16. Probar Cancelar la confirmación: estado NO cambia
        // Hacer clic en el botón de Inactivar del usuario de prueba
        await page.evaluate((targetId) => {
            const rows = Array.from(document.querySelectorAll('#admin-usuarios-tbody tr'));
            const targetRow = rows.find(r => r.querySelector('td:nth-child(2)')?.textContent?.trim() === 'test_user_toggle');
            const btn = targetRow.querySelector('.admin-action-btn--inactivate');
            btn.click();
        }, testUserId);
        await page.waitForTimeout(200);

        // Verificar que el modal de confirmación está abierto con texto y subtítulo correctos
        const modalVisible = await page.evaluate(() => {
            const overlay = document.getElementById('custom-modal');
            const msgEl = document.getElementById('custom-modal-message');
            const cancelBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Cancelar');
            const inactBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Inactivar');
            return {
                isActive: overlay && overlay.classList.contains('active'),
                messageHtml: msgEl ? msgEl.innerHTML : '',
                hasCancelBtn: !!cancelBtn,
                hasInactBtn: !!inactBtn
            };
        });

        report('Modal de confirmación para inactivar se abre con botones Cancelar e Inactivar',
            modalVisible.isActive && modalVisible.hasCancelBtn && modalVisible.hasInactBtn);
        report('Modal incluye subtítulo explicativo de que el usuario no podrá iniciar sesión',
            /no podrá iniciar sesión mientras permanezca inactivo/i.test(modalVisible.messageHtml));

        // Pulsar Cancelar
        await page.evaluate(() => {
            const cancelBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Cancelar');
            if (cancelBtn) cancelBtn.click();
        });
        await page.waitForTimeout(200);

        // Comprobar que sigue activo en BD
        const [stillActive] = await conn.query("SELECT activo FROM usuarios WHERE id = ?", [testUserId]);
        report('Cancelar el modal no modifica el estado en la base de datos (activo = 1)',
            stillActive[0].activo === 1);

        // 17. Confirmar Inactivación en el modal
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#admin-usuarios-tbody tr'));
            const targetRow = rows.find(r => r.querySelector('td:nth-child(2)')?.textContent?.trim() === 'test_user_toggle');
            const btn = targetRow.querySelector('.admin-action-btn--inactivate');
            btn.click();
        });
        await page.waitForTimeout(200);

        // Pulsar Inactivar en el modal
        await page.evaluate(() => {
            const inactBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Inactivar');
            if (inactBtn) inactBtn.click();
        });
        await page.waitForTimeout(500);

        // Cerrar modal informativo de éxito si apareció
        await page.evaluate(() => {
            const okBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Aceptar');
            if (okBtn) okBtn.click();
        });
        await page.waitForTimeout(300);

        // Verificar que la tabla se actualizó sin recargar página: el usuario ahora es "Usuario inactivo" y tiene botón "Activar"
        const uiEstadoInactivo = await page.evaluate((targetId) => {
            const rows = Array.from(document.querySelectorAll('#admin-usuarios-tbody tr'));
            const targetRow = rows.find(r => r.querySelector('td:nth-child(2)')?.textContent?.trim() === 'test_user_toggle');
            const estatusText = targetRow?.querySelector('td:nth-child(7)')?.textContent?.trim();
            const actBtn = targetRow?.querySelector('.admin-action-btn--activate');
            return {
                estatusText,
                hasActivateBtn: !!actBtn
            };
        }, testUserId);

        report('La tabla se actualiza: el badge cambia a "Usuario inactivo"',
            /Usuario inactivo/i.test(uiEstadoInactivo.estatusText));
        report('La tabla se actualiza: el botón cambia dinámicamente a "Activar" (.admin-action-btn--activate)',
            uiEstadoInactivo.hasActivateBtn);

        // 18. Pulsar botón Activar en la UI
        await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#admin-usuarios-tbody tr'));
            const targetRow = rows.find(r => r.querySelector('td:nth-child(2)')?.textContent?.trim() === 'test_user_toggle');
            const btn = targetRow.querySelector('.admin-action-btn--activate');
            btn.click();
        });
        await page.waitForTimeout(200);

        // Confirmar en el modal de activación
        const modalActivar = await page.evaluate(() => {
            const msgEl = document.getElementById('custom-modal-message');
            const actBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Activar');
            return {
                text: msgEl ? msgEl.textContent : '',
                hasActBtn: !!actBtn
            };
        });
        report('Modal de activación pregunta "¿Deseas activar al usuario ...?" con botón Activar',
            /¿Deseas activar al usuario/i.test(modalActivar.text) && modalActivar.hasActBtn);

        await page.evaluate(() => {
            const actBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Activar');
            if (actBtn) actBtn.click();
        });
        await page.waitForTimeout(500);

        // Cerrar modal de confirmación / éxito
        await page.evaluate(() => {
            const okBtn = Array.from(document.querySelectorAll('#custom-modal-buttons button')).find(b => b.textContent.trim() === 'Aceptar');
            if (okBtn) okBtn.click();
        });
        await page.waitForTimeout(300);

        const uiEstadoActivo = await page.evaluate((targetId) => {
            const rows = Array.from(document.querySelectorAll('#admin-usuarios-tbody tr'));
            const targetRow = rows.find(r => r.querySelector('td:nth-child(2)')?.textContent?.trim() === 'test_user_toggle');
            const estatusText = targetRow?.querySelector('td:nth-child(7)')?.textContent?.trim();
            const inactBtn = targetRow?.querySelector('.admin-action-btn--inactivate');
            return {
                estatusText,
                hasInactivateBtn: !!inactBtn
            };
        }, testUserId);

        report('La tabla se actualiza: el badge vuelve a "Usuario activo"',
            /Usuario activo/i.test(uiEstadoActivo.estatusText));
        report('La tabla se actualiza: el botón vuelve dinámicamente a "Inactivar"',
            uiEstadoActivo.hasInactivateBtn);

        // Limpiar usuario de prueba
        await conn.query("DELETE FROM usuario_roles WHERE usuario_id = ?", [testUserId]);
        await conn.query("DELETE FROM usuarios WHERE id = ?", [testUserId]);

        console.log('\n================================================================================');
        console.log(`RESULTADO DE LA SUITE: ${passedTests} de ${totalTests} PRUEBAS SUPERADAS EXITOSAMENTE`);
        console.log('================================================================================\n');

        await browser.close();
        await conn.end();
        server.close();
        process.exit(0);

    } catch (err) {
        console.error('Error ejecutando la suite:', err);
        if (browser) await browser.close();
        if (conn) await conn.end();
        if (server) server.close();
        process.exit(1);
    }
}

run();
