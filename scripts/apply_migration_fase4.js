const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
    console.log('--- APLICANDO MIGRACIÓN FASE 4: TELEMETRÍA Y BLOQUEO MANUAL ---');
    const pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    });

    try {
        const sqlPath = path.join(__dirname, '../migrations/20261126_create_pensiones_sincronizaciones.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('1. Creando tabla pensiones_sincronizaciones...');
        await pool.query(sql);
        console.log('   [OK] Tabla pensiones_sincronizaciones lista.');

        console.log('2. Verificando columna bloqueo_actualizacion_automatica en pensiones_indicadores...');
        const [cols] = await pool.query(
            `SELECT COLUMN_NAME 
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pensiones_indicadores' AND COLUMN_NAME = 'bloqueo_actualizacion_automatica'`,
            [process.env.DB_NAME || 'idealandia']
        );

        if (cols.length === 0) {
            console.log('   Agregando columna bloqueo_actualizacion_automatica...');
            await pool.query(
                `ALTER TABLE pensiones_indicadores 
                 ADD COLUMN bloqueo_actualizacion_automatica TINYINT(1) NOT NULL DEFAULT 0 
                 AFTER activo`
            );
            console.log('   [OK] Columna bloqueo_actualizacion_automatica agregada.');
        } else {
            console.log('   [OK] Columna bloqueo_actualizacion_automatica ya existe.');
        }

        console.log('\n--- MIGRACIÓN FASE 4 APLICADA EXITOSAMENTE ---');
    } catch (err) {
        console.error('Error aplicando migración Fase 4:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
