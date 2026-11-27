const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        multipleStatements: true
    });

    console.log('Connected to MySQL. Applying migrations...');
    const sqlCreate = fs.readFileSync('migrations/20261126_create_pensiones_indicadores.sql', 'utf8');
    await conn.query(sqlCreate);
    const sqlSeed = fs.readFileSync('migrations/20261126_seed_pensiones_indicadores.sql', 'utf8');
    await conn.query(sqlSeed);
    console.log('Migrations executed successfully.');

    const [indicadores] = await conn.query("SELECT id, codigo, regimen, anio_referencia, valor, tipo_valor, fecha_vigencia_inicio, fecha_vigencia_fin FROM pensiones_indicadores ORDER BY anio_referencia ASC, codigo ASC");
    console.log('Seeded indicadores:', indicadores);

    const [tables] = await conn.query("SHOW TABLES LIKE 'pensiones_indicadores%'");
    console.log('Created tables:', tables);

    const [descIndicadores] = await conn.query("DESCRIBE pensiones_indicadores");
    console.log('Columns in pensiones_indicadores:', descIndicadores.map(c => c.Field));

    const [descHistorial] = await conn.query("DESCRIBE pensiones_indicadores_historial");
    console.log('Columns in pensiones_indicadores_historial:', descHistorial.map(c => c.Field));

    await conn.end();
}

run().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
