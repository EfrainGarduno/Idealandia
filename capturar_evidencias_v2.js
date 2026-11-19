/**
 * =============================================================================
 * GENERADOR DE EVIDENCIAS VISUALES Y MEDICIÓN REAL DE FPS: V2 EXPLOSIÓN CREATIVA
 * =============================================================================
 * Genera:
 * 1. 1_reposo.png (Universo Creativo, partículas, palabras flotantes y conexiones)
 * 2. 2_hover.png (Reacción visual al hover: elevación, resplandor e icono activo)
 * 3. 3_activacion.png (Explosión de activación: shockwave, ráfaga 60+ y palabras)
 * 4. 4_procesamiento_ia.png (Núcleo creativo activo, vórtice y anillos orbitales)
 * 5. 5_resultado_eureka.png (Flash de Eureka dorado y revelación del resultado)
 * 6. secuencia_completa_v2.webm (Video de alta definición de la secuencia completa)
 * 7. Medición empírica real de FPS (Media, Mínimo, Máximo y 1% Low)
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    console.log("================================================================================");
    console.log("GENERANDO EVIDENCIAS VISUALES REALES Y MEDICIÓN DE FPS (V2)");
    console.log("================================================================================\n");

    const htmlPath = path.join(__dirname, 'index.html');
    const cssPath = path.join(__dirname, 'universo_creativo.css');
    const jsPath = path.join(__dirname, 'universo_creativo.js');

    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    const outputDir = path.join(__dirname, 'evidencias_v2');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const videoDir = path.join(__dirname, 'evidencias_video_temp');
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

    // Configurar contexto con grabación de video integrada
    const context = await browser.newContext({
        viewport: { width: 1280, height: 850 },
        deviceScaleFactor: 1.5, // Mayor resolución para nitidez visual
        recordVideo: {
            dir: videoDir,
            size: { width: 1280, height: 850 }
        }
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    console.log("1. Inicializando vista del Universo Creativo y montando profiler de FPS...");

    // Inicializar y mostrar el panel de motores en el DOM
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

    // -------------------------------------------------------------------------
    // ESTADO 1: REPOSO AMBIENTAL
    // -------------------------------------------------------------------------
    console.log("2. Capturando Estado 1: REPOSO (partículas, palabras flotantes y conexiones)...");
    await page.waitForTimeout(1600); // Permitir que las palabras y partículas florezcan

    const panelLocator = page.locator('#workspace-panel-motores');
    const pathReposo = path.join(outputDir, '1_reposo.png');
    await panelLocator.screenshot({ path: pathReposo });
    console.log(`   [OK] Guardado: ${pathReposo}`);

    // -------------------------------------------------------------------------
    // ESTADO 2: HOVER SOBRE UN MOTOR
    // -------------------------------------------------------------------------
    console.log("3. Capturando Estado 2: HOVER (elevación, resplandor e icono activo)...");
    const exploradorCard = page.locator('.motor-card-explorador');
    await exploradorCard.hover({ force: true });
    await page.waitForTimeout(400); // Dejar que la elevación y rotación alcancen su cenit

    const pathHover = path.join(outputDir, '2_hover.png');
    await panelLocator.screenshot({ path: pathHover });
    console.log(`   [OK] Guardado: ${pathHover}`);

    // -------------------------------------------------------------------------
    // ESTADO 3: EXPLOSIÓN DE ACTIVACIÓN (SELECCIÓN)
    // -------------------------------------------------------------------------
    console.log("4. Capturando Estado 3: ACTIVACIÓN (shockwave, ráfaga y palabras del motor)...");
    // Seleccionar 'explorador' detonando la explosión
    await page.evaluate(() => {
        window.seleccionarMotor('explorador');
    });

    // Esperar 150ms: el instante exacto donde la onda expansiva y la ráfaga de 60 partículas están en máxima expansión
    await page.waitForTimeout(150);

    const pathActivacion = path.join(outputDir, '3_activacion.png');
    await panelLocator.screenshot({ path: pathActivacion });
    console.log(`   [OK] Guardado: ${pathActivacion}`);

    // Dejar disipar suavemente la explosión
    await page.waitForTimeout(900);

    // -------------------------------------------------------------------------
    // ESTADO 4: PROCESAMIENTO IA (NÚCLEO CREATIVO / VÓRTICE)
    // -------------------------------------------------------------------------
    console.log("5. Capturando Estado 4: PROCESAMIENTO IA (núcleo creativo y vórtice orbital)...");
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

    // Dejar que el vórtice y los anillos giren 600ms
    await page.waitForTimeout(600);

    const pathProcesamiento = path.join(outputDir, '4_procesamiento_ia.png');
    await panelLocator.screenshot({ path: pathProcesamiento });
    console.log(`   [OK] Guardado: ${pathProcesamiento}`);

    await page.waitForTimeout(1000); // Continuar la animación de procesamiento para el video

    // -------------------------------------------------------------------------
    // ESTADO 5: RESULTADO Y FLASH DE EUREKA
    // -------------------------------------------------------------------------
    console.log("6. Capturando Estado 5: RESULTADO & FLASH DE EUREKA...");
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

        // Finaliza procesamiento -> Dispara Flash de Eureka
        window.universoCreativo.setProcessingMode(false, 'explorador');

        // Renderizar resultado estructurado
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

    // Capturar a los 140ms cuando la onda dorada de Eureka y los destellos iluminan la pantalla
    await page.waitForTimeout(140);

    const pathResultado = path.join(outputDir, '5_resultado_eureka.png');
    await panelLocator.screenshot({ path: pathResultado });
    console.log(`   [OK] Guardado: ${pathResultado}`);

    // Dejar 1.8 segundos finales para que en el video se aprecie el resultado y la estabilización armónica
    await page.waitForTimeout(1800);

    // -------------------------------------------------------------------------
    // RECOLECCIÓN DE TELEMETRÍA DE RENDIMIENTO (FPS REALES)
    // -------------------------------------------------------------------------
    console.log("\n7. Extrayendo métricas reales de rendimiento (FPS)...");
    const fpsMetrics = await page.evaluate(() => {
        window.fpsTelemetry.measuring = false;
        const deltas = window.fpsTelemetry.frameDeltas.slice(15); // Descartar los primeros frames de carga inicial
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
    console.log(`   * FPS 1% Low (estabilidad ante picos): ${fpsMetrics.p1Fps} FPS`);
    console.log(`   * FPS Mínimo: ${fpsMetrics.minFps} FPS`);
    console.log(`   * FPS Máximo: ${fpsMetrics.maxFps} FPS`);

    // Cerrar página y contexto para finalizar el archivo de video
    const videoObj = page.video();
    await context.close();
    await browser.close();
    server.close();

    // Obtener ruta del video grabado
    let finalVideoPath = null;
    if (videoObj) {
        const rawVideoPath = await videoObj.path();
        finalVideoPath = path.join(outputDir, 'secuencia_completa_v2.webm');
        if (fs.existsSync(rawVideoPath)) {
            fs.copyFileSync(rawVideoPath, finalVideoPath);
            console.log(`\n8. Video de alta definición generado con éxito: ${finalVideoPath}`);
        }
    }

    // Copiar evidencias al directorio de artefactos para el usuario
    const artifactDir = "C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\293780e4-394c-4ac0-9694-f75e39048f26";
    const filesToCopy = [
        '1_reposo.png',
        '2_hover.png',
        '3_activacion.png',
        '4_procesamiento_ia.png',
        '5_resultado_eureka.png',
        'secuencia_completa_v2.webm'
    ];

    console.log("\n9. Sincronizando evidencias con el directorio de artefactos...");
    filesToCopy.forEach(fileName => {
        const src = path.join(outputDir, fileName);
        if (fs.existsSync(src)) {
            const dest = path.join(artifactDir, fileName);
            fs.copyFileSync(src, dest);
            console.log(`   -> Copiado: ${fileName}`);
        }
    });

    // Guardar métricas en archivo JSON para el reporte
    const metricsPath = path.join(artifactDir, 'telemetria_fps_real.json');
    fs.writeFileSync(metricsPath, JSON.stringify(fpsMetrics, null, 2), 'utf8');

    console.log("\n================================================================================");
    console.log("EVIDENCIAS VISUALES Y TELEMETRÍA GENERADAS AL 100%");
    console.log("================================================================================\n");
})();
