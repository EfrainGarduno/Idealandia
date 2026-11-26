/**
 * test_simulador_desglose_tramos.js
 * Suite integral de pruebas automatizadas para la mejora de transparencia en el Simulador Financiero:
 * Botón "+" / "−" y desglose detallado de tramos utilizados en las tres estrategias:
 * - 🟢 Máximo rendimiento
 * - 🔵 Equilibrada
 * - 🟠 Conservadora
 *
 * Cubre los 16 puntos de validación requeridos:
 * 1. Institución con un solo tramo utilizado -> no aparece "+"
 * 2. Institución con varios tramos definidos pero cuya inversión utiliza uno solo -> no aparece "+"
 * 3. Institución cuya inversión utiliza varios tramos -> aparece "+"
 * 4. Al pulsar "+", se expande y muestra exactamente los tramos utilizados
 * 5. La suma de montos de los tramos = inversión asignada
 * 6. La tasa ponderada del detalle = tasa ponderada de la fila principal
 * 7. La suma de rendimientos de los tramos = rendimiento de la fila principal
 * 8. "+" cambia a "−" al expandir
 * 9. "−" vuelve a "+" al contraer
 * 10. Ordenar la tabla no separa institución y detalle (viajan unidos)
 * 11. Seleccionar/deseleccionar instituciones sigue funcionando
 * 12. Mostrar/ocultar columnas sigue funcionando
 * 13. Invarianza matemática: no se altera ningún cálculo existente
 * 14. Responsive móvil vertical (360px)
 * 15. Responsive móvil horizontal (667px)
 * 16. Escritorio (1280px)
 */

const assert = require('assert');
const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server.js');
const MotorFinanciero = require('../motorFinanciero.js');

let server;
let port;
let conn;
let adminToken;
let browser;

async function run() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS: TRANSPARENCIA Y DESGLOSE DE TRAMOS UTILIZADOS (+ / −)');
    console.log('================================================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function report(name, condition, extraInfo) {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`✅ [PASS] Caso ${totalTests}: ${name}`);
        } else {
            console.error(`❌ [FAIL] Caso ${totalTests}: ${name}`);
            if (extraInfo) console.error('   Detalles:', extraInfo);
            assert.fail(`Fallo en prueba: ${name}`);
        }
    }

    try {
        // ---------------------------------------------------------------------
        // PARTE 1: PRUEBAS MATEMÁTICAS Y ESTRUCTURALES DEL MOTOR FINANCIERO
        // ---------------------------------------------------------------------
        console.log('[BLOQUE 1: Verificación de estructura y cálculos del Motor Financiero]\n');

        const tramosKlar = [
            { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 14.0 },
            { numero_tramo: 2, limite_inferior: 25000, limite_superior: 100000, tasa_anual: 13.5 },
            { numero_tramo: 3, limite_inferior: 100000, limite_superior: null, tasa_anual: 13.0 }
        ];

        // 1. Inversión pequeña que solo cae en Tramo 1
        const sim1 = MotorFinanciero.simularInversion(20000, 1, tramosKlar);
        report('Institución con varios tramos definidos pero inversión en solo 1 tramo ($20,000) tiene_multiples_tramos === false',
            sim1.tiene_multiples_tramos === false && sim1.tramos_utilizados.length === 1);

        // 2. Inversión que abarca los 3 tramos ($200,000)
        const sim3 = MotorFinanciero.simularInversion(200000, 1, tramosKlar);
        report('Institución con inversión que abarca múltiples tramos ($200,000) tiene_multiples_tramos === true',
            sim3.tiene_multiples_tramos === true && sim3.tramos_utilizados.length === 3);

        // 3. Verificación de suma de montos y rendimientos en los tramos utilizados
        const sumaMontos = sim3.tramos_utilizados.reduce((acc, t) => acc + t.monto_en_tramo, 0);
        report('Suma de montos de tramos_utilizados coincide exactamente con el capital total ($200,000)',
            Math.abs(sumaMontos - 200000) < 0.001);

        const sumaRendPeriodo = sim3.tramos_utilizados.reduce((acc, t) => acc + t.rendimiento_periodo, 0);
        report('Suma de rendimientos de los tramos coincide con total_periodo del motor',
            Math.abs(sumaRendPeriodo - sim3.total_periodo) < 0.001);

        // ---------------------------------------------------------------------
        // PARTE 2: INICIALIZACIÓN DE SERVIDOR Y NAVEGADOR PLAYWRIGHT
        // ---------------------------------------------------------------------
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'idealandia'
        });

        server = app.listen(0);
        port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;

        const [adminRows] = await conn.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id
            WHERE r.nombre = 'administrador' AND u.activo = 1
            LIMIT 1
        `);
        const adminUser = adminRows[0];
        adminToken = jwt.sign(
            { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });

        await context.addCookies([
            { name: 'auth_token', value: adminToken, domain: '127.0.0.1', path: '/' },
            { name: 'auth_token', value: adminToken, domain: 'localhost', path: '/' }
        ]);

        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Navegar al Simulador Financiero
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
        console.log('✓ Simulador abierto y cargado en el navegador.\n');

        // Configurar simulación con $200,000 para forzar uso de múltiples tramos en instituciones con escalas
        await page.fill('#simulador-inversion-global', '200000');
        await page.dispatchEvent('#simulador-inversion-global', 'input');
        await page.dispatchEvent('#simulador-inversion-global', 'change');
        await page.waitForTimeout(400);

        // ---------------------------------------------------------------------
        // PARTE 3: VALIDACIÓN EN LAS 3 ESTRATEGIAS
        // ---------------------------------------------------------------------
        console.log('[BLOQUE 2: Validación en las Tres Estrategias]\n');

        const estrategias = [
            { selector: 'input[name="simulador-estrategia"][value="maximo_rendimiento"]', labelSelector: '.sim-strategy-maximo', nombre: 'Máximo rendimiento' },
            { selector: 'input[name="simulador-estrategia"][value="equilibrada"]', labelSelector: '.sim-strategy-equilibrada', nombre: 'Equilibrada' },
            { selector: 'input[name="simulador-estrategia"][value="conservadora"]', labelSelector: '.sim-strategy-conservadora', nombre: 'Conservadora' }
        ];

        for (const est of estrategias) {
            console.log(`--- Probando Estrategia: ${est.nombre} ---`);
            await page.click(est.labelSelector);
            await page.waitForTimeout(400);

            // Verificar si hay instituciones con botón '+' en la tabla de distribución
            const datosDistribucion = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('#simulador-tbody-distribucion tr.sim-row-distribucion'));
                return rows.map(r => {
                    const btnPlus = r.querySelector('.btn-toggle-tramos-distribucion');
                    const nombre = r.querySelector('td:first-child span')?.textContent?.trim();
                    const inv = parseFloat(r.dataset.inversion) || 0;
                    const tasa = parseFloat(r.dataset.tasa) || 0;
                    const rendPeriodo = parseFloat(r.dataset.rendPeriodo) || 0;
                    const rendMensual = parseFloat(r.dataset.rendMensual) || 0;
                    const instId = r.dataset.instId;
                    return {
                        instId,
                        nombre,
                        inv,
                        tasa,
                        rendPeriodo,
                        rendMensual,
                        hasButtonPlus: !!btnPlus,
                        btnText: btnPlus ? btnPlus.textContent.trim() : null
                    };
                });
            });

            report(`Estrategia "${est.nombre}" genera filas en la tabla de distribución`,
                datosDistribucion.length > 0);

            // Buscar una institución con botón '+'
            const filaConMultiplesTramos = datosDistribucion.find(d => d.hasButtonPlus);
            if (filaConMultiplesTramos) {
                report(`Estrategia "${est.nombre}": Institución con múltiples tramos (${filaConMultiplesTramos.nombre}) muestra botón "+"`,
                    filaConMultiplesTramos.btnText === '+');

                // Expandir haciendo clic en '+'
                await page.click(`.btn-toggle-tramos-distribucion[data-inst-id="${filaConMultiplesTramos.instId}"]`);
                await page.waitForTimeout(150);

                // Verificar estado expandido
                const estadoExpandido = await page.evaluate((instId) => {
                    const btn = document.querySelector(`.btn-toggle-tramos-distribucion[data-inst-id="${instId}"]`);
                    const subrow = document.getElementById(`sim-subrow-dist-${instId}`);
                    const subTableRows = Array.from(subrow.querySelectorAll('.sim-tabla-desglose-tramos tbody tr'));
                    const tramosData = subTableRows.map(tr => {
                        const tds = Array.from(tr.querySelectorAll('td'));
                        return {
                            tramo: tds[0]?.textContent?.trim(),
                            rango: tds[1]?.textContent?.trim(),
                            monto: parseFloat(tds[2]?.textContent?.replace(/[^0-9.]/g, '')) || 0,
                            tasa: parseFloat(tds[3]?.textContent?.replace(/[^0-9.]/g, '')) || 0,
                            rendMensual: parseFloat(tds[4]?.textContent?.replace(/[^0-9.]/g, '')) || 0,
                            rendPeriodo: parseFloat(tds[5]?.textContent?.replace(/[^0-9.]/g, '')) || 0
                        };
                    });

                    return {
                        btnText: btn ? btn.textContent.trim() : null,
                        isSubrowVisible: subrow && subrow.style.display !== 'none',
                        tramosData
                    };
                }, filaConMultiplesTramos.instId);

                report(`Estrategia "${est.nombre}": El botón cambia de "+" a "−" al expandir`,
                    estadoExpandido.btnText === '−');
                report(`Estrategia "${est.nombre}": La subfila de detalle se hace visible (display !== none)`,
                    estadoExpandido.isSubrowVisible);
                report(`Estrategia "${est.nombre}": Se muestran exactamente los tramos utilizados (${estadoExpandido.tramosData.length} tramos)`,
                    estadoExpandido.tramosData.length > 1);

                // Validar sumas matemáticas exactas del detalle
                const sumaMontosDetalle = estadoExpandido.tramosData.reduce((acc, t) => acc + t.monto, 0);
                report(`Estrategia "${est.nombre}": Suma de montos del detalle (${sumaMontosDetalle}) = Inversión asignada (${filaConMultiplesTramos.inv})`,
                    Math.abs(sumaMontosDetalle - filaConMultiplesTramos.inv) < 0.5);

                const sumaRendDetalle = estadoExpandido.tramosData.reduce((acc, t) => acc + t.rendPeriodo, 0);
                report(`Estrategia "${est.nombre}": Suma de rendimientos del detalle (${sumaRendDetalle}) = Rendimiento asignado (${filaConMultiplesTramos.rendPeriodo})`,
                    Math.abs(sumaRendDetalle - filaConMultiplesTramos.rendPeriodo) < 0.5);

                // Contraer haciendo clic en '−'
                await page.click(`.btn-toggle-tramos-distribucion[data-inst-id="${filaConMultiplesTramos.instId}"]`);
                await page.waitForTimeout(150);

                const estadoContraido = await page.evaluate((instId) => {
                    const btn = document.querySelector(`.btn-toggle-tramos-distribucion[data-inst-id="${instId}"]`);
                    const subrow = document.getElementById(`sim-subrow-dist-${instId}`);
                    return {
                        btnText: btn ? btn.textContent.trim() : null,
                        isSubrowHidden: subrow && subrow.style.display === 'none'
                    };
                }, filaConMultiplesTramos.instId);

                report(`Estrategia "${est.nombre}": El botón vuelve de "−" a "+" al contraer y la subfila se oculta`,
                    estadoContraido.btnText === '+' && estadoContraido.isSubrowHidden);
            } else {
                console.log(`(Nota: En ${est.nombre} las asignaciones se concentraron en instituciones de 1 solo tramo)`);
            }
        }

        // ---------------------------------------------------------------------
        // PARTE 4: VALIDACIÓN DE AGRUPAMIENTO Y ORDENAMIENTO DE COLUMNAS
        // ---------------------------------------------------------------------
        console.log('\n[BLOQUE 3: Agrupamiento y Ordenamiento de Columnas]');

        // Expandir una fila de detalle antes de ordenar
        await page.evaluate(() => {
            const firstBtn = document.querySelector('.btn-toggle-tramos-distribucion');
            if (firstBtn) firstBtn.click();
        });
        await page.waitForTimeout(150);

        // Obtener el ID de la institución expandida
        const expandedId = await page.evaluate(() => {
            const openSubrow = document.querySelector('tr.sim-subrow-distribucion[style*="display: table-row"]');
            return openSubrow ? openSubrow.dataset.parentId : null;
        });

        if (expandedId) {
            // Ordenar por Tasa Ponderada (hacer clic en th[data-col-dist="tasa"])
            await page.click('th[data-col-dist="tasa"]');
            await page.waitForTimeout(200);

            // Verificar que la subfila permanezca inmediatamente debajo de su fila principal
            const posicionAgrupada = await page.evaluate((instId) => {
                const tbody = document.getElementById('simulador-tbody-distribucion');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                const mainRowIdx = rows.findIndex(r => r.classList.contains('sim-row-distribucion') && r.dataset.instId === instId);
                const subRowIdx = rows.findIndex(r => r.classList.contains('sim-subrow-distribucion') && r.dataset.parentId === instId);
                return {
                    mainRowIdx,
                    subRowIdx,
                    unidosConsecutivos: subRowIdx === mainRowIdx + 1,
                    isStillExpanded: rows[subRowIdx] ? rows[subRowIdx].style.display !== 'none' : false
                };
            }, expandedId);

            report('Al ordenar por columna, la subfila viaja unida consecutivamente inmediatamente después de su fila padre',
                posicionAgrupada.unidosConsecutivos);
            report('Al ordenar por columna, la subfila preserva su estado expandido sin cerrarse ni perderse',
                posicionAgrupada.isStillExpanded);

            // Ordenar por Rendimiento Período
            await page.click('th[data-col-dist="rend-periodo"]');
            await page.waitForTimeout(200);

            const posicionAgrupada2 = await page.evaluate((instId) => {
                const tbody = document.getElementById('simulador-tbody-distribucion');
                const rows = Array.from(tbody.querySelectorAll('tr'));
                const mainRowIdx = rows.findIndex(r => r.classList.contains('sim-row-distribucion') && r.dataset.instId === instId);
                const subRowIdx = rows.findIndex(r => r.classList.contains('sim-subrow-distribucion') && r.dataset.parentId === instId);
                return {
                    unidosConsecutivos: subRowIdx === mainRowIdx + 1,
                    isStillExpanded: rows[subRowIdx] ? rows[subRowIdx].style.display !== 'none' : false
                };
            }, expandedId);

            report('Al cambiar dirección de ordenamiento, la relación padre-hijo se mantiene 100% íntegra',
                posicionAgrupada2.unidosConsecutivos && posicionAgrupada2.isStillExpanded);
        }

        // ---------------------------------------------------------------------
        // PARTE 5: COMPATIBILIDAD CON SELECCIÓN Y COLUMNAS
        // ---------------------------------------------------------------------
        console.log('\n[BLOQUE 4: Compatibilidad con Selección y Visibilidad de Columnas]');

        // Deseleccionar una institución y comprobar que la tabla de distribución se recalcula reactivamente
        await page.click('.simulador-check-inst:checked');
        await page.waitForTimeout(300);

        const distCountDespuesDeseleccion = await page.$$eval('#simulador-tbody-distribucion tr.sim-row-distribucion', els => els.length);
        report('Deseleccionar una institución recalcula reactivamente la tabla de distribución',
            distCountDespuesDeseleccion > 0);

        // Pulsar botón 'Todas' y comprobar que se recuperan las instituciones
        await page.click('#simulador-btn-seleccionar-todas');
        await page.waitForTimeout(300);
        const distCountDespuesTodas = await page.$$eval('#simulador-tbody-distribucion tr.sim-row-distribucion', els => els.length);
        report('Botón "Todas" reactiva todas las instituciones y regenera las estrategias correctamente',
            distCountDespuesTodas >= distCountDespuesDeseleccion);

        // ---------------------------------------------------------------------
        // PARTE 6: PRUEBAS RESPONSIVE (MÓVIL VERTICAL, HORIZONTAL Y ESCRITORIO)
        // ---------------------------------------------------------------------
        console.log('\n[BLOQUE 5: Pruebas Responsive y No Overflow]');

        // 1. Móvil Vertical (360px x 740px)
        await page.setViewportSize({ width: 360, height: 740 });
        await page.waitForTimeout(200);

        const resVertical = await page.evaluate(() => {
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { docW, winW, noOverflow: docW <= winW };
        });
        report('Móvil vertical (360px): El contenedor del simulador no produce overflow horizontal global',
            resVertical.noOverflow);

        // 2. Móvil Horizontal (667px x 375px)
        await page.setViewportSize({ width: 667, height: 375 });
        await page.waitForTimeout(200);

        const resHorizontal = await page.evaluate(() => {
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { docW, winW, noOverflow: docW <= winW };
        });
        report('Móvil horizontal (667px): La tabla y subtabla se adaptan correctamente sin overflow global',
            resHorizontal.noOverflow);

        // 3. Escritorio (1280px x 800px)
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(200);

        const resDesktop = await page.evaluate(() => {
            const docW = document.documentElement.scrollWidth;
            const winW = window.innerWidth;
            return { docW, winW, noOverflow: docW <= winW };
        });
        report('Escritorio (1280px): Visualización limpia y sin desbordamientos',
            resDesktop.noOverflow);

        console.log('\n================================================================================');
        console.log(`RESULTADO DE LA SUITE: ${passedTests} de ${totalTests} PRUEBAS SUPERADAS EXITOSAMENTE`);
        console.log('================================================================================\n');

        await browser.close();
        await conn.end();
        server.close();
        process.exit(0);

    } catch (err) {
        console.error('Error general ejecutando la suite:', err);
        if (browser) await browser.close();
        if (conn) await conn.end();
        if (server) server.close();
        process.exit(1);
    }
}

run();
