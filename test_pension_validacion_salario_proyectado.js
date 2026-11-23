/**
 * Suite de Pruebas Automatizadas:
 * Validación Preventiva de Salario Diario Proyectado vs Último Salario IMSS
 * Reglas de Negocio, Integración MySQL, API y UX con Playwright
 */

const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
require('dotenv').config();

const {
    determinarUltimoPeriodoCronologico,
    validarSalarioProyectadoVsUltimoPeriodo,
    parseDateToIso,
    calculatePensionProjection
} = require('./pension');

const AUTH_SECRET = process.env.JWT_SECRET || 'idealandia_dev_secret_key_12345';
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${e.message}\n`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
    } catch (e) {
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${e.message}\n`);
        failed++;
    }
}

async function runTests() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS: VALIDACIÓN SALARIO PROYECTADO VS ÚLTIMO SALARIO REGISTRADO');
    console.log('================================================================================\n');

    // =========================================================================
    // BLOQUE 1: Reglas de Negocio y Algoritmo Cronológico (pension.js)
    // =========================================================================
    console.log('--- BLOQUE 1: Reglas de Negocio y Determinación Cronológica (pension.js) ---');

    test('1.1 Determina el último periodo cronológicamente y NUNCA por el id de la tabla', () => {
        const periodosDesordenados = [
            {
                id: 9999, // ID muy alto pero periodo antiguo
                patron: 'EMPRESA ANTIGUA SA',
                fechaDesde: '2020-01-01',
                fechaHasta: '2022-12-31',
                salario: 1200.00,
                dias: 1096
            },
            {
                id: 2, // ID bajo pero periodo más reciente cronológicamente
                patron: 'EMPRESA ACTUAL SA',
                fechaDesde: '2024-04-09',
                fechaHasta: '2026-06-30',
                salario: 2714.25,
                dias: 813
            },
            {
                id: 550, // ID intermedio
                patron: 'EMPRESA INTERMEDIA SA',
                fechaDesde: '2023-01-01',
                fechaHasta: '2024-04-08',
                salario: 1800.00,
                dias: 463
            }
        ];

        const ultimo = determinarUltimoPeriodoCronologico(periodosDesordenados);
        assert(ultimo, 'Debe retornar un periodo');
        assert.strictEqual(ultimo.salario, 2714.25, 'El último salario debe ser 2714.25 del periodo más reciente');
        assert.strictEqual(ultimo.fechaHasta, '2026-06-30', 'La fecha hasta debe ser 2026-06-30');
        assert.strictEqual(ultimo.id, 2, 'Debe seleccionar el registro con fecha más reciente (id=2), NO el de mayor id (id=9999)');
    });

    test('1.2 Desempate cronológico: cuando fechaHasta coincide, prioriza fechaDesde más reciente', () => {
        const periodosMismaFechaFin = [
            { id: 1, fechaDesde: '2025-01-01', fechaHasta: '2026-12-31', salario: 1500.00 },
            { id: 2, fechaDesde: '2025-06-01', fechaHasta: '2026-12-31', salario: 2200.00 }
        ];
        const ultimo = determinarUltimoPeriodoCronologico(periodosMismaFechaFin);
        assert.strictEqual(ultimo.salario, 2200.00, 'Debe priorizar fechaDesde más reciente en caso de empate en fechaHasta');
    });

    test('1.3 Determinar último periodo con array vacío o nulo es seguro y retorna null', () => {
        assert.strictEqual(determinarUltimoPeriodoCronologico([]), null);
        assert.strictEqual(determinarUltimoPeriodoCronologico(null), null);
        assert.strictEqual(determinarUltimoPeriodoCronologico(undefined), null);
    });

    test('1.4 Caso 1: Salario proyectado menor ($2,500.00 < $2,714.25) -> Requiere advertencia', () => {
        const res = validarSalarioProyectadoVsUltimoPeriodo({
            salarioProyectado: 2500.00,
            ultimoSalarioRegistrado: 2714.25
        });

        assert.strictEqual(res.valido, true, 'El valor es numéricamente válido');
        assert.strictEqual(res.requiereAdvertencia, true, 'Debe requerir advertencia');
        assert.strictEqual(res.sinHistorial, false);
        assert.strictEqual(res.salarioProyectado, 2500.00);
        assert.strictEqual(res.ultimoSalarioRegistrado, 2714.25);
        assert(res.mensajeAdvertencia.includes('$2,500.00'), 'El mensaje debe incluir el salario proyectado');
        assert(res.mensajeAdvertencia.includes('$2,714.25'), 'El mensaje debe incluir el último salario registrado');
        assert(res.mensajeAdvertencia.includes('disminuir'), 'El mensaje debe advertir que puede disminuir el salario promedio');
        assert(res.mensajeAdvertencia.includes('¿Deseas continuar'), 'Debe preguntar al usuario si desea continuar');
    });

    test('1.5 Caso 2: Salario proyectado igual ($2,714.25 === $2,714.25) -> Sin advertencia', () => {
        const res = validarSalarioProyectadoVsUltimoPeriodo({
            salarioProyectado: 2714.25,
            ultimoSalarioRegistrado: 2714.25
        });

        assert.strictEqual(res.valido, true);
        assert.strictEqual(res.requiereAdvertencia, false, 'No debe requerir advertencia cuando es igual');
    });

    test('1.6 Caso 3: Salario proyectado mayor ($3,000.00 > $2,714.25) -> Sin advertencia', () => {
        const res = validarSalarioProyectadoVsUltimoPeriodo({
            salarioProyectado: 3000.00,
            ultimoSalarioRegistrado: 2714.25
        });

        assert.strictEqual(res.valido, true);
        assert.strictEqual(res.requiereAdvertencia, false, 'No debe requerir advertencia cuando es mayor');
    });

    test('1.7 Caso 4: Usuario sin periodos en usuario_periodos_imss -> Comportamiento seguro sin advertencia', () => {
        const res1 = validarSalarioProyectadoVsUltimoPeriodo({
            salarioProyectado: 2500.00,
            ultimoSalarioRegistrado: null
        });
        assert.strictEqual(res1.valido, true);
        assert.strictEqual(res1.requiereAdvertencia, false);
        assert.strictEqual(res1.sinHistorial, true);

        const res2 = validarSalarioProyectadoVsUltimoPeriodo({
            salarioProyectado: 2500.00,
            ultimoSalarioRegistrado: 0
        });
        assert.strictEqual(res2.valido, true);
        assert.strictEqual(res2.requiereAdvertencia, false);
        assert.strictEqual(res2.sinHistorial, true);
    });

    test('1.8 Caso 5: Valor vacío, cero, negativo o no numérico -> Validación de campo', () => {
        const vacio = validarSalarioProyectadoVsUltimoPeriodo({ salarioProyectado: '', ultimoSalarioRegistrado: 2714.25 });
        assert.strictEqual(vacio.valido, false);
        assert.strictEqual(vacio.error, 'EMPTY_PROJECTED_SALARY');

        const cero = validarSalarioProyectadoVsUltimoPeriodo({ salarioProyectado: 0, ultimoSalarioRegistrado: 2714.25 });
        assert.strictEqual(cero.valido, false);
        assert.strictEqual(cero.error, 'INVALID_PROJECTED_SALARY');

        const negativo = validarSalarioProyectadoVsUltimoPeriodo({ salarioProyectado: -500, ultimoSalarioRegistrado: 2714.25 });
        assert.strictEqual(negativo.valido, false);
        assert.strictEqual(negativo.error, 'INVALID_PROJECTED_SALARY');

        const texto = validarSalarioProyectadoVsUltimoPeriodo({ salarioProyectado: 'invalido', ultimoSalarioRegistrado: 2714.25 });
        assert.strictEqual(texto.valido, false);
        assert.strictEqual(texto.error, 'INVALID_PROJECTED_SALARY');
    });

    // =========================================================================
    // BLOQUE 2: Integración MySQL y Base de Datos Real
    // =========================================================================
    console.log('\n--- BLOQUE 2: Integración con Base de Datos MySQL Real ---');

    let db;
    let testUserId = 7;

    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'idealandia_dev',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            dateStrings: true
        });

        const [users] = await db.query('SELECT id FROM usuarios LIMIT 1');
        if (users && users.length > 0) {
            testUserId = users[0].id;
        }

        await testAsync('2.1 Comprobar en MySQL que el último salario se obtiene por fecha y NO por id', async () => {
            // Limpiar datos de prueba
            await db.query('DELETE FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);

            // Insertar 3 registros donde el id mayor tiene fecha más antigua y el id menor tiene fecha más reciente
            // Primer insert: ID más bajo, pero fecha más reciente (2024-04-09 a 2026-06-30) -> $2,714.25
            await db.query(
                'INSERT INTO usuario_periodos_imss (usuario_id, patron, fecha_desde, fecha_hasta, salario, dias) VALUES (?, ?, ?, ?, ?, ?)',
                [testUserId, 'PATRON ACTUAL RECIENTE', '2024-04-09', '2026-06-30', 2714.25, 813]
            );

            // Segundo insert: ID intermedio, fecha anterior (2023-01-01 a 2024-04-08) -> $1,800.00
            await db.query(
                'INSERT INTO usuario_periodos_imss (usuario_id, patron, fecha_desde, fecha_hasta, salario, dias) VALUES (?, ?, ?, ?, ?, ?)',
                [testUserId, 'PATRON INTERMEDIO', '2023-01-01', '2024-04-08', 1800.00, 463]
            );

            // Tercer insert: ID MÁS ALTO (último insertado físicamente en la tabla), pero fecha más vieja (2020-01-01 a 2022-12-31) -> $1,000.00
            await db.query(
                'INSERT INTO usuario_periodos_imss (usuario_id, patron, fecha_desde, fecha_hasta, salario, dias) VALUES (?, ?, ?, ?, ?, ?)',
                [testUserId, 'PATRON ANTIGUO', '2020-01-01', '2022-12-31', 1000.00, 1096]
            );

            // Consulta cronológica oficial (ORDER BY fecha_hasta DESC, fecha_desde DESC)
            const [rows] = await db.query(
                "SELECT id, patron, DATE_FORMAT(fecha_desde, '%Y-%m-%d') as fechaDesde, DATE_FORMAT(fecha_hasta, '%Y-%m-%d') as fechaHasta, salario, dias FROM usuario_periodos_imss WHERE usuario_id = ? ORDER BY fecha_hasta DESC, fecha_desde DESC",
                [testUserId]
            );

            // Obtener el registro de MAX(id) intencionalmente erróneo para contrastar
            const [maxIdRows] = await db.query(
                "SELECT id, salario FROM usuario_periodos_imss WHERE usuario_id = ? ORDER BY id DESC LIMIT 1",
                [testUserId]
            );

            const ultimoPorFecha = rows[0];
            const ultimoPorMaxId = maxIdRows[0];

            assert(ultimoPorFecha.id !== ultimoPorMaxId.id, 'El registro más reciente por fecha tiene un ID diferente al MAX(id)');
            assert.strictEqual(parseFloat(ultimoPorFecha.salario), 2714.25, 'Por orden cronológico debe ser $2,714.25');
            assert.strictEqual(parseFloat(ultimoPorMaxId.salario), 1000.00, 'MAX(id) daría erróneamente $1,000.00');

            // Validar con la función del motor
            const ultimoPeriodoMotor = determinarUltimoPeriodoCronologico(rows);
            assert.strictEqual(ultimoPeriodoMotor.salario, 2714.25, 'determinarUltimoPeriodoCronologico debe seleccionar $2,714.25');

            // Limpieza
            await db.query('DELETE FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
        });

    } catch (dbErr) {
        console.warn('Nota: Salto de bloque MySQL por configuración local:', dbErr.message);
    } finally {
        if (db) await db.end();
    }

    // =========================================================================
    // BLOQUE 3: Integración Frontend y Verificación DOM (Playwright)
    // =========================================================================
    console.log('\n--- BLOQUE 3: Integración Frontend y Verificación DOM (Playwright) ---');

    let browser;
    let page;

    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        page = await context.newPage();

        const fileUrl = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
        await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(300);

        // Habilitar vista de servicios pensiones y modalidad avanzada
        await page.evaluate(() => {
            window.showModal = () => {};
            const secServicios = document.getElementById('servicios');
            if (secServicios) secServicios.style.display = 'block';
            const viewPension = document.getElementById('servicios-pension-view');
            if (viewPension) viewPension.style.display = 'block';

            // Simular datos del expediente IMSS con último salario registrado = 2,714.25
            window.pensionUltimoSalario = 2714.25;
            window.pensionUltimoPeriodo = {
                patron: 'EMPRESA ACTUAL SA',
                fechaDesde: '2024-04-09',
                fechaHasta: '2026-06-30',
                salario: 2714.25,
                dias: 813
            };

            window.ultimoDocumentoIMSS = {
                nombreAsegurado: 'USUARIO PRUEBA',
                curp: 'GAFE651207HQTRLF02',
                fechaNacimiento: '1965-12-07',
                totalSemanasCotizadas: 1615,
                salarioDiarioPromedio: 2585.94,
                periodosReconstruidos: [
                    {
                        patron: 'EMPRESA ACTUAL SA',
                        fechaDesde: '2024-04-09',
                        fechaHasta: '2026-06-30',
                        salario: 2714.25,
                        dias: 813
                    }
                ]
            };

            // Activar modalidad avanzada
            window.activarModalidadCalculadora('avanzada');
        });
        await page.waitForTimeout(200);

        await testAsync('3.1 Proyectado menor ($2,500.00 < $2,714.25) -> Muestra advertencia interactiva con Cancelar y Continuar', async () => {
            // Abrir modal de proyección
            await page.click('#btn-abrir-proyeccion');
            await page.waitForTimeout(200);

            // Capturar salario proyectado menor
            await page.evaluate(() => {
                document.getElementById('proy-fecha-desde').value = '2026-07-01';
                document.getElementById('proy-fecha-hasta').value = '2027-07-01';
                document.getElementById('proy-fecha-hasta').dispatchEvent(new Event('change', { bubbles: true }));
                document.getElementById('proy-salario-diario-nuevo').value = '2500.00';
            });
            await page.waitForTimeout(100);

            // Clic en Proyectar
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(200);

            // Verificar que se abrió el modal de advertencia
            const isModalAdvVisible = await page.evaluate(() => {
                const modal = document.getElementById('modal-advertencia-salario-proyectado');
                return modal && modal.style.display !== 'none';
            });
            assert.strictEqual(isModalAdvVisible, true, 'El modal de advertencia debe estar visible');

            // Verificar texto y botones
            const textoAdvertencia = await page.locator('#advertencia-salario-mensaje').innerText();
            assert(textoAdvertencia.includes('$2,500.00'), 'Debe mostrar el salario proyectado capturado ($2,500.00)');
            assert(textoAdvertencia.includes('$2,714.25'), 'Debe mostrar el último salario registrado ($2,714.25)');
            assert(textoAdvertencia.includes('disminuir'), 'Debe advertir sobre la disminución del salario promedio');

            const btnCancelar = await page.locator('#btn-cancelar-advertencia-salario').isVisible();
            const btnContinuar = await page.locator('#btn-continuar-advertencia-salario').isVisible();
            assert(btnCancelar, 'El botón Cancelar debe estar visible');
            assert(btnContinuar, 'El botón Continuar debe estar visible');
        });

        await testAsync('3.2 Si el usuario pulsa Cancelar -> No ejecuta proyección, restaura valor anterior y permite modificar', async () => {
            // Clic en Cancelar
            await page.click('#btn-cancelar-advertencia-salario');
            await page.waitForTimeout(200);

            // Modal de advertencia se cierra
            const isModalAdvVisible = await page.evaluate(() => {
                const modal = document.getElementById('modal-advertencia-salario-proyectado');
                return modal && modal.style.display !== 'none';
            });
            assert.strictEqual(isModalAdvVisible, false, 'El modal de advertencia debe haberse cerrado');

            // Resultados NO se ejecutaron
            const isResultadosVisible = await page.evaluate(() => {
                const res = document.getElementById('resultado-proyeccion-container');
                return res && res.style.display !== 'none';
            });
            assert.strictEqual(isResultadosVisible, false, 'No debe haberse ejecutado la proyección con ese nuevo salario');
        });

        await testAsync('3.3 Si el usuario pulsa Continuar -> Acepta el salario menor y ejecuta normalmente la proyección', async () => {
            // Volver a capturar 2500.00 y pulsar Proyectar
            await page.evaluate(() => {
                document.getElementById('proy-salario-diario-nuevo').value = '2500.00';
            });
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(200);

            // Clic en Continuar en la advertencia
            await page.click('#btn-continuar-advertencia-salario');
            await page.waitForTimeout(400);

            // Modal de advertencia se cerró
            const isModalAdvVisible = await page.evaluate(() => {
                const modal = document.getElementById('modal-advertencia-salario-proyectado');
                return modal && modal.style.display !== 'none';
            });
            assert.strictEqual(isModalAdvVisible, false, 'El modal de advertencia debe cerrarse al Continuar');

            // La proyección se ejecutó y muestra resultados
            const isResultadosVisible = await page.evaluate(() => {
                const res = document.getElementById('resultado-proyeccion-container');
                return res && res.style.display === 'block';
            });
            assert.strictEqual(isResultadosVisible, true, 'Debe ejecutarse normalmente la proyección y mostrar resultados');
        });

        await testAsync('3.4 Proyectado igual ($2,714.25) -> No muestra advertencia y proyecta directo', async () => {
            await page.evaluate(() => {
                document.getElementById('proy-salario-diario-nuevo').value = '2714.25';
                document.getElementById('resultado-proyeccion-container').style.display = 'none';
            });
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(300);

            const isModalAdvVisible = await page.evaluate(() => {
                const modal = document.getElementById('modal-advertencia-salario-proyectado');
                return modal && modal.style.display !== 'none';
            });
            assert.strictEqual(isModalAdvVisible, false, 'NO debe mostrar advertencia cuando es igual');

            const isResultadosVisible = await page.evaluate(() => {
                const res = document.getElementById('resultado-proyeccion-container');
                return res && res.style.display === 'block';
            });
            assert.strictEqual(isResultadosVisible, true, 'Debe proyectar directamente');
        });

        await testAsync('3.5 Proyectado mayor ($3,000.00 > $2,714.25) -> No muestra advertencia y proyecta directo', async () => {
            await page.evaluate(() => {
                document.getElementById('proy-salario-diario-nuevo').value = '3000.00';
                document.getElementById('resultado-proyeccion-container').style.display = 'none';
            });
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(300);

            const isModalAdvVisible = await page.evaluate(() => {
                const modal = document.getElementById('modal-advertencia-salario-proyectado');
                return modal && modal.style.display !== 'none';
            });
            assert.strictEqual(isModalAdvVisible, false, 'NO debe mostrar advertencia cuando es mayor');

            const isResultadosVisible = await page.evaluate(() => {
                const res = document.getElementById('resultado-proyeccion-container');
                return res && res.style.display === 'block';
            });
            assert.strictEqual(isResultadosVisible, true, 'Debe proyectar directamente');
        });

        await testAsync('3.6 Usuario sin periodos en usuario_periodos_imss -> Comportamiento seguro', async () => {
            await page.evaluate(() => {
                window.pensionUltimoSalario = null;
                window.pensionUltimoPeriodo = null;
                window.ultimoDocumentoIMSS = null;
                document.getElementById('proy-salario-diario-nuevo').value = '1500.00';
                document.getElementById('resultado-proyeccion-container').style.display = 'none';
            });
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(300);

            const isModalAdvVisible = await page.evaluate(() => {
                const modal = document.getElementById('modal-advertencia-salario-proyectado');
                return modal && modal.style.display !== 'none';
            });
            assert.strictEqual(isModalAdvVisible, false, 'No debe intentar comparar ni mostrar advertencia si no hay historial');
        });

        await testAsync('3.7 Valor inválido (0 o negativo) -> Validación correspondiente sin abrir advertencia comparativa', async () => {
            await page.evaluate(() => {
                window.pensionUltimoSalario = 2714.25;
                document.getElementById('proy-salario-diario-nuevo').value = '0';
            });
            await page.click('#btn-ejecutar-proyeccion');
            await page.waitForTimeout(200);

            const msgVal = await page.locator('#proy-validation-message').innerText();
            assert(msgVal.includes('mayor a cero'), 'Debe mostrar validación normal de campo');

            const isModalAdvVisible = await page.evaluate(() => {
                const modal = document.getElementById('modal-advertencia-salario-proyectado');
                return modal && modal.style.display !== 'none';
            });
            assert.strictEqual(isModalAdvVisible, false, 'No debe abrir la advertencia comparativa con valor inválido');
        });

        await testAsync('3.8 Banner informativo de modalidades: texto optimizado y distribución con viñetas presente en DOM', async () => {
            const banner = await page.locator('.pension-modalidades-info-banner');
            assert(await banner.isVisible(), 'El panel informativo debe estar visible');

            const htmlBanner = await banner.innerHTML();
            assert(htmlBanner.includes('1. Calculadora Básica'), 'Debe contener Calculadora Básica');
            assert(htmlBanner.includes('2. Calculadora Intermedia'), 'Debe contener Calculadora Intermedia');
            assert(htmlBanner.includes('3. Calculadora Avanzada'), 'Debe contener Calculadora Avanzada');
            assert(htmlBanner.includes('fa-check-circle'), 'Debe contener iconos de viñetas check-circle');
            assert(htmlBanner.includes('Simulador de proyecciones con ventana deslizante'), 'Debe listar la característica de proyecciones');
        });

    } finally {
        if (browser) await browser.close();
    }

    console.log('\n================================================================================');
    console.log(`RESUMEN: ${passed} PRUEBAS PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================\n');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Error fatal durante la suite de pruebas:', err);
    process.exit(1);
});
