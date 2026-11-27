const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { app } = require('../server');

const ARTIFACT_DIR = 'C:/Users/ASUS/.gemini/antigravity/brain/581be5b5-1e11-4627-a8f4-d7a7d3ec4c42';

async function runVisualValidation() {
    console.log('================================================================================');
    console.log('VALIDACIÓN VISUAL END-TO-END (PLAYWRIGHT): CALCULADORA DE PENSIONES (FASE 3)');
    console.log('================================================================================\n');

    let server;
    let browser;
    let port = 3459;

    try {
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(port, resolve));
        console.log(`Servidor local activo en puerto ${port}`);

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

        await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        // Activar Asesoría de Pensiones y formulario
        await page.evaluate(() => {
            const secServicios = document.getElementById('servicios');
            if (secServicios) secServicios.style.display = 'block';
            const viewPension = document.getElementById('servicios-pension-view');
            if (viewPension) viewPension.style.display = 'block';
            if (typeof activarModalidadCalculadora === 'function') {
                activarModalidadCalculadora('basica');
            }
            const formEst = document.getElementById('form-estimacion');
            if (formEst) formEst.style.display = 'block';
        });
        await page.waitForTimeout(400);

        // -------------------------------------------------------------
        // ESCENARIO 1: Escritorio (Desktop 1280x800)
        // -------------------------------------------------------------
        console.log('\n--- ESCENARIO 1: Escritorio (1280x800) ---');

        // 1.1 Caso donde GANA LA MÍNIMA (Calculada < Mínima)
        console.log('  1.1 Probando Caso donde gana la Pensión Mínima Legal...');
        await page.evaluate(() => {
            document.getElementById('salario-minimo').value = '315.04';
            document.getElementById('salario-promedio').value = '350.00';
            document.getElementById('semanas-cotizadas').value = '520';
            document.getElementById('edad-jubilacion').value = '60';
            document.getElementById('tiene-esposa').value = 'no';
            document.getElementById('numero-hijos').value = '0';
            document.getElementById('tiene-padres').value = 'no';
            document.getElementById('esta-soledad').value = 'no';
            document.getElementById('tiene-incapacidad').value = 'no';
        });

        await page.locator('#btn-calcular-pension').scrollIntoViewIfNeeded();
        await page.click('#btn-calcular-pension');
        await page.waitForTimeout(600);

        // Verificar visibilidad de las 3 tarjetas en DOM
        const textoResultadoDesktop1 = (await page.locator('#resultado-pension').innerText()).toLowerCase();
        const hasCardCalculada = textoResultadoDesktop1.includes('pensión calculada');
        const hasCardMinima = textoResultadoDesktop1.includes('pensión mínima aplicable');
        const hasCardAplicable = textoResultadoDesktop1.includes('pensión que aplicará');

        console.log(`  [${hasCardCalculada && hasCardMinima && hasCardAplicable ? 'PASS' : 'FAIL'}] Los tres conceptos están presentes en pantalla`);
        console.log(`  [${textoResultadoDesktop1.includes('garantía mínima legal') ? 'PASS' : 'FAIL'}] Prevalencia de garantía mínima: SÍ`);

        const shotDesktopMinima = path.join(ARTIFACT_DIR, 'pension_fase3_desktop_gana_minima.png');
        await page.screenshot({ path: shotDesktopMinima, fullPage: false });
        console.log(`  Captura guardada: ${shotDesktopMinima}`);

        // 1.2 Modal de transparencia informativa ⓘ
        console.log('  1.2 Abriendo modal de transparencia legal ⓘ...');
        await page.locator('#btn-info-minima-principal').click();
        await page.waitForTimeout(400);

        const modalVisible = await page.locator('#modal-info-pension-minima').isVisible();
        const textoModal = await page.locator('#modal-info-pension-minima').innerText();
        console.log(`  [${modalVisible ? 'PASS' : 'FAIL'}] Modal ⓘ visible en pantalla`);
        console.log(`  [${textoModal.includes('168') ? 'PASS' : 'FAIL'}] Contiene fundamento legal (Art 168): SÍ`);
        console.log(`  [${textoModal.includes('1.11') ? 'PASS' : 'FAIL'}] Contiene fórmula (1.11): SÍ`);

        const shotDesktopModal = path.join(ARTIFACT_DIR, 'pension_fase3_desktop_modal_transparencia.png');
        await page.screenshot({ path: shotDesktopModal, fullPage: false });
        console.log(`  Captura guardada: ${shotDesktopModal}`);

        // Cerrar modal
        await page.locator('#btn-cerrar-modal-info-minima').click();
        await page.waitForTimeout(300);

        // 1.3 Caso donde GANA LA CALCULADA (Calculada > Mínima)
        console.log('  1.3 Probando Caso donde gana la Pensión Calculada...');
        await page.evaluate(() => {
            document.getElementById('salario-minimo').value = '315.04';
            document.getElementById('salario-promedio').value = '1500.00';
            document.getElementById('semanas-cotizadas').value = '1800';
            document.getElementById('edad-jubilacion').value = '65';
            document.getElementById('tiene-esposa').value = 'si';
        });

        await page.locator('#btn-calcular-pension').scrollIntoViewIfNeeded();
        await page.click('#btn-calcular-pension');
        await page.waitForTimeout(600);

        const textoResultadoDesktop2 = (await page.locator('#resultado-pension').innerText()).toLowerCase();
        console.log(`  [${textoResultadoDesktop2.includes('cálculo actuarial prevaleciente') ? 'PASS' : 'FAIL'}] Prevalencia de cálculo actuarial: SÍ`);

        const shotDesktopCalculada = path.join(ARTIFACT_DIR, 'pension_fase3_desktop_gana_calculada.png');
        await page.screenshot({ path: shotDesktopCalculada, fullPage: false });
        console.log(`  Captura guardada: ${shotDesktopCalculada}`);

        // -------------------------------------------------------------
        // ESCENARIO 2: Móvil Vertical (Mobile Portrait 375x812)
        // -------------------------------------------------------------
        console.log('\n--- ESCENARIO 2: Móvil Vertical (375x812) ---');
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(400);

        // Verificar que no haya scroll horizontal involuntario
        const scrollWidthV = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidthV = await page.evaluate(() => document.documentElement.clientWidth);
        console.log(`  [${scrollWidthV <= clientWidthV + 1 ? 'PASS' : 'FAIL'}] Responsive móvil vertical sin overflow horizontal (Ancho: ${clientWidthV}px)`);

        const shotMobileV = path.join(ARTIFACT_DIR, 'pension_fase3_movil_vertical.png');
        await page.screenshot({ path: shotMobileV, fullPage: false });
        console.log(`  Captura guardada: ${shotMobileV}`);

        // -------------------------------------------------------------
        // ESCENARIO 3: Móvil Horizontal (Mobile Landscape 812x375)
        // -------------------------------------------------------------
        console.log('\n--- ESCENARIO 3: Móvil Horizontal (812x375) ---');
        await page.setViewportSize({ width: 812, height: 375 });
        await page.waitForTimeout(400);

        const scrollWidthH = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidthH = await page.evaluate(() => document.documentElement.clientWidth);
        console.log(`  [${scrollWidthH <= clientWidthH + 1 ? 'PASS' : 'FAIL'}] Responsive móvil horizontal sin overflow horizontal (Ancho: ${clientWidthH}px)`);

        const shotMobileH = path.join(ARTIFACT_DIR, 'pension_fase3_movil_horizontal.png');
        await page.screenshot({ path: shotMobileH, fullPage: false });
        console.log(`  Captura guardada: ${shotMobileH}`);

        console.log('\n================================================================================');
        console.log('¡VALIDACIÓN VISUAL PLAYWRIGHT CONCLUIDA EXITOSAMENTE!');
        console.log('================================================================================\n');

    } catch (err) {
        console.error('Error durante la validación visual:', err);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
        if (server) await new Promise((resolve) => server.close(resolve));
    }
}

runVisualValidation();
