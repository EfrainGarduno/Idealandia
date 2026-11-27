/**
 * Suite de Pruebas Automatizadas:
 * Persistencia en BD de Historial IMSS y Proyección Cronológica Exacta (PR #109)
 */

const assert = require('assert');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const {
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
        console.error(e);
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
        console.error(e);
        failed++;
    }
}

async function runTests() {
    console.log('================================================================================');
    console.log('SUITE: PERSISTENCIA HISTORIAL IMSS Y PROYECCIÓN CRONOLÓGICA (PR #109)');
    console.log('================================================================================\n');

    const db = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'idealandia_dev',
        port: parseInt(process.env.DB_PORT || '3306', 10)
    });

    console.log('--- FASE 1: Verificación de Esquema e Integridad de BD ---');

    await testAsync('1.1 Tabla usuario_periodos_imss existe con columnas y tipos requeridos', async () => {
        const [cols] = await db.query('DESCRIBE usuario_periodos_imss');
        const colMap = {};
        cols.forEach(c => { colMap[c.Field] = c.Type; });

        assert(colMap.id, 'Debe existir id');
        assert(colMap.usuario_id, 'Debe existir usuario_id');
        assert(colMap.fecha_desde.includes('date'), 'fecha_desde debe ser DATE');
        assert(colMap.fecha_hasta.includes('date'), 'fecha_hasta debe ser DATE');
        assert(colMap.salario.includes('decimal'), 'salario debe ser DECIMAL');
        assert(colMap.dias.includes('int'), 'dias debe ser INT');
    });

    console.log('\n--- FASE 2: Algoritmo de Proyección Cronológica Exacta y Validación de Traslapes ---');

    const periodosMockHist = [
        {
            patron: 'EMPRESA TECNOLOGICA SA',
            fechaDesde: '2023-01-01',
            fechaHasta: '2025-12-31',
            salario: 1000.00,
            dias: 1096
        },
        {
            patron: 'SERVICIOS COMERCIALES SA',
            fechaDesde: '2021-01-01',
            fechaHasta: '2022-12-31',
            salario: 500.00,
            dias: 730
        }
    ];

    test('2.1 Rechaza proyección con fecha fin anterior a fecha inicio', () => {
        const res = calculatePensionProjection({
            semanasActuales: 1000,
            salarioPromedioActual: 800,
            salarioDiarioProyectado: 1500,
            salarioMinimoActual: 315.04,
            fechaDesde: '2026-06-01',
            fechaHasta: '2026-01-01',
            periodosHistoricos: periodosMockHist
        });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'INVALID_DATE_RANGE');
    });

    test('2.2 Rechaza proyección con traslape estricto sobre periodo histórico', () => {
        // El periodo 2025-06-01 a 2026-05-31 invade el historial (termina en 2025-12-31)
        const res = calculatePensionProjection({
            semanasActuales: 1000,
            salarioPromedioActual: 800,
            salarioDiarioProyectado: 1500,
            salarioMinimoActual: 315.04,
            fechaDesde: '2025-06-01',
            fechaHasta: '2026-05-31',
            periodosHistoricos: periodosMockHist
        });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'OVERLAPPING_PERIOD');
        assert(res.message.includes('se traslapa con un periodo histórico'));
    });

    test('2.3 Rechaza proyección en el pasado (fecha final menor al historial)', () => {
        const res = calculatePensionProjection({
            semanasActuales: 1000,
            salarioPromedioActual: 800,
            salarioDiarioProyectado: 1500,
            salarioMinimoActual: 315.04,
            fechaDesde: '2020-01-01',
            fechaHasta: '2020-12-31',
            periodosHistoricos: periodosMockHist
        });
        assert.strictEqual(res.success, false);
        assert.strictEqual(res.error, 'INVALID_CHRONOLOGY');
    });

    test('2.4 Cálculo cronológico exacto: ventana deslizante desplaza días antiguos con historial', () => {
        // Proyectamos 365 días (2026-01-01 a 2026-12-31) a $2,000 diario
        // Total ventana IMSS: 1,750 días
        // 365 días @ $2,000 + 1,096 días (2023-2025) @ $1,000 + (1,750 - 365 - 1096 = 289 días) (de 2021-2022) @ $500
        // Suma ponderada esperada: (365 * 2000) + (1096 * 1000) + (289 * 500) = 730,000 + 1,096,000 + 144,500 = 1,970,500
        // Promedio esperado = 1,970,500 / 1750 = 1126.00
        const res = calculatePensionProjection({
            semanasActuales: 1000,
            salarioPromedioActual: 800,
            salarioDiarioProyectado: 2000,
            salarioMinimoActual: 315.04,
            fechaDesde: '2026-01-01',
            fechaHasta: '2026-12-31',
            periodosHistoricos: periodosMockHist
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.modoCalculo, 'CRONOLOGICO_EXACTO_HISTORIAL');
        assert.strictEqual(res.esCalculoEstimado, false);
        assert.strictEqual(res.situacionProyectada.nuevoSalarioPromedio, 1126.00);
        assert.strictEqual(res.detallesVentana.diasProyectadosEnVentana, 365);
        assert.strictEqual(res.detallesVentana.diasHistoricosEnVentana, 1385);
        assert.strictEqual(res.detallesVentana.totalDiasVentana, 1750);
        assert(res.situacionProyectada.pensionMensual > res.situacionActual.pensionMensual);
    });

    test('2.5 Modo de Respaldo/Estimado cuando no hay historial registrado', () => {
        const res = calculatePensionProjection({
            semanasActuales: 1000,
            salarioPromedioActual: 1000,
            salarioDiarioProyectado: 2000,
            salarioMinimoActual: 315.04,
            fechaDesde: '2026-01-01',
            fechaHasta: '2026-12-31',
            periodosHistoricos: null
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.modoCalculo, 'ESTIMADO_SIN_HISTORIAL');
        assert.strictEqual(res.esCalculoEstimado, true);
        // (365 * 2000 + 1385 * 1000) / 1750 = 2,115,000 / 1750 = 1208.57
        assert.strictEqual(res.situacionProyectada.nuevoSalarioPromedio, 1208.57);
    });

    console.log('\n--- FASE 3: Persistencia Transaccional y Reemplazo Total en Base de Datos ---');

    // Usaremos un usuario de prueba con ID reservado para test
    const testUserId = 7; // Arturito

    await testAsync('3.1 Inserción de periodos simula primer guardado transaccional', async () => {
        await db.beginTransaction();
        await db.query('DELETE FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
        for (const p of periodosMockHist) {
            await db.query(
                'INSERT INTO usuario_periodos_imss (usuario_id, patron, fecha_desde, fecha_hasta, salario, dias) VALUES (?, ?, ?, ?, ?, ?)',
                [testUserId, p.patron, p.fechaDesde, p.fechaHasta, p.salario, p.dias]
            );
        }
        await db.commit();

        const [rows] = await db.query('SELECT * FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
        assert.strictEqual(rows.length, 2, 'Debe haber guardado 2 periodos');
    });

    await testAsync('3.2 Reemplazo transaccional total ante nueva carga (elimina historial viejo)', async () => {
        const nuevosPeriodos = [
            { patron: 'NUEVO PATRON UNICO', fechaDesde: '2024-01-01', fechaHasta: '2025-12-31', salario: 1800, dias: 731 }
        ];

        await db.beginTransaction();
        await db.query('DELETE FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
        for (const p of nuevosPeriodos) {
            await db.query(
                'INSERT INTO usuario_periodos_imss (usuario_id, patron, fecha_desde, fecha_hasta, salario, dias) VALUES (?, ?, ?, ?, ?, ?)',
                [testUserId, p.patron, p.fechaDesde, p.fechaHasta, p.salario, p.dias]
            );
        }
        await db.commit();

        const [rows] = await db.query('SELECT * FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
        assert.strictEqual(rows.length, 1, 'Debe haber exactamente 1 periodo nuevo');
        assert.strictEqual(rows[0].patron, 'NUEVO PATRON UNICO');
        assert.strictEqual(parseFloat(rows[0].salario), 1800);
    });

    await testAsync('3.3 Rollback efectivo: error durante guardado no deja registros huérfanos', async () => {
        const [beforeRows] = await db.query('SELECT * FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);

        try {
            await db.beginTransaction();
            await db.query('DELETE FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
            // Forzar error: insertar null en columna NOT NULL
            await db.query('INSERT INTO usuario_periodos_imss (usuario_id, fecha_desde) VALUES (?, NULL)', [testUserId]);
            await db.commit();
        } catch (e) {
            await db.rollback();
        }

        const [afterRows] = await db.query('SELECT * FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
        assert.strictEqual(afterRows.length, beforeRows.length, 'El rollback conservó el estado anterior intacto');
    });

    // Limpieza de datos de prueba
    await db.query('DELETE FROM usuario_periodos_imss WHERE usuario_id = ?', [testUserId]);
    await db.end();

    console.log('\n================================================================================');
    console.log(`RESUMEN: ${passed} PRUEBAS PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTests().catch(err => {
    console.error('Error no capturado:', err);
    process.exit(1);
});
