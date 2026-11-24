const { chromium } = require('playwright');
const { app } = require('../server');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

(async () => {
    let server;
    let browser;
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'idealandia'
        });

        const [adminRows] = await conn.query("SELECT u.id, u.usuario, u.jwt_version FROM usuarios u JOIN usuario_roles ur ON u.id = ur.usuario_id JOIN roles r ON ur.rol_id = r.id WHERE r.nombre = 'administrador' AND u.activo = 1 LIMIT 1");
        const adminUser = adminRows[0];
        const token = jwt.sign(
            { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        server = app.listen(0);
        const port = server.address().port;

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        await context.addCookies([{ name: 'auth_token', value: token, domain: '127.0.0.1', path: '/' }]);
        const page = await context.newPage();

        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('auth_token', token);
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify({
                id: user.id,
                usuario: user.usuario,
                roles: ['administrador']
            }));
            document.querySelectorAll('.content-section').forEach(s => s.style.display = (s.id === 'servicios') ? 'flex' : 'none');
            const catalogoView = document.getElementById('servicios-catalogo-view');
            if (catalogoView) catalogoView.style.display = 'block';
        }, { token, user: adminUser });
        await page.waitForTimeout(600);

        const card = page.locator('.servicio-card[data-service-key="asesorias-financieras"]');
        const cardCount = await card.count();
        if (cardCount === 0) {
            throw new Error('No se encontró la card de asesorias-financieras');
        }

        const title = (await card.locator('.servicio-card-title').textContent()).trim();
        console.log('✓ Título de la tarjeta:', title);

        const modalidadesTitulo = (await card.locator('.servicio-modalidades-list > div:first-child').textContent()).trim();
        console.log('✓ Título de modalidades:', modalidadesTitulo);

        const badges = await card.locator('.servicio-modalidades-list span').allTextContents();
        console.log('✓ Módulos / Badges detectados:', badges);

        if (!badges.includes('Individual') || !badges.includes('Diversificado') || !badges.includes('Administrable')) {
            throw new Error(`Badges faltantes en la tarjeta: ${JSON.stringify(badges)}`);
        }

        console.log('Haciendo clic en Entrar...');
        const entrarBtn = card.locator('.btn-entrar-servicio');
        await entrarBtn.click();
        await page.waitForTimeout(500);

        const isFinancierasVisible = await page.locator('#servicios-financieras-view').isVisible();
        console.log('✓ Vista #servicios-financieras-view visible tras Entrar:', isFinancierasVisible);
        if (!isFinancierasVisible) {
            throw new Error('No se mostró la vista del simulador financiero tras pulsar Entrar');
        }

        // Test back button
        console.log('Haciendo clic en Volver...');
        const volverBtn = page.locator('#btn-volver-catalogo-financieras');
        await volverBtn.click();
        await page.waitForTimeout(500);
        const isCatalogoVisible = await page.locator('#servicios-catalogo-view').isVisible();
        console.log('✓ Regreso exitoso al catálogo de servicios:', isCatalogoVisible);

        console.log('\n>>> TODAS LAS PRUEBAS DEL CATÁLOGO DE SERVICIOS PASARON EXITOSAMENTE <<<');
        process.exit(0);
    } catch (err) {
        console.error('Error durante la prueba:', err);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        if (conn) await conn.end();
    }
})();
