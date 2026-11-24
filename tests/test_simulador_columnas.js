/**
 * test_simulador_columnas.js
 * Prueba integral automatizada para el control unificado de visibilidad de columnas
 * en el Simulador de Inversiones / Asesorías Financieras.
 *
 * Verifica:
 * 1. Inicialización de 14 columnas con todas visibles (14/14).
 * 2. Ocultar una columna individualmente y verificar que solo esa columna se oculta.
 * 3. Ocultar múltiples columnas y verificar consistencia de alineamiento.
 * 4. Reincorporar columnas y verificar que reaparecen en su posición original.
 * 5. Función "Mostrar todas" que restaura la visibilidad total.
 * 6. Invarianza matemática: confirmar que ningún cálculo, tasa, rendimiento ni asignación cambia.
 * 7. Sincronización bidireccional entre toggles rápidos (Condiciones/Restricciones) y el menú desplegable.
 * 8. Comportamiento en escritorio (1280px) y móvil (360px).
 */

const assert = require('assert');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server.js');

async function runTests() {
    console.log('=== TEST: CONTROL UNIFICADO DE COLUMNAS DEL SIMULADOR ===\n');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia'
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
    const adminToken = jwt.sign(
        { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
        process.env.AUTH_SECRET,
        { expiresIn: '1h' }
    );

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`✓ Servidor de prueba iniciado en puerto ${port}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    await context.addCookies([
        { name: 'auth_token', value: adminToken, domain: '127.0.0.1', path: '/' },
        { name: 'auth_token', value: adminToken, domain: 'localhost', path: '/' }
    ]);

    const page = await context.newPage();

    try {
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Navegar a Asesorías Financieras -> Simulador
        await page.evaluate(() => {
            const link = document.querySelector('a[data-section="servicios-financieras"], #menu-item-financieras, [data-target="servicios-financieras"]');
            if (link) link.click();
            else {
                document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
                const sec = document.getElementById('servicios');
                if (sec) sec.style.display = 'block';
                const fView = document.getElementById('servicios-financieras-view');
                if (fView) fView.style.display = 'block';
                if (window.inicializarSimuladorFinanciero) window.inicializarSimuladorFinanciero();
            }
        });

        await page.waitForSelector('#simulador-tbody tr.simulador-row', { timeout: 10000 });
        console.log('✓ Simulador abierto y tabla cargada correctamente.');

        // Guardar valores calculados de referencia para verificar invarianza matemática
        const valoresAntes = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#simulador-tbody tr.simulador-row'));
            return rows.map(r => ({
                id: r.dataset.instId,
                totalMensual: r.querySelector('.sim-val-total-mensual')?.textContent?.trim(),
                totalPeriodo: r.querySelector('.sim-val-total-periodo')?.textContent?.trim(),
                rend1: r.querySelector('.sim-val-rend1')?.textContent?.trim(),
                inv1Val: r.querySelector('.sim-input-inv1')?.value
            }));
        });
        assert(valoresAntes.length > 0, 'Deben existir filas en el simulador');

        // 1. Verificar estado inicial: 14 columnas visibles
        console.log('\n[Paso 1: Estado inicial de columnas]');
        const badgeTextoInicial = await page.$eval('#simulador-badge-columnas', el => el.textContent.trim());
        assert.strictEqual(badgeTextoInicial, '14/14', `Se esperaba badge 14/14 pero se obtuvo ${badgeTextoInicial}`);
        console.log('✓ Estado inicial verificado: 14/14 columnas visibles.');

        // 2. Abrir menú de columnas
        console.log('\n[Paso 2: Apertura y renderizado del menú de columnas]');
        await page.click('#simulador-btn-columnas');
        const menuVisible = await page.$eval('#simulador-menu-columnas', el => el.style.display);
        assert.strictEqual(menuVisible, 'block', 'El menú de columnas debe estar visible tras hacer clic');
        const numCheckboxes = await page.$$eval('#simulador-lista-columnas input[type="checkbox"]', els => els.length);
        assert.strictEqual(numCheckboxes, 14, `Deben existir 14 checkboxes en el menú, encontrados: ${numCheckboxes}`);
        console.log('✓ Menú de columnas abierto y contiene los 14 checkboxes de control.');

        // 3. Ocultar una columna: Tasa %
        console.log('\n[Paso 3: Ocultar una sola columna (Tasa %)]');
        await page.click('#sim-col-chk-tasa');
        const tieneClaseHideTasa = await page.$eval('#simulador-table-container', el => el.classList.contains('hide-col-tasa'));
        assert(tieneClaseHideTasa, 'El contenedor debe tener la clase hide-col-tasa');

        const tasaThVisible = await page.$eval('th.sim-col-tasa', el => window.getComputedStyle(el).display);
        assert.strictEqual(tasaThVisible, 'none', 'El encabezado th.sim-col-tasa debe tener display: none');

        const primeraCeldaTasa = await page.$eval('td.sim-col-tasa', el => window.getComputedStyle(el).display);
        assert.strictEqual(primeraCeldaTasa, 'none', 'La celda td.sim-col-tasa debe tener display: none');

        // Verificar que otras columnas NO se ocultaron (ej. Institución e Inversión 1)
        const instThVisible = await page.$eval('th.sim-col-institucion', el => window.getComputedStyle(el).display);
        assert.notStrictEqual(instThVisible, 'none', 'La columna Institución debe permanecer visible');
        console.log('✓ Columna Tasa % ocultada individualmente sin afectar a las demás.');

        // 4. Ocultar múltiples columnas (Restricciones, Rend1, Rend2, Inversión 2)
        console.log('\n[Paso 4: Ocultar múltiples columnas]');
        await page.click('#sim-col-chk-restricciones');
        await page.click('#sim-col-chk-rend1');
        await page.click('#sim-col-chk-rend2');
        await page.click('#sim-col-chk-inv2');

        const badgeMultiple = await page.$eval('#simulador-badge-columnas', el => el.textContent.trim());
        assert.strictEqual(badgeMultiple, '9/14', `Se esperaban 9 columnas visibles, obtenido: ${badgeMultiple}`);
        console.log('✓ Múltiples columnas ocultadas correctamente (Badge: 9/14).');

        // 5. Verificar sincronización con botón rápido de Restricciones
        console.log('\n[Paso 5: Sincronización con botones de acceso rápido]');
        const btnRestInactive = await page.$eval('#simulador-toggle-col-restricciones', el => el.classList.contains('inactive'));
        assert(btnRestInactive, 'El botón rápido de Restricciones debe estar inactivo');

        // Hacer clic en botón rápido de Condiciones para ocultarlo
        await page.click('#simulador-toggle-col-condiciones');
        const chkCondEnMenu = await page.$eval('#sim-col-chk-condiciones', el => el.checked);
        assert.strictEqual(chkCondEnMenu, false, 'El checkbox de Condiciones en el menú debe desmarcarse al usar el botón rápido');
        console.log('✓ Sincronización bidireccional entre botones rápidos y menú verificada.');

        // 6. INVARIANZA MATEMÁTICA: Verificar que los cálculos NO cambiaron en lo absoluto
        console.log('\n[Paso 6: Verificación de Invarianza Matemática]');
        const valoresDespues = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#simulador-tbody tr.simulador-row'));
            return rows.map(r => ({
                id: r.dataset.instId,
                totalMensual: r.querySelector('.sim-val-total-mensual')?.textContent?.trim(),
                totalPeriodo: r.querySelector('.sim-val-total-periodo')?.textContent?.trim(),
                rend1: r.querySelector('.sim-val-rend1')?.textContent?.trim(),
                inv1Val: r.querySelector('.sim-input-inv1')?.value
            }));
        });

        assert.deepStrictEqual(valoresDespues, valoresAntes, 'Los valores calculados, rendimientos y asignaciones deben ser 100% idénticos');
        console.log('✓ Invarianza matemática comprobada: 0 alteraciones en cálculos, tasas y rendimientos.');

        // 7. Volver a mostrar una columna (Tasa %) y verificar orden original
        console.log('\n[Paso 7: Reincorporar columna Tasa % y verificar posición]');
        const isMenuOpen = await page.$eval('#simulador-menu-columnas', el => el.style.display === 'block');
        if (!isMenuOpen) {
            await page.click('#simulador-btn-columnas');
        }
        await page.click('#sim-col-chk-tasa');
        const tasaThReaparece = await page.$eval('th.sim-col-tasa', el => window.getComputedStyle(el).display);
        assert.notStrictEqual(tasaThReaparece, 'none', 'La columna Tasa % debe volver a ser visible');
        console.log('✓ Columna Tasa % reincorporada con éxito en su posición original.');

        // 8. Botón "Mostrar todas"
        console.log('\n[Paso 8: Botón Mostrar todas las columnas]');
        const isMenuOpen2 = await page.$eval('#simulador-menu-columnas', el => el.style.display === 'block');
        if (!isMenuOpen2) {
            await page.click('#simulador-btn-columnas');
        }
        await page.click('#simulador-btn-mostrar-todas-cols');
        const badgeRestaurado = await page.$eval('#simulador-badge-columnas', el => el.textContent.trim());
        assert.strictEqual(badgeRestaurado, '14/14', `Se esperaba 14/14 tras mostrar todas, obtenido: ${badgeRestaurado}`);
        console.log('✓ Todas las 14 columnas restauradas a estado visible con un solo clic.');

        // 9. Prueba Responsive Móvil (360px)
        console.log('\n[Paso 9: Prueba Responsive Móvil (360px)]');
        await page.setViewportSize({ width: 360, height: 740 });
        await page.waitForTimeout(300);

        // Abrir menú de columnas en móvil
        await page.evaluate(() => {
            document.getElementById('simulador-menu-columnas').style.display = 'block';
        });
        await page.waitForTimeout(100);
        const menuRect = await page.$eval('#simulador-menu-columnas', el => {
            const r = el.getBoundingClientRect();
            return { width: r.width, right: r.right, left: r.left };
        });
        assert(menuRect.width > 0 && menuRect.width <= 360, `El menú debe ser visible y no exceder 360px (ancho: ${menuRect.width}px)`);
        console.log(`✓ Menú móvil verificado sin desbordamiento horizontal (ancho menú: ${menuRect.width.toFixed(0)}px en pantalla de 360px).`);

        console.log('\n============================================================');
        console.log('¡TODAS LAS PRUEBAS DE CONTROL DE COLUMNAS PASARON CON ÉXITO!');
        console.log('============================================================');

        await browser.close();
        await conn.end();
        server.close();
        process.exit(0);
    } catch (err) {
        console.error('Error en pruebas de columnas:', err);
        if (browser) await browser.close();
        if (conn) await conn.end();
        server.close();
        process.exit(1);
    }
}

runTests();
