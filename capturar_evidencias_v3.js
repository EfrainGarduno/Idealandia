/**
 * =============================================================================
 * GENERADOR DE EVIDENCIAS VISUALES Y MEDICIÓN REAL DE FPS: V3 CADENA ENERGÉTICA
 * =============================================================================
 * Ciclo Completo:
 * REPOSO → HOVER → BORDE CARGÁNDOSE → EXPLOSIÓN → IDEAS VOLANDO → PROCESAMIENTO → EUREKA → RESULTADO
 *
 * Genera:
 * 1. 1_reposo.png (Universo Creativo, Glassmorphism, Núcleo ✦ IDEA ✦ y filamentos)
 * 2. 2_hover.png (Hover: corriente perimetral acelerada, elevación y halo 360°)
 * 3. 3_borde_cargandose.png (Fase de Carga: corriente ultrarrápida a 0.35s por vuelta)
 * 4. 4_explosion.png (Explosión frontal: onda de choque, ráfaga 85+ y conexiones iluminadas)
 * 5. 5_ideas_volando.png (Ideas Volando: pastillas conceptuales radiantes + retorno al Núcleo)
 * 6. 6_procesamiento.png (Vórtice orbital continuo y anillos elípticos durante llamada IA)
 * 7. 7_eureka.png (Segundo pulso elegante, concentrado y dorado antes del resultado)
 * 8. 8_resultado.png (Resultado estructurado revelado con animación suave)
 * 9. secuencia_completa_v3_cadena.webm (Video HD continuo de la secuencia completa)
 * 10. telemetria_fps_real_v3.json (Telemetría empírica de FPS)
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    console.log("================================================================================");
    console.log("GENERANDO EVIDENCIAS VISUALES REALES: V3 CADENA ENERGÉTICA REFORZADA");
    console.log("================================================================================\n");

    const htmlPath = path.join(__dirname, 'index.html');
    const cssPath = path.join(__dirname, 'universo_creativo.css');
    const jsPath = path.join(__dirname, 'universo_creativo.js');

    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    const outputDir = path.join(__dirname, 'evidencias_v3');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const videoDir = path.join(__dirname, 'evidencias_video_temp_v3');
    if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
    }

    // Servidor web estático local
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

    // Grabación de video continuo
    const context = await browser.newContext({
        viewport: { width: 1280, height: 850 },
        deviceScaleFactor: 1.5,
        recordVideo: {
            dir: videoDir,
            size: { width: 1280, height: 850 }
        }
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    console.log("1. Inicializando vista del Universo Creativo V3 y profiler de FPS...");

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
        if (window.universoCreativo) {
            window.universoCreativo.start();
        }

        // Sistema de Telemetría Real de FPS
        window.fpsTelemetry = {
            measuring: true,
            frameDeltas: [],
            lastTimestamp: performance.now(),
            totalFrames: 0
        };

        function onFrame(now) {
            if (!window.fpsTelemetry.measuring) return;
            const delta = now - window.fpsTelemetry.lastTimestamp;
            window.fpsTelemetry.lastTimestamp = now;
            if (delta > 0) {
                window.fpsTelemetry.frameDeltas.push(delta);
                window.fpsTelemetry.totalFrames++;
            }
            requestAnimationFrame(onFrame);
        }
        requestAnimationFrame(onFrame);
    });

    const panelLocator = page.locator('#workspace-panel-motores');

    // -------------------------------------------------------------------------
    // 1. REPOSO
    // -------------------------------------------------------------------------
    console.log("2. Capturando: 1_reposo.png...");
    await page.waitForTimeout(1600);
    const pathReposo = path.join(outputDir, '1_reposo.png');
    await panelLocator.screenshot({ path: pathReposo });
    console.log(`   [OK] Guardado: ${pathReposo}`);

    // -------------------------------------------------------------------------
    // 2. HOVER
    // -------------------------------------------------------------------------
    console.log("3. Capturando: 2_hover.png (aceleración perimetral, elevación, halo 360°)...");
    const exploradorCard = page.locator('.motor-card-explorador');
    await exploradorCard.hover({ force: true });
    await page.waitForTimeout(450);
    const pathHover = path.join(outputDir, '2_hover.png');
    await panelLocator.screenshot({ path: pathHover });
    console.log(`   [OK] Guardado: ${pathHover}`);

    // -------------------------------------------------------------------------
    // 3. BORDE CARGÁNDOSE
    // -------------------------------------------------------------------------
    console.log("4. Capturando: 3_borde_cargandose.png (fase de carga y circuito perimetral ultrarrápido)...");
    await page.evaluate(() => {
        const card = document.querySelector('.motor-select-card[data-motor="explorador"]');
        if (card) {
            card.classList.add('motor-card-active', 'motor-card-charging');
        }
    });
    // Capturar a mitad del recorrido de 350ms (a los 170ms) mostrando la corriente perimetral girando
    await page.waitForTimeout(170);
    const pathBordeCargandose = path.join(outputDir, '3_borde_cargandose.png');
    await panelLocator.screenshot({ path: pathBordeCargandose });
    console.log(`   [OK] Guardado: ${pathBordeCargandose}`);

    // -------------------------------------------------------------------------
    // 4. EXPLOSIÓN
    // -------------------------------------------------------------------------
    console.log("5. Capturando: 4_explosion.png (onda frontal, ráfaga 85+ y conexiones iluminadas)...");
    await page.evaluate(() => {
        const card = document.querySelector('.motor-select-card[data-motor="explorador"]');
        if (card) {
            card.classList.remove('motor-card-charging');
            card.classList.add('motor-card-just-selected');
            const rect = card.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            if (window.universoCreativo && typeof window.universoCreativo.triggerExplosion === 'function') {
                window.universoCreativo.triggerExplosion('explorador', cx, cy);
            }
        }
    });
    // Capturar a los 110ms el ápice de la onda expansiva y las líneas de conexión iluminadas
    await page.waitForTimeout(110);
    const pathExplosion = path.join(outputDir, '4_explosion.png');
    await panelLocator.screenshot({ path: pathExplosion });
    console.log(`   [OK] Guardado: ${pathExplosion}`);

    // -------------------------------------------------------------------------
    // 5. IDEAS VOLANDO (Conceptos radiantes + Partículas regresando al Núcleo)
    // -------------------------------------------------------------------------
    console.log("6. Capturando: 5_ideas_volando.png (conceptos recién nacidos flotando y retorno al núcleo)...");
    // Esperar 400ms adicionales para que las pastillas conceptuales ('POSIBILIDADES', 'DESCUBRIR', etc.)
    // se hayan desplegado sobre las tarjetas y las partículas de retorno lleguen al Núcleo IDEA
    await page.waitForTimeout(400);
    const pathIdeasVolando = path.join(outputDir, '5_ideas_volando.png');
    await panelLocator.screenshot({ path: pathIdeasVolando });
    console.log(`   [OK] Guardado: ${pathIdeasVolando}`);

    // Dejar disipar suavemente la explosión antes de procesar
    await page.waitForTimeout(800);

    // -------------------------------------------------------------------------
    // 6. PROCESAMIENTO
    // -------------------------------------------------------------------------
    console.log("7. Capturando: 6_procesamiento.png (vórtice orbital continuo y anillos elípticos)...");
    await page.evaluate(() => {
        const btn = document.getElementById('btn-ejecutar-motor');
        const btnText = document.getElementById('btn-ejecutar-motor-text');
        const statusMsg = document.getElementById('motor-status-message');
        if (btn) btn.disabled = true;
        if (btnText) btnText.textContent = 'Analizando con Motor Explorador…';
        if (statusMsg) {
            statusMsg.style.display = 'inline-block';
            statusMsg.style.color = '#6c40f7';
            statusMsg.innerHTML = '<i class="fas fa-atom fa-spin"></i> Núcleo creativo en procesamiento…';
        }
        window.universoCreativo.setProcessingMode(true, 'explorador');
    });

    await page.waitForTimeout(600);
    const pathProcesamiento = path.join(outputDir, '6_procesamiento.png');
    await panelLocator.screenshot({ path: pathProcesamiento });
    console.log(`   [OK] Guardado: ${pathProcesamiento}`);

    await page.waitForTimeout(1000); // 1s de procesamiento visible para el video

    // -------------------------------------------------------------------------
    // 7. EUREKA (Segundo pulso elegante, concentrado y dorado)
    // -------------------------------------------------------------------------
    console.log("8. Capturando: 7_eureka.png (segundo pulso elegante y dorado antes del resultado)...");
    await page.evaluate(() => {
        const btn = document.getElementById('btn-ejecutar-motor');
        const btnText = document.getElementById('btn-ejecutar-motor-text');
        const statusMsg = document.getElementById('motor-status-message');
        if (btn) btn.disabled = false;
        if (btnText) btnText.textContent = 'Ejecutar Análisis';
        if (statusMsg) {
            statusMsg.style.color = '#059669';
            statusMsg.innerHTML = '<i class="fas fa-check-circle"></i> Análisis completado y registrado en el Historial.';
        }

        // Finalizar procesamiento -> Dispara segundo pulso elegante de Eureka
        window.universoCreativo.setProcessingMode(false, 'explorador');
    });

    // Capturar a los 110ms durante la expansión del pulso dorado elegante
    await page.waitForTimeout(110);
    const pathEureka = path.join(outputDir, '7_eureka.png');
    await panelLocator.screenshot({ path: pathEureka });
    console.log(`   [OK] Guardado: ${pathEureka}`);

    // -------------------------------------------------------------------------
    // 8. RESULTADO
    // -------------------------------------------------------------------------
    console.log("9. Capturando: 8_resultado.png (resultado estructurado revelado suavemente)...");
    await page.evaluate(() => {
        window.renderMotorResult({
            motor: 'explorador',
            motor_nombre: 'Motor Explorador',
            analisis_id: 108,
            resumen: 'Exploración de posibilidades y ángulos ocultos para la Idea.',
            resultado: {
                resumen_ejecutivo: 'Exploración de posibilidades y ángulos ocultos para la Idea.',
                posibilidades_no_vistas: [
                    'Modelo de suscripción comunitaria con micro-patrocinios',
                    'Integración de gamificación para incentivar la co-creación'
                ],
                preguntas_provocadoras: [
                    '¿Qué sucedería si el acceso fuera 100% abierto y la monetización viniera de servicios derivados?',
                    '¿Cómo escalaría la Idea si cada usuario se convirtiera en un embajador activo?'
                ],
                pivotes_creativos: [
                    'Enfocar la propuesta inicial hacia educadores y facilitadores en lugar de consumidor final'
                ]
            }
        });
    });

    await page.waitForTimeout(400);
    const pathResultado = path.join(outputDir, '8_resultado.png');
    await panelLocator.screenshot({ path: pathResultado });
    console.log(`   [OK] Guardado: ${pathResultado}`);

    await page.waitForTimeout(1800); // 1.8s finales para que el video concluya armoniosamente

    // -------------------------------------------------------------------------
    // TELEMETRÍA DE FPS
    // -------------------------------------------------------------------------
    console.log("\n10. Extrayendo métricas reales de rendimiento (FPS)...");
    const fpsMetrics = await page.evaluate(() => {
        window.fpsTelemetry.measuring = false;
        const deltas = window.fpsTelemetry.frameDeltas.slice(15);
        if (deltas.length === 0) return { avgFps: 0, minFps: 0, maxFps: 0, p1Fps: 0, totalFrames: 0 };

        const fpsValues = deltas.map(d => 1000 / d);
        const sumFps = fpsValues.reduce((acc, v) => acc + v, 0);
        const avgFps = sumFps / fpsValues.length;

        const sorted = [...fpsValues].sort((a, b) => a - b);
        const minFps = sorted[0];
        const maxFps = sorted[sorted.length - 1];
        const p1Index = Math.max(0, Math.floor(sorted.length * 0.01));
        const p1Fps = sorted[p1Index];

        return {
            avgFps: Math.round(avgFps * 10) / 10,
            minFps: Math.round(minFps * 10) / 10,
            maxFps: Math.round(maxFps * 10) / 10,
            p1Fps: Math.round(p1Fps * 10) / 10,
            totalFrames: window.fpsTelemetry.totalFrames,
            totalSeconds: Math.round(deltas.reduce((a, b) => a + b, 0) / 100) / 10
        };
    });

    console.log(`   * Total de Frames Medidos: ${fpsMetrics.totalFrames} frames a lo largo de ~${fpsMetrics.totalSeconds} segundos`);
    console.log(`   * FPS Promedio: ${fpsMetrics.avgFps} FPS`);
    console.log(`   * FPS 1% Low: ${fpsMetrics.p1Fps} FPS`);
    console.log(`   * FPS Mínimo: ${fpsMetrics.minFps} FPS`);
    console.log(`   * FPS Máximo: ${fpsMetrics.maxFps} FPS`);

    const videoObj = page.video();
    await context.close();
    await browser.close();
    server.close();

    // Obtener ruta del video grabado
    let finalVideoPath = null;
    if (videoObj) {
        const rawVideoPath = await videoObj.path();
        finalVideoPath = path.join(outputDir, 'secuencia_completa_v3_cadena.webm');
        if (fs.existsSync(rawVideoPath)) {
            fs.copyFileSync(rawVideoPath, finalVideoPath);
            console.log(`\n11. Video HD continuo generado con éxito: ${finalVideoPath}`);
        }
    }

    // Copiar evidencias al directorio de artefactos para el usuario
    const artifactDir = "C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\293780e4-394c-4ac0-9694-f75e39048f26";
    const filesToCopy = [
        '1_reposo.png',
        '2_hover.png',
        '3_borde_cargandose.png',
        '4_explosion.png',
        '5_ideas_volando.png',
        '6_procesamiento.png',
        '7_eureka.png',
        '8_resultado.png',
        'secuencia_completa_v3_cadena.webm'
    ];

    console.log("\n12. Sincronizando evidencias con el directorio de artefactos...");
    filesToCopy.forEach(fileName => {
        const src = path.join(outputDir, fileName);
        if (fs.existsSync(src)) {
            const dest = path.join(artifactDir, fileName);
            fs.copyFileSync(src, dest);
            console.log(`   -> Copiado: ${fileName}`);
        }
    });

    const metricsPath = path.join(artifactDir, 'telemetria_fps_real_v3.json');
    fs.writeFileSync(metricsPath, JSON.stringify(fpsMetrics, null, 2), 'utf8');

    console.log("\n================================================================================");
    console.log("EVIDENCIAS VISUALES DEL CICLO COMPLETO GENERADAS AL 100%");
    console.log("================================================================================\n");
})();
