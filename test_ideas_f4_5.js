const request = require('supertest');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS AUTOMATIZADAS: F4.5 CATÁLOGOS DE IDEAS");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;

  // Tokens para pruebas
  // User 2: Efrain (rol administrador -> tiene funcionalidad ideas y permiso ideas.read)
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  // User 1003: Liana (rol usuario -> NO tiene acceso a ideas ni ideas.read)
  const tokenUser1003 = jwt.sign({ id: 1003, usuario: 'Liana', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    // -------------------------------------------------------------------------
    // 0. VERIFICACIÓN PREVIA: Integridad de las tablas reales antes de pruebas
    // -------------------------------------------------------------------------
    const [realIdeasPre] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPre[0].c, 9, "Deben existir exactamente 9 ideas reales al inicio");

    const [realPropPre] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropPre[0].c, 8, "Deben existir exactamente 8 registros en idea_propositos");

    const [realCatPre] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatPre[0].c, 0, "Deben existir exactamente 0 registros en categorias_idea");

    const [realDesPre] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesPre[0].c, 9, "Deben existir exactamente 9 registros en idea_desarrollo");

    const [realVerPre] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerPre[0].c, 1, "Deben existir exactamente 1 registro en idea_versiones");

    const [realHistPre] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistPre[0].c, 11, "Deben existir exactamente 11 registros en idea_historial");

    console.log("✓ 0. Integridad previa de base de datos verificada al 100%.");

    // -------------------------------------------------------------------------
    // 1. Autenticación: Sin autenticación -> 401
    // -------------------------------------------------------------------------
    const resUnauth = await request(app).get('/api/ideas/catalogos');
    assert.strictEqual(resUnauth.status, 401, "Petición sin autenticación debe responder 401");
    console.log("✓ 1. Petición no autenticada rechazada con 401.");

    // -------------------------------------------------------------------------
    // 2-4. RBAC: Usuario sin ideas.read -> 403, mensaje amigable sin fugas
    // -------------------------------------------------------------------------
    const resNoPerm = await request(app)
      .get('/api/ideas/catalogos')
      .set('Authorization', `Bearer ${tokenUser1003}`);
    assert.strictEqual(resNoPerm.status, 403, "Usuario sin permiso debe recibir 403");
    assert.strictEqual(resNoPerm.body.error, 'Acceso no autorizado o vencido para esta funcionalidad.');
    assert.strictEqual(resNoPerm.body.code, 'RBAC_ACCESS_DENIED');
    // Verificar que no se fuguen nombres internos de permisos en error
    assert.ok(!resNoPerm.body.error.includes('ideas.read'), "No debe exponer permiso interno en mensaje de error");
    console.log("✓ 2-4. RBAC validado: responde 403 amigable sin exponer permisos internos.");

    // -------------------------------------------------------------------------
    // 5. Endpoint: Usuario autorizado -> 200 OK
    // -------------------------------------------------------------------------
    const resOk = await request(app)
      .get('/api/ideas/catalogos')
      .set('Authorization', `Bearer ${tokenUser2}`);
    assert.strictEqual(resOk.status, 200, "Usuario autorizado debe recibir 200 OK");
    assert.ok(resOk.body, "Debe retornar cuerpo JSON");
    console.log("✓ 5. Endpoint GET /api/ideas/catalogos responde 200 OK para usuario autorizado.");

    // -------------------------------------------------------------------------
    // 6-7. Orden de rutas Express y no colisión con :id
    // -------------------------------------------------------------------------
    // Si /catalogos fuera interpretado como :id, devolvería 400 ('ID de idea inválido.') o 404
    assert.strictEqual(resOk.status, 200, "La ruta /catalogos no debe ser capturada como :id");
    assert.ok(Array.isArray(resOk.body.propositos), "La respuesta contiene el catálogo y no un error de ID");

    // Verificación estricta del stack de Express
    const routes = [];
    const stack = (app.router && app.router.stack) || (app._router && app._router.stack) || [];
    stack.forEach((middleware) => {
      if (middleware.route) {
        routes.push({
          path: middleware.route.path,
          methods: Object.keys(middleware.route.methods)
        });
      }
    });

    const catalogosIdx = routes.findIndex(r => r.path === '/api/ideas/catalogos');
    const ideasPostIdx = routes.findIndex(r => r.path === '/api/ideas' && r.methods.includes('post'));
    const ideasDeleteIdx = routes.findIndex(r => r.path === '/api/ideas/:id' && r.methods.includes('delete'));

    assert.ok(catalogosIdx !== -1, "La ruta /api/ideas/catalogos debe estar registrada en Express");
    assert.ok(ideasPostIdx !== -1, "La ruta POST /api/ideas debe estar registrada");
    assert.ok(ideasDeleteIdx !== -1, "La ruta DELETE /api/ideas/:id debe estar registrada");
    assert.ok(catalogosIdx > ideasPostIdx, "GET /api/ideas/catalogos debe estar registrada después de POST /api/ideas");
    assert.ok(catalogosIdx < ideasDeleteIdx, "GET /api/ideas/catalogos debe estar registrada ANTES de /api/ideas/:id");
    console.log("✓ 6-7. Orden de rutas validado: /catalogos está antes de rutas dinámicas :id.");

    // -------------------------------------------------------------------------
    // 8-12. Catálogo de Propósitos
    // -------------------------------------------------------------------------
    const { propositos } = resOk.body;
    assert.ok(Array.isArray(propositos), "propositos debe ser un arreglo");
    assert.strictEqual(propositos.length, 8, "Deben existir exactamente 8 propósitos");

    const clavesEsperadas = [
      'economico', 'social', 'ambiental', 'educativo',
      'cientifico', 'cultural', 'comunitario', 'personal'
    ];

    const clavesObtenidas = propositos.map(p => p.clave);
    assert.deepStrictEqual(clavesObtenidas, clavesEsperadas, "Las 8 claves de propósitos deben coincidir en orden exacto");

    // Verificar no duplicados
    const setClaves = new Set(clavesObtenidas);
    assert.strictEqual(setClaves.size, 8, "No debe haber propósitos duplicados");

    // Verificar orden
    for (let i = 0; i < propositos.length; i++) {
      assert.strictEqual(propositos[i].orden, i + 1, `Propósito ${propositos[i].clave} debe tener orden ${i + 1}`);
      assert.strictEqual(propositos[i].activo, 1, `Propósito ${propositos[i].clave} debe estar activo`);
      assert.ok(propositos[i].id > 0, `Propósito debe tener id válido`);
      assert.ok(propositos[i].nombre && propositos[i].nombre.length > 0, `Propósito debe tener nombre`);
      assert.ok(propositos[i].descripcion && propositos[i].descripcion.length > 0, `Propósito debe tener descripción`);
      assert.ok(propositos[i].icono && propositos[i].icono.length > 0, `Propósito debe tener icono`);
    }

    // Verificar contra la base de datos real
    const [dbProp] = await conn.execute(
      'SELECT id, clave, nombre, descripcion, icono, orden, activo FROM idea_propositos WHERE activo = ? ORDER BY orden ASC, id ASC',
      [1]
    );
    assert.strictEqual(propositos.length, dbProp.length, "La cantidad de propósitos coincide con la base de datos");
    for (let i = 0; i < dbProp.length; i++) {
      assert.strictEqual(propositos[i].id, dbProp[i].id, `ID de propósito ${i} coincide con BD`);
      assert.strictEqual(propositos[i].clave, dbProp[i].clave, `Clave de propósito ${i} coincide con BD`);
      assert.strictEqual(propositos[i].nombre, dbProp[i].nombre, `Nombre de propósito ${i} coincide con BD`);
    }
    console.log("✓ 8-12. Catálogo de propósitos validado: 8 registros correctos procedentes de idea_propositos.");

    // -------------------------------------------------------------------------
    // 13-14. Catálogo de Categorías: debe devolver arreglo vacío [] y no insertar
    // -------------------------------------------------------------------------
    const { categorias } = resOk.body;
    assert.ok(Array.isArray(categorias), "categorias debe ser un arreglo");
    assert.strictEqual(categorias.length, 0, "categorias debe ser un arreglo vacío []");

    const [dbCat] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(dbCat[0].c, 0, "No se deben haber insertado categorías en categorias_idea");
    console.log("✓ 13-14. Catálogo de categorías validado: arreglo vacío [] y 0 registros en BD.");

    // -------------------------------------------------------------------------
    // 15. Catálogo de Privacidad: privada, compartida, publica
    // -------------------------------------------------------------------------
    const { privacidad } = resOk.body;
    assert.ok(Array.isArray(privacidad), "privacidad debe ser un arreglo");
    assert.strictEqual(privacidad.length, 3, "Deben existir exactamente 3 opciones de privacidad");
    const privClaves = privacidad.map(p => p.clave);
    assert.deepStrictEqual(privClaves, ['privada', 'compartida', 'publica'], "Claves de privacidad exactas");
    for (const p of privacidad) {
      assert.ok(p.nombre && p.nombre.length > 0, "Cada privacidad debe tener nombre");
      assert.ok(p.descripcion && p.descripcion.length > 0, "Cada privacidad debe tener descripción");
    }
    console.log("✓ 15. Catálogo de privacidad validado: exactamente privada, compartida, publica.");

    // -------------------------------------------------------------------------
    // 16. Catálogo de Modalidades: individual, colaborativa, busco_inversion, busco_mentoria, busco_apoyo
    // -------------------------------------------------------------------------
    const { modalidades } = resOk.body;
    assert.ok(Array.isArray(modalidades), "modalidades debe ser un arreglo");
    assert.strictEqual(modalidades.length, 5, "Deben existir exactamente 5 modalidades");
    const modClaves = modalidades.map(m => m.clave);
    assert.deepStrictEqual(
      modClaves,
      ['individual', 'colaborativa', 'busco_inversion', 'busco_mentoria', 'busco_apoyo'],
      "Claves de modalidad exactas"
    );
    for (const m of modalidades) {
      assert.ok(m.nombre && m.nombre.length > 0, "Cada modalidad debe tener nombre");
      assert.ok(m.descripcion && m.descripcion.length > 0, "Cada modalidad debe tener descripción");
    }
    console.log("✓ 16. Catálogo de modalidades validado: exactamente las 5 modalidades aprobadas.");

    // -------------------------------------------------------------------------
    // 17-18. Catálogo de Estados: 7 estados oficiales, sin estados legacy
    // -------------------------------------------------------------------------
    const { estados } = resOk.body;
    assert.ok(Array.isArray(estados), "estados debe ser un arreglo");
    assert.strictEqual(estados.length, 7, "Deben existir exactamente 7 estados oficiales");
    const estadosClaves = estados.map(e => e.clave);
    const estadosEsperados = [
      'semilla', 'en_desarrollo', 'en_validacion', 'lista',
      'en_accion', 'realizada', 'archivada'
    ];
    assert.deepStrictEqual(estadosClaves, estadosEsperados, "Estados oficiales exactos en orden de ciclo de vida");

    const estadosLegacy = ['pendiente', 'en progreso', 'completada', 'descartada'];
    for (const leg of estadosLegacy) {
      assert.ok(!estadosClaves.includes(leg), `El estado legacy '${leg}' NO debe aparecer en el catálogo oficial`);
    }
    for (const e of estados) {
      assert.ok(e.nombre && e.nombre.length > 0, "Cada estado debe tener nombre");
      assert.ok(e.descripcion && e.descripcion.length > 0, "Cada estado debe tener descripción");
    }
    console.log("✓ 17-18. Catálogo de estados validado: exactamente los 7 oficiales, 0 estados legados.");

    // -------------------------------------------------------------------------
    // 19-21. Integridad de Base de Datos y Datos Reales
    // -------------------------------------------------------------------------
    const [realIdeasPost] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPost[0].c, 9, "Las 9 ideas reales deben permanecer intactas");

    const [realPropPost] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropPost[0].c, 8, "Los 8 propósitos deben permanecer intactos");

    const [realCatPost] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatPost[0].c, 0, "categorias_idea debe seguir en 0");

    const [realDesPost] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesPost[0].c, 9, "idea_desarrollo debe permanecer en 9");

    const [realVerPost] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerPost[0].c, 1, "idea_versiones debe permanecer en 1");

    const [realHistPost] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistPost[0].c, 11, "idea_historial debe permanecer en 11");

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
    console.log("✓ 19-21. Integridad final verificada: 0 modificaciones a catálogos, 0 cambios a ideas reales.");

    console.log("\n================================================================================");
    console.log("TODAS LAS PRUEBAS DE F4.5 PASARON SATISFACTORIAMENTE (21/21 PASS)");
    console.log("================================================================================");
    process.exit(0);

  } finally {
    await conn.end();
  }
})().catch(err => {
  console.error("ERROR EN PRUEBAS F4.5:", err);
  process.exit(1);
});
