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
        multipleStatements: true
    });
    console.log('Connected to MySQL. Running migration_asociados.sql...');
    const sqlPath = path.join(__dirname, '..', 'migration_asociados.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await conn.query(sql);
    console.log('Migration executed successfully.');

    // Verify servicios
    const [servicios] = await conn.query('SELECT * FROM servicios ORDER BY id');
    console.log('Servicios count:', servicios.length);
    console.log('Servicios:', servicios.map(s => ({ id: s.id, nombre: s.nombre, activo: s.activo })));

    // Verify role Asociado
    const [roles] = await conn.query("SELECT * FROM roles WHERE LOWER(nombre) = 'asociado'");
    console.log('Rol Asociado:', roles);

    // Verify permisos
    const [permisos] = await conn.query("SELECT p.codigo, r.nombre as rol FROM permisos p JOIN rol_permisos rp ON p.id = rp.permiso_id JOIN roles r ON rp.rol_id = r.id WHERE p.codigo LIKE 'asociados.%'");
    console.log('Permisos asignados:', permisos);

    // Verify JOIN between solicitudes_asociado and usuarios
    const [joinTest] = await conn.query('SELECT s.id, u.usuario FROM solicitudes_asociado s JOIN usuarios u ON s.usuario_id = u.id LIMIT 1');
    console.log('JOIN test succeeded (no collation conflict).');

    await conn.end();
}

runMigration().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
