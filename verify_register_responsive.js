const { chromium } = require('playwright');
const path = require('path');

async function verifyRegister() {
    const browser = await chromium.launch({ headless: true });
    const viewports = [
        { width: 360, height: 740, name: '360px Mobile' },
        { width: 390, height: 844, name: '390px iPhone 12/13/14' },
        { width: 412, height: 915, name: '412px Pixel / Samsung' },
        { width: 430, height: 932, name: '430px iPhone Pro Max' },
        { width: 1280, height: 800, name: '1280px Desktop' }
    ];

    console.log('=== VERIFICANDO RESPONSIVIDAD Y LAYOUT DEL FORMULARIO DE REGISTRO ===');

    let allOk = true;

    for (const vp of viewports) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        const filePath = `file://${path.resolve(__dirname, 'index.html').replace(/\\/g, '/')}`;
        await page.goto(filePath);

        // Mostrar la sección de registro
        await page.evaluate(() => {
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            const reg = document.getElementById('register');
            if (reg) reg.style.display = 'block';
        });

        await page.waitForTimeout(300);

        const metrics = await page.evaluate(() => {
            const hasHorizontalScroll = document.documentElement.scrollWidth > window.innerWidth;
            const regSection = document.getElementById('register');
            const regRect = regSection.getBoundingClientRect();

            const pwdInput = document.getElementById('reg-password');
            const pwdRect = pwdInput.getBoundingClientRect();

            const btnTogglePwd = document.getElementById('btn-toggle-reg-password');
            const btnRect = btnTogglePwd.getBoundingClientRect();

            const phoneGroup = document.querySelector('.phone-input-group');
            const phoneGroupRect = phoneGroup.getBoundingClientRect();

            const countrySelect = document.getElementById('reg-codigo-pais');
            const countryRect = countrySelect.getBoundingClientRect();

            const phoneInput = document.getElementById('reg-telefono');
            const phoneInputRect = phoneInput.getBoundingClientRect();

            return {
                hasHorizontalScroll,
                sectionFits: regRect.width <= window.innerWidth,
                btnInsidePwdInput: btnRect.right <= pwdRect.right + 2 && btnRect.left >= pwdRect.left,
                phoneGroupFits: phoneGroupRect.width <= window.innerWidth,
                countryWidth: countryRect.width,
                phoneInputWidth: phoneInputRect.width
            };
        });

        const status = !metrics.hasHorizontalScroll && metrics.sectionFits && metrics.btnInsidePwdInput && metrics.phoneGroupFits;
        if (!status) allOk = false;

        console.log(`\nViewport ${vp.name} (${vp.width}x${vp.height}):`);
        console.log(`  - Scroll horizontal: ${metrics.hasHorizontalScroll ? 'FALLÓ (hay scroll)' : 'CORRECTO (sin scroll)'}`);
        console.log(`  - Sección ajusta al viewport: ${metrics.sectionFits ? 'CORRECTO' : 'FALLÓ'}`);
        console.log(`  - Ojito dentro del input de password: ${metrics.btnInsidePwdInput ? 'CORRECTO' : 'FALLÓ'}`);
        console.log(`  - Grupo selector país + teléfono integrado: ${metrics.phoneGroupFits ? 'CORRECTO' : 'FALLÓ'} (Select: ${metrics.countryWidth.toFixed(0)}px, Input: ${metrics.phoneInputWidth.toFixed(0)}px)`);

        await page.close();
    }

    await browser.close();

    if (allOk) {
        console.log('\n✓ TODAS LAS PRUEBAS DE RESPONSIVIDAD DEL FORMULARIO DE REGISTRO PASARON EXITOSAMENTE.');
        process.exit(0);
    } else {
        console.error('\n❌ Se detectaron fallas en las pruebas de responsividad.');
        process.exit(1);
    }
}

verifyRegister().catch(err => {
    console.error('Error durante la verificación:', err);
    process.exit(1);
});
