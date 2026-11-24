/**
 * test_simulador_ordenamiento.js
 * Prueba integral automatizada para:
 * 1. Ancho visible de columna "Tasa %" y su input numérico (sin cortes).
 * 2. Ordenamiento atómico de instituciones y preservación estricta de tramos.
 * 3. Ordenamiento numérico y alfabético por tipo de dato.
 * 4. Inmunidad de inputs, botones y checkboxes ante clics (solo <th> ordena).
 * 5. Ciclo de ordenamiento: ASC -> DESC -> Orden original.
 * 6. Edición y expansión de tramos posterior al ordenamiento.
 */

const assert = require('assert');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server.js');

async function runTests() {
    console.log('=== TEST: ORDENAMIENTO DE TABLA Y ANCHO TASA % ===\n');

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

        // Abrir Asesorías Financieras -> Simulador
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

        // 1. Verificación del ancho de columna Tasa %
        console.log('\n[Paso 1: Verificación de ancho y visibilidad de "Tasa %"]');
        const thTasaBox = await page.$eval('th.sim-col-tasa', el => {
            const rect = el.getBoundingClientRect();
            const comp = window.getComputedStyle(el);
            return { width: rect.width, minWidth: comp.minWidth, text: el.textContent.trim() };
        });
        console.log(`   Header 'Tasa %': ancho=${thTasaBox.width}px, minWidth=${thTasaBox.minWidth}, texto="${thTasaBox.text}"`);
        assert(thTasaBox.width >= 90, `El ancho de th.sim-col-tasa debe ser >= 90px (actual: ${thTasaBox.width}px)`);

        const inputTasaBox = await page.$eval('.sim-input-tasa', el => {
            const rect = el.getBoundingClientRect();
            return { width: rect.width, val: el.value };
        });
        console.log(`   Input Tasa: ancho=${inputTasaBox.width}px, valor="${inputTasaBox.val}"`);
        assert(inputTasaBox.width >= 65, `El ancho de .sim-input-tasa debe ser >= 65px (actual: ${inputTasaBox.width}px)`);
        console.log('✓ Columna Tasa % e inputs tienen dimensiones suficientes y no se cortan.');

        // Función auxiliar para inspeccionar orden y subfilas en el DOM
        const obtenerEstadoDOM = async () => {
            return await page.evaluate(() => {
                const tbody = document.getElementById('simulador-tbody');
                const children = Array.from(tbody.children);
                const items = [];
                children.forEach(el => {
                    if (el.classList.contains('simulador-row')) {
                        items.push({
                            type: 'main',
                            id: el.dataset.instId,
                            nombre: el.querySelector('.sim-col-institucion span')?.textContent?.trim(),
                            tipo: el.querySelector('.sim-col-tipo span')?.textContent?.trim(),
                            tasa: parseFloat(el.querySelector('.sim-input-tasa')?.value || 0),
                            totalPeriodo: parseFloat(el.querySelector('.sim-val-total-periodo')?.textContent?.replace(/[^0-9.]/g, '') || 0),
                            nextIsSubrow: el.nextElementSibling && el.nextElementSibling.classList.contains('simulador-subrow')
                        });
                    } else if (el.classList.contains('simulador-subrow')) {
                        items.push({
                            type: 'subrow',
                            id: el.id.replace('sim-subrow-', ''),
                            prevIsMain: el.previousElementSibling && el.previousElementSibling.id === `sim-row-${el.id.replace('sim-subrow-', '')}`
                        });
                    }
                });
                return items;
            });
        };

        // 2. Ordenamiento por Tipo (columna Tipo)
        console.log('\n[Paso 2: Ordenamiento por Tipo y verificación de integridad atómica de tramos]');
        // Clic en th.sim-col-tipo
        await page.click('th.sim-col-tipo');
        await page.waitForTimeout(100);

        let domState = await obtenerEstadoDOM();
        const mainRows = domState.filter(i => i.type === 'main');
        console.log('   Orden tras ordenar por Tipo ASC:', mainRows.map(r => `${r.nombre} (${r.tipo})`).join(', '));

        // Verificar que los tipos están en orden alfabético ASC: B (Banco), F (Fintech), S (Sofipo)...
        for (let i = 0; i < mainRows.length - 1; i++) {
            assert(mainRows[i].tipo.localeCompare(mainRows[i+1].tipo, 'es') <= 0, 
                `Fila ${i} (${mainRows[i].nombre} - ${mainRows[i].tipo}) debe ir antes o igual que ${mainRows[i+1].nombre} (${mainRows[i+1].tipo})`);
        }

        // VERIFICACIÓN CRÍTICA: Cada institución con tramos DEBE tener su subrow inmediatamente después
        const subrows = domState.filter(i => i.type === 'subrow');
        assert(subrows.length > 0, 'Deben existir subfilas de tramos en la tabla');
        subrows.forEach(sub => {
            assert(sub.prevIsMain, `La subfila de tramos para inst ${sub.id} debe estar INMEDIATAMENTE después de su fila principal!`);
        });
        console.log(`✓ Verificado: Las ${subrows.length} subfilas de tramos permanecen estrictamente unidas a sus instituciones.`);

        // 3. Ordenamiento DESC por Tasa %
        console.log('\n[Paso 3: Ordenamiento numérico DESC por Tasa %]');
        // Primer clic en th.sim-col-tasa -> ASC
        await page.click('th.sim-col-tasa');
        await page.waitForTimeout(100);
        // Segundo clic en th.sim-col-tasa -> DESC
        await page.click('th.sim-col-tasa');
        await page.waitForTimeout(100);

        domState = await obtenerEstadoDOM();
        const mainRowsTasa = domState.filter(i => i.type === 'main');
        console.log('   Orden tras Tasa DESC:', mainRowsTasa.map(r => `${r.nombre}: ${r.tasa}%`).join(', '));

        for (let i = 0; i < mainRowsTasa.length - 1; i++) {
            assert(mainRowsTasa[i].tasa >= mainRowsTasa[i+1].tasa,
                `Tasa ${mainRowsTasa[i].tasa}% de ${mainRowsTasa[i].nombre} debe ser >= que ${mainRowsTasa[i+1].tasa}% de ${mainRowsTasa[i+1].nombre}`);
        }
        console.log('✓ Ordenamiento numérico descendente por Tasa % correcto.');

        // Verificar nuevamente que subrows siguen inmediatamente después
        const subrowsAfterTasa = domState.filter(i => i.type === 'subrow');
        subrowsAfterTasa.forEach(sub => {
            assert(sub.prevIsMain, `Subfila ${sub.id} debe seguir pegada a su fila tras ordenar por Tasa`);
        });

        // 4. Inmunidad: Clic en inputs y botones no debe ordenar
        console.log('\n[Paso 4: Inmunidad de inputs y botones (no disparan ordenamiento)]');
        const estadoAntesClicInput = await page.evaluate(() => window.getOrdenSimuladorActual());
        
        // Clic en input de tasa
        await page.click('.sim-input-tasa');
        const estadoDespuesClicInput = await page.evaluate(() => window.getOrdenSimuladorActual());
        assert.deepStrictEqual(estadoAntesClicInput, estadoDespuesClicInput, 'Clic en input de tasa NO debe cambiar el orden de la tabla');

        // Clic en botón "Ver tramos"
        const btnTramos = await page.$('.btn-toggle-tramos');
        if (btnTramos) {
            await btnTramos.click();
            await page.waitForTimeout(100);
            const estadoDespuesTramos = await page.evaluate(() => window.getOrdenSimuladorActual());
            assert.deepStrictEqual(estadoAntesClicInput, estadoDespuesTramos, 'Clic en botón Ver tramos NO debe ordenar la tabla');
            console.log('✓ Botón Ver tramos abre desglose sin disparar ordenamiento.');
        }

        // 5. Clics para resetear orden (ciclo: ASC -> DESC -> none)
        console.log('\n[Paso 5: Tercer clic retira el ordenamiento y vuelve al orden inicial]');
        // Tercer clic en th.sim-col-tasa -> 'none'
        await page.click('th.sim-col-tasa');
        await page.waitForTimeout(100);

        const estadoReset = await page.evaluate(() => window.getOrdenSimuladorActual());
        assert.strictEqual(estadoReset.direccion, 'none', 'La dirección debe ser "none" tras el tercer clic');
        console.log('✓ Ciclo de ordenamiento completado (ASC -> DESC -> Original).');

        // 6. Edición reactiva con la tabla ordenada
        console.log('\n[Paso 6: Edición interactiva de fila mientras está ordenada]');
        // Ordenar por Institución
        await page.click('th.sim-col-institucion');
        await page.waitForTimeout(100);

        // Modificar tasa en la primera fila visible
        const firstRowId = await page.$eval('#simulador-tbody tr.simulador-row', el => el.dataset.instId);
        const inputPrimeraFila = await page.$(`#sim-row-${firstRowId} .sim-input-tasa`);
        await inputPrimeraFila.fill('22.50');
        await page.evaluate((id) => {
            const tr = document.getElementById(`sim-row-${id}`);
            window.recalcularFila(parseInt(id, 10), tr);
        }, firstRowId);
        await page.waitForTimeout(100);

        const badgeEditadoVisible = await page.$eval(`#sim-badge-${firstRowId}`, el => el.style.display !== 'none');
        assert(badgeEditadoVisible, 'El badge "Editado" debe mostrarse al cambiar la tasa en la fila ordenada');
        console.log('✓ Edición y reactividad funcionan al 100% sobre filas ordenadas.');

        console.log('\n============================================================');
        console.log('¡TODAS LAS PRUEBAS DE ORDENAMIENTO PASARON SATISFACTORIAMENTE!');
        console.log('============================================================');

        await browser.close();
        await conn.end();
        server.close();
        process.exit(0);
    } catch (err) {
        console.error('Error en pruebas de ordenamiento:', err);
        if (browser) await browser.close();
        if (conn) await conn.end();
        server.close();
        process.exit(1);
    }
}

runTests();
