/**
 * test_pension_e2e_edad_pensionaria.js
 * 
 * Prueba Funcional Completa E2E (Playwright) para el flujo:
 * Proyección -> Situación proyectada -> Aplicar valores a la calculadora -> Formulario de pensión -> Calcular Pensión.
 * 
 * Verifica:
 * 1. Tarjeta "Situación proyectada" muestra:
 *    - "Edad cronológica al término: 62 años, 7 meses"
 *    - "Edad para efectos de pensión IMSS: 63 años (90%)"
 *    - "Edad utilizada por IMSS para determinar el porcentaje de pensión."
 * 2. Al pulsar "Aplicar valores a la calculadora", el campo #edad-jubilacion recibe exactamente "63" (NO 62).
 * 3. Al pulsar "Calcular Pension" en el formulario principal, el desglose utiliza el 90% (factor de 63 años).
 * 4. Prueba con límite exacto de 60 años + 6 meses + 1 día -> Transfiere 61 y aplica 80%.
 */

const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

let browser;
let page;

async function run() {
    console.log('=== INICIANDO PRUEBA FUNCIONAL COMPLETA E2E: EDAD PENSIONARIA IMSS ===\n');

    // Iniciar navegador Playwright
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();

    try {
        const fileUrl = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
        await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        // Configurar estado en página (mostrar vista pensiones, modalidad avanzada, fecha nacimiento 1965-05-10)
        await page.evaluate(() => {
            window.showModal = () => {};
            const secServicios = document.getElementById('servicios');
            if (secServicios) secServicios.style.display = 'block';
            const viewPension = document.getElementById('servicios-pension-view');
            if (viewPension) viewPension.style.display = 'block';

            window.ultimoDocumentoIMSS = {
                nombreAsegurado: 'USUARIO PRUEBA',
                curp: 'XXXX650510XXXXXX01',
                fechaNacimiento: '1965-05-10',
                totalSemanasCotizadas: 1400,
                salarioDiarioPromedio: 1500
            };
            sessionStorage.setItem('pension_fecha_nacimiento', '1965-05-10');
            sessionStorage.setItem('pension_curp', 'XXXX650510XXXXXX01');
            if (typeof window.activarModalidadCalculadora === 'function') {
                window.activarModalidadCalculadora('avanzada');
            }
        });
        await page.waitForTimeout(300);

        console.log('[Paso 1: Abrir Modal de Proyección de Pensión]');
        await page.click('#btn-abrir-proyeccion');
        await page.waitForSelector('#modal-proyeccion-pension', { state: 'visible' });

        console.log('[Paso 2: Configurar periodo para alcanzar 62 años, 7 meses (Fecha final 2027-12-15)]');
        await page.evaluate(() => {
            document.getElementById('proy-fecha-desde').value = '2026-01-01';
            document.getElementById('proy-fecha-hasta').value = '2027-12-15';
            document.getElementById('proy-fecha-hasta').dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('proy-salario-diario-nuevo').value = '2000';
            document.getElementById('proy-salario-minimo-estimado').value = '315.04';
        });
        await page.waitForTimeout(100);

        console.log('[Paso 3: Ejecutar Proyección]');
        await page.click('#btn-ejecutar-proyeccion');
        await page.waitForSelector('#resultado-proyeccion-container', { state: 'visible' });

        const htmlResult = await page.locator('#resultado-proyeccion-container').innerHTML();
        console.log('[Paso 4: Validar presentación de ambas edades y leyenda]');
        assert(htmlResult.includes('Edad cronológica al término:'), 'Debe contener etiqueta Edad cronológica al término');
        assert(htmlResult.includes('62 años, 7 meses'), 'Debe mostrar 62 años, 7 meses como edad cronológica');
        assert(htmlResult.includes('Edad para efectos de pensión IMSS:'), 'Debe contener etiqueta Edad para efectos de pensión IMSS');
        assert(htmlResult.includes('63 años (90%)'), 'Debe mostrar 63 años (90%) como edad pensionaria');
        assert(htmlResult.includes('Edad utilizada por IMSS para determinar el porcentaje de pensión.'), 'Debe incluir leyenda explicativa');
        console.log('✓ Presentación visual validada exitosamente: Ambas edades y leyenda presentes.');

        console.log('[Paso 5: Pulsar "Aplicar valores a la calculadora"]');
        await page.click('#btn-aplicar-valores-calculadora');
        await page.waitForTimeout(200);

        console.log('[Paso 6: Comprobar valor en campo #edad-jubilacion del formulario principal]');
        const edadRecibida = await page.locator('#edad-jubilacion').inputValue();
        console.log(`→ Valor recibido en #edad-jubilacion: ${edadRecibida}`);
        assert.strictEqual(edadRecibida, '63', 'El campo #edad-jubilacion DEBE recibir 63 (Edad IMSS), NUNCA 62');
        console.log('✓ Comprobado: #edad-jubilacion recibió exactamente 63.');

        console.log('[Paso 7: Ejecutar "Calcular Pension" en el formulario principal]');
        await page.evaluate(() => {
            document.getElementById('salario-minimo').value = '315.04';
            document.getElementById('tiene-esposa').value = 'no';
            document.getElementById('numero-hijos').value = '0';
            document.getElementById('tiene-padres').value = 'no';
            document.getElementById('esta-soledad').value = 'no';
            document.getElementById('tiene-incapacidad').value = 'no';
        });
        await page.click('#btn-calcular-pension');
        await page.waitForSelector('#resultado-pension', { state: 'visible' });

        const textoResultadoPension = await page.locator('#resultado-pension').innerText();
        assert(textoResultadoPension.includes('Porcentaje por edad: 90 %'), 'El resultado de pensión debe aplicar el 90% correspondiente a los 63 años');
        console.log('✓ Comprobado: Cálculo principal de pensión utilizó 90% (factor de 63 años).');

        // -------------------------------------------------------------------------
        // CASO LÍMITE: 60 años + 6 meses + 1 día (Nacimiento 1965-12-07, Final 2026-06-08)
        // -------------------------------------------------------------------------
        console.log('\n[Paso 8: Probar caso límite 60 años + 6 meses + 1 día]');
        await page.evaluate(() => {
            window.ultimoDocumentoIMSS.fechaNacimiento = '1965-12-07';
            sessionStorage.setItem('pension_fecha_nacimiento', '1965-12-07');
        });

        await page.click('#btn-abrir-proyeccion');
        await page.waitForSelector('#modal-proyeccion-pension', { state: 'visible' });

        await page.evaluate(() => {
            document.getElementById('proy-fecha-desde').value = '2025-01-01';
            document.getElementById('proy-fecha-hasta').value = '2026-06-08';
            document.getElementById('proy-fecha-hasta').dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('proy-salario-diario-nuevo').value = '1800';
            document.getElementById('proy-salario-minimo-estimado').value = '315.04';
        });
        await page.click('#btn-ejecutar-proyeccion');
        await page.waitForTimeout(300);

        const htmlLimite = await page.locator('#resultado-proyeccion-container').innerHTML();
        assert(htmlLimite.includes('60 años, 6 meses'), 'Debe mostrar 60 años, 6 meses cronológicos');
        assert(htmlLimite.includes('61 años (80%)'), 'Debe mostrar 61 años (80%) pensionarios por rebasar 6 meses + 1 día');

        await page.click('#btn-aplicar-valores-calculadora');
        await page.waitForTimeout(200);

        const edadLimiteRecibida = await page.locator('#edad-jubilacion').inputValue();
        assert.strictEqual(edadLimiteRecibida, '61', 'El campo #edad-jubilacion debe recibir 61');
        console.log('✓ Comprobado caso límite: #edad-jubilacion recibió 61.');

        await page.click('#btn-calcular-pension');
        await page.waitForTimeout(200);
        const textoLimitePension = await page.locator('#resultado-pension').innerText();
        assert(textoLimitePension.includes('Porcentaje por edad: 80 %'), 'El resultado de pensión debe aplicar el 80%');
        console.log('✓ Comprobado caso límite: Pensión calculada con 80%.');

        console.log('\n=============================================================');
        console.log('¡TODAS LAS PRUEBAS FUNCIONALES E2E PASARON EXITOSAMENTE!');
        console.log('=============================================================');
    } finally {
        if (browser) await browser.close();
    }
}

run().catch((err) => {
    console.error('Error fatal en pruebas E2E:', err);
    process.exit(1);
});
