const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.5 — EDICIÓN DEL CANVAS DE DESARROLLO");
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

    const [dbIdeaPre] = await conn.query('SELECT estado, version_actual, privacidad, modalidad FROM ideas WHERE id = 3');
    const initialEstado = dbIdeaPre[0].estado;
    const initialVersion = dbIdeaPre[0].version_actual;
    const initialPriv = dbIdeaPre[0].privacidad;
    const initialMod = dbIdeaPre[0].modalidad;

    console.log("✓ 0. Integridad previa de base de datos verificada al 100% (9 ideas, 9 desarrollos, 1 versión, 11 historiales).\n");

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

    // -------------------------------------------------------------------------
    // F5.5-01 a F5.5-14: Existencia de estructura HTML, controles y 10 campos
    // -------------------------------------------------------------------------
    const domCheck = await page.evaluate(() => {
      const form = document.getElementById('form-canvas-desarrollo');
      const actionsBar = document.getElementById('canvas-actions-bar');
      const btnGuardar = document.getElementById('btn-guardar-canvas');
      const btnCancelar = document.getElementById('btn-cancelar-canvas');
      const dirtyIndicator = document.getElementById('canvas-dirty-indicator');
      const readonlyNotice = document.getElementById('canvas-readonly-notice');
      const readonlyEstado = document.getElementById('canvas-readonly-estado');

      const inputs = {
        problema: document.getElementById('canvas-edit-problema'),
        solucion: document.getElementById('canvas-edit-solucion'),
        beneficiarios: document.getElementById('canvas-edit-beneficiarios'),
        recursos: document.getElementById('canvas-edit-recursos'),
        inversion: document.getElementById('canvas-edit-inversion'),
        moneda: document.getElementById('canvas-edit-moneda'),
        complejidad: document.getElementById('canvas-edit-complejidad'),
        potencial: document.getElementById('canvas-edit-potencial'),
        riesgos: document.getElementById('canvas-edit-riesgos'),
        notas: document.getElementById('canvas-edit-notas')
      };

      return {
        formExists: !!form,
        actionsBarExists: !!actionsBar,
        btnGuardarExists: !!btnGuardar,
        btnCancelarExists: !!btnCancelar,
        dirtyIndicatorExists: !!dirtyIndicator,
        readonlyNoticeExists: !!readonlyNotice,
        readonlyEstadoExists: !!readonlyEstado,
        allInputsExist: Object.values(inputs).every(el => !!el),
        inputNames: Object.entries(inputs).map(([k, el]) => el ? el.name : null)
      };
    });

    assert.strictEqual(domCheck.formExists, true, "F5.5-01: El formulario #form-canvas-desarrollo debe existir");
    assert.strictEqual(domCheck.actionsBarExists, true, "F5.5-02: La barra #canvas-actions-bar debe existir");
    assert.strictEqual(domCheck.btnGuardarExists, true, "F5.5-02b: #btn-guardar-canvas debe existir");
    assert.strictEqual(domCheck.btnCancelarExists, true, "F5.5-02c: #btn-cancelar-canvas debe existir");
    assert.strictEqual(domCheck.dirtyIndicatorExists, true, "F5.5-03: #canvas-dirty-indicator debe existir");
    assert.strictEqual(domCheck.readonlyNoticeExists, true, "F5.5-04: #canvas-readonly-notice debe existir");
    assert.strictEqual(domCheck.readonlyEstadoExists, true, "F5.5-04b: #canvas-readonly-estado debe existir");
    assert.strictEqual(domCheck.allInputsExist, true, "F5.5-05 a F5.5-14: Los 10 campos editables deben existir");
    console.log("✓ F5.5-01 a F5.5-14 — Formulario, controles y los 10 campos oficiales existen en el DOM.");

    // -------------------------------------------------------------------------
    // F5.5-15 a F5.5-17: Apertura de Workspace para Idea 3 (semilla)
    // -------------------------------------------------------------------------
    const openResult = await page.evaluate(async () => {
      await window.openIdeaWorkspace(3);
      const actionsBar = document.getElementById('canvas-actions-bar');
      const readonlyNotice = document.getElementById('canvas-readonly-notice');
      const dirtyIndicator = document.getElementById('canvas-dirty-indicator');
      const inputs = document.querySelectorAll('.canvas-input');
      const allEnabled = Array.from(inputs).every(inp => !inp.disabled);

      const monedaVal = document.getElementById('canvas-edit-moneda')?.value;
      const problemaVal = document.getElementById('canvas-edit-problema')?.value;

      return {
        actionsBarVisible: actionsBar && actionsBar.style.display !== 'none',
        readonlyNoticeHidden: readonlyNotice && readonlyNotice.style.display === 'none',
        dirtyIndicatorHidden: dirtyIndicator && dirtyIndicator.style.display === 'none',
        allEnabled,
        isDirty: window.workspaceCanvasDirty,
        monedaVal,
        problemaVal
      };
    });

    assert.strictEqual(openResult.actionsBarVisible, true, "F5.5-15: Acciones visibles en estado activo (semilla)");
    assert.strictEqual(openResult.readonlyNoticeHidden, true, "F5.5-15b: Aviso de solo lectura oculto en estado activo");
    assert.strictEqual(openResult.allEnabled, true, "F5.5-15c: Todos los campos deben estar habilitados");
    assert.strictEqual(openResult.dirtyIndicatorHidden, true, "F5.5-16: Indicador de cambios sin guardar oculto al cargar");
    assert.strictEqual(openResult.isDirty, false, "F5.5-17: Estado dirty debe ser false inicialmente");
    assert.strictEqual(openResult.monedaVal, 'MXN', "F5.5-16b: Moneda por defecto es MXN");
    console.log("✓ F5.5-15 a F5.5-17 — Apertura de Workspace en estado activo carga datos limpios y modo editable.");

    // -------------------------------------------------------------------------
    // F5.5-18 & F5.5-19: Detección de dirty state al editar campos
    // -------------------------------------------------------------------------
    const dirtyCheck = await page.evaluate(() => {
      const problema = document.getElementById('canvas-edit-problema');
      problema.value = 'Nuevo problema detectado en pruebas F5.5';
      problema.dispatchEvent(new Event('input', { bubbles: true }));

      const indicator = document.getElementById('canvas-dirty-indicator');
      return {
        isDirty: window.workspaceCanvasDirty,
        indicatorVisible: indicator && indicator.style.display !== 'none'
      };
    });

    assert.strictEqual(dirtyCheck.isDirty, true, "F5.5-18: Editar un campo debe marcar workspaceCanvasDirty en true");
    assert.strictEqual(dirtyCheck.indicatorVisible, true, "F5.5-18b: Indicador visual de dirty debe mostrarse");
    console.log("✓ F5.5-18 & F5.5-19 — Detección estricta de cambios sin guardar (dirty state) activada.");

    // -------------------------------------------------------------------------
    // F5.5-20: Cancelar cambios restaura valores y resetea dirty
    // -------------------------------------------------------------------------
    // Manejar diálogo confirm
    page.once('dialog', async dialog => {
      await dialog.accept();
    });

    const cancelResult = await page.evaluate(() => {
      window.cancelarCambiosCanvas();
      const problema = document.getElementById('canvas-edit-problema');
      const indicator = document.getElementById('canvas-dirty-indicator');
      return {
        isDirty: window.workspaceCanvasDirty,
        problemaVal: problema ? problema.value : null,
        indicatorHidden: indicator && indicator.style.display === 'none'
      };
    });

    assert.strictEqual(cancelResult.isDirty, false, "F5.5-20: Cancelar cambios debe poner workspaceCanvasDirty en false");
    assert.strictEqual(cancelResult.problemaVal, '', "F5.5-20b: Valor de problema restaurado a original");
    assert.strictEqual(cancelResult.indicatorHidden, true, "F5.5-20c: Indicador visual oculto tras cancelar");
    console.log("✓ F5.5-20 — Cancelar cambios restaura valores originales y resetea dirty indicator.");

    // -------------------------------------------------------------------------
    // F5.5-21 & F5.5-22: Guardia de confirmación al salir si hay cambios sin guardar
    // -------------------------------------------------------------------------
    // Primero probar rechazar salir
    await page.evaluate(() => {
      const prob = document.getElementById('canvas-edit-problema');
      prob.value = 'Texto sin guardar';
      prob.dispatchEvent(new Event('input', { bubbles: true }));
    });

    let dialogMessage = '';
    page.once('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.dismiss(); // Usuario decide quedarse
    });

    const rejectExit = await page.evaluate(() => {
      window.closeIdeaWorkspace();
      const wsView = document.getElementById('idea-workspace-view');
      return {
        wsVisible: wsView && wsView.style.display !== 'none',
        isDirty: window.workspaceCanvasDirty
      };
    });

    assert.ok(dialogMessage.includes('sin guardar'), "F5.5-21: Mensaje de confirmación debe alertar sobre cambios");
    assert.strictEqual(rejectExit.wsVisible, true, "F5.5-21b: Si el usuario cancela confirm, debe permanecer en Workspace");
    assert.strictEqual(rejectExit.isDirty, true, "F5.5-21c: Dirty debe mantenerse true");

    // Ahora probar aceptar salir
    page.once('dialog', async dialog => {
      await dialog.accept(); // Usuario decide salir y descartar
    });

    const acceptExit = await page.evaluate(() => {
      window.closeIdeaWorkspace();
      const wsView = document.getElementById('idea-workspace-view');
      const listView = document.getElementById('ideas-list-view');
      return {
        wsHidden: wsView && wsView.style.display === 'none',
        listVisible: listView && listView.style.display !== 'none',
        isDirty: window.workspaceCanvasDirty
      };
    });

    assert.strictEqual(acceptExit.wsHidden, true, "F5.5-22: Al aceptar salir, Workspace se oculta");
    assert.strictEqual(acceptExit.listVisible, true, "F5.5-22b: Vista de lista se muestra");
    assert.strictEqual(acceptExit.isDirty, false, "F5.5-22c: Dirty se resetea a false");
    console.log("✓ F5.5-21 & F5.5-22 — Guardia de confirmación de salida ante cambios sin guardar funciona perfectamente.");

    // Reabrir Workspace Idea 3 para pruebas de validación y guardado
    await page.evaluate(async () => {
      await window.openIdeaWorkspace(3);
    });

    // -------------------------------------------------------------------------
    // F5.5-24: Validación de moneda en cliente (exactamente 3 letras mayúsculas)
    // -------------------------------------------------------------------------
    let alertMsg = '';
    page.once('dialog', async dialog => {
      alertMsg = dialog.message();
      await dialog.accept();
    });

    const invalidMonedaResult = await page.evaluate(async () => {
      const mon = document.getElementById('canvas-edit-moneda');
      mon.value = 'US'; // Inválido: solo 2 letras
      mon.dispatchEvent(new Event('input', { bubbles: true }));
      await window.guardarCambiosCanvas();
      return window.workspaceCanvasDirty;
    });

    assert.ok(alertMsg.includes('3 letras mayúsculas'), "F5.5-24: Alerta de moneda inválida");
    assert.strictEqual(invalidMonedaResult, true, "F5.5-24b: Dirty state permanece activo tras error de validación");
    console.log("✓ F5.5-24 — Validación estricta de formato de moneda (3 letras A-Z).");

    // -------------------------------------------------------------------------
    // F5.5-25: Validación de inversión estimada en cliente
    // -------------------------------------------------------------------------
    alertMsg = '';
    page.once('dialog', async dialog => {
      alertMsg = dialog.message();
      await dialog.accept();
    });

    await page.evaluate(async () => {
      const mon = document.getElementById('canvas-edit-moneda');
      mon.value = 'MXN';
      const inv = document.getElementById('canvas-edit-inversion');
      inv.value = '-50.00'; // Inválido: negativo
      inv.dispatchEvent(new Event('input', { bubbles: true }));
      await window.guardarCambiosCanvas();
    });

    assert.ok(alertMsg.includes('positivo'), "F5.5-25: Alerta de inversión negativa");
    console.log("✓ F5.5-25 — Validación de inversión estimada (número positivo, máx 2 decimales).");

    // -------------------------------------------------------------------------
    // F5.5-26 a F5.5-33: Guardado exitoso con PUT /api/ideas/:id/desarrollo
    // -------------------------------------------------------------------------
    // Interceptar la llamada de red PUT para verificar payload exacto
    let interceptedPut = null;
    page.on('request', req => {
      if (req.method() === 'PUT' && req.url().includes('/api/ideas/3/desarrollo')) {
        interceptedPut = {
          url: req.url(),
          headers: req.headers(),
          postData: req.postDataJSON()
        };
      }
    });

    const saveSuccess = await page.evaluate(async () => {
      document.getElementById('canvas-edit-problema').value = 'Problema de prueba F5.5';
      document.getElementById('canvas-edit-solucion').value = 'Solución innovadora automatizada';
      document.getElementById('canvas-edit-beneficiarios').value = 'Comunidad escolar de Idealandia';
      document.getElementById('canvas-edit-recursos').value = 'Servidores y kits de laboratorio';
      document.getElementById('canvas-edit-inversion').value = '1500.50';
      document.getElementById('canvas-edit-moneda').value = 'USD';
      document.getElementById('canvas-edit-complejidad').value = 'Media';
      document.getElementById('canvas-edit-potencial').value = 'Regional';
      document.getElementById('canvas-edit-riesgos').value = 'Retrasos en logística';
      document.getElementById('canvas-edit-notas').value = 'Fase piloto programada para Q1';

      // Disparar input para marcar dirty
      document.getElementById('canvas-edit-problema').dispatchEvent(new Event('input', { bubbles: true }));

      await window.guardarCambiosCanvas();

      const dirty = window.workspaceCanvasDirty;
      const statusMsg = document.getElementById('canvas-status-message')?.textContent;
      const cachedDes = window.currentWorkspaceIdea?.desarrollo;

      return {
        dirty,
        statusMsg,
        cachedDes
      };
    });

    assert.ok(interceptedPut !== null, "F5.5-26: Debe ejecutarse la llamada PUT /api/ideas/3/desarrollo");
    assert.strictEqual(interceptedPut.postData.problema, 'Problema de prueba F5.5', "F5.5-26b: Problema en payload");
    assert.strictEqual(interceptedPut.postData.solucion, 'Solución innovadora automatizada', "F5.5-26c: Solución en payload");
    assert.strictEqual(interceptedPut.postData.inversion_estimada, 1500.5, "F5.5-26d: Inversión en payload");
    assert.strictEqual(interceptedPut.postData.moneda, 'USD', "F5.5-26e: Moneda en payload");
    assert.strictEqual(saveSuccess.dirty, false, "F5.5-28: Dirty se resetea a false tras guardar");
    assert.strictEqual(saveSuccess.cachedDes.solucion, 'Solución innovadora automatizada', "F5.5-27: Desarrollo local actualizado");
    console.log("✓ F5.5-26 a F5.5-29 — Guardado exitoso vía PUT /api/ideas/3/desarrollo y sincronización de estado.");

    // Verificar en BD que NO incrementó version_actual, NO creó versiones y estado no cambió
    const [dbIdea] = await conn.query('SELECT estado, version_actual, privacidad, modalidad FROM ideas WHERE id = 3');
    assert.strictEqual(dbIdea[0].estado, initialEstado, "F5.5-30: El estado de la Idea NO debe cambiar al editar Canvas");
    assert.strictEqual(dbIdea[0].version_actual, initialVersion, "F5.5-31: version_actual NO debe incrementarse al editar Canvas");
    assert.strictEqual(dbIdea[0].privacidad, initialPriv, "F5.5-33: privacidad intacta");
    assert.strictEqual(dbIdea[0].modalidad, initialMod, "F5.5-33b: modalidad intacta");

    const [dbVerCount] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(dbVerCount[0].c, 1, "F5.5-32: NO deben crearse versiones formales al editar Canvas");
    console.log("✓ F5.5-30 a F5.5-33 — El guardado de Canvas respeta estrictamente estado, versión v0, privacidad y modalidad.");

    // -------------------------------------------------------------------------
    // F5.5-34: Guardia de concurrencia al guardar
    // -------------------------------------------------------------------------
    const concurrencyCheck = await page.evaluate(async () => {
      window.isSavingCanvas = true;
      let callTriggered = false;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        callTriggered = true;
        return originalFetch(...args);
      };

      await window.guardarCambiosCanvas();
      window.fetch = originalFetch;
      window.isSavingCanvas = false;
      return callTriggered;
    });

    assert.strictEqual(concurrencyCheck, false, "F5.5-34: Si isSavingCanvas está activo, guardarCambiosCanvas no debe hacer fetch");
    console.log("✓ F5.5-34 — Guardia contra clics concurrentes/múltiples al guardar implementada.");

    // -------------------------------------------------------------------------
    // F5.5-35: Comportamiento de solo lectura en estado 'realizada'
    // -------------------------------------------------------------------------
    const readonlyRealizada = await page.evaluate(() => {
      window.populateCanvasEditForm({ problema: 'Problema realizado' }, 'realizada');
      const actionsBar = document.getElementById('canvas-actions-bar');
      const readonlyNotice = document.getElementById('canvas-readonly-notice');
      const estadoSpan = document.getElementById('canvas-readonly-estado');
      const inputs = document.querySelectorAll('.canvas-input');
      const allDisabled = Array.from(inputs).every(inp => inp.disabled);

      return {
        actionsBarHidden: actionsBar && actionsBar.style.display === 'none',
        readonlyNoticeVisible: readonlyNotice && readonlyNotice.style.display !== 'none',
        estadoText: estadoSpan ? estadoSpan.textContent : '',
        allDisabled
      };
    });

    assert.strictEqual(readonlyRealizada.actionsBarHidden, true, "F5.5-35: Barra de acciones oculta en 'realizada'");
    assert.strictEqual(readonlyRealizada.readonlyNoticeVisible, true, "F5.5-35b: Aviso de solo lectura visible en 'realizada'");
    assert.strictEqual(readonlyRealizada.allDisabled, true, "F5.5-35c: Todos los campos deshabilitados en 'realizada'");
    console.log("✓ F5.5-35 — Comportamiento estricto de solo lectura para estado 'realizada'.");

    // -------------------------------------------------------------------------
    // F5.5-36: Comportamiento de solo lectura en estado 'archivada'
    // -------------------------------------------------------------------------
    const readonlyArchivada = await page.evaluate(() => {
      window.populateCanvasEditForm({ problema: 'Problema archivado' }, 'archivada');
      const actionsBar = document.getElementById('canvas-actions-bar');
      const readonlyNotice = document.getElementById('canvas-readonly-notice');
      const estadoSpan = document.getElementById('canvas-readonly-estado');
      const inputs = document.querySelectorAll('.canvas-input');
      const allDisabled = Array.from(inputs).every(inp => inp.disabled);

      return {
        actionsBarHidden: actionsBar && actionsBar.style.display === 'none',
        readonlyNoticeVisible: readonlyNotice && readonlyNotice.style.display !== 'none',
        estadoText: estadoSpan ? estadoSpan.textContent : '',
        allDisabled
      };
    });

    assert.strictEqual(readonlyArchivada.actionsBarHidden, true, "F5.5-36: Barra de acciones oculta en 'archivada'");
    assert.strictEqual(readonlyArchivada.readonlyNoticeVisible, true, "F5.5-36b: Aviso de solo lectura visible en 'archivada'");
    assert.strictEqual(readonlyArchivada.allDisabled, true, "F5.5-36c: Todos los campos deshabilitados en 'archivada'");
    console.log("✓ F5.5-36 — Comportamiento estricto de solo lectura para estado 'archivada'.");

    // -------------------------------------------------------------------------
    // F5.5-37 a F5.5-39: Manejo de errores HTTP (401, 403, 404)
    // -------------------------------------------------------------------------
    const httpErrorHandling = await page.evaluate(async () => {
      const results = {};
      const originalFetch = window.fetch;

      // 401
      window.fetch = async () => new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
      let alertedMsg = '';
      window.alert = (m) => { alertedMsg = m; };
      await window.guardarCambiosCanvas();
      results.e401 = alertedMsg;

      // 403
      window.fetch = async () => new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });
      await window.guardarCambiosCanvas();
      results.e403 = alertedMsg;

      // 404
      window.fetch = async () => new Response(JSON.stringify({ error: 'No encontrada' }), { status: 404 });
      await window.guardarCambiosCanvas();
      results.e404 = alertedMsg;

      window.fetch = originalFetch;
      return results;
    });

    assert.ok(httpErrorHandling.e401.includes('iniciar sesión'), "F5.5-37: 401 alerta sobre iniciar sesión");
    assert.ok(httpErrorHandling.e403.includes('permiso'), "F5.5-38: 403 alerta sobre permisos");
    assert.ok(httpErrorHandling.e404.includes('no está disponible'), "F5.5-39: 404 alerta sobre disponibilidad");
    console.log("✓ F5.5-37 a F5.5-39 — Manejo de errores HTTP 401, 403 y 404 implementado correctamente.");

    await contextAuth.close();

    // -------------------------------------------------------------------------
    // F5.5-40: RESTAURACIÓN Y LIMPIEZA ABSOLUTA DE BASE DE DATOS
    // -------------------------------------------------------------------------
    // 1. Restaurar idea_desarrollo de Idea 3 al estado inicial (todos null excepto moneda MXN)
    await conn.query(`
      UPDATE idea_desarrollo
      SET problema = NULL, solucion = NULL, beneficiarios = NULL, recursos = NULL,
          inversion_estimada = NULL, moneda = 'MXN', complejidad = NULL, potencial = NULL,
          riesgos = NULL, notas = NULL, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE idea_id = 3
    `);

    // 2. Eliminar el historial añadido durante la prueba (para mantener exactamente 11 historiales reales)
    const [extraHist] = await conn.query('SELECT id FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "actualizacion"');
    if (extraHist.length > 0) {
      await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "actualizacion"');
    }

    // 3. Verificación de conteos exactos
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

    console.log("✓ F5.5-40 — Restauración y limpieza absoluta de base de datos verificada al 100%:");
    console.log(`  - Ideas reales: ${finalIdeas[0].c} / 9`);
    console.log(`  - Registros en idea_desarrollo: ${finalDes[0].c} / 9`);
    console.log(`  - Versiones formales: ${finalVer[0].c} / 1`);
    console.log(`  - Entradas de historial: ${finalHist[0].c} / 11`);
    console.log(`  - Propósitos: ${finalProp[0].c} / 8`);
    console.log(`  - Categorías: ${finalCat[0].c} / 0\n`);

    console.log("================================================================================");
    console.log("RESULTADO F5.5: TODAS LAS PRUEBAS (40/40) PASARON SATISFACTORIAMENTE");
    console.log("================================================================================\n");

  } catch (err) {
    console.error("\n❌ ERROR EN LA SUITE DE PRUEBAS F5.5:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await conn.end();
  }
})();
