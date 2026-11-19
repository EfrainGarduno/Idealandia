const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS INTEGRAL: F4.10 AUDITORÍA Y CIERRE DE FASE 4");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens
  // User 2: Efrain (administrador -> cuenta con todos los permisos)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (usuario -> sin permisos de ideas)
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
    // 0. VERIFICACIÓN DE INTEGRIDAD PREVIA
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

    const [realCatPre] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatPre[0].c, 0, "categorias_idea debe ser 0");

    console.log("✓ 0. Integridad previa de base de datos verificada al 100%.");

    // -------------------------------------------------------------------------
    // 1. INVENTARIO DE ENDPOINTS Y ORDEN DE RUTAS EXPRESS
    // -------------------------------------------------------------------------
    const stack = (app.router && app.router.stack) || (app._router && app._router.stack) || [];
    const ideasRoutes = stack
      .filter(m => m.route && m.route.path && m.route.path.includes('ideas'))
      .map(m => ({ path: m.route.path, method: Object.keys(m.route.methods)[0].toUpperCase() }));

    const expectedInventory = [
      { path: '/api/ideas', method: 'GET' },
      { path: '/api/ideas', method: 'POST' },
      { path: '/api/ideas/catalogos', method: 'GET' },
      { path: '/api/ideas/:id', method: 'GET' },
      { path: '/api/ideas/:id', method: 'DELETE' },
      { path: '/api/ideas/:id/estado', method: 'PUT' },
      { path: '/api/ideas/:id/desarrollo', method: 'PUT' },
      { path: '/api/ideas/:id/versiones', method: 'POST' },
      { path: '/api/ideas/:id/versiones', method: 'GET' },
      { path: '/api/ideas/:id/historial', method: 'GET' }
    ];

    assert.strictEqual(ideasRoutes.length, expectedInventory.length, "El inventario de endpoints de Ideas debe coincidir exactamente con los 10 definidos");
    for (let i = 0; i < expectedInventory.length; i++) {
      assert.strictEqual(ideasRoutes[i].path, expectedInventory[i].path, `Ruta ${i} debe ser ${expectedInventory[i].path}`);
      assert.strictEqual(ideasRoutes[i].method, expectedInventory[i].method, `Método ${i} debe ser ${expectedInventory[i].method}`);
    }

    // Confirmar que restaurar NO existe en las rutas registradas
    const restaurarRoute = stack.find(m => m.route && m.route.path && m.route.path.includes('restaurar'));
    assert.strictEqual(restaurarRoute, undefined, "La ruta de restauración NO debe existir en Express");

    console.log("✓ 1. Inventario exacto de 10 endpoints oficiales verificado y confirmada la ausencia de restauración prematura.");

    // -------------------------------------------------------------------------
    // 2. NO COLISIÓN /catalogos vs /:id
    // -------------------------------------------------------------------------
    const resCat = await request(app)
      .get('/api/ideas/catalogos')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resCat.status, 200, "/catalogos debe responder 200 OK");
    assert.ok(Array.isArray(resCat.body.propositos), "Respuesta de catalogos no debe confundirse con un ID de idea");
    assert.strictEqual(resCat.body.categorias.length, 0, "Categorías debe ser arreglo vacío []");
    assert.strictEqual(resCat.body.propositos.length, 8, "Debe retornar los 8 propósitos");

    console.log("✓ 2. Precedencia de rutas confirmada: /catalogos se resuelve antes de /:id sin colisiones.");

    // -------------------------------------------------------------------------
    // 3. MATRIZ DE AUTENTICACIÓN (401) EN TODOS LOS ENDPOINTS
    // -------------------------------------------------------------------------
    const endpointsToTest401 = [
      { method: 'get', url: '/api/ideas' },
      { method: 'post', url: '/api/ideas', body: { titulo: 'X' } },
      { method: 'get', url: '/api/ideas/catalogos' },
      { method: 'get', url: '/api/ideas/3' },
      { method: 'delete', url: '/api/ideas/3' },
      { method: 'put', url: '/api/ideas/3/estado', body: { estado: 'en_validacion' } },
      { method: 'put', url: '/api/ideas/3/desarrollo', body: { problema: 'X' } },
      { method: 'post', url: '/api/ideas/3/versiones', body: { motivo_cambio: 'X' } },
      { method: 'get', url: '/api/ideas/3/versiones' },
      { method: 'get', url: '/api/ideas/3/historial' }
    ];

    for (const ep of endpointsToTest401) {
      const r = await request(app)[ep.method](ep.url).send(ep.body || {});
      assert.strictEqual(r.status, 401, `Endpoint ${ep.method.toUpperCase()} ${ep.url} sin token debe devolver 401`);
    }
    console.log("✓ 3. Matriz de autenticación: los 10 endpoints protegidos devuelven 401 ante peticiones anónimas.");

    // -------------------------------------------------------------------------
    // 4. MATRIZ DE RBAC (403 AMIGABLE SIN EXPOSICIÓN INTERNA)
    // -------------------------------------------------------------------------
    for (const ep of endpointsToTest401) {
      const r = await request(app)[ep.method](ep.url).set('Authorization', `Bearer ${tokenUser1003}`).send(ep.body || {});
      assert.strictEqual(r.status, 403, `Endpoint ${ep.method.toUpperCase()} ${ep.url} sin permiso debe devolver 403`);
      assert.strictEqual(r.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
      assert.ok(!r.body.error.includes('ideas.'), "No debe filtrar nombres internos de permisos en el mensaje");
    }
    console.log("✓ 4. Matriz de RBAC: los 10 endpoints protegidos devuelven 403 con mensaje amigable estándar sin fugas técnicas.");

    // -------------------------------------------------------------------------
    // 5. VALIDACIÓN ESTRICTA DE ID NUMÉRICO EN ENDPOINTS CON :id
    // -------------------------------------------------------------------------
    const endpointsWithId = [
      { method: 'get', urlPattern: id => `/api/ideas/${id}` },
      { method: 'delete', urlPattern: id => `/api/ideas/${id}` },
      { method: 'put', urlPattern: id => `/api/ideas/${id}/estado`, body: { estado: 'en_desarrollo' } },
      { method: 'put', urlPattern: id => `/api/ideas/${id}/desarrollo`, body: { problema: 'X' } },
      { method: 'post', urlPattern: id => `/api/ideas/${id}/versiones`, body: { motivo_cambio: 'X' } },
      { method: 'get', urlPattern: id => `/api/ideas/${id}/versiones` },
      { method: 'get', urlPattern: id => `/api/ideas/${id}/historial` }
    ];

    const malformedIds = ['abc', '1abc', '1.5', '0', '-1'];
    for (const ep of endpointsWithId) {
      for (const badId of malformedIds) {
        const r = await request(app)[ep.method](ep.urlPattern(badId))
          .set('Authorization', `Bearer ${tokenUser2}`)
          .send(ep.body || {});
        assert.strictEqual(r.status, 400, `Endpoint ${ep.method.toUpperCase()} con ID malformado '${badId}' debe responder 400`);
        assert.strictEqual(r.body.error, 'ID de idea inválido.');
      }
    }
    console.log("✓ 5. Validación numérica estricta: 'abc', '1abc', '1.5', '0', '-1' rechazados sistemáticamente con 400.");

    // -------------------------------------------------------------------------
    // 6. FLUJO DE INTEGRACIÓN DE EXTREMO A EXTREMO (END-TO-END) SOBRE IDEA TEMPORAL
    // -------------------------------------------------------------------------
    console.log("\n--- INICIANDO FLUJO INTEGRAL E2E CONTROLADO ---");

    // Paso 1: Crear Idea mediante POST /api/ideas
    const resCreate = await request(app)
      .post('/api/ideas')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        titulo: 'Idea Integral E2E F4.10',
        descripcion: 'Descripción inicial de prueba para ciclo de vida completo',
        privacidad: 'privada',
        modalidad: 'colaborativa'
      });
    assert.strictEqual(resCreate.status, 201, "Paso 1: Creación de idea debe responder 201 Created");
    const tempId = resCreate.body.id;
    tempIdeaIds.push(tempId);

    // Paso 2: Confirmar 'semilla', version_actual=0
    assert.strictEqual(resCreate.body.estado, 'semilla', "Paso 2: Estado inicial debe ser semilla");
    assert.strictEqual(resCreate.body.version_actual, 0, "Paso 2: version_actual inicial debe ser 0");

    // Paso 3: Confirmar canvas 1:1 creado automáticamente
    const resDetPre = await request(app)
      .get(`/api/ideas/${tempId}`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resDetPre.status, 200, "Paso 3: Detalle debe responder 200");
    assert.ok(resDetPre.body.desarrollo, "Paso 3: Registro de idea_desarrollo debe existir");
    assert.strictEqual(resDetPre.body.desarrollo.moneda, 'MXN');

    // Paso 4: Editar canvas mutable en semilla
    const resEditCanvas = await request(app)
      .put(`/api/ideas/${tempId}/desarrollo`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        problema: 'Problema definido en semilla',
        solucion: 'Solución preliminar',
        moneda: 'mxn' // normalización
      });
    assert.strictEqual(resEditCanvas.status, 200, "Paso 4: Edición de canvas debe responder 200");
    assert.strictEqual(resEditCanvas.body.desarrollo.problema, 'Problema definido en semilla');
    assert.strictEqual(resEditCanvas.body.desarrollo.moneda, 'MXN');
    assert.strictEqual(resEditCanvas.body.idea.version_actual, 0, "Paso 4: Editar canvas NO incrementa version_actual");

    // Paso 5: Confirmar historial ligero 'actualizacion'
    const resHist1 = await request(app)
      .get(`/api/ideas/${tempId}/historial`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resHist1.status, 200);
    assert.strictEqual(resHist1.body.total_eventos, 2);
    assert.strictEqual(resHist1.body.historial[0].tipo_evento, 'creacion');
    assert.strictEqual(resHist1.body.historial[1].tipo_evento, 'actualizacion');

    // Paso 6: Transición de estado: semilla -> en_desarrollo
    const resTrans1 = await request(app)
      .put(`/api/ideas/${tempId}/estado`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ estado: 'en_desarrollo', motivo_cambio: 'Iniciando trabajo formal' });
    assert.strictEqual(resTrans1.status, 200, "Paso 6: Transición a en_desarrollo debe responder 200");

    // Paso 7 & 8: Confirmar creación automática de Versión 1 y version_actual = 1
    assert.strictEqual(resTrans1.body.nuevo_estado, 'en_desarrollo');
    assert.strictEqual(resTrans1.body.version_actual, 1, "Paso 8: version_actual debe ser 1");

    const resVers1 = await request(app)
      .get(`/api/ideas/${tempId}/versiones`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resVers1.status, 200);
    assert.strictEqual(resVers1.body.total_versiones, 1, "Paso 7: Debe existir exactamente 1 versión formal consolidada");
    assert.strictEqual(resVers1.body.versiones[0].numero_version, 1);
    assert.strictEqual(resVers1.body.versiones[0].problema, 'Problema definido en semilla', "V1 snapshot capturó canvas actual");

    // Paso 9: Editar canvas nuevamente en en_desarrollo
    const resEditCanvas2 = await request(app)
      .put(`/api/ideas/${tempId}/desarrollo`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({
        problema: 'Problema ampliado para V2',
        solucion: 'Solución refinada V2',
        inversion_estimada: 125000.75
      });
    assert.strictEqual(resEditCanvas2.status, 200, "Paso 9: Edición de canvas responde 200");
    assert.strictEqual(resEditCanvas2.body.idea.version_actual, 1, "Paso 9: Editar canvas NO incrementa version_actual");

    // Paso 10 & 11: Crear Versión 2 manualmente
    const resV2 = await request(app)
      .post(`/api/ideas/${tempId}/versiones`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ motivo_cambio: 'Consolidación de Versión 2' });
    assert.strictEqual(resV2.status, 201, "Paso 10: Creación manual de versión responde 201");
    assert.strictEqual(resV2.body.version.numero_version, 2, "Paso 10: Nueva versión es 2");
    assert.strictEqual(resV2.body.idea.version_actual, 2, "Paso 11: version_actual se actualiza a 2");

    // Paso 12: Consultar versiones ordenadas
    const resVers2 = await request(app)
      .get(`/api/ideas/${tempId}/versiones`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resVers2.status, 200);
    assert.strictEqual(resVers2.body.total_versiones, 2);
    assert.strictEqual(resVers2.body.versiones[0].numero_version, 1);
    assert.strictEqual(resVers2.body.versiones[1].numero_version, 2);
    // Inmutabilidad de V1
    assert.strictEqual(resVers2.body.versiones[0].problema, 'Problema definido en semilla');
    assert.strictEqual(resVers2.body.versiones[1].problema, 'Problema ampliado para V2');

    // Paso 13: Consultar historial cronológico completo
    const resHistFull = await request(app)
      .get(`/api/ideas/${tempId}/historial`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resHistFull.status, 200);
    const eventos = resHistFull.body.historial;
    const tipos = eventos.map(e => e.tipo_evento);
    assert.ok(tipos.includes('creacion'), "Historial incluye creacion");
    assert.ok(tipos.includes('actualizacion'), "Historial incluye actualizacion");
    assert.ok(tipos.includes('cambio_estado'), "Historial incluye cambio_estado");
    assert.ok(tipos.includes('nueva_version'), "Historial incluye nueva_version");

    // Paso 14 & 15: Cambiar de estado a en_validacion -> lista -> en_accion
    const resTransVal = await request(app)
      .put(`/api/ideas/${tempId}/estado`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ estado: 'en_validacion' });
    assert.strictEqual(resTransVal.status, 200);
    assert.strictEqual(resTransVal.body.version_actual, 2, "Paso 15: Transición de estado NO incrementa version_actual");

    // Paso 16: Intentar DELETE físico en estado avanzado -> debe ser rechazado con 400
    const resDelFail = await request(app)
      .delete(`/api/ideas/${tempId}`)
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resDelFail.status, 400, "Paso 16: DELETE físico en estado en_validacion debe ser rechazado con 400");
    assert.strictEqual(resDelFail.body.error, 'Solo las ideas en estado semilla pueden eliminarse.');

    // Paso 17: Limpieza completa y eliminación física en cascada mediante BD controlada
    await conn.execute('DELETE FROM ideas WHERE id = ?', [tempId]);
    tempIdeaIds.length = 0;

    // Confirmar que la eliminación en cascada de la FK eliminó satélites
    const [desCheck] = await conn.execute('SELECT COUNT(*) as c FROM idea_desarrollo WHERE idea_id = ?', [tempId]);
    assert.strictEqual(desCheck[0].c, 0, "Cascada eliminó idea_desarrollo");
    const [verCheck] = await conn.execute('SELECT COUNT(*) as c FROM idea_versiones WHERE idea_id = ?', [tempId]);
    assert.strictEqual(verCheck[0].c, 0, "Cascada eliminó idea_versiones");
    const [histCheck] = await conn.execute('SELECT COUNT(*) as c FROM idea_historial WHERE idea_id = ?', [tempId]);
    assert.strictEqual(histCheck[0].c, 0, "Cascada eliminó idea_historial");

    console.log("✓ 6. Flujo E2E integral (17 pasos) completado con 100% de éxito y limpieza verificada.");

    // -------------------------------------------------------------------------
    // 7. COMPROBACIÓN FINAL DE INTEGRIDAD DE LAS 9 IDEAS REALES
    // -------------------------------------------------------------------------
    const [realIdeasFinal] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasFinal[0].c, 9, "Las 9 ideas reales deben permanecer intactas");

    const [realDesFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesFinal[0].c, 9, "idea_desarrollo debe permanecer en 9");

    const [realVerFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerFinal[0].c, 1, "idea_versiones debe permanecer exactamente en 1");

    const [realHistFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistFinal[0].c, 11, "idea_historial debe permanecer exactamente en 11");

    const [realPropFinal] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropFinal[0].c, 8, "idea_propositos debe seguir en 8");

    const [realCatFinal] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatFinal[0].c, 0, "categorias_idea debe seguir en 0");

    // Verificar las 9 ideas reales
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

    console.log("✓ 7. Integridad absoluta de las 9 ideas reales y de las tablas satélite comprobada.");

    console.log("\n================================================================================");
    console.log("AUDITORÍA INTEGRAL F4.10 FINALIZADA CON ÉXITO: 0 FALLOS DETECTADOS");
    console.log("================================================================================");
    process.exit(0);

  } catch (err) {
    for (const tid of tempIdeaIds) {
      try { await conn.execute('DELETE FROM ideas WHERE id = ?', [tid]); } catch (_) {}
    }
    console.error("ERROR EN PRUEBAS F4.10:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
})();
