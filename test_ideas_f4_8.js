const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.8 VERSIONAMIENTO FORMAL DE IDEAS");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens para pruebas
  // User 2: Efrain (rol administrador -> tiene ideas.read, ideas.update, etc.)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene acceso a ideas)
  const tokenUser1003 = jwt.sign({ id: 1003, usuario: 'Liana', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const tempIdeaIds = [];
  let originalIdea3Desarrollo = null;

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

    // Guardar estado original de Idea 3
    const [origIdea3Rows] = await conn.query('SELECT * FROM idea_desarrollo WHERE idea_id = 3');
    originalIdea3Desarrollo = { ...origIdea3Rows[0] };

    console.log("✓ 0. Integridad previa de base de datos verificada al 100%.");

    // -------------------------------------------------------------------------
    // 1-2. Autenticación (POST y GET)
    // -------------------------------------------------------------------------
    const resUnauthPost = await request(app).post('/api/ideas/3/versiones').send({ motivo_cambio: 'Test' });
    assert.strictEqual(resUnauthPost.status, 401, "POST sin token debe responder 401");

    const resUnauthGet = await request(app).get('/api/ideas/3/versiones');
    assert.strictEqual(resUnauthGet.status, 401, "GET sin token debe responder 401");
    console.log("✓ 1-2. Autenticación validada en POST y GET (401).");

    // -------------------------------------------------------------------------
    // 3-5. RBAC (POST y GET)
    // -------------------------------------------------------------------------
    const resNoPermPost = await request(app)
      .post('/api/ideas/3/versiones')
      .set('Authorization', `Bearer ${tokenUser1003}`)
      .send({ motivo_cambio: 'Test' });
    assert.strictEqual(resNoPermPost.status, 403, "POST sin ideas.update debe responder 403");
    assert.strictEqual(resNoPermPost.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    assert.ok(!resNoPermPost.body.error.includes('ideas.update'), "No debe exponer permiso interno");

    const resNoPermGet = await request(app)
      .get('/api/ideas/3/versiones')
      .set('Authorization', `Bearer ${tokenUser1003}`);
    assert.strictEqual(resNoPermGet.status, 403, "GET sin ideas.read debe responder 403");
    assert.strictEqual(resNoPermGet.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    assert.ok(!resNoPermGet.body.error.includes('ideas.read'), "No debe exponer permiso interno");
    console.log("✓ 3-5. RBAC validado: responde 403 amigable sin exponer permisos internos.");

    // -------------------------------------------------------------------------
    // 6-8. Validación estricta de ID numérico
    // -------------------------------------------------------------------------
    const badIds = ['abc', '1abc', '1.5', '0', '-1'];
    for (const badId of badIds) {
      const resBadPost = await request(app)
        .post(`/api/ideas/${badId}/versiones`)
        .set('Authorization', `Bearer ${tokenUser2}`)
        .send({ motivo_cambio: 'Test' });
      assert.strictEqual(resBadPost.status, 400, `POST con ID '${badId}' debe responder 400`);
      assert.strictEqual(resBadPost.body.error, 'ID de idea inválido.');

      const resBadGet = await request(app)
        .get(`/api/ideas/${badId}/versiones`)
        .set('Authorization', `Bearer ${tokenUser2}`);
      assert.strictEqual(resBadGet.status, 400, `GET con ID '${badId}' debe responder 400`);
      assert.strictEqual(resBadGet.body.error, 'ID de idea inválido.');
    }
    console.log("✓ 6-8. Validación estricta de ID numérico completada (400 en POST y GET).");

    // -------------------------------------------------------------------------
    // 9. Existencia: ID válido inexistente -> 404
    // -------------------------------------------------------------------------
    const resNotExistPost = await request(app)
      .post('/api/ideas/999999/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ motivo_cambio: 'Test' });
    assert.strictEqual(resNotExistPost.status, 404, "POST en ID inexistente retorna 404");

    const resNotExistGet = await request(app)
      .get('/api/ideas/999999/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resNotExistGet.status, 404, "GET en ID inexistente retorna 404");
    console.log("✓ 9. ID inexistente retorna 404 Not Found.");

    // -------------------------------------------------------------------------
    // 10-12. Restricción de Estados para creación de versiones
    // -------------------------------------------------------------------------
    // A. Idea en 'semilla' (Idea 2) -> 400
    const resSemilla = await request(app)
      .post('/api/ideas/2/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ motivo_cambio: 'Intento en semilla' });
    assert.strictEqual(resSemilla.status, 400, "No debe permitir crear versión en 'semilla'");
    assert.ok(resSemilla.body.error.includes("semilla"), "Mensaje debe indicar que 'semilla' no permite versiones");

    // Crear ideas temporales en 'realizada' y 'archivada' de User 2
    const [resRealizada] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'realizada', 'privada', 'individual', 1)",
      [2, 'Idea Temp Realizada', 'Desc']
    );
    const tempRealizadaId = resRealizada.insertId;
    tempIdeaIds.push(tempRealizadaId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempRealizadaId]);

    const resRealizadaPost = await request(app)
      .post(`/api/ideas/${tempRealizadaId}/versiones`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ motivo_cambio: 'Intento en realizada' });
    assert.strictEqual(resRealizadaPost.status, 400, "No debe permitir crear versión en 'realizada'");

    const [resArchivada] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'archivada', 'privada', 'individual', 1)",
      [2, 'Idea Temp Archivada', 'Desc']
    );
    const tempArchivadaId = resArchivada.insertId;
    tempIdeaIds.push(tempArchivadaId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempArchivadaId]);

    const resArchivadaPost = await request(app)
      .post(`/api/ideas/${tempArchivadaId}/versiones`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ motivo_cambio: 'Intento en archivada' });
    assert.strictEqual(resArchivadaPost.status, 400, "No debe permitir crear versión en 'archivada'");

    console.log("✓ 10-12. Restricción de estados comprobada: 'semilla', 'realizada' y 'archivada' rechazadas con 400.");

    // -------------------------------------------------------------------------
    // 13-14. Ownership y Anti-IDOR en POST
    // -------------------------------------------------------------------------
    // Idea 1017 pertenece a User 7. User 2 intenta crear versión formal -> 404
    const resOtherPost = await request(app)
      .post('/api/ideas/1017/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ motivo_cambio: 'Intento IDOR' });
    assert.strictEqual(resOtherPost.status, 404, "Creación de versión en idea ajena debe responder 404");
    assert.strictEqual(resOtherPost.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 13-14. Anti-IDOR en POST: idea ajena retorna 404 Not Found.");

    // -------------------------------------------------------------------------
    // 15-18. Privacidad y Ownership en GET /api/ideas/:id/versiones
    // -------------------------------------------------------------------------
    // A. Idea privada ajena (Idea 1017 de User 7) -> 404
    const resOtherPrivGet = await request(app)
      .get('/api/ideas/1017/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherPrivGet.status, 404, "Consulta de versiones de idea privada ajena retorna 404");

    // B. Idea compartida ajena de User 7 -> 404
    const [resTempComp] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'en_desarrollo', 'compartida', 'colaborativa', 1)",
      [7, 'Idea Compartida User 7', 'Desc']
    );
    const tempCompId = resTempComp.insertId;
    tempIdeaIds.push(tempCompId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempCompId]);
    await conn.execute("INSERT INTO idea_versiones (idea_id, numero_version, titulo, fecha_creacion) VALUES (?, 1, 'V1 Comp', NOW())", [tempCompId]);

    const resOtherCompGet = await request(app)
      .get(`/api/ideas/${tempCompId}/versiones`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherCompGet.status, 404, "Consulta de versiones de idea compartida ajena retorna 404");

    // C. Idea pública ajena de User 7 -> 200 OK para usuario con ideas.read
    const [resTempPub] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'en_desarrollo', 'publica', 'individual', 1)",
      [7, 'Idea Publica User 7', 'Desc']
    );
    const tempPubId = resTempPub.insertId;
    tempIdeaIds.push(tempPubId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempPubId]);
    await conn.execute("INSERT INTO idea_versiones (idea_id, numero_version, titulo, fecha_creacion) VALUES (?, 1, 'V1 Pub', NOW())", [tempPubId]);

    const resOtherPubGet = await request(app)
      .get(`/api/ideas/${tempPubId}/versiones`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherPubGet.status, 200, "Idea pública ajena permite listar versiones a usuario autorizado");
    assert.strictEqual(resOtherPubGet.body.total_versiones, 1);

    console.log("✓ 15-18. Privacidad en GET validada: privada (404), compartida (404), pública (200).");

    // -------------------------------------------------------------------------
    // 19-27. Prueba central sobre Idea 3: Creación de Versión 2, Snapshot e Inmutabilidad
    // -------------------------------------------------------------------------
    // Consultar estado previo de versiones en Idea 3
    const resGetV3Pre = await request(app)
      .get('/api/ideas/3/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resGetV3Pre.status, 200);
    assert.strictEqual(resGetV3Pre.body.total_versiones, 1, "Idea 3 debe tener exactamente 1 versión previa");
    assert.strictEqual(resGetV3Pre.body.versiones[0].numero_version, 1);
    const version1Original = resGetV3Pre.body.versiones[0];

    // Actualizar canvas actual en idea_desarrollo para la iteración V2
    await conn.execute(
      "UPDATE idea_desarrollo SET problema = 'Problema detectado en iteración 2', solucion = 'Solución mejorada para V2' WHERE idea_id = 3"
    );

    // Llamar a POST /api/ideas/3/versiones para consolidar la Versión 2
    const motivoV2 = 'Segunda iteración formal con validación de campo';
    const resPostV2 = await request(app)
      .post('/api/ideas/3/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ motivo_cambio: motivoV2 });

    assert.strictEqual(resPostV2.status, 201, "Creación de Versión 2 debe responder 201 Created");
    assert.strictEqual(resPostV2.body.message, 'Versión formal creada exitosamente.');
    assert.strictEqual(resPostV2.body.version.numero_version, 2, "La nueva versión debe ser la número 2");
    assert.strictEqual(resPostV2.body.version.problema, 'Problema detectado en iteración 2');
    assert.strictEqual(resPostV2.body.version.solucion, 'Solución mejorada para V2');
    assert.strictEqual(resPostV2.body.version.motivo_cambio, motivoV2);
    assert.strictEqual(resPostV2.body.idea.version_actual, 2, "ideas.version_actual debe incrementarse a 2");

    // Verificar en BD que ideas.version_actual es 2
    const [dbIdea3] = await conn.execute('SELECT version_actual FROM ideas WHERE id = 3');
    assert.strictEqual(dbIdea3[0].version_actual, 2, "BD: version_actual debe ser 2");

    // Consultar GET /api/ideas/3/versiones para verificar ordenación y persistencia
    const resGetV3Post = await request(app)
      .get('/api/ideas/3/versiones')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resGetV3Post.status, 200);
    assert.strictEqual(resGetV3Post.body.total_versiones, 2, "Idea 3 ahora debe tener 2 versiones");
    assert.strictEqual(resGetV3Post.body.version_actual, 2);

    // Verificar orden consistente
    const versiones3 = resGetV3Post.body.versiones;
    assert.strictEqual(versiones3[0].numero_version, 1, "Primera versión listada debe ser la 1");
    assert.strictEqual(versiones3[1].numero_version, 2, "Segunda versión listada debe ser la 2");

    // Inmutabilidad de Versión 1: comprobar que la V1 histórica no cambió sus campos
    assert.strictEqual(versiones3[0].id, version1Original.id);
    assert.strictEqual(versiones3[0].problema, version1Original.problema);
    assert.strictEqual(versiones3[0].solucion, version1Original.solucion);
    assert.strictEqual(versiones3[0].motivo_cambio, version1Original.motivo_cambio);

    // Verificar evento ligero en idea_historial
    const [histV2] = await conn.execute(
      "SELECT * FROM idea_historial WHERE idea_id = 3 AND tipo_evento = 'nueva_version' ORDER BY id DESC LIMIT 1"
    );
    assert.strictEqual(histV2.length, 1);
    assert.strictEqual(histV2[0].descripcion, 'Versión 2 consolidada formalmente');
    const datosHistV2 = typeof histV2[0].datos === 'string' ? JSON.parse(histV2[0].datos) : histV2[0].datos;
    assert.strictEqual(datosHistV2.version, 2);
    assert.strictEqual(datosHistV2.motivo, motivoV2);
    assert.strictEqual(datosHistV2.problema, undefined, "Historial no debe duplicar el texto completo");

    console.log("✓ 19-27. Creación de Versión 2 exitosa: snapshot completo, version_actual=2, inmutabilidad de V1 e historial ligero.");

    // -------------------------------------------------------------------------
    // 28-30. Concurrencia y Restricción UNIQUE(idea_id, numero_version)
    // -------------------------------------------------------------------------
    // Crear una idea temporal en 'en_desarrollo' de User 2
    const [resTempConc] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'en_desarrollo', 'privada', 'individual', 0)",
      [2, 'Idea Concurrencia Versiones', 'Desc']
    );
    const tempConcId = resTempConc.insertId;
    tempIdeaIds.push(tempConcId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, problema, solucion, moneda) VALUES (?, 'Prob', 'Sol', 'MXN')", [tempConcId]);

    // Ejecutar dos peticiones simultáneas de creación de versión
    const [p1, p2] = await Promise.all([
      request(app).post(`/api/ideas/${tempConcId}/versiones`).set('Authorization', `Bearer ${tokenUser2}`).send({ motivo_cambio: 'Paralelo 1' }),
      request(app).post(`/api/ideas/${tempConcId}/versiones`).set('Authorization', `Bearer ${tokenUser2}`).send({ motivo_cambio: 'Paralelo 2' })
    ]);

    assert.strictEqual(p1.status, 201);
    assert.strictEqual(p2.status, 201);

    // Ambas deben haber obtenido números secuenciales distintos (1 y 2) sin colisión
    const vNums = [p1.body.version.numero_version, p2.body.version.numero_version].sort();
    assert.deepStrictEqual(vNums, [1, 2], "Las versiones concurrentes deben serializarse en 1 y 2");

    // Verificar en BD que existen exactamente 2 versiones con números 1 y 2
    const [dbConcVers] = await conn.execute('SELECT numero_version FROM idea_versiones WHERE idea_id = ? ORDER BY numero_version ASC', [tempConcId]);
    assert.strictEqual(dbConcVers.length, 2);
    assert.strictEqual(dbConcVers[0].numero_version, 1);
    assert.strictEqual(dbConcVers[1].numero_version, 2);

    console.log("✓ 28-30. Concurrencia validada: serialización transaccional FOR UPDATE sin duplicados ni colisiones.");

    // -------------------------------------------------------------------------
    // TEARDOWN / RESTAURACIÓN EXACTA DE LA BASE DE DATOS
    // -------------------------------------------------------------------------
    // 1. Revertir Versión 2 de Idea 3
    await conn.execute('DELETE FROM idea_versiones WHERE idea_id = 3 AND numero_version = 2');
    await conn.execute('UPDATE ideas SET version_actual = 1 WHERE id = 3');
    await conn.execute(
      `UPDATE idea_desarrollo 
       SET problema = ?, solucion = ?, beneficiarios = ?, recursos = ?, inversion_estimada = ?, moneda = ?, complejidad = ?, potencial = ?, riesgos = ?, notas = ?, fecha_actualizacion = ?
       WHERE idea_id = 3`,
      [
        originalIdea3Desarrollo.problema,
        originalIdea3Desarrollo.solucion,
        originalIdea3Desarrollo.beneficiarios,
        originalIdea3Desarrollo.recursos,
        originalIdea3Desarrollo.inversion_estimada,
        originalIdea3Desarrollo.moneda,
        originalIdea3Desarrollo.complejidad,
        originalIdea3Desarrollo.potencial,
        originalIdea3Desarrollo.riesgos,
        originalIdea3Desarrollo.notas,
        originalIdea3Desarrollo.fecha_actualizacion
      ]
    );
    await conn.execute("DELETE FROM idea_historial WHERE idea_id = 3 AND descripcion = 'Versión 2 consolidada formalmente'");

    // 2. Eliminar todas las ideas temporales creadas en esta suite
    for (const tid of tempIdeaIds) {
      await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]);
    }
    tempIdeaIds.length = 0;

    // -------------------------------------------------------------------------
    // Verificación final estricta de conteos en base de datos
    // -------------------------------------------------------------------------
    const [realIdeasFinal] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasFinal[0].c, 9, "Deben existir exactamente 9 ideas reales al final");

    const [realDesFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesFinal[0].c, 9, "idea_desarrollo debe permanecer en 9");

    const [realVerFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerFinal[0].c, 1, "idea_versiones debe permanecer exactamente en 1");

    const [realHistFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistFinal[0].c, 11, "idea_historial debe permanecer exactamente en 11");

    const [realPropFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropFinal[0].c, 8, "idea_propositos debe permanecer en 8");

    const [realPropRelFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_proposito_rel');
    assert.strictEqual(realPropRelFinal[0].c, 0, "idea_proposito_rel debe ser 0");

    const [realCatFinal] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatFinal[0].c, 0, "categorias_idea debe ser 0");

    const [realCatRelFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_categorias');
    assert.strictEqual(realCatRelFinal[0].c, 0, "idea_categorias debe ser 0");

    // Verificar estado y version_actual de las 9 ideas reales
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
    console.log("TODAS LAS PRUEBAS DE F4.8 PASARON SATISFACTORIAMENTE (30/30 PASS)");
    console.log("================================================================================");
    process.exit(0);

  } catch (err) {
    // Limpieza de emergencia
    for (const tid of tempIdeaIds) {
      try { await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]); } catch (_) {}
    }
    try {
      await conn.execute('DELETE FROM idea_versiones WHERE idea_id = 3 AND numero_version = 2');
      await conn.execute('UPDATE ideas SET version_actual = 1 WHERE id = 3');
      await conn.execute("DELETE FROM idea_historial WHERE idea_id = 3 AND descripcion = 'Versión 2 consolidada formalmente'");
    } catch (_) {}
    console.error("ERROR EN PRUEBAS F4.8:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
