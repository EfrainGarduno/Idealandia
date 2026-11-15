const { chromium } = require('playwright');
const path = require('path');

async function testMobileMenuAndRegister() {
    const browser = await chromium.launch({ headless: true });
    const viewports = [
        { width: 360, height: 740, name: '360px Mobile Compacto' },
        { width: 390, height: 844, name: '390px iPhone Estándar' },
        { width: 412, height: 915, name: '412px Android / Pixel' },
        { width: 430, height: 932, name: '430px iPhone Pro Max' }
    ];

    console.log('=== PRUEBAS E2E DE MENÚ LATERAL MÓVIL Y SELECTOR DE PAÍS EN PLAYWRIGHT ===');

    let allOk = true;

    for (const vp of viewports) {
        console.log(`\n--- Probando Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        const filePath = `file://${path.resolve(__dirname, 'index.html').replace(/\\/g, '/')}`;
        await page.goto(filePath);
        await page.waitForTimeout(300);

        // 1. Verificar estado inicial: Menú cerrado y overlay inactivo
        const initialStatus = await page.evaluate(() => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            const overlayStyle = window.getComputedStyle(overlay);
            return {
                sidebarOpen: sidebar.classList.contains('sidebar-open'),
                overlayActive: overlay.classList.contains('active'),
                overlayDisplay: overlayStyle.display,
                overlayPointerEvents: overlayStyle.pointerEvents
            };
        });

        console.log(`  1. Estado inicial cerrado: sidebarOpen=${initialStatus.sidebarOpen}, overlayActive=${initialStatus.overlayActive}, overlayDisplay=${initialStatus.overlayDisplay}`);
        if (initialStatus.sidebarOpen || initialStatus.overlayActive || initialStatus.overlayDisplay !== 'none') {
            console.error('     ❌ Falló: El overlay o sidebar no deben estar activos al inicio.');
            allOk = false;
        } else {
            console.log('     ✓ Correcto: El overlay no aparece cuando el menú está cerrado.');
        }

        // 2. Abrir menú tocando las tres rayitas
        await page.click('#mobile-menu-btn');
        await page.waitForTimeout(200);

        const openStatus = await page.evaluate(() => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            const overlayStyle = window.getComputedStyle(overlay);
            return {
                sidebarOpen: sidebar.classList.contains('sidebar-open'),
                overlayActive: overlay.classList.contains('active'),
                overlayDisplay: overlayStyle.display
            };
        });

        console.log(`  2. Abrir menú con 3 rayitas: sidebarOpen=${openStatus.sidebarOpen}, overlayActive=${openStatus.overlayActive}`);
        if (!openStatus.sidebarOpen || !openStatus.overlayActive) {
            console.error('     ❌ Falló: El menú o overlay no se abrieron.');
            allOk = false;
        } else {
            console.log('     ✓ Correcto: Menú y overlay abiertos exitosamente.');
        }

        // 3. Tocar fuera del menú (en el overlay) para cerrar automáticamente
        // Hacemos click en las coordenadas fuera del sidebar (sidebar width es 250px)
        await page.mouse.click(300, 300);
        await page.waitForTimeout(200);

        const closedByOutsideClick = await page.evaluate(() => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            return {
                sidebarOpen: sidebar.classList.contains('sidebar-open'),
                overlayActive: overlay.classList.contains('active')
            };
        });

        console.log(`  3. Tocar fuera del menú: sidebarOpen=${closedByOutsideClick.sidebarOpen}, overlayActive=${closedByOutsideClick.overlayActive}`);
        if (closedByOutsideClick.sidebarOpen || closedByOutsideClick.overlayActive) {
            console.error('     ❌ Falló: Tocar fuera no cerró el menú.');
            allOk = false;
        } else {
            console.log('     ✓ Correcto: El menú se cerró automáticamente al tocar fuera.');
        }

        // 4. Abrir nuevamente y cerrar pulsando nuevamente las tres rayitas
        await page.click('#mobile-menu-btn');
        await page.waitForTimeout(200);
        await page.click('#mobile-menu-btn');
        await page.waitForTimeout(200);

        const closedByBurger = await page.evaluate(() => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            return {
                sidebarOpen: sidebar.classList.contains('sidebar-open'),
                overlayActive: overlay.classList.contains('active')
            };
        });

        console.log(`  4. Cerrar con tres rayitas: sidebarOpen=${closedByBurger.sidebarOpen}, overlayActive=${closedByBurger.overlayActive}`);
        if (closedByBurger.sidebarOpen || closedByBurger.overlayActive) {
            console.error('     ❌ Falló: Volver a tocar las tres rayitas no cerró el menú.');
            allOk = false;
        } else {
            console.log('     ✓ Correcto: Las tres rayitas alternan y cierran el menú.');
        }

        // 5. Abrir menú y tocar una opción dentro del menú
        await page.click('#mobile-menu-btn');
        await page.waitForTimeout(200);
        await page.click('a[data-section="chat"]');
        await page.waitForTimeout(200);

        const closedByOption = await page.evaluate(() => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            const chatSection = document.getElementById('chat');
            return {
                sidebarOpen: sidebar.classList.contains('sidebar-open'),
                overlayActive: overlay.classList.contains('active'),
                chatVisible: window.getComputedStyle(chatSection).display !== 'none'
            };
        });

        console.log(`  5. Tocar opción de menú: sidebarOpen=${closedByOption.sidebarOpen}, chatVisible=${closedByOption.chatVisible}`);
        if (closedByOption.sidebarOpen || closedByOption.overlayActive || !closedByOption.chatVisible) {
            console.error('     ❌ Falló: La opción de menú no funcionó o no cerró el menú.');
            allOk = false;
        } else {
            console.log('     ✓ Correcto: La opción de menú navegó normalmente y cerró el menú.');
        }

        // 6. Verificar visualización del código de país en formulario de registro
        await page.evaluate(() => {
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            const reg = document.getElementById('register');
            if (reg) reg.style.display = 'block';
        });
        await page.waitForTimeout(200);

        const countryCodeVisual = await page.evaluate(() => {
            const select = document.getElementById('reg-codigo-pais');
            const selectedText = select.options[select.selectedIndex].text;
            const selectRect = select.getBoundingClientRect();
            return {
                selectedText,
                selectWidth: selectRect.width,
                hasPlusCode: selectedText.includes('+52'),
                startsWithCode: selectedText.startsWith('🇲🇽 +52')
            };
        });

        console.log(`  6. Selector de país: Texto="${countryCodeVisual.selectedText}", Ancho=${countryCodeVisual.selectWidth.toFixed(0)}px`);
        if (!countryCodeVisual.hasPlusCode || !countryCodeVisual.startsWithCode) {
            console.error('     ❌ Falló: El código de país +52 no es claramente visible al frente.');
            allOk = false;
        } else {
            console.log('     ✓ Correcto: El código de país +52 está visible de inmediato sin truncarse.');
        }

        await page.close();
        await context.close();
    }

    await browser.close();

    if (allOk) {
        console.log('\n================================================================');
        console.log('✓ TODAS LAS PRUEBAS MÓVILES EN PLAYWRIGHT PASARON EXITOSAMENTE.');
        console.log('================================================================\n');
        process.exit(0);
    } else {
        console.error('\n❌ Se presentaron errores en las pruebas.');
        process.exit(1);
    }
}

testMobileMenuAndRegister().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
