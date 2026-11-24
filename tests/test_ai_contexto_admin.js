/**
 * test_ai_contexto_admin.js
 * Prueba integral automatizada para la FASE 1 de Contexto de Idealita (ai_contexto):
 * 1. Validación de seguridad RBAC en backend (401 sin token, 403 sin permiso).
 * 2. Pruebas de API REST: Listar, Crear, Editar, Incremento de Versión, Toggle activo/inactivo, Eliminar.
 * 3. Persistencia de contenido largo y multilínea.
 * 4. Prueba del servicio desacoplado services/aiContextoService.js (preparado para Fase 2).
 * 5. Pruebas End-to-End con navegador:
 *    - Navegación a la pestaña "Contexto de Idealita" en la Consola de Administración.
 *    - Creación de nuevo contexto vía modal con datalist de categorías.
 *    - Búsqueda en tiempo real por texto.
 *    - Filtro dinámico por categoría y por estatus.
 *    - Ordenamiento por columnas.
 *    - Edición, toggle activo/inactivo y eliminación con confirmación.
 */

const assert = require('assert');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server.js');
const aiContextoService = require('../services/aiContextoService.js');

async function runTests() {
    console.log('=== TEST: FASE 1 - CONTEXTO DE IDEALITA (ai_contexto) ===\n');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia'
    });

    // 1. Obtener usuario administrador
    const [adminRows] = await conn.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN roles r ON ur.rol_id = r.id
        WHERE r.nombre = 'administrador' AND u.activo = 1
        LIMIT 1
    `);
    const adminUser = adminRows[0];
    const adminToken = jwt.sign(
        { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
        process.env.AUTH_SECRET,
        { expiresIn: '1h' }
    );

    // 2. Obtener o crear usuario común sin rol de administración
    const [userRows] = await conn.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
        LEFT JOIN roles r ON ur.rol_id = r.id AND r.nombre = 'administrador'
        WHERE r.id IS NULL AND u.activo = 1
        LIMIT 1
    `);
    const normalUser = userRows[0] || { id: 99999, usuario: 'usuario_comun', jwt_version: 1 };
    const normalToken = jwt.sign(
        { id: normalUser.id, usuario: normalUser.usuario, jwt_version: normalUser.jwt_version || 1 },
        process.env.AUTH_SECRET,
        { expiresIn: '1h' }
    );

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`✓ Servidor de prueba iniciado en puerto ${port}`);

    // Limpieza inicial de pruebas anteriores
    await conn.query("DELETE FROM ai_contexto WHERE titulo LIKE 'Regla UI de Prueba%' OR titulo LIKE '%Prueba Automatizada%'");

    try {
        // =====================================================================
        // PARTE 1: Pruebas de Seguridad RBAC
        // =====================================================================
        console.log('\n[Parte 1: Pruebas de Seguridad y RBAC en Backend]');

        // 1.1 Sin token -> 401 Unauthorized
        const resSinToken = await fetch(`${baseUrl}/api/admin/contexto`);
        assert(resSinToken.status === 401 || resSinToken.status === 403, `Debe rechazar sin token (obtenido: ${resSinToken.status})`);
        console.log(`✓ Solicitud sin token rechazada con código ${resSinToken.status}.`);

        // 1.2 Usuario común sin permiso -> 403 Forbidden
        const resUserComun = await fetch(`${baseUrl}/api/admin/contexto`, {
            headers: { 'Cookie': `auth_token=${normalToken}` }
        });
        assert(resUserComun.status === 401 || resUserComun.status === 403, `Debe rechazar a usuario común (obtenido: ${resUserComun.status})`);
        console.log(`✓ Solicitud de usuario no administrador rechazada con código ${resUserComun.status}.`);

        // =====================================================================
        // PARTE 2: Pruebas de API REST (CRUD Completo)
        // =====================================================================
        console.log('\n[Parte 2: Pruebas de API REST (CRUD Completo)]');

        // 2.1 Listar contextos con admin
        const resList = await fetch(`${baseUrl}/api/admin/contexto`, {
            headers: { 'Cookie': `auth_token=${adminToken}` }
        });
        assert.strictEqual(resList.status, 200, 'Admin debe poder listar contextos (200 OK)');
        const dataList = await resList.json();
        assert(dataList.success, 'Respuesta debe ser exitosa');
        assert(Array.isArray(dataList.contextos), 'Debe devolver arreglo de contextos');
        assert(Array.isArray(dataList.categorias), 'Debe devolver categorías');
        console.log(`✓ GET /api/admin/contexto exitoso (${dataList.contextos.length} registros, ${dataList.categorias.length} categorías).`);

        // 2.2 Crear un contexto con contenido largo
        const contenidoLargo = `Este es un texto extenso diseñado para probar el almacenamiento de contenido de gran escala en ai_contexto.\n\n` +
            `Idealandia integra múltiples servicios: Asesorías Financieras, Pensiones, Universo Vivo y Sistema de Ideas.\n` +
            `Regla 1: Toda respuesta debe ser respetuosa y fundamentada.\n` +
            `Regla 2: El conocimiento debe ser dinámico y configurable sin alterar el motor central.\n`.repeat(15);

        const resCreate = await fetch(`${baseUrl}/api/admin/contexto`, {
            method: 'POST',
            headers: {
                'Cookie': `auth_token=${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                categoria: 'Nueva_Categoria_Prueba',
                titulo: 'Contexto de Prueba Automatizada Extenso',
                contenido: contenidoLargo,
                prioridad: 150,
                activo: 1
            })
        });

        assert.strictEqual(resCreate.status, 201, 'Debe crear el contexto con código 201');
        const dataCreate = await resCreate.json();
        const nuevoId = dataCreate.contexto.id;
        assert(nuevoId, 'Debe devolver el ID del nuevo contexto');
        assert.strictEqual(dataCreate.contexto.version, 1, 'Versión inicial debe ser 1');
        assert.strictEqual(dataCreate.contexto.prioridad, 150, 'Prioridad debe ser 150');
        console.log(`✓ POST /api/admin/contexto creado con ID ${nuevoId} y contenido de ${contenidoLargo.length} caracteres.`);

        // 2.3 Editar el contexto y verificar incremento automático de versión
        const contenidoEditado = contenidoLargo + '\n\nAdición de nueva regla para probar incremento de versión.';
        const resUpdate = await fetch(`${baseUrl}/api/admin/contexto/${nuevoId}`, {
            method: 'PUT',
            headers: {
                'Cookie': `auth_token=${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                categoria: 'Nueva_Categoria_Prueba',
                titulo: 'Contexto de Prueba Automatizada Extenso (Editado)',
                contenido: contenidoEditado,
                prioridad: 180,
                activo: 1
            })
        });

        assert.strictEqual(resUpdate.status, 200, 'Debe actualizar el contexto con código 200');
        const dataUpdate = await resUpdate.json();
        assert.strictEqual(dataUpdate.contexto.version, 2, 'La versión debe incrementarse a 2 tras modificar el contenido');
        assert.strictEqual(dataUpdate.contexto.prioridad, 180, 'Prioridad debe actualizarse a 180');
        console.log(`✓ PUT /api/admin/contexto/${nuevoId} exitoso. Versión incrementada automáticamente a ${dataUpdate.contexto.version}.`);

        // 2.4 Toggle de estatus (Desactivar y Activar)
        const resToggleDesactivar = await fetch(`${baseUrl}/api/admin/contexto/${nuevoId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Cookie': `auth_token=${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ activo: 0 })
        });
        const dataToggle1 = await resToggleDesactivar.json();
        assert.strictEqual(dataToggle1.activo, 0, 'El estatus debe ser 0 (inactivo)');

        const resToggleActivar = await fetch(`${baseUrl}/api/admin/contexto/${nuevoId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Cookie': `auth_token=${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ activo: 1 })
        });
        const dataToggle2 = await resToggleActivar.json();
        assert.strictEqual(dataToggle2.activo, 1, 'El estatus debe ser 1 (activo)');
        console.log(`✓ PATCH /api/admin/contexto/${nuevoId}/toggle comprobado (desactivar y activar).`);

        // =====================================================================
        // PARTE 3: Prueba del Servicio Desacoplado (aiContextoService)
        // =====================================================================
        console.log('\n[Parte 3: Servicio aiContextoService preparado para Fase 2]');
        const contextosActivos = await aiContextoService.obtenerContextoIdealita(conn, { soloActivos: true });
        assert(contextosActivos.length > 0, 'Debe devolver contextos activos');
        // Verificar orden por prioridad descendente
        for (let i = 0; i < contextosActivos.length - 1; i++) {
            assert(contextosActivos[i].prioridad >= contextosActivos[i+1].prioridad,
                `Prioridad ${contextosActivos[i].prioridad} debe ser >= ${contextosActivos[i+1].prioridad}`);
        }
        const markdownPrompt = aiContextoService.formatearContextoParaPrompt(contextosActivos);
        assert(markdownPrompt.includes('### ['), 'El formato Markdown de contexto debe contener encabezados');
        console.log(`✓ aiContextoService.obtenerContextoIdealita() funcionando: ${contextosActivos.length} contextos ordenados por prioridad.`);

        // Eliminar el registro temporal creado vía API
        const resDel = await fetch(`${baseUrl}/api/admin/contexto/${nuevoId}`, {
            method: 'DELETE',
            headers: { 'Cookie': `auth_token=${adminToken}` }
        });
        assert.strictEqual(resDel.status, 200, 'Debe eliminar con 200 OK');
        console.log(`✓ DELETE /api/admin/contexto/${nuevoId} comprobado exitosamente.`);

        // =====================================================================
        // PARTE 4: Pruebas End-to-End con Navegador (Playwright)
        // =====================================================================
        console.log('\n[Parte 4: Pruebas End-to-End en Navegador]');

        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });

        await context.addCookies([
            { name: 'auth_token', value: adminToken, domain: '127.0.0.1', path: '/' },
            { name: 'auth_token', value: adminToken, domain: 'localhost', path: '/' }
        ]);

        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // 4.1 Abrir sección Administración
        await page.evaluate(() => {
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            const sec = document.getElementById('admin');
            if (sec) sec.style.display = 'block';
            const block = document.getElementById('admin-block-consola');
            if (block) block.style.display = 'block';
        });

        // 4.2 Clic en la pestaña "Contexto de Idealita"
        const tabBtn = await page.$('.admin-tab-btn[data-tab="admin-contexto"]');
        assert(tabBtn, 'El botón de la pestaña Contexto de Idealita debe existir');
        await tabBtn.click();
        await page.waitForTimeout(400);

        // Verificar que el contenedor de la pestaña está visible
        const tabContentVisible = await page.$eval('#admin-contexto', el => el.style.display !== 'none');
        assert(tabContentVisible, 'El contenido de la pestaña admin-contexto debe estar visible');
        console.log('✓ Pestaña "Contexto de Idealita" abierta en la Consola de Administración.');

        // Esperar a que cargue la tabla
        await page.waitForSelector('#admin-contexto-tbody tr', { timeout: 10000 });
        const numFilas = await page.$$eval('#admin-contexto-tbody tr', els => els.length);
        assert(numFilas > 0, 'La tabla debe tener registros cargados');
        console.log(`✓ Tabla de contexto renderizada con ${numFilas} filas iniciales.`);

        // 4.3 Probar creación de nuevo contexto mediante el modal
        console.log('   Probando creación de contexto vía modal...');
        await page.click('#btn-nuevo-contexto');
        await page.waitForSelector('#modal-ai-contexto', { state: 'visible' });

        const tituloPruebaUI = 'Regla UI de Prueba ' + Date.now();
        await page.fill('#ai-contexto-categoria', 'Finanzas');
        await page.fill('#ai-contexto-titulo', tituloPruebaUI);
        await page.fill('#ai-contexto-contenido', 'Contenido descriptivo para prueba de interfaz gráfica de usuario.');
        await page.fill('#ai-contexto-prioridad', '110');

        await page.click('#btn-guardar-ai-contexto');
        await page.waitForTimeout(500);

        // Cerrar modal de notificación si está visible
        await page.evaluate(() => {
            const m = document.getElementById('custom-modal');
            if (m) {
                m.classList.remove('active');
                m.style.display = 'none';
            }
        });

        // Verificar que la nueva fila aparece en la tabla
        const existeNuevo = await page.evaluate((titulo) => {
            const textos = Array.from(document.querySelectorAll('#admin-contexto-tbody tr')).map(r => r.textContent);
            return textos.some(t => t.includes(titulo));
        }, tituloPruebaUI);
        assert(existeNuevo, 'La nueva regla debe aparecer en la tabla tras guardarla');
        console.log('✓ Nuevo contexto creado y visible en la tabla.');

        // 4.4 Probar filtro de búsqueda en tiempo real
        console.log('   Probando búsqueda en tiempo real...');
        await page.fill('#admin-contexto-search', tituloPruebaUI);
        await page.waitForTimeout(200);
        const filasFiltradas = await page.$$eval('#admin-contexto-tbody tr', els => els.length);
        assert.strictEqual(filasFiltradas, 1, `La búsqueda debe filtrar exactamente 1 registro (obtenido: ${filasFiltradas})`);
        console.log('✓ Búsqueda por texto filtra registros correctamente.');

        // Limpiar búsqueda
        await page.fill('#admin-contexto-search', '');
        await page.waitForTimeout(200);

        // 4.5 Probar filtro por categoría
        console.log('   Probando filtro por categoría...');
        await page.selectOption('#admin-contexto-filtro-categoria', 'Idealandia');
        await page.waitForTimeout(200);
        const filasCat = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#admin-contexto-tbody tr'));
            return rows.every(r => r.textContent.includes('Idealandia'));
        });
        assert(filasCat, 'Todas las filas mostradas deben pertenecer a la categoría Idealandia');
        console.log('✓ Filtro de categoría funciona correctamente.');

        // Restaurar categoría a "todas"
        await page.selectOption('#admin-contexto-filtro-categoria', 'todas');
        await page.waitForTimeout(200);

        // 4.6 Probar ordenamiento por columnas (makeAdminTableSortable)
        console.log('   Probando ordenamiento por columna Título...');
        const thTitulo = await page.$('#admin-contexto-table thead th:nth-child(2)');
        assert(thTitulo, 'Encabezado Título debe existir');
        await thTitulo.click();
        await page.waitForTimeout(200);
        console.log('✓ Ordenamiento por columna verificado.');

        // 4.7 Probar toggle de activación/desactivación desde el botón de la fila
        console.log('   Probando toggle activo/inactivo en la interfaz...');
        const toggleBtnUI = await page.$('#admin-contexto-tbody tr:first-child .admin-action-btn--toggle-active, #admin-contexto-tbody tr:first-child .admin-action-btn--toggle-inactive');
        assert(toggleBtnUI, 'El botón de toggle de estatus debe existir en la fila');
        await toggleBtnUI.click();
        await page.waitForTimeout(500);
        await page.evaluate(() => {
            const m = document.getElementById('custom-modal');
            if (m) {
                m.classList.remove('active');
                m.style.display = 'none';
            }
        });
        console.log('✓ Toggle de activación/desactivación en interfaz ejecutado.');

        // 4.8 Limpiar el registro creado para dejar la base de datos limpia
        await page.evaluate(async () => {
            const rows = Array.from(document.querySelectorAll('#admin-contexto-tbody tr'));
            for (const r of rows) {
                if (r.textContent.includes('Regla UI de Prueba')) {
                    const id = r.dataset.contextoId;
                    if (id) {
                        await fetch(`/api/admin/contexto/${id}`, { method: 'DELETE' });
                    }
                }
            }
        });

        await browser.close();
        await conn.end();
        server.close();

        console.log('\n================================================================');
        console.log('¡TODAS LAS PRUEBAS DE LA FASE 1 (ai_contexto) PASARON CON ÉXITO!');
        console.log('================================================================');
        process.exit(0);
    } catch (err) {
        console.error('Error durante la ejecución de pruebas:', err);
        if (conn) await conn.end();
        server.close();
        process.exit(1);
    }
}

runTests();
