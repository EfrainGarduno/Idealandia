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
    console.log('=== TEST COMPLETO: REGRESIÓN DE NAVEGACIÓN EN ADMINISTRACIÓN ===\n');

    conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        dateStrings: true
    });

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

    // Obtener todos los permisos del rol administrador
    const [permRows] = await conn.query(`
        SELECT DISTINCT p.codigo 
        FROM permisos p
        JOIN rol_permisos rp ON p.id = rp.permiso_id
        JOIN usuario_roles ur ON rp.rol_id = ur.rol_id
        WHERE ur.usuario_id = ?
    `, [adminUser.id]);
    const adminPermisos = permRows.map(p => p.codigo);

    await new Promise((resolve) => {
        server = app.listen(0, () => {
            port = server.address().port;
            console.log(`Servidor de prueba iniciado en puerto ${port}`);
            resolve();
        });
    });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });

    await context.addCookies([{
        name: 'auth_token',
        value: adminToken,
        domain: 'localhost',
        path: '/'
    }]);

    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
            console.log(' [CONSOLE ERROR]:', msg.text());
        }
    });

    page.on('pageerror', err => {
        pageErrors.push(err);
        console.error(' [UNCAUGHT ERROR]:', err.message);
    });

    console.log('1. Cargando aplicación e inyectando credenciales...');
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ token, user, permisos }) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify({
            id: user.id,
            usuario: user.usuario,
            roles: ['administrador']
        }));
        window.userAdminPermissions = new Set(permisos);
    }, { token: adminToken, user: adminUser, permisos: adminPermisos });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Mostrar sección de administración (simulando clic en menú o navegación)
    console.log('2. Mostrando sección de Administración (#admin)...');
    await page.evaluate(() => {
        document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
        const adminSection = document.getElementById('admin');
        if (adminSection) adminSection.style.display = 'block';
        if (typeof syncAdminTabsAndPermissions === 'function') syncAdminTabsAndPermissions();
    });
    await page.waitForTimeout(400);

    assert.strictEqual(pageErrors.length, 0, `No debe haber errores de parseo o ejecución: ${pageErrors.map(e => e.message).join(', ')}`);

    // 3. Probar sub-módulos de Consola (los 7 botones)
    console.log('\n3. Probando interactividad de los 7 submódulos de Consola:');
    const tabsConsola = [
        { id: 'admin-usuarios', label: 'Usuarios', table: '#admin-usuarios-tbody' },
        { id: 'admin-roles', label: 'Roles', table: '#admin-roles-tbody' },
        { id: 'admin-permisos', label: 'Permisos', table: '#admin-permisos-tbody' },
        { id: 'admin-funcionalidades', label: 'Funcionalidades', table: '#admin-funcionalidades-tbody' },
        { id: 'admin-menus', label: 'Menús', table: '#admin-menus-tbody' },
        { id: 'admin-accesos', label: 'Accesos Temporales', table: '#admin-accesos-tbody' },
        { id: 'admin-asociados', label: 'Asociados', table: '#admin-asociados-tbody' }
    ];

    for (const tab of tabsConsola) {
        process.stdout.write(`   - Clic en tab "${tab.label}"... `);
        const btn = await page.$(`.admin-tab-btn[data-tab="${tab.id}"]`);
        assert(btn, `El botón para "${tab.label}" debe existir en el DOM`);
        await btn.click();
        await page.waitForTimeout(200);

        // Validar que el botón tenga la clase 'active'
        const isActive = await page.$eval(`.admin-tab-btn[data-tab="${tab.id}"]`, el => el.classList.contains('active'));
        assert(isActive, `El botón "${tab.label}" debe estar activo`);

        // Validar que el contenido de la pestaña esté visible
        const isContentVisible = await page.$eval(`#${tab.id}`, el => el.style.display !== 'none' && el.classList.contains('active'));
        assert(isContentVisible, `El contenedor #${tab.id} debe estar visible y activo`);

        console.log('✓ OK');
    }

    // 4. Probar navegación al Bloque Finanzas
    console.log('\n4. Probando navegación a Bloque Finanzas:');
    const btnBlockFinanzas = await page.$('.admin-nav-block-btn[data-block="admin-block-finanzas"]');
    assert(btnBlockFinanzas, 'El botón de bloque Finanzas debe existir');
    await btnBlockFinanzas.click();
    await page.waitForTimeout(400);

    const isFinanzasBlockVisible = await page.$eval('#admin-block-finanzas', el => el.style.display !== 'none');
    assert(isFinanzasBlockVisible, 'El bloque admin-block-finanzas debe estar visible');
    console.log('   ✓ Bloque Finanzas visible tras hacer clic.');

    // Probar subtabs de Finanzas
    console.log('   - Subtab "Instituciones Financieras"... ');
    const btnSubInst = await page.$('.admin-finanzas-subtab-btn[data-finanzastab="admin-finanzas-instituciones"]');
    await btnSubInst.click();
    await page.waitForTimeout(300);
    const isInstVisible = await page.$eval('#admin-finanzas-instituciones', el => el.style.display !== 'none');
    assert(isInstVisible, 'Tab Instituciones debe estar visible');
    const cantInst = await page.locator('#admin-finanzas-instituciones-tbody tr').count();
    console.log(`✓ OK (${cantInst} instituciones cargadas)`);

    console.log('   - Subtab "Tasas y Condiciones"... ');
    const btnSubTasas = await page.$('.admin-finanzas-subtab-btn[data-finanzastab="admin-finanzas-tasas"]');
    await btnSubTasas.click();
    await page.waitForTimeout(300);
    const isTasasVisible = await page.$eval('#admin-finanzas-tasas', el => el.style.display !== 'none');
    assert(isTasasVisible, 'Tab Tasas debe estar visible');
    console.log('✓ OK');

    // 5. Probar navegación al Bloque Planes Idealandia
    console.log('\n5. Probando navegación a Bloque Planes Idealandia:');
    const btnBlockPlanes = await page.$('.admin-nav-block-btn[data-block="admin-block-planes"]');
    assert(btnBlockPlanes, 'El botón de bloque Planes debe existir');
    await btnBlockPlanes.click();
    await page.waitForTimeout(300);
    const isPlanesVisible = await page.$eval('#admin-block-planes', el => el.style.display !== 'none');
    assert(isPlanesVisible, 'El bloque admin-block-planes debe estar visible');
    console.log('   ✓ Bloque Planes Idealandia visible y responde correctamente.');

    // 6. Prueba intensiva de ciclos: Consola ⇄ Finanzas ⇄ Planes (para comprobar que no se acumulan listeners ni crasheos)
    console.log('\n6. Probando ciclos de navegación repetidos (Consola ⇄ Finanzas ⇄ Planes):');
    const btnBlockConsola = await page.$('.admin-nav-block-btn[data-block="admin-block-consola"]');
    for (let i = 1; i <= 5; i++) {
        // Clic en Consola
        await btnBlockConsola.click();
        await page.waitForTimeout(100);
        // Clic en Roles
        await page.$eval('.admin-tab-btn[data-tab="admin-roles"]', el => el.click());
        await page.waitForTimeout(100);

        // Clic en Finanzas
        await btnBlockFinanzas.click();
        await page.waitForTimeout(100);

        // Clic en Planes
        await btnBlockPlanes.click();
        await page.waitForTimeout(100);

        console.log(`   ✓ Ciclo ${i}: Consola ⇄ Finanzas ⇄ Planes completado sin excepciones.`);
    }

    // 7. Nueva página con sesión limpia para verificar consistencia tras refresh
    console.log('\n7. Abriendo nueva página con sesión limpia para verificar consistencia...');
    await page.close();
    const page2 = await context.newPage();
    page2.on('pageerror', err => {
        pageErrors.push(err);
        console.error(' [UNCAUGHT ERROR]:', err.message);
    });

    await page2.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(500);
    await page2.evaluate(({ permisos }) => {
        window.userAdminPermissions = new Set(permisos);
        document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
        const adminSection = document.getElementById('admin');
        if (adminSection) adminSection.style.display = 'block';
        if (typeof syncAdminTabsAndPermissions === 'function') syncAdminTabsAndPermissions();
    }, { permisos: adminPermisos });
    await page2.waitForTimeout(300);

    // Clic en Permisos
    await page2.click('.admin-tab-btn[data-tab="admin-permisos"]');
    await page2.waitForTimeout(200);
    const permisosVisible = await page2.$eval('#admin-permisos', el => el.style.display !== 'none');
    assert(permisosVisible, 'El módulo de Permisos responde tras la recarga.');
    console.log('   ✓ Módulo de Permisos responde de forma óptima tras recarga.');

    // Asegurar 0 errores no controlados
    assert.strictEqual(pageErrors.length, 0, 'No hubo ningún Uncaught Error');

    console.log('\n=============================================================');
    console.log('¡TODAS LAS PRUEBAS DE REGRESIÓN DE ADMINISTRACIÓN PASARON (100%)!');
    console.log('=============================================================\n');

    await page2.close();

    await browser.close();
    await new Promise((r) => server.close(r));
    await conn.end();
}

run().catch(err => {
    console.error('Error durante la prueba:', err);
    if (browser) browser.close();
    if (server) server.close();
    if (conn) conn.end();
    process.exit(1);
});
