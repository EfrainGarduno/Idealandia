const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.7 CANVAS DE DESARROLLO DE LA IDEA");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens para pruebas
  // User 2: Efrain (rol administrador -> tiene funcionalidad ideas y permiso ideas.update)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene funcionalidad ideas ni ideas.update)
  const tokenUser1003 = jwt.sign({ id: 1003, usuario: 'Liana', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const tempIdeaIds = [];
  const testHistorialIds = [];
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

    // Guardar estado original de Idea 3 en idea_desarrollo para restaurarlo al final
    const [origIdea3Rows] = await conn.query('SELECT * FROM idea_desarrollo WHERE idea_id = 3');
    originalIdea3Desarrollo = { ...origIdea3Rows[0] };

    console.log("✓ 0. Integridad previa de base de datos verificada al 100%.");

    // -------------------------------------------------------------------------
    // 1. Autenticación: Sin token -> 401
    // -------------------------------------------------------------------------
    const resUnauth = await request(app).put('/api/ideas/3/desarrollo').send({ problema: 'Test' });
    assert.strictEqual(resUnauth.status, 401, "Petición sin token debe retornar 401");
    console.log("✓ 1. Petición no autenticada rechazada con 401.");

    // -------------------------------------------------------------------------
    // 2-4. RBAC: Usuario sin ideas.update -> 403, mensaje amigable sin fugas
    // -------------------------------------------------------------------------
    const resNoPerm = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser1003}`)
      .send({ problema: 'Test' });
    assert.strictEqual(resNoPerm.status, 403, "Usuario sin ideas.update debe recibir 403");
    assert.strictEqual(resNoPerm.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    assert.ok(!resNoPerm.body.error.includes('ideas.update'), "No debe exponer permiso interno en mensaje de error");
    console.log("✓ 2-4. RBAC validado: responde 403 amigable sin exponer permisos internos.");

    // -------------------------------------------------------------------------
    // 5-9. Validación estricta de ID
    // -------------------------------------------------------------------------
    const invalidIds = ['abc', '1abc', '1.5', '0', '-1'];
    for (const badId of invalidIds) {
      const resBad = await request(app)
        .put(`/api/ideas/${badId}/desarrollo`)
        .set('Authorization', `Bearer ${tokenUser2}`)
        .send({ problema: 'Test' });
      assert.strictEqual(resBad.status, 400, `ID '${badId}' debe ser rechazado con 400 Bad Request`);
      assert.strictEqual(resBad.body.error, 'ID de idea inválido.');
    }
    console.log("✓ 5-9. Validación estricta de ID: 'abc', '1abc', '1.5', '0', '-1' rechazados con 400.");

    // -------------------------------------------------------------------------
    // 10. Existencia / Ownership: Idea inexistente -> 404
    // -------------------------------------------------------------------------
    const resNotExist = await request(app)
      .put('/api/ideas/999999/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ problema: 'Test' });
    assert.strictEqual(resNotExist.status, 404, "ID inexistente debe responder 404 Not Found");
    assert.strictEqual(resNotExist.body.error, 'Idea no encontrada o no autorizada.');
    console.log("✓ 10. ID válido inexistente retorna 404 Not Found.");

    // -------------------------------------------------------------------------
    // Crear ideas temporales para probar reglas de ownership en privada, compartida, publica
    // -------------------------------------------------------------------------
    // Temp Idea A: Privada de User 7
    const [resTempA] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'semilla', 'privada', 'individual', 0)",
      [7, 'Temp Privada User 7', 'Desc']
    );
    const tempPrivadaUser7 = resTempA.insertId;
    tempIdeaIds.push(tempPrivadaUser7);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempPrivadaUser7]);

    // Temp Idea B: Compartida de User 7
    const [resTempB] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'semilla', 'compartida', 'colaborativa', 0)",
      [7, 'Temp Compartida User 7', 'Desc']
    );
    const tempCompartidaUser7 = resTempB.insertId;
    tempIdeaIds.push(tempCompartidaUser7);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempCompartidaUser7]);

    // Temp Idea C: Pública de User 7
    const [resTempC] = await conn.execute(
      "INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, 'semilla', 'publica', 'individual', 0)",
      [7, 'Temp Publica User 7', 'Desc']
    );
    const tempPublicaUser7 = resTempC.insertId;
    tempIdeaIds.push(tempPublicaUser7);
    await conn.execute("INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, 'MXN')", [tempPublicaUser7]);

    // -------------------------------------------------------------------------
    // 12-14 & 33-34. Ownership / Anti-IDOR en PUT desarrollo
    // -------------------------------------------------------------------------
    // 12. User 2 intenta modificar idea privada de User 7 -> 404
    const resOtherPriv = await request(app)
      .put(`/api/ideas/${tempPrivadaUser7}/desarrollo`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ problema: 'Intento IDOR Privada' });
    assert.strictEqual(resOtherPriv.status, 404, "No debe poder modificar idea privada ajena (404)");

    // 13. User 2 intenta modificar idea compartida de User 7 -> 404
    const resOtherComp = await request(app)
      .put(`/api/ideas/${tempCompartidaUser7}/desarrollo`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ problema: 'Intento IDOR Compartida' });
    assert.strictEqual(resOtherComp.status, 404, "No debe poder modificar idea compartida ajena (404)");

    // 14. User 2 intenta modificar idea pública de User 7 -> 404
    // (Incluso si User 2 puede leer la idea pública, NO puede editarla)
    const resOtherPub = await request(app)
      .put(`/api/ideas/${tempPublicaUser7}/desarrollo`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ problema: 'Intento IDOR Publica' });
    assert.strictEqual(resOtherPub.status, 404, "No debe poder modificar idea pública ajena (404)");
    console.log("✓ 12-14 & 33-34. Ownership / Anti-IDOR comprobado: 404 en privada, compartida y pública ajena.");

    // -------------------------------------------------------------------------
    // 17-20. Validaciones de Payload
    // -------------------------------------------------------------------------
    // Payload vacío (sin campos) -> 400
    const resEmpty = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({});
    assert.strictEqual(resEmpty.status, 400, "Payload vacío debe ser rechazado con 400");

    // Tipos inválidos en campos de texto (ej. array u objeto) -> 400
    const resBadType = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ problema: ['no', 'es', 'string'] });
    assert.strictEqual(resBadType.status, 400, "Array en campo de texto debe ser rechazado con 400");

    // Inversión estimada inválida (texto no numérico) -> 400
    const resBadInvStr = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ inversion_estimada: 'diez mil pesos' });
    assert.strictEqual(resBadInvStr.status, 400, "Texto no numérico en inversión debe retornar 400");

    // Inversión estimada inválida (número negativo) -> 400
    const resBadInvNeg = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ inversion_estimada: -500 });
    assert.strictEqual(resBadInvNeg.status, 400, "Inversión negativa debe retornar 400");

    // Inversión estimada inválida (booleano) -> 400
    const resBadInvBool = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ inversion_estimada: true });
    assert.strictEqual(resBadInvBool.status, 400, "Booleano en inversión debe retornar 400");

    // Moneda inválida (no 3 letras) -> 400
    const resBadMoneda = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ moneda: 'PESOS' });
    assert.strictEqual(resBadMoneda.status, 400, "Moneda con más de 3 letras debe retornar 400");

    const resBadMonedaNum = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ moneda: '123' });
    assert.strictEqual(resBadMonedaNum.status, 400, "Moneda numérica debe retornar 400");

    // Complejidad excede 20 caracteres -> 400
    const resBadComp = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ complejidad: 'esta complejidad supera los veinte caracteres permitidos' });
    assert.strictEqual(resBadComp.status, 400, "Complejidad >20 chars debe retornar 400");

    // Potencial excede 20 caracteres -> 400
    const resBadPot = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ potencial: 'este potencial supera los veinte caracteres permitidos' });
    assert.strictEqual(resBadPot.status, 400, "Potencial >20 chars debe retornar 400");

    console.log("✓ 17-20. Validaciones de payload verificadas: rechazo de tipos erróneos, inversión inválida, moneda inválida y longitudes.");

    // -------------------------------------------------------------------------
    // 11, 15, 29-30. Propietario actualiza exitosamente (Prueba sobre Idea 3)
    // -------------------------------------------------------------------------
    const payloadCompleto = {
      problema: 'Dificultad de los usuarios para encontrar mentoría vocacional personalizada.',
      solucion: 'Plataforma en línea que conecta asesores con usuarios de forma directa.',
      beneficiarios: 'Estudiantes de bachillerato y profesionales en reconversión.',
      recursos: 'Plataforma web, base de mentores certificados, pasarela de pago.',
      inversion_estimada: 45000.50,
      moneda: 'mxn', // debe normalizarse a MXN
      complejidad: 'media',
      potencial: 'alto',
      riesgos: 'Baja retención de mentores en etapas iniciales.',
      notas: 'Prueba exhaustiva de canvas F4.7.'
    };

    const resOk3 = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send(payloadCompleto);

    assert.strictEqual(resOk3.status, 200, "Propietario debe poder actualizar su idea (200 OK)");
    assert.strictEqual(resOk3.body.message, 'Canvas de desarrollo actualizado correctamente.');
    assert.strictEqual(resOk3.body.idea.id, 3);
    assert.strictEqual(resOk3.body.idea.estado, 'en_desarrollo');
    assert.strictEqual(resOk3.body.idea.version_actual, 1);

    const d3 = resOk3.body.desarrollo;
    assert.strictEqual(d3.problema, payloadCompleto.problema);
    assert.strictEqual(d3.solucion, payloadCompleto.solucion);
    assert.strictEqual(d3.beneficiarios, payloadCompleto.beneficiarios);
    assert.strictEqual(d3.recursos, payloadCompleto.recursos);
    assert.strictEqual(Number(d3.inversion_estimada), 45000.50);
    assert.strictEqual(d3.moneda, 'MXN', "Moneda debe quedar normalizada en mayúsculas");
    assert.strictEqual(d3.complejidad, 'media');
    assert.strictEqual(d3.potencial, 'alto');
    assert.strictEqual(d3.riesgos, payloadCompleto.riesgos);
    assert.strictEqual(d3.notas, payloadCompleto.notas);
    assert.ok(d3.fecha_actualizacion, "fecha_actualizacion debe estar presente");

    // Verificar directamente en BD la persistencia
    const [dbCheck3] = await conn.execute('SELECT * FROM idea_desarrollo WHERE idea_id = 3');
    assert.strictEqual(dbCheck3[0].problema, payloadCompleto.problema);
    assert.strictEqual(Number(dbCheck3[0].inversion_estimada), 45000.50);
    assert.strictEqual(dbCheck3[0].moneda, 'MXN');

    console.log("✓ 11, 15, 29-30. Propietario actualiza canvas exitosamente y se persiste en BD con normalización.");

    // -------------------------------------------------------------------------
    // 16. Actualización parcial: conserva campos no enviados
    // -------------------------------------------------------------------------
    const payloadParcial = {
      solucion: 'Solución actualizada parcialmente.',
      inversion_estimada: 60000.00
    };

    const resParcial = await request(app)
      .put('/api/ideas/3/desarrollo')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send(payloadParcial);

    assert.strictEqual(resParcial.status, 200);
    const dParcial = resParcial.body.desarrollo;
    assert.strictEqual(dParcial.solucion, 'Solución actualizada parcialmente.', "Campo enviado debe actualizarse");
    assert.strictEqual(Number(dParcial.inversion_estimada), 60000.00, "Campo enviado debe actualizarse");
    assert.strictEqual(dParcial.problema, payloadCompleto.problema, "Campo no enviado debe conservarse intacto");
    assert.strictEqual(dParcial.beneficiarios, payloadCompleto.beneficiarios, "Campo no enviado debe conservarse intacto");
    assert.strictEqual(dParcial.recursos, payloadCompleto.recursos, "Campo no enviado debe conservarse intacto");
    assert.strictEqual(dParcial.moneda, 'MXN', "Moneda no enviada debe conservarse intacta");
    assert.strictEqual(dParcial.complejidad, 'media', "Complejidad no enviada debe conservarse intacta");

    console.log("✓ 16. Actualización parcial confirmada: campos no enviados se conservan intactos.");

    // -------------------------------------------------------------------------
    // 21-28. Integridad de la Idea Principal y Sistema de Versiones
    // -------------------------------------------------------------------------
    const [idea3Db] = await conn.execute('SELECT * FROM ideas WHERE id = 3');
    assert.strictEqual(idea3Db[0].titulo, 'Venta de servicios de orientación', "ideas.titulo permanece igual");
    assert.strictEqual(idea3Db[0].estado, 'en_desarrollo', "ideas.estado permanece igual");
    assert.strictEqual(idea3Db[0].privacidad, 'privada', "ideas.privacidad permanece igual");
    assert.strictEqual(idea3Db[0].modalidad, 'individual', "ideas.modalidad permanece igual");
    assert.strictEqual(idea3Db[0].version_actual, 1, "ideas.version_actual permanece en 1");

    // 27-28. Comprobar que NO se creó ninguna nueva versión formal en idea_versiones
    const [verPost] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(verPost[0].c, 1, "idea_versiones debe seguir teniendo exactamente 1 registro");

    console.log("✓ 21-28. Integridad confirmada: la idea principal y el versionamiento formal no sufren alteraciones.");

    // -------------------------------------------------------------------------
    // 31-32. Evento de Historial Ligero
    // -------------------------------------------------------------------------
    const [histRows] = await conn.execute(
      "SELECT * FROM idea_historial WHERE idea_id = 3 AND tipo_evento = 'actualizacion' ORDER BY id DESC LIMIT 1"
    );
    assert.strictEqual(histRows.length, 1, "Debe existir registro en idea_historial con tipo_evento 'actualizacion'");
    assert.strictEqual(histRows[0].descripcion, 'Actualización del canvas de desarrollo');
    const datosHist = typeof histRows[0].datos === 'string' ? JSON.parse(histRows[0].datos) : histRows[0].datos;
    assert.ok(Array.isArray(datosHist.campos_modificados), "datos debe contener campos_modificados");
    assert.deepStrictEqual(datosHist.campos_modificados, ['solucion', 'inversion_estimada']);
    // Verificar que NO duplicó el canvas completo en el historial
    assert.strictEqual(datosHist.problema, undefined, "No debe duplicar texto del problema en historial");
    assert.strictEqual(datosHist.solucion, undefined, "No debe duplicar texto de la solución en historial");

    console.log("✓ 31-32. Historial validado: evento de actualización ligero generado sin duplicar el canvas completo.");

    // -------------------------------------------------------------------------
    // 26 & 28. Teardown / Restauración exacta de Idea 3 y limpieza de pruebas
    // -------------------------------------------------------------------------
    // Restaurar Idea 3 a su estado previo a las pruebas
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

    // Eliminar los eventos de prueba generados en historial durante este test
    await conn.execute("DELETE FROM idea_historial WHERE descripcion = 'Actualización del canvas de desarrollo'");

    // Eliminar las 3 ideas temporales de User 7
    for (const tid of tempIdeaIds) {
      await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]);
    }
    tempIdeaIds.length = 0;

    // -------------------------------------------------------------------------
    // Verificación final estricta de conteos
    // -------------------------------------------------------------------------
    const [realIdeasFinal] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasFinal[0].c, 9, "Deben existir exactamente 9 ideas reales al final");

    const [realDesFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesFinal[0].c, 9, "idea_desarrollo debe seguir en 9");

    const [realVerFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerFinal[0].c, 1, "idea_versiones debe seguir en 1");

    const [realHistFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistFinal[0].c, 11, "idea_historial debe volver a exactamente 11 registros");

    const [realPropFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropFinal[0].c, 8, "idea_propositos debe seguir en 8");

    const [realPropRelFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_proposito_rel');
    assert.strictEqual(realPropRelFinal[0].c, 0, "idea_proposito_rel debe seguir en 0");

    const [realCatFinal] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatFinal[0].c, 0, "categorias_idea debe seguir en 0");

    const [realCatRelFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_categorias');
    assert.strictEqual(realCatRelFinal[0].c, 0, "idea_categorias debe seguir en 0");

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
    console.log("TODAS LAS PRUEBAS DE F4.7 PASARON SATISFACTORIAMENTE (34/34 PASS)");
    console.log("================================================================================");
    process.exit(0);

  } catch (err) {
    // Limpieza de emergencia en caso de fallo
    for (const tid of tempIdeaIds) {
      try { await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]); } catch (_) {}
    }
    if (originalIdea3Desarrollo) {
      try {
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
        await conn.execute("DELETE FROM idea_historial WHERE descripcion = 'Actualización del canvas de desarrollo'");
      } catch (_) {}
    }
    console.error("ERROR EN PRUEBAS F4.7:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
