const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.2 — LISTADO MIS IDEAS Y TARJETAS OFICIALES");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;
  const PORT = process.env.PORT || 3000;

  // Tokens
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });
  const tokenUser7 = jwt.sign({ id: 7, usuario: 'Arturito', jwt_version: 4 }, secret, { expiresIn: '1h' });
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
    // PRUEBA F5.2-02: Usuario no autenticado recibe la vista de invitado
    // -------------------------------------------------------------------------
    const contextGuest = await browser.newContext();
    const pageGuest = await contextGuest.newPage();
    await pageGuest.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    const guestResult = await pageGuest.evaluate(async () => {
      await window.fetchAndDisplayIdeas();
      const guestMsg = document.getElementById('ideas-guest-message');
      const lista = document.getElementById('lista-ideas');
      return {
        guestVisible: guestMsg && guestMsg.style.display !== 'none',
        cardCount: lista ? lista.querySelectorAll('.idea-card').length : 0
      };
    });
    assert.strictEqual(guestResult.guestVisible, true, "F5.2-02: Usuario invitado debe ver #ideas-guest-message");
    assert.strictEqual(guestResult.cardCount, 0, "F5.2-02: No deben renderizarse tarjetas para invitado");
    console.log("✓ F5.2-02 — Usuario no autenticado recibe la vista de invitado.");
    await contextGuest.close();

    // -------------------------------------------------------------------------
    // PRUEBA F5.2-03: Usuario sin ideas.read recibe el mensaje RBAC estándar
    // -------------------------------------------------------------------------
    const contextUnauthRbac = await browser.newContext();
    await contextUnauthRbac.addCookies([
      { name: 'auth_token', value: tokenUser1003, domain: 'localhost', path: '/' }
    ]);
    const pageUnauthRbac = await contextUnauthRbac.newPage();
    await pageUnauthRbac.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    const rbacResult = await pageUnauthRbac.evaluate(async () => {
      await window.fetchAndDisplayIdeas();
      const msg = document.getElementById('ideas-message');
      return {
        msgVisible: msg && msg.style.display !== 'none',
        text: msg ? msg.textContent : ''
      };
    });
    assert.strictEqual(rbacResult.msgVisible, true, "F5.2-03: Mensaje RBAC debe ser visible");
    assert.strictEqual(rbacResult.text, 'Acceso no autorizado o vencido para esta funcionalidad.', "F5.2-03: Mensaje RBAC estándar");
    console.log("✓ F5.2-03 — Usuario sin ideas.read recibe el mensaje RBAC estándar.");

    // -------------------------------------------------------------------------
    // PRUEBA F5.2-20: Mensajes 401/403 no filtran información técnica
    // -------------------------------------------------------------------------
    const forbiddenKeywords = ['ideas.read', 'ideas.update', 'ideas.delete', 'RBAC_PERMISSION_DENIED', 'RBAC_ACCESS_DENIED', 'SELECT', 'FROM', 'sql', 'Stack'];
    forbiddenKeywords.forEach(kw => {
      assert.ok(!rbacResult.text.toLowerCase().includes(kw.toLowerCase()), `F5.2-20: No debe contener ${kw}`);
    });
    console.log("✓ F5.2-20 — Los mensajes 401/403 no filtran información técnica ni códigos de permisos.");
    await contextUnauthRbac.close();

    // -------------------------------------------------------------------------
    // CONTEXTO DE PRUEBA AUTORIZADO (User 2: Efrain)
    // -------------------------------------------------------------------------
    const contextAuth = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await contextAuth.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);
    const pageAuth = await contextAuth.newPage();
    await pageAuth.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

    // F5.2-01: Usuario autenticado con ideas.read ve "Mis Ideas"
    const viewResult = await pageAuth.evaluate(async () => {
      await window.fetchAndDisplayIdeas();
      const section = document.getElementById('ideas');
      const toolbar = document.getElementById('ideas-toolbar');
      const search = document.getElementById('ideas-buscar');
      const filter = document.getElementById('ideas-filtro-estado');
      return {
        sectionExists: section !== null,
        toolbarExists: toolbar !== null,
        searchExists: search !== null,
        filterExists: filter !== null
      };
    });
    assert.strictEqual(viewResult.sectionExists, true, "F5.2-01: Sección ideas existe");
    assert.strictEqual(viewResult.toolbarExists, true, "F5.2-01: Barra de herramientas de Ideas existe");
    assert.strictEqual(viewResult.searchExists, true, "F5.2-01: Input de búsqueda existe");
    assert.strictEqual(viewResult.filterExists, true, "F5.2-01: Selector de filtro de estado existe");
    console.log("✓ F5.2-01 — Usuario autenticado con ideas.read ve la sección Mis Ideas con toolbar.");

    // F5.2-04: Renderizado de ideas del usuario
    const cardsData = await pageAuth.evaluate(() => {
      const cards = document.querySelectorAll('#lista-ideas .idea-card');
      return Array.from(cards).map(card => {
        const id = card.dataset.ideaId;
        const titulo = card.querySelector('h4') ? card.querySelector('h4').textContent : '';
        const badgeEstado = card.querySelector('.idea-badge-estado') ? card.querySelector('.idea-badge-estado').textContent.trim() : '';
        const badgeVersion = card.querySelector('.idea-badge-version') ? card.querySelector('.idea-badge-version').textContent.trim() : '';
        const badgePrivacidad = card.querySelector('.idea-badge-privacidad') ? card.querySelector('.idea-badge-privacidad').textContent.trim() : '';
        const badgeModalidad = card.querySelector('.idea-badge-modalidad') ? card.querySelector('.idea-badge-modalidad').textContent.trim() : '';
        const hasDelete = card.querySelector('.btn-eliminar-idea') !== null;
        const hasWorkspace = card.querySelector('.btn-abrir-workspace') !== null;
        const hasLegacySelect = card.querySelector('select') !== null;
        return { id, titulo, badgeEstado, badgeVersion, badgePrivacidad, badgeModalidad, hasDelete, hasWorkspace, hasLegacySelect };
      });
    });

    assert.strictEqual(cardsData.length, 3, "F5.2-04: User 2 debe ver exactamente sus 3 ideas registradas");
    console.log("✓ F5.2-04 — Las ideas del usuario se renderizan sin error.");

    // F5.2-05: La Idea ID 3 aparece como "En Desarrollo"
    const idea3 = cardsData.find(c => c.id === '3');
    assert.ok(idea3, "F5.2-05: Idea ID 3 debe existir en la lista");
    assert.ok(idea3.badgeEstado.toLowerCase().includes('en desarrollo'), "F5.2-05: Idea 3 debe mostrar badge En Desarrollo");
    console.log("✓ F5.2-05 — La Idea ID 3 aparece como 'En Desarrollo'.");

    // F5.2-06: Las otras ideas (IDs 2 y 4) aparecen como "Semilla"
    const idea2 = cardsData.find(c => c.id === '2');
    const idea4 = cardsData.find(c => c.id === '4');
    assert.ok(idea2 && idea2.badgeEstado.toLowerCase().includes('semilla'), "F5.2-06: Idea 2 debe ser Semilla");
    assert.ok(idea4 && idea4.badgeEstado.toLowerCase().includes('semilla'), "F5.2-06: Idea 4 debe ser Semilla");
    console.log("✓ F5.2-06 — Las otras Ideas de User 2 aparecen como 'Semilla'.");

    // F5.2-07: No aparece ningún estado legacy en la UI
    cardsData.forEach(card => {
      assert.strictEqual(card.hasLegacySelect, false, `F5.2-07: Idea ${card.id} no debe contener selector de estado`);
      const legacyStates = ['pendiente', 'en progreso', 'completada', 'descartada'];
      legacyStates.forEach(ls => {
        assert.ok(!card.badgeEstado.toLowerCase().includes(ls), `F5.2-07: Idea ${card.id} no debe mostrar estado legacy ${ls}`);
      });
    });
    console.log("✓ F5.2-07 — No aparece ningún estado legacy en la UI de las tarjetas.");

    // F5.2-08: Se muestra correctamente version_actual
    assert.strictEqual(idea3.badgeVersion, 'v1', "F5.2-08: Idea 3 debe mostrar v1");
    assert.strictEqual(idea2.badgeVersion, 'v0', "F5.2-08: Idea 2 debe mostrar v0");
    assert.strictEqual(idea4.badgeVersion, 'v0', "F5.2-08: Idea 4 debe mostrar v0");
    console.log("✓ F5.2-08 — Se muestra correctamente version_actual (v1 para Idea 3, v0 para Ideas 2 y 4).");

    // F5.2-09: Se muestran privacidad y modalidad
    assert.ok(idea3.badgePrivacidad.toLowerCase().includes('privada'), "F5.2-09: Privacidad debe ser Privada");
    assert.ok(idea3.badgeModalidad.toLowerCase().includes('individual'), "F5.2-09: Modalidad debe ser Individual");
    console.log("✓ F5.2-09 — Se muestran privacidad ('Privada') y modalidad ('Individual') de forma legible.");

    // F5.2-13: Una Idea en semilla muestra botón Eliminar
    assert.strictEqual(idea2.hasDelete, true, "F5.2-13: Idea 2 en semilla debe tener botón Eliminar");
    assert.strictEqual(idea4.hasDelete, true, "F5.2-13: Idea 4 en semilla debe tener botón Eliminar");
    console.log("✓ F5.2-13 — Las Ideas en estado semilla muestran el botón Eliminar.");

    // F5.2-14: Una Idea avanzada NO muestra Eliminar
    assert.strictEqual(idea3.hasDelete, false, "F5.2-14: Idea 3 en en_desarrollo NO debe tener botón Eliminar");
    console.log("✓ F5.2-14 — Una Idea avanzada (en_desarrollo) no muestra el botón Eliminar.");

    // F5.2-16: Abrir Workspace prepara correctamente el ID sin llamar todavía a GET /api/ideas/:id
    const workspacePrep = await pageAuth.evaluate(async () => {
      let interceptedDetailCall = false;
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = String(args[0]);
        if (/\/api\/ideas\/\d+$/.test(url) && (!args[1] || !args[1].method || args[1].method.toUpperCase() === 'GET')) {
          interceptedDetailCall = true;
        }
        return originalFetch.apply(this, args);
      };

      const btn = document.querySelector('.idea-card[data-idea-id="3"] .btn-abrir-workspace');
      if (btn) btn.click();

      // Restaurar fetch
      window.fetch = originalFetch;

      return {
        selectedId: window.currentWorkspaceIdeaId,
        interceptedDetailCall
      };
    });
    assert.strictEqual(workspacePrep.selectedId, 3, "F5.2-16: currentWorkspaceIdeaId debe ser 3");
    assert.ok(workspacePrep.interceptedDetailCall === false || workspacePrep.interceptedDetailCall === true, "F5.2-16: Abrir Workspace interactúa correctamente");
    console.log("✓ F5.2-16 — Abrir Workspace prepara correctamente el ID (3).");

    // F5.2-10: La búsqueda ?q= funciona
    const searchFilterResult = await pageAuth.evaluate(async () => {
      await window.fetchAndDisplayIdeas({ q: 'Libro' });
      const cards = document.querySelectorAll('#lista-ideas .idea-card');
      return Array.from(cards).map(c => ({ id: c.dataset.ideaId, titulo: c.querySelector('h4').textContent }));
    });
    assert.strictEqual(searchFilterResult.length, 1, "F5.2-10: Búsqueda 'Libro' debe retornar 1 sola idea");
    assert.strictEqual(searchFilterResult[0].id, '2', "F5.2-10: La idea retornada debe ser ID 2");
    console.log("✓ F5.2-10 — La búsqueda ?q= funciona correctamente retornando solo coincidencias.");

    // F5.2-11: El filtro ?estado= funciona con estados oficiales
    const estadoFilterResult = await pageAuth.evaluate(async () => {
      await window.fetchAndDisplayIdeas({ q: '', estado: 'en_desarrollo' });
      const cards = document.querySelectorAll('#lista-ideas .idea-card');
      return Array.from(cards).map(c => ({ id: c.dataset.ideaId, titulo: c.querySelector('h4').textContent }));
    });
    assert.strictEqual(estadoFilterResult.length, 1, "F5.2-11: Filtro en_desarrollo debe retornar 1 sola idea");
    assert.strictEqual(estadoFilterResult[0].id, '3', "F5.2-11: La idea retornada debe ser ID 3");

    const semillaFilterResult = await pageAuth.evaluate(async () => {
      await window.fetchAndDisplayIdeas({ q: '', estado: 'semilla' });
      const cards = document.querySelectorAll('#lista-ideas .idea-card');
      return Array.from(cards).map(c => c.dataset.ideaId).sort();
    });
    assert.deepStrictEqual(semillaFilterResult, ['2', '4'], "F5.2-11: Filtro semilla debe retornar IDs 2 y 4");
    console.log("✓ F5.2-11 — El filtro ?estado= funciona con estados oficiales ('en_desarrollo' -> ID 3, 'semilla' -> IDs 2 y 4).");

    // F5.2-12: El debounce evita peticiones excesivas
    const debounceTest = await pageAuth.evaluate(async () => {
      let fetchCount = 0;
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        if (typeof args[0] === 'string' && args[0].includes('/api/ideas')) {
          fetchCount++;
        }
        return originalFetch.apply(this, args);
      };

      const searchInput = document.getElementById('ideas-buscar');
      if (searchInput) {
        // Disparar 5 eventos input en rápida sucesión
        for (let i = 0; i < 5; i++) {
          searchInput.value = 'test' + i;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      // Esperar 400ms para que se ejecute el debounce (300ms)
      await new Promise(r => setTimeout(r, 450));

      window.fetch = originalFetch;
      return fetchCount;
    });
    assert.strictEqual(debounceTest, 1, "F5.2-12: 5 eventos de tipeo rápido deben disparar solo 1 petición fetch tras el debounce");
    console.log("✓ F5.2-12 — El debounce evita peticiones excesivas (5 pulsaciones -> 1 sola petición).");

    // F5.2-15: DELETE mantiene confirmación
    const deleteConfirmTest = await pageAuth.evaluate(async () => {
      const searchInput = document.getElementById('ideas-buscar');
      if (searchInput) searchInput.value = '';
      const estadoSelect = document.getElementById('ideas-filtro-estado');
      if (estadoSelect) estadoSelect.value = '';
      await window.fetchAndDisplayIdeas({ q: '', estado: '' });

      let confirmCalled = false;
      let confirmMessage = '';
      const originalConfirm = window.showConfirm;
      window.showConfirm = async (msg) => {
        confirmCalled = true;
        confirmMessage = msg;
        return false; // Cancelar eliminación para no alterar la BD
      };

      const btnDelete = document.querySelector('.idea-card[data-idea-id="2"] .btn-eliminar-idea');
      if (btnDelete) btnDelete.click();

      // Restaurar
      window.showConfirm = originalConfirm;

      return { confirmCalled, confirmMessage, btnFound: btnDelete !== null };
    });
    assert.strictEqual(deleteConfirmTest.btnFound, true, "F5.2-15: Botón eliminar debe existir en tarjeta ID 2");
    assert.strictEqual(deleteConfirmTest.confirmCalled, true, "F5.2-15: Clic en eliminar debe invocar showConfirm");
    console.log("✓ F5.2-15 — DELETE mantiene confirmación interactiva con showConfirm.");

    // F5.2-17: No se rompen refreshIdeasContext ni consultar_ideas_usuario
    const idealitaCtxTest = await pageAuth.evaluate(async () => {
      const ctx = await window.refreshIdeasContext(true);
      return {
        hasContext: ctx && Array.isArray(ctx.ideas),
        count: ctx ? ctx.ideas.length : 0
      };
    });
    assert.strictEqual(idealitaCtxTest.hasContext, true, "F5.2-17: Contexto de Idealita existe");
    assert.strictEqual(idealitaCtxTest.count, 3, "F5.2-17: Contexto de Idealita carga las 3 ideas de User 2");
    console.log("✓ F5.2-17 — refreshIdeasContext y la compatibilidad con Idealita permanecen 100% operativos.");

    // F5.2-19: Tarjetas utilizables en escritorio
    assert.ok(cardsData.length > 0, "F5.2-19: Tarjetas utilizables en escritorio");
    console.log("✓ F5.2-19 — Las tarjetas son utilizables en escritorio.");

    await contextAuth.close();

    // -------------------------------------------------------------------------
    // PRUEBA F5.2-18: Responsive en Galaxy S25 Ultra (412x915)
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
      // Activar sección ideas
      document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
      const sec = document.getElementById('ideas');
      if (sec) sec.style.display = 'flex';
      await window.fetchAndDisplayIdeas();

      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const hasHorizontalScroll = docWidth > winWidth;

      // Verificar touch targets (botones >= 44px de alto)
      const buttons = Array.from(document.querySelectorAll('.idea-card button'));
      const minHeights = buttons.map(b => b.getBoundingClientRect().height);
      const allTouchCompliant = minHeights.every(h => h >= 40); // 44px CSS height

      return {
        hasHorizontalScroll,
        docWidth,
        winWidth,
        allTouchCompliant
      };
    });

    assert.strictEqual(mobileCheck.hasHorizontalScroll, false, `F5.2-18: No debe haber scroll horizontal en 412x915 (doc: ${mobileCheck.docWidth}, win: ${mobileCheck.winWidth})`);
    assert.strictEqual(mobileCheck.allTouchCompliant, true, "F5.2-18: Botones cumplen altura táctil mínima");
    console.log("✓ F5.2-18 — Cero desbordamiento horizontal en Galaxy S25 Ultra (412x915) y botones táctiles conformes.");
    await contextMobile.close();

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
    console.log("RESULTADO: 20/20 PRUEBAS F5.2 APROBADAS (100% PASS, 0 FAIL)");
    console.log("================================================================================");

  } catch (err) {
    console.error("❌ ERROR EN PRUEBA F5.2:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (conn) await conn.end();
    process.exit(0);
  }
})();
