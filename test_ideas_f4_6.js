const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.6 DETALLE DE IDEA Y PRIVACIDAD");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens para pruebas
  // User 2: Efrain (rol administrador -> tiene funcionalidad ideas y permiso ideas.read)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 7: Arturito (sin permiso ideas.read por rol, pero propietario de ideas reales 1017, 1020, etc.)
  // Si le damos un token de User 7, no tiene ideas.read, por lo que recibe 403 en endpoints con requirePermission
  const tokenUser7 = jwt.sign({ id: 7, usuario: 'Arturito', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene funcionalidad ideas ni ideas.read)
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

    const [realPropPre] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropPre[0].c, 8, "Deben existir exactamente 8 propósitos");

    const [realPropRelPre] = await conn.query('SELECT COUNT(*) as c FROM idea_proposito_rel');
    assert.strictEqual(realPropRelPre[0].c, 0, "idea_proposito_rel debe ser 0");

    const [realCatPre] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatPre[0].c, 0, "categorias_idea debe ser 0");

    const [realCatRelPre] = await conn.query('SELECT COUNT(*) as c FROM idea_categorias');
    assert.strictEqual(realCatRelPre[0].c, 0, "idea_categorias debe ser 0");

    console.log("✓ 0. Integridad previa de base de datos verificada al 100%.");

    // Crear ideas temporales para pruebas de privacidad:
    // Idea Temp 1: Propietario User 7 (otro usuario), privacidad = 'publica'
    const [resTempPub] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'semilla', 'publica', 'individual', 0)",
      [7, 'Idea Pública de Prueba User 7', 'Descripción pública']
    );
    const tempIdeaPublicaId = resTempPub.insertId;
    tempIdeaIds.push(tempIdeaPublicaId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, problema, solucion, moneda) VALUES (?, ?, ?, 'MXN')", [tempIdeaPublicaId, 'Problema público', 'Solución pública']);

    // Idea Temp 2: Propietario User 7 (otro usuario), privacidad = 'compartida'
    const [resTempComp] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'semilla', 'compartida', 'colaborativa', 0)",
      [7, 'Idea Compartida de Prueba User 7', 'Descripción compartida']
    );
    const tempIdeaCompartidaId = resTempComp.insertId;
    tempIdeaIds.push(tempIdeaCompartidaId);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, problema, solucion, moneda) VALUES (?, ?, ?, 'MXN')", [tempIdeaCompartidaId, 'Problema compartido', 'Solución compartida']);

    // Idea Temp 3: Propietario User 2, privacidad = 'compartida'
    const [resTempCompUser2] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'semilla', 'compartida', 'colaborativa', 0)",
      [2, 'Idea Compartida Propia User 2', 'Descripción compartida propia']
    );
    const tempIdeaCompartidaUser2Id = resTempCompUser2.insertId;
    tempIdeaIds.push(tempIdeaCompartidaUser2Id);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, problema, solucion, moneda) VALUES (?, ?, ?, 'MXN')", [tempIdeaCompartidaUser2Id, 'Problema compartido propio', 'Solución compartida propia']);

    // Idea Temp 4: Propietario User 2, privacidad = 'publica'
    const [resTempPubUser2] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'semilla', 'publica', 'individual', 0)",
      [2, 'Idea Pública Propia User 2', 'Descripción pública propia']
    );
    const tempIdeaPublicaUser2Id = resTempPubUser2.insertId;
    tempIdeaIds.push(tempIdeaPublicaUser2Id);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, problema, solucion, moneda) VALUES (?, ?, ?, 'MXN')", [tempIdeaPublicaUser2Id, 'Problema público propio', 'Solución pública propia']);

    // -------------------------------------------------------------------------
    // 1-2. Autenticación
    // -------------------------------------------------------------------------
    // 1. Sin token -> 401
    const resUnauth = await request(app).get('/api/ideas/2');
    assert.strictEqual(resUnauth.status, 401, "Petición sin token debe retornar 401");

    // 2. Idea pública sin autenticación -> 401
    const resUnauthPub = await request(app).get(`/api/ideas/${tempIdeaPublicaId}`);
    assert.strictEqual(resUnauthPub.status, 401, "Idea pública sin token debe retornar 401");
    console.log("✓ 1-2. Autenticación validada: sin token retorna 401 incluso para ideas públicas.");

    // -------------------------------------------------------------------------
    // 3-5. RBAC
    // -------------------------------------------------------------------------
    // 3. Usuario autenticado sin ideas.read -> 403
    const resNoPerm = await request(app)
      .get('/api/ideas/2')
      .set('Authorization', `Bearer ${tokenUser1003}`);
    assert.strictEqual(resNoPerm.status, 403, "Usuario sin ideas.read debe retornar 403");
    // 4. Mensaje amigable
    assert.strictEqual(resNoPerm.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    // 5. No exponer código interno del permiso
    assert.ok(!resNoPerm.body.error.includes('ideas.read'), "No debe exponer permiso interno en el error");
    console.log("✓ 3-5. RBAC validado: responde 403 amigable sin exponer permisos internos.");

    // -------------------------------------------------------------------------
    // 6-10. Validación estricta de ID
    // -------------------------------------------------------------------------
    const invalidIds = ['abc', '1abc', '1.5', '0', '-1'];
    for (const badId of invalidIds) {
      const resBad = await request(app)
        .get(`/api/ideas/${badId}`)
        .set('Authorization', `Bearer ${tokenUser2}`);
      assert.strictEqual(resBad.status, 400, `ID '${badId}' debe ser rechazado con 400 Bad Request`);
      assert.strictEqual(resBad.body.error, 'ID de idea inválido.');
    }
    console.log("✓ 6-10. Validación estricta de ID: 'abc', '1abc', '1.5', '0', '-1' rechazados con 400.");

    // -------------------------------------------------------------------------
    // 11. Existencia: ID válido inexistente -> 404
    // -------------------------------------------------------------------------
    const resNotExist = await request(app)
      .get('/api/ideas/999999')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resNotExist.status, 404, "ID inexistente debe responder 404 Not Found");
    assert.strictEqual(resNotExist.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 11. ID válido inexistente retorna 404 Not Found.");

    // -------------------------------------------------------------------------
    // 12-14. Regla de Acceso: PRIVADA
    // -------------------------------------------------------------------------
    // 12. Propietario consulta Idea privada propia (Idea 2 pertenece a User 2) -> 200
    const resOwnPriv = await request(app)
      .get('/api/ideas/2')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOwnPriv.status, 200, "Propietario debe poder consultar su idea privada");
    assert.strictEqual(resOwnPriv.body.idea.id, 2);
    assert.strictEqual(resOwnPriv.body.idea.privacidad, 'privada');

    // 13. Otro usuario consulta Idea privada ajena (Idea 1017 pertenece a User 7; User 2 intenta consultar) -> 404
    const resOtherPriv = await request(app)
      .get('/api/ideas/1017')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherPriv.status, 404, "Idea privada de otro usuario debe responder 404 Not Found");
    // 14. La respuesta 404 no debe revelar nada
    assert.strictEqual(resOtherPriv.body.error, 'Idea no encontrada o no autorizada.');
    assert.strictEqual(resOtherPriv.body.idea, undefined, "404 no debe revelar objeto idea");
    console.log("✓ 12-14. Regla Privada: propietario recibe 200, usuario ajeno recibe 404 sin revelar datos.");

    // -------------------------------------------------------------------------
    // 15-17. Regla de Acceso: COMPARTIDA
    // -------------------------------------------------------------------------
    // 15. Propietario consulta Idea compartida propia -> 200
    const resOwnComp = await request(app)
      .get(`/api/ideas/${tempIdeaCompartidaUser2Id}`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOwnComp.status, 200, "Propietario debe poder consultar su idea compartida");
    assert.strictEqual(resOwnComp.body.idea.privacidad, 'compartida');

    // 16-17. Otro usuario consulta Idea compartida ajena -> 404 (sin acceso automático en F4.6)
    const resOtherComp = await request(app)
      .get(`/api/ideas/${tempIdeaCompartidaId}`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherComp.status, 404, "Idea compartida ajena debe responder 404 (sin acceso automático)");
    assert.strictEqual(resOtherComp.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 15-17. Regla Compartida: propietario recibe 200, terceros reciben 404 (sin acceso automático en MVP).");

    // -------------------------------------------------------------------------
    // 18-20. Regla de Acceso: PÚBLICA
    // -------------------------------------------------------------------------
    // 18. Propietario consulta Idea pública propia -> 200
    const resOwnPub = await request(app)
      .get(`/api/ideas/${tempIdeaPublicaUser2Id}`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOwnPub.status, 200, "Propietario debe poder consultar su idea pública");

    // 19. Otro usuario autenticado con ideas.read consulta Idea pública ajena (User 2 consulta idea de User 7) -> 200
    const resOtherPub = await request(app)
      .get(`/api/ideas/${tempIdeaPublicaId}`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOtherPub.status, 200, "Usuario autenticado con ideas.read debe poder consultar idea pública ajena");
    assert.strictEqual(resOtherPub.body.idea.id, tempIdeaPublicaId);
    assert.strictEqual(resOtherPub.body.idea.privacidad, 'publica');

    // 20. Usuario sin ideas.read consulta Idea pública ajena -> 403
    const resNoPermPub = await request(app)
      .get(`/api/ideas/${tempIdeaPublicaId}`)
      .set('Authorization', `Bearer ${tokenUser1003}`);
    assert.strictEqual(resNoPermPub.status, 403, "Usuario sin ideas.read no puede consultar idea pública (403)");
    console.log("✓ 18-20. Regla Pública: propietario recibe 200, tercero con ideas.read recibe 200, tercero sin ideas.read recibe 403.");

    // -------------------------------------------------------------------------
    // 21-26. Contenido del Detalle y Estructura de Respuesta
    // -------------------------------------------------------------------------
    // Consultar Idea real 3 (pertenece a User 2, estado = en_desarrollo, version_actual = 1)
    const resDetail3 = await request(app)
      .get('/api/ideas/3')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resDetail3.status, 200);

    const body3 = resDetail3.body;
    assert.ok(body3.idea, "Debe contener objeto 'idea'");
    assert.ok(body3.desarrollo, "Debe contener objeto 'desarrollo'");
    assert.ok(Array.isArray(body3.categorias), "Debe contener arreglo 'categorias'");
    assert.ok(Array.isArray(body3.propositos), "Debe contener arreglo 'propositos'");

    // 21. Canvas actual de idea_desarrollo
    assert.strictEqual(typeof body3.desarrollo, 'object', "desarrollo debe ser un objeto");
    assert.ok('problema' in body3.desarrollo, "desarrollo debe tener 'problema'");
    assert.ok('solucion' in body3.desarrollo, "desarrollo debe tener 'solucion'");
    assert.ok('beneficiarios' in body3.desarrollo, "desarrollo debe tener 'beneficiarios'");
    assert.ok('recursos' in body3.desarrollo, "desarrollo debe tener 'recursos'");
    assert.ok('inversion_estimada' in body3.desarrollo, "desarrollo debe tener 'inversion_estimada'");
    assert.ok('moneda' in body3.desarrollo, "desarrollo debe tener 'moneda'");
    assert.ok('complejidad' in body3.desarrollo, "desarrollo debe tener 'complejidad'");
    assert.ok('potencial' in body3.desarrollo, "desarrollo debe tener 'potencial'");
    assert.ok('riesgos' in body3.desarrollo, "desarrollo debe tener 'riesgos'");
    assert.ok('notas' in body3.desarrollo, "desarrollo debe tener 'notas'");
    assert.ok('fecha_actualizacion' in body3.desarrollo, "desarrollo debe tener 'fecha_actualizacion'");

    // 22. version_actual expuesta correctamente
    assert.strictEqual(body3.idea.version_actual, 1, "Idea 3 debe tener version_actual = 1");
    assert.strictEqual(body3.idea.estado, 'en_desarrollo', "Idea 3 debe tener estado 'en_desarrollo'");

    // 23-25. Categorías y propósitos
    assert.deepStrictEqual(body3.categorias, [], "categorias actuales debe ser arreglo vacío []");
    assert.deepStrictEqual(body3.propositos, [], "propositos actuales debe ser arreglo vacío []");

    // 26. No se exponen datos sensibles de autenticación
    assert.strictEqual(body3.idea.password_hash, undefined, "No debe exponer password_hash");
    assert.strictEqual(body3.idea.password, undefined, "No debe exponer password");
    assert.strictEqual(body3.idea.jwt_version, undefined, "No debe exponer jwt_version");
    assert.strictEqual(body3.idea.token, undefined, "No debe exponer token");
    console.log("✓ 21-26. Contenido validado: canvas completo, version_actual, categorias [], propositos [], sin datos sensibles.");

    // -------------------------------------------------------------------------
    // 27-32. Integridad de la Base de Datos
    // -------------------------------------------------------------------------
    // Limpiar las 4 ideas temporales
    for (const tid of tempIdeaIds) {
      await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]);
    }
    tempIdeaIds.length = 0;

    const [realIdeasPost] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPost[0].c, 9, "Las 9 ideas reales deben permanecer intactas");

    const [realDesPost] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesPost[0].c, 9, "idea_desarrollo debe permanecer en 9");

    const [realVerPost] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerPost[0].c, 1, "idea_versiones debe permanecer en 1");

    const [realHistPost] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistPost[0].c, 11, "idea_historial debe permanecer en 11");

    const [realPropPost] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropPost[0].c, 8, "idea_propositos debe permanecer en 8");

    const [realPropRelPost] = await conn.query('SELECT COUNT(*) as c FROM idea_proposito_rel');
    assert.strictEqual(realPropRelPost[0].c, 0, "idea_proposito_rel debe permanecer en 0");

    const [realCatPost] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatPost[0].c, 0, "categorias_idea debe permanecer en 0");

    const [realCatRelPost] = await conn.query('SELECT COUNT(*) as c FROM idea_categorias');
    assert.strictEqual(realCatRelPost[0].c, 0, "idea_categorias debe permanecer en 0");

    // Comprobar estado y versión de las 9 ideas reales
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
    console.log("✓ 27-32. Integridad final validada: endpoint estrictamente de solo lectura, 0 modificaciones.");

    console.log("\n================================================================================");
    console.log("TODAS LAS PRUEBAS DE F4.6 PASARON SATISFACTORIAMENTE (32/32 PASS)");
    console.log("================================================================================");
    process.exit(0);

  } catch (err) {
    // Limpieza de emergencia
    for (const tid of tempIdeaIds) {
      try { await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]); } catch (_) {}
    }
    console.error("ERROR EN PRUEBAS F4.6:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
