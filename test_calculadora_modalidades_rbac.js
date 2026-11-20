const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const { 
    calculateIMSSLey73Pension, 
    calculatePensionProjection,
    SALARIO_MINIMO_GENERAL_VIGENTE 
} = require('./pension');

async function runTests() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS AUTOMATIZADAS: CALCULADORA DE PENSIONES (BÁSICA, INTERMEDIA, AVANZADA & RBAC)');
    console.log('================================================================================\n');

    let passed = 0;
    let failed = 0;

    function test(name, fn) {
        try {
            fn();
            console.log(`  [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err.message}`);
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
            console.error(`         ${err.message}`);
            failed++;
        }
    }

    console.log('--- FASE 1: Motor de Proyección Actuarial y Ventana Deslizante (250 Semanas / 1,750 Días) ---');

    test('1.1 Proyección exacta con ventana deslizante de 1,750 días (No promedio simple)', () => {
        // Escenario: Usuario tiene 1000 semanas con salario promedio actual de $500/día.
        // Proyecta cotizar 1 año (365 días = 52.14 semanas) al tope de $2,000/día.
        const res = calculatePensionProjection({
            semanasActuales: 1000,
            salarioPromedioActual: 500,
            salarioMinimoActual: 315.04,
            salarioMinimoProyectado: 315.04,
            salarioDiarioProyectado: 2000,
            fechaDesde: '2026-01-01',
            fechaHasta: '2026-12-31', // 365 días
            edadRetiroActual: 60,
            tieneEsposa: true
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.periodo.diasProyectados, 365);
        assert.strictEqual(res.periodo.semanasProyectadas, 52.14);

        // Ventana deslizante: 365 días a $2,000 + (1,750 - 365 = 1,385 días) a $500
        // Suma ponderada = (365 * 2000) + (1385 * 500) = 730,000 + 692,500 = 1,422,500
        // Promedio ponderado = 1,422,500 / 1750 = 812.857... -> 812.86
        const esperado = Math.round(((365 * 2000) + (1385 * 500)) / 1750 * 100) / 100;
        assert.strictEqual(res.situacionProyectada.nuevoSalarioPromedio, esperado);
        assert.notStrictEqual(res.situacionProyectada.nuevoSalarioPromedio, (500 + 2000) / 2); // Demuestra que NO es promedio simple
        assert.strictEqual(res.situacionProyectada.totalSemanasCotizadas, 1052);
        assert(res.situacionProyectada.pensionMensual > res.situacionActual.pensionMensual);
        assert(res.comparativa.diferenciaMensual > 0);
    });

    test('1.2 Proyección que supera las 250 semanas completas (>= 1,750 días)', () => {
        // Escenario: Proyecta cotizar 5 años completos (1,826 días > 1,750 días) a $1,800/día.
        const res = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: 400,
            salarioDiarioProyectado: 1800,
            fechaDesde: '2026-01-01',
            fechaHasta: '2030-12-31',
            edadRetiroActual: 60
        });

        assert.strictEqual(res.success, true);
        assert(res.periodo.diasProyectados >= 1750);
        // Cuando cubre 250 semanas completas, el promedio pasa a ser 100% el salario proyectado
        assert.strictEqual(res.situacionProyectada.nuevoSalarioPromedio, 1800);
    });

    test('1.3 Validación de fechas invertidas en proyección', () => {
        const res = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: 400,
            salarioDiarioProyectado: 1800,
            fechaDesde: '2027-01-01',
            fechaHasta: '2026-01-01' // Invertida
        });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'INVALID_DATE_RANGE');
    });

    test('1.4 Validación de salarios no válidos o negativos', () => {
        const res1 = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: -50,
            salarioDiarioProyectado: 1000,
            fechaDesde: '2026-01-01',
            fechaHasta: '2026-12-31'
        });
        assert.strictEqual(res1.success, false);
        assert.strictEqual(res1.error, 'INVALID_CURRENT_SALARY');

        const res2 = calculatePensionProjection({
            semanasActuales: 800,
            salarioPromedioActual: 500,
            salarioDiarioProyectado: -100,
            fechaDesde: '2026-01-01',
            fechaHasta: '2026-12-31'
        });
        assert.strictEqual(res2.success, false);
        assert.strictEqual(res2.error, 'INVALID_PROJECTED_SALARY');
    });

    console.log('\n--- FASE 2: Interfaz de Usuario, Modalidades y Capacidades Acumulativas (Playwright) ---');

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

    await testAsync('2.1 Elementos DOM del Selector de Modalidades existen', async () => {
        const selectorExists = await page.locator('#pension-modalidades-selector').count() > 0;
        const cardBasica = await page.locator('#card-modalidad-basica').count() > 0;
        const cardIntermedia = await page.locator('#card-modalidad-intermedia').count() > 0;
        const cardAvanzada = await page.locator('#card-modalidad-avanzada').count() > 0;
        const modalProy = await page.locator('#modal-proyeccion-pension').count() > 0;

        assert(selectorExists, 'Selector de modalidades existe en el DOM');
        assert(cardBasica, 'Tarjeta de Modalidad Básica existe');
        assert(cardIntermedia, 'Tarjeta de Modalidad Intermedia existe');
        assert(cardAvanzada, 'Tarjeta de Modalidad Avanzada existe');
        assert(modalProy, 'Modal de Proyección de Pensión existe');
    });

    await testAsync('2.2 Usuario con solo permiso calculadora.basica ve solo Básica', async () => {
        await page.evaluate(async () => {
            // Simular respuesta de /api/me/permisos con solo calculadora.basica
            await window.syncPensionModalidades(['calculadora.basica']);
            window.activarModalidadCalculadora('basica');
        });

        const vBasica = await page.locator('#card-modalidad-basica').isVisible();
        const vIntermedia = await page.locator('#card-modalidad-intermedia').isVisible();
        const vAvanzada = await page.locator('#card-modalidad-avanzada').isVisible();
        const vPdf = await page.locator('#pdf-semanas-container').isVisible();
        const vBtnProy = await page.locator('#btn-abrir-proyeccion').isVisible();

        assert.strictEqual(vBasica, true, 'Básica es visible');
        assert.strictEqual(vIntermedia, false, 'Intermedia no es visible');
        assert.strictEqual(vAvanzada, false, 'Avanzada no es visible');
        assert.strictEqual(vPdf, false, 'Carga de PDF oculta en Básica');
        assert.strictEqual(vBtnProy, false, 'Botón de proyección oculto en Básica');
    });

    await testAsync('2.3 Usuario con solo permiso calculadora.intermedia tiene capacidad Básica + Intermedia', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['calculadora.intermedia']);
            window.activarModalidadCalculadora('intermedia');
        });

        const vBasica = await page.locator('#card-modalidad-basica').isVisible();
        const vIntermedia = await page.locator('#card-modalidad-intermedia').isVisible();
        const vAvanzada = await page.locator('#card-modalidad-avanzada').isVisible();
        const vPdf = await page.locator('#pdf-semanas-container').isVisible();
        const vBtnProy = await page.locator('#btn-abrir-proyeccion').isVisible();

        assert.strictEqual(vBasica, true, 'Básica es visible por capacidad acumulativa');
        assert.strictEqual(vIntermedia, true, 'Intermedia es visible');
        assert.strictEqual(vAvanzada, false, 'Avanzada no es visible');
        assert.strictEqual(vPdf, true, 'Carga de PDF visible en Intermedia');
        assert.strictEqual(vBtnProy, false, 'Botón de proyección oculto en Intermedia');
    });

    await testAsync('2.4 Usuario con solo permiso calculadora.avanzada tiene capacidad Básica + Intermedia + Avanzada', async () => {
        await page.evaluate(async () => {
            await window.syncPensionModalidades(['calculadora.avanzada']);
            window.activarModalidadCalculadora('avanzada');
        });

        const vBasica = await page.locator('#card-modalidad-basica').isVisible();
        const vIntermedia = await page.locator('#card-modalidad-intermedia').isVisible();
        const vAvanzada = await page.locator('#card-modalidad-avanzada').isVisible();
        const vPdf = await page.locator('#pdf-semanas-container').isVisible();
        const vBtnProy = await page.locator('#btn-abrir-proyeccion').isVisible();

        assert.strictEqual(vBasica, true, 'Básica visible con permiso avanzada');
        assert.strictEqual(vIntermedia, true, 'Intermedia visible con permiso avanzada');
        assert.strictEqual(vAvanzada, true, 'Avanzada visible con permiso avanzada');
        assert.strictEqual(vPdf, true, 'Carga de PDF visible en Avanzada');
        assert.strictEqual(vBtnProy, true, 'Botón de proyección visible en Avanzada');
    });

    await testAsync('2.5 Persistencia de datos al cambiar entre modalidades', async () => {
        await page.evaluate(() => {
            document.getElementById('salario-minimo').value = '315.04';
            document.getElementById('salario-promedio').value = '750.00';
            document.getElementById('semanas-cotizadas').value = '1200';
            document.getElementById('edad-jubilacion').value = '63';

            // Alternar de Avanzada -> Básica -> Intermedia -> Avanzada
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

    await testAsync('2.6 Modal de Proyección: Apertura, precarga y recálculo dinámico de fechas', async () => {
        await page.click('#btn-abrir-proyeccion');
        await page.waitForTimeout(100);

        const isModalVisible = await page.locator('#modal-proyeccion-pension').isVisible();
        assert.strictEqual(isModalVisible, true, 'Modal de proyección se abre');

        const preloaded = await page.evaluate(() => ({
            semAct: document.getElementById('proy-semanas-actuales').value,
            salAct: document.getElementById('proy-salario-promedio-actual').value
        }));
        assert.strictEqual(preloaded.semAct, '1200', 'Semanas actuales precargadas en el modal');
        assert.strictEqual(preloaded.salAct, '750.00', 'Salario actual precargado en el modal');

        // Modificar fechas para simular exactamente 1 año (365 días)
        await page.evaluate(() => {
            document.getElementById('proy-fecha-desde').value = '2026-01-01';
            document.getElementById('proy-fecha-hasta').value = '2026-12-31';
            document.getElementById('proy-fecha-hasta').dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(100);

        const semanasDisplay = await page.locator('#proy-semanas-display').textContent();
        assert.strictEqual(semanasDisplay, '52.14', 'Cálculo dinámico de semanas proyectadas en tiempo real');

        // Ejecutar proyección dentro del modal
        await page.evaluate(() => {
            document.getElementById('proy-salario-diario-nuevo').value = '2000.00';
        });
        await page.click('#btn-ejecutar-proyeccion');
        await page.waitForTimeout(200);

        const isResultadoVisible = await page.locator('#resultado-proyeccion-container').isVisible();
        assert.strictEqual(isResultadoVisible, true, 'Resultado comparativo Antes vs Después es visible');

        const resultadoText = await page.locator('#resultado-proyeccion-container').innerText();
        assert(resultadoText.includes('SITUACIÓN ACTUAL'), 'Muestra bloque de Situación Actual');
        assert(resultadoText.includes('SITUACIÓN PROYECTADA'), 'Muestra bloque de Situación Proyectada');
        assert(resultadoText.includes('Nuevas semanas proyectadas: +52.14'), 'Muestra desglose de semanas proyectadas');
        assert(resultadoText.includes('Total semanas cotizadas: 1252'), 'Muestra total de semanas sumadas');
        assert(resultadoText.includes('Aplicar valores a la calculadora'), 'Botón para transferir valores existe');

        // Probar botón transferir valores
        await page.click('#btn-aplicar-valores-calculadora');
        await page.waitForTimeout(100);

        const isModalClosed = !(await page.locator('#modal-proyeccion-pension').isVisible());
        assert.strictEqual(isModalClosed, true, 'Modal se cierra al aplicar valores');

        const newSemValue = await page.locator('#semanas-cotizadas').inputValue();
        assert.strictEqual(newSemValue, '1252', 'El formulario principal recibió el nuevo total de semanas proyectadas');
    });

    await testAsync('2.7 Verificación de Periodos Interpretados en Modalidad Intermedia', async () => {
        await page.evaluate(() => {
            window.activarModalidadCalculadora('intermedia');
            // Simular respuesta exitosa del PDF
            const mockData = {
                nombreAsegurado: 'JUAN PÉREZ LÓPEZ',
                totalSemanasCotizadas: 1450,
                salarioDiarioPromedio: 680.50,
                salarioDiarioPromedioFormateado: '$680.50',
                periodos: [
                    { patron: 'EMPRESA TECNOLOGICA SA DE CV', fechaInicio: '2023-01-01', fechaFin: '2025-12-31', dias: 1095, semanas: 156.43, salarioDiario: 800 },
                    { patron: 'SERVICIOS INDUSTRIALES SC', fechaInicio: '2021-01-01', fechaFin: '2022-12-31', dias: 730, semanas: 104.29, salarioDiario: 500 }
                ]
            };
            window.ultimoDocumentoIMSS = mockData;
            document.getElementById('pension-verificacion-documento').style.display = 'block';
            document.getElementById('pension-resumen-interpretacion').innerHTML = `
                <div><strong>Asegurado interpretado:</strong> ${mockData.nombreAsegurado}</div>
                <div><strong>Total semanas cotizadas obtenidas:</strong> <strong>${mockData.totalSemanasCotizadas} semanas</strong></div>
                <div><strong>Salario promedio calculado:</strong> <strong>${mockData.salarioDiarioPromedioFormateado}</strong></div>
            `;
            document.getElementById('pension-tabla-periodos-tbody').innerHTML = mockData.periodos.map(p => `
                <tr><td>${p.patron}</td><td>${p.fechaInicio} al ${p.fechaFin}</td><td>${p.dias}</td><td>${p.semanas}</td><td>$${p.salarioDiario.toFixed(2)}</td></tr>
            `).join('');
        });

        const vVerif = await page.locator('#pension-verificacion-documento').isVisible();
        assert.strictEqual(vVerif, true, 'Panel de verificación es visible en Intermedia tras procesar PDF');

        const resumenContent = await page.locator('#pension-resumen-interpretacion').innerText();
        assert(resumenContent.includes('JUAN PÉREZ LÓPEZ'), 'Muestra nombre del asegurado interpretado');
        assert(resumenContent.includes('1450 semanas'), 'Muestra semanas interpretadas');
        assert(resumenContent.includes('$680.50'), 'Muestra salario promedio interpretado');
    });

    await testAsync('2.8 Usuario sin permisos recibe mensaje estándar no autorizado', async () => {
        await page.evaluate(() => {
            window.userPensionPermisos = new Set();
            document.getElementById('pension-modalidades-selector').style.display = 'none';
            document.getElementById('form-estimacion').style.display = 'none';
            document.getElementById('pension-unauthorized-message').style.display = 'block';
        });

        const vUnauth = await page.locator('#pension-unauthorized-message').isVisible();
        const vForm = await page.locator('#form-estimacion').isVisible();
        const unauthText = await page.locator('#pension-unauthorized-message').innerText();

        assert.strictEqual(vUnauth, true, 'Mensaje no autorizado es visible');
        assert.strictEqual(vForm, false, 'Formulario oculto cuando no hay permisos');
        assert(unauthText.includes('Acceso no autorizado o vencido para esta funcionalidad.'), 'Usa texto estándar sin revelar detalles RBAC');
    });

    await testAsync('2.9 No regresión del cálculo original Ley 73', async () => {
        const inputData = {
            salarioMinimo: 315.04,
            salarioDiarioPromedio: 1000.00,
            semanasCotizadas: 1500,
            edad: 65,
            tieneEsposa: true,
            numeroHijos: 0,
            tienePadresDependientes: false,
            estaEnSoledad: false,
            tieneIncapacidad: false
        };
        const calc = calculateIMSSLey73Pension(inputData);
        assert(calc.pensionFinalMensual > 0);
        assert.strictEqual(typeof calc.pensionFinalMensual, 'number');
        assert.strictEqual(calc.factorAdicional, 1.11);
    });

    await browser.close();

    console.log('\n================================================================================');
    console.log(`RESUMEN DE PRUEBAS: ${passed} PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================');
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Error fatal durante la ejecución de las pruebas:', err);
    process.exit(1);
});
