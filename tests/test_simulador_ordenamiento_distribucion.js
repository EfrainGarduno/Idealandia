/**
 * test_simulador_ordenamiento_distribucion.js
 * Prueba automatizada para el ordenamiento por columnas en la tabla de resultados
 * "Distribución Recomendada" al seleccionar estrategias:
 * - Máximo rendimiento
 * - Equilibrada
 * - Conservadora
 */

const assert = require('assert');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server.js');

async function runTests() {
    console.log('=== TEST: ORDENAMIENTO DE TABLA DE DISTRIBUCIÓN RECOMENDADA ===\n');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia'
    });

    const [adminRows] = await conn.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN roles r ON ur.rol_id = r.id
        WHERE r.nombre = 'administrador' AND u.activo = 1
        LIMIT 1
    `);
    const adminUser = adminRows[0];
    const adminToken = jwt.sign(
        { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
        process.env.AUTH_SECRET,
        { expiresIn: '1h' }
    );

    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`✓ Servidor de prueba iniciado en puerto ${port}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    await context.addCookies([
        { name: 'auth_token', value: adminToken, domain: '127.0.0.1', path: '/' },
        { name: 'auth_token', value: adminToken, domain: 'localhost', path: '/' }
    ]);

    const page = await context.newPage();

    try {
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Abrir Asesorías Financieras -> Simulador
        await page.evaluate(() => {
            const link = document.querySelector('a[data-section="servicios-financieras"], #menu-item-financieras, [data-target="servicios-financieras"]');
            if (link) link.click();
            else {
                document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
                const sec = document.getElementById('servicios');
                if (sec) sec.style.display = 'block';
                const fView = document.getElementById('servicios-financieras-view');
                if (fView) fView.style.display = 'block';
                if (window.inicializarSimuladorFinanciero) window.inicializarSimuladorFinanciero();
            }
        });

        await page.waitForSelector('#simulador-tbody tr.simulador-row', { timeout: 10000 });
        console.log('✓ Simulador abierto y tabla cargada correctamente.');

        // 1. Probar en Estrategia "Máximo rendimiento" con $1,000,000 (igual que la captura del usuario)
        console.log('\n[Paso 1: Configurar $1,000,000 y seleccionar estrategia Máximo rendimiento]');
        await page.fill('#simulador-inversion-global', '1,000,000');
        await page.evaluate(() => {
            const input = document.getElementById('simulador-inversion-global');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.click('input[name="simulador-estrategia"][value="maximo_rendimiento"]');
        await page.waitForTimeout(300);

        // Verificar que la tabla de distribución recomendada está en el DOM
        await page.waitForSelector('#simulador-tabla-distribucion', { timeout: 5000 });
        console.log('✓ Tabla #simulador-tabla-distribucion visible.');

        // Helper para obtener datos de la tabla de distribución
        const getDistribucionRows = async () => {
            return await page.evaluate(() => {
                const tbody = document.getElementById('simulador-tbody-distribucion');
                if (!tbody) return [];
                const rows = Array.from(tbody.querySelectorAll('tr.sim-row-distribucion'));
                return rows.map(r => ({
                    nombre: r.dataset.nombre,
                    tipo: r.dataset.tipo,
                    inversion: parseFloat(r.dataset.inversion || 0),
                    porcentaje: parseFloat(r.dataset.porcentaje || 0),
                    tasa: parseFloat(r.dataset.tasa || 0),
                    rendMensual: parseFloat(r.dataset.rendMensual || 0),
                    rendPeriodo: parseFloat(r.dataset.rendPeriodo || 0),
                    origIndex: parseInt(r.dataset.origIndex, 10)
                }));
            });
        };

        const filasIniciales = await getDistribucionRows();
        assert(filasIniciales.length > 0, 'La tabla de distribución debe tener filas');
        console.log(`   Filas en distribución inicial: ${filasIniciales.length} instituciones asignadas.`);

        // 2. Ordenar por Inversión Asignada (ASC y luego DESC)
        console.log('\n[Paso 2: Ordenar por Inversión Asignada]');
        // 1er Clic: ASC
        await page.click('th.th-dist-col[data-col-dist="inversion"]');
        await page.waitForTimeout(100);

        let filasAsc = await getDistribucionRows();
        console.log('   Orden Inversión ASC:', filasAsc.map(f => `${f.nombre}: $${f.inversion}`).join(', '));
        for (let i = 0; i < filasAsc.length - 1; i++) {
            assert(filasAsc[i].inversion <= filasAsc[i+1].inversion, 
                `Fila ${i} ($${filasAsc[i].inversion}) debe ser <= que fila ${i+1} ($${filasAsc[i+1].inversion})`);
        }
        console.log('✓ Inversión Asignada ordenada ASC correctamente.');

        // 2do Clic: DESC
        await page.click('th.th-dist-col[data-col-dist="inversion"]');
        await page.waitForTimeout(100);

        let filasDesc = await getDistribucionRows();
        console.log('   Orden Inversión DESC:', filasDesc.map(f => `${f.nombre}: $${f.inversion}`).join(', '));
        for (let i = 0; i < filasDesc.length - 1; i++) {
            assert(filasDesc[i].inversion >= filasDesc[i+1].inversion, 
                `Fila ${i} ($${filasDesc[i].inversion}) debe ser >= que fila ${i+1} ($${filasDesc[i+1].inversion})`);
        }
        console.log('✓ Inversión Asignada ordenada DESC correctamente.');

        // 3er Clic: Regresar al orden original de la estrategia
        await page.click('th.th-dist-col[data-col-dist="inversion"]');
        await page.waitForTimeout(100);

        let filasReset = await getDistribucionRows();
        for (let i = 0; i < filasReset.length; i++) {
            assert.strictEqual(filasReset[i].origIndex, i, `Fila en posición ${i} debe tener origIndex ${i}`);
        }
        console.log('✓ Orden original de la estrategia restaurado tras el 3er clic.');

        // 3. Ordenar por Institución (Alfabético A-Z y Z-A)
        console.log('\n[Paso 3: Ordenar por Institución]');
        await page.click('th.th-dist-col[data-col-dist="institucion"]');
        await page.waitForTimeout(100);

        let filasInstAsc = await getDistribucionRows();
        console.log('   Orden Institución ASC:', filasInstAsc.map(f => f.nombre).join(', '));
        for (let i = 0; i < filasInstAsc.length - 1; i++) {
            assert(filasInstAsc[i].nombre.localeCompare(filasInstAsc[i+1].nombre, 'es') <= 0,
                `Institución ${filasInstAsc[i].nombre} debe ir antes que ${filasInstAsc[i+1].nombre}`);
        }
        console.log('✓ Institución ordenada alfabéticamente ASC.');

        // 4. Ordenar por Tasa Ponderada DESC
        console.log('\n[Paso 4: Ordenar por Tasa Ponderada]');
        // 1er clic ASC, 2do clic DESC
        await page.click('th.th-dist-col[data-col-dist="tasa"]');
        await page.waitForTimeout(50);
        await page.click('th.th-dist-col[data-col-dist="tasa"]');
        await page.waitForTimeout(100);

        let filasTasaDesc = await getDistribucionRows();
        console.log('   Orden Tasa DESC:', filasTasaDesc.map(f => `${f.nombre}: ${f.tasa}%`).join(', '));
        for (let i = 0; i < filasTasaDesc.length - 1; i++) {
            assert(filasTasaDesc[i].tasa >= filasTasaDesc[i+1].tasa,
                `Tasa ${filasTasaDesc[i].tasa}% debe ser >= que ${filasTasaDesc[i+1].tasa}%`);
        }
        console.log('✓ Tasa ponderada ordenada DESC correctamente.');

        // 5. Verificar que el tfoot "TOTAL DISTRIBUIDO" sigue intacto en el pie de tabla
        console.log('\n[Paso 5: Integridad del pie de tabla (TOTAL DISTRIBUIDO)]');
        const footerText = await page.$eval('#simulador-tabla-distribucion tfoot tr', el => el.textContent.trim());
        assert(footerText.includes('TOTAL DISTRIBUIDO'), 'El pie de tabla debe decir TOTAL DISTRIBUIDO');
        console.log('✓ El pie de tabla tfoot TOTAL DISTRIBUIDO permanece intacto en su posición final.');

        // 6. Probar en Estrategia "Equilibrada"
        console.log('\n[Paso 6: Probar ordenamiento en estrategia Equilibrada]');
        await page.click('input[name="simulador-estrategia"][value="equilibrada"]');
        await page.waitForTimeout(300);

        await page.waitForSelector('#simulador-tabla-distribucion', { timeout: 5000 });
        const filasEquilibrada = await getDistribucionRows();
        assert(filasEquilibrada.length > 0, 'La estrategia Equilibrada debe tener filas');

        // Ordenar por Tipo en Equilibrada
        await page.click('th.th-dist-col[data-col-dist="tipo"]');
        await page.waitForTimeout(100);

        let filasTipoAsc = await getDistribucionRows();
        console.log('   Orden Tipo ASC (Equilibrada):', filasTipoAsc.map(f => `${f.nombre} (${f.tipo})`).join(', '));
        for (let i = 0; i < filasTipoAsc.length - 1; i++) {
            assert(filasTipoAsc[i].tipo.localeCompare(filasTipoAsc[i+1].tipo, 'es') <= 0,
                `Tipo ${filasTipoAsc[i].tipo} debe ser <= que ${filasTipoAsc[i+1].tipo}`);
        }
        console.log('✓ Ordenamiento por Tipo verificado en estrategia Equilibrada.');

        // 7. Probar en Estrategia "Conservadora"
        console.log('\n[Paso 7: Probar ordenamiento en estrategia Conservadora]');
        await page.click('input[name="simulador-estrategia"][value="conservadora"]');
        await page.waitForTimeout(300);

        await page.waitForSelector('#simulador-tabla-distribucion', { timeout: 5000 });
        const filasConservadora = await getDistribucionRows();
        assert(filasConservadora.length > 0, 'La estrategia Conservadora debe tener filas');

        // Ordenar por Rend. Periodo DESC en Conservadora
        await page.click('th.th-dist-col[data-col-dist="rend-periodo"]');
        await page.waitForTimeout(50);
        await page.click('th.th-dist-col[data-col-dist="rend-periodo"]');
        await page.waitForTimeout(100);

        let filasRendDesc = await getDistribucionRows();
        console.log('   Orden Rend. Periodo DESC (Conservadora):', filasRendDesc.map(f => `${f.nombre}: $${f.rendPeriodo}`).join(', '));
        for (let i = 0; i < filasRendDesc.length - 1; i++) {
            assert(filasRendDesc[i].rendPeriodo >= filasRendDesc[i+1].rendPeriodo,
                `Rendimiento $${filasRendDesc[i].rendPeriodo} debe ser >= que $${filasRendDesc[i+1].rendPeriodo}`);
        }
        console.log('✓ Ordenamiento por Rend. Periodo verificado en estrategia Conservadora.');

        console.log('\n================================================================');
        console.log('¡TODAS LAS PRUEBAS DE ORDENAMIENTO DE DISTRIBUCIÓN PASARON CON ÉXITO!');
        console.log('================================================================');

        await browser.close();
        await conn.end();
        server.close();
        process.exit(0);
    } catch (err) {
        console.error('Error en pruebas de ordenamiento de distribución:', err);
        if (browser) await browser.close();
        if (conn) await conn.end();
        server.close();
        process.exit(1);
    }
}

runTests();
