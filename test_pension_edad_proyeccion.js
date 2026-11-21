const assert = require('assert');
const path = require('path');
const { chromium } = require('playwright');
const { 
    calcularEdadExacta, 
    calculatePensionProjection, 
    calculateIMSSLey73Pension,
    extractBirthDateFromCurp,
    TABLA_PORCENTAJES_LEY73
} = require('./pension.js');

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

async function runSuite() {
    console.log('================================================================================');
    console.log('SUITE DE VALIDACIÓN: CÁLCULO CRONOLÓGICO DE EDAD AL APLICAR VALORES DE PROYECCIÓN');
    console.log('================================================================================');

    console.log('\n--- BLOQUE 1: Casos Fundamentales de calcularEdadExacta ---');

    test('1.1: Fecha nacimiento 07/12/1965 + fecha final 21/11/2027 -> 61 años (cumpleaños 62 aún no ocurre)', () => {
        const edad = calcularEdadExacta('1965-12-07', '2027-11-21');
        assert.strictEqual(edad, 61, 'Debe ser exactamente 61 años');
    });

    test('1.2: Fecha nacimiento 07/12/1965 + fecha final 07/12/2027 -> 62 años (cumpleaños exacto)', () => {
        const edad = calcularEdadExacta('1965-12-07', '2027-12-07');
        assert.strictEqual(edad, 62, 'Debe ser exactamente 62 años');
    });

    test('1.3: Fecha nacimiento 07/12/1965 + fecha final 08/12/2027 -> 62 años (día posterior al cumpleaños)', () => {
        const edad = calcularEdadExacta('1965-12-07', '2027-12-08');
        assert.strictEqual(edad, 62, 'Debe ser exactamente 62 años');
    });

    test('1.4: Fecha final anterior al cumpleaños del año correspondiente produce la edad anterior', () => {
        const edadUnDiaAntes = calcularEdadExacta('1965-12-07', '2027-12-06');
        assert.strictEqual(edadUnDiaAntes, 61, 'Un día antes del cumpleaños debe ser la edad anterior (61)');

        const edadUnMesAntes = calcularEdadExacta('1965-12-07', '2027-11-07');
        assert.strictEqual(edadUnMesAntes, 61, 'Un mes antes del cumpleaños debe ser la edad anterior (61)');
    });

    test('1.5: Fecha final exactamente en el cumpleaños produce la edad nueva', () => {
        assert.strictEqual(calcularEdadExacta('1965-12-07', '2025-12-07'), 60, 'Cumpleaños 60 exacto');
        assert.strictEqual(calcularEdadExacta('1965-12-07', '2026-12-07'), 61, 'Cumpleaños 61 exacto');
        assert.strictEqual(calcularEdadExacta('1965-12-07', '2028-12-07'), 63, 'Cumpleaños 63 exacto');
        assert.strictEqual(calcularEdadExacta('1965-12-07', '2029-12-07'), 64, 'Cumpleaños 64 exacto');
        assert.strictEqual(calcularEdadExacta('1965-12-07', '2030-12-07'), 65, 'Cumpleaños 65 exacto');
    });

    test('1.6: Soporte de formatos cruzados (DD/MM/YYYY y YYYY-MM-DD)', () => {
        const edad1 = calcularEdadExacta('07/12/1965', '21/11/2027');
        assert.strictEqual(edad1, 61, 'Formato DD/MM/YYYY debe producir 61');

        const edad2 = calcularEdadExacta('07/12/1965', '2027-11-21');
        assert.strictEqual(edad2, 61, 'Formato mixto DD/MM/YYYY y YYYY-MM-DD debe producir 61');

        const edad3 = calcularEdadExacta('1965-12-07', '07/12/2027');
        assert.strictEqual(edad3, 62, 'Formato mixto inverso debe producir 62');
    });

    test('1.7: Años bisiestos (nacimiento 29/02/1964)', () => {
        // En año bisiesto 2024:
        assert.strictEqual(calcularEdadExacta('1964-02-29', '2024-02-28'), 59, '28/02/2024 es 1 día antes del cumple en año bisiesto -> 59');
        assert.strictEqual(calcularEdadExacta('1964-02-29', '2024-02-29'), 60, '29/02/2024 es el cumpleaños en año bisiesto -> 60');
        // En año no bisiesto 2025:
        assert.strictEqual(calcularEdadExacta('1964-02-29', '2025-02-28'), 60, '28/02/2025 aún no llega marzo en año ordinario -> 60');
        assert.strictEqual(calcularEdadExacta('1964-02-29', '2025-03-01'), 61, '01/03/2025 ya concluyó febrero -> 61');
    });

    console.log('\n--- BLOQUE 2: Integración con calculatePensionProjection ---');

    test('2.1: calculatePensionProjection incluye edadCronologica exacta a la fechaHasta', () => {
        const res = calculatePensionProjection({
            semanasActuales: 1615,
            salarioPromedioActual: 2585.94,
            salarioDiarioProyectado: 2714.25,
            fechaDesde: '2026-11-21',
            fechaHasta: '2027-11-21',
            fechaNacimiento: '1965-12-07'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.situacionProyectada.edadCronologica, 61, 'edadCronologica debe ser 61');
        assert.strictEqual(res.situacionProyectada.fechaNacimiento, '1965-12-07');
    });

    test('2.2: calculatePensionProjection con fechaHasta en cumpleaños incrementa edadCronologica', () => {
        const res = calculatePensionProjection({
            semanasActuales: 1615,
            salarioPromedioActual: 2585.94,
            salarioDiarioProyectado: 2714.25,
            fechaDesde: '2026-11-21',
            fechaHasta: '2027-12-07',
            fechaNacimiento: '1965-12-07'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.situacionProyectada.edadCronologica, 62, 'edadCronologica debe ser 62');
    });

    test('2.3: calculatePensionProjection deduce fechaNacimiento desde CURP oficial', () => {
        const res = calculatePensionProjection({
            semanasActuales: 1615,
            salarioPromedioActual: 2585.94,
            salarioDiarioProyectado: 2714.25,
            fechaDesde: '2026-11-21',
            fechaHasta: '2027-11-21',
            curp: 'GAFE651207HQTRLF02'
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.situacionProyectada.edadCronologica, 61, 'Debe deducir 1965-12-07 del CURP y edad 61');
    });

    console.log('\n--- BLOQUE 3: Integración Frontend y Verificación DOM (Playwright) ---');

    let browser;
    let page;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        page = await context.newPage();

        const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
        await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        // Habilitar vista de servicios pensiones y modalidad avanzada
        await page.evaluate(() => {
            window.showModal = () => {};
            const secServicios = document.getElementById('servicios');
            if (secServicios) secServicios.style.display = 'block';
            const viewPension = document.getElementById('servicios-pension-view');
            if (viewPension) viewPension.style.display = 'block';

            // Simular datos interpretados del documento IMSS
            window.ultimoDocumentoIMSS = {
                nombreAsegurado: 'EFRAIN GARDUÑO',
                curp: 'GAFE651207HQTRLF02',
                fechaNacimiento: '1965-12-07',
                totalSemanasCotizadas: 1615,
                salarioDiarioPromedio: 2585.94
            };
            sessionStorage.setItem('pension_fecha_nacimiento', '1965-12-07');
            sessionStorage.setItem('pension_curp', 'GAFE651207HQTRLF02');

            // Activar modalidad avanzada
            window.activarModalidadCalculadora('avanzada');
        });
        await page.waitForTimeout(300);

        await testAsync('3.1: Aplicar valores con fechaHasta 21/11/2027 asigna exactamente 61 años a #edad-jubilacion', async () => {
            // Abrir modal de proyección
            await page.click('#btn-abrir-proyeccion');
            await page.waitForTimeout(200);

            // Asignar parámetros: desde 2026-11-21 hasta 2027-11-21
            await page.evaluate(() => {
                document.getElementById('proy-fecha-desde').value = '2026-11-21';
                document.getElementById('proy-fecha-hasta').value = '2027-11-21';
                document.getElementById('proy-fecha-hasta').dispatchEvent(new Event('change', { bubbles: true }));
                document.getElementById('proy-salario-diario-nuevo').value = '2714.25';
            });
            await page.waitForTimeout(100);

            // Ejecutar proyección
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(300);

            // Verificar que se muestre en pantalla la edad al término
            const resultadoHTML = await page.locator('#resultado-proyeccion-container').innerHTML();
            assert(resultadoHTML.includes('61 años'), 'Debe mostrar 61 años en el resultado de la proyección');

            // Clic en "Aplicar valores a la calculadora"
            await page.click('#btn-aplicar-valores-calculadora');
            await page.waitForTimeout(200);

            // Verificar campo "Edad al solicitar la pensión"
            const edadValor = await page.locator('#edad-jubilacion').inputValue();
            assert.strictEqual(edadValor, '61', 'El campo #edad-jubilacion debe tener el valor exacto 61');
        });

        await testAsync('3.2: El cálculo de pensión principal utiliza internamente el valor 61 de #edad-jubilacion (80% factor)', async () => {
            await page.evaluate(() => {
                document.getElementById('salario-minimo').value = '315.04';
                document.getElementById('tiene-esposa').value = 'no';
                document.getElementById('numero-hijos').value = '0';
                document.getElementById('tiene-padres').value = 'no';
                document.getElementById('esta-soledad').value = 'no';
                document.getElementById('tiene-incapacidad').value = 'no';
            });

            // Clic en calcular pensión
            await page.click('#btn-calcular-pension');
            await page.waitForTimeout(200);

            const desgloseHTML = await page.locator('#resultado-pension').innerText();
            assert(desgloseHTML.includes('Porcentaje por edad: 80 %'), 'El cálculo principal debe reflejar el factor de 61 años (80%)');
        });

        await testAsync('3.3: Aplicar valores con fechaHasta en cumpleaños (07/12/2027) asigna 62 años y factor 85%', async () => {
            // Abrir modal de proyección nuevamente
            await page.click('#btn-abrir-proyeccion');
            await page.waitForTimeout(200);

            // Asignar parámetros hasta el día exacto del cumpleaños
            await page.evaluate(() => {
                document.getElementById('proy-fecha-desde').value = '2026-11-21';
                document.getElementById('proy-fecha-hasta').value = '2027-12-07';
                document.getElementById('proy-fecha-hasta').dispatchEvent(new Event('change', { bubbles: true }));
                document.getElementById('proy-salario-diario-nuevo').value = '2714.25';
            });
            await page.waitForTimeout(100);

            // Ejecutar proyección
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(300);

            // Clic en "Aplicar valores a la calculadora"
            await page.click('#btn-aplicar-valores-calculadora');
            await page.waitForTimeout(200);

            // Verificar campo "Edad al solicitar la pensión"
            const edadValor = await page.locator('#edad-jubilacion').inputValue();
            assert.strictEqual(edadValor, '62', 'El campo #edad-jubilacion debe haber sido actualizado a 62');

            // Clic en calcular pensión
            await page.click('#btn-calcular-pension');
            await page.waitForTimeout(200);

            const desgloseHTML = await page.locator('#resultado-pension').innerText();
            assert(desgloseHTML.includes('Porcentaje por edad: 85 %'), 'El cálculo principal debe reflejar el factor de 62 años (85%)');
        });

    } finally {
        if (browser) await browser.close();
    }

    console.log('================================================================================');
    console.log(`RESUMEN: ${passed} PRUEBAS PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Error fatal en la ejecución de la suite:', err);
    process.exit(1);
});
