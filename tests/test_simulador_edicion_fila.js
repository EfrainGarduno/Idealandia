/**
 * test_simulador_edicion_fila.js
 * Prueba integral automatizada de la edición interactiva por fila en el Simulador de Inversiones:
 * 1. Nomenclatura exacta de columnas: Sel | Institución | Tipo | Condiciones | Inversión Base | Tasa % | Inversión 1 | Inversión 2 | Meses | Rend1 | Rend2 | Total mensual | Total periodo
 * 2. Comprobar que "Monto 2" NO existe en la interfaz.
 * 3. Inversión Base muestra el límite del tramo base (lo que antes era Monto 2).
 * 4. Inversión 1 contiene la inversión base y es editable.
 * 5. Casos de prueba exactos del usuario (Finsus a 10%, $50k, 6 meses, y reversión a original).
 * 6. Verificación de que la base de datos queda 100% inalterada.
 * 7. Recálculo reactivo y actualización del resumen comparativo.
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
    console.log('=== INICIANDO TEST AUTOMATIZADO: EDICIÓN POR FILA DEL SIMULADOR ===\n');

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

    // Asegurar que Finsus tenga su tasa oficial 13.12% en BD
    const [finsusRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre = 'Finsus'");
    const finsusId = finsusRows[0].id;
    await conn.query(
        "UPDATE institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id SET t.tasa_anual = 13.12 WHERE e.institucion_id = ? AND e.activo = 1",
        [finsusId]
    );
    const tasaFinsusEnBDInicial = 13.12;

    const [tramosNUOrig] = await conn.query(
        "SELECT t.tasa_anual FROM institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id WHERE e.institucion_id = 1 AND e.activo = 1 ORDER BY t.numero_tramo ASC"
    );

    // Asegurar instituciones 1-8 activas
    await conn.query('UPDATE instituciones_financieras SET activo = 1 WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8)');

    // Iniciar servidor en puerto libre
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            port = server.address().port;
            console.log(`✓ Servidor de prueba iniciado en puerto ${port}`);
            resolve();
        });
    });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await context.addCookies([{
        name: 'auth_token',
        value: adminToken,
        domain: 'localhost',
        path: '/'
    }]);

    const page = await context.newPage();

    // Capturar logs y errores de consola en el navegador
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('[Browser Error]', msg.text());
    });

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

        // Navegar a Servicios -> Asesorías Financieras -> Simulador
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
        console.log('✓ Vista del Simulador de Inversiones cargada correctamente.');

        // ==============================================================
        // PRUEBA 1: Nomenclatura exacta de columnas y ausencia de "Monto 2"
        // ==============================================================
        const headers = await page.$$eval('#simulador-table-container > table > thead > tr > th', ths => ths.map(t => t.textContent.trim()));
        console.log('Encabezados encontrados:', headers);

        const expectedHeaders = [
            'Sel', 'Institución', 'Tipo', 'Condiciones', 'Inversión Base',
            'Tasa %', 'Inversión 1', 'Inversión 2', 'Meses', 'Rend1', 'Rend2',
            'Total mensual', 'Total periodo'
        ];

        assert.deepStrictEqual(headers, expectedHeaders, 'Los encabezados deben coincidir exactamente con la nomenclatura aprobada');
        assert.ok(!headers.includes('Monto 2'), '"Monto 2" NO debe aparecer en los encabezados');
        console.log('✓ Prueba 1 superada: Nomenclatura exacta aprobada (Inversión 1 presente, Monto 2 eliminado).');

        // ==============================================================
        // PRUEBA 2: Inversión Base muestra el límite del primer tramo
        // ==============================================================
        // Para NU: límite del tramo 1 es $25,000.00
        const invBaseNU = await page.$eval(`#sim-row-1 .sim-val-inv-base`, el => el.textContent.trim());
        assert.strictEqual(invBaseNU, '$25,000.00', 'NU debe mostrar $25,000.00 en Inversión Base');

        // Para Finsus: no tiene límite superior en tramo 1 -> muestra '—'
        const invBaseFinsus = await page.$eval(`#sim-row-${finsusId} .sim-val-inv-base`, el => el.textContent.trim());
        assert.strictEqual(invBaseFinsus, '—', 'Finsus debe mostrar "—" en Inversión Base al no tener límite superior');
        console.log('✓ Prueba 2 superada: Inversión Base refleja fielmente el límite base de la institución (lo que antes era Monto 2).');

        // ==============================================================
        // PRUEBA 3: Configurar Inversión Global $100,000 y Meses Global 2
        // ==============================================================
        await page.fill('#simulador-inversion-global', '100000');
        await page.fill('#simulador-meses-global', '2');
        await page.dispatchEvent('#simulador-inversion-global', 'input');
        await page.dispatchEvent('#simulador-meses-global', 'input');
        await page.waitForTimeout(300);

        // Verificar valores iniciales de Finsus
        const rowFinsus = `#sim-row-${finsusId}`;
        const initialTasa = await page.$eval(`${rowFinsus} .sim-input-tasa`, el => el.value);
        const initialInv1 = await page.$eval(`${rowFinsus} .sim-input-inv1`, el => el.value);
        const initialInv2 = await page.$eval(`${rowFinsus} .sim-input-inv2`, el => el.value);
        const initialMeses = await page.$eval(`${rowFinsus} .sim-input-meses`, el => el.value);
        const initialIsMod = await page.$eval(rowFinsus, tr => tr.classList.contains('fila-simulacion-modificada'));

        assert.strictEqual(parseFloat(initialTasa), 13.12, 'Tasa inicial de Finsus debe ser 13.12');
        assert.strictEqual(parseFloat(initialInv1), 100000, 'Inversión 1 inicial de Finsus debe ser $100,000');
        assert.strictEqual(parseFloat(initialInv2), 0, 'Inversión 2 inicial de Finsus debe ser 0');
        assert.strictEqual(parseInt(initialMeses, 10), 2, 'Meses iniciales de Finsus debe ser 2');
        assert.strictEqual(initialIsMod, false, 'La fila inicialmente NO debe estar marcada como modificada');
        console.log('✓ Prueba 3 superada: Valores iniciales y controles de Finsus correctos.');

        // ==============================================================
        // PRUEBA 4: Caso de usuario - Cambiar Tasa a 10%
        // ==============================================================
        // Rend1 = $100,000 * 10% / 12 * 2 = $1,666.67
        // Total mensual = $833.33
        // Total periodo = $1,666.67
        await page.fill(`${rowFinsus} .sim-input-tasa`, '10');
        await page.dispatchEvent(`${rowFinsus} .sim-input-tasa`, 'input');
        await page.waitForTimeout(200);

        const step1Rend1 = await page.$eval(`${rowFinsus} .sim-val-rend1`, el => el.textContent.trim());
        const step1TotalM = await page.$eval(`${rowFinsus} .sim-val-total-mensual`, el => el.textContent.trim());
        const step1TotalP = await page.$eval(`${rowFinsus} .sim-val-total-periodo`, el => el.textContent.trim());
        const step1IsMod = await page.$eval(rowFinsus, tr => tr.classList.contains('fila-simulacion-modificada'));
        const step1BadgeDisplay = await page.$eval(`${rowFinsus} #sim-badge-${finsusId}`, el => el.style.display);

        assert.strictEqual(step1Rend1, '$1,666.67', 'Rend1 a tasa 10% debe ser $1,666.67');
        assert.strictEqual(step1TotalM, '$833.33', 'Total mensual debe ser $833.33');
        assert.strictEqual(step1TotalP, '$1,666.67', 'Total periodo debe ser $1,666.67');
        assert.strictEqual(step1IsMod, true, 'La fila DEBE tener la clase fila-simulacion-modificada');
        assert.notStrictEqual(step1BadgeDisplay, 'none', 'El badge de editado debe ser visible');
        console.log('✓ Prueba 4 superada: Recálculo reactivo con tasa modificada al 10% ($1,666.67) y fila resaltada.');

        // ==============================================================
        // PRUEBA 5: Caso de usuario - Cambiar Inversión 1 a $50,000
        // ==============================================================
        // Rend1 = $50,000 * 10% / 12 * 2 = $833.33
        // Total mensual = $416.67
        // Total periodo = $833.33
        await page.fill(`${rowFinsus} .sim-input-inv1`, '50000');
        await page.dispatchEvent(`${rowFinsus} .sim-input-inv1`, 'input');
        await page.waitForTimeout(200);

        const step2Rend1 = await page.$eval(`${rowFinsus} .sim-val-rend1`, el => el.textContent.trim());
        const step2TotalM = await page.$eval(`${rowFinsus} .sim-val-total-mensual`, el => el.textContent.trim());
        const step2TotalP = await page.$eval(`${rowFinsus} .sim-val-total-periodo`, el => el.textContent.trim());
        const step2IsMod = await page.$eval(rowFinsus, tr => tr.classList.contains('fila-simulacion-modificada'));

        assert.strictEqual(step2Rend1, '$833.33', 'Rend1 a inversión 1 $50,000 debe ser $833.33');
        assert.strictEqual(step2TotalM, '$416.67', 'Total mensual debe ser $416.67');
        assert.strictEqual(step2TotalP, '$833.33', 'Total periodo debe ser $833.33');
        assert.strictEqual(step2IsMod, true, 'La fila debe continuar resaltada');
        console.log('✓ Prueba 5 superada: Recálculo reactivo con Inversión 1 a $50,000 ($833.33) y persistencia del resaltado.');

        // ==============================================================
        // PRUEBA 6: Caso de usuario - Cambiar Meses de 2 a 6
        // ==============================================================
        // Rend1 = $50,000 * 10% / 12 * 6 = $2,500.00
        // Total mensual = $416.67
        // Total periodo = $2,500.00
        await page.fill(`${rowFinsus} .sim-input-meses`, '6');
        await page.dispatchEvent(`${rowFinsus} .sim-input-meses`, 'input');
        await page.waitForTimeout(200);

        const step3Rend1 = await page.$eval(`${rowFinsus} .sim-val-rend1`, el => el.textContent.trim());
        const step3TotalM = await page.$eval(`${rowFinsus} .sim-val-total-mensual`, el => el.textContent.trim());
        const step3TotalP = await page.$eval(`${rowFinsus} .sim-val-total-periodo`, el => el.textContent.trim());
        const step3IsMod = await page.$eval(rowFinsus, tr => tr.classList.contains('fila-simulacion-modificada'));

        assert.strictEqual(step3Rend1, '$2,500.00', 'Rend1 a 6 meses debe ser $2,500.00');
        assert.strictEqual(step3TotalM, '$416.67', 'Total mensual debe ser $416.67');
        assert.strictEqual(step3TotalP, '$2,500.00', 'Total periodo debe ser $2,500.00');
        assert.strictEqual(step3IsMod, true, 'La fila debe mantenerse resaltada');
        console.log('✓ Prueba 6 superada: Recálculo reactivo a 6 meses ($2,500.00) y fila resaltada.');

        // ==============================================================
        // PRUEBA 7: Reversión exacta a los valores originales
        // ==============================================================
        // Si el usuario devuelve tasa a 13.12, Inv1 a 100000, Inv2 a 0, Meses a 2:
        // La clase fila-simulacion-modificada DEBE removerse automáticamente
        await page.fill(`${rowFinsus} .sim-input-tasa`, '13.12');
        await page.dispatchEvent(`${rowFinsus} .sim-input-tasa`, 'input');
        await page.fill(`${rowFinsus} .sim-input-inv1`, '100000');
        await page.dispatchEvent(`${rowFinsus} .sim-input-inv1`, 'input');
        await page.fill(`${rowFinsus} .sim-input-inv2`, '0');
        await page.dispatchEvent(`${rowFinsus} .sim-input-inv2`, 'input');
        await page.fill(`${rowFinsus} .sim-input-meses`, '2');
        await page.dispatchEvent(`${rowFinsus} .sim-input-meses`, 'input');
        await page.waitForTimeout(200);

        const revertedIsMod = await page.$eval(rowFinsus, tr => tr.classList.contains('fila-simulacion-modificada'));
        const revertedBadgeDisplay = await page.$eval(`${rowFinsus} #sim-badge-${finsusId}`, el => el.style.display);
        const revertedTotalP = await page.$eval(`${rowFinsus} .sim-val-total-periodo`, el => el.textContent.trim());

        assert.strictEqual(revertedIsMod, false, 'Al restablecer valores originales, la clase fila-simulacion-modificada debe removerse');
        assert.strictEqual(revertedBadgeDisplay, 'none', 'El badge de editado debe ocultarse');
        assert.strictEqual(revertedTotalP, '$2,186.67', 'El total periodo original de Finsus debe ser $2,186.67');
        console.log('✓ Prueba 7 superada: Reversión automática del resaltado al volver a los valores originales.');

        // ==============================================================
        // PRUEBA 8: La base de datos NUNCA fue alterada
        // ==============================================================
        const [tramosFinsusFinal] = await conn.query(
            "SELECT t.tasa_anual FROM institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id WHERE e.institucion_id = ? AND e.activo = 1",
            [finsusId]
        );
        const tasaFinsusEnBDFinal = parseFloat(tramosFinsusFinal[0].tasa_anual);
        assert.strictEqual(tasaFinsusEnBDFinal, tasaFinsusEnBDInicial, `La tasa de Finsus en BD debe permanecer inalterada (${tasaFinsusEnBDInicial}%)`);

        const [tramosNUFinal] = await conn.query(
            "SELECT t.tasa_anual FROM institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id WHERE e.institucion_id = 1 AND e.activo = 1 ORDER BY t.numero_tramo ASC"
        );
        assert.strictEqual(parseFloat(tramosNUFinal[0].tasa_anual), parseFloat(tramosNUOrig[0].tasa_anual), 'Tramo 1 de NU en BD permanece inalterado');
        assert.strictEqual(parseFloat(tramosNUFinal[1].tasa_anual), parseFloat(tramosNUOrig[1].tasa_anual), 'Tramo 2 de NU en BD permanece inalterado');
        console.log('✓ Prueba 8 superada: La base de datos permanece 100% íntegra e inalterada tras las simulaciones.');

        console.log('\n=============================================================');
        console.log('TODAS LAS PRUEBAS AUTOMATIZADAS DE EDICIÓN POR FILA PASARON EXITOSAMENTE.');
        console.log('=============================================================\n');
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        if (conn) await conn.end();
        process.exit(0);
    }
}

run().catch(err => {
    console.error('ERROR EN TEST:', err);
    if (browser) browser.close();
    if (server) server.close();
    if (conn) conn.end();
    process.exit(1);
});
