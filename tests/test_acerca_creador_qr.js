/**
 * tests/test_acerca_creador_qr.js
 * Suite integral de pruebas automatizadas para la sección de atribución
 * "Idealandia fue creada por" y código QR al final de "Acerca de".
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config();

const { app } = require('../server.js');

let server;
let port;
let baseUrl;
let browser;

async function run() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS: ATRIBUCIÓN Y CÓDIGO QR EN "ACERCA DE"');
    console.log('================================================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function report(name, condition, extraInfo) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`✅ [PASS] Caso ${totalTests}: ${name}`);
        } else {
            console.error(`❌ [FAIL] Caso ${totalTests}: ${name}`);
            if (extraInfo) console.error('   Detalles:', extraInfo);
            assert.fail(`Fallo en prueba: ${name}`);
        }
    }

    try {
        // 1. Verificación de integridad física del archivo estático
        const originalPath = 'C:/Users/ASUS/.gemini/antigravity/brain/581be5b5-1e11-4627-a8f4-d7a7d3ec4c42/.user_uploaded/media_1795715750158_54c06da7.png';
        const projectAssetPath = path.join(__dirname, '../img/idealandia-creador-qr.png');

        const originalBytes = fs.readFileSync(originalPath);
        const projectBytes = fs.readFileSync(projectAssetPath);

        report('El archivo estático existe en img/idealandia-creador-qr.png',
            fs.existsSync(projectAssetPath));
        report('El código QR es 100% idéntico en bytes a la imagen original provista (sin rediseño ni compresión)',
            originalBytes.equals(projectBytes));

        // 2. Iniciar servidor de prueba
        server = app.listen(0);
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`✓ Servidor iniciado en puerto ${port}\n`);

        // 3. Probar que el servidor sirve correctamente la imagen con HTTP 200 y Content-Type image/png
        const imgFetchRes = await fetch(`${baseUrl}/img/idealandia-creador-qr.png`);
        report('La imagen del QR es servida públicamente con HTTP 200 OK',
            imgFetchRes.status === 200);
        report('El Content-Type es image/png',
            imgFetchRes.headers.get('content-type') === 'image/png');

        // 4. Iniciar Playwright
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();

        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // Navegar a la sección "Acerca de"
        await page.evaluate(() => {
            const link = document.querySelector('a[data-section="acerca"], [data-target="acerca"], a[href="#acerca"]');
            if (link) link.click();
            else {
                document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
                const acerca = document.getElementById('acerca');
                if (acerca) acerca.style.display = 'block';
            }
        });

        await page.waitForSelector('#acerca', { state: 'visible', timeout: 5000 });
        console.log('✓ Sección "Acerca de" visible en el navegador.\n');

        // 5. Verificar que las 5 tarjetas originales siguen existiendo e intactas
        const tarjetasOriginales = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#acerca .acerca-item-card'));
            return cards.map(c => c.querySelector('h3')?.textContent?.trim());
        });

        report('Las 5 tarjetas informativas existentes de Acerca de permanecen intactas',
            tarjetasOriginales.length === 5 &&
            /1\. ¿Qué es Idealandia\?/i.test(tarjetasOriginales[0]) &&
            /2\. Nuestra filosofía/i.test(tarjetasOriginales[1]) &&
            /3\. Servicios y soluciones/i.test(tarjetasOriginales[2]) &&
            /4\. Idealita/i.test(tarjetasOriginales[3]) &&
            /5\. Recursos gratuitos/i.test(tarjetasOriginales[4]));

        // 6. Verificar que la tarjeta de atribución es el ÚLTIMO hijo de .acerca-container
        const posicionAtribucion = await page.evaluate(() => {
            const container = document.querySelector('#acerca .acerca-container');
            if (!container) return null;
            const children = Array.from(container.children);
            const lastChild = children[children.length - 1];
            return {
                totalChildren: children.length,
                isLastChildAtribucion: lastChild && lastChild.classList.contains('acerca-atribucion-card'),
                tituloText: lastChild?.querySelector('.acerca-atribucion-titulo')?.textContent?.trim(),
                hasImg: !!lastChild?.querySelector('img.acerca-atribucion-qr')
            };
        });

        report('La sección de atribución se encuentra al final de todo el contenido de Acerca de (último elemento)',
            posicionAtribucion.isLastChildAtribucion);
        report('El texto de la leyenda es exactamente "Idealandia fue creada por"',
            posicionAtribucion.tituloText === 'Idealandia fue creada por');
        report('Contiene la imagen del código QR',
            posicionAtribucion.hasImg);

        // 7. Verificar que el QR aparece DEBAJO de la leyenda (posición Y superior del QR > posición Y del título)
        const ordenVisual = await page.evaluate(() => {
            const card = document.querySelector('.acerca-atribucion-card');
            const titulo = card.querySelector('.acerca-atribucion-titulo');
            const qrWrapper = card.querySelector('.acerca-atribucion-qr-wrapper');
            const rectTitulo = titulo.getBoundingClientRect();
            const rectQr = qrWrapper.getBoundingClientRect();

            return {
                qrDebajoDeTitulo: rectQr.top >= rectTitulo.bottom,
                tituloCentrado: Math.abs((rectTitulo.left + rectTitulo.width / 2) - (card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2)) < 5,
                qrCentrado: Math.abs((rectQr.left + rectQr.width / 2) - (card.getBoundingClientRect().left + card.getBoundingClientRect().width / 2)) < 5
            };
        });

        report('El código QR está posicionado visualmente debajo de la leyenda',
            ordenVisual.qrDebajoDeTitulo);
        report('El título y el código QR están centrados horizontalmente en la tarjeta',
            ordenVisual.tituloCentrado && ordenVisual.qrCentrado);

        // 8. Verificación de proporciones cuadradas y renderizado en Escritorio (1280px)
        console.log('\n[BLOQUE: Pruebas Responsive y Aspect-Ratio]');

        const dimsEscritorio = await page.evaluate(() => {
            const qr = document.querySelector('.acerca-atribucion-qr');
            const naturalW = qr.naturalWidth;
            const naturalH = qr.naturalHeight;
            const clientW = qr.clientWidth;
            const clientH = qr.clientHeight;
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { naturalW, naturalH, clientW, clientH, docW, winW };
        });

        report('Escritorio (1280px): La imagen cargó con dimensiones naturales 300x300',
            dimsEscritorio.naturalW === 300 && dimsEscritorio.naturalH === 300);
        report('Escritorio (1280px): El QR conserva proporciones cuadradas estrictas (ancho === alto)',
            Math.abs(dimsEscritorio.clientW - dimsEscritorio.clientH) <= 1 && dimsEscritorio.clientW > 0);
        report('Escritorio (1280px): Sin desbordamiento horizontal',
            dimsEscritorio.docW <= dimsEscritorio.winW);

        // 9. Verificación en Tablet (768px x 1024px)
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(200);

        const dimsTablet = await page.evaluate(() => {
            const qr = document.querySelector('.acerca-atribucion-qr');
            const clientW = qr.clientWidth;
            const clientH = qr.clientHeight;
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { clientW, clientH, noOverflow: docW <= winW };
        });

        report('Tablet (768px): Proporción cuadrada perfecta y sin overflow',
            Math.abs(dimsTablet.clientW - dimsTablet.clientH) <= 1 && dimsTablet.noOverflow);

        // 10. Verificación en Móvil Vertical (360px x 640px)
        await page.setViewportSize({ width: 360, height: 640 });
        await page.waitForTimeout(200);

        const dimsMovilV = await page.evaluate(() => {
            const qr = document.querySelector('.acerca-atribucion-qr');
            const clientW = qr.clientWidth;
            const clientH = qr.clientHeight;
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { clientW, clientH, noOverflow: docW <= winW };
        });

        report('Móvil vertical (360px): El QR es cuadrado, legible para escaneo y sin overflow horizontal',
            Math.abs(dimsMovilV.clientW - dimsMovilV.clientH) <= 1 && dimsMovilV.clientW >= 150 && dimsMovilV.noOverflow);

        // 11. Verificación en Móvil Horizontal (667px x 375px)
        await page.setViewportSize({ width: 667, height: 375 });
        await page.waitForTimeout(200);

        const dimsMovilH = await page.evaluate(() => {
            const qr = document.querySelector('.acerca-atribucion-qr');
            const clientW = qr.clientWidth;
            const clientH = qr.clientHeight;
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { clientW, clientH, noOverflow: docW <= winW };
        });

        report('Móvil horizontal (667px): El QR es cuadrado y sin overflow horizontal',
            Math.abs(dimsMovilH.clientW - dimsMovilH.clientH) <= 1 && dimsMovilH.noOverflow);

        console.log('\n================================================================================');
        console.log(`RESULTADO DE LA SUITE: ${passedTests} de ${totalTests} PRUEBAS SUPERADAS EXITOSAMENTE`);
        console.log('================================================================================\n');

        await browser.close();
        server.close();
        process.exit(0);

    } catch (err) {
        console.error('Error ejecutando suite:', err);
        if (browser) await browser.close();
        if (server) server.close();
        process.exit(1);
    }
}

run();
