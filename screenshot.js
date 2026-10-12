const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

    // Mock API
    await page.route('**/api/menu', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 1, nombre: 'Inicio', funcionalidad_id: null, parent_id: null, orden: 1, publico: 1, activo: 1 },
                { id: 2, nombre: 'Chat', funcionalidad_id: 6, parent_id: null, orden: 2, publico: 1, activo: 1 } // ensure Chat menu exists
            ])
        });
    });
    await page.route('**/api/auth/status', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ authenticated: false })
        });
    });

    await page.goto(`file://${process.cwd()}/index.html`);

    await page.waitForTimeout(1000);

    await page.evaluate(() => {
        document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
        const chatSec = document.getElementById('chat');
        if(chatSec) chatSec.style.display = 'flex';

        // Add sample messages to test markdown parsing visually
        const chatHistory = document.getElementById('chat-history');
        if (chatHistory) {
             const m1 = document.createElement('div');
             m1.className = 'message idealita-message';
             m1.innerHTML = '<h1>Hola</h1><p>Soy <strong>Idealita</strong>.</p><ul><li>Uno</li><li>Dos</li></ul>';
             chatHistory.appendChild(m1);
        }
    });

    await page.waitForTimeout(500);

    await page.screenshot({ path: 'chat_desktop_verified.png' });
    await browser.close();
    console.log("Screenshot chat_desktop_verified.png saved.");
})();
