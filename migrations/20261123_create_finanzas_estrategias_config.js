const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia'
    });

    const createTableSql = `
    CREATE TABLE IF NOT EXISTS finanzas_estrategias_config (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(50) NOT NULL UNIQUE,
        nombre VARCHAR(100) NOT NULL,
        color VARCHAR(20) NOT NULL DEFAULT '#16a34a',
        icono VARCHAR(50) NOT NULL DEFAULT 'fas fa-chart-line',
        max_concentracion_inst DECIMAL(5,2) NOT NULL,
        min_instituciones INT UNSIGNED DEFAULT 1,
        max_concentracion_tipo DECIMAL(5,2) NULL,
        diversificar_tipos TINYINT(1) DEFAULT 0,
        asignacion_minima_viable DECIMAL(12,2) DEFAULT 1000.00,
        descripcion_criterio TEXT NOT NULL,
        orden_visual INT DEFAULT 1,
        activo TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await conn.query(createTableSql);
    console.log('✓ Tabla finanzas_estrategias_config creada o ya existente.');

    const [rows] = await conn.query('SELECT codigo FROM finanzas_estrategias_config');
    const existing = new Set(rows.map(r => r.codigo));

    const seeds = [
        {
            codigo: 'maximo_rendimiento',
            nombre: 'Máximo rendimiento',
            color: '#16a34a',
            icono: 'fas fa-trophy',
            max_concentracion_inst: 100.00,
            min_instituciones: 1,
            max_concentracion_tipo: null,
            diversificar_tipos: 0,
            asignacion_minima_viable: 1000.00,
            descripcion_criterio: 'Se priorizaron las instituciones con mayor rendimiento estimado, permitiendo una mayor concentración del capital dentro de los límites configurados y respetando tramos y restricciones.',
            orden_visual: 1
        },
        {
            codigo: 'equilibrada',
            nombre: 'Equilibrada',
            color: '#2563eb',
            icono: 'fas fa-balance-scale',
            max_concentracion_inst: 40.00,
            min_instituciones: 3,
            max_concentracion_tipo: 60.00,
            diversificar_tipos: 1,
            asignacion_minima_viable: 2000.00,
            descripcion_criterio: 'Se buscó un equilibrio entre rendimiento y diversificación, limitando la concentración por institución al 40% y procurando variedad entre tipos de instituciones (Bancos, Sofipos y Fintechs).',
            orden_visual: 2
        },
        {
            codigo: 'conservadora',
            nombre: 'Conservadora',
            color: '#d97706',
            icono: 'fas fa-shield-alt',
            max_concentracion_inst: 25.00,
            min_instituciones: 4,
            max_concentracion_tipo: 40.00,
            diversificar_tipos: 1,
            asignacion_minima_viable: 2000.00,
            descripcion_criterio: 'Se priorizó una mayor diversificación del capital y una menor concentración por institución (máximo 25%) y por sector, aceptando una posible reducción del rendimiento estimado en favor de una distribución más amplia.',
            orden_visual: 3
        }
    ];

    for (const s of seeds) {
        if (!existing.has(s.codigo)) {
            await conn.query(
                `INSERT INTO finanzas_estrategias_config 
                (codigo, nombre, color, icono, max_concentracion_inst, min_instituciones, max_concentracion_tipo, diversificar_tipos, asignacion_minima_viable, descripcion_criterio, orden_visual)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [s.codigo, s.nombre, s.color, s.icono, s.max_concentracion_inst, s.min_instituciones, s.max_concentracion_tipo, s.diversificar_tipos, s.asignacion_minima_viable, s.descripcion_criterio, s.orden_visual]
            );
            console.log('✓ Semilla insertada:', s.codigo);
        } else {
            console.log('• Registro ya existía:', s.codigo);
        }
    }

    const [all] = await conn.query('SELECT id, codigo, nombre, max_concentracion_inst, max_concentracion_tipo, min_instituciones FROM finanzas_estrategias_config');
    console.log('Registros en finanzas_estrategias_config:', all);

    await conn.end();
}

runMigration().catch(err => {
    console.error('Error en migración:', err);
    process.exit(1);
});
