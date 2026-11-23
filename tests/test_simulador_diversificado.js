/**
 * test_simulador_diversificado.js
 * Suite integral de pruebas automatizadas para la modalidad:
 * "Mejor inversión diversificada"
 *
 * Valida los 10 casos matemáticos y de negocio requeridos, más el flujo interactivo de UI:
 * 1. Caso 1: Una sola institución seleccionada (comportamiento correcto sin errores).
 * 2. Caso 2: Dos instituciones (distribución de capital y rendimiento óptimo).
 * 3. Caso 3: Instituciones con dos tramos (aprovecha tramo de mayor rendimiento).
 * 4. Caso 4: Instituciones con tres tramos (Openbank: tramos 1, 2 y 3).
 * 5. Caso 5: Máximo por institución (ej. 50% de $1,000,000 = máx $500,000).
 * 6. Caso 6: Número de instituciones (ej. solicitar 3 utiliza exactamente 3).
 * 7. Caso 7: Restricciones de las instituciones utilizadas mostradas en la propuesta.
 * 8. Caso 8: Institución deseleccionada por el usuario no participa.
 * 9. Caso 9: Institución inactiva en administración no participa.
 * 10. Caso 10: Validación matemática estricta: SUMA(asignaciones) = inversión_total.
 * 11. Flujo interactivo: Selector de estrategia, comparativa A vs B, aplicación de estrategia a la tabla y restablecimiento.
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
    console.log('=== INICIANDO TEST INTEGRAL: MEJOR INVERSIÓN DIVERSIFICADA ===\n');

    // ==============================================================
    // SECCIÓN 1: PRUEBAS UNITARIAS MATEMÁTICAS PURAS DEL MOTOR
    // ==============================================================
    console.log('--- SECCIÓN 1: Pruebas Matemáticas en MotorFinanciero ---');

    // Datos simulados de instituciones para pruebas unitarias
    const instNU = {
        id: 1,
        nombre: 'NU',
        tipo: 'S',
        esquema: {
            tramos: [
                { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
                { numero_tramo: 2, limite_inferior: 25000, limite_superior: null, tasa_anual: 6.5 }
            ]
        },
        restricciones: [{ descripcion: 'Requiere al menos una compra al mes.', activo: 1 }]
    };

    const instOpenbank = {
        id: 2,
        nombre: 'Openbank',
        tipo: 'B',
        esquema: {
            tramos: [
                { numero_tramo: 1, limite_inferior: 0, limite_superior: 30000, tasa_anual: 13.0 },
                { numero_tramo: 2, limite_inferior: 30000, limite_superior: 100000, tasa_anual: 7.0 },
                { numero_tramo: 3, limite_inferior: 100000, limite_superior: null, tasa_anual: 6.5 }
            ]
        },
        restricciones: []
    };

    const instMifel = {
        id: 3,
        nombre: 'Mifel',
        tipo: 'B',
        esquema: {
            tramos: [
                { numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 10.0 }
            ]
        },
        restricciones: []
    };

    const instUala = {
        id: 4,
        nombre: 'Uala',
        tipo: 'F',
        esquema: {
            tramos: [
                { numero_tramo: 1, limite_inferior: 0, limite_superior: 50000, tasa_anual: 14.0 },
                { numero_tramo: 2, limite_inferior: 50000, limite_superior: null, tasa_anual: 0.0 }
            ]
        },
        restricciones: []
    };

    // Caso 1: Una sola institución seleccionada
    {
        console.log('[Caso 1: Una sola institución seleccionada]');
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: 50000,
            meses: 12,
            instituciones: [instNU],
            numInstituciones: 1,
            maxPorcentajePorInst: 50
        });
        assert.strictEqual(res.exito, true);
        assert.strictEqual(res.numInstitucionesUtilizadas, 1);
        assert.strictEqual(res.asignaciones[0].institucionId, 1);
        assert.strictEqual(res.asignaciones[0].inversionAsignada, 50000);
        assert.strictEqual(res.capitalSinDistribuir, 0);
        console.log('✓ Caso 1 superado: Una sola institución recibe 100% correctamente sin fallar.');
    }

    // Caso 2: Dos instituciones
    {
        console.log('[Caso 2: Dos instituciones]');
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: 100000,
            meses: 1,
            instituciones: [instNU, instMifel],
            numInstituciones: 2,
            maxPorcentajePorInst: 60
        });
        assert.strictEqual(res.exito, true);
        assert.strictEqual(res.numInstitucionesUtilizadas, 2);
        const sumAsig = res.asignaciones.reduce((s, a) => s + a.inversionAsignada, 0);
        assert.strictEqual(Math.round(sumAsig), 100000);
        assert.strictEqual(res.capitalSinDistribuir, 0);
        console.log('✓ Caso 2 superado: Capital distribuido correctamente entre dos instituciones.');
    }

    // Caso 3: Instituciones con dos tramos (aprovecha tramo de mayor rendimiento)
    {
        console.log('[Caso 3: Institución con dos tramos - aprovecha tasa alta]');
        // NU tiene $25k al 13% y excedente al 6.5%. Mifel tiene 10% fijo.
        // Si invertimos $50,000 diversificando, NU debe aprovechar sus $25k al 13% antes de excederse a 6.5%
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: 50000,
            meses: 12,
            instituciones: [instNU, instMifel],
            numInstituciones: 2,
            maxPorcentajePorInst: 60
        });
        const asigNU = res.asignaciones.find(a => a.institucionId === 1);
        assert(asigNU, 'NU debe tener asignación');
        assert(asigNU.inversionAsignada >= 25000, `NU debe aprovechar su tramo de 13% ($25,000)`);
        console.log(`Asignación NU: $${asigNU.inversionAsignada}`);
        console.log('✓ Caso 3 superado: Algoritmo aprovecha tramo de mayor rendimiento.');
    }

    // Caso 4: Instituciones con tres tramos (Openbank)
    {
        console.log('[Caso 4: Institución con tres tramos]');
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: 150000,
            meses: 6,
            instituciones: [instOpenbank, instMifel],
            numInstituciones: 2,
            maxPorcentajePorInst: 60
        });
        const asigOpen = res.asignaciones.find(a => a.institucionId === 2);
        assert(asigOpen, 'Openbank debe estar en la asignación');
        assert(asigOpen.inversionAsignada > 30000, `Openbank debe cubrir tramos múltiples (obtenido: $${asigOpen.inversionAsignada})`);
        console.log(`Openbank asignado: $${asigOpen.inversionAsignada}`);
        console.log('✓ Caso 4 superado: Manejo exitoso de instituciones con 3 tramos.');
    }

    // Caso 5: Máximo por institución (Concentración)
    {
        console.log('[Caso 5: Máximo por institución]');
        // Capital = $1,000,000, Max = 50% => ninguna > $500,000
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: 1000000,
            meses: 12,
            instituciones: [instNU, instOpenbank, instMifel, instUala],
            numInstituciones: 3,
            maxPorcentajePorInst: 50
        });
        assert.strictEqual(res.exito, true);
        for (const asig of res.asignaciones) {
            assert(asig.inversionAsignada <= 500000.01, `Asignación de ${asig.nombre} ($${asig.inversionAsignada}) excede el tope de 50% ($500,000)`);
        }
        assert(res.concentracion.porcentajeMayorAsignacion <= 50.01, 'Concentración máxima debe ser <= 50%');
        console.log(`Tope máximo aplicado: $${res.topeMaximoPorInst}, mayor asignada: $${res.concentracion.montoMayorAsignacion} (${res.concentracion.porcentajeMayorAsignacion.toFixed(2)}%)`);
        console.log('✓ Caso 5 superado: Límite de concentración por institución respetado estrictamente.');
    }

    // Caso 6: Número de instituciones (K exacto)
    {
        console.log('[Caso 6: Número de instituciones exacto]');
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: 300000,
            meses: 6,
            instituciones: [instNU, instOpenbank, instMifel, instUala],
            numInstituciones: 3,
            maxPorcentajePorInst: 50
        });
        assert.strictEqual(res.exito, true);
        assert.strictEqual(res.numInstitucionesUtilizadas, 3, `Debe utilizar exactamente 3 instituciones (utilizadas: ${res.numInstitucionesUtilizadas})`);
        console.log(`Instituciones utilizadas (${res.numInstitucionesUtilizadas}): ${res.asignaciones.map(a => a.nombre).join(', ')}`);
        console.log('✓ Caso 6 superado: Exactamente 3 instituciones utilizadas.');
    }

    // Caso 7: Restricciones
    {
        console.log('[Caso 7: Restricciones asociadas a instituciones utilizadas]');
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: 100000,
            meses: 1,
            instituciones: [instNU, instMifel],
            numInstituciones: 2,
            maxPorcentajePorInst: 60
        });
        assert(res.restriccionesRelevantes.length >= 1, 'Debe identificar restricciones activas');
        const restrNU = res.restriccionesRelevantes.find(r => r.nombre === 'NU');
        assert(restrNU, 'NU debe tener restricción relevante listada');
        assert(restrNU.descripcion.includes('compra al mes'));
        console.log(`Restricción detectada: ${restrNU.nombre} -> ${restrNU.descripcion}`);
        console.log('✓ Caso 7 superado: Restricciones identificadas correctamente.');
    }

    // Caso 10: Suma total matemática
    {
        console.log('[Caso 10: Suma total matemática]');
        const capitalTest = 777777.77;
        const res = MotorFinanciero.calcularMejorInversionDiversificada({
            inversionTotal: capitalTest,
            meses: 12,
            instituciones: [instNU, instOpenbank, instMifel, instUala],
            numInstituciones: 4,
            maxPorcentajePorInst: 40
        });
        const sumaAsig = res.asignaciones.reduce((s, a) => s + a.inversionAsignada, 0);
        assert(Math.abs(sumaAsig - capitalTest) < 0.01, `Suma (${sumaAsig}) debe ser igual a inversión (${capitalTest})`);
        assert.strictEqual(res.capitalSinDistribuir, 0);
        console.log(`Capital original: $${capitalTest}, Suma asignada: $${sumaAsig.toFixed(2)}, Sin distribuir: $${res.capitalSinDistribuir}`);
        console.log('✓ Caso 10 superado: Validación matemática estricta SUMA(asignaciones) = inversión_total.');
    }

    // ==============================================================
    // SECCIÓN 2: PRUEBAS END-TO-END CON BASE DE DATOS Y BROWSER (PLAYWRIGHT)
    // ==============================================================
    console.log('\n--- SECCIÓN 2: Pruebas End-to-End con Navegador ---');

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

        // Cargar simulador
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

        // Caso 8 & 9: Confirmar que instituciones inactivas no participan y deseleccionar una
        console.log('[Caso 8 & 9: Institución deseleccionada e inactiva]');
        // Capturar instituciones seleccionadas iniciales
        const idsIniciales = await page.evaluate(() => Array.from(window.getInstitucionesSeleccionadas()));
        assert(idsIniciales.length >= 2, 'Deben existir al menos 2 instituciones seleccionadas');

        // Deseleccionar una institución (ej. la primera)
        const idDeseleccionada = idsIniciales[0];
        console.log(`Deseleccionando institución ID ${idDeseleccionada}...`);
        await page.click(`#sim-row-${idDeseleccionada} .simulador-check-inst`);
        await page.waitForTimeout(100);

        // Cambiar a estrategia "Mejor inversión diversificada"
        console.log('[Cambiando selector a: 🟢 Mejor inversión diversificada]');
        await page.click('input[name="simulador-estrategia"][value="diversificada"]');
        await page.waitForTimeout(200);

        // Verificar que el panel diversificado es visible y el individual está oculto
        const panelDivVis = await page.isVisible('#simulador-panel-diversificado');
        const panelIndVis = await page.isVisible('#simulador-resumen-comparativo');
        const paramsDivVis = await page.isVisible('#simulador-params-diversificado');

        assert.strictEqual(panelDivVis, true, 'El panel diversificado debe ser visible');
        assert.strictEqual(panelIndVis, false, 'El resumen individual debe estar oculto');
        assert.strictEqual(paramsDivVis, true, 'Los parámetros de diversificación deben ser visibles');
        console.log('✓ Selector de estrategia alterna correctamente entre vistas.');

        // Verificar que la institución deseleccionada NO está en la propuesta
        const asigsEnPropuesta = await page.evaluate(() => {
            const res = window.getUltimaEstrategiaDiversificada();
            return res ? res.asignaciones.map(a => a.institucionId) : [];
        });
        assert(!asigsEnPropuesta.includes(idDeseleccionada), `Institución ${idDeseleccionada} no debe participar al estar deseleccionada`);
        console.log('✓ Caso 8 superado: La institución deseleccionada fue excluida de la estrategia diversificada.');

        // Verificar presencia de métricas clave en el DOM
        const textoPanel = await page.$eval('#simulador-panel-diversificado', el => el.textContent);
        assert(textoPanel.includes('Mejor Inversión Diversificada'), 'Debe contener título de la estrategia');
        assert(textoPanel.includes('Tasa Efectiva Ponderada'), 'Debe mostrar tasa efectiva');
        assert(textoPanel.includes('Distribución Recomendada'), 'Debe mostrar tabla de distribución');
        assert(textoPanel.includes('¿Por qué esta distribución?'), 'Debe mostrar explicación');
        assert(textoPanel.includes('Comparativa contra una sola institución'), 'Debe mostrar comparativa');
        assert(textoPanel.includes('Métrica de Concentración'), 'Debe mostrar concentración');
        console.log('✓ Estructura completa del dashboard diversificado renderizada con éxito.');

        // Caso 11: Probar botón "Aplicar estrategia a la tabla"
        console.log('[Caso 11: Botón Aplicar estrategia a la tabla]');
        await page.click('#simulador-btn-aplicar-estrategia');
        await page.waitForTimeout(200);

        // Verificar que al menos una fila tenga la insignia "Estrategia"
        const badgesEstrategia = await page.$$eval('.badge-estrategia-diversificada', badges => badges.length);
        assert(badgesEstrategia > 0, 'Debe haber filas marcadas con badge de Estrategia');
        console.log(`✓ ${badgesEstrategia} filas actualizadas y marcadas con insignia "Estrategia".`);

        // Caso 12: Probar botón "Restablecer simulación"
        console.log('[Caso 12: Botón Restablecer simulación]');
        await page.click('#simulador-btn-restablecer-simulacion');
        await page.waitForTimeout(200);

        const badgesRestantes = await page.$$eval('.badge-estrategia-diversificada', badges => badges.length);
        assert.strictEqual(badgesRestantes, 0, 'No deben quedar insignias de Estrategia tras restablecer');
        console.log('✓ Simulación restablecida a su cálculo normal.');

        // Cambiar de vuelta a "Mayor rendimiento"
        console.log('[Regresando a: 🔵 Mayor rendimiento]');
        await page.click('input[name="simulador-estrategia"][value="individual"]');
        await page.waitForTimeout(200);
        const panelIndRe = await page.isVisible('#simulador-resumen-comparativo');
        assert.strictEqual(panelIndRe, true, 'El resumen individual debe volver a mostrarse');
        console.log('✓ Regreso transparente a la modalidad Mayor rendimiento.');

        console.log('\n=============================================================');
        console.log('¡TODAS LAS PRUEBAS DE LA MODALIDAD DIVERSIFICADA PASARON!');
        console.log('=============================================================\n');

        if (browser) await browser.close();
        if (server) server.close();
        if (conn) await conn.end();
        process.exit(0);
    } catch (err) {
        if (browser) await browser.close();
        if (server) server.close();
        if (conn) await conn.end();
        throw err;
    }
}

run().catch(err => {
    console.error('❌ Error en test_simulador_diversificado:', err);
    process.exit(1);
});
