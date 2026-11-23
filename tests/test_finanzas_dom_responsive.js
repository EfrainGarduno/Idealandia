/**
 * test_finanzas_dom_responsive.js
 * Verificación DOM interactiva con Playwright:
 * - Botón e indicador Activo/Inactivo (✓ / ⛔)
 * - Edición de tramos y esquemas en modal de institución
 * - Aprovechamiento del ancho en escritorio (Desktop layout)
 * - Responsividad y ausencia de overflow en móvil
 */

const assert = require('assert');
const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server.js');

let server;
let port;
let conn;
let adminToken;
let browser;

async function run() {
    console.log('--- Iniciando Verificación Visual e Interactiva DOM (Playwright) ---');

    conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        dateStrings: true
    });

    // Obtener administrador
    const [adminRows] = await conn.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN roles r ON ur.rol_id = r.id
        WHERE r.nombre = 'administrador' AND u.activo = 1
        LIMIT 1
    `);
    const adminUser = adminRows[0];
    adminToken = jwt.sign(
        { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
        process.env.AUTH_SECRET,
        { expiresIn: '1h' }
    );

    // Asegurar instituciones activas
    await conn.query('UPDATE instituciones_financieras SET activo = 1 WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8)');

    // Iniciar servidor en puerto libre
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            port = server.address().port;
            console.log(`Servidor de prueba iniciado en puerto ${port}`);
            resolve();
        });
    });

    browser = await chromium.launch({ headless: true });

    // ==========================================
    // PRUEBA 1: ESCRITORIO (1440x900)
    // ==========================================
    const contextDesktop = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    await contextDesktop.addCookies([{
        name: 'auth_token',
        value: adminToken,
        domain: 'localhost',
        path: '/'
    }]);
    const page = await contextDesktop.newPage();

    // Establecer token y datos de usuario en localStorage
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user }) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify({
            id: user.id,
            usuario: user.usuario,
            roles: ['administrador']
        }));
    }, { token: adminToken, user: adminUser });

    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    console.log('[Paso 1: Navegar a Administración -> Finanzas -> Instituciones]');
    // Abrir sección administración
    await page.evaluate(() => {
        const adminSection = document.getElementById('admin');
        if (adminSection) {
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            adminSection.style.display = 'block';
        }
        // Activar bloque finanzas
        const blockFinanzas = document.querySelector('.admin-nav-block-btn[data-block="admin-block-finanzas"]');
        if (blockFinanzas) blockFinanzas.click();
    });

    await page.waitForTimeout(600);

    // Verificar encabezados de la tabla de instituciones (exactamente 6 columnas sin ID ni Estatus)
    const encabezados = await page.$$eval('#admin-finanzas-instituciones thead th', ths => ths.map(t => t.textContent.trim()));
    console.log('Encabezados en Instituciones Financieras:', encabezados);
    assert.deepStrictEqual(encabezados, ['Institución', 'Tipo', 'Condición Resumen', 'Orden', 'Vigencia Actual', 'Acciones'], 'Las columnas deben ser exactamente 6');

    // Verificar tabla de instituciones
    const filasInst = await page.locator('#admin-finanzas-instituciones-tbody tr').count();
    console.log(`Instituciones cargadas en tabla: ${filasInst}`);
    assert(filasInst >= 8, 'Deben mostrarse al menos 8 instituciones');

    // Verificar botón Editar y control compacto Activo/Inactivo (patrón Gestión de Menús)
    const primerFilaAcciones = page.locator('#admin-finanzas-instituciones-tbody tr:first-child .admin-actions-cell');
    const tieneBtnEdit = await primerFilaAcciones.locator('.btn-edit-inst, .admin-action-btn--edit').count();
    assert.strictEqual(tieneBtnEdit, 1, 'Debe incluir botón Editar en columna Acciones');

    const toggleBtn = primerFilaAcciones.locator('.btn-toggle-inst');
    const esActivoInicial = await toggleBtn.getAttribute('class');
    assert(esActivoInicial.includes('admin-action-btn--toggle-active'), 'El botón debe tener la clase toggle-active para institución activa');

    const tieneIconoToggleOn = await toggleBtn.locator('i.fa-toggle-on').count();
    assert.strictEqual(tieneIconoToggleOn, 1, 'Debe mostrar icono toggle-on para institución activa');

    // Probar clic en toggle para desactivar y verificar reactividad
    await toggleBtn.click();
    await page.waitForTimeout(400);

    const esInactivoDespues = await page.locator('#admin-finanzas-instituciones-tbody tr:first-child .btn-toggle-inst').getAttribute('class');
    assert(esInactivoDespues.includes('admin-action-btn--toggle-inactive'), 'Debe cambiar a toggle-inactive al hacer clic');

    // Volver a activar
    await page.locator('#admin-finanzas-instituciones-tbody tr:first-child .btn-toggle-inst').click();
    await page.waitForTimeout(400);

    const esActivoRestaurado = await page.locator('#admin-finanzas-instituciones-tbody tr:first-child .btn-toggle-inst').getAttribute('class');
    assert(esActivoRestaurado.includes('admin-action-btn--toggle-active'), 'Debe volver a toggle-active al reactivar');
    console.log('✓ Patrón homogéneo de Gestión de Menús (Editar + Toggle) validado con éxito.');

    // Probar abrir Modal Editar Institución (NU)
    console.log('[Paso 2: Abrir Modal Editar en Institución NU]');
    const btnEditNU = page.locator('#admin-finanzas-instituciones-tbody tr:has-text("NU") .btn-edit-inst');
    await btnEditNU.click();
    await page.waitForTimeout(300);

    const modalVisible = await page.locator('#modal-finanzas-institucion').isVisible();
    assert.strictEqual(modalVisible, true, 'El modal de edición debe abrirse');

    // Verificar que los 2 tramos de NU aparecen en el modal
    const tramosCount = await page.locator('#finanzas-inst-tramos-tbody tr').count();
    console.log(`Tramos en modal de NU: ${tramosCount}`);
    assert.strictEqual(tramosCount, 2, 'NU debe mostrar exactamente sus 2 tramos');

    const tasa1 = await page.locator('#finanzas-inst-tramos-tbody tr:first-child .tramo-tasa-input').inputValue();
    const sup1 = await page.locator('#finanzas-inst-tramos-tbody tr:first-child .tramo-sup-input').inputValue();
    console.log(`Tramo 1 de NU: límite superior=$${sup1}, tasa=${tasa1}%`);
    assert.strictEqual(parseFloat(tasa1), 13);
    assert.strictEqual(parseFloat(sup1), 25000);

    // Verificar vista previa de condiciones resumen en tiempo real
    const previewCond = await page.locator('#finanzas-inst-condiciones-preview').textContent();
    console.log('Condición Resumen autogenerada:', previewCond.trim());
    assert(previewCond.includes('Hasta $25,000 al 13%'), 'El resumen debe reflejar automáticamente los tramos');

    // Cambiar tasa en vivo a 14% y comprobar actualización de preview
    await page.locator('#finanzas-inst-tramos-tbody tr:first-child .tramo-tasa-input').fill('14');
    await page.locator('#finanzas-inst-tramos-tbody tr:first-child .tramo-tasa-input').dispatchEvent('input');
    await page.waitForTimeout(100);

    const previewCondActualizada = await page.locator('#finanzas-inst-condiciones-preview').textContent();
    assert(previewCondActualizada.includes('14%'), 'La vista previa debe actualizarse reactivamente con el cambio de tasa');
    console.log('✓ Edición de tramos y resumen dinámico interactivo validados con éxito.');

    // Cerrar modal
    await page.locator('#btn-cancelar-modal-finanzas-inst').click();
    await page.waitForTimeout(200);

    // ==========================================
    // PRUEBA 3: SIMULADOR HORIZONTAL EXPANDIDO (DESKTOP)
    // ==========================================
    console.log('[Paso 3: Navegar al Simulador de Inversiones en Desktop]');
    await page.evaluate(() => {
        document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
        const servSection = document.getElementById('servicios');
        if (servSection) {
            servSection.style.display = 'flex';
        }
        const catView = document.getElementById('servicios-catalogo-view');
        if (catView) catView.style.display = 'none';
        const finView = document.getElementById('servicios-financieras-view');
        if (finView) finView.style.display = 'block';
        if (typeof inicializarSimuladorFinanciero === 'function') inicializarSimuladorFinanciero();
    });

    await page.waitForTimeout(800);

    // Medir ancho del contenedor en desktop
    const dimensiones = await page.evaluate(() => {
        const sec = document.getElementById('servicios');
        const view = document.getElementById('servicios-financieras-view');
        const container = document.getElementById('simulador-table-container');
        const table = container ? container.querySelector('.simulador-table') : null;
        return {
            windowWidth: window.innerWidth,
            sectionWidth: sec ? sec.getBoundingClientRect().width : 0,
            viewWidth: view ? view.getBoundingClientRect().width : 0,
            tableWidth: table ? table.getBoundingClientRect().width : 0,
            containerScrollWidth: container ? container.scrollWidth : 0,
            containerClientWidth: container ? container.clientWidth : 0
        };
    });

    console.log('Dimensiones en Escritorio (1440px):', dimensiones);
    // El área de la sección debe aprovechar más del 90% del ancho del área de contenido (> 1,000px, en lugar de estar atrapado en 800px)
    assert(dimensiones.sectionWidth >= 1000, `La sección debe aprovechar el ancho amplio disponible (obtenido: ${dimensiones.sectionWidth}px)`);
    assert(dimensiones.viewWidth >= 1000, `El simulador debe aprovechar el ancho amplio (obtenido: ${dimensiones.viewWidth}px)`);
    console.log('✓ Vista de Asesorías Financieras / Simulador aprovecha ampliamente el espacio horizontal en escritorio.');

    // ==========================================
    // PRUEBA 4: RESPONSIVIDAD EN MÓVIL (375x667)
    // ==========================================
    console.log('[Paso 4: Verificación Responsiva en Móvil (375px)]');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);

    const mobileOverflow = await page.evaluate(() => {
        const bodyScroll = document.body.scrollWidth;
        const htmlScroll = document.documentElement.scrollWidth;
        const windowWidth = window.innerWidth;
        const container = document.getElementById('simulador-table-container');

        return {
            windowWidth,
            bodyScroll,
            htmlScroll,
            hasGeneralOverflow: htmlScroll > windowWidth + 5,
            tableCanScrollHorizontally: container ? container.scrollWidth > container.clientWidth : false
        };
    });

    console.log('Comprobación Móvil:', mobileOverflow);
    assert.strictEqual(mobileOverflow.hasGeneralOverflow, false, 'En móvil NO debe haber overflow horizontal global en la página');
    assert.strictEqual(mobileOverflow.tableCanScrollHorizontally, true, 'La tabla debe ser desplazable horizontalmente de forma contenida en su propio wrapper');
    console.log('✓ Responsividad móvil perfecta: sin overflow general de pantalla y con tabla desplazable contenida.');

    // Limpieza
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await conn.end();

    console.log('\n>>> TODAS LAS PRUEBAS VISUALES, DOM Y RESPONSIVAS PASARON EXITOSAMENTE <<<\n');
    process.exit(0);
}

run().catch((err) => {
    console.error('Error en pruebas Playwright:', err);
    if (browser) browser.close().catch(() => {});
    if (server) try { server.close(); } catch (_) {}
    if (conn) conn.end().catch(() => {});
    process.exit(1);
});
