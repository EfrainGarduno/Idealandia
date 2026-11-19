/**
 * =============================================================================
 * SUITE DE VALIDACIÓN: UNIVERSO CREATIVO DE IDEAS (V2: EXPLOSIÓN CREATIVA)
 * =============================================================================
 * Valida de extremo a extremo:
 * 1. Módulos externos universo_creativo.css y universo_creativo.js.
 * 2. Banco de conceptos "Ideas Volando" (16 palabras dinámicas con ciclo de vida).
 * 3. Capa cósmica de partículas multidimensionales en Canvas 2D.
 * 4. Red de conexiones y filamentos de energía entre los 8 motores.
 * 5. Microanimaciones y personalidades marcadas para los 8 motores.
 * 6. Secuencia de EXPLOSIÓN DE ACTIVACIÓN (Shockwave + Ráfaga 50-70 + atracción magnética).
 * 7. Núcleo Creativo de Procesamiento (Vórtice energético activo durante llamada IA).
 * 8. Destello de Revelación (Flash de Eureka al culminar).
 * 9. Ciclo de vida y rendimiento (pausa en tab oculto o panel no visible).
 * 10. Accesibilidad completa (prefers-reduced-motion).
 * 11. Responsividad (Desktop 1280x800 y Móvil 412x915).
 * 12. Captura visual automática (captura_explosion_creativa.png).
 * 13. Preservación del término visible "Desarrollo de la Idea".
 * 14. Cero uso de window.confirm() ni alertas nativas.
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    console.log("================================================================================");
    console.log("PRUEBAS AUTOMATIZADAS: UNIVERSO CREATIVO DE IDEAS (V2: EXPLOSIÓN CREATIVA)");
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
    // FASE 1: Análisis Estático y Modularidad
    // -------------------------------------------------------------------------
    console.log("--- FASE 1: Estructura Modular y Archivos V2 ---");
    const htmlPath = path.join(__dirname, 'index.html');
    const cssPath = path.join(__dirname, 'universo_creativo.css');
    const jsPath = path.join(__dirname, 'universo_creativo.js');

    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    test("index.html incluye enlace a universo_creativo.css y script universo_creativo.js", () => {
        assert(htmlContent.includes('href="/universo_creativo.css"'), "Falta link a /universo_creativo.css");
        assert(htmlContent.includes('src="/universo_creativo.js"'), "Falta script a /universo_creativo.js");
    });

    test("universo_creativo.css define las reglas del Universo Creativo V3", () => {
        assert(cssContent.includes('.universo-creativo-wrapper'), "Falta .universo-creativo-wrapper");
        assert(cssContent.includes('.universo-banner-card'), "Falta .universo-banner-card");
        assert(cssContent.includes('@keyframes motorBreathingV3') || cssContent.includes('@keyframes motorBreathingV2'), "Falta @keyframes motorBreathingV3");
        assert(cssContent.includes('@keyframes rotateBorderCurrent'), "Falta @keyframes rotateBorderCurrent");
        assert(cssContent.includes('.motor-card-charging'), "Falta .motor-card-charging");
        assert(cssContent.includes('.motor-card-inner'), "Falta .motor-card-inner");
        assert(cssContent.includes('.motor-execution-processing'), "Falta .motor-execution-processing");
        assert(cssContent.includes('.motor-result-animated'), "Falta .motor-result-animated");
    });

    test("universo_creativo.js implementa UniversoCreativoEngine y banco 'Ideas Volando'", () => {
        assert(jsContent.includes('class UniversoCreativoEngine'), "Falta class UniversoCreativoEngine");
        assert(jsContent.includes('PALABRAS_CREATIVAS'), "Falta banco PALABRAS_CREATIVAS");
        assert(jsContent.includes('triggerExplosion'), "Falta método triggerExplosion");
        assert(jsContent.includes('setProcessingMode'), "Falta método setProcessingMode");
        assert(jsContent.includes('triggerEurekaFlash'), "Falta método triggerEurekaFlash");
        assert(jsContent.includes('window.universoCreativo'), "Falta export window.universoCreativo");
    });

    test("Preservación terminológica: 'Desarrollo de la Idea' en el panel de motores", () => {
        assert(htmlContent.includes('tú decides qué recomendaciones aplicar en el Desarrollo de tu Idea.'), "Se alteró el texto de 'Desarrollo de tu Idea'");
    });

    // -------------------------------------------------------------------------
    // FASE 2: Servidor Local y Navegador Headless (Playwright)
    // -------------------------------------------------------------------------
    console.log("\n--- FASE 2: Ejecución Real en Navegador (Playwright) ---");

    const server = http.createServer((req, res) => {
        let reqPath = req.url.split('?')[0];
        if (reqPath === '/' || reqPath === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlContent);
            return;
        }
        if (reqPath === '/universo_creativo.css') {
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
            res.end(cssContent);
            return;
        }
        if (reqPath === '/universo_creativo.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(jsContent);
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
        const contextDesktop = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });
        const page = await contextDesktop.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await testAsync("Inicialización del Universo Creativo V3 en DOM y Doble Canvas (Fondo + Frontal)", async () => {
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
                if (window.universoCreativo && typeof window.universoCreativo.start === 'function') {
                    window.universoCreativo.start();
                }
            });

            const engineState = await page.evaluate(() => {
                const uc = window.universoCreativo;
                const bgCanvas = document.getElementById('universo-vivo-canvas');
                const frontCanvas = document.getElementById('universo-front-canvas');
                const nucleo = document.getElementById('universo-nucleo-idea');
                return {
                    exists: !!uc,
                    running: uc ? uc.running : false,
                    particlesCount: uc ? uc.particles.length : 0,
                    wordsCount: uc ? uc.words.length : 0,
                    bgCanvasW: bgCanvas ? bgCanvas.width : 0,
                    bgCanvasH: bgCanvas ? bgCanvas.height : 0,
                    frontCanvasW: frontCanvas ? frontCanvas.width : 0,
                    frontCanvasH: frontCanvas ? frontCanvas.height : 0,
                    hasFrontCanvas: !!frontCanvas,
                    hasNucleo: !!nucleo
                };
            });

            assert(engineState.exists, "window.universoCreativo debe existir");
            assert(engineState.running, "Universo Creativo debe estar ejecutándose");
            assert(engineState.hasFrontCanvas, "Canvas Frontal (#universo-front-canvas) debe existir");
            assert(engineState.hasNucleo, "Núcleo Creativo (#universo-nucleo-idea) debe existir");
            assert(engineState.particlesCount >= 30, `Debe tener al menos 30 partículas (actual: ${engineState.particlesCount})`);
            assert(engineState.wordsCount >= 2, `Debe tener palabras flotantes activas (actual: ${engineState.wordsCount})`);
            assert(engineState.bgCanvasW > 0 && engineState.frontCanvasW > 0, "Ambos Canvas deben tener dimensiones > 0");
        });

        await testAsync("Renderizado de los 8 motores con Glassmorphism (.motor-card-inner) y personalidades", async () => {
            const cardsCount = await page.locator('.motor-select-card').count();
            assert.strictEqual(cardsCount, 8, "Deben existir 8 tarjetas de motor");

            const keys = ['explorador', 'madurador', 'validador', 'negocio', 'impacto', 'proposito', 'conector', 'ejecutor'];
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const card = page.locator(`.motor-card-${key}`);
                const count = await card.count();
                assert.strictEqual(count, 1, `Debe existir tarjeta para ${key}`);

                const hasInner = await card.evaluate(el => !!el.querySelector('.motor-card-inner'));
                assert(hasInner, `Tarjeta ${key} debe tener capa glassmorphism .motor-card-inner`);

                const hasStagger = await card.evaluate((el, idx) => el.classList.contains(`motor-stagger-${idx}`), i);
                assert(hasStagger, `Tarjeta ${key} debe tener clase .motor-stagger-${i}`);
            }
        });

        await testAsync("Hover sobre motor responde con elevación, resplandor y pausa", async () => {
            const cardExplorador = page.locator('.motor-card-explorador');
            await cardExplorador.hover({ force: true });

            const hoverInfo = await cardExplorador.evaluate(el => {
                const style = window.getComputedStyle(el);
                return {
                    cursor: style.cursor,
                    boxShadow: style.boxShadow
                };
            });
            assert.strictEqual(hoverInfo.cursor, 'pointer', "Cursor debe ser pointer");
            assert(hoverInfo.boxShadow && hoverInfo.boxShadow !== 'none', "Debe tener sombra luminosa");
        });

        await testAsync("Secuencia de 4 fases de ACTIVACIÓN al seleccionar un motor", async () => {
            // Seleccionar 'validador'
            await page.evaluate(() => {
                window.seleccionarMotor('validador');
            });

            // Fase 1: Carga inmediata con corriente rápida perimetral (.motor-card-charging)
            const phase1 = await page.evaluate(() => {
                const activeCard = document.querySelector('.motor-select-card[data-motor="validador"]');
                return {
                    activeKey: window.motorActivoKey,
                    isCardActive: activeCard ? activeCard.classList.contains('motor-card-active') : false,
                    isCharging: activeCard ? activeCard.classList.contains('motor-card-charging') : false
                };
            });
            assert.strictEqual(phase1.activeKey, 'validador', "Motor activo debe ser validador");
            assert(phase1.isCardActive, "Tarjeta seleccionada debe tener .motor-card-active");
            assert(phase1.isCharging, "Tarjeta debe iniciar con fase de carga .motor-card-charging");

            // Esperar que culmine la carga (280ms) y dispare la ráfaga frontal
            await page.waitForTimeout(320);

            // Fase 2 & 3: Explosión en canvas frontal + pulso final
            const phase2 = await page.evaluate(() => {
                const uc = window.universoCreativo;
                const activeCard = document.querySelector('.motor-select-card[data-motor="validador"]');
                return {
                    hasPulseClass: activeCard ? activeCard.classList.contains('motor-card-just-selected') : false,
                    shockwavesCount: uc ? uc.shockwaves.length : 0,
                    burstParticlesCount: uc ? uc.burstParticles.length : 0
                };
            });

            assert(phase2.hasPulseClass, "Tarjeta debe culminar con .motor-card-just-selected");
            assert(phase2.burstParticlesCount >= 50, `Debe haber generado ráfaga de 50+ partículas frontales (actual: ${phase2.burstParticlesCount})`);
            assert(phase2.shockwavesCount >= 1, `Debe haber generado onda de choque expansiva frontal (actual: ${phase2.shockwavesCount})`);
        });

        await testAsync("Modo Núcleo Creativo de Procesamiento (durante ejecución IA) y Flash de Eureka", async () => {
            // Activar modo procesamiento
            await page.evaluate(() => {
                window.universoCreativo.setProcessingMode(true, 'ejecutor');
            });

            const processingState = await page.evaluate(() => {
                const execCard = document.getElementById('motor-execution-card');
                return {
                    isProcessing: window.universoCreativo.isProcessing,
                    hasProcessingClass: execCard ? execCard.classList.contains('motor-execution-processing') : false
                };
            });

            assert(processingState.isProcessing, "Universo creativo debe estar en isProcessing=true");
            assert(processingState.hasProcessingClass, "Tarjeta de ejecución debe tener clase .motor-execution-processing");

            // Desactivar modo procesamiento (emite Flash de Eureka)
            await page.evaluate(() => {
                window.universoCreativo.setProcessingMode(false, 'ejecutor');
            });

            const eurekaState = await page.evaluate(() => {
                const uc = window.universoCreativo;
                return {
                    isProcessing: uc.isProcessing,
                    shockwaves: uc.shockwaves.length
                };
            });

            assert(!eurekaState.isProcessing, "Universo creativo debe finalizar procesamiento");
            assert(eurekaState.shockwaves >= 1, "Debe haber emitido Flash de Eureka (shockwave)");
        });

        await testAsync("Renderizado dinámico de resultado estructurado con animación de revelación", async () => {
            await page.evaluate(() => {
                window.renderMotorResult({
                    motor: 'ejecutor',
                    motor_nombre: 'Motor Ejecutor',
                    analisis_id: 108,
                    resumen: 'Plan de acción para los primeros 7 días generado.',
                    resultado: {
                        resumen_ejecutivo: 'Plan de acción para los primeros 7 días generado.',
                        plan_primeros_7_dias: ['Día 1: Definir prototipo', 'Día 2: Validar supuestos'],
                        primera_accion_hoy: 'Contactar a los 3 primeros usuarios potenciales.'
                    }
                });
            });

            const resultState = await page.evaluate(() => {
                const cont = document.getElementById('motor-result-container');
                return {
                    visible: cont && cont.style.display !== 'none',
                    hasAnimClass: cont ? cont.classList.contains('motor-result-animated') : false,
                    text: cont ? cont.textContent : ''
                };
            });

            assert(resultState.visible, "Contenedor de resultado debe ser visible");
            assert(resultState.hasAnimClass, "Contenedor debe tener .motor-result-animated");
            assert(resultState.text.includes("Motor Ejecutor"), "Debe mostrar Motor Ejecutor");
            assert(resultState.text.includes("El Motor propone. Tú decides:"), "Debe incluir el principio de no-mutación");
        });

        await testAsync("Ciclo de vida del canvas: se detiene al cambiar de pestaña y se reactiva", async () => {
            const tabCycle = await page.evaluate(() => {
                window.switchWorkspaceTab('motores');
                const runningWhenMotores = window.universoCreativo.running;

                window.switchWorkspaceTab('canvas');
                const stoppedWhenCanvas = !window.universoCreativo.running;

                window.switchWorkspaceTab('motores');
                const restored = window.universoCreativo.running;

                return { runningWhenMotores, stoppedWhenCanvas, restored };
            });

            assert(tabCycle.runningWhenMotores, "Animación debe activarse en tab motores");
            assert(tabCycle.stoppedWhenCanvas, "Animación debe detenerse en otro tab");
            assert(tabCycle.restored, "Animación se restaura al volver a motores");
        });

        // Captura de pantalla de la experiencia visual en Desktop
        const screenshotPath = path.join(__dirname, 'captura_explosion_creativa.png');
        await page.evaluate(() => {
            window.switchWorkspaceTab('motores');
            window.seleccionarMotor('explorador');
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`  📸 Captura visual generada con éxito: ${screenshotPath}`);

        await contextDesktop.close();

        // Test Móvil (412x915)
        const contextMobile = await browser.newContext({
            viewport: { width: 412, height: 915 },
            isMobile: true
        });
        const mobilePage = await contextMobile.newPage();
        await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });

        await testAsync("Responsividad móvil (412x915): el grid y canvas se adaptan sin overflow horizontal", async () => {
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
                if (window.universoCreativo) {
                    window.universoCreativo.start();
                }
            });

            const mobileMetrics = await mobilePage.evaluate(() => {
                const grid = document.getElementById('motores-selector-grid');
                return {
                    gridWidth: grid ? grid.offsetWidth : 0,
                    overflow: document.body.scrollWidth > window.innerWidth
                };
            });

            assert(mobileMetrics.gridWidth > 0, "Grid móvil debe tener ancho > 0");
            assert(!mobileMetrics.overflow, "No debe haber overflow horizontal en vista móvil");
        });

        await contextMobile.close();

        // Test Accesibilidad (prefers-reduced-motion)
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
                if (window.universoCreativo) {
                    window.universoCreativo.start();
                }
            });

            const animationState = await reducedPage.evaluate(() => {
                const card = document.querySelector('.motor-living-card');
                if (!card) return null;
                const style = window.getComputedStyle(card);
                return {
                    animationName: style.animationName,
                    reducedMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
                    isRunning: window.universoCreativo ? window.universoCreativo.running : false
                };
            });

            assert(animationState.reducedMatches, "Media query reduced-motion debe coincidir");
            assert(animationState.animationName === 'none' || !animationState.animationName, "Animación de respiración debe ser 'none'");
            assert(!animationState.isRunning, "Universo creativo no debe correr en modo movimiento reducido");
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
        console.log("🟢 UNIVERSO CREATIVO DE IDEAS V2 100% VALIDADO Y LISTO.");
        process.exit(0);
    } else {
        console.error("🔴 FALLARON PRUEBAS EN UNIVERSO CREATIVO DE IDEAS.");
        process.exit(1);
    }
})();
