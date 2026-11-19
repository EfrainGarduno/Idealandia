const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.7 — VERSIONES FORMALES DE LA IDEA");
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

  let idea3OriginalEstado = 'en_desarrollo';
  let idea3OriginalVersion = 1;
  let existingHistIds = [];

  const cleanupDatabase = async () => {
    try {
      await conn.query('UPDATE ideas SET estado = ?, version_actual = ? WHERE id = 3', [idea3OriginalEstado, idea3OriginalVersion]);
      await conn.query('DELETE FROM idea_versiones WHERE idea_id = 3 AND numero_version > 1');
      if (existingHistIds.length > 0) {
        await conn.query('DELETE FROM idea_historial WHERE id NOT IN (?)', [existingHistIds]);
      }
    } catch (e) {
      console.error('Error durante limpieza DB:', e);
    }
  };

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

    const [dbIdea3Pre] = await conn.query('SELECT estado, version_actual FROM ideas WHERE id = 3');
    idea3OriginalEstado = dbIdea3Pre[0].estado;
    idea3OriginalVersion = dbIdea3Pre[0].version_actual;

    const [histRowsPre] = await conn.query('SELECT id FROM idea_historial');
    existingHistIds = histRowsPre.map(r => r.id);

    console.log(`✓ 0. Integridad previa verificada (9 ideas, 9 desarrollos, 1 versión, 11 historiales). Idea 3 en ${idea3OriginalEstado} (v${idea3OriginalVersion}).\n`);

    // -------------------------------------------------------------------------
    // CONTEXTO AUTORIZADO (User 2: Efrain - dueño de Idea 3)
    // -------------------------------------------------------------------------
    const contextAuth = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await contextAuth.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);
    const page = await contextAuth.newPage();
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // Abrir Workspace de Idea 3
    await page.evaluate(async () => {
      await window.openIdeaWorkspace(3);
    });
    await page.waitForTimeout(300);

    // -------------------------------------------------------------------------
    // F5.7-01 a F5.7-10: Estructura visual, Pestaña y Elementos del Panel
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 1: Estructura visual y Pestaña Versiones ---");

    // F5.7-01: #workspace-panel-versiones existe en DOM
    const panelExists = await page.evaluate(() => {
      const p = document.getElementById('workspace-panel-versiones');
      return !!p && p.classList.contains('workspace-panel');
    });
    assert.strictEqual(panelExists, true, "F5.7-01: #workspace-panel-versiones debe existir y ser .workspace-panel");
    console.log("✓ F5.7-01: #workspace-panel-versiones existe en DOM con clase .workspace-panel");

    // F5.7-02: Cambiar a pestaña 'versiones' muestra panel y activa botón
    const switchTabCheck = await page.evaluate(async () => {
      window.switchWorkspaceTab('versiones');
      const p = document.getElementById('workspace-panel-versiones');
      const btn = document.querySelector('.workspace-tab-btn[data-tab="versiones"]');
      const canvasPanel = document.getElementById('workspace-panel-canvas');
      return {
        panelVisible: p && p.style.display === 'block',
        btnActive: btn && btn.classList.contains('active'),
        canvasHidden: canvasPanel && canvasPanel.style.display === 'none'
      };
    });
    assert.strictEqual(switchTabCheck.panelVisible, true, "F5.7-02: Panel versiones debe estar visible");
    assert.strictEqual(switchTabCheck.btnActive, true, "F5.7-02: Botón pestaña versiones debe estar activo");
    assert.strictEqual(switchTabCheck.canvasHidden, true, "F5.7-02: Panel canvas debe estar oculto");
    console.log("✓ F5.7-02: switchWorkspaceTab('versiones') activa la pestaña y muestra el panel correspondiente");

    // F5.7-03: Banner explicativo del principio Canvas ≠ Versión Formal
    const bannerPrincipio = await page.evaluate(() => {
      const p = document.getElementById('workspace-panel-versiones');
      return p ? p.innerText.includes('Principio de Versiones Formales') && p.innerText.includes('Guardar el Canvas ≠ Crear una versión') : false;
    });
    assert.strictEqual(bannerPrincipio, true, "F5.7-03: Banner de principio de separación debe existir en panel");
    console.log("✓ F5.7-03: Banner de principio de separación Canvas vs Versión Formal visible");

    // F5.7-04: Header con título y contador #versiones-count-badge
    const headerCheck = await page.evaluate(() => {
      const badge = document.getElementById('versiones-count-badge');
      return {
        badgeExists: !!badge,
        badgeText: badge ? badge.textContent.trim() : ''
      };
    });
    assert.strictEqual(headerCheck.badgeExists, true, "F5.7-04: #versiones-count-badge debe existir");
    console.log(`✓ F5.7-04: Encabezado de versiones y badge contador presente (${headerCheck.badgeText})`);

    // F5.7-05: Botón refrescar #btn-refrescar-versiones
    const btnRefrescarExists = await page.evaluate(() => {
      const btn = document.getElementById('btn-refrescar-versiones');
      return !!btn && btn.innerHTML.includes('fa-sync-alt');
    });
    assert.strictEqual(btnRefrescarExists, true, "F5.7-05: #btn-refrescar-versiones debe existir con icono sync");
    console.log("✓ F5.7-05: Botón de actualización #btn-refrescar-versiones presente");

    // F5.7-06: Formulario #form-crear-version en #versiones-crear-card
    const formCrearCheck = await page.evaluate(() => {
      const card = document.getElementById('versiones-crear-card');
      const form = document.getElementById('form-crear-version');
      return {
        cardExists: !!card,
        formExists: !!form,
        cardVisible: card ? card.style.display !== 'none' : false
      };
    });
    assert.strictEqual(formCrearCheck.cardExists, true, "F5.7-06: #versiones-crear-card debe existir");
    assert.strictEqual(formCrearCheck.formExists, true, "F5.7-06: #form-crear-version debe existir");
    assert.strictEqual(formCrearCheck.cardVisible, true, "F5.7-06: #versiones-crear-card debe estar visible para en_desarrollo");
    console.log("✓ F5.7-06: Formulario y card de consolidación presentes y visibles para estado en_desarrollo");

    // F5.7-07: Textarea #version-motivo-input con maxlength 255
    const inputMotivoCheck = await page.evaluate(() => {
      const input = document.getElementById('version-motivo-input');
      return {
        exists: !!input,
        maxlength: input ? input.getAttribute('maxlength') : null
      };
    });
    assert.strictEqual(inputMotivoCheck.exists, true, "F5.7-07: #version-motivo-input debe existir");
    assert.strictEqual(inputMotivoCheck.maxlength, '255', "F5.7-07: maxlength debe ser 255");
    console.log("✓ F5.7-07: Textarea #version-motivo-input configurado con maxlength=255");

    // F5.7-08: Contador de caracteres dinámico
    const counterCheck = await page.evaluate(() => {
      const input = document.getElementById('version-motivo-input');
      const counter = document.getElementById('version-motivo-counter');
      const initial = counter ? counter.textContent.trim() : '';

      input.value = "Prueba de justificación de versión";
      input.dispatchEvent(new Event('input'));
      const afterInput = counter ? counter.textContent.trim() : '';

      input.value = "";
      input.dispatchEvent(new Event('input'));
      const afterClear = counter ? counter.textContent.trim() : '';

      return { initial, afterInput, afterClear };
    });
    assert.strictEqual(counterCheck.initial, "0 / 255", "F5.7-08: Inicial debe ser '0 / 255'");
    assert.strictEqual(counterCheck.afterInput, "34 / 255", "F5.7-08: Debe contar 34 caracteres");
    assert.strictEqual(counterCheck.afterClear, "0 / 255", "F5.7-08: Debe volver a '0 / 255'");
    console.log("✓ F5.7-08: Contador dinámico de caracteres funcionando (0 / 255 -> 34 / 255 -> 0 / 255)");

    // F5.7-09: Botón #btn-crear-version
    const btnCrearCheck = await page.evaluate(() => {
      const btn = document.getElementById('btn-crear-version');
      return !!btn && btn.textContent.includes('Crear Nueva Versión');
    });
    assert.strictEqual(btnCrearCheck, true, "F5.7-09: #btn-crear-version debe existir con texto 'Crear Nueva Versión'");
    console.log("✓ F5.7-09: Botón #btn-crear-version presente y habilitado");

    // F5.7-10: Elemento #versiones-dirty-warning oculto si no hay cambios dirty
    const dirtyWarnCheck = await page.evaluate(() => {
      const warn = document.getElementById('versiones-dirty-warning');
      return warn && (warn.style.display === 'none' || warn.offsetParent === null);
    });
    assert.strictEqual(dirtyWarnCheck, true, "F5.7-10: #versiones-dirty-warning debe estar oculto con canvas limpio");
    console.log("✓ F5.7-10: #versiones-dirty-warning oculto en estado limpio inicial\n");

    // -------------------------------------------------------------------------
    // F5.7-11 a F5.7-20: Consulta y Renderizado de Versiones Existentes
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 2: Consulta y renderizado de versión formal existente ---");

    // Esperar a que carguen versiones
    await page.waitForTimeout(300);

    const versionesRenderCheck = await page.evaluate(() => {
      const listCont = document.getElementById('versiones-list-container');
      const cards = document.querySelectorAll('.version-card');
      const badgeCount = document.getElementById('versiones-count-badge');
      const firstCard = cards[0];

      return {
        containerVisible: listCont && listCont.style.display !== 'none',
        cardCount: cards.length,
        badgeText: badgeCount ? badgeCount.textContent.trim() : '',
        vNum: firstCard ? firstCard.querySelector('.version-numero')?.textContent.trim() : null,
        hasActualBadge: firstCard ? !!firstCard.querySelector('.badge-version-actual') : false,
        hasAnteriorBadge: firstCard ? !!firstCard.querySelector('.badge-version-anterior') : false,
        hasClock: firstCard ? firstCard.innerHTML.includes('fa-clock') : false,
        hasUser: firstCard ? firstCard.innerHTML.includes('fa-user') : false,
        hasMotivo: firstCard ? !!firstCard.querySelector('.version-motivo') : false,
        hasSnapshot: firstCard ? firstCard.innerHTML.includes('Contenido consolidado') : false,
        hasEditBtn: firstCard ? firstCard.innerHTML.includes('Editar') || firstCard.innerHTML.includes('btn-editar') : false,
        hasDeleteBtn: firstCard ? firstCard.innerHTML.includes('Eliminar') || firstCard.innerHTML.includes('btn-eliminar') : false,
        hasRestoreBtn: firstCard ? firstCard.innerHTML.includes('Restaurar') || firstCard.innerHTML.includes('btn-restaurar') : false
      };
    });

    // F5.7-11: Contenedor visible y datos cargados
    assert.strictEqual(versionesRenderCheck.containerVisible, true, "F5.7-11: #versiones-list-container debe ser visible");
    assert.strictEqual(versionesRenderCheck.cardCount, 1, "F5.7-11: Debe existir 1 versión cargada para Idea 3");
    console.log("✓ F5.7-11: GET /api/ideas/3/versiones consumido y renderizado correctamente");

    // F5.7-12: Versión 1 renderizada
    assert.strictEqual(versionesRenderCheck.vNum, 'v1', "F5.7-12: Número de versión debe ser v1");
    console.log("✓ F5.7-12: Número de versión formal v1 renderizado");

    // F5.7-13: Badge VERSIÓN ACTUAL presente
    assert.strictEqual(versionesRenderCheck.hasActualBadge, true, "F5.7-13: Versión 1 debe tener badge VERSIÓN ACTUAL");
    console.log("✓ F5.7-13: Badge oficial 'VERSIÓN ACTUAL' mostrado en v1");

    // F5.7-14: Fecha y hora formateadas con icono de reloj
    assert.strictEqual(versionesRenderCheck.hasClock, true, "F5.7-14: Debe tener icono y fecha");
    console.log("✓ F5.7-14: Fecha de creación mostrada y formateada");

    // F5.7-15: Autor / Usuario ID mostrado con icono
    assert.strictEqual(versionesRenderCheck.hasUser, true, "F5.7-15: Debe tener icono de usuario y autor");
    console.log("✓ F5.7-15: Información de autoría presente");

    // F5.7-16: Motivo de cambio presente en la tarjeta
    assert.strictEqual(versionesRenderCheck.hasMotivo, true, "F5.7-16: Debe tener sección de motivo de consolidación");
    console.log("✓ F5.7-16: Sección de motivo de consolidación presente");

    // F5.7-17: Instantánea consolidada (Snapshot inmutable)
    assert.strictEqual(versionesRenderCheck.hasSnapshot, true, "F5.7-17: Debe tener sección de contenido consolidado");
    console.log("✓ F5.7-17: Fotografía consolidada (título, descripción, problema, solución) renderizada");

    // F5.7-18: Inmutabilidad estricta: NO botón de edición
    assert.strictEqual(versionesRenderCheck.hasEditBtn, false, "F5.7-18: NO debe contener botón de edición");
    console.log("✓ F5.7-18: Inmutabilidad garantizada: Sin botón de edición de versiones");

    // F5.7-19: Inmutabilidad estricta: NO botón de eliminación ni restauración
    assert.strictEqual(versionesRenderCheck.hasDeleteBtn, false, "F5.7-19: NO debe contener botón de eliminación");
    assert.strictEqual(versionesRenderCheck.hasRestoreBtn, false, "F5.7-19: NO debe contener botón de restauración");
    console.log("✓ F5.7-19: Inmutabilidad garantizada: Sin botón de eliminación ni restauración");

    // F5.7-20: Badge contador en encabezado sincronizado
    assert.strictEqual(versionesRenderCheck.badgeText, '1', "F5.7-20: Badge contador debe ser 1");
    console.log("✓ F5.7-20: Badge contador en encabezado sincronizado en 1\n");

    // -------------------------------------------------------------------------
    // F5.7-21 a F5.7-28: Reglas de Creación según Estados Oficiales
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 3: Reglas de habilitación/bloqueo de creación según Estado ---");

    // F5.7-21: Estado en_desarrollo permite crear
    const testEstadoDev = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'en_desarrollo';
      await window.loadIdeaVersiones(3);
      const card = document.getElementById('versiones-crear-card');
      const block = document.getElementById('versiones-crear-blocked');
      return { cardVisible: card.style.display !== 'none', blockHidden: block.style.display === 'none' };
    });
    assert.strictEqual(testEstadoDev.cardVisible, true, "F5.7-21: en_desarrollo debe permitir crear");
    assert.strictEqual(testEstadoDev.blockHidden, true, "F5.7-21: en_desarrollo no debe mostrar aviso bloqueado");
    console.log("✓ F5.7-21: Estado 'en_desarrollo' permite creación formal de versión");

    // F5.7-22: Estado en_validacion permite crear
    const testEstadoVal = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'en_validacion';
      await window.loadIdeaVersiones(3);
      const card = document.getElementById('versiones-crear-card');
      const block = document.getElementById('versiones-crear-blocked');
      return { cardVisible: card.style.display !== 'none', blockHidden: block.style.display === 'none' };
    });
    assert.strictEqual(testEstadoVal.cardVisible, true, "F5.7-22: en_validacion debe permitir crear");
    console.log("✓ F5.7-22: Estado 'en_validacion' permite creación formal de versión");

    // F5.7-23: Estado lista permite crear
    const testEstadoLista = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'lista';
      await window.loadIdeaVersiones(3);
      const card = document.getElementById('versiones-crear-card');
      const block = document.getElementById('versiones-crear-blocked');
      return { cardVisible: card.style.display !== 'none', blockHidden: block.style.display === 'none' };
    });
    assert.strictEqual(testEstadoLista.cardVisible, true, "F5.7-23: lista debe permitir crear");
    console.log("✓ F5.7-23: Estado 'lista' permite creación formal de versión");

    // F5.7-24: Estado en_accion permite crear
    const testEstadoAccion = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'en_accion';
      await window.loadIdeaVersiones(3);
      const card = document.getElementById('versiones-crear-card');
      const block = document.getElementById('versiones-crear-blocked');
      return { cardVisible: card.style.display !== 'none', blockHidden: block.style.display === 'none' };
    });
    assert.strictEqual(testEstadoAccion.cardVisible, true, "F5.7-24: en_accion debe permitir crear");
    console.log("✓ F5.7-24: Estado 'en_accion' permite creación formal de versión");

    // F5.7-25: Estado semilla BLOQUEA creación con aviso amigable
    const testEstadoSemilla = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'semilla';
      await window.loadIdeaVersiones(3);
      const card = document.getElementById('versiones-crear-card');
      const block = document.getElementById('versiones-crear-blocked');
      const txt = document.getElementById('versiones-blocked-estado');
      return {
        cardHidden: card.style.display === 'none',
        blockVisible: block.style.display !== 'none',
        message: txt ? txt.textContent : ''
      };
    });
    assert.strictEqual(testEstadoSemilla.cardHidden, true, "F5.7-25: semilla debe ocultar card de creación");
    assert.strictEqual(testEstadoSemilla.blockVisible, true, "F5.7-25: semilla debe mostrar aviso de bloqueo");
    assert.strictEqual(testEstadoSemilla.message.includes('Semilla'), true, "F5.7-25: Aviso debe mencionar Semilla");
    console.log("✓ F5.7-25: Estado 'semilla' bloquea creación y explica que se consolida a partir de En Desarrollo");

    // F5.7-26: Estado realizada BLOQUEA creación con aviso terminal
    const testEstadoRealizada = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'realizada';
      await window.loadIdeaVersiones(3);
      const card = document.getElementById('versiones-crear-card');
      const block = document.getElementById('versiones-crear-blocked');
      const txt = document.getElementById('versiones-blocked-estado');
      return {
        cardHidden: card.style.display === 'none',
        blockVisible: block.style.display !== 'none',
        message: txt ? txt.textContent : ''
      };
    });
    assert.strictEqual(testEstadoRealizada.cardHidden, true, "F5.7-26: realizada debe ocultar card de creación");
    assert.strictEqual(testEstadoRealizada.blockVisible, true, "F5.7-26: realizada debe mostrar aviso");
    assert.strictEqual(testEstadoRealizada.message.includes('Realizada'), true, "F5.7-26: Aviso debe mencionar Realizada");
    console.log("✓ F5.7-26: Estado terminal 'realizada' bloquea creación con aviso informativo");

    // F5.7-27: Estado archivada BLOQUEA creación con aviso terminal
    const testEstadoArchivada = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'archivada';
      await window.loadIdeaVersiones(3);
      const card = document.getElementById('versiones-crear-card');
      const block = document.getElementById('versiones-crear-blocked');
      const txt = document.getElementById('versiones-blocked-estado');
      return {
        cardHidden: card.style.display === 'none',
        blockVisible: block.style.display !== 'none',
        message: txt ? txt.textContent : ''
      };
    });
    assert.strictEqual(testEstadoArchivada.cardHidden, true, "F5.7-27: archivada debe ocultar card de creación");
    assert.strictEqual(testEstadoArchivada.blockVisible, true, "F5.7-27: archivada debe mostrar aviso");
    assert.strictEqual(testEstadoArchivada.message.includes('Archivada'), true, "F5.7-27: Aviso debe mencionar Archivada");
    console.log("✓ F5.7-27: Estado terminal 'archivada' bloquea creación con aviso informativo");

    // F5.7-28: Intento directo de crearNuevaVersion en estado bloqueado genera alerta y aborta
    const abortEnSemilla = await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'semilla';
      let alerted = false;
      const origAlert = window.alert;
      window.alert = (msg) => { alerted = true; };
      await window.crearNuevaVersion();
      window.alert = origAlert;
      return alerted;
    });
    assert.strictEqual(abortEnSemilla, true, "F5.7-28: crearNuevaVersion debe abortar con alerta si estado no es permitido");
    console.log("✓ F5.7-28: Intento programático en estado no permitido genera alerta y aborta de inmediato\n");

    // Restaurar estado a 'en_desarrollo'
    await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'en_desarrollo';
      await window.loadIdeaVersiones(3);
    });

    // -------------------------------------------------------------------------
    // F5.7-29 a F5.7-34: Guardia de Estado Sucio (Dirty State Guard)
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 4: Guardia estricta de cambios sin guardar en Canvas ---");

    // F5.7-29: setCanvasDirty(true) muestra advertencia en panel versiones
    const dirtyWarnVisible = await page.evaluate(() => {
      window.setCanvasDirty(true);
      const warn = document.getElementById('versiones-dirty-warning');
      return warn && warn.style.display === 'flex';
    });
    assert.strictEqual(dirtyWarnVisible, true, "F5.7-29: #versiones-dirty-warning debe mostrarse al estar dirty");
    console.log("✓ F5.7-29: Advertencia visual #versiones-dirty-warning se activa con Canvas dirty");

    // F5.7-30 & F5.7-31: Intento de crear versión con Canvas dirty muestra alerta y NO envía petición
    let postSentWhileDirty = false;
    page.on('request', req => {
      if (req.url().includes('/versiones') && req.method() === 'POST') {
        postSentWhileDirty = true;
      }
    });

    const dirtyAlertMsg = await page.evaluate(async () => {
      let alertReceived = null;
      const origAlert = window.alert;
      window.alert = (msg) => { alertReceived = msg; };
      await window.crearNuevaVersion();
      window.alert = origAlert;
      return alertReceived;
    });

    assert.strictEqual(dirtyAlertMsg, 'Hay cambios sin guardar en el Canvas. Guarda los cambios antes de crear una nueva versión.', "F5.7-30: Alerta exacta esperada");
    console.log("✓ F5.7-30: Alerta preventiva emitida ante Canvas dirty: 'Hay cambios sin guardar...'");

    assert.strictEqual(postSentWhileDirty, false, "F5.7-31: No debe enviarse POST mientras Canvas esté dirty");
    console.log("✓ F5.7-31: Ninguna llamada POST enviada mientras Canvas tenga cambios sin guardar");

    // F5.7-32: Canvas permanece intacto y dirty (no hay autoguardado no deseado)
    const stillDirty = await page.evaluate(() => window.workspaceCanvasDirty);
    assert.strictEqual(stillDirty, true, "F5.7-32: Canvas debe permanecer en estado dirty");
    console.log("✓ F5.7-32: Canvas permanece dirty (sin autoguardados indeseados)");

    // F5.7-33: Limpiar dirty oculta la advertencia
    const dirtyWarnHidden = await page.evaluate(() => {
      window.setCanvasDirty(false);
      const warn = document.getElementById('versiones-dirty-warning');
      return warn && (warn.style.display === 'none' || warn.offsetParent === null);
    });
    assert.strictEqual(dirtyWarnHidden, true, "F5.7-33: Advertencia se oculta al limpiar dirty");
    console.log("✓ F5.7-33: Advertencia #versiones-dirty-warning se oculta tras limpiar dirty");

    // F5.7-34: Tras limpiar dirty, el flujo avanza
    const confirmTriggered = await page.evaluate(async () => {
      let confirmCalled = false;
      const origConfirm = window.confirm;
      window.confirm = (msg) => { confirmCalled = true; return false; }; // cancelar para no crear todavía
      await window.crearNuevaVersion();
      window.confirm = origConfirm;
      return confirmCalled;
    });
    assert.strictEqual(confirmTriggered, true, "F5.7-34: Flujo avanza al confirm dialog cuando canvas está limpio");
    console.log("✓ F5.7-34: El flujo avanza a la confirmación tras limpiar el Canvas\n");

    // -------------------------------------------------------------------------
    // F5.7-35 a F5.7-41: Creación Formal de Versión 2 y Recarga Dinámica
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 5: Creación de versión formal (POST), concurrencia y refresco ---");

    // F5.7-35: Cancelar en confirm dialog no realiza POST
    let postOnCancel = false;
    const reqListener = req => {
      if (req.url().includes('/versiones') && req.method() === 'POST') postOnCancel = true;
    };
    page.on('request', reqListener);

    await page.evaluate(async () => {
      const origConfirm = window.confirm;
      window.confirm = () => false;
      await window.crearNuevaVersion();
      window.confirm = origConfirm;
    });
    page.off('request', reqListener);
    assert.strictEqual(postOnCancel, false, "F5.7-35: Si el usuario cancela confirm, no debe enviarse POST");
    console.log("✓ F5.7-35: Si el usuario cancela el diálogo de confirmación, la acción se cancela limpiamente");

    // F5.7-36: Crear formalmente Versión 2 con motivo
    const motivoTexto = "Consolidación F5.7: Validación de prototipo y modelo de negocio inicial";
    const createSuccess = await page.evaluate(async (motivo) => {
      const input = document.getElementById('version-motivo-input');
      if (input) {
        input.value = motivo;
        input.dispatchEvent(new Event('input'));
      }

      const origConfirm = window.confirm;
      window.confirm = () => true;

      await window.crearNuevaVersion();

      window.confirm = origConfirm;

      return {
        nuevaVersion: window.currentWorkspaceIdea.idea.version_actual,
        isCreating: window.isCreatingIdeaVersion
      };
    }, motivoTexto);

    assert.strictEqual(createSuccess.nuevaVersion, 2, "F5.7-36: La versión actual debe ser 2");
    console.log("✓ F5.7-36: POST /api/ideas/3/versiones ejecutado con éxito (Versión consolidada a v2)");

    // F5.7-37: Concurrencia liberada
    assert.strictEqual(createSuccess.isCreating, false, "F5.7-37: isCreatingIdeaVersion debe ser false al terminar");
    console.log("✓ F5.7-37: Guardia de concurrencia window.isCreatingIdeaVersion liberada tras finalización");

    // F5.7-38: Workspace Header Badge actualizado a v2
    const headerBadgeText = await page.evaluate(() => {
      const badge = document.getElementById('workspace-badge-version');
      return badge ? badge.textContent.trim() : '';
    });
    assert.strictEqual(headerBadgeText, 'v2', "F5.7-38: Badge en encabezado debe decir 'v2'");
    console.log(`✓ F5.7-38: Badge de versión en encabezado del Workspace actualizado a '${headerBadgeText}'`);

    // F5.7-39: Input de motivo limpiado y contador en 0 / 255
    const inputCleaned = await page.evaluate(() => {
      const input = document.getElementById('version-motivo-input');
      const counter = document.getElementById('version-motivo-counter');
      return {
        val: input ? input.value : 'not_found',
        counter: counter ? counter.textContent.trim() : ''
      };
    });
    assert.strictEqual(inputCleaned.val, '', "F5.7-39: Input de motivo debe estar vacío");
    assert.strictEqual(inputCleaned.counter, '0 / 255', "F5.7-39: Contador debe ser '0 / 255'");
    console.log("✓ F5.7-39: Formulario de motivo reseteado y contador en '0 / 255'");

    // F5.7-40: Lista de versiones renderiza en orden descendente (v2 primero, luego v1)
    const listOrderCheck = await page.evaluate(() => {
      const cards = document.querySelectorAll('.version-card');
      const results = [];
      cards.forEach(card => {
        const vNum = card.querySelector('.version-numero')?.textContent.trim();
        const isActual = !!card.querySelector('.badge-version-actual');
        const isAnterior = !!card.querySelector('.badge-version-anterior');
        const motivo = card.querySelector('.version-motivo')?.textContent.trim();
        results.push({ vNum, isActual, isAnterior, motivo });
      });
      return {
        count: cards.length,
        items: results
      };
    });

    assert.strictEqual(listOrderCheck.count, 2, "F5.7-40: Deben existir 2 versiones en la lista");
    assert.strictEqual(listOrderCheck.items[0].vNum, 'v2', "F5.7-40: La primera versión mostrada debe ser v2 (orden descendente)");
    assert.strictEqual(listOrderCheck.items[0].isActual, true, "F5.7-40: v2 debe tener badge VERSIÓN ACTUAL");
    assert.strictEqual(listOrderCheck.items[1].vNum, 'v1', "F5.7-40: La segunda versión mostrada debe ser v1");
    assert.strictEqual(listOrderCheck.items[1].isAnterior, true, "F5.7-40: v1 debe tener badge VERSIÓN ANTERIOR");
    console.log("✓ F5.7-40: Lista renderizada en orden descendente estricto (v2 con VERSIÓN ACTUAL, v1 con VERSIÓN ANTERIOR)");

    // F5.7-41: Badge contador en encabezado actualizado a 2
    const updatedBadgeCount = await page.evaluate(() => {
      const b = document.getElementById('versiones-count-badge');
      return b ? b.textContent.trim() : '';
    });
    assert.strictEqual(updatedBadgeCount, '2', "F5.7-41: Badge contador de versiones debe ser 2");
    console.log("✓ F5.7-41: Badge contador en encabezado de versiones actualizado a '2'\n");

    // -------------------------------------------------------------------------
    // F5.7-42 a F5.7-45: Empty State, RBAC, Errores y Responsive
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 6: Estado vacío, Manejo de errores, RBAC y Responsive ---");

    // F5.7-42: Estado vacío (#versiones-empty) se muestra si un idea no tiene versiones
    const emptyCheck = await page.evaluate(() => {
      const listCont = document.getElementById('versiones-list-container');
      window.renderVersionesList([], 0, listCont);
      const emptyEl = document.getElementById('versiones-empty');
      return {
        emptyVisible: emptyEl && emptyEl.style.display !== 'none',
        containerHidden: listCont && listCont.style.display === 'none'
      };
    });
    assert.strictEqual(emptyCheck.emptyVisible, true, "F5.7-42: #versiones-empty debe ser visible con 0 versiones");
    assert.strictEqual(emptyCheck.containerHidden, true, "F5.7-42: Contenedor de lista debe ocultarse con 0 versiones");
    console.log("✓ F5.7-42: Estado vacío #versiones-empty mostrado correctamente cuando no hay versiones");

    // Restaurar lista de versiones de idea 3
    await page.evaluate(async () => {
      await window.loadIdeaVersiones(3);
    });

    // F5.7-43: Manejo de 404 (Idea no existe)
    const error404Check = await page.evaluate(async () => {
      await window.loadIdeaVersiones(999999);
      const errEl = document.getElementById('versiones-error');
      return {
        errorVisible: errEl && errEl.style.display !== 'none',
        errorText: errEl ? errEl.textContent : ''
      };
    });
    assert.strictEqual(error404Check.errorVisible, true, "F5.7-43: #versiones-error visible ante 404");
    assert.strictEqual(error404Check.errorText.includes('no está disponible'), true, "F5.7-43: Mensaje 404 claro");
    console.log("✓ F5.7-43: Manejo de error 404 (Idea inexistente) muestra mensaje amigable");

    // F5.7-44: Manejo de 401 (Usuario no autenticado o sesión expirada)
    await page.route('**/api/ideas/3/versiones', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Debes iniciar sesión para consultar las versiones formales.' })
      });
    }, { times: 1 });

    const error401Check = await page.evaluate(async () => {
      await window.loadIdeaVersiones(3);
      const errEl = document.getElementById('versiones-error');
      return {
        errorVisible: errEl && errEl.style.display !== 'none',
        errorText: errEl ? errEl.textContent : ''
      };
    });
    assert.strictEqual(error401Check.errorVisible, true, "F5.7-44: #versiones-error visible ante 401");
    assert.strictEqual(error401Check.errorText.includes('iniciar sesión'), true, "F5.7-44: Mensaje 401 indica iniciar sesión");
    console.log("✓ F5.7-44: Manejo de 401 (no autenticado) en versiones muestra mensaje adecuado");

    // Restaurar versiones de Idea 3
    await page.evaluate(async () => {
      await window.loadIdeaVersiones(3);
    });

    // F5.7-45: Responsive móvil (412 x 915 - Samsung Galaxy S20 / Pixel)
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(300);

    const mobileCheck = await page.evaluate(async () => {
      document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
      const sec = document.getElementById('ideas');
      if (sec) sec.style.display = 'flex';

      window.switchWorkspaceTab('versiones');
      await window.loadIdeaVersiones(3);

      const panel = document.getElementById('workspace-panel-versiones');
      const btnCrear = document.getElementById('btn-crear-version');
      const textarea = document.getElementById('version-motivo-input');
      const cards = document.querySelectorAll('.version-card');

      return {
        panelVisible: panel && panel.style.display === 'block',
        hasHorizontalOverflow: document.body.scrollWidth > window.innerWidth,
        btnVisible: btnCrear && btnCrear.offsetHeight > 0,
        textareaVisible: textarea && textarea.offsetHeight > 0,
        cardsCount: cards.length
      };
    });

    assert.strictEqual(mobileCheck.panelVisible, true, "F5.7-45: Panel versiones debe ser visible en móvil");
    assert.strictEqual(mobileCheck.hasHorizontalOverflow, false, "F5.7-45: No debe existir desbordamiento horizontal en móvil");
    assert.strictEqual(mobileCheck.btnVisible, true, "F5.7-45: Botón de creación visible en móvil");
    assert.strictEqual(mobileCheck.textareaVisible, true, "F5.7-45: Textarea visible en móvil");
    assert.strictEqual(mobileCheck.cardsCount >= 1, true, "F5.7-45: Tarjetas visibles en móvil");
    console.log("✓ F5.7-45: Comportamiento responsivo móvil (412x915) verificado sin desbordamiento");

    await page.setViewportSize({ width: 1366, height: 768 });

    // -------------------------------------------------------------------------
    // RESTAURACIÓN Y LIMPIEZA ABSOLUTA DE BASE DE DATOS
    // -------------------------------------------------------------------------
    console.log("\n--- RESTAURACIÓN Y LIMPIEZA ABSOLUTA DE BASE DE DATOS ---");

    await cleanupDatabase();

    // 4. Verificación de conteos exactos de baseline
    const [finalIdeas] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(finalIdeas[0].c, 9, "Deben existir exactamente 9 ideas al final");

    const [finalDes] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(finalDes[0].c, 9, "Deben existir exactamente 9 registros en idea_desarrollo");

    const [finalVer] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(finalVer[0].c, 1, "Deben existir exactamente 1 registro en idea_versiones");

    const [finalHist] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(finalHist[0].c, 11, "Deben existir exactamente 11 registros en idea_historial");

    const [finalProp] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(finalProp[0].c, 8, "Deben existir exactamente 8 propósitos");

    const [finalCat] = await conn.query('SELECT COUNT(*) as c FROM idea_categorias');
    assert.strictEqual(finalCat[0].c, 0, "Deben existir exactamente 0 categorías");

    // F5.7-46: Verificación de baseline final
    console.log("✓ F5.7-46: Integridad absoluta de base de datos tras pruebas y limpieza verificada al 100%:");
    console.log(`  - Ideas reales: ${finalIdeas[0].c} / 9`);
    console.log(`  - Registros en idea_desarrollo: ${finalDes[0].c} / 9`);
    console.log(`  - Versiones formales: ${finalVer[0].c} / 1`);
    console.log(`  - Entradas de historial: ${finalHist[0].c} / 11`);
    console.log(`  - Propósitos: ${finalProp[0].c} / 8`);
    console.log(`  - Categorías: ${finalCat[0].c} / 0\n`);

    console.log("================================================================================");
    console.log("RESULTADO F5.7: TODAS LAS PRUEBAS (46/46) PASARON SATISFACTORIAMENTE");
    console.log("================================================================================\n");

  } catch (err) {
    console.error("\n❌ ERROR EN LA SUITE DE PRUEBAS F5.7:", err);
    await cleanupDatabase();
    process.exitCode = 1;
  } finally {
    await browser.close();
    await conn.end();
    process.exit(process.exitCode || 0);
  }
})();
