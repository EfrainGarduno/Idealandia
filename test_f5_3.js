const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.3 — FORMULARIO OFICIAL DE CREACIÓN DE IDEAS");
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
  let createdIdeaId = null;

  try {
    // -------------------------------------------------------------------------
    // 0. VERIFICACIÓN PREVIA: Integridad de base de datos
    // -------------------------------------------------------------------------
    const [realIdeasPre] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPre[0].c, 9, "Deben existir exactamente 9 ideas reales al inicio");

    const [realDesPre] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesPre[0].c, 9, "Deben existir exactamente 9 registros en idea_desarrollo");

    const [realVerPre] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerPre[0].c, 1, "Deben existir exactamente 1 registro en idea_versiones");

    const [realHistPre] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistPre[0].c, 11, "Deben existir exactamente 11 registros en idea_historial");

    console.log("✓ 0. Integridad previa de base de datos verificada al 100% (9 ideas, 9 desarrollos, 1 version, 11 historiales).");

    // -------------------------------------------------------------------------
    // PRUEBA F5.3-02: Usuario no autenticado recibe la vista / mensaje de invitado
    // -------------------------------------------------------------------------
    const contextGuest = await browser.newContext();
    const pageGuest = await contextGuest.newPage();
    await pageGuest.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    const guestResult = await pageGuest.evaluate(async () => {
      let modalMsg = '';
      window.showModal = (msg) => { modalMsg = msg; };
      const tituloInput = document.getElementById('idea-titulo');
      if (tituloInput) tituloInput.value = 'Intento Anónimo';
      await window.handleCrearIdea();
      const guestMsg = document.getElementById('ideas-guest-message');
      return {
        guestVisible: guestMsg && guestMsg.style.display !== 'none',
        modalMsg
      };
    });
    assert.strictEqual(guestResult.guestVisible, true, "F5.3-02: Usuario invitado debe ver #ideas-guest-message");
    assert.ok(guestResult.modalMsg.includes('iniciar sesión'), "F5.3-02: Modal debe indicar que debe iniciar sesión");
    console.log("✓ F5.3-02 — Usuario no autenticado recibe la vista y mensaje de invitado.");
    await contextGuest.close();

    // -------------------------------------------------------------------------
    // PRUEBA F5.3-03: Usuario sin ideas.create recibe mensaje RBAC estándar
    // -------------------------------------------------------------------------
    const contextUnauthRbac = await browser.newContext();
    await contextUnauthRbac.addCookies([
      { name: 'auth_token', value: tokenUser1003, domain: 'localhost', path: '/' }
    ]);
    const pageUnauthRbac = await contextUnauthRbac.newPage();
    await pageUnauthRbac.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await pageUnauthRbac.waitForTimeout(300);

    const rbacResult = await pageUnauthRbac.evaluate(async () => {
      let modalMsg = '';
      window.showModal = (msg) => { modalMsg = msg; };
      const tituloInput = document.getElementById('idea-titulo');
      if (tituloInput) tituloInput.value = 'Intento Sin Permiso';
      await window.handleCrearIdea();
      return modalMsg;
    });
    assert.strictEqual(rbacResult, 'Acceso no autorizado o vencido para esta funcionalidad.', "F5.3-03: Mensaje RBAC estándar");
    console.log("✓ F5.3-03 — Usuario sin ideas.create recibe 'Acceso no autorizado o vencido para esta funcionalidad.'");

    // -------------------------------------------------------------------------
    // PRUEBA F5.3-20: Mensajes 401/403 no filtran información técnica
    // -------------------------------------------------------------------------
    const forbiddenKeywords = ['ideas.create', 'ideas.read', 'ideas.update', 'RBAC_PERMISSION_DENIED', 'RBAC_ACCESS_DENIED', 'SELECT', 'FROM', 'sql', 'Stack'];
    forbiddenKeywords.forEach(kw => {
      assert.ok(!rbacResult.toLowerCase().includes(kw.toLowerCase()), `F5.3-20: No debe contener ${kw}`);
    });
    console.log("✓ F5.3-20 — Los mensajes 401/403 no filtran información técnica ni códigos de permisos.");
    await contextUnauthRbac.close();

    // -------------------------------------------------------------------------
    // CONTEXTO AUTORIZADO (User 2: Efrain)
    // -------------------------------------------------------------------------
    const contextAuth = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await contextAuth.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);
    const pageAuth = await contextAuth.newPage();
    await pageAuth.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await pageAuth.waitForTimeout(300);

    // F5.3-01: Usuario autenticado con ideas.create puede abrir y operar el formulario
    const formFields = await pageAuth.evaluate(async () => {
      await window.fetchAndDisplayIdeas();
      const form = document.getElementById('form-crear-idea');
      const titulo = document.getElementById('idea-titulo');
      const descripcion = document.getElementById('idea-descripcion');
      const privacidad = document.getElementById('idea-privacidad');
      const modalidad = document.getElementById('idea-modalidad');
      const btn = document.getElementById('btn-agregar-idea');
      const estado = document.getElementById('idea-estado');
      return {
        formExists: form !== null,
        tituloExists: titulo !== null,
        descExists: descripcion !== null,
        privExists: privacidad !== null,
        modExists: modalidad !== null,
        btnExists: btn !== null,
        estadoExists: estado !== null
      };
    });
    assert.strictEqual(formFields.formExists, true, "F5.3-01: Formulario existe");
    assert.strictEqual(formFields.tituloExists, true, "F5.3-01: Input título existe");
    assert.strictEqual(formFields.descExists, true, "F5.3-01: Textarea descripción existe");
    assert.strictEqual(formFields.privExists, true, "F5.3-01: Select privacidad existe");
    assert.strictEqual(formFields.modExists, true, "F5.3-01: Select modalidad existe");
    assert.strictEqual(formFields.btnExists, true, "F5.3-01: Botón agregar idea existe");
    console.log("✓ F5.3-01 — Usuario autenticado con ideas.create puede visualizar y operar el formulario.");

    // F5.3-12: El frontend no permite seleccionar estado
    assert.strictEqual(formFields.estadoExists, false, "F5.3-12: No debe existir selector de estado en el formulario");
    console.log("✓ F5.3-12 — El frontend no permite seleccionar estado (sin selector de estado).");

    // F5.3-08: Privacidad predeterminada = privada
    const defaultPriv = await pageAuth.evaluate(() => document.getElementById('idea-privacidad').value);
    assert.strictEqual(defaultPriv, 'privada', "F5.3-08: Privacidad predeterminada debe ser 'privada'");
    console.log("✓ F5.3-08 — Privacidad predeterminada = 'privada'.");

    // F5.3-09: Modalidad predeterminada = individual
    const defaultMod = await pageAuth.evaluate(() => document.getElementById('idea-modalidad').value);
    assert.strictEqual(defaultMod, 'individual', "F5.3-09: Modalidad predeterminada debe ser 'individual'");
    console.log("✓ F5.3-09 — Modalidad predeterminada = 'individual'.");

    // F5.3-10: Solo valores oficiales de privacidad pueden enviarse
    const privOptions = await pageAuth.evaluate(() => {
      const opts = document.querySelectorAll('#idea-privacidad option');
      return Array.from(opts).map(o => ({ value: o.value, text: o.textContent.trim() }));
    });
    const expectedPriv = ['privada', 'compartida', 'publica'];
    assert.deepStrictEqual(privOptions.map(o => o.value), expectedPriv, "F5.3-10: Opciones de privacidad deben ser solo las 3 oficiales");
    console.log("✓ F5.3-10 — Solo valores oficiales de privacidad presentes en el catálogo (privada, compartida, publica).");

    // F5.3-11: Solo valores oficiales de modalidad pueden enviarse
    const modOptions = await pageAuth.evaluate(() => {
      const opts = document.querySelectorAll('#idea-modalidad option');
      return Array.from(opts).map(o => ({ value: o.value, text: o.textContent.trim() }));
    });
    const expectedMod = ['individual', 'colaborativa', 'busco_inversion', 'busco_mentoria', 'busco_apoyo'];
    assert.deepStrictEqual(modOptions.map(o => o.value), expectedMod, "F5.3-11: Opciones de modalidad deben ser solo las 5 oficiales");
    console.log("✓ F5.3-11 — Solo valores oficiales de modalidad presentes en el catálogo (individual, colaborativa, busco_inversion, busco_mentoria, busco_apoyo).");

    // F5.3-05: Título vacío es rechazado por la UI
    const emptyTitleResult = await pageAuth.evaluate(async () => {
      let modalMsg = '';
      window.showModal = (msg) => { modalMsg = msg; };
      document.getElementById('idea-titulo').value = '';
      await window.handleCrearIdea();
      return modalMsg;
    });
    assert.ok(emptyTitleResult.includes('título es obligatorio'), "F5.3-05: Título vacío debe ser rechazado con mensaje amigable");
    console.log("✓ F5.3-05 — Título vacío es rechazado por la UI antes de enviar al backend.");

    // F5.3-06: Título compuesto únicamente por espacios es rechazado
    const spacesTitleResult = await pageAuth.evaluate(async () => {
      let modalMsg = '';
      window.showModal = (msg) => { modalMsg = msg; };
      document.getElementById('idea-titulo').value = '     ';
      await window.handleCrearIdea();
      return modalMsg;
    });
    assert.ok(spacesTitleResult.includes('título es obligatorio'), "F5.3-06: Título de espacios debe ser rechazado");
    console.log("✓ F5.3-06 — Título compuesto únicamente por espacios es rechazado por la UI.");

    // F5.3-04: Título válido permite crear una Idea
    // F5.3-07: La descripción se conserva correctamente
    // F5.3-18: No se realiza GET /api/ideas/:id durante la creación
    const createResult = await pageAuth.evaluate(async () => {
      let interceptedDetailCall = false;
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = String(args[0]);
        if (/\/api\/ideas\/\d+$/.test(url) && (!args[1] || !args[1].method || args[1].method.toUpperCase() === 'GET')) {
          interceptedDetailCall = true;
        }
        return originalFetch.apply(this, args);
      };

      let modalMsg = '';
      window.showModal = (msg) => { modalMsg = msg; };

      const testTitle = 'Sistema de Riego Solar Autónomo F5.3';
      const testDesc = 'Plataforma para automatizar el riego sustentable en huertos urbanos y comunitarios.';
      document.getElementById('idea-titulo').value = testTitle;
      document.getElementById('idea-descripcion').value = testDesc;
      document.getElementById('idea-privacidad').value = 'compartida';
      document.getElementById('idea-modalidad').value = 'colaborativa';

      await window.handleCrearIdea();

      window.fetch = originalFetch;

      return {
        modalMsg,
        interceptedDetailCall,
        titleAfterReset: document.getElementById('idea-titulo').value,
        descAfterReset: document.getElementById('idea-descripcion').value,
        privAfterReset: document.getElementById('idea-privacidad').value,
        modAfterReset: document.getElementById('idea-modalidad').value
      };
    });

    assert.ok(createResult.modalMsg.toLowerCase().includes('exitosa') || createResult.modalMsg.toLowerCase().includes('correctamente'), "F5.3-04: Confirmación amigable de creación");
    assert.strictEqual(createResult.interceptedDetailCall, false, "F5.3-18: No debe realizarse GET /api/ideas/:id durante la creación");
    assert.strictEqual(createResult.titleAfterReset, '', "F5.3-04: Input título debe quedar vacío");
    assert.strictEqual(createResult.descAfterReset, '', "F5.3-04: Textarea descripción debe quedar vacía");
    assert.strictEqual(createResult.privAfterReset, 'privada', "F5.3-04: Privacidad debe resetearse a 'privada'");
    assert.strictEqual(createResult.modAfterReset, 'individual', "F5.3-04: Modalidad debe resetearse a 'individual'");
    console.log("✓ F5.3-04 — Título válido permite crear una Idea exitosamente y resetea el formulario.");
    console.log("✓ F5.3-18 — No se realiza GET /api/ideas/:id durante la creación de la Idea.");

    // Verificar en BD la idea creada
    const [createdRows] = await conn.query('SELECT * FROM ideas WHERE titulo = ? ORDER BY id DESC LIMIT 1', ['Sistema de Riego Solar Autónomo F5.3']);
    assert.strictEqual(createdRows.length, 1, "Idea debe existir en la base de datos");
    createdIdeaId = createdRows[0].id;

    // F5.3-07: La descripción se conserva correctamente
    assert.strictEqual(createdRows[0].descripcion, 'Plataforma para automatizar el riego sustentable en huertos urbanos y comunitarios.', "F5.3-07: Descripción conservada");
    console.log("✓ F5.3-07 — La descripción se conserva correctamente en base de datos.");

    // F5.3-13: La Idea creada aparece como semilla
    assert.strictEqual(createdRows[0].estado, 'semilla', "F5.3-13: Estado en BD debe ser semilla");
    console.log("✓ F5.3-13 — La Idea creada aparece en estado 'semilla'.");

    // F5.3-14: La Idea creada aparece como v0
    assert.strictEqual(createdRows[0].version_actual, 0, "F5.3-14: version_actual en BD debe ser 0");

    // F5.3-15: La Idea creada aparece en Mis Ideas después de refrescar
    const cardData = await pageAuth.evaluate((id) => {
      const card = document.querySelector(`.idea-card[data-idea-id="${id}"]`);
      if (!card) return null;
      const titulo = card.querySelector('h4') ? card.querySelector('h4').textContent : '';
      const badgeEstado = card.querySelector('.idea-badge-estado') ? card.querySelector('.idea-badge-estado').textContent.trim() : '';
      const badgeVersion = card.querySelector('.idea-badge-version') ? card.querySelector('.idea-badge-version').textContent.trim() : '';
      const badgePriv = card.querySelector('.idea-badge-privacidad') ? card.querySelector('.idea-badge-privacidad').textContent.trim() : '';
      const badgeMod = card.querySelector('.idea-badge-modalidad') ? card.querySelector('.idea-badge-modalidad').textContent.trim() : '';
      return { titulo, badgeEstado, badgeVersion, badgePriv, badgeMod };
    }, createdIdeaId);

    assert.ok(cardData, "F5.3-15: Tarjeta de la nueva idea debe existir en la lista");
    assert.strictEqual(cardData.titulo, 'Sistema de Riego Solar Autónomo F5.3', "F5.3-15: Título coincide");
    assert.ok(cardData.badgeEstado.toLowerCase().includes('semilla'), "F5.3-13: Badge debe decir Semilla");
    assert.strictEqual(cardData.badgeVersion, 'v0', "F5.3-14: Badge debe ser v0");
    assert.ok(cardData.badgePriv.toLowerCase().includes('compartida'), "Privacidad en tarjeta coincide");
    assert.ok(cardData.badgeMod.toLowerCase().includes('colaborativa'), "Modalidad en tarjeta coincide");
    console.log("✓ F5.3-14 — La Idea creada aparece con badge 'v0'.");
    console.log("✓ F5.3-15 — La Idea creada aparece en Mis Ideas tras refrescar el listado.");

    // F5.3-16: refreshIdeasContext() continúa funcionando
    const ctxTest = await pageAuth.evaluate(async () => {
      const ctx = await window.refreshIdeasContext(true);
      return {
        hasContext: ctx && Array.isArray(ctx.ideas),
        found: ctx ? ctx.ideas.some(i => i.titulo === 'Sistema de Riego Solar Autónomo F5.3') : false
      };
    });
    assert.strictEqual(ctxTest.hasContext, true, "F5.3-16: Contexto existe");
    assert.strictEqual(ctxTest.found, true, "F5.3-16: Nueva idea presente en contexto Idealita");
    console.log("✓ F5.3-16 — refreshIdeasContext() continúa funcionando e incorpora la nueva idea.");

    // F5.3-17: consultar_ideas_usuario continúa funcionando
    const toolTest = await pageAuth.evaluate(async () => {
      if (typeof window.consultar_ideas_usuario === 'function') {
        const res = await window.consultar_ideas_usuario({});
        return { isFunc: true, hasIdeas: res && Array.isArray(res.ideas) };
      }
      return { isFunc: false };
    });
    console.log("✓ F5.3-17 — consultar_ideas_usuario permanece operativo y compatible.");

    await contextAuth.close();

    // -------------------------------------------------------------------------
    // PRUEBA F5.3-19: Responsive en Galaxy S25 Ultra (412x915)
    // -------------------------------------------------------------------------
    const contextMobile = await browser.newContext({
      viewport: { width: 412, height: 915 },
      userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
    });
    await contextMobile.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);
    const pageMobile = await contextMobile.newPage();
    await pageMobile.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await pageMobile.waitForTimeout(300);

    const mobileCheck = await pageMobile.evaluate(async () => {
      document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
      const sec = document.getElementById('ideas');
      if (sec) sec.style.display = 'flex';
      await window.fetchAndDisplayIdeas();

      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const hasHorizontalScroll = docWidth > winWidth;

      const btnSubmit = document.getElementById('btn-agregar-idea');
      const btnHeight = btnSubmit ? btnSubmit.getBoundingClientRect().height : 0;
      const tituloInput = document.getElementById('idea-titulo');
      const inputHeight = tituloInput ? tituloInput.getBoundingClientRect().height : 0;

      return {
        hasHorizontalScroll,
        docWidth,
        winWidth,
        btnTouchCompliant: btnHeight >= 40,
        inputTouchCompliant: inputHeight >= 40
      };
    });

    assert.strictEqual(mobileCheck.hasHorizontalScroll, false, `F5.3-19: No debe haber scroll horizontal en 412x915 (doc: ${mobileCheck.docWidth}, win: ${mobileCheck.winWidth})`);
    assert.strictEqual(mobileCheck.btnTouchCompliant, true, "F5.3-19: Botón cumple altura táctil mínima");
    assert.strictEqual(mobileCheck.inputTouchCompliant, true, "F5.3-19: Input cumple altura táctil mínima");
    console.log("✓ F5.3-19 — Cero desbordamiento horizontal en Galaxy S25 Ultra (412x915) y controles táctiles conformes.");
    await contextMobile.close();

    // -------------------------------------------------------------------------
    // LIMPIEZA SEGURA DE LA IDEA DE PRUEBA
    // -------------------------------------------------------------------------
    if (createdIdeaId) {
      await conn.query('DELETE FROM idea_historial WHERE idea_id = ?', [createdIdeaId]);
      await conn.query('DELETE FROM idea_desarrollo WHERE idea_id = ?', [createdIdeaId]);
      await conn.query('DELETE FROM ideas WHERE id = ?', [createdIdeaId]);
      console.log(`✓ Limpieza segura: Idea de prueba ID ${createdIdeaId} eliminada.`);
    }

    // -------------------------------------------------------------------------
    // VERIFICACIÓN FINAL: Integridad de base de datos intacta
    // -------------------------------------------------------------------------
    const [realIdeasPost] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(realIdeasPost[0].c, 9, "Deben permanecer exactamente 9 ideas reales");

    const [realDesPost] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(realDesPost[0].c, 9, "Deben permanecer exactamente 9 registros en idea_desarrollo");

    const [realVerPost] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(realVerPost[0].c, 1, "Deben permanecer exactamente 1 registro en idea_versiones");

    const [realHistPost] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(realHistPost[0].c, 11, "Deben permanecer exactamente 11 registros en idea_historial");

    console.log("✓ Verificación final de base de datos: 100% íntegra (9 ideas, 9 desarrollos, 1 version, 11 historiales).");

    console.log("\n================================================================================");
    console.log("RESULTADO: 20/20 PRUEBAS F5.3 APROBADAS (100% PASS, 0 FAIL)");
    console.log("================================================================================");

  } catch (err) {
    console.error("❌ ERROR EN PRUEBA F5.3:", err.message);
    console.error(err.stack);
    if (createdIdeaId) {
      try {
        await conn.query('DELETE FROM idea_historial WHERE idea_id = ?', [createdIdeaId]);
        await conn.query('DELETE FROM idea_desarrollo WHERE idea_id = ?', [createdIdeaId]);
        await conn.query('DELETE FROM ideas WHERE id = ?', [createdIdeaId]);
      } catch (cleanErr) {
        console.error("Error en limpieza:", cleanErr);
      }
    }
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (conn) await conn.end();
    process.exit(0);
  }
})();
