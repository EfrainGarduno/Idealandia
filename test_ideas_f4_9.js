const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.9 HISTORIAL Y TRAZABILIDAD DE IDEAS");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens para pruebas
  // User 2: Efrain (rol administrador -> tiene funcionalidad ideas y permiso ideas.read)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene funcionalidad ideas ni permiso ideas.read)
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
    // 0. VERIFICACIÓN PREVIA: Integridad inicial de la base de datos
    // -------------------------------------------------------------------------
    const [realIdeasPre] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPre[0].c, 9, "Deben existir exactamente 9 ideas reales al inicio");

    const [realDesPre] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesPre[0].c, 9, "Deben existir exactamente 9 registros en idea_desarrollo");

    const [realVerPre] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerPre[0].c, 1, "Deben existir exactamente 1 registro en idea_versiones");

    const [realHistPre] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistPre[0].c, 11, "Deben existir exactamente 11 registros en idea_historial");

    console.log("✓ 0. Integridad previa de base de datos verificada al 100% (11 eventos legítimos).");

    // -------------------------------------------------------------------------
    // 1. Autenticación: Sin token -> 401
    // -------------------------------------------------------------------------
    const resUnauth = await request(app).get('/api/ideas/3/historial');
    assert.strictEqual(resUnauth.status, 401, "Petición sin token debe retornar 401");
    console.log("✓ 1. Petición no autenticada rechazada con 401.");

    // -------------------------------------------------------------------------
    // 2-4. RBAC: Usuario sin permiso -> 403, mensaje amigable sin fugas
    // -------------------------------------------------------------------------
    const resNoPerm = await request(app)
      .get('/api/ideas/3/historial')
      .set('Authorization', `Bearer ${tokenUser1003}`);
    assert.strictEqual(resNoPerm.status, 403, "Usuario sin ideas.read debe retornar 403");
    assert.strictEqual(resNoPerm.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    assert.ok(!resNoPerm.body.error.includes('ideas.read'), "No debe exponer permiso interno");
    console.log("✓ 2-4. RBAC validado: responde 403 amigable sin exponer detalles técnicos.");

    // -------------------------------------------------------------------------
    // 5-9. Validación estricta de ID numérico
    // -------------------------------------------------------------------------
    const badIds = ['abc', '1abc', '1.5', '0', '-1'];
    for (const badId of badIds) {
      const resBad = await request(app)
        .get(`/api/ideas/${badId}/historial`)
        .set('Authorization', `Bearer ${tokenUser2}`);
      assert.strictEqual(resBad.status, 400, `ID '${badId}' debe responder 400 Bad Request`);
      assert.strictEqual(resBad.body.error, 'ID de idea inválido.');
    }
    console.log("✓ 5-9. Validación estricta de ID: 'abc', '1abc', '1.5', '0', '-1' rechazados con 400.");

    // -------------------------------------------------------------------------
    // 10. Existencia: ID válido inexistente -> 404
    // -------------------------------------------------------------------------
    const resNotExist = await request(app)
      .get('/api/ideas/999999/historial')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resNotExist.status, 404, "ID inexistente debe responder 404 Not Found");
    assert.strictEqual(resNotExist.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 10. ID inexistente retorna 404 Not Found.");

    // -------------------------------------------------------------------------
    // 11-15. Ownership, Privacidad y Anti-IDOR
    // -------------------------------------------------------------------------
    // 11. Propietario consulta historial de su Idea privada (Idea 3 pertenece a User 2) -> 200 OK
    const resOwnPriv = await request(app)
      .get('/api/ideas/3/historial')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOwnPriv.status, 200, "Propietario debe poder consultar el historial de su idea privada");
    assert.strictEqual(resOwnPriv.body.idea_id, 3);
    assert.ok(Array.isArray(resOwnPriv.body.historial), "historial debe ser un arreglo");

    // 12. Tercero consulta Idea privada ajena (Idea 1017 de User 7; User 2 intenta consultar) -> 404
    const resOtherPriv = await request(app)
      .get('/api/ideas/1017/historial')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherPriv.status, 404, "Historial de idea privada ajena debe responder 404 Not Found");
    assert.strictEqual(resOtherPriv.body.error, 'Idea no encontrada o no autorizada.');
    assert.strictEqual(resOtherPriv.body.historial, undefined, "No debe exponer contenido en 404");

    // Crear ideas temporales para probar compartida y pública
    // Temp 1: Compartida de User 7
    const [resTempComp] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'en_desarrollo', 'compartida', 'colaborativa', 1)",
      [7, 'Temp Compartida User 7', 'Desc']
    );
    const tempCompId = resTempComp.insertId;
    tempIdeaIds.push(tempCompId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempCompId]);
    await conn.execute("INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos) VALUES (?, 7, 'creacion', 'Idea compartida temp creada', ?)", [tempCompId, JSON.stringify({ temp: true })]);

    // 13. Tercero consulta Idea compartida ajena -> 404 (sin acceso en esta fase)
    const resOtherComp = await request(app)
      .get(`/api/ideas/${tempCompId}/historial`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherComp.status, 404, "Historial de idea compartida ajena debe responder 404");

    // Temp 2: Pública de User 7
    const [resTempPub] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'en_desarrollo', 'publica', 'individual', 1)",
      [7, 'Temp Publica User 7', 'Desc']
    );
    const tempPubId = resTempPub.insertId;
    tempIdeaIds.push(tempPubId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempPubId]);
    await conn.execute("INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos) VALUES (?, 7, 'creacion', 'Idea publica temp creada', ?)", [tempPubId, JSON.stringify({ temp: true })]);

    // 14. Usuario autorizado con ideas.read consulta Idea pública ajena -> 200 OK
    const resOtherPub = await request(app)
      .get(`/api/ideas/${tempPubId}/historial`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherPub.status, 200, "Usuario con ideas.read puede consultar historial de idea pública ajena");
    assert.strictEqual(resOtherPub.body.idea_id, tempPubId);
    assert.strictEqual(resOtherPub.body.total_eventos, 1);

    // Temp 3: Pública propia de User 2
    const [resTempPubUser2] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'en_desarrollo', 'publica', 'individual', 1)",
      [2, 'Temp Publica User 2', 'Desc']
    );
    const tempPubUser2Id = resTempPubUser2.insertId;
    tempIdeaIds.push(tempPubUser2Id);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempPubUser2Id]);
    await conn.execute("INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos) VALUES (?, 2, 'creacion', 'Idea publica propia creada', ?)", [tempPubUser2Id, JSON.stringify({ temp: true })]);

    // 15. Propietario consulta Idea pública propia -> 200 OK
    const resOwnPub = await request(app)
      .get(`/api/ideas/${tempPubUser2Id}/historial`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOwnPub.status, 200, "Propietario puede consultar historial de su idea pública");

    console.log("✓ 11-15. Ownership, privacidad y anti-IDOR validados: privada (200/404), compartida (404), pública (200).");

    // -------------------------------------------------------------------------
    // 16-20. Verificación exhaustiva de eventos históricos de Idea 3
    // -------------------------------------------------------------------------
    const historial3 = resOwnPriv.body.historial;
    assert.strictEqual(historial3.length, 3, "Idea 3 debe tener exactamente 3 eventos históricos legítimos");
    assert.strictEqual(resOwnPriv.body.total_eventos, 3);

    // Tipos de evento esperados en Idea 3: 'creacion', 'cambio_estado', 'nueva_version'
    const tiposEsperados = ['creacion', 'cambio_estado', 'nueva_version'];
    const tiposObtenidos = historial3.map(e => e.tipo_evento);
    assert.deepStrictEqual(tiposObtenidos, tiposEsperados, "Los tipos de evento de Idea 3 deben ser exactamente creacion, cambio_estado, nueva_version");

    // Comprobar campos de cada evento
    for (const ev of historial3) {
      assert.ok(ev.id > 0, "Cada evento debe tener id numérico");
      assert.strictEqual(ev.idea_id, 3, "idea_id debe ser 3");
      assert.strictEqual(ev.usuario_id, 2, "usuario_id debe ser 2");
      assert.ok(ev.descripcion && ev.descripcion.length > 0, "Debe tener descripcion");
      assert.ok(ev.fecha, "Debe tener fecha");
      assert.ok(typeof ev.datos === 'object' && ev.datos !== null, "datos debe devolverse como objeto JSON estructurado");
    }

    // Verificar datos específicos de los eventos de Idea 3
    assert.strictEqual(historial3[0].tipo_evento, 'creacion');
    assert.strictEqual(historial3[0].datos.origen, 'migracion_fase3');

    assert.strictEqual(historial3[1].tipo_evento, 'cambio_estado');
    assert.strictEqual(historial3[1].datos.estado_nuevo, 'en_desarrollo');

    assert.strictEqual(historial3[2].tipo_evento, 'nueva_version');
    assert.strictEqual(historial3[2].datos.version, 1);

    console.log("✓ 16-20. Eventos históricos de Idea 3 validados: 'creacion', 'cambio_estado', 'nueva_version' con datos JSON estructurados.");

    // -------------------------------------------------------------------------
    // 21-23. Verificación de evento 'actualizacion' y orden cronológico (fecha ASC, id ASC)
    // -------------------------------------------------------------------------
    // Crear una idea temporal de User 2 y actualizar su canvas con PUT /desarrollo
    const [resTempAct] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'en_desarrollo', 'privada', 'individual', 1)",
      [2, 'Temp Idea Actualizacion', 'Desc']
    );
    const tempActId = resTempAct.insertId;
    tempIdeaIds.push(tempActId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempActId]);
    await conn.execute(
      "INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos, fecha) VALUES (?, 2, 'creacion', 'Creación temp', ?, NOW() - INTERVAL 10 SECOND)",
      [tempActId, JSON.stringify({ origen: 'test' })]
    );

    // Actualizar canvas mediante PUT oficial
    const resPutDes = await request(app)
      .put(`/api/ideas/${tempActId}/desarrollo`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ problema: 'Problema actualizado', solucion: 'Solución actualizada' });
    assert.strictEqual(resPutDes.status, 200);

    // Consultar historial de la idea temporal
    const resHistAct = await request(app)
      .get(`/api/ideas/${tempActId}/historial`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resHistAct.status, 200);
    assert.strictEqual(resHistAct.body.total_eventos, 2);

    const eventosTemp = resHistAct.body.historial;
    assert.strictEqual(eventosTemp[0].tipo_evento, 'creacion');
    assert.strictEqual(eventosTemp[1].tipo_evento, 'actualizacion');
    assert.strictEqual(eventosTemp[1].descripcion, 'Actualización del canvas de desarrollo');
    assert.deepStrictEqual(eventosTemp[1].datos.campos_modificados, ['problema', 'solucion']);

    // Verificar orden cronológico: fecha de evento 0 <= fecha de evento 1
    const t0 = new Date(eventosTemp[0].fecha).getTime();
    const t1 = new Date(eventosTemp[1].fecha).getTime();
    assert.ok(t0 <= t1, "El historial debe ordenarse cronológicamente de forma ascendente");

    console.log("✓ 21-23. Evento 'actualizacion' y orden cronológico consistente (fecha ASC, id ASC) confirmados.");

    // -------------------------------------------------------------------------
    // 24-27. Integridad de solo lectura: la consulta NO modifica ninguna tabla ni crea eventos
    // -------------------------------------------------------------------------
    // Realizar 5 consultas consecutivas de lectura al historial
    for (let i = 0; i < 5; i++) {
      await request(app).get('/api/ideas/3/historial').set('Authorization', `Bearer ${tokenUser2}`);
    }

    // Verificar que los conteos no sufrieron ningún cambio por consultar el historial
    const [checkHistCount] = await conn.query('SELECT COUNT(*) as c FROM idea_historial WHERE idea_id = 3');
    assert.strictEqual(checkHistCount[0].c, 3, "Consultar el historial NO debe generar eventos de auditoría nuevos");

    console.log("✓ 24-27. Endpoint estrictamente de solo lectura: 0 efectos secundarios ni inserciones espurias.");

    // -------------------------------------------------------------------------
    // TEARDOWN / LIMPIEZA DE DATOS TEMPORALES
    // -------------------------------------------------------------------------
    for (const tid of tempIdeaIds) {
      await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]);
    }
    tempIdeaIds.length = 0;

    // -------------------------------------------------------------------------
    // Verificación final estricta de la base de datos real
    // -------------------------------------------------------------------------
    const [realIdeasFinal] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasFinal[0].c, 9, "Deben existir exactamente 9 ideas reales al final");

    const [realDesFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesFinal[0].c, 9, "idea_desarrollo debe permanecer en 9");

    const [realVerFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerFinal[0].c, 1, "idea_versiones debe permanecer exactamente en 1");

    const [realHistFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistFinal[0].c, 11, "idea_historial debe permanecer exactamente en 11 registros");

    const [realPropFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropFinal[0].c, 8, "idea_propositos debe seguir en 8");

    const [realPropRelFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_proposito_rel');
    assert.strictEqual(realPropRelFinal[0].c, 0, "idea_proposito_rel debe ser 0");

    const [realCatFinal] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatFinal[0].c, 0, "categorias_idea debe ser 0");

    const [realCatRelFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_categorias');
    assert.strictEqual(realCatRelFinal[0].c, 0, "idea_categorias debe ser 0");

    // Verificar que las 9 ideas reales están en su estado esperado
    const [realRows] = await conn.query('SELECT id, estado, version_actual FROM ideas ORDER BY id ASC');
    for (const r of realRows) {
      if (r.id === 3) {
        assert.strictEqual(r.estado, 'en_desarrollo', "Idea 3 debe seguir en 'en_desarrollo'");
        assert.strictEqual(r.version_actual, 1, "Idea 3 debe tener version_actual = 1");
      } else {
        assert.strictEqual(r.estado, 'semilla', `Idea ${r.id} debe seguir en 'semilla'`);
        assert.strictEqual(r.version_actual, 0, `Idea ${r.id} debe tener version_actual = 0`);
      }
    }

    console.log("✓ Estado final de base de datos restaurado y comprobado al 100%.");

    console.log("\n================================================================================");
    console.log("TODAS LAS PRUEBAS DE F4.9 PASARON SATISFACTORIAMENTE (27/27 PASS)");
    console.log("================================================================================");
    process.exit(0);

  } catch (err) {
    // Limpieza de emergencia
    for (const tid of tempIdeaIds) {
      try { await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]); } catch (_) {}
    }
    console.error("ERROR EN PRUEBAS F4.9:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
