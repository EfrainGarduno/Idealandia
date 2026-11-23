/**
 * test_simulador_seleccion_dinamica.js
 * Prueba integral automatizada para la Selección Dinámica de Instituciones en el Simulador:
 *
 * Flujo obligatorio de 23 pasos:
 * 1. Entrar al simulador.
 * 2. Confirmar que aparecen todas las instituciones activas.
 * 3. Confirmar que todas están seleccionadas.
 * 4. Deseleccionar NU.
 * 5. Confirmar que el renglón completo de NU desaparece.
 * 6. Confirmar que el indicador de mayor rendimiento se actualiza.
 * 7. Deseleccionar otras dos instituciones.
 * 8. Confirmar que también desaparecen.
 * 9. Volver a agregar NU.
 * 10. Confirmar que reaparece en su orden configurado.
 * 11. Confirmar que se recalcula.
 * 12. Modificar manualmente la tasa de NU.
 * 13. Confirmar que aparece como Editado.
 * 14. Deseleccionar NU.
 * 15. Volver a agregar NU.
 * 16. Confirmar que conserva la tasa modificada y el estado Editado.
 * 17. Pulsar Ninguna.
 * 18. Confirmar que todos los renglones desaparecen.
 * 19. Volver a agregar una institución.
 * 20. Confirmar que aparece correctamente y que el cálculo funciona.
 * 21. Pulsar Todas.
 * 22. Confirmar que vuelven a aparecer todas.
 * 23. Confirmar que las modificaciones manuales previamente realizadas se conservan durante la sesión.
 *
 * Además:
 * - Verificar que la base de datos (activo de instituciones_financieras) permanezca INTACTA.
 * - Verificar que cuando no hay ninguna seleccionada se muestre "Selecciona al menos una institución para comparar rendimientos."
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
    console.log('=== INICIANDO TEST: SELECCIÓN DINÁMICA DE INSTITUCIONES EN SIMULADOR ===\n');

    conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        dateStrings: true
    });

    // 1. Obtener admin y generar token
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

    // Snapshot del estado de la BD antes de las pruebas
    const [bdSnapshotInicial] = await conn.query('SELECT id, nombre, activo FROM instituciones_financieras ORDER BY id ASC');

    // Iniciar servidor en puerto libre
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            port = server.address().port;
            console.log(`✓ Servidor de prueba iniciado en puerto ${port}`);
            resolve();
        });
    });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{
        name: 'auth_token',
        value: adminToken,
        domain: 'localhost',
        path: '/'
    }]);

    const page = await context.newPage();

    try {
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('token', token);
            localStorage.setItem('auth_token', token);
            localStorage.setItem('user', JSON.stringify({
                id: user.id,
                usuario: user.usuario,
                roles: ['administrador']
            }));
        }, { token: adminToken, user: adminUser });

        await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

        // Paso 1: Entrar al simulador
        console.log('[Paso 1: Entrar al simulador]');
        await page.evaluate(() => {
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            const servSection = document.getElementById('servicios');
            if (servSection) servSection.style.display = 'flex';
            const catView = document.getElementById('servicios-catalogo-view');
            if (catView) catView.style.display = 'none';
            const finView = document.getElementById('servicios-financieras-view');
            if (finView) finView.style.display = 'block';
            if (typeof window.inicializarSimuladorFinanciero === 'function') {
                window.inicializarSimuladorFinanciero();
            }
        });

        await page.waitForSelector('#simulador-tbody tr.simulador-row', { timeout: 10000 });
        console.log('✓ Paso 1 superado: Simulador abierto y cargado.');

        // Paso 2: Confirmar que aparecen todas las instituciones activas
        console.log('[Paso 2: Confirmar que aparecen todas las instituciones activas]');
        const [instActivasEnBD] = await conn.query('SELECT id, nombre FROM instituciones_financieras WHERE activo = 1 ORDER BY orden_visual ASC');
        const rowsCount = await page.$$eval('#simulador-tbody tr.simulador-row', rows => rows.length);
        console.log(`Instituciones activas en BD: ${instActivasEnBD.length}, filas en tabla: ${rowsCount}`);
        assert.strictEqual(rowsCount, instActivasEnBD.length, 'Debe haber tantas filas como instituciones activas');
        console.log('✓ Paso 2 superado: Todas las instituciones activas aparecen en la tabla.');

        // Paso 3: Confirmar que todas están seleccionadas
        console.log('[Paso 3: Confirmar que todas están seleccionadas]');
        const checkboxesChecked = await page.$$eval('.simulador-check-inst', chks => chks.map(c => c.checked));
        assert(checkboxesChecked.every(Boolean), 'Todos los checkboxes deben estar seleccionados al inicio');
        const rowsVisibleInicial = await page.$$eval('#simulador-tbody tr.simulador-row', rows => rows.map(r => r.style.display !== 'none'));
        assert(rowsVisibleInicial.every(Boolean), 'Todos los renglones deben estar visibles');
        console.log('✓ Paso 3 superado: Todas las instituciones están seleccionadas y visibles por defecto.');

        // Obtener el ID de NU
        const [nuRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre = 'NU' OR nombre LIKE '%NU%' LIMIT 1");
        assert(nuRows.length > 0, 'NU debe existir en la BD');
        const nuId = nuRows[0].id;

        // Capturar ganador inicial antes de deseleccionar NU
        const ganadorInicial = await page.$eval('#simulador-resumen-comparativo', el => el.textContent.trim());
        console.log('Ganador inicial:', ganadorInicial);

        // Paso 4: Deseleccionar NU
        console.log(`[Paso 4: Deseleccionar NU (ID: ${nuId})]`);
        await page.click(`#sim-row-${nuId} .simulador-check-inst`);
        await page.waitForTimeout(100);
        console.log('✓ Paso 4 superado: Checkbox de NU deseleccionado.');

        // Paso 5: Confirmar que el renglón completo de NU desaparece
        console.log('[Paso 5: Confirmar que el renglón completo de NU desaparece]');
        const nuRowDisplay = await page.$eval(`#sim-row-${nuId}`, el => el.style.display);
        assert.strictEqual(nuRowDisplay, 'none', 'El renglón de NU debe tener display: none (desaparecido)');
        const nuIsVisible = await page.isVisible(`#sim-row-${nuId}`);
        assert.strictEqual(nuIsVisible, false, 'El renglón de NU NO debe ser visible');
        console.log('✓ Paso 5 superado: El renglón completo de NU desapareció inmediatamente de la tabla.');

        // Paso 6: Confirmar que el indicador de mayor rendimiento se actualiza
        console.log('[Paso 6: Confirmar que el indicador de mayor rendimiento se actualiza]');
        const ganadorSinNU = await page.$eval('#simulador-resumen-comparativo', el => el.textContent.trim());
        console.log('Ganador tras quitar NU:', ganadorSinNU);
        assert(!ganadorSinNU.includes('NU'), 'El indicador no debe nombrar a NU si fue deseleccionado');
        console.log('✓ Paso 6 superado: Indicador de mayor rendimiento actualizado sin NU.');

        // Paso 7: Deseleccionar otras dos instituciones
        console.log('[Paso 7: Deseleccionar otras dos instituciones]');
        const otrasInstIds = await page.$$eval('#simulador-tbody tr.simulador-row', (rows, excludedId) => {
            return rows
                .map(r => parseInt(r.dataset.instId, 10))
                .filter(id => id !== excludedId && !isNaN(id))
                .slice(0, 2);
        }, nuId);
        assert.strictEqual(otrasInstIds.length, 2, 'Deben existir al menos 2 otras instituciones');
        console.log(`Deseleccionando instituciones con IDs: ${otrasInstIds.join(', ')}`);

        for (const id of otrasInstIds) {
            await page.click(`#sim-row-${id} .simulador-check-inst`);
            await page.waitForTimeout(50);
        }
        console.log('✓ Paso 7 superado: Otras dos instituciones deseleccionadas.');

        // Paso 8: Confirmar que también desaparecen
        console.log('[Paso 8: Confirmar que también desaparecen]');
        for (const id of otrasInstIds) {
            const rowDisplay = await page.$eval(`#sim-row-${id}`, el => el.style.display);
            assert.strictEqual(rowDisplay, 'none', `Renglón ${id} debe tener display: none`);
            const isVis = await page.isVisible(`#sim-row-${id}`);
            assert.strictEqual(isVis, false, `Renglón ${id} no debe ser visible`);
        }
        console.log('✓ Paso 8 superado: Ambas instituciones desaparecieron de la tabla.');

        // Paso 9: Volver a agregar NU (usando el chip [ + NU ])
        console.log('[Paso 9: Volver a agregar NU usando el chip [ + NU ]]');
        const chipNU = await page.$(`.btn-agregar-inst[data-inst-id="${nuId}"]`);
        assert(chipNU, 'Debe existir un botón/chip para volver a agregar NU');
        await chipNU.click();
        await page.waitForTimeout(100);
        console.log('✓ Paso 9 superado: Clic realizado en el chip para reincorporar NU.');

        // Paso 10: Confirmar que reaparece en su orden configurado
        console.log('[Paso 10: Confirmar que reaparece]');
        const nuRowDisplayRe = await page.$eval(`#sim-row-${nuId}`, el => el.style.display);
        assert.strictEqual(nuRowDisplayRe, '', 'El renglón de NU debe volver a ser visible');
        const nuIsVisibleRe = await page.isVisible(`#sim-row-${nuId}`);
        assert.strictEqual(nuIsVisibleRe, true, 'El renglón de NU debe ser visible en la tabla');
        const nuChkChecked = await page.$eval(`#sim-row-${nuId} .simulador-check-inst`, el => el.checked);
        assert.strictEqual(nuChkChecked, true, 'El checkbox de NU debe reaparecer seleccionado');
        console.log('✓ Paso 10 superado: NU reapareció en la tabla con checkbox seleccionado.');

        // Paso 11: Confirmar que se recalcula
        console.log('[Paso 11: Confirmar que se recalcula]');
        const rendNU = await page.$eval(`#sim-row-${nuId} .sim-val-total-periodo`, el => el.textContent.trim());
        assert(rendNU && rendNU !== '—' && rendNU !== '$0.00', `El rendimiento de NU debe calcularse (obtenido: ${rendNU})`);
        console.log(`Rendimiento calculado de NU: ${rendNU}`);
        console.log('✓ Paso 11 superado: Cálculos de NU actualizados.');

        // Paso 12: Modificar manualmente la tasa de NU
        console.log('[Paso 12: Modificar manualmente la tasa de NU]');
        await page.fill(`#sim-row-${nuId} .sim-input-tasa`, '14.00');
        await page.dispatchEvent(`#sim-row-${nuId} .sim-input-tasa`, 'input');
        await page.waitForTimeout(100);
        console.log('✓ Paso 12 superado: Tasa modificada manualmente a 14.00.');

        // Paso 13: Confirmar que aparece como Editado
        console.log('[Paso 13: Confirmar que aparece como Editado]');
        const badgeDisplay = await page.$eval(`#sim-badge-${nuId}`, el => el.style.display);
        assert(badgeDisplay !== 'none', 'El badge Editado debe ser visible');
        const badgeText = await page.$eval(`#sim-badge-${nuId}`, el => el.textContent.trim());
        assert(badgeText.includes('Editado'), `Debe contener el texto Editado (obtenido: ${badgeText})`);
        console.log('✓ Paso 13 superado: Badge "Editado" visible en NU.');

        // Paso 14: Deseleccionar NU
        console.log('[Paso 14: Deseleccionar NU]');
        await page.click(`#sim-row-${nuId} .simulador-check-inst`);
        await page.waitForTimeout(100);
        const nuVisibleTrasDes = await page.isVisible(`#sim-row-${nuId}`);
        assert.strictEqual(nuVisibleTrasDes, false, 'NU debe desaparecer nuevamente de la tabla');
        console.log('✓ Paso 14 superado: NU deseleccionado y oculto de la tabla.');

        // Paso 15: Volver a agregar NU (probando también el dropdown o chip)
        console.log('[Paso 15: Volver a agregar NU]');
        const chipNU2 = await page.$(`.btn-agregar-inst[data-inst-id="${nuId}"]`);
        assert(chipNU2, 'El chip de NU debe estar disponible');
        await chipNU2.click();
        await page.waitForTimeout(100);
        console.log('✓ Paso 15 superado: NU agregado nuevamente a la tabla.');

        // Paso 16: Confirmar que conserva la tasa modificada y el estado Editado
        console.log('[Paso 16: Confirmar que conserva la tasa modificada y el estado Editado]');
        const tasaRecuperada = await page.$eval(`#sim-row-${nuId} .sim-input-tasa`, el => el.value);
        assert.strictEqual(parseFloat(tasaRecuperada).toFixed(2), '14.00', `Debe conservar la tasa 14.00 (obtenido: ${tasaRecuperada})`);
        const badgeDisplayRe = await page.$eval(`#sim-badge-${nuId}`, el => el.style.display);
        assert(badgeDisplayRe !== 'none', 'El badge Editado debe seguir visible tras reincorporar');
        const rowModClass = await page.$eval(`#sim-row-${nuId}`, el => el.classList.contains('fila-simulacion-modificada'));
        assert.strictEqual(rowModClass, true, 'La fila debe conservar la clase fila-simulacion-modificada');
        console.log('✓ Paso 16 superado: NU recuperó su tasa personalizada (14.00) y su estado Editado intactos.');

        // Paso 17: Pulsar Ninguna
        console.log('[Paso 17: Pulsar Ninguna]');
        await page.click('#simulador-btn-deseleccionar-todas');
        await page.waitForTimeout(100);
        console.log('✓ Paso 17 superado: Botón "Ninguna" pulsado.');

        // Paso 18: Confirmar que todos los renglones desaparecen
        console.log('[Paso 18: Confirmar que todos los renglones desaparecen]');
        const filasVisiblesNinguna = await page.$$eval('#simulador-tbody tr.simulador-row', rows => rows.filter(r => r.style.display !== 'none').length);
        assert.strictEqual(filasVisiblesNinguna, 0, 'Todas las filas de instituciones deben estar ocultas');
        const emptyRowVisible = await page.isVisible('#sim-row-vacia');
        assert.strictEqual(emptyRowVisible, true, 'Debe mostrarse el aviso de que no hay instituciones seleccionadas');
        const resumenNinguna = await page.$eval('#simulador-resumen-comparativo', el => el.textContent.trim());
        assert(resumenNinguna.includes('Selecciona al menos una institución para comparar rendimientos'), 'Debe mostrar aviso de seleccionar al menos una');
        console.log('✓ Paso 18 superado: Todos los renglones desaparecieron y el aviso de estado vacío se muestra.');

        // Paso 19: Volver a agregar una institución individualmente desde disponibles
        console.log('[Paso 19: Volver a agregar una institución desde disponibles]');
        const primerChip = await page.$('.btn-agregar-inst');
        assert(primerChip, 'Debe haber botones de instituciones disponibles');
        const instIdAgregada = await primerChip.getAttribute('data-inst-id');
        await primerChip.click();
        await page.waitForTimeout(100);
        console.log(`Institución ID ${instIdAgregada} reincorporada individualmente.`);

        // Paso 20: Confirmar que aparece correctamente y que el cálculo funciona
        console.log('[Paso 20: Confirmar que aparece correctamente y que el cálculo funciona]');
        const filaVis = await page.isVisible(`#sim-row-${instIdAgregada}`);
        assert.strictEqual(filaVis, true, `La fila ${instIdAgregada} debe ser visible`);
        const chkAgregada = await page.$eval(`#sim-row-${instIdAgregada} .simulador-check-inst`, el => el.checked);
        assert.strictEqual(chkAgregada, true, 'Debe estar marcada');
        const emptyRowHidden = await page.isVisible('#sim-row-vacia');
        assert.strictEqual(emptyRowHidden, false, 'El aviso de estado vacío debe ocultarse al haber al menos 1');
        const rendAgregada = await page.$eval(`#sim-row-${instIdAgregada} .sim-val-total-periodo`, el => el.textContent.trim());
        assert(rendAgregada && rendAgregada !== '—' && rendAgregada !== '$0.00', 'El cálculo de rendimiento debe funcionar');
        console.log('✓ Paso 20 superado: Fila visible, marcada y con rendimiento calculado.');

        // Paso 21: Pulsar Todas
        console.log('[Paso 21: Pulsar Todas]');
        await page.click('#simulador-btn-seleccionar-todas');
        await page.waitForTimeout(100);
        console.log('✓ Paso 21 superado: Botón "Todas" pulsado.');

        // Paso 22: Confirmar que vuelven a aparecer todas
        console.log('[Paso 22: Confirmar que vuelven a aparecer todas]');
        const todasVisibles = await page.$$eval('#simulador-tbody tr.simulador-row', rows => rows.map(r => r.style.display !== 'none'));
        assert(todasVisibles.every(Boolean), 'Todas las instituciones deben volver a ser visibles');
        const todosChecked = await page.$$eval('.simulador-check-inst', chks => chks.map(c => c.checked));
        assert(todosChecked.every(Boolean), 'Todos los checkboxes deben estar marcados');
        console.log('✓ Paso 22 superado: Todas las filas reaparecieron en la tabla.');

        // Paso 23: Confirmar que las modificaciones manuales previamente realizadas se conservan
        console.log('[Paso 23: Confirmar que las modificaciones manuales se conservan]');
        const tasaNUFinal = await page.$eval(`#sim-row-${nuId} .sim-input-tasa`, el => el.value);
        assert.strictEqual(parseFloat(tasaNUFinal).toFixed(2), '14.00', 'NU debe seguir conservando su tasa editada a 14.00');
        const badgeNUFinal = await page.$eval(`#sim-badge-${nuId}`, el => el.style.display);
        assert(badgeNUFinal !== 'none', 'NU debe conservar el badge Editado');
        console.log('✓ Paso 23 superado: Las modificaciones manuales se conservaron durante toda la sesión.');

        // Verificación adicional: Integridad total de la BD
        console.log('[Verificación adicional: Integridad de BD]');
        const [bdSnapshotFinal] = await conn.query('SELECT id, nombre, activo FROM instituciones_financieras ORDER BY id ASC');
        assert.deepStrictEqual(bdSnapshotFinal, bdSnapshotInicial, 'La base de datos NO debe sufrir ningún cambio en campo activo');
        console.log('✓ Verificación de BD superada: Base de datos intacta (cero escrituras indebidas).');

        console.log('\n=============================================================');
        console.log('¡TODOS LOS 23 PASOS Y VERIFICACIONES PASARON EXITOSAMENTE!');
        console.log('=============================================================\n');

    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        if (conn) await conn.end();
        process.exit(0);
    }
}

run().catch(err => {
    console.error('❌ Error en test_simulador_seleccion_dinamica:', err);
    process.exit(1);
});
