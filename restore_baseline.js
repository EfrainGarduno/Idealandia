const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'MYnagualito.5@',
    database: process.env.DB_NAME || 'idealandia_dev'
  });

  await conn.query('UPDATE ideas SET estado = "en_desarrollo", version_actual = 1 WHERE id = 3');
  await conn.query('DELETE FROM idea_versiones WHERE idea_id = 3 AND numero_version > 1');
  await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "nueva_version"');

  const datos = JSON.stringify({
    version: 1,
    motivo: 'Migración inicial: consolidación de idea preexistente en desarrollo'
  });

  await conn.query(
    'INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos, fecha) VALUES (?, ?, ?, ?, ?, ?)',
    [
      3,
      2,
      'nueva_version',
      'Versión 1 consolidada formalmente',
      datos,
      '2026-10-01 03:06:25'
    ]
  );

  const [i] = await conn.query('SELECT count(*) as c FROM ideas');
  const [d] = await conn.query('SELECT count(*) as c FROM idea_desarrollo');
  const [v] = await conn.query('SELECT count(*) as c FROM idea_versiones');
  const [h] = await conn.query('SELECT count(*) as c FROM idea_historial');
  const [p] = await conn.query('SELECT count(*) as c FROM idea_propositos');
  const [c] = await conn.query('SELECT count(*) as c FROM idea_categorias');

  console.log('Restored DB Counts:', JSON.stringify({
    ideas: i[0].c,
    desarrollo: d[0].c,
    versiones: v[0].c,
    historial: h[0].c,
    propositos: p[0].c,
    categorias: c[0].c
  }));

  await conn.end();
})();
