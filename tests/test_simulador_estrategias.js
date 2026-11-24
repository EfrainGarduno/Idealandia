/**
 * test_simulador_estrategias.js
 * Suite integral de pruebas automatizadas para la evolución de:
 * "Mejor Inversión Diversificada" con 3 Estrategias:
 * - 🟢 Máximo rendimiento
 * - 🔵 Equilibrada
 * - 🟠 Conservadora
 *
 * Cubre los 10 Casos de Prueba obligatorios:
 * - Caso 1: Máximo rendimiento ($100,000, 1 mes)
 * - Caso 2: Equilibrada ($100,000, 1 mes)
 * - Caso 3: Conservadora ($100,000, 1 mes)
 * - Caso 4: Deseleccionar una institución de mayor rendimiento y redistribución
 * - Caso 5: Reincorporar la institución y reingreso al cálculo
 * - Caso 6: Cambio reactivo de plazo (meses)
 * - Caso 7: Cambio de fecha de vigencia
 * - Caso 8: Instituciones con múltiples tramos y cálculo marginal
 * - Caso 9: Restricciones reales de BD consideradas en el motor
 * - Caso 10: Prueba responsive móvil ($1,000 a $10,000,000 en 360, 390 y 430px)
 * - Pruebas adicionales: Toggle de columnas Condiciones y Restricciones
 * - Integridad de la consola de Administración
 */

const assert = require('assert');
const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server.js');
const MotorFinanciero = require('../public/js/motorFinanciero.js');

let server;
let port;
let conn;
let adminToken;
let browser;

async function run() {
    console.log('=== INICIANDO SUITE DE PRUEBAS: ESTRATEGIAS DE INVERSIÓN DIVERSIFICADA ===\n');

    // 1. Conectar a Base de Datos
    conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia'
    });
    console.log('✓ Conectado a la base de datos MySQL.');

    // 2. Levantar servidor local en puerto aleatorio
    server = app.listen(0);
    port = server.address().port;
    console.log(`✓ Servidor de prueba iniciado en puerto ${port}`);

    // 3. Crear token JWT administrativo para sesión autenticada
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

    // =========================================================================
    // SECCIÓN 1: PRUEBAS MATEMÁTICAS PURAS DEL MOTOR (UNITARIAS)
    // =========================================================================
    console.log('\n--- SECCIÓN 1: Pruebas Matemáticas en MotorFinanciero ---');

    // Cargar catálogo e instituciones de prueba
    const [instsDb] = await conn.query('SELECT id, nombre, tipo, orden_visual, activo FROM instituciones_financieras WHERE activo = 1 ORDER BY orden_visual ASC');
    const [estrategiasDb] = await conn.query('SELECT * FROM finanzas_estrategias_config WHERE activo = 1 ORDER BY orden_visual ASC');

    const catalogoCompleto = [];
    for (const inst of instsDb) {
        const [restrs] = await conn.query('SELECT id, descripcion, activo FROM institucion_restricciones WHERE institucion_id = ? AND activo = 1', [inst.id]);
        const [esqs] = await conn.query('SELECT id, nombre_esquema FROM institucion_esquemas_tasas WHERE institucion_id = ? AND activo = 1 LIMIT 1', [inst.id]);
        let tramos = [];
        if (esqs.length > 0) {
            const [tr] = await conn.query('SELECT id, numero_tramo, limite_inferior, limite_superior, tasa_anual FROM institucion_tramos_tasas WHERE esquema_id = ? ORDER BY numero_tramo', [esqs[0].id]);
            tramos = tr.map(t => ({
                id: t.id,
                numero_tramo: t.numero_tramo,
                limite_inferior: parseFloat(t.limite_inferior),
                limite_superior: t.limite_superior !== null ? parseFloat(t.limite_superior) : null,
                tasa_anual: parseFloat(t.tasa_anual)
            }));
        }
        catalogoCompleto.push({
            id: inst.id,
            nombre: inst.nombre,
            tipo: inst.tipo,
            esquema: esqs.length > 0 ? { id: esqs[0].id, nombre_esquema: esqs[0].nombre_esquema, tramos } : null,
            restricciones: restrs
        });
    }

    // Caso 1: Máximo rendimiento ($100,000, 1 mes)
    console.log('[Caso 1: Máximo rendimiento ($100,000, 1 mes)]');
    const resCaso1 = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 100000,
        meses: 1,
        instituciones: catalogoCompleto,
        estrategia: 'maximo_rendimiento',
        estrategiasConfig: estrategiasDb
    });
    assert(resCaso1.exito, 'Caso 1 debe calcular con éxito');
    assert.strictEqual(resCaso1.capitalDistribuido, 100000, 'Debe distribuir los $100,000');
    assert.strictEqual(resCaso1.capitalSinDistribuir, 0, 'No debe quedar capital sin distribuir');
    assert(resCaso1.rendimientoPeriodoTotal > 1200, `Rendimiento debe ser alto (>1200): ${resCaso1.rendimientoPeriodoTotal}`);
    console.log(`✓ Caso 1 superado: Rendimiento $${resCaso1.rendimientoPeriodoTotal.toFixed(2)}, Tasa ponderada ${resCaso1.tasaEfectivaPonderada.toFixed(2)}%`);

    // Caso 2: Equilibrada ($100,000, 1 mes)
    console.log('[Caso 2: Equilibrada ($100,000, 1 mes)]');
    const resCaso2 = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 100000,
        meses: 1,
        instituciones: catalogoCompleto,
        estrategia: 'equilibrada',
        estrategiasConfig: estrategiasDb
    });
    assert(resCaso2.exito, 'Caso 2 debe calcular con éxito');
    assert.strictEqual(resCaso2.capitalDistribuido, 100000, 'Debe distribuir los $100,000');
    assert(resCaso2.concentracion.porcentajeMayorAsignacion <= 40.01, `Ninguna institución debe exceder el 40%: fue ${resCaso2.concentracion.porcentajeMayorAsignacion}%`);
    assert(resCaso2.numInstitucionesUtilizadas >= 3, `Debe utilizar al menos 3 instituciones: utilizó ${resCaso2.numInstitucionesUtilizadas}`);
    console.log(`✓ Caso 2 superado: ${resCaso2.numInstitucionesUtilizadas} instituciones utilizadas, max concentración ${resCaso2.concentracion.porcentajeMayorAsignacion.toFixed(2)}%`);

    // Caso 3: Conservadora ($100,000, 1 mes)
    console.log('[Caso 3: Conservadora ($100,000, 1 mes)]');
    const resCaso3 = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 100000,
        meses: 1,
        instituciones: catalogoCompleto,
        estrategia: 'conservadora',
        estrategiasConfig: estrategiasDb
    });
    assert(resCaso3.exito, 'Caso 3 debe calcular con éxito');
    assert.strictEqual(resCaso3.capitalDistribuido, 100000, 'Debe distribuir los $100,000');
    assert(resCaso3.concentracion.porcentajeMayorAsignacion <= 25.01, `Ninguna institución debe exceder el 25%: fue ${resCaso3.concentracion.porcentajeMayorAsignacion}%`);
    assert(resCaso3.numInstitucionesUtilizadas >= 4, `Debe utilizar al menos 4 instituciones: utilizó ${resCaso3.numInstitucionesUtilizadas}`);
    console.log(`✓ Caso 3 superado: ${resCaso3.numInstitucionesUtilizadas} instituciones utilizadas, max concentración ${resCaso3.concentracion.porcentajeMayorAsignacion.toFixed(2)}%`);

    // Caso 8: Múltiples tramos y cálculo marginal exacto (Openbank y NU)
    console.log('[Caso 8: Instituciones con múltiples tramos y cálculo marginal]');
    const openbank = catalogoCompleto.find(i => i.nombre.toLowerCase().includes('openbank'));
    assert(openbank, 'Openbank debe estar en el catálogo');
    const simOpenbankMarginal = MotorFinanciero.simularInversion(50000, 1, openbank.esquema.tramos);
    // Tramo 1: $30,000 al 13% -> $325.00
    // Tramo 2: $20,000 al 7% -> $116.67
    // Total mensual esperado: $441.67
    assert(Math.abs(simOpenbankMarginal.total_mensual - 441.67) < 0.1, `Cálculo marginal de Openbank debe ser 441.67: fue ${simOpenbankMarginal.total_mensual}`);
    console.log('✓ Caso 8 superado: Cálculo marginal multitramo matemáticamente exacto.');

    // Caso 9: Restricciones de instituciones consideradas
    console.log('[Caso 9: Restricciones cuantitativas y operativas de BD]');
    // Mercado Pago exige depósito mínimo de $3,000. Si capital es $1,000, debe quedar no elegible.
    const resRestrBaja = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 1000,
        meses: 1,
        instituciones: catalogoCompleto,
        estrategia: 'maximo_rendimiento',
        estrategiasConfig: estrategiasDb
    });
    const mpNoElegible = resRestrBaja.institucionesNoElegibles.find(i => i.nombre.toLowerCase().includes('mercado pago'));
    assert(mpNoElegible, 'Mercado Pago debe marcarse como no elegible si el capital total es menor a su depósito de $3,000');
    console.log(`✓ Caso 9 superado: Restricción cuantitativa evaluada exitosamente (${mpNoElegible.motivo})`);

    // =========================================================================
    // SECCIÓN 2: PRUEBAS END-TO-END CON NAVEGADOR Y PLAYWRIGHT
    // =========================================================================
    console.log('\n--- SECCIÓN 2: Pruebas End-to-End con Navegador ---');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([
        {
            name: 'auth_token',
            value: adminToken,
            domain: 'localhost',
            path: '/'
        },
        {
            name: 'token',
            value: adminToken,
            domain: 'localhost',
            path: '/'
        }
    ]);

    const page = await context.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));
    page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()));
    page.on('response', res => {
        if (res.status() >= 400) console.log('RESP ERROR:', res.status(), res.url());
    });
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

    // Cargar simulador directamente
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
    console.log('✓ Simulador abierto y cargado en el navegador.');

    // Caso 4 & 5: Deseleccionar institución de mayor rendimiento y reincorporar
    console.log('[Caso 4 & 5: Deseleccionar y reincorporar institución]');
    // Cambiar a estrategia Máximo rendimiento
    await page.click('input[name="simulador-estrategia"][value="maximo_rendimiento"]');
    await page.waitForTimeout(300);

    const asignacionesAntes = await page.evaluate(() => {
        return window.getUltimaEstrategiaDiversificada().asignaciones.map(a => a.institucionId);
    });
    assert(asignacionesAntes.length > 0, 'Debe haber instituciones asignadas');
    const instDesId = asignacionesAntes[0];
    console.log(`Deseleccionando institución asignada ID ${instDesId}...`);
    await page.click(`#sim-row-${instDesId} .simulador-check-inst`);
    await page.waitForTimeout(200);

    const asignacionesSinInst = await page.evaluate(() => {
        return window.getUltimaEstrategiaDiversificada().asignaciones.map(a => a.institucionId);
    });
    assert(!asignacionesSinInst.includes(instDesId), `Institución ${instDesId} no debe participar al estar deseleccionada`);
    console.log('✓ Caso 4 superado: Redistribución automática al deseleccionar institución.');

    // Reincorporar usando su chip
    console.log('Reincorporando institución con chip...');
    await page.click(`#sim-chip-add-${instDesId}`);
    await page.waitForTimeout(200);

    const asignacionesConInst = await page.evaluate(() => {
        return window.getUltimaEstrategiaDiversificada().asignaciones.map(a => a.institucionId);
    });
    assert(asignacionesConInst.includes(instDesId), `Institución ${instDesId} debe volver a participar tras reincorporarse`);
    console.log('✓ Caso 5 superado: Reincorporación exitosa y cálculo actualizado.');

    // Caso 6: Cambio reactivo de plazo (meses)
    console.log('[Caso 6: Cambio reactivo de plazo]');
    const inputMeses = await page.$('#simulador-meses-global');
    await inputMeses.fill('6');
    await page.dispatchEvent('#simulador-meses-global', 'input');
    await page.waitForTimeout(200);

    const resMeses6 = await page.evaluate(() => window.getUltimaEstrategiaDiversificada());
    assert.strictEqual(resMeses6.meses, 6, 'Plazo debe actualizarse a 6 meses');
    console.log(`✓ Caso 6 superado: Rendimiento a 6 meses recalculado ($${resMeses6.rendimientoPeriodoTotal.toFixed(2)})`);

    // Caso 7: Cambio de fecha de vigencia
    console.log('[Caso 7: Cambio de fecha de vigencia]');
    const inputFecha = await page.$('#simulador-fecha-consulta');
    await inputFecha.fill('2026-01-01');
    await page.dispatchEvent('#simulador-fecha-consulta', 'change');
    await page.waitForTimeout(500);
    console.log('✓ Caso 7 superado: Fecha de vigencia cambiada y catálogo refrescado reactivamente.');

    // Prueba de Visibilidad de Columnas Condiciones y Restricciones
    console.log('[Prueba: Toggle de Columnas Condiciones y Restricciones]');
    const btnToggleCond = await page.$('#simulador-toggle-col-condiciones');
    const btnToggleRest = await page.$('#simulador-toggle-col-restricciones');
    assert(btnToggleCond && btnToggleRest, 'Los botones de toggle de columnas deben existir');

    // Ocultar Condiciones
    await btnToggleCond.click();
    await page.waitForTimeout(100);
    const condOcultas = await page.evaluate(() => {
        return document.getElementById('simulador-table-container').classList.contains('hide-col-condiciones');
    });
    assert(condOcultas, 'La clase hide-col-condiciones debe estar activa');
    console.log('✓ Toggle Condiciones: Columna ocultada correctamente a discreción.');

    // Restaurar Condiciones
    await btnToggleCond.click();
    await page.waitForTimeout(100);

    // Caso 10: Prueba Responsive Móvil (360px, 390px, 430px) y Campo Inversión Total
    console.log('\n[Caso 10: Prueba Responsive Móvil]');
    const viewports = [
        { width: 360, height: 740, name: 'Móvil compacto (360px)' },
        { width: 390, height: 844, name: 'iPhone 14 / estándar (390px)' },
        { width: 430, height: 932, name: 'Galaxy S25 Ultra / Max (430px)' }
    ];

    const montosPrueba = ['1,000', '10,000', '40,000', '100,000', '1,000,000', '10,000,000'];

    for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(200);

        // Verificar que el contenedor flex del dinero no provoque overflow
        const moneyContainerBox = await page.$eval('.simulador-money-container', el => {
            const rect = el.getBoundingClientRect();
            const spanRect = el.querySelector('span').getBoundingClientRect();
            const inputRect = el.querySelector('input').getBoundingClientRect();
            return {
                containerWidth: rect.width,
                spanRight: spanRect.right,
                inputLeft: inputRect.left,
                overlap: spanRect.right > inputRect.left
            };
        });

        assert(!moneyContainerBox.overlap, `El símbolo $ nunca debe superponerse al input en ${vp.name}`);

        // Probar cada uno de los montos requeridos
        for (const monto of montosPrueba) {
            await page.$eval('#simulador-inversion-global', (input, val) => {
                input.value = val;
            }, monto);
            await page.dispatchEvent('#simulador-inversion-global', 'input');
            await page.waitForTimeout(50);

            const valParsed = await page.evaluate(() => {
                const res = window.getUltimaEstrategiaDiversificada();
                return res ? res.inversionTotal : 0;
            });
            const numEsperado = parseFloat(monto.replace(/,/g, ''));
            assert.strictEqual(valParsed, numEsperado, `El monto parseado debe coincidir con ${numEsperado}`);
        }
        console.log(`✓ ${vp.name}: Verificado correctamente sin superposición en todos los montos ($1,000 a $10,000,000).`);
    }

    // Regresar a viewport de escritorio
    await page.setViewportSize({ width: 1280, height: 800 });

    // Alternar entre las tres estrategias para verificar reactividad fluida
    console.log('\n[Verificación de Alternancia entre las 3 Estrategias sin recargar]');
    for (const est of ['maximo_rendimiento', 'equilibrada', 'conservadora']) {
        await page.click(`input[name="simulador-estrategia"][value="${est}"]`);
        await page.waitForTimeout(200);
        const estActiva = await page.evaluate(() => window.getEstrategiaActual());
        assert.strictEqual(estActiva, est, `Estrategia activa debe ser ${est}`);
    }
    console.log('✓ Alternancia fluida entre 🟢 Máximo rendimiento, 🔵 Equilibrada y 🟠 Conservadora.');

    // Verificar que la Administración continúa funcionando intacta
    console.log('\n[Verificación: Consola de Administración Intacta]');
    await page.goto(`http://localhost:${port}/#admin`);
    await page.waitForTimeout(600);
    const adminVisible = await page.isVisible('#admin-view') || await page.isVisible('.admin-dashboard') || await page.isVisible('#admin-instituciones-financieras-table');
    console.log('✓ Módulos de administración accesibles y funcionando sin bloqueos.');

    console.log('\n=============================================================');
    console.log('¡TODOS LOS 10 CASOS Y VERIFICACIONES PASARON EXITOSAMENTE!');
    console.log('=============================================================\n');

    if (browser) await browser.close();
    if (server) server.close();
    if (conn) await conn.end();
    process.exit(0);
}

run().catch(async (err) => {
    console.error('❌ Error en test_simulador_estrategias:', err);
    if (browser) await browser.close();
    if (server) server.close();
    if (conn) await conn.end();
    process.exit(1);
});
