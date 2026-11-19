const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.2 GET/POST MÓDULO IDEAS");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Generar tokens válidos para pruebas basados en usuarios reales de idealandia_dev
  // User 2: Efrain (rol administrador -> tiene ideas.read y ideas.create)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene ideas.read ni ideas.create)
  const tokenUser1003 = jwt.sign({ id: 1003, usuario: 'Liana', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const createdIdeaIds = [];

  try {
    // -------------------------------------------------------------------------
    // 1. GET /api/ideas: Usuario no autenticado -> 401
    // -------------------------------------------------------------------------
    const resUnauth = await request(app).get('/api/ideas');
    assert.strictEqual(resUnauth.status, 401, "Petición no autenticada debe retornar 401");
    console.log("✓ 1. Petición sin token rechazada con 401 Unauthorized.");

    // -------------------------------------------------------------------------
    // 2. GET /api/ideas: Usuario sin permiso ideas.read -> 403 con mensaje amigable
    // -------------------------------------------------------------------------
    const resNoPerm = await request(app)
      .get('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser1003}`);
    assert.strictEqual(resNoPerm.status, 403, "Usuario sin ideas.read debe retornar 403");
    assert.strictEqual(resNoPerm.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    console.log("✓ 2. Usuario sin ideas.read recibe 403 con mensaje amigable sin filtrar nombres internos.");

    // -------------------------------------------------------------------------
    // 3. GET /api/ideas: Usuario autorizado (User 2) -> 200 y solo sus propias ideas
    // -------------------------------------------------------------------------
    const resUser2 = await request(app)
      .get('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resUser2.status, 200, "Usuario con ideas.read debe retornar 200");
    assert.ok(Array.isArray(resUser2.body.ideas), "La respuesta debe contener array de ideas");
    assert.ok(resUser2.body.ideas.length >= 3, "User 2 debe tener al menos sus 3 ideas iniciales");
    
    // Verificar que todas las ideas devueltas pertenecen a User 2 (Aislamiento)
    for (const idea of resUser2.body.ideas) {
      assert.strictEqual(idea.usuario_id, 2, "Todas las ideas listadas deben pertenecer exclusivamente al usuario 2");
      assert.ok('privacidad' in idea, "Debe contener columna privacidad");
      assert.ok('modalidad' in idea, "Debe contener columna modalidad");
      assert.ok('version_actual' in idea, "Debe contener columna version_actual");
      assert.ok('fecha_actualizacion' in idea, "Debe contener columna fecha_actualizacion");
    }
    console.log("✓ 3. Usuario con ideas.read lista sus propias ideas con columnas oficiales completas.");

    // -------------------------------------------------------------------------
    // 4. GET /api/ideas con filtro ?estado= y ?q=
    // -------------------------------------------------------------------------
    const resFiltro = await request(app)
      .get('/api/ideas?estado=en_desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resFiltro.status, 200);
    assert.ok(resFiltro.body.ideas.some(i => i.id === 3), "Filtro en_desarrollo debe incluir la idea ID 3");

    const resFiltroLegacy = await request(app)
      .get('/api/ideas?estado=en%20progreso')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resFiltroLegacy.status, 200);
    assert.ok(resFiltroLegacy.body.ideas.some(i => i.id === 3), "Filtro legado 'en progreso' debe mapear y devolver idea ID 3");
    console.log("✓ 4. Filtros opcionales ?estado= (oficial y legado) funcionan correctamente.");

    // -------------------------------------------------------------------------
    // 5. POST /api/ideas: Crear idea estándar en estado semilla
    // -------------------------------------------------------------------------
    const resCreate = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        titulo: 'Idea Test Automatizada F4.2',
        descripcion: 'Descripción de prueba para F4.2'
      });
    assert.strictEqual(resCreate.status, 201, "Creación válida debe retornar 201");
    assert.ok(resCreate.body.id, "Debe devolver id de la nueva idea");
    assert.strictEqual(resCreate.body.estado, 'semilla', "La nueva idea nace como semilla");
    assert.strictEqual(resCreate.body.privacidad, 'privada', "La nueva idea nace como privada");
    assert.strictEqual(resCreate.body.modalidad, 'individual', "La nueva idea nace como individual");
    assert.strictEqual(resCreate.body.version_actual, 0, "version_actual debe iniciar en 0");

    const newIdeaId = resCreate.body.id;
    createdIdeaIds.push(newIdeaId);
    console.log(`✓ 5. POST /api/ideas crea idea ${newIdeaId} en 'semilla', 'privada', 'individual', version_actual=0.`);

    // -------------------------------------------------------------------------
    // 6. Verificar persistencia de satélites en BD: idea_desarrollo e idea_historial
    // -------------------------------------------------------------------------
    const [desRows] = await conn.query('SELECT idea_id, moneda FROM idea_desarrollo WHERE idea_id = ?', [newIdeaId]);
    assert.strictEqual(desRows.length, 1, "Debe existir registro 1:1 en idea_desarrollo");
    assert.strictEqual(desRows[0].moneda, 'MXN', "Moneda por defecto debe ser MXN");
    console.log("✓ 6. Registro 1:1 en idea_desarrollo confirmado en BD.");

    const [histRows] = await conn.query('SELECT idea_id, tipo_evento, descripcion FROM idea_historial WHERE idea_id = ?', [newIdeaId]);
    assert.strictEqual(histRows.length, 1, "Debe existir registro inicial en idea_historial");
    assert.strictEqual(histRows[0].tipo_evento, 'creacion', "Tipo de evento debe ser 'creacion'");
    console.log("✓ 7. Registro de auditoría en idea_historial confirmado en BD.");

    // -------------------------------------------------------------------------
    // 7. Verificar que NO se creó registro en idea_versiones
    // -------------------------------------------------------------------------
    const [verRows] = await conn.query('SELECT id FROM idea_versiones WHERE idea_id = ?', [newIdeaId]);
    assert.strictEqual(verRows.length, 0, "NO debe crearse registro en idea_versiones para una semilla");
    console.log("✓ 8. Confirmado que no existe ningún registro en idea_versiones para la semilla.");

    // -------------------------------------------------------------------------
    // 8. POST con alias temporal 'pendiente' -> se guarda como 'semilla'
    // -------------------------------------------------------------------------
    const resCreateLegacy = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        titulo: 'Idea con alias pendiente F4.2',
        estado: 'pendiente'
      });
    assert.strictEqual(resCreateLegacy.status, 201);
    assert.strictEqual(resCreateLegacy.body.estado, 'semilla', "Alias 'pendiente' debe traducirse a 'semilla'");
    createdIdeaIds.push(resCreateLegacy.body.id);
    console.log("✓ 9. Alias temporal 'pendiente' aceptado y almacenado correctamente como 'semilla'.");

    // -------------------------------------------------------------------------
    // 9. Rechazo de creación directa en estados posteriores
    // -------------------------------------------------------------------------
    const forbiddenStates = ['en_desarrollo', 'en_validacion', 'lista', 'en_accion', 'realizada', 'archivada', 'en progreso', 'completada'];
    for (const st of forbiddenStates) {
      const resForbidden = await request(app)
        .post('/api/ideas')
        .set('Authorization', `Bearer ${tokenUser2}`)
        .send({
          titulo: `Idea intento ${st}`,
          estado: st
        });
      assert.strictEqual(resForbidden.status, 400, `Crear en estado '${st}' debe ser rechazado con 400`);
      assert.strictEqual(resForbidden.body.error, 'Toda nueva idea debe iniciar en estado semilla.');
    }
    console.log("✓ 10. Creación directa en estados avanzados rechazada tajantemente con 400 Bad Request.");

    // -------------------------------------------------------------------------
    // 10. Rechazo de estados inválidos
    // -------------------------------------------------------------------------
    const resInvalidState = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        titulo: 'Idea estado invalido',
        estado: 'estado_inexistente_xyz'
      });
    assert.strictEqual(resInvalidState.status, 400);
    assert.strictEqual(resInvalidState.body.error, 'Toda nueva idea debe iniciar en estado semilla.');
    console.log("✓ 11. Estados no reconocidos rechazados con 400 Bad Request.");

    // -------------------------------------------------------------------------
    // 11. Validación de privacidad cerrada
    // -------------------------------------------------------------------------
    const resInvalidPriv = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        titulo: 'Idea privacidad invalida',
        privacidad: 'secreta'
      });
    assert.strictEqual(resInvalidPriv.status, 400);
    assert.strictEqual(resInvalidPriv.body.error, 'Valor de privacidad inválido.');
    console.log("✓ 12. Catálogo cerrado de privacidad validado con 400 Bad Request.");

    // -------------------------------------------------------------------------
    // 12. Validación de modalidad cerrada
    // -------------------------------------------------------------------------
    const resInvalidMod = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        titulo: 'Idea modalidad invalida',
        modalidad: 'grupal'
      });
    assert.strictEqual(resInvalidMod.status, 400);
    assert.strictEqual(resInvalidMod.body.error, 'Valor de modalidad inválido.');
    console.log("✓ 13. Catálogo cerrado de modalidad validado con 400 Bad Request.");

    // -------------------------------------------------------------------------
    // 13. Validación de título obligatorio y longitud
    // -------------------------------------------------------------------------
    const resNoTitle = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ titulo: '   ' });
    assert.strictEqual(resNoTitle.status, 400);

    const resLongTitle = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ titulo: 'a'.repeat(201) });
    assert.strictEqual(resLongTitle.status, 400);
    console.log("✓ 14. Título obligatorio y límite de 200 caracteres validados correctamente.");

    // -------------------------------------------------------------------------
    // 14. Usuario sin ideas.create -> 403
    // -------------------------------------------------------------------------
    const resNoCreate = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser1003}`)
      .send({ titulo: 'Idea no autorizada' });
    assert.strictEqual(resNoCreate.status, 403);
    assert.strictEqual(resNoCreate.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    console.log("✓ 15. Usuario sin permiso ideas.create rechazado con 403 y mensaje amigable.");

  } finally {
    // -------------------------------------------------------------------------
    // LIMPIEZA DE DATOS DE PRUEBA: Dejar la BD exactamente con sus 9 ideas
    // -------------------------------------------------------------------------
    if (createdIdeaIds.length > 0) {
      console.log(`\nLimpiando ${createdIdeaIds.length} ideas de prueba creadas durante el test...`);
      for (const id of createdIdeaIds) {
        await conn.query('DELETE FROM ideas WHERE id = ?', [id]);
      }
      console.log("✓ Ideas de prueba eliminadas. Limpieza en cascada completada.");
    }
    await conn.end();
  }

  console.log("\n================================================================================");
  console.log("TODAS LAS 15 PRUEBAS DE F4.2 PASARON EXITOSAMENTE (100% OK)");
  console.log("================================================================================");
  process.exit(0);
})();
