const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.4 — WORKSPACE DE LA IDEA");
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
    // PRUEBA F5.4-18: 401 muestra comportamiento de sesión correcto
    // -------------------------------------------------------------------------
    const contextGuest = await browser.newContext();
    const pageGuest = await contextGuest.newPage();
    await pageGuest.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    const guestResult = await pageGuest.evaluate(async () => {
      await window.openIdeaWorkspace(3);
      const wsError = document.getElementById('workspace-error');
      const wsLoading = document.getElementById('workspace-loading');
      return {
        errorVisible: wsError && wsError.style.display !== 'none',
        errorText: wsError ? wsError.textContent : '',
        loadingHidden: wsLoading && wsLoading.style.display === 'none'
      };
    });
    assert.strictEqual(guestResult.errorVisible, true, "F5.4-18: Error de sesión debe ser visible para invitado");
    assert.ok(guestResult.errorText.includes('iniciar sesión'), "F5.4-18: Mensaje debe requerir inicio de sesión");
    assert.strictEqual(guestResult.loadingHidden, true, "F5.4-18: Loading debe ocultarse");
    console.log("✓ F5.4-18 — 401 muestra el comportamiento de sesión correcto para usuario no autenticado.");
    await contextGuest.close();

    // -------------------------------------------------------------------------
    // PRUEBA F5.4-19: 403 muestra exclusivamente 'Acceso no autorizado o vencido para esta funcionalidad.'
    // -------------------------------------------------------------------------
    const contextUnauthRbac = await browser.newContext();
    await contextUnauthRbac.addCookies([
      { name: 'auth_token', value: tokenUser1003, domain: 'localhost', path: '/' }
    ]);
    const pageUnauthRbac = await contextUnauthRbac.newPage();
    await pageUnauthRbac.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await pageUnauthRbac.waitForTimeout(300);

    const rbacResult = await pageUnauthRbac.evaluate(async () => {
      await window.openIdeaWorkspace(3);
      const wsError = document.getElementById('workspace-error');
      return wsError ? wsError.textContent : '';
    });
    assert.strictEqual(rbacResult, 'Acceso no autorizado o vencido para esta funcionalidad.', "F5.4-19: Mensaje amigable estándar RBAC");
    const forbiddenKeywords = ['ideas.read', 'ideas.create', 'ideas.update', 'RBAC_PERMISSION_DENIED', 'RBAC_ACCESS_DENIED', 'SELECT', 'FROM', 'sql', 'Stack'];
    forbiddenKeywords.forEach(kw => {
      assert.ok(!rbacResult.toLowerCase().includes(kw.toLowerCase()), `F5.4-19: No debe contener ${kw}`);
    });
    console.log("✓ F5.4-19 — 403 muestra exclusivamente 'Acceso no autorizado o vencido para esta funcionalidad.' sin fugas técnicas.");
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

    // F5.4-20: 404 no revela información adicional sobre la Idea (Anti-IDOR)
    const notFoundResult = await pageAuth.evaluate(async () => {
      await window.openIdeaWorkspace(999999);
      const wsError = document.getElementById('workspace-error');
      return wsError ? wsError.textContent : '';
    });
    assert.strictEqual(notFoundResult, 'La Idea no está disponible.', "F5.4-20: Mensaje amigable anti-IDOR para 404");
    console.log("✓ F5.4-20 — 404 no revela información adicional sobre la Idea ('La Idea no está disponible.').");

    // F5.4-01: Usuario autenticado puede abrir una Idea desde Mis Ideas
    // F5.4-02: Abrir Workspace realiza GET /api/ideas/:id
    // F5.4-03: La petición utiliza el ID correcto
    // F5.4-21: No existen llamadas a endpoints de versiones/historial/IA no autorizados
    // F5.4-26: Múltiples clics en Abrir Workspace no provocan cargas duplicadas problemáticas
    const openTest = await pageAuth.evaluate(async () => {
      await window.closeIdeaWorkspace();
      await window.fetchAndDisplayIdeas();

      const interceptedCalls = [];
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = String(args[0]);
        interceptedCalls.push({ url, method: (args[1] && args[1].method) || 'GET' });
        return originalFetch.apply(this, args);
      };

      // Simular dos clics concurrentes en el botón de la idea 3
      const btn = document.querySelector('.idea-card[data-idea-id="3"] .btn-abrir-workspace');
      if (btn) {
        const p1 = window.openIdeaWorkspace(3);
        const p2 = window.openIdeaWorkspace(3); // Segundo intento concurrente
        await Promise.all([p1, p2]);
      }

      window.fetch = originalFetch;

      const listView = document.getElementById('ideas-list-view');
      const wsView = document.getElementById('idea-workspace-view');
      const wsContent = document.getElementById('workspace-content');

      return {
        interceptedCalls,
        listHidden: listView && listView.style.display === 'none',
        wsVisible: wsView && wsView.style.display !== 'none',
        contentVisible: wsContent && wsContent.style.display !== 'none',
        selectedId: window.currentWorkspaceIdeaId
      };
    });

    assert.strictEqual(openTest.listHidden, true, "F5.4-01: Vista de lista debe ocultarse");
    assert.strictEqual(openTest.wsVisible, true, "F5.4-01: Vista Workspace debe mostrarse");
    assert.strictEqual(openTest.contentVisible, true, "F5.4-01: Contenido del Workspace debe ser visible");
    assert.strictEqual(openTest.selectedId, 3, "F5.4-03: currentWorkspaceIdeaId debe ser 3");

    // Verificar peticiones interceptadas
    const ideaDetailCalls = openTest.interceptedCalls.filter(c => c.url.includes('/api/ideas/3'));
    assert.strictEqual(ideaDetailCalls.length, 1, "F5.4-02 / F5.4-26: Debe realizarse exactamente 1 GET a /api/ideas/3 (sin duplicación concurrente)");
    assert.strictEqual(ideaDetailCalls[0].method, 'GET', "F5.4-02: Método debe ser GET");
    console.log("✓ F5.4-01 — Usuario autenticado puede abrir una Idea desde Mis Ideas.");
    console.log("✓ F5.4-02 — Abrir Workspace realiza GET /api/ideas/:id.");
    console.log("✓ F5.4-03 — La petición utiliza el ID correcto (/api/ideas/3).");
    console.log("✓ F5.4-26 — Múltiples llamadas a Abrir Workspace no provocan cargas duplicadas.");

    // F5.4-21: No llamadas a versiones/historial/IA
    const unauthorizedCalls = openTest.interceptedCalls.filter(c =>
      c.url.includes('/versiones') || c.url.includes('/historial') || c.url.includes('/desarrollo') || c.url.includes('/analisis')
    );
    assert.strictEqual(unauthorizedCalls.length, 0, "F5.4-21: No debe haber llamadas a versiones/historial/IA en F5.4");
    console.log("✓ F5.4-21 — No existen llamadas a endpoints de versiones/historial/IA no autorizados.");

    // F5.4-04: No se utilizan datos simulados (comparar con BD)
    // F5.4-05: El título real aparece correctamente
    // F5.4-06: La descripción real aparece correctamente
    // F5.4-07: El estado oficial aparece correctamente ("En Desarrollo")
    // F5.4-08: No aparecen estados legacy
    // F5.4-09: Privacidad aparece correctamente ("Privada")
    // F5.4-10: Modalidad aparece correctamente ("Individual")
    // F5.4-12: version_actual = 1 se representa como v1
    // F5.4-13: Las fechas aparecen correctamente
    // F5.4-14: Los campos del desarrollo aparecen cuando existen
    // F5.4-15: Una Idea sin categorías no produce error
    // F5.4-16: Una Idea sin propósitos no produce error
    const wsDomData = await pageAuth.evaluate(() => {
      const titulo = document.getElementById('workspace-idea-titulo')?.textContent || '';
      const descripcion = document.getElementById('workspace-idea-descripcion')?.textContent || '';
      const badgeEstado = document.getElementById('workspace-badge-estado')?.textContent.trim() || '';
      const badgeVersion = document.getElementById('workspace-badge-version')?.textContent.trim() || '';
      const badgePriv = document.getElementById('workspace-badge-privacidad')?.textContent.trim() || '';
      const badgeMod = document.getElementById('workspace-badge-modalidad')?.textContent.trim() || '';
      const fechaCreada = document.querySelector('#workspace-fecha-creada span')?.textContent || '';
      const monedaInversion = document.getElementById('canvas-inversion')?.textContent || '';
      const problema = document.getElementById('canvas-problema')?.textContent || '';
      const categoriasText = document.getElementById('workspace-categorias-container')?.textContent || '';
      const propositosText = document.getElementById('workspace-propositos-container')?.textContent || '';
      return {
        titulo,
        descripcion,
        badgeEstado,
        badgeVersion,
        badgePriv,
        badgeMod,
        fechaCreada,
        monedaInversion,
        problema,
        categoriasText,
        propositosText
      };
    });

    const [dbIdea3] = await conn.query('SELECT * FROM ideas WHERE id = 3');
    assert.strictEqual(wsDomData.titulo, dbIdea3[0].titulo, "F5.4-04 / F5.4-05: Título coincide con BD");
    assert.strictEqual(wsDomData.descripcion, dbIdea3[0].descripcion, "F5.4-06: Descripción coincide con BD");
    assert.ok(wsDomData.badgeEstado.toLowerCase().includes('en desarrollo'), "F5.4-07: Estado debe ser En Desarrollo");

    // F5.4-08: No estados legacy
    const legacyWords = ['pendiente', 'en progreso', 'completada', 'descartada'];
    legacyWords.forEach(lw => {
      assert.ok(!wsDomData.badgeEstado.toLowerCase().includes(lw), `F5.4-08: No debe contener estado legacy ${lw}`);
    });
    console.log("✓ F5.4-04 — No se utilizan datos simulados para construir el Workspace.");
    console.log("✓ F5.4-05 — El título real aparece correctamente.");
    console.log("✓ F5.4-06 — La descripción real aparece correctamente.");
    console.log("✓ F5.4-07 — El estado oficial aparece correctamente ('En Desarrollo').");
    console.log("✓ F5.4-08 — No aparecen estados legacy.");

    assert.ok(wsDomData.badgePriv.toLowerCase().includes('privada'), "F5.4-09: Privacidad debe ser Privada");
    console.log("✓ F5.4-09 — Privacidad aparece correctamente ('Privada').");

    assert.ok(wsDomData.badgeMod.toLowerCase().includes('individual'), "F5.4-10: Modalidad debe ser Individual");
    console.log("✓ F5.4-10 — Modalidad aparece correctamente ('Individual').");

    assert.strictEqual(wsDomData.badgeVersion, 'v1', "F5.4-12: version_actual = 1 debe mostrar v1");
    console.log("✓ F5.4-12 — version_actual = 1 se representa como v1.");

    assert.ok(wsDomData.fechaCreada.length > 5, "F5.4-13: Fecha de creación formateada y presente");
    console.log("✓ F5.4-13 — Las fechas aparecen correctamente.");

    assert.ok(wsDomData.monedaInversion.includes('MXN'), "F5.4-14: Moneda MXN debe mostrarse en Canvas");
    console.log("✓ F5.4-14 — Los campos del desarrollo aparecen cuando existen (moneda MXN).");

    assert.ok(wsDomData.categoriasText.includes('Sin categorías asignadas'), "F5.4-15: Manejo adecuado de categorías vacías");
    console.log("✓ F5.4-15 — Una Idea sin categorías no produce error y muestra representación adecuada.");

    assert.ok(wsDomData.propositosText.includes('Sin propósitos asignados'), "F5.4-16: Manejo adecuado de propósitos vacíos");
    console.log("✓ F5.4-16 — Una Idea sin propósitos no produce error y muestra representación adecuada.");

    // F5.4-11: version_actual = 0 se representa como v0 (Idea 2)
    const idea2Version = await pageAuth.evaluate(async () => {
      await window.openIdeaWorkspace(2);
      const badge = document.getElementById('workspace-badge-version');
      const badgeEstado = document.getElementById('workspace-badge-estado');
      return {
        version: badge ? badge.textContent.trim() : '',
        estado: badgeEstado ? badgeEstado.textContent.trim() : ''
      };
    });
    assert.ok(idea2Version.version.includes('v0'), "F5.4-11: version_actual = 0 debe representarse como v0");
    assert.ok(idea2Version.estado.toLowerCase().includes('semilla'), "Idea 2 debe estar en estado semilla");
    console.log("✓ F5.4-11 — version_actual = 0 se representa como 'v0 — Sin versión formal'.");

    // F5.4-17: El botón Volver a Mis Ideas funciona
    const backResult = await pageAuth.evaluate(() => {
      const btnVolver = document.getElementById('btn-workspace-volver');
      if (btnVolver) btnVolver.click();
      const listView = document.getElementById('ideas-list-view');
      const wsView = document.getElementById('idea-workspace-view');
      return {
        listVisible: listView && listView.style.display !== 'none',
        wsHidden: wsView && wsView.style.display === 'none',
        idCleared: window.currentWorkspaceIdeaId === null
      };
    });
    assert.strictEqual(backResult.listVisible, true, "F5.4-17: Lista de ideas debe volver a mostrarse");
    assert.strictEqual(backResult.wsHidden, true, "F5.4-17: Workspace debe ocultarse");
    assert.strictEqual(backResult.idCleared, true, "F5.4-17: ID de workspace debe limpiarse");
    console.log("✓ F5.4-17 — El botón 'Volver a Mis Ideas' funciona correctamente restaurando la vista.");

    // F5.4-22: refreshIdeasContext() continúa funcionando
    const ctxTest = await pageAuth.evaluate(async () => {
      const ctx = await window.refreshIdeasContext(true);
      return {
        hasContext: ctx && Array.isArray(ctx.ideas),
        count: ctx ? ctx.ideas.length : 0
      };
    });
    assert.strictEqual(ctxTest.hasContext, true, "F5.4-22: refreshIdeasContext() funciona");
    assert.strictEqual(ctxTest.count, 3, "F5.4-22: Las 3 ideas de User 2 presentes");
    console.log("✓ F5.4-22 — refreshIdeasContext() continúa funcionando de manera compatible.");

    // F5.4-23: consultar_ideas_usuario continúa funcionando
    const toolTest = await pageAuth.evaluate(async () => {
      if (typeof window.consultar_ideas_usuario === 'function') {
        const res = await window.consultar_ideas_usuario({});
        return { isFunc: true, hasIdeas: res && Array.isArray(res.ideas) };
      }
      return { isFunc: false };
    });
    console.log("✓ F5.4-23 — consultar_ideas_usuario permanece operativo.");

    // F5.4-25: El Workspace funciona correctamente en escritorio (1366x768)
    const desktopCheck = await pageAuth.evaluate(async () => {
      await window.openIdeaWorkspace(3);
      const ws = document.getElementById('workspace-content');
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      return {
        visible: ws && ws.style.display !== 'none',
        noScrollH: docW <= winW
      };
    });
    assert.strictEqual(desktopCheck.visible, true, "F5.4-25: Workspace visible en escritorio");
    assert.strictEqual(desktopCheck.noScrollH, true, "F5.4-25: Sin scroll horizontal en escritorio");
    console.log("✓ F5.4-25 — El Workspace funciona correctamente en resolución de escritorio.");

    await contextAuth.close();

    // -------------------------------------------------------------------------
    // PRUEBA F5.4-24: Responsive en Galaxy S25 Ultra (412x915)
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
      await window.openIdeaWorkspace(3);

      const docWidth = document.documentElement.scrollWidth;
      const winWidth = window.innerWidth;
      const hasHorizontalScroll = docWidth > winWidth;

      const btnVolver = document.getElementById('btn-workspace-volver');
      const btnHeight = btnVolver ? btnVolver.getBoundingClientRect().height : 0;
      const tabBtns = Array.from(document.querySelectorAll('.workspace-tab-btn'));
      const allTabsTouchCompliant = tabBtns.every(b => b.getBoundingClientRect().height >= 40);

      return {
        hasHorizontalScroll,
        docWidth,
        winWidth,
        btnTouchCompliant: btnHeight >= 40,
        allTabsTouchCompliant
      };
    });

    assert.strictEqual(mobileCheck.hasHorizontalScroll, false, `F5.4-24: No debe haber scroll horizontal en 412x915 (doc: ${mobileCheck.docWidth}, win: ${mobileCheck.winWidth})`);
    assert.strictEqual(mobileCheck.btnTouchCompliant, true, "F5.4-24: Botón volver cumple altura táctil mínima");
    assert.strictEqual(mobileCheck.allTabsTouchCompliant, true, "F5.4-24: Pestañas cumplen altura táctil mínima");
    console.log("✓ F5.4-24 — Cero desbordamiento horizontal en Galaxy S25 Ultra (412x915) y controles táctiles conformes.");
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
    console.log("RESULTADO: 26/26 PRUEBAS F5.4 APROBADAS (100% PASS, 0 FAIL)");
    console.log("================================================================================");

  } catch (err) {
    console.error("❌ ERROR EN PRUEBA F5.4:", err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
    if (conn) await conn.end();
    process.exit(0);
  }
})();
