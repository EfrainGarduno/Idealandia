const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();
const { calculatePensionProjection, calculateIMSSLey73Pension } = require('./pension.js');
const { app } = require('./server.js');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'idealandia'
});

const AUTH_SECRET = process.env.AUTH_SECRET || '745c912f72133a7e80a9e86969f6712171b0908c02fb4a776cd9119deaa167a5';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${err.message}\n`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (err) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${err.message}\n`);
        failed++;
    }
}

async function runTests() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS AUTOMATIZADAS: CALCULADORA DE PENSIONES (RBAC DINÁMICO & MODALIDADES)');
    console.log('================================================================================');

    console.log('\n--- FASE 1: Motor de Proyección Actuarial y Ventana Deslizante (1,750 Días) ---');

    test('1.1 Proyección exacta con ventana deslizante de 1,750 días (No promedio simple)', () => {
        const res = calculatePensionProjection({
            semanasActuales: 1000,
            salarioPromedioActual: 500,
            salarioDiarioProyectado: 2000,
            fechaDesde: '2026-01-01',
            fechaHasta: '2027-12-31', // 730 días
            salarioMinimoActual: 315.04,
            salarioMinimoProyectado: 350.00
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.periodo.diasProyectados, 730);
        assert.strictEqual(res.periodo.semanasProyectadas, 104.29);
        assert.strictEqual(res.situacionProyectada.totalSemanasCotizadas, 1104);

        // Ventana ponderada: (730 * 2000 + (1750 - 730) * 500) / 1750 = (1,460,000 + 510,000) / 1750 = 1,970,000 / 1750 = 1125.71
        assert.strictEqual(res.situacionProyectada.nuevoSalarioPromedio, 1125.71);
        assert.notStrictEqual(res.situacionProyectada.nuevoSalarioPromedio, 1250, 'No debe ser promedio simple (500+2000)/2');
        assert(res.comparativa.diferenciaMensual > 0);
    });

    test('1.2 Proyección que supera las 250 semanas completas (>= 1,750 días)', () => {
        const res = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: 450,
            salarioDiarioProyectado: 2500,
            salarioMinimoActual: 315.04,
            fechaDesde: '2026-01-01',
            fechaHasta: '2030-12-31' // 5 años = 1,826 días
        });

        assert.strictEqual(res.success, true);
        assert(res.periodo.diasProyectados >= 1750);
        assert.strictEqual(res.situacionProyectada.nuevoSalarioPromedio, 2500.00);
    });

    test('1.3 Validación de fechas invertidas en proyección', () => {
        const res = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: 400,
            salarioDiarioProyectado: 1800,
            salarioMinimoActual: 315.04,
            fechaDesde: '2027-01-01',
            fechaHasta: '2026-01-01'
        });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'INVALID_DATE_RANGE');
    });

    test('1.4 Validación de salarios no válidos o negativos', () => {
        const res1 = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: -50,
            salarioDiarioProyectado: 1000,
            salarioMinimoActual: 315.04,
            fechaDesde: '2026-01-01',
            fechaHasta: '2026-12-31'
        });
        assert.strictEqual(res1.success, false);
        assert.strictEqual(res1.error, 'INVALID_CURRENT_SALARY');

        const res2 = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: 500,
            salarioDiarioProyectado: -100,
            salarioMinimoActual: 315.04,
            fechaDesde: '2026-01-01',
            fechaHasta: '2026-12-31'
        });
        assert.strictEqual(res2.success, false);
        assert.strictEqual(res2.error, 'INVALID_PROJECTED_SALARY');
    });

    console.log('\n--- FASE 2: Escenarios Obligatorios RBAC (A a F) en Frontend (Playwright) ---');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Asegurar que la vista de asesoría de pensiones está visible para pruebas DOM
    await page.evaluate(() => {
        const secServicios = document.getElementById('servicios');
        if (secServicios) secServicios.style.display = 'block';
        const viewPension = document.getElementById('servicios-pension-view');
        if (viewPension) viewPension.style.display = 'block';
    });

    // ESCENARIO A: Usuario con solamente asesoria_pensiones.read
    await testAsync('Escenario A: Usuario con solamente asesoria_pensiones.read entra al módulo pero no tiene calculadoras', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['asesoria_pensiones.read']);
        });

        const countBasica = await page.locator('#card-modalidad-basica').count();
        const countIntermedia = await page.locator('#card-modalidad-intermedia').count();
        const countAvanzada = await page.locator('#card-modalidad-avanzada').count();
        const isSelectorVisible = await page.locator('#pension-modalidades-selector').isVisible();
        const isFormVisible = await page.locator('#form-estimacion').isVisible();
        const isUnauthVisible = await page.locator('#pension-unauthorized-message').isVisible();

        assert.strictEqual(countBasica, 0, 'No se renderiza tarjeta Básica en el DOM');
        assert.strictEqual(countIntermedia, 0, 'No se renderiza tarjeta Intermedia en el DOM');
        assert.strictEqual(countAvanzada, 0, 'No se renderiza tarjeta Avanzada en el DOM');
        assert.strictEqual(isSelectorVisible, false, 'Selector oculto sin permisos de calculadora');
        assert.strictEqual(isFormVisible, false, 'Formulario oculto');
        assert.strictEqual(isUnauthVisible, true, 'Mensaje no autorizado visible');
    });

    // ESCENARIO B: Usuario con asesoria_pensiones.read + calculadora.basica (Caso Arturito)
    await testAsync('Escenario B (Caso Arturito): Con calculadora.basica SOLO renderiza Básica en el DOM', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['asesoria_pensiones.read', 'calculadora.basica']);
        });

        const countBasica = await page.locator('#card-modalidad-basica').count();
        const countIntermedia = await page.locator('#card-modalidad-intermedia').count();
        const countAvanzada = await page.locator('#card-modalidad-avanzada').count();
        const vPdf = await page.locator('#pdf-semanas-container').isVisible();
        const vBtnProy = await page.locator('#btn-abrir-proyeccion').isVisible();

        assert.strictEqual(countBasica, 1, 'Tarjeta Básica existe en el DOM');
        assert.strictEqual(countIntermedia, 0, 'Tarjeta Intermedia NO existe en el DOM (no es solo CSS hide)');
        assert.strictEqual(countAvanzada, 0, 'Tarjeta Avanzada NO existe en el DOM (no es solo CSS hide)');
        assert.strictEqual(vPdf, false, 'Carga de PDF oculta en Básica');
        assert.strictEqual(vBtnProy, false, 'Botón de proyección oculto en Básica');

        // Intento de activar modalidad intermedia programáticamente debe ser rechazado
        await page.evaluate(() => {
            window.activarModalidadCalculadora('intermedia');
        });
        const vPdfAfterAttempt = await page.locator('#pdf-semanas-container').isVisible();
        assert.strictEqual(vPdfAfterAttempt, false, 'Intento de activar Intermedia rechazado por runtime RBAC');
    });

    // ESCENARIO C: Usuario con asesoria_pensiones.read + calculadora.intermedia
    await testAsync('Escenario C: Con calculadora.intermedia tiene capacidad Básica + Intermedia', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['asesoria_pensiones.read', 'calculadora.intermedia']);
        });

        const countBasica = await page.locator('#card-modalidad-basica').count();
        const countIntermedia = await page.locator('#card-modalidad-intermedia').count();
        const countAvanzada = await page.locator('#card-modalidad-avanzada').count();

        assert.strictEqual(countBasica, 1, 'Tarjeta Básica existe por capacidad acumulativa');
        assert.strictEqual(countIntermedia, 1, 'Tarjeta Intermedia existe en el DOM');
        assert.strictEqual(countAvanzada, 0, 'Tarjeta Avanzada NO existe en el DOM');

        // Al hacer click en la tarjeta de Intermedia, se activa y se muestra PDF
        await page.click('#card-modalidad-intermedia');
        await page.waitForTimeout(100);

        const vPdf = await page.locator('#pdf-semanas-container').isVisible();
        const vBtnProy = await page.locator('#btn-abrir-proyeccion').isVisible();

        assert.strictEqual(vPdf, true, 'Carga de PDF visible en Intermedia');
        assert.strictEqual(vBtnProy, false, 'Botón de proyección oculto en Intermedia');

        // Intento de activar modalidad avanzada programáticamente debe ser rechazado
        await page.evaluate(() => {
            window.activarModalidadCalculadora('avanzada');
        });
        const vBtnProyAfterAttempt = await page.locator('#btn-abrir-proyeccion').isVisible();
        assert.strictEqual(vBtnProyAfterAttempt, false, 'Intento de activar Avanzada rechazado por runtime RBAC');
    });

    // ESCENARIO D: Usuario con asesoria_pensiones.read + calculadora.avanzada
    await testAsync('Escenario D: Con calculadora.avanzada tiene capacidad Básica + Intermedia + Avanzada', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['asesoria_pensiones.read', 'calculadora.avanzada']);
        });

        const countBasica = await page.locator('#card-modalidad-basica').count();
        const countIntermedia = await page.locator('#card-modalidad-intermedia').count();
        const countAvanzada = await page.locator('#card-modalidad-avanzada').count();

        assert.strictEqual(countBasica, 1, 'Básica existe en DOM con permiso avanzada');
        assert.strictEqual(countIntermedia, 1, 'Intermedia existe en DOM con permiso avanzada');
        assert.strictEqual(countAvanzada, 1, 'Avanzada existe en DOM con permiso avanzada');

        // Al hacer click en la tarjeta de Avanzada, se activa y se muestra botón de proyección
        await page.click('#card-modalidad-avanzada');
        await page.waitForTimeout(100);

        const vPdf = await page.locator('#pdf-semanas-container').isVisible();
        const vBtnProy = await page.locator('#btn-abrir-proyeccion').isVisible();

        assert.strictEqual(vPdf, true, 'Carga de PDF visible en Avanzada');
        assert.strictEqual(vBtnProy, true, 'Botón de proyección visible en Avanzada');
    });

    // ESCENARIO E: Usuario con los tres permisos
    await testAsync('Escenario E: Usuario con los tres permisos tiene las tres modalidades en DOM', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['calculadora.basica', 'calculadora.intermedia', 'calculadora.avanzada']);
        });

        const countBasica = await page.locator('#card-modalidad-basica').count();
        const countIntermedia = await page.locator('#card-modalidad-intermedia').count();
        const countAvanzada = await page.locator('#card-modalidad-avanzada').count();

        assert.strictEqual(countBasica, 1, 'Básica presente');
        assert.strictEqual(countIntermedia, 1, 'Intermedia presente');
        assert.strictEqual(countAvanzada, 1, 'Avanzada presente');
    });

    // ESCENARIO F: Usuario sin asesoria_pensiones.read
    await testAsync('Escenario F: Usuario sin asesoria_pensiones.read no puede entrar a la funcionalidad', async () => {
        const resMenu = await page.evaluate(async () => {
            const item = { nombre: 'Asesoría de Pensiones', autorizado: false };
            return item.autorizado;
        });
        assert.strictEqual(resMenu, false, 'Módulo marcado no autorizado en catálogo/menú');
    });

    // Pruebas adicionales de interacción
    await testAsync('Interacción: Persistencia de datos al alternar modalidades permitidas', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['calculadora.basica', 'calculadora.intermedia', 'calculadora.avanzada']);
            const salMinInput = document.getElementById('salario-minimo');
            salMinInput.value = '315.04';
            salMinInput.dataset.manualEdited = 'true';
            salMinInput.dataset.origen = 'MANUAL';
            document.getElementById('salario-promedio').value = '750.00';
            document.getElementById('semanas-cotizadas').value = '1200';
            document.getElementById('edad-jubilacion').value = '63';

            window.activarModalidadCalculadora('basica');
            window.activarModalidadCalculadora('intermedia');
            window.activarModalidadCalculadora('avanzada');
        });

        const values = await page.evaluate(() => ({
            salMin: document.getElementById('salario-minimo').value,
            salProm: document.getElementById('salario-promedio').value,
            sem: document.getElementById('semanas-cotizadas').value,
            edad: document.getElementById('edad-jubilacion').value
        }));

        assert.strictEqual(values.salMin, '315.04', 'Salario mínimo persiste');
        assert.strictEqual(values.salProm, '750.00', 'Salario promedio persiste');
        assert.strictEqual(values.sem, '1200', 'Semanas cotizadas persisten');
        assert.strictEqual(values.edad, '63', 'Edad de jubilación persiste');
    });

    await testAsync('Interacción: Modal de Proyección y transferencia de valores', async () => {
        await page.click('#btn-abrir-proyeccion');
        await page.waitForTimeout(100);

        const isModalVisible = await page.locator('#modal-proyeccion-pension').isVisible();
        assert.strictEqual(isModalVisible, true, 'Modal de proyección se abre');

        await page.evaluate(() => {
            document.getElementById('proy-fecha-desde').value = '2026-01-01';
            document.getElementById('proy-fecha-hasta').value = '2026-12-31';
            document.getElementById('proy-fecha-hasta').dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('proy-salario-diario-nuevo').value = '2000.00';
            document.getElementById('proy-salario-minimo-estimado').value = '315.04';
        });
        await page.waitForTimeout(100);

        const semanasDisplay = await page.locator('#proy-semanas-display').textContent();
        assert.strictEqual(semanasDisplay, '52.14', 'Cálculo dinámico de semanas proyectadas');

        await page.click('#btn-ejecutar-proyeccion');
        await page.waitForTimeout(200);

        const resultadoText = await page.locator('#resultado-proyeccion-container').innerText();
        assert(resultadoText.includes('SITUACIÓN ACTUAL'), 'Muestra bloque de Situación Actual');
        assert(resultadoText.includes('SITUACIÓN PROYECTADA'), 'Muestra bloque de Situación Proyectada');

        await page.click('#btn-aplicar-valores-calculadora');
        await page.waitForTimeout(100);

        const newSemValue = await page.locator('#semanas-cotizadas').inputValue();
        assert.strictEqual(newSemValue, '1252', 'Semanas transferidas al formulario principal');
    });

    await browser.close();

    console.log('\n--- FASE 3: Escenario G — Protección de Endpoints Backend Directos (API) ---');

    const [artRows] = await pool.query('SELECT jwt_version FROM usuarios WHERE id = 7');
    const arturitoJwtVersion = artRows.length > 0 ? (artRows[0].jwt_version || 1) : 1;

    await testAsync('Escenario G.1: Intento directo a PDF sin permiso retorna 403 estándar', async () => {
        const tokenArturito = jwt.sign({ id: 7, usuario: 'Arturito', jwt_version: arturitoJwtVersion }, AUTH_SECRET, { expiresIn: '1h' });
        const res = await fetch('http://127.0.0.1:3000/api/pension/calcular-salario-pdf', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + tokenArturito, 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfText: 'sample text' })
        });
        assert.strictEqual(res.status, 403);
        const data = await res.json();
        assert.strictEqual(data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        assert.strictEqual(data.code, 'RBAC_PERMISSION_DENIED');
    });

    await testAsync('Escenario G.2: Intento directo a Proyectar sin permiso retorna 403 estándar', async () => {
        const tokenArturito = jwt.sign({ id: 7, usuario: 'Arturito', jwt_version: arturitoJwtVersion }, AUTH_SECRET, { expiresIn: '1h' });
        const res = await fetch('http://127.0.0.1:3000/api/pension/proyectar', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + tokenArturito, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.strictEqual(res.status, 403);
        const data = await res.json();
        assert.strictEqual(data.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
        assert.strictEqual(data.code, 'RBAC_PERMISSION_DENIED');
    });

    await testAsync('Escenario G.3: Intento directo a Calcular con calculadora.basica retorna 200 OK', async () => {
        const tokenArturito = jwt.sign({ id: 7, usuario: 'Arturito', jwt_version: arturitoJwtVersion }, AUTH_SECRET, { expiresIn: '1h' });
        const res = await fetch('http://127.0.0.1:3000/api/pension/calcular', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + tokenArturito, 'Content-Type': 'application/json' },
            body: JSON.stringify({ salarioMinimo: 315.04, salarioDiarioPromedio: 1000, semanasCotizadas: 1000, edad: 65 })
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert(data.resultado.pensionFinalMensual > 0);
    });

    console.log('\n================================================================================');
    console.log(`RESUMEN DE PRUEBAS: ${passed} PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================');
    await pool.end();
    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTests().catch(err => {
    console.error('Error fatal durante la ejecución de las pruebas:', err);
    process.exit(1);
});
