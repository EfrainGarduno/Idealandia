const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    // Check tables and get menus
    const [menus] = await pool.query(`SELECT * FROM menu_items ORDER BY parent_id, orden`);
    console.log(`\nMenu Items:`);
    console.table(menus);

    const [permisos] = await pool.query(`SELECT * FROM permisos`);
    console.log(`\nPermisos:`);
    console.table(permisos);

    const [funcionalidades] = await pool.query(`SELECT * FROM funcionalidades`);
    console.log(`\nFuncionalidades:`);
    console.table(funcionalidades);

    process.exit();
}
run();
