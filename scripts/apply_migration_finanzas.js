const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        multipleStatements: true,
        dateStrings: true
    });

    console.log('--- Iniciando Migración: Finanzas y Simulador de Inversiones ---');

    // 1. Ejecutar DDL y permisos
    const ddlPath = path.join(__dirname, '..', 'migrations', '20261121_add_finanzas_simulador.sql');
    const ddlSql = fs.readFileSync(ddlPath, 'utf8');
    await conn.query(ddlSql);
    console.log('✓ Tablas institucionales y permisos RBAC creados/verificados.');

    // 2. Ejecutar catálogo base
    const seedPath = path.join(__dirname, '..', 'migrations', '20261121_seed_finanzas_simulador.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await conn.query(seedSql);
    console.log('✓ Instituciones base insertadas/verificadas.');

    // 3. Configurar Esquemas y Tramos iniciales de forma idempotente
    const institucionesConfig = [
        {
            nombre: 'NU',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: 25000.00, tasa: 13.0000, desc: 'Saldo hasta $25,000' },
                { numero: 2, inf: 25000.00, sup: null, tasa: 6.5000, desc: 'Excedente > $25,000' }
            ]
        },
        {
            nombre: 'Openbank',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: 30000.00, tasa: 13.0000, desc: 'Saldo hasta $30,000' },
                { numero: 2, inf: 30000.00, sup: 100000.00, tasa: 7.0000, desc: 'De $30,000 a $100,000' },
                { numero: 3, inf: 100000.00, sup: null, tasa: 6.5000, desc: 'Excedente > $100,000' }
            ]
        },
        {
            nombre: 'Mifel',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: null, tasa: 11.5000, desc: 'Saldo total' }
            ]
        },
        {
            nombre: 'Revolut',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: null, tasa: 10.0000, desc: 'Saldo total' }
            ]
        },
        {
            nombre: 'Uala',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: 50000.00, tasa: 14.0000, desc: 'Saldo hasta $50,000' },
                { numero: 2, inf: 50000.00, sup: null, tasa: 0.0000, desc: 'Excedente > $50,000 (Sin rendimiento)' }
            ]
        },
        {
            nombre: 'Klar',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: null, tasa: 11.0000, desc: 'Saldo total' }
            ]
        },
        {
            nombre: 'Didi',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: null, tasa: 12.0000, desc: 'Saldo total' }
            ]
        },
        {
            nombre: 'Finsus',
            esquema: 'Vigente 2026',
            fecha_inicio: '2026-01-01',
            fecha_fin: null,
            tramos: [
                { numero: 1, inf: 0.00, sup: null, tasa: 13.1200, desc: 'Saldo total' }
            ]
        }
    ];

    for (const inst of institucionesConfig) {
        const [rows] = await conn.query('SELECT id FROM instituciones_financieras WHERE nombre = ?', [inst.nombre]);
        if (rows.length === 0) continue;
        const instId = rows[0].id;

        // Verificar si ya tiene esquema vigente
        const [esquemas] = await conn.query(
            'SELECT id FROM institucion_esquemas_tasas WHERE institucion_id = ? AND nombre_esquema = ?',
            [instId, inst.esquema]
        );

        let esquemaId;
        if (esquemas.length === 0) {
            const [resEsquema] = await conn.query(
                'INSERT INTO institucion_esquemas_tasas (institucion_id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo) VALUES (?, ?, ?, ?, 1)',
                [instId, inst.esquema, inst.fecha_inicio, inst.fecha_fin]
            );
            esquemaId = resEsquema.insertId;
            console.log(`+ Creado esquema '${inst.esquema}' para ${inst.nombre} (ID: ${esquemaId})`);
        } else {
            esquemaId = esquemas[0].id;
        }

        // Tramos para el esquema
        for (const t of inst.tramos) {
            const [tramosExist] = await conn.query(
                'SELECT id FROM institucion_tramos_tasas WHERE esquema_id = ? AND numero_tramo = ?',
                [esquemaId, t.numero]
            );
            if (tramosExist.length === 0) {
                await conn.query(
                    'INSERT INTO institucion_tramos_tasas (esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo) VALUES (?, ?, ?, ?, ?, ?)',
                    [esquemaId, t.numero, t.inf, t.sup, t.tasa, t.desc]
                );
                console.log(`  + Tramo ${t.numero}: [${t.inf} - ${t.sup || '∞'}] @ ${t.tasa}%`);
            }
        }
    }

    // Verificar resultado general
    const [instTotal] = await conn.query('SELECT COUNT(*) as total FROM instituciones_financieras');
    const [esqTotal] = await conn.query('SELECT COUNT(*) as total FROM institucion_esquemas_tasas');
    const [tramTotal] = await conn.query('SELECT COUNT(*) as total FROM institucion_tramos_tasas');
    const [permTotal] = await conn.query("SELECT COUNT(*) as total FROM permisos WHERE codigo LIKE 'finanzas.%'");

    console.log('\n--- Resumen de Migración ---');
    console.log(`Instituciones: ${instTotal[0].total}`);
    console.log(`Esquemas: ${esqTotal[0].total}`);
    console.log(`Tramos: ${tramTotal[0].total}`);
    console.log(`Permisos Finanzas: ${permTotal[0].total}`);
    console.log('✓ Migración completada exitosamente.');

    await conn.end();
}

runMigration().catch(err => {
    console.error('Error durante la migración:', err);
    process.exit(1);
});
