const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

// server.js starts listening on port 3000 automatically on require
require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.1 — CARGA DE CATÁLOGOS Y ESTADO GLOBAL");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;
  const PORT = process.env.PORT || 3000;

  // Tokens
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });
  const tokenUser1003 = jwt.sign({ id: 1003, usuario: 'Liana', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------------------
    // 0. VERIFICACIÓN PREVIA: Integridad de la base de datos
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
    // PARTE A: Usuario autenticado con ideas.read (User 2 - Efrain)
    // -------------------------------------------------------------------------
    const contextAuth = await browser.newContext();
    await contextAuth.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);
    const pageAuth = await contextAuth.newPage();
    await pageAuth.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

    // TEST F5.1-01: Carga de catálogos
    const catalogosResult = await pageAuth.evaluate(async () => {
      return await window.loadIdeasCatalogos();
    });

    assert.ok(catalogosResult, "F5.1-01: loadIdeasCatalogos debe resolver un objeto para usuario autorizado");
    assert.strictEqual(catalogosResult.loaded, true, "F5.1-01: loaded debe ser true");
    console.log("✓ F5.1-01 — Usuario autenticado con ideas.read carga exitosamente /api/ideas/catalogos.");

    // TEST F5.1-02: 8 propósitos aprobados
    assert.strictEqual(catalogosResult.propositos.length, 8, "F5.1-02: Debe recibir exactamente 8 propósitos");
    const expectedPropositos = [
      'economico', 'social', 'ambiental', 'educativo',
      'cientifico', 'cultural', 'comunitario', 'personal'
    ];
    const receivedPropositos = catalogosResult.propositos.map(p => p.clave);
    assert.deepStrictEqual(receivedPropositos, expectedPropositos, "F5.1-02: Las claves de propósitos deben coincidir en orden exacto");
    console.log("✓ F5.1-02 — Se reciben exactamente los 8 propósitos aprobados en orden oficial.");

    // TEST F5.1-03: Categorías vacías
    assert.ok(Array.isArray(catalogosResult.categorias), "F5.1-03: categorias debe ser un Array");
    assert.strictEqual(catalogosResult.categorias.length, 0, "F5.1-03: categorias debe tener longitud 0");
    console.log("✓ F5.1-03 — Categorías vacías se reciben como array [] sin romper la interfaz.");

    // TEST F5.1-04: 7 estados oficiales
    assert.strictEqual(catalogosResult.estados.length, 7, "F5.1-04: Debe recibir exactamente 7 estados oficiales");
    const expectedEstados = [
      'semilla', 'en_desarrollo', 'en_validacion', 'lista', 'en_accion', 'realizada', 'archivada'
    ];
    const receivedEstados = catalogosResult.estados.map(e => e.clave);
    assert.deepStrictEqual(receivedEstados, expectedEstados, "F5.1-04: Las claves de estados deben coincidir con los 7 oficiales");
    console.log("✓ F5.1-04 — Se reciben exactamente los 7 estados oficiales aprobados.");

    // TEST F5.1-05: 5 modalidades oficiales
    assert.strictEqual(catalogosResult.modalidades.length, 5, "F5.1-05: Debe recibir exactamente 5 modalidades");
    const expectedModalidades = [
      'individual', 'colaborativa', 'busco_inversion', 'busco_mentoria', 'busco_apoyo'
    ];
    const receivedModalidades = catalogosResult.modalidades.map(m => m.clave);
    assert.deepStrictEqual(receivedModalidades, expectedModalidades, "F5.1-05: Las claves de modalidades deben coincidir con las 5 oficiales");
    console.log("✓ F5.1-05 — Se reciben exactamente las 5 modalidades oficiales aprobadas.");

    // TEST F5.1-06: 3 opciones de privacidad
    assert.strictEqual(catalogosResult.privacidad.length, 3, "F5.1-06: Debe recibir exactamente 3 opciones de privacidad");
    const expectedPrivacidad = ['privada', 'compartida', 'publica'];
    const receivedPrivacidad = catalogosResult.privacidad.map(p => p.clave);
    assert.deepStrictEqual(receivedPrivacidad, expectedPrivacidad, "F5.1-06: Las claves de privacidad deben coincidir con las 3 oficiales");
    console.log("✓ F5.1-06 — Se reciben exactamente las 3 opciones de privacidad aprobadas.");

    // TEST F5.1-09: El cache global queda disponible para las siguientes subfases
    const cacheTest = await pageAuth.evaluate(async () => {
      const first = window.ideasCatalogos;
      const second = await window.loadIdeasCatalogos(false);
      return {
        hasGlobal: typeof window.ideasCatalogos === 'object' && window.ideasCatalogos !== null,
        isLoaded: window.ideasCatalogos && window.ideasCatalogos.loaded === true,
        propositosCount: window.ideasCatalogos.propositos.length,
        estadosCount: window.ideasCatalogos.estados.length,
        modalidadesCount: window.ideasCatalogos.modalidades.length,
        privacidadCount: window.ideasCatalogos.privacidad.length,
        categoriasCount: window.ideasCatalogos.categorias.length,
        hasContainer: document.getElementById('ideas-catalogos-container') !== null,
        sameInstance: first === second
      };
    });

    assert.strictEqual(cacheTest.hasGlobal, true, "F5.1-09: window.ideasCatalogos debe existir globalmente");
    assert.strictEqual(cacheTest.isLoaded, true, "F5.1-09: loaded debe ser true");
    assert.strictEqual(cacheTest.propositosCount, 8, "F5.1-09: 8 propósitos en cache");
    assert.strictEqual(cacheTest.estadosCount, 7, "F5.1-09: 7 estados en cache");
    assert.strictEqual(cacheTest.modalidadesCount, 5, "F5.1-09: 5 modalidades en cache");
    assert.strictEqual(cacheTest.privacidadCount, 3, "F5.1-09: 3 privacidades en cache");
    assert.strictEqual(cacheTest.categoriasCount, 0, "F5.1-09: 0 categorías en cache");
    assert.strictEqual(cacheTest.hasContainer, true, "F5.1-09: #ideas-catalogos-container debe existir en el DOM");
    assert.strictEqual(cacheTest.sameInstance, true, "F5.1-09: Caché reutilizada sin petición innecesaria");
    console.log("✓ F5.1-09 — El cache global window.ideasCatalogos y el contenedor base quedan 100% listos.");

    // TEST F5.1-10: No existe regresión en la integración actual con Ideas / Idealita
    const regressionTest = await pageAuth.evaluate(async () => {
      await window.fetchAndDisplayIdeas();
      const lista = document.getElementById('lista-ideas');
      const cardCount = lista ? lista.querySelectorAll('div').length : 0;
      const ctx = await window.refreshIdeasContext(true);

      const form = document.getElementById('form-crear-idea');
      const tituloInput = document.getElementById('idea-titulo');
      const descInput = document.getElementById('idea-descripcion');
      const estadoSelect = document.getElementById('idea-estado');
      const addBtn = document.getElementById('btn-agregar-idea');

      return {
        cardCount,
        hasContext: ctx && Array.isArray(ctx.ideas),
        ideasCountInContext: ctx && ctx.ideas ? ctx.ideas.length : 0,
        hasForm: form !== null,
        hasTitulo: tituloInput !== null,
        hasDesc: descInput !== null,
        hasEstado: estadoSelect !== null,
        hasBtn: addBtn !== null,
        catalogosStillLoaded: window.ideasCatalogos && window.ideasCatalogos.loaded === true
      };
    });

    assert.ok(regressionTest.cardCount > 0, "F5.1-10: Las tarjetas de ideas deben renderizarse en lista-ideas");
    assert.strictEqual(regressionTest.hasContext, true, "F5.1-10: window.idealitaContext debe actualizarse");
    assert.strictEqual(regressionTest.ideasCountInContext, 3, "F5.1-10: Deben existir 3 ideas del usuario en el contexto de Idealita");
    assert.strictEqual(regressionTest.hasForm, true, "F5.1-10: El formulario existente debe seguir presente");
    assert.strictEqual(regressionTest.hasTitulo, true, "F5.1-10: Input titulo presente");
    assert.strictEqual(regressionTest.hasDesc, true, "F5.1-10: Textarea descripcion presente");
    assert.strictEqual(regressionTest.hasEstado, true, "F5.1-10: Select estado presente");
    assert.strictEqual(regressionTest.hasBtn, true, "F5.1-10: Botón agregar idea presente");
    assert.strictEqual(regressionTest.catalogosStillLoaded, true, "F5.1-10: Catálogos continúan disponibles en cache");
    console.log("✓ F5.1-10 — Cero regresiones en fetchAndDisplayIdeas, contexto de Idealita y formulario existente.");

    await contextAuth.close();

    // -------------------------------------------------------------------------
    // PARTE B: Usuario sin autorización (User 1003 - Liana)
    // -------------------------------------------------------------------------
    const contextUnauthRbac = await browser.newContext();
    await contextUnauthRbac.addCookies([
      { name: 'auth_token', value: tokenUser1003, domain: 'localhost', path: '/' }
    ]);
    const pageUnauthRbac = await contextUnauthRbac.newPage();
    await pageUnauthRbac.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

    // TEST F5.1-07: Usuario sin autorización recibe tratamiento estándar
    const unauthResult = await pageUnauthRbac.evaluate(async () => {
      return await window.loadIdeasCatalogos();
    });
    assert.strictEqual(unauthResult, null, "F5.1-07: loadIdeasCatalogos debe retornar null para usuario sin permisos");

    const unauthCache = await pageUnauthRbac.evaluate(() => window.ideasCatalogos);
    assert.strictEqual(unauthCache, null, "F5.1-07: window.ideasCatalogos debe permanecer null tras 403");

    const messageText = await pageUnauthRbac.evaluate(() => {
      const el = document.getElementById('ideas-message');
      return el ? el.textContent : '';
    });
    assert.strictEqual(messageText, 'Acceso no autorizado o vencido para esta funcionalidad.', "F5.1-07: Debe mostrar mensaje amigable estándar");
    console.log("✓ F5.1-07 — Usuario sin autorización recibe tratamiento estándar 403 y mensaje amigable.");

    // TEST F5.1-08: No se filtran errores técnicos ni códigos internos de permisos
    const forbiddenKeywords = ['ideas.read', 'RBAC_PERMISSION_DENIED', 'RBAC_ACCESS_DENIED', 'SELECT', 'FROM', 'sql', 'Stack', 'Token'];
    forbiddenKeywords.forEach(kw => {
      assert.ok(!messageText.toLowerCase().includes(kw.toLowerCase()), `F5.1-08: No debe contener ${kw}`);
    });
    console.log("✓ F5.1-08 — Ningún error técnico, SQL o código interno de permisos se expone en UI.");

    await contextUnauthRbac.close();

    // -------------------------------------------------------------------------
    // VERIFICACIÓN FINAL: Integridad de la base de datos intacta
    // -------------------------------------------------------------------------
    const [realIdeasPost] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPost[0].c, 9, "Deben permanecer exactamente 9 ideas reales");

    const [realPropPost] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(realPropPost[0].c, 8, "Deben permanecer exactamente 8 registros en idea_propositos");

    const [realCatPost] = await conn.query('SELECT COUNT(*) as c FROM categorias_idea');
    assert.strictEqual(realCatPost[0].c, 0, "Deben permanecer exactamente 0 registros en categorias_idea");

    const [realDesPost] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesPost[0].c, 9, "Deben permanecer exactamente 9 registros en idea_desarrollo");

    const [realVerPost] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerPost[0].c, 1, "Deben permanecer exactamente 1 registro en idea_versiones");

    const [realHistPost] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistPost[0].c, 11, "Deben permanecer exactamente 11 registros en idea_historial");

    console.log("✓ Verificación final de base de datos: 100% íntegra y sin modificaciones.");

    console.log("\n================================================================================");
    console.log("RESULTADO: 10/10 PRUEBAS F5.1 APROBADAS (100% PASS, 0 FAIL)");
    console.log("================================================================================");

  } catch (err) {
    console.error("❌ ERROR EN PRUEBA:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (conn) await conn.end();
    process.exit(0);
  }
})();
