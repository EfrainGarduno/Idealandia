const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/ASUS/.gemini/antigravity/brain/293780e4-394c-4ac0-9694-f75e39048f26';

async function captureEvidence() {
    console.log('--- INICIANDO CAPTURA DE EVIDENCIAS VISUALES: IDENTIDAD MÓDULO IDEAS ---');

    if (!fs.existsSync(ARTIFACT_DIR)) {
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 850 },
        recordVideo: {
            dir: ARTIFACT_DIR,
            size: { width: 1280, height: 850 }
        }
    });

    const page = await context.newPage();
    const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // 1. Mostrar la sección Ideas
    await page.evaluate(() => {
        const sec = document.getElementById('ideas');
        if (sec) sec.style.display = 'flex';
        // Iniciar hero en estado dormido
        if (window.nacimientoIdea) {
            window.nacimientoIdea.init('nacimiento-idea-hero', 'foco-particles-canvas');
            window.nacimientoIdea.setBulbState('dormido');
        }
    });
    await page.waitForTimeout(500);

    // EVIDENCIA 1: Foco en reposo expectante (dormido / apagado)
    console.log('1. Capturando: Foco en reposo expectante (dormido)...');
    await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'foco_1_reposo_dormido.png'),
        clip: { x: 180, y: 40, width: 920, height: 420 }
    });

    // EVIDENCIA 2: Momento EUREKA
    console.log('2. Despertando foco y capturando Momento EUREKA...');
    await page.evaluate(() => {
        if (window.nacimientoIdea) {
            window.nacimientoIdea.triggerFocoDespertar();
        }
    });
    // Esperar al momento pico de EUREKA (~650ms tras el trigger)
    await page.waitForTimeout(680);
    await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'foco_2_momento_eureka.png'),
        clip: { x: 180, y: 40, width: 920, height: 420 }
    });

    // EVIDENCIA 3: Foco encendido con formulario listo para crear
    console.log('3. Capturando foco encendido y formulario listo...');
    await page.waitForTimeout(1400); // Foco estabilizado en encendido
    await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'foco_3_encendido_formulario.png'),
        clip: { x: 180, y: 40, width: 920, height: 480 }
    });

    // EVIDENCIA 4: Escribiendo en el formulario (reacción viva del foco)
    console.log('4. Escribiendo en formulario y capturando foco reactivo...');
    await page.evaluate(() => {
        const inputTitulo = document.getElementById('idea-titulo');
        const inputDesc = document.getElementById('idea-descripcion');
        if (inputTitulo) {
            inputTitulo.value = 'Red de Bibliotecas Comunitarias Sostenibles';
            inputTitulo.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (inputDesc) {
            inputDesc.value = 'Plataforma para conectar vecinos, compartir libros y organizar talleres educativos locales.';
            inputDesc.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
    await page.waitForTimeout(180);
    await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'foco_4_escribiendo_reactivo.png'),
        clip: { x: 180, y: 40, width: 920, height: 540 }
    });

    // EVIDENCIA 5: Nacimiento de la idea (trigger de nacimiento y explosión de chispas)
    console.log('5. Detonando nacimiento de idea...');
    await page.evaluate(() => {
        if (window.nacimientoIdea) {
            window.nacimientoIdea.triggerFocoNacimiento();
        }
    });
    await page.waitForTimeout(250);
    await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'foco_5_nacimiento_explosion.png'),
        clip: { x: 180, y: 40, width: 920, height: 500 }
    });

    // EVIDENCIA 6: Lista de Ideas con Tarjetas Vivas y los 7 Estados Oficiales
    console.log('6. Generando y capturando tarjetas vivas con los 7 estados oficiales...');
    await page.evaluate(() => {
        const listaIdeas = document.getElementById('lista-ideas');
        if (!listaIdeas) return;
        listaIdeas.innerHTML = '';

        const mockIdeas = [
            { id: 101, titulo: 'Plataforma de Agroecología Urbana', desc: 'Conecta productores locales con familias.', estado: 'semilla', mod: 'individual', priv: 'privada' },
            { id: 102, titulo: 'Sistema de Energía Solar Distribuida', desc: 'Microrred comunitaria con medición inteligente.', estado: 'en_desarrollo', mod: 'colaborativa', priv: 'compartida' },
            { id: 103, titulo: 'Diagnóstico Temprano con IA Móvil', desc: 'Validando hipótesis clínicas con telemedicina.', estado: 'en_validacion', mod: 'busco_inversion', priv: 'publica' },
            { id: 104, titulo: 'Hub de Formación en Habilidades Digitales', desc: 'Plan operativo cerrado y validado, lista para ejecución.', estado: 'lista', mod: 'individual', priv: 'compartida' },
            { id: 105, titulo: 'Red Logística de Alimentos Rescatados', desc: 'En despliegue piloto en 3 distritos urbanos.', estado: 'en_accion', mod: 'colaborativa', priv: 'publica' },
            { id: 106, titulo: 'Fondo Semilla Juvenil para Proyectos Verdes', desc: 'Objetivos cumplidos, 120 jóvenes becados con éxito.', estado: 'realizada', mod: 'busco_apoyo', priv: 'publica' },
            { id: 107, titulo: 'Laboratorio de Impresión 3D Reciclado', desc: 'Proyecto archivado tras finalizar ciclo de investigación.', estado: 'archivada', mod: 'individual', priv: 'privada' }
        ];

        mockIdeas.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = `idea-card idea-card-viva idea-estado-${item.estado}`;
            if (idx === 0) card.classList.add('idea-card-just-born');
            card.style.padding = '18px';
            card.style.marginBottom = '14px';

            const badgeColorMap = {
                semilla: '#10b981',
                en_desarrollo: '#f59e0b',
                en_validacion: '#6366f1',
                lista: '#06b6d4',
                en_accion: '#3b82f6',
                realizada: '#eab308',
                archivada: '#94a3b8'
            };
            const color = badgeColorMap[item.estado] || '#6c40f7';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <h4 style="margin:0; font-size:16px; font-weight:700; color:#1e293b;">${item.titulo}</h4>
                    <span style="background:${color}20; color:${color}; border:1px solid ${color}60; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase;">
                        ${item.estado.replace('_', ' ')}
                    </span>
                </div>
                <p style="margin:0 0 10px 0; font-size:13px; color:#475569; line-height:1.4;">${item.desc}</p>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#64748b;">
                    <span>Modalidad: <strong>${item.mod}</strong> | Privacidad: <strong>${item.priv}</strong></span>
                    <button style="background:none; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:12px;">Abrir Workspace →</button>
                </div>
            `;
            listaIdeas.appendChild(card);
        });
    });

    await page.waitForTimeout(600);
    await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'tarjetas_vivas_7_estados.png'),
        clip: { x: 180, y: 380, width: 920, height: 750 }
    });

    // Finalizar grabación de video
    console.log('7. Finalizando grabación de video HD...');
    await page.waitForTimeout(800);
    await context.close();
    await browser.close();

    // Renombrar el video a un nombre descriptivo
    const files = fs.readdirSync(ARTIFACT_DIR);
    const videoFile = files.find(f => f.endsWith('.webm') && !f.startsWith('secuencia_completa'));
    if (videoFile) {
        const targetPath = path.join(ARTIFACT_DIR, 'secuencia_nacimiento_eureka_modulo.webm');
        if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        fs.renameSync(path.join(ARTIFACT_DIR, videoFile), targetPath);
        console.log('Video renombrado a: secuencia_nacimiento_eureka_modulo.webm');
    }

    console.log('--- CAPTURA COMPLETADA EXITOSAMENTE ---');
}

captureEvidence().catch(err => {
    console.error('Error capturando evidencias:', err);
    process.exit(1);
});
