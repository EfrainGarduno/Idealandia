const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
    console.log('--- Iniciando Migración: ai_contexto (Contexto de Idealita) ---');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        multipleStatements: true
    });

    try {
        const sqlPath = path.join(__dirname, '..', 'migrations', '20261123_create_ai_contexto.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await conn.query(sql);

        console.log('✓ Tabla ai_contexto creada/verificada.');
        console.log('✓ Permisos RBAC contexto.* creados y asignados al rol administrador.');
        console.log('✓ Semillas iniciales insertadas.');

        const [rows] = await conn.query('SELECT COUNT(*) as total FROM ai_contexto');
        console.log(`✓ Total de registros en ai_contexto: ${rows[0].total}`);

        await conn.end();
        console.log('--- Migración Finalizada con Éxito ---');
        process.exit(0);
    } catch (err) {
        console.error('Error aplicando migración ai_contexto:', err);
        await conn.end();
        process.exit(1);
    }
}

runMigration();
