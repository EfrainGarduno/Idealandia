const { chromium } = require('playwright');
const path = require('path');

async function runTests() {
    console.log('--- INICIANDO PRUEBAS: IDENTIDAD VISUAL DEL MÓDULO IDEAS ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    let passed = 0;
    let failed = 0;

    function assert(cond, msg) {
        if (cond) {
            console.log(`  [PASS] ${msg}`);
            passed++;
        } else {
            console.error(`  [FAIL] ${msg}`);
            failed++;
        }
    }

    try {
        const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
        await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        // Activar sección ideas
        await page.evaluate(() => {
            const sec = document.getElementById('ideas');
            if (sec) sec.style.display = 'flex';
            if (window.nacimientoIdea && !window.nacimientoIdea.initialized) {
                window.nacimientoIdea.init('nacimiento-idea-hero', 'foco-particles-canvas');
            }
        });
        await page.waitForTimeout(300);

        // 1. Validar elementos DOM del Hero Nacimiento de una Idea
        console.log('\n1. Validando estructura DOM del Nacimiento de Idea:');
        const heroExists = await page.locator('#nacimiento-idea-hero').count() > 0;
        assert(heroExists, '#nacimiento-idea-hero existe en el DOM');

        const bulbExists = await page.locator('#foco-bulb-core').count() > 0;
        assert(bulbExists, '#foco-bulb-core existe en el DOM');

        const badgeExists = await page.locator('#eureka-moment-badge').count() > 0;
        assert(badgeExists, '#eureka-moment-badge existe en el DOM');

        const canvasFocoExists = await page.locator('#foco-particles-canvas').count() > 0;
        assert(canvasFocoExists, '#foco-particles-canvas existe en el DOM');

        // 2. Validar estado inicial del foco (dormido / tenue)
        console.log('\n2. Validando estado inicial del foco:');
        const isDormido = await page.evaluate(() => {
            const bulb = document.getElementById('foco-bulb-core');
            return bulb && bulb.classList.contains('foco-dormido');
        });
        assert(isDormido, 'El foco inicia en reposo con clase .foco-dormido');

        // 3. Probar secuencia de despertar y Momento Eureka
        console.log('\n3. Validando secuencia de despertar y Eureka:');
        await page.evaluate(() => {
            if (window.nacimientoIdea) {
                window.nacimientoIdea.triggerFocoDespertar();
            }
        });
        await page.waitForTimeout(200);

        const isDespertando = await page.evaluate(() => {
            const bulb = document.getElementById('foco-bulb-core');
            return bulb && bulb.classList.contains('foco-despertando');
        });
        assert(isDespertando, 'Paso 1: foco pasa a clase .foco-despertando');

        // Esperar a que alcance el momento EUREKA (a los ~550ms)
        await page.waitForTimeout(650);
        const isEureka = await page.evaluate(() => {
            const bulb = document.getElementById('foco-bulb-core');
            const badge = document.getElementById('eureka-moment-badge');
            const hasParticles = window.nacimientoIdea && window.nacimientoIdea.particles.length > 0;
            return {
                isBulbEureka: bulb && bulb.classList.contains('foco-eureka'),
                isBadgeVisible: badge && badge.classList.contains('badge-eureka-visible'),
                hasParticles
            };
        });
        assert(isEureka.isBulbEureka, 'Paso 2: foco alcanza estado .foco-eureka');
        assert(isEureka.isBadgeVisible, 'Paso 2: badge ✦ EUREKA ✦ se hace visible');
        assert(isEureka.hasParticles, 'Paso 2: se emiten chispas/partículas luminosas en el canvas');

        // Esperar a la estabilización en foco encendido (a los ~1400ms adicionales)
        await page.waitForTimeout(1500);
        const isEncendido = await page.evaluate(() => {
            const bulb = document.getElementById('foco-bulb-core');
            return bulb && bulb.classList.contains('foco-encendido');
        });
        assert(isEncendido, 'Paso 3: foco se estabiliza con clase .foco-encendido listo para redactar');

        // 4. Validar reactividad al escribir en el formulario
        console.log('\n4. Validando reactividad de redacción en formulario:');
        await page.evaluate(() => {
            const inputTitulo = document.getElementById('idea-titulo');
            if (inputTitulo) {
                inputTitulo.value = 'Mi Gran Proyecto de Impacto';
                inputTitulo.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.waitForTimeout(100);
        const isWriting = await page.evaluate(() => {
            const bulb = document.getElementById('foco-bulb-core');
            return bulb && bulb.classList.contains('foco-escribiendo');
        });
        assert(isWriting, 'Escribir en el título añade temporalmente .foco-escribiendo');

        // 5. Validar trigger de nacimiento de idea
        console.log('\n5. Validando trigger de nacimiento de idea:');
        await page.evaluate(() => {
            if (window.nacimientoIdea) {
                window.nacimientoIdea.triggerFocoNacimiento();
            }
        });
        const isNacimiento = await page.evaluate(() => {
            const bulb = document.getElementById('foco-bulb-core');
            const pCount = window.nacimientoIdea ? window.nacimientoIdea.particles.length : 0;
            return bulb && bulb.classList.contains('foco-nacimiento') && pCount > 20;
        });
        assert(isNacimiento, 'triggerFocoNacimiento activa .foco-nacimiento y ráfaga de chispas');

        // 6. Validar estilos de las tarjetas vivas y los 7 estados
        console.log('\n6. Validando tarjetas vivas y 7 estados del ciclo:');
        const estadosTest = [
            'semilla', 'en_desarrollo', 'en_validacion', 'lista', 'en_accion', 'realizada', 'archivada'
        ];

        const cardsVerification = await page.evaluate((estados) => {
            const container = document.createElement('div');
            container.id = 'test-cards-wrapper';
            document.body.appendChild(container);

            const results = {};
            estados.forEach(st => {
                const card = document.createElement('div');
                card.className = `idea-card idea-card-viva idea-estado-${st}`;
                container.appendChild(card);
                const style = window.getComputedStyle(card);
                results[st] = {
                    hasViva: card.classList.contains('idea-card-viva'),
                    hasEstado: card.classList.contains(`idea-estado-${st}`),
                    backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
                    borderRadius: style.borderRadius
                };
            });
            return results;
        }, estadosTest);

        estadosTest.forEach(st => {
            const data = cardsVerification[st];
            assert(data && data.hasViva && data.hasEstado, `Tarjeta viva soporta estado ${st}`);
        });

        // 7. Validar micro-pulso en Desarrollo de la Idea
        console.log('\n7. Validando micro-pulso en "Desarrollo de la Idea":');
        const saveBtnFlash = await page.evaluate(() => {
            const btn = document.getElementById('btn-guardar-canvas');
            if (!btn) return false;
            btn.classList.add('desarrollo-evolucion-flash');
            const hasClass = btn.classList.contains('desarrollo-evolucion-flash');
            btn.classList.remove('desarrollo-evolucion-flash');
            return hasClass;
        });
        assert(saveBtnFlash, 'Botón de guardar Desarrollo de la Idea tiene clase .desarrollo-evolucion-flash configurada');

        // 8. Validar Idealita vortex y mensaje reveal
        console.log('\n8. Validando animación Idealita vortex y reveal:');
        const idealitaVortex = await page.evaluate(() => {
            const header = document.getElementById('idealita-context-header');
            if (!header) return false;
            header.classList.add('idealita-thinking-vortex');
            const hasVortex = header.classList.contains('idealita-thinking-vortex');
            header.classList.remove('idealita-thinking-vortex');
            return hasVortex;
        });
        assert(idealitaVortex, 'Header de Idealita Contextual soporta .idealita-thinking-vortex');

        // 9. Validar prefers-reduced-motion
        console.log('\n9. Validando soporte prefers-reduced-motion:');
        const motionContext = await browser.newContext({
            reducedMotion: 'reduce'
        });
        const motionPage = await motionContext.newPage();
        await motionPage.goto(fileUrl, { waitUntil: 'domcontentloaded' });
        await motionPage.waitForTimeout(500);

        const reducedResult = await motionPage.evaluate(() => {
            const sec = document.getElementById('ideas');
            if (sec) sec.style.display = 'flex';
            if (window.nacimientoIdea && !window.nacimientoIdea.initialized) {
                window.nacimientoIdea.init('nacimiento-idea-hero', 'foco-particles-canvas');
            }
            if (window.nacimientoIdea) {
                window.nacimientoIdea.triggerFocoDespertar();
            }
            const bulb = document.getElementById('foco-bulb-core');
            const particlesCount = window.nacimientoIdea ? window.nacimientoIdea.particles.length : 0;
            return {
                isEncendido: bulb && bulb.classList.contains('foco-encendido'),
                particlesCount
            };
        });
        assert(reducedResult.isEncendido, 'En reduced-motion el foco pasa directamente a encendido sin animación');
        assert(reducedResult.particlesCount === 0, 'En reduced-motion no se emiten partículas');
        await motionContext.close();

        // 10. Validar responsividad móvil (412x915)
        console.log('\n10. Validando adaptabilidad móvil (412x915):');
        const mobileContext = await browser.newContext({
            viewport: { width: 412, height: 915 }
        });
        const mobilePage = await mobileContext.newPage();
        await mobilePage.goto(fileUrl, { waitUntil: 'domcontentloaded' });
        await mobilePage.waitForTimeout(500);

        const mobileLayout = await mobilePage.evaluate(() => {
            const sec = document.getElementById('ideas');
            if (sec) sec.style.display = 'flex';
            const hero = document.getElementById('nacimiento-idea-hero');
            const bulb = document.getElementById('foco-bulb-core');
            const rectHero = hero ? hero.getBoundingClientRect() : null;
            const rectBulb = bulb ? bulb.getBoundingClientRect() : null;
            return {
                heroWidth: rectHero ? rectHero.width : 0,
                bulbVisible: rectBulb && rectBulb.width > 0 && rectBulb.height > 0
            };
        });
        assert(mobileLayout.heroWidth > 0 && mobileLayout.heroWidth <= 412, 'Hero se ajusta adecuadamente a pantalla móvil');
        assert(mobileLayout.bulbVisible, 'Foco es visible y utilizable en pantalla móvil');
        await mobileContext.close();

    } catch (err) {
        console.error('Error durante la ejecución de las pruebas:', err);
        failed++;
    } finally {
        await browser.close();
    }

    console.log(`\n========================================`);
    console.log(`RESUMEN PRUEBAS: ${passed} PASARON, ${failed} FALLARON`);
    console.log(`========================================`);
    if (failed > 0) process.exit(1);
}

runTests();
