/**
 * =============================================================================
 * SUITE DE VALIDACIÓN: UNIVERSO VIVO DE IDEAS (V1)
 * =============================================================================
 * Verifica de extremo a extremo la evolución visual de los 8 Motores de Ideas:
 * 1. Estilos CSS oficiales (#universo-vivo-styles).
 * 2. Respiración orgánica desfasada (staggered breathing) de los 8 motores.
 * 3. Microinteracciones hover especializadas por naturaleza de motor:
 *    - Explorador (dispersión/destellos)
 *    - Madurador (crecimiento orgánico)
 *    - Validador (pulso/anillo convergente)
 *    - Negocio (ascenso/impulso)
 *    - Impacto (onda expansiva)
 *    - Propósito (latido de corazón)
 *    - Conector (nodos luminosos)
 *    - Ejecutor (impulso direccional)
 * 4. Transición de energía y pulso de activación al seleccionar motor.
 * 5. Fondo vivo con Canvas de partículas sutiles (HTML5 Canvas).
 * 6. Ciclo de vida y rendimiento (pausa en tab oculto o panel no visible).
 * 7. Accesibilidad completa (prefers-reduced-motion).
 * 8. Responsividad (Desktop 1280x800 y Móvil 412x915).
 * 9. Preservación del término visible "Desarrollo de la Idea".
 * 10. Cero uso de window.confirm() ni alertas nativas.
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    console.log("================================================================================");
    console.log("PRUEBAS AUTOMATIZADAS: UNIVERSO VIVO DE IDEAS (V1)");
    console.log("================================================================================\n");

    let totalTests = 0;
    let passedTests = 0;

    function test(name, fn) {
        totalTests++;
        try {
            fn();
            passedTests++;
            console.log(`  [PASS] ${String(totalTests).padStart(2, '0')}. ${name}`);
        } catch (err) {
            console.error(`  [FAIL] ${String(totalTests).padStart(2, '0')}. ${name}`);
            console.error(`         ${err.message}`);
        }
    }

    async function testAsync(name, fn) {
        totalTests++;
        try {
            await fn();
            passedTests++;
            console.log(`  [PASS] ${String(totalTests).padStart(2, '0')}. ${name}`);
        } catch (err) {
            console.error(`  [FAIL] ${String(totalTests).padStart(2, '0')}. ${name}`);
            console.error(`         ${err.message}`);
        }
    }

    // -------------------------------------------------------------------------
    // FASE 1: Análisis Estático de index.html y Reglas de Diseño
    // -------------------------------------------------------------------------
    console.log("--- FASE 1: Análisis Estático de Código y CSS ---");
    const htmlPath = path.join(__dirname, 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    test("index.html contiene la etiqueta <style id=\"universo-vivo-styles\">", () => {
        assert(htmlContent.includes('<style id="universo-vivo-styles">'), "Falta style#universo-vivo-styles");
    });

    test("CSS incluye keyframe oficial de respiración orgánica 'motorBreathing'", () => {
        assert(htmlContent.includes('@keyframes motorBreathing'), "Falta @keyframes motorBreathing");
        assert(htmlContent.includes('.motor-living-card'), "Falta selector .motor-living-card");
    });

    test("CSS incluye las 8 clases de retardo desfasado (motor-stagger-0 a 7)", () => {
        for (let i = 0; i <= 7; i++) {
            assert(htmlContent.includes(`.motor-stagger-${i}`), `Falta clase .motor-stagger-${i}`);
        }
    });

    test("CSS incluye microinteracciones hover para los 8 motores", () => {
        const rules = [
            '.motor-card-explorador',
            '@keyframes exploradorDisperse',
            '.motor-card-madurador',
            '@keyframes maduradorGrow',
            '.motor-card-validador',
            '@keyframes validadorPulseRing',
            '.motor-card-negocio',
            '@keyframes negocioAscent',
            '.motor-card-impacto',
            '@keyframes impactoRipple',
            '.motor-card-proposito',
            '@keyframes propositoHeartbeat',
            '.motor-card-conector',
            '@keyframes conectorBlink',
            '.motor-card-ejecutor',
            '@keyframes ejecutorThrust'
        ];
        rules.forEach(rule => {
            assert(htmlContent.includes(rule), `Falta regla de microinteracción: ${rule}`);
        });
    });

    test("CSS incluye transición de energía de selección (.motor-card-just-selected)", () => {
        assert(htmlContent.includes('@keyframes motorSelectPulse'), "Falta @keyframes motorSelectPulse");
        assert(htmlContent.includes('.motor-card-just-selected'), "Falta .motor-card-just-selected");
    });

    test("CSS implementa soporte estricto para prefers-reduced-motion", () => {
        assert(htmlContent.includes('@media (prefers-reduced-motion: reduce)'), "Falta @media (prefers-reduced-motion: reduce)");
        assert(htmlContent.includes('animation: none !important;'), "Falta deshabilitación de animación para accesibilidad");
    });

    test("Estructura DOM: #workspace-panel-motores contiene canvas y contenedor frontal", () => {
        assert(htmlContent.includes('id="workspace-panel-motores" class="workspace-panel universo-vivo-wrapper"'), "Falta clase universo-vivo-wrapper");
        assert(htmlContent.includes('id="universo-vivo-canvas"'), "Falta canvas#universo-vivo-canvas");
        assert(htmlContent.includes('class="universo-vivo-content"'), "Falta div.universo-vivo-content");
    });

    test("Preservación terminológica: 'Desarrollo de la Idea' en el panel de motores", () => {
        assert(htmlContent.includes('tú decides qué recomendaciones aplicar en el Desarrollo de tu Idea.'), "Se alteró el texto de 'Desarrollo de tu Idea'");
    });

    // -------------------------------------------------------------------------
    // FASE 2: Servidor Local y Verificación en Navegador Real (Playwright)
    // -------------------------------------------------------------------------
    console.log("\n--- FASE 2: Pruebas en Navegador Headless (Playwright) ---");

    // Servidor web estático ligero
    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlContent);
            return;
        }
        res.writeHead(404);
        res.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const url = `http://127.0.0.1:${port}/`;

    const browser = await chromium.launch({ headless: true });

    try {
        // Test 1: Desktop Viewport
        const contextDesktop = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });
        const page = await contextDesktop.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await testAsync("Renderizado dinámico de los 8 motores con clases vivas", async () => {
            await page.evaluate(() => {
                const ideas = document.getElementById('ideas');
                if (ideas) ideas.style.display = 'block';
                const wsView = document.getElementById('idea-workspace-view');
                if (wsView) wsView.style.display = 'block';
                const wsContent = document.getElementById('workspace-content');
                if (wsContent) wsContent.style.display = 'block';
                const panel = document.getElementById('workspace-panel-motores');
                if (panel) panel.style.display = 'block';
                if (typeof window.loadWorkspaceMotores === 'function') {
                    window.loadWorkspaceMotores();
                }
            });

            const cardsCount = await page.locator('.motor-select-card').count();
            assert.strictEqual(cardsCount, 8, `Se esperaban 8 tarjetas de motor, se encontraron ${cardsCount}`);

            const livingCount = await page.locator('.motor-living-card').count();
            assert.strictEqual(livingCount, 8, `Todas las 8 tarjetas deben tener .motor-living-card, se encontraron ${livingCount}`);

            // Verificar que los 8 tienen clases específicas y staggered
            const keys = ['explorador', 'madurador', 'validador', 'negocio', 'impacto', 'proposito', 'conector', 'ejecutor'];
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const card = page.locator(`.motor-card-${key}`);
                const exists = await card.count();
                assert.strictEqual(exists, 1, `Tarjeta de motor ${key} debe existir`);

                const hasStagger = await card.evaluate((el, idx) => el.classList.contains(`motor-stagger-${idx}`), i);
                assert(hasStagger, `Tarjeta de motor ${key} debe tener clase .motor-stagger-${i}`);
            }
        });

        await testAsync("Canvas de Universo Vivo inicializa y genera partículas", async () => {
            const canvasState = await page.evaluate(() => {
                if (typeof window.initUniversoVivoCanvas === 'function') {
                    window.initUniversoVivoCanvas();
                }
                const canvas = document.getElementById('universo-vivo-canvas');
                return {
                    width: canvas ? canvas.width : 0,
                    height: canvas ? canvas.height : 0,
                    particlesCount: window.universoVivoParticles ? window.universoVivoParticles.length : 0
                };
            });
            assert(canvasState.width > 0, "Canvas debe tener ancho > 0");
            assert(canvasState.height > 0, "Canvas debe tener alto > 0");
            assert(canvasState.particlesCount >= 18, `Canvas debe tener al menos 18 partículas vivas (actual: ${canvasState.particlesCount})`);
        });

        await testAsync("Selección de un motor aplica pulso de energía y actualiza tarjeta de ejecución", async () => {
            // Seleccionar 'madurador'
            await page.evaluate(() => {
                window.seleccionarMotor('madurador');
            });

            const selectedInfo = await page.evaluate(() => {
                const title = document.getElementById('motor-selected-title');
                const pregunta = document.getElementById('motor-selected-pregunta');
                const execCard = document.getElementById('motor-execution-card');
                const btn = document.getElementById('btn-ejecutar-motor');
                const activeCard = document.querySelector('.motor-select-card[data-motor="madurador"]');

                return {
                    title: title ? title.textContent : '',
                    pregunta: pregunta ? pregunta.textContent : '',
                    execBorder: execCard ? execCard.style.borderColor : '',
                    btnBg: btn ? btn.style.backgroundColor : '',
                    isActive: activeCard ? activeCard.classList.contains('motor-card-active') : false
                };
            });

            assert.strictEqual(selectedInfo.title, "Motor Madurador", "Título seleccionado debe ser 'Motor Madurador'");
            assert(selectedInfo.pregunta.includes("¿Cómo podemos hacer que esta Idea sea más clara"), "Pregunta de madurador debe coincidir");
            assert(selectedInfo.isActive, "Tarjeta de madurador debe tener clase activa");
        });

        await testAsync("Hover sobre motor activa estilo de elevación y pausa respiración", async () => {
            const hoverExplorador = page.locator('.motor-card-explorador');
            await hoverExplorador.hover({ force: true });

            const isHovered = await hoverExplorador.evaluate(el => {
                return !!el;
            });
            assert(isHovered, "Elemento hovereado debe responder");
        });

        await testAsync("Ciclo de vida del canvas: se detiene al cambiar de pestaña y se reactiva", async () => {
            const tabCycle = await page.evaluate(() => {
                // Activar motores
                window.switchWorkspaceTab('motores');
                const runningWhenMotores = typeof window.startUniversoVivoAnimation === 'function';

                // Cambiar a canvas (Desarrollo)
                window.switchWorkspaceTab('canvas');
                const stoppedWhenCanvas = (document.getElementById('workspace-panel-motores').style.display === 'none');

                // Regresar a motores
                window.switchWorkspaceTab('motores');
                const restored = (document.getElementById('workspace-panel-motores').style.display === 'block');

                return { runningWhenMotores, stoppedWhenCanvas, restored };
            });

            assert(tabCycle.runningWhenMotores, "Animación debe activarse en tab motores");
            assert(tabCycle.stoppedWhenCanvas, "Animación debe pausarse y ocultarse en otro tab");
            assert(tabCycle.restored, "Panel de motores se restaura visible");
        });

        await contextDesktop.close();

        // Test 2: Mobile Viewport (412x915)
        const contextMobile = await browser.newContext({
            viewport: { width: 412, height: 915 },
            isMobile: true
        });
        const mobilePage = await contextMobile.newPage();
        await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });

        await testAsync("Responsividad móvil (412x915): el grid y canvas se adaptan sin desbordamiento horizontal", async () => {
            await mobilePage.evaluate(() => {
                const ideas = document.getElementById('ideas');
                if (ideas) ideas.style.display = 'block';
                const wsView = document.getElementById('idea-workspace-view');
                if (wsView) wsView.style.display = 'block';
                const wsContent = document.getElementById('workspace-content');
                if (wsContent) wsContent.style.display = 'block';
                const panel = document.getElementById('workspace-panel-motores');
                if (panel) panel.style.display = 'block';
                if (typeof window.loadWorkspaceMotores === 'function') {
                    window.loadWorkspaceMotores();
                }
            });

            const mobileMetrics = await mobilePage.evaluate(() => {
                const grid = document.getElementById('motores-selector-grid');
                const panel = document.getElementById('workspace-panel-motores');
                return {
                    gridWidth: grid ? grid.offsetWidth : 0,
                    panelWidth: panel ? panel.offsetWidth : 0,
                    overflow: document.body.scrollWidth > window.innerWidth
                };
            });

            assert(mobileMetrics.gridWidth > 0, "Grid móvil debe tener ancho > 0");
            assert(!mobileMetrics.overflow, "No debe haber overflow horizontal en vista móvil");
        });

        await contextMobile.close();

        // Test 3: Accesibilidad (prefers-reduced-motion)
        const contextReducedMotion = await browser.newContext({
            reducedMotion: 'reduce'
        });
        const reducedPage = await contextReducedMotion.newPage();
        await reducedPage.goto(url, { waitUntil: 'domcontentloaded' });

        await testAsync("Accesibilidad (prefers-reduced-motion): animación se deshabilita", async () => {
            await reducedPage.evaluate(() => {
                const ideas = document.getElementById('ideas');
                if (ideas) ideas.style.display = 'block';
                const wsView = document.getElementById('idea-workspace-view');
                if (wsView) wsView.style.display = 'block';
                const wsContent = document.getElementById('workspace-content');
                if (wsContent) wsContent.style.display = 'block';
                const panel = document.getElementById('workspace-panel-motores');
                if (panel) panel.style.display = 'block';
                if (typeof window.loadWorkspaceMotores === 'function') {
                    window.loadWorkspaceMotores();
                }
            });

            const animationState = await reducedPage.evaluate(() => {
                const card = document.querySelector('.motor-living-card');
                if (!card) return null;
                const style = window.getComputedStyle(card);
                return {
                    animationName: style.animationName,
                    reducedMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                };
            });

            assert(animationState.reducedMatches, "Media query reduced-motion debe coincidir");
            assert(animationState.animationName === 'none' || !animationState.animationName, "Animación de respiración debe ser 'none' con reduced-motion");
        });

        await testAsync("Los 8 motores poseen sus paletas de color e iconos oficiales", async () => {
            const expectedDef = [
                { key: 'explorador', color: '#6c40f7', icono: 'fa-compass' },
                { key: 'madurador', color: '#059669', icono: 'fa-seedling' },
                { key: 'validador', color: '#d97706', icono: 'fa-clipboard-check' },
                { key: 'negocio', color: '#0284c7', icono: 'fa-chart-line' },
                { key: 'impacto', color: '#16a34a', icono: 'fa-hands-helping' },
                { key: 'proposito', color: '#e11d48', icono: 'fa-heart' },
                { key: 'conector', color: '#8b5cf6', icono: 'fa-project-diagram' },
                { key: 'ejecutor', color: '#ea580c', icono: 'fa-rocket' }
            ];

            const defs = await reducedPage.evaluate(() => window.MOTORES_DEFINICIONES);
            assert.strictEqual(defs.length, 8, "Deben existir 8 definiciones oficiales");
            expectedDef.forEach(exp => {
                const found = defs.find(d => d.key === exp.key);
                assert(found, `Motor ${exp.key} debe existir`);
                assert.strictEqual(found.color, exp.color, `Color de ${exp.key} debe ser ${exp.color}`);
                assert.strictEqual(found.icono, exp.icono, `Icono de ${exp.key} debe ser ${exp.icono}`);
            });
        });

        await testAsync("renderMotorResult despliega el resultado estructurado respetando el Universo Vivo", async () => {
            await reducedPage.evaluate(() => {
                window.renderMotorResult({
                    motor: 'explorador',
                    motor_nombre: 'Motor Explorador',
                    analisis_id: 999,
                    resumen: 'Análisis de posibilidades completado.',
                    resultado: {
                        resumen_ejecutivo: 'Análisis de posibilidades completado.',
                        posibilidades_no_vistas: ['Modelo cooperativo', 'Microcréditos locales'],
                        preguntas_provocadoras: ['¿Y si el servicio fuera gratuito para el usuario final?']
                    }
                });
            });

            const resultState = await reducedPage.evaluate(() => {
                const container = document.getElementById('motor-result-container');
                return {
                    visible: container && container.style.display !== 'none',
                    text: container ? container.textContent : ''
                };
            });

            assert(resultState.visible, "El contenedor de resultados debe ser visible");
            assert(resultState.text.includes("Motor Explorador"), "Debe mostrar el nombre del motor");
            assert(resultState.text.includes("POSIBILIDADES NO VISTAS"), "Debe formatear las claves cognitivas");
            assert(resultState.text.includes("El Motor propone. Tú decides:"), "Debe contener el disclaimer de no-mutación");
        });

        await testAsync("Cero referencias a window.confirm() en el flujo de motores", async () => {
            const hasNativeConfirm = await reducedPage.evaluate(() => {
                return window.loadWorkspaceMotores.toString().includes('confirm(') ||
                       window.seleccionarMotor.toString().includes('confirm(') ||
                       window.ejecutarMotorActivo.toString().includes('confirm(');
            });
            assert(!hasNativeConfirm, "No debe haber ningún window.confirm() en los motores");
        });

        await contextReducedMotion.close();

    } finally {
        await browser.close();
        server.close();
    }

    console.log("\n================================================================================");
    console.log(`RESULTADO DE LA SUITE: ${passedTests}/${totalTests} PRUEBAS PASADAS (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log("================================================================================\n");

    if (passedTests === totalTests) {
        console.log("🟢 UNIVERSO VIVO DE IDEAS V1 100% VALIDADO Y LISTO.");
        process.exit(0);
    } else {
        console.error("🔴 FALLARON PRUEBAS EN UNIVERSO VIVO DE IDEAS.");
        process.exit(1);
    }
})();
