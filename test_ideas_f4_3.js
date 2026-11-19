const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.3 DELETE MÓDULO IDEAS");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens para pruebas
  // User 2: Efrain (rol administrador -> tiene ideas.delete, ideas.read, etc.)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene ideas.delete)
  const tokenUser1003 = jwt.sign({ id: 1003, usuario: 'Liana', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  // Lista de ideas temporales creadas para el test que deben ser limpiadas al final
  const tempIdeaIds = [];

  try {
    // -------------------------------------------------------------------------
    // 0. VERIFICACIÓN PREVIA: Las 9 ideas reales deben estar presentes intactas
    // -------------------------------------------------------------------------
    const [realIdeasPre] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPre[0].c, 9, "Deben existir exactamente 9 ideas reales antes del test");
    console.log("✓ 0. Integridad inicial comprobada: 9 ideas reales en base de datos.");

    // -------------------------------------------------------------------------
    // 1. DELETE /api/ideas/:id: No autenticado -> 401
    // -------------------------------------------------------------------------
    const resUnauth = await request(app).delete('/api/ideas/2');
    assert.strictEqual(resUnauth.status, 401, "Petición no autenticada debe retornar 401");
    console.log("✓ 1. Petición no autenticada rechazada con 401.");

    // -------------------------------------------------------------------------
    // 2. DELETE /api/ideas/:id: Sin permiso ideas.delete -> 403 con mensaje amigable
    // -------------------------------------------------------------------------
    const resNoPerm = await request(app)
      .delete('/api/ideas/2')
      .set('Authorization', `Bearer ${tokenUser1003}`);
    assert.strictEqual(resNoPerm.status, 403, "Usuario sin ideas.delete debe retornar 403");
    assert.strictEqual(resNoPerm.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    console.log("✓ 2. Usuario sin permiso ideas.delete rechazado con 403 y mensaje amigable.");

    // -------------------------------------------------------------------------
    // 3. Validación estricta de ID inválidos -> 400 Bad Request
    // -------------------------------------------------------------------------
    const invalidIds = ['abc', '1abc', '1.5', '0', '-1', 'null', 'undefined'];
    for (const inv of invalidIds) {
      const resInv = await request(app)
        .delete(`/api/ideas/${inv}`)
        .set('Authorization', `Bearer ${tokenUser2}`);
      assert.strictEqual(resInv.status, 400, `ID '${inv}' debe ser rechazado con 400`);
      assert.strictEqual(resInv.body.error, 'ID de idea inválido.');
    }
    console.log("✓ 3. IDs inválidos (abc, 1abc, 1.5, 0, -1, etc.) rechazados estrictamente con 400.");

    // -------------------------------------------------------------------------
    // 4. Intentar eliminar idea de otro usuario -> 404 (Anti-IDOR)
    // Idea 1017 pertenece al usuario 7 (Arturito). Usuario 2 (Efrain) intenta eliminarla.
    // -------------------------------------------------------------------------
    const resOtherUser = await request(app)
      .delete('/api/ideas/1017')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherUser.status, 404, "Idea de otro usuario debe retornar 404 Not Found");
    assert.strictEqual(resOtherUser.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 4. Intento de eliminar idea ajena protegido contra IDOR con 404 Not Found.");

    // -------------------------------------------------------------------------
    // 5. Intentar eliminar ID inexistente -> 404
    // -------------------------------------------------------------------------
    const resNonExistent = await request(app)
      .delete('/api/ideas/999999')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resNonExistent.status, 404);
    assert.strictEqual(resNonExistent.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 5. ID inexistente retorna 404 Not Found.");

    // -------------------------------------------------------------------------
    // 6. Rechazo de eliminación física sobre idea propia en 'en_desarrollo' (Idea ID 3)
    // -------------------------------------------------------------------------
    const resId3 = await request(app)
      .delete('/api/ideas/3')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resId3.status, 400, "Idea en_desarrollo debe rechazar DELETE con 400");
    assert.strictEqual(resId3.body.error, 'Solo las ideas en estado semilla pueden eliminarse.');
    console.log("✓ 6. Eliminación física de idea real en 'en_desarrollo' rechazada con 400 Bad Request.");

    // -------------------------------------------------------------------------
    // 7. Pruebas de rechazo en todos los demás estados avanzados utilizando ideas temporales
    // Creamos ideas temporales con usuario_id = 2 en cada estado avanzado
    // -------------------------------------------------------------------------
    const advancedStates = ['en_desarrollo', 'en_validacion', 'lista', 'en_accion', 'realizada', 'archivada'];
    for (const st of advancedStates) {
      const [resIns] = await conn.query(
        'INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [2, `Temp Test ${st}`, 'Desc test', st, 'privada', 'individual', 1]
      );
      const tempId = resIns.insertId;
      tempIdeaIds.push(tempId);

      const resDel = await request(app)
        .delete(`/api/ideas/${tempId}`)
        .set('Authorization', `Bearer ${tokenUser2}`);
      assert.strictEqual(resDel.status, 400, `Idea en estado '${st}' debe rechazar DELETE con 400`);
      assert.strictEqual(resDel.body.error, 'Solo las ideas en estado semilla pueden eliminarse.');
    }
    console.log("✓ 7. Eliminación física rechazada con 400 en todos los estados avanzados (en_desarrollo, en_validacion, lista, en_accion, realizada, archivada).");

    // -------------------------------------------------------------------------
    // 8. Eliminación física exitosa de idea propia en estado 'semilla'
    // Creamos una idea semilla temporal vía POST /api/ideas
    // -------------------------------------------------------------------------
    const resCreateSemilla = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        titulo: 'Idea Semilla Temporal para DELETE',
        descripcion: 'Será eliminada físicamente'
      });
    assert.strictEqual(resCreateSemilla.status, 201);
    const semillaId = resCreateSemilla.body.id;

    // Verificar que existen registros satélites antes del borrado
    const [desPre] = await conn.query('SELECT idea_id FROM idea_desarrollo WHERE idea_id = ?', [semillaId]);
    assert.strictEqual(desPre.length, 1, "idea_desarrollo debe existir antes de borrar");
    const [histPre] = await conn.query('SELECT idea_id FROM idea_historial WHERE idea_id = ?', [semillaId]);
    assert.strictEqual(histPre.length, 1, "idea_historial debe existir antes de borrar");

    // Ejecutar DELETE
    const resDeleteSemilla = await request(app)
      .delete(`/api/ideas/${semillaId}`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resDeleteSemilla.status, 200, "DELETE de semilla debe retornar 200 OK");
    assert.strictEqual(resDeleteSemilla.body.message, 'Idea eliminada correctamente.');
    console.log(`✓ 8. DELETE /api/ideas/${semillaId} exitoso (200 OK) para idea propia en 'semilla'.`);

    // -------------------------------------------------------------------------
    // 9. Verificar que la idea y sus satélites desaparecieron por ON DELETE CASCADE
    // -------------------------------------------------------------------------
    const [ideaCheck] = await conn.query('SELECT id FROM ideas WHERE id = ?', [semillaId]);
    assert.strictEqual(ideaCheck.length, 0, "La idea principal no debe existir");

    const [desPost] = await conn.query('SELECT idea_id FROM idea_desarrollo WHERE idea_id = ?', [semillaId]);
    assert.strictEqual(desPost.length, 0, "El registro de idea_desarrollo debe haberse eliminado en cascada");

    const [histPost] = await conn.query('SELECT idea_id FROM idea_historial WHERE idea_id = ?', [semillaId]);
    assert.strictEqual(histPost.length, 0, "El registro de idea_historial debe haberse eliminado en cascada");
    console.log("✓ 9. Confirmada eliminación física total y cascada automática de satélites por FK.");

  } finally {
    // -------------------------------------------------------------------------
    // LIMPIEZA DE DATOS TEMPORALES DEL TEST
    // -------------------------------------------------------------------------
    if (tempIdeaIds.length > 0) {
      console.log(`\nLimpiando ${tempIdeaIds.length} ideas temporales avanzadas del test...`);
      for (const id of tempIdeaIds) {
        await conn.query('DELETE FROM ideas WHERE id = ?', [id]);
      }
      console.log("✓ Limpieza completada.");
    }
    await conn.end();
  }

  // -------------------------------------------------------------------------
  // 10. COMPROBACIÓN FINAL DE INTEGRIDAD: 9 ideas reales intactas
  // -------------------------------------------------------------------------
  const connFinal = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  const [realIdeasFinal] = await connFinal.query('SELECT COUNT(*) as c FROM ideas');
  assert.strictEqual(realIdeasFinal[0].c, 9, "Las 9 ideas reales deben estar intactas");

  const [realDesarrolloFinal] = await connFinal.query('SELECT COUNT(*) as c FROM idea_desarrollo');
  assert.strictEqual(realDesarrolloFinal[0].c, 9, "idea_desarrollo debe tener 9 registros");

  const [realVersionesFinal] = await connFinal.query('SELECT COUNT(*) as c FROM idea_versiones');
  assert.strictEqual(realVersionesFinal[0].c, 1, "idea_versiones debe tener 1 registro");

  const [realHistorialFinal] = await connFinal.query('SELECT COUNT(*) as c FROM idea_historial');
  assert.strictEqual(realHistorialFinal[0].c, 11, "idea_historial debe tener 11 registros");
  await connFinal.end();

  console.log("✓ 10. Integridad final confirmada: exactamente 9 ideas, 9 desarrollos, 1 versión y 11 historiales.");

  console.log("\n================================================================================");
  console.log("TODAS LAS PRUEBAS DE F4.3 PASARON EXITOSAMENTE (100% OK)");
  console.log("================================================================================");
  process.exit(0);
})();
