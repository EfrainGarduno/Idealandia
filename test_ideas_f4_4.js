const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app, IDEAS_TRANSICIONES_VALIDAS, isValidIdeaTransition } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.4 MÁQUINA DE ESTADOS Y VERSIÓN 1");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens para pruebas
  // User 2: Efrain (rol administrador -> tiene ideas.update, ideas.read, etc.)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene ideas.update)
  const tokenUser1003 = jwt.sign({ id: 1003, usuario: 'Liana', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const tempIdeaIds = [];

  try {
    // -------------------------------------------------------------------------
    // 0. VERIFICACIÓN PREVIA: Integridad de las 9 ideas reales
    // -------------------------------------------------------------------------
    const [realIdeasPre] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPre[0].c, 9, "Deben existir exactamente 9 ideas reales al inicio");
    console.log("✓ 0. Integridad inicial verificada: 9 ideas reales existentes.");

    // -------------------------------------------------------------------------
    // 1-3. Autenticación y RBAC
    // -------------------------------------------------------------------------
    const resUnauth = await request(app).put('/api/ideas/2/estado').send({ estado: 'en_desarrollo' });
    assert.strictEqual(resUnauth.status, 401, "Sin autenticación debe retornar 401");
    console.log("✓ 1. Petición no autenticada rechazada con 401.");

    const resNoPerm = await request(app)
      .put('/api/ideas/2/estado')
      .set('Authorization', `Bearer ${tokenUser1003}`)
      .send({ estado: 'en_desarrollo' });
    assert.strictEqual(resNoPerm.status, 403, "Usuario sin ideas.update debe retornar 403");
    assert.strictEqual(resNoPerm.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    console.log("✓ 2-3. Usuario sin ideas.update recibe 403 con mensaje amigable sin fugas internas.");

    // -------------------------------------------------------------------------
    // 4. Ownership / Anti-IDOR
    // -------------------------------------------------------------------------
    // Idea 1017 pertenece al usuario 7. Usuario 2 intenta modificar su estado.
    const resOtherUser = await request(app)
      .put('/api/ideas/1017/estado')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ estado: 'en_desarrollo' });
    assert.strictEqual(resOtherUser.status, 404, "Modificar idea ajena debe retornar 404 Not Found");
    assert.strictEqual(resOtherUser.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 4. Intento de modificar idea ajena protegido contra IDOR con 404 Not Found.");

    // -------------------------------------------------------------------------
    // Validación de ID estricto
    // -------------------------------------------------------------------------
    const invalidIds = ['abc', '1abc', '1.5', '0', '-1'];
    for (const inv of invalidIds) {
      const resInv = await request(app)
        .put(`/api/ideas/${inv}/estado`)
        .set('Authorization', `Bearer ${tokenUser2}`)
        .send({ estado: 'en_desarrollo' });
      assert.strictEqual(resInv.status, 400, `ID '${inv}' debe ser rechazado con 400`);
      assert.strictEqual(resInv.body.error, 'ID de idea inválido.');
    }
    console.log("✓ Validación estricta de ID numérico en PUT completada.");

    // -------------------------------------------------------------------------
    // Helper para crear idea temporal para pruebas
    // -------------------------------------------------------------------------
    async function createTempIdea(initialState = 'semilla', versionActual = 0, prob = 'Problema inicial', sol = 'Solución inicial') {
      const [resIns] = await conn.query(
        'INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [2, `Idea Temp ${Date.now()}_${Math.random().toString(36).substring(7)}`, 'Desc temp F4.4', initialState, 'privada', 'individual', versionActual]
      );
      const ideaId = resIns.insertId;
      tempIdeaIds.push(ideaId);

      await conn.query(
        'INSERT INTO idea_desarrollo (idea_id, problema, solucion, moneda) VALUES (?, ?, ?, ?)',
        [ideaId, prob, sol, 'MXN']
      );

      await conn.query(
        'INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos) VALUES (?, ?, ?, ?, ?)',
        [ideaId, 2, 'creacion', 'Idea temporal para test F4.4', JSON.stringify({ origen: 'test_f4_4' })]
      );

      return ideaId;
    }

    // -------------------------------------------------------------------------
    // 5 & 24-29. TRANSICIÓN ESPECIAL: semilla -> en_desarrollo (Creación de Versión 1)
    // -------------------------------------------------------------------------
    const ideaSemillaId = await createTempIdea('semilla', 0, 'Falta de movilidad', 'App de transporte');
    
    // Verificar estado inicial
    const [checkPre] = await conn.query('SELECT estado, version_actual FROM ideas WHERE id = ?', [ideaSemillaId]);
    assert.strictEqual(checkPre[0].estado, 'semilla');
    assert.strictEqual(checkPre[0].version_actual, 0);

    const resTrans1 = await request(app)
      .put(`/api/ideas/${ideaSemillaId}/estado`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        estado: 'en_desarrollo',
        motivo_cambio: 'Inicio de fase de desarrollo activo'
      });

    assert.strictEqual(resTrans1.status, 200);
    assert.strictEqual(resTrans1.body.estado_anterior, 'semilla');
    assert.strictEqual(resTrans1.body.nuevo_estado, 'en_desarrollo');
    assert.strictEqual(resTrans1.body.version_actual, 1);

    // Verificar en BD ideas
    const [checkPost] = await conn.query('SELECT estado, version_actual FROM ideas WHERE id = ?', [ideaSemillaId]);
    assert.strictEqual(checkPost[0].estado, 'en_desarrollo');
    assert.strictEqual(checkPost[0].version_actual, 1);

    // Verificar en BD idea_versiones (Versión 1 creada)
    const [versiones] = await conn.query('SELECT * FROM idea_versiones WHERE idea_id = ?', [ideaSemillaId]);
    assert.strictEqual(versiones.length, 1, "Debe existir exactamente 1 versión formal");
    assert.strictEqual(versiones[0].numero_version, 1, "El número de versión debe ser 1");
    assert.strictEqual(versiones[0].problema, 'Falta de movilidad', "Debe capturar snapshot del problema de idea_desarrollo");
    assert.strictEqual(versiones[0].solucion, 'App de transporte', "Debe capturar snapshot de la solucion de idea_desarrollo");
    assert.strictEqual(versiones[0].motivo_cambio, 'Inicio de fase de desarrollo activo');
    assert.strictEqual(versiones[0].usuario_id, 2);

    // Verificar historial (debe tener 'creacion', 'cambio_estado', 'nueva_version')
    const [hist] = await conn.query('SELECT tipo_evento, descripcion FROM idea_historial WHERE idea_id = ? ORDER BY id ASC', [ideaSemillaId]);
    const eventos = hist.map(h => h.tipo_evento);
    assert.ok(eventos.includes('cambio_estado'), "Historial debe contener cambio_estado");
    assert.ok(eventos.includes('nueva_version'), "Historial debe contener nueva_version");
    console.log("✓ 5 & 24-29. Transición semilla -> en_desarrollo crea automáticamente Versión 1 y actualiza version_actual=1.");

    // -------------------------------------------------------------------------
    // 30. Concurrencia / Idempotencia: una segunda solicitud a en_desarrollo no crea otra versión 1
    // -------------------------------------------------------------------------
    const resIdempotente = await request(app)
      .put(`/api/ideas/${ideaSemillaId}/estado`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ estado: 'en_desarrollo' });
    assert.strictEqual(resIdempotente.status, 200);

    const [versiones2] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones WHERE idea_id = ?', [ideaSemillaId]);
    assert.strictEqual(versiones2[0].c, 1, "No debe duplicarse la versión 1 ante solicitud repetida");
    console.log("✓ 30. Protección de concurrencia/idempotencia: no duplica versión 1.");

    // -------------------------------------------------------------------------
    // 32-33. Otras transiciones NO crean versiones formales y conservan version_actual
    // -------------------------------------------------------------------------
    // Transición en_desarrollo -> en_validacion
    const resEnVal = await request(app)
      .put(`/api/ideas/${ideaSemillaId}/estado`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ estado: 'en_validacion' });
    assert.strictEqual(resEnVal.status, 200);
    assert.strictEqual(resEnVal.body.version_actual, 1, "version_actual debe seguir siendo 1");

    const [versionesPostVal] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones WHERE idea_id = ?', [ideaSemillaId]);
    assert.strictEqual(versionesPostVal[0].c, 1, "Cambiar a en_validacion NO debe crear una nueva versión");
    console.log("✓ 32-33. Transiciones posteriores NO crean versiones formales y preservan version_actual=1.");

    // -------------------------------------------------------------------------
    // 6-18. BATERÍA COMPLETA DE TRANSICIONES OFICIALES VÁLIDAS
    // -------------------------------------------------------------------------
    // 6. semilla -> archivada
    const idSemillaArch = await createTempIdea('semilla', 0);
    const r6 = await request(app).put(`/api/ideas/${idSemillaArch}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'archivada' });
    assert.strictEqual(r6.status, 200, "semilla -> archivada debe ser exitosa");

    // 7. en_desarrollo -> en_validacion (ya probado arriba con ideaSemillaId, pero probamos con idea limpia)
    const idEnDes = await createTempIdea('en_desarrollo', 1);
    const r7 = await request(app).put(`/api/ideas/${idEnDes}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'en_validacion' });
    assert.strictEqual(r7.status, 200, "en_desarrollo -> en_validacion debe ser exitosa");

    // 8. en_desarrollo -> archivada
    const idEnDesArch = await createTempIdea('en_desarrollo', 1);
    const r8 = await request(app).put(`/api/ideas/${idEnDesArch}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'archivada' });
    assert.strictEqual(r8.status, 200, "en_desarrollo -> archivada debe ser exitosa");

    // 9. en_validacion -> en_desarrollo
    const idEnValDes = await createTempIdea('en_validacion', 1);
    const r9 = await request(app).put(`/api/ideas/${idEnValDes}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'en_desarrollo' });
    assert.strictEqual(r9.status, 200, "en_validacion -> en_desarrollo debe ser exitosa");

    // 10. en_validacion -> lista
    const idEnValLista = await createTempIdea('en_validacion', 1);
    const r10 = await request(app).put(`/api/ideas/${idEnValLista}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'lista' });
    assert.strictEqual(r10.status, 200, "en_validacion -> lista debe ser exitosa");

    // 11. en_validacion -> archivada
    const idEnValArch = await createTempIdea('en_validacion', 1);
    const r11 = await request(app).put(`/api/ideas/${idEnValArch}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'archivada' });
    assert.strictEqual(r11.status, 200, "en_validacion -> archivada debe ser exitosa");

    // 12. lista -> en_accion
    const idListaAccion = await createTempIdea('lista', 1);
    const r12 = await request(app).put(`/api/ideas/${idListaAccion}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'en_accion' });
    assert.strictEqual(r12.status, 200, "lista -> en_accion debe ser exitosa");

    // 13. lista -> en_desarrollo
    const idListaDes = await createTempIdea('lista', 1);
    const r13 = await request(app).put(`/api/ideas/${idListaDes}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'en_desarrollo' });
    assert.strictEqual(r13.status, 200, "lista -> en_desarrollo debe ser exitosa");

    // 14. lista -> archivada
    const idListaArch = await createTempIdea('lista', 1);
    const r14 = await request(app).put(`/api/ideas/${idListaArch}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'archivada' });
    assert.strictEqual(r14.status, 200, "lista -> archivada debe ser exitosa");

    // 15. en_accion -> realizada
    const idAccionReal = await createTempIdea('en_accion', 1);
    const r15 = await request(app).put(`/api/ideas/${idAccionReal}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'realizada' });
    assert.strictEqual(r15.status, 200, "en_accion -> realizada debe ser exitosa");

    // 16. en_accion -> en_desarrollo
    const idAccionDes = await createTempIdea('en_accion', 1);
    const r16 = await request(app).put(`/api/ideas/${idAccionDes}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'en_desarrollo' });
    assert.strictEqual(r16.status, 200, "en_accion -> en_desarrollo debe ser exitosa");

    // 17. en_accion -> archivada
    const idAccionArch = await createTempIdea('en_accion', 1);
    const r17 = await request(app).put(`/api/ideas/${idAccionArch}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'archivada' });
    assert.strictEqual(r17.status, 200, "en_accion -> archivada debe ser exitosa");

    // 18. realizada -> archivada
    const idRealArch = await createTempIdea('realizada', 1);
    const r18 = await request(app).put(`/api/ideas/${idRealArch}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'archivada' });
    assert.strictEqual(r18.status, 200, "realizada -> archivada debe ser exitosa");

    // Reactivación: archivada -> en_desarrollo
    const idArchDes = await createTempIdea('archivada', 1);
    const rArchDes = await request(app).put(`/api/ideas/${idArchDes}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'en_desarrollo' });
    assert.strictEqual(rArchDes.status, 200, "archivada -> en_desarrollo (reactivación) debe ser exitosa");

    console.log("✓ 6-18. Batería completa de 14 transiciones oficiales válidas ejecutada con 200 OK.");

    // -------------------------------------------------------------------------
    // 19-23. TRANSICIONES INVÁLIDAS / SALTOS ARBITRARIOS (DEBEN RECHAZARSE CON 400)
    // -------------------------------------------------------------------------
    // 19. semilla -> lista
    const idInv1 = await createTempIdea('semilla', 0);
    const rInv1 = await request(app).put(`/api/ideas/${idInv1}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'lista' });
    assert.strictEqual(rInv1.status, 400, "semilla -> lista debe ser rechazada con 400");

    // 20. semilla -> realizada
    const rInv2 = await request(app).put(`/api/ideas/${idInv1}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'realizada' });
    assert.strictEqual(rInv2.status, 400, "semilla -> realizada debe ser rechazada con 400");

    // 21. en_desarrollo -> realizada
    const idInv3 = await createTempIdea('en_desarrollo', 1);
    const rInv3 = await request(app).put(`/api/ideas/${idInv3}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'realizada' });
    assert.strictEqual(rInv3.status, 400, "en_desarrollo -> realizada debe ser rechazada con 400");

    // 22. en_validacion -> realizada
    const idInv4 = await createTempIdea('en_validacion', 1);
    const rInv4 = await request(app).put(`/api/ideas/${idInv4}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'realizada' });
    assert.strictEqual(rInv4.status, 400, "en_validacion -> realizada debe ser rechazada con 400");

    // 23. realizada -> en_desarrollo (no permitido directamente desde realizada)
    const idInv5 = await createTempIdea('realizada', 1);
    const rInv5 = await request(app).put(`/api/ideas/${idInv5}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'en_desarrollo' });
    assert.strictEqual(rInv5.status, 400, "realizada -> en_desarrollo debe ser rechazada con 400");

    // Estado inexistente / arbitrario
    const rInv6 = await request(app).put(`/api/ideas/${idInv1}/estado`).set('Authorization', `Bearer ${tokenUser2}`).send({ estado: 'estado_inventado' });
    assert.strictEqual(rInv6.status, 400, "Estado inventado debe ser rechazado con 400");

    console.log("✓ 19-23. Transiciones inválidas y saltos arbitrarios rechazados estrictamente con 400 Bad Request.");

    // -------------------------------------------------------------------------
    // 34-37. ARCHIVADO: comprobación de integridad y no destrucción
    // -------------------------------------------------------------------------
    const idParaArchivar = await createTempIdea('en_desarrollo', 1);
    // Insertar versión ficticia para comprobar persistencia
    await conn.query(
      'INSERT INTO idea_versiones (idea_id, numero_version, titulo, descripcion, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [idParaArchivar, 1, 'Version para archivar', 'Desc', 2]
    );

    const resArchivar = await request(app)
      .put(`/api/ideas/${idParaArchivar}/estado`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ estado: 'archivada' });
    assert.strictEqual(resArchivar.status, 200);

    // 34. La idea existe y su estado es archivada
    const [archCheck] = await conn.query('SELECT estado FROM ideas WHERE id = ?', [idParaArchivar]);
    assert.strictEqual(archCheck.length, 1, "Idea archivada no debe ser eliminada");
    assert.strictEqual(archCheck[0].estado, 'archivada');

    // 35. Conserva versiones
    const [archVersCheck] = await conn.query('SELECT id FROM idea_versiones WHERE idea_id = ?', [idParaArchivar]);
    assert.strictEqual(archVersCheck.length, 1, "Archivar no elimina versiones");

    // 36. Conserva idea_desarrollo
    const [archDesCheck] = await conn.query('SELECT idea_id FROM idea_desarrollo WHERE idea_id = ?', [idParaArchivar]);
    assert.strictEqual(archDesCheck.length, 1, "Archivar no elimina idea_desarrollo");

    // 37. Registra historial de archivado
    const [archHistCheck] = await conn.query('SELECT tipo_evento, descripcion FROM idea_historial WHERE idea_id = ? AND tipo_evento = "cambio_estado"', [idParaArchivar]);
    assert.ok(archHistCheck.length > 0, "Archivar registra evento en idea_historial");
    console.log("✓ 34-37. Comprobado que 'archivada' no destruye la idea, ni satélites, ni versiones, y registra historial.");

  } finally {
    // -------------------------------------------------------------------------
    // LIMPIEZA DE DATOS TEMPORALES
    // -------------------------------------------------------------------------
    if (tempIdeaIds.length > 0) {
      console.log(`\nLimpiando ${tempIdeaIds.length} ideas temporales creadas durante el test F4.4...`);
      for (const id of tempIdeaIds) {
        await conn.query('DELETE FROM ideas WHERE id = ?', [id]);
      }
      console.log("✓ Limpieza completada exitosamente.");
    }
    await conn.end();
  }

  // -------------------------------------------------------------------------
  // COMPROBACIÓN FINAL DE INTEGRIDAD: Exactamente 9 ideas reales intactas
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
  assert.strictEqual(realVersionesFinal[0].c, 1, "idea_versiones debe tener 1 registro (idea ID 3)");

  const [realHistorialFinal] = await connFinal.query('SELECT COUNT(*) as c FROM idea_historial');
  assert.strictEqual(realHistorialFinal[0].c, 11, "idea_historial debe tener 11 registros");

  const [idea3Final] = await connFinal.query('SELECT estado, version_actual FROM ideas WHERE id = 3');
  assert.strictEqual(idea3Final[0].estado, 'en_desarrollo', "Idea ID 3 debe continuar en 'en_desarrollo'");
  assert.strictEqual(idea3Final[0].version_actual, 1, "Idea ID 3 debe continuar con version_actual=1");

  await connFinal.end();

  console.log("✓ Integridad final comprobada: exactamente 9 ideas (8 semilla, 1 en_desarrollo con version_actual=1), 9 desarrollos, 1 versión y 11 historiales.");

  console.log("\n================================================================================");
  console.log("TODAS LAS PRUEBAS DE F4.4 PASARON EXITOSAMENTE (100% OK)");
  console.log("================================================================================");
  process.exit(0);
})();
