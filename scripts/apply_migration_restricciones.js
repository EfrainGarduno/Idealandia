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

    console.log('--- Iniciando Migración: Restricciones de Instituciones Financieras ---');

    // 1. Ejecutar DDL
    const ddlPath = path.join(__dirname, '..', 'migrations', '20261122_add_institucion_restricciones.sql');
    const ddlSql = fs.readFileSync(ddlPath, 'utf8');
    await conn.query(ddlSql);
    console.log('✓ Tabla institucion_restricciones creada/verificada.');

    // 2. Normalizar nombre de Mercado Pago si existe como MercadoPago
    await conn.query("UPDATE instituciones_financieras SET nombre = 'Mercado Pago' WHERE nombre = 'MercadoPago'");

    // 3. Insertar restricciones iniciales (idempotente)
    // A) Mercado Pago -> "Requiere depósito de $3,000 mensuales."
    const [mpRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre IN ('Mercado Pago', 'MercadoPago') LIMIT 1");
    if (mpRows.length > 0) {
        const mpId = mpRows[0].id;
        const [existMp] = await conn.query("SELECT id FROM institucion_restricciones WHERE institucion_id = ? AND descripcion LIKE '%3,000%'", [mpId]);
        if (existMp.length === 0) {
            await conn.query(
                "INSERT INTO institucion_restricciones (institucion_id, descripcion, activo, orden) VALUES (?, 'Requiere depósito de $3,000 mensuales.', 1, 1)",
                [mpId]
            );
            console.log('✓ Restricción insertada para Mercado Pago.');
        } else {
            console.log('• Restricción para Mercado Pago ya existía.');
        }
    }

    // B) NU -> "Requiere al menos una compra al mes."
    const [nuRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre = 'NU' LIMIT 1");
    if (nuRows.length > 0) {
        const nuId = nuRows[0].id;
        const [existNu] = await conn.query("SELECT id FROM institucion_restricciones WHERE institucion_id = ? AND descripcion LIKE '%compra al mes%'", [nuId]);
        if (existNu.length === 0) {
            await conn.query(
                "INSERT INTO institucion_restricciones (institucion_id, descripcion, activo, orden) VALUES (?, 'Requiere al menos una compra al mes.', 1, 1)",
                [nuId]
            );
            console.log('✓ Restricción insertada para NU.');
        } else {
            console.log('• Restricción para NU ya existía.');
        }
    }

    const [totalRest] = await conn.query('SELECT COUNT(*) as total FROM institucion_restricciones');
    console.log(`Total de restricciones en BD: ${totalRest[0].total}`);
    await conn.end();
}

runMigration().catch(err => {
    console.error('Error ejecutando migración de restricciones:', err);
    process.exit(1);
});
