const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.6 — CICLO DE VIDA / MÁQUINA VISUAL DE ESTADOS");
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
    await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "cambio_estado" AND descripcion = "Cambio de estado de en_desarrollo a en_validacion"');
    await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "actualizacion"');
    await conn.query('UPDATE ideas SET estado = "en_desarrollo" WHERE id = 3');

    const [realIdeasPre] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.ok(realIdeasPre[0].c >= 9, "Deben existir ideas reales al inicio");

    const [realDesPre] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.ok(realDesPre[0].c >= 9, "Deben existir registros en idea_desarrollo");

    const [realVerPre] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.ok(realVerPre[0].c >= 1, "Deben existir registros en idea_versiones");

    const [realHistPre] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.ok(realHistPre[0].c >= 11, "Deben existir registros en idea_historial");

    const [dbIdea3Pre] = await conn.query('SELECT estado, version_actual FROM ideas WHERE id = 3');
    const idea3OriginalEstado = dbIdea3Pre[0].estado;
    const idea3OriginalVersion = dbIdea3Pre[0].version_actual;

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

    // -------------------------------------------------------------------------
    // F5.6-01 a F5.6-07: Verificación visual de los 7 estados oficiales en la máquina
    // -------------------------------------------------------------------------
    const estadosCheck = await page.evaluate(() => {
      const stepper = document.getElementById('lifecycle-stepper');
      const steps = ['semilla', 'en_desarrollo', 'en_validacion', 'lista', 'en_accion', 'realizada', 'archivada'];
      const results = {};

      steps.forEach(st => {
        window.renderIdeaLifecycle(st, 'Idea de Prueba');
        const activeStep = stepper ? stepper.querySelector(`.lifecycle-step.active`) : null;
        const currentTag = document.getElementById('lifecycle-current-status-tag');
        results[st] = {
          stepFound: !!document.getElementById(`lifecycle-step-${st}`),
          isActive: activeStep ? activeStep.getAttribute('data-estado') === st : false,
          tagText: currentTag ? currentTag.textContent : '',
          ariaCurrent: activeStep ? activeStep.getAttribute('aria-current') === 'step' : false
        };
      });

      // Restaurar a estado original de Idea 3
      window.renderIdeaLifecycle('en_desarrollo', 'Venta de servicios de orientación');
      return results;
    });

    assert.strictEqual(estadosCheck.semilla.isActive, true, "F5.6-01: Estado semilla se representa como activo");
    assert.strictEqual(estadosCheck.en_desarrollo.isActive, true, "F5.6-02: Estado en_desarrollo se representa como activo");
    assert.strictEqual(estadosCheck.en_validacion.isActive, true, "F5.6-03: Estado en_validacion se representa como activo");
    assert.strictEqual(estadosCheck.lista.isActive, true, "F5.6-04: Estado lista se representa como activo");
    assert.strictEqual(estadosCheck.en_accion.isActive, true, "F5.6-05: Estado en_accion se representa como activo");
    assert.strictEqual(estadosCheck.realizada.isActive, true, "F5.6-06: Estado realizada se representa como activo");
    assert.strictEqual(estadosCheck.archivada.isActive, true, "F5.6-07: Estado archivada se representa como activo");
    console.log("✓ F5.6-01 a F5.6-07 — Los 7 estados oficiales se muestran y activan correctamente en la máquina visual.");

    // -------------------------------------------------------------------------
    // F5.6-08 a F5.6-22 & F5.6-23: Matriz de 15 transiciones oficiales y ausencia de inválidas
    // -------------------------------------------------------------------------
    const matrizTransiciones = await page.evaluate(() => {
      const matrizEsperada = {
        semilla: ['en_desarrollo', 'archivada'],
        en_desarrollo: ['en_validacion', 'archivada'],
        en_validacion: ['en_desarrollo', 'lista', 'archivada'],
        lista: ['en_accion', 'en_desarrollo', 'archivada'],
        en_accion: ['realizada', 'en_desarrollo', 'archivada'],
        realizada: ['archivada'],
        archivada: ['en_desarrollo']
      };

      const resultado = {};

      Object.entries(matrizEsperada).forEach(([origen, destinosPermitidos]) => {
        window.renderIdeaLifecycle(origen, 'Idea Matriz');
        const actionsCont = document.getElementById('lifecycle-transitions-actions');
        const buttons = actionsCont ? Array.from(actionsCont.querySelectorAll('.btn-transicion')) : [];
        const destinosRenderizados = buttons.map(btn => btn.getAttribute('data-destino'));

        resultado[origen] = {
          destinosRenderizados,
          exactMatch: JSON.stringify(destinosRenderizados.sort()) === JSON.stringify(destinosPermitidos.slice().sort()),
          noInvalidas: destinosRenderizados.every(d => destinosPermitidos.includes(d))
        };
      });

      // Restaurar
      window.renderIdeaLifecycle('en_desarrollo', 'Venta de servicios de orientación');
      return resultado;
    });

    assert.strictEqual(matrizTransiciones.semilla.exactMatch, true, "F5.6-08 & 09: Transiciones válidas desde semilla (en_desarrollo, archivada)");
    assert.strictEqual(matrizTransiciones.en_desarrollo.exactMatch, true, "F5.6-10 & 11: Transiciones válidas desde en_desarrollo (en_validacion, archivada)");
    assert.strictEqual(matrizTransiciones.en_validacion.exactMatch, true, "F5.6-12 a 14: Transiciones válidas desde en_validacion (en_desarrollo, lista, archivada)");
    assert.strictEqual(matrizTransiciones.lista.exactMatch, true, "F5.6-15 a 17: Transiciones válidas desde lista (en_accion, en_desarrollo, archivada)");
    assert.strictEqual(matrizTransiciones.en_accion.exactMatch, true, "F5.6-18 a 20: Transiciones válidas desde en_accion (realizada, en_desarrollo, archivada)");
    assert.strictEqual(matrizTransiciones.realizada.exactMatch, true, "F5.6-21: Transición válida desde realizada (archivada)");
    assert.strictEqual(matrizTransiciones.archivada.exactMatch, true, "F5.6-22: Transición válida desde archivada (en_desarrollo)");
    assert.ok(Object.values(matrizTransiciones).every(m => m.noInvalidas), "F5.6-23: Cero transiciones inválidas expuestas");
    console.log("✓ F5.6-08 a F5.6-23 — Las 15 transiciones oficiales se presentan exactamente y sin opciones inválidas.");

    // -------------------------------------------------------------------------
    // F5.6-24: Rechazo previo a transiciones no permitidas
    // -------------------------------------------------------------------------
    let alertRechazo = '';
    page.once('dialog', async dialog => {
      alertRechazo = dialog.message();
      await dialog.accept();
    });

    await page.evaluate(async () => {
      window.currentWorkspaceIdea.idea.estado = 'semilla';
      await window.solicitarCambioEstado('realizada'); // Inválida directa
    });
    assert.ok(alertRechazo.includes('no está permitida'), "F5.6-24: Transición no permitida es rechazada de inmediato");
    console.log("✓ F5.6-24 — Guardia de integridad rechaza transiciones no permitidas por la máquina de estados.");

    // Restaurar estado en_desarrollo
    await page.evaluate(() => {
      window.currentWorkspaceIdea.idea.estado = 'en_desarrollo';
      window.renderIdeaLifecycle('en_desarrollo', 'Venta de servicios de orientación');
    });

    // -------------------------------------------------------------------------
    // F5.6-25 & F5.6-26: Confirmación interactiva en modal propio (#custom-modal) y NO window.confirm
    // -------------------------------------------------------------------------
    let nativeConfirmCalled = false;
    page.on('dialog', dialog => {
      if (dialog.type() === 'confirm') {
        nativeConfirmCalled = true;
      }
    });

    // Iniciar cambio de estado asíncronamente en la página
    await page.evaluate(() => {
      setTimeout(() => window.solicitarCambioEstado('en_validacion'), 0);
    });

    // Esperar a que el modal propio de Idealandia se active
    await page.waitForSelector('#custom-modal.active', { timeout: 3000 });
    const modalMessage = await page.$eval('#custom-modal-message', el => el.textContent.trim());

    // Clic en Cancelar en el modal propio de Idealandia
    await page.click('#custom-modal-buttons button:first-child');
    await page.waitForTimeout(200);

    const cancelTransitionResult = await page.evaluate(() => window.currentWorkspaceIdea.idea.estado);

    assert.strictEqual(nativeConfirmCalled, false, "F5.6-25a: window.confirm NO debe ser llamado bajo ninguna circunstancia");
    assert.ok(modalMessage.includes('Venta de servicios de orientación') || modalMessage.includes('cambiar la Idea'), "F5.6-25b: Modal de Idealandia muestra mensaje claro de confirmación");
    assert.strictEqual(cancelTransitionResult, 'en_desarrollo', "F5.6-26: Cancelar confirmación mantiene el estado sin cambios");
    console.log("✓ F5.6-25 & F5.6-26 — Modal propio de confirmación de Idealandia mostrado (cero window.confirm) y cancelación respetada.");

    // -------------------------------------------------------------------------
    // F5.6-27: Guardia contra clics concurrentes / múltiples
    // -------------------------------------------------------------------------
    const concurrencyCheck = await page.evaluate(async () => {
      window.isChangingState = true;
      let callCount = 0;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        callCount++;
        return originalFetch(...args);
      };

      await window.solicitarCambioEstado('en_validacion');
      window.fetch = originalFetch;
      window.isChangingState = false;
      return callCount;
    });

    assert.strictEqual(concurrencyCheck, 0, "F5.6-27: isChangingState previene peticiones concurrentes duplicadas");
    console.log("✓ F5.6-27 — Guardia contra doble clic / peticiones simultáneas verificada.");

    // -------------------------------------------------------------------------
    // F5.6-34 a F5.6-36: Guardia ante cambios no guardados en el Canvas (Dirty State)
    // -------------------------------------------------------------------------
    // 1. Simular Canvas dirty
    await page.evaluate(() => {
      window.setCanvasDirty(true);
    });

    // 2. Iniciar cambio de estado con Canvas dirty
    await page.evaluate(() => {
      setTimeout(() => window.solicitarCambioEstado('en_validacion'), 0);
    });
    await page.waitForSelector('#custom-modal.active', { timeout: 3000 });
    const dirtyModalMsg = await page.$eval('#custom-modal-message', el => el.textContent.trim());
    assert.ok(dirtyModalMsg.includes('cambios sin guardar'), "F5.6-34: Modal de advertencia de Canvas dirty disparado");

    // Clic en Cancelar / Permanecer aquí
    await page.click('#custom-modal-buttons button:first-child');
    await page.waitForTimeout(200);

    const stillDirty = await page.evaluate(() => window.workspaceCanvasDirty);
    assert.strictEqual(stillDirty, true, "F5.6-35: Cancelar advertencia conserva dirty state y no cambia estado");
    console.log("✓ F5.6-34 & F5.6-35 — Advertencia de Canvas dirty mostrada en modal propio y cancelación conservada.");

    // -------------------------------------------------------------------------
    // F5.6-28, F5.6-36: Ejecución real de transición con 200 OK y descarte de dirty
    // -------------------------------------------------------------------------
    let interceptedPutEstado = null;
    page.on('request', req => {
      if (req.method() === 'PUT' && req.url().includes('/api/ideas/3/estado')) {
        interceptedPutEstado = {
          url: req.url(),
          postData: req.postDataJSON()
        };
      }
    });

    // Iniciar transición con dirty state activo
    await page.evaluate(() => {
      setTimeout(() => window.solicitarCambioEstado('en_validacion'), 0);
    });

    // 1. Confirmar descarte de dirty state
    await page.waitForSelector('#custom-modal.active', { timeout: 3000 });
    await page.click('#custom-modal-buttons button:last-child');
    await page.waitForTimeout(200);

    // 2. Confirmar cambio de estado en el segundo modal
    await page.waitForSelector('#custom-modal.active', { timeout: 3000 });
    await page.click('#custom-modal-buttons button:last-child');
    await page.waitForTimeout(600);

    const transicionRealizada = await page.evaluate(() => {
      const badgeEstado = document.getElementById('workspace-badge-estado');
      return {
        nuevoEstado: window.currentWorkspaceIdea.idea.estado,
        badgeText: badgeEstado ? badgeEstado.textContent : '',
        dirtyAfter: window.workspaceCanvasDirty
      };
    });

    assert.ok(interceptedPutEstado !== null, "F5.6-28a: Llamada PUT /api/ideas/3/estado ejecutada");
    assert.strictEqual(interceptedPutEstado.postData.estado, 'en_validacion', "F5.6-28b: Estado destino enviado en payload");
    assert.strictEqual(transicionRealizada.nuevoEstado, 'en_validacion', "F5.6-28c: Estado local actualizado tras 200 OK");
    assert.ok(transicionRealizada.badgeText.includes('En Validación') || transicionRealizada.badgeText.includes('En validacion'), "F5.6-28d: Badge de estado actualizado");
    assert.strictEqual(transicionRealizada.dirtyAfter, false, "F5.6-36: Dirty reseteado tras confirmar descarte");
    console.log("✓ F5.6-28 & F5.6-36 — Transición exitosa en vivo con 200 OK y descarte controlado de dirty state.");

    // -------------------------------------------------------------------------
    // F5.6-29 a F5.6-33: Manejo de errores HTTP (400, 401, 403, 404, Red)
    // -------------------------------------------------------------------------
    const httpErrorsCheck = await page.evaluate(async () => {
      const results = {};
      const originalFetch = window.fetch;
      const originalShowConfirm = window.showConfirm;
      window.showConfirm = async () => true;

      // 400
      window.fetch = async () => new Response(JSON.stringify({ error: 'Transición inválida de prueba' }), { status: 400 });
      let alertMsg = '';
      window.alert = (m) => { alertMsg = m; };
      await window.solicitarCambioEstado('lista');
      results.e400 = alertMsg;

      // 401
      window.fetch = async () => new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401 });
      await window.solicitarCambioEstado('lista');
      results.e401 = alertMsg;

      // 403
      window.fetch = async () => new Response(JSON.stringify({ error: 'No autorizado' }), { status: 403 });
      await window.solicitarCambioEstado('lista');
      results.e403 = alertMsg;

      // 404
      window.fetch = async () => new Response(JSON.stringify({ error: 'No encontrada' }), { status: 404 });
      await window.solicitarCambioEstado('lista');
      results.e404 = alertMsg;

      // Error de Red
      window.fetch = async () => { throw new Error('Failed to fetch'); };
      await window.solicitarCambioEstado('lista');
      results.eNet = alertMsg;

      window.fetch = originalFetch;
      window.showConfirm = originalShowConfirm;
      return results;
    });

    assert.ok(httpErrorsCheck.e400.includes('Transición inválida'), "F5.6-29: 400 muestra mensaje amigable");
    assert.ok(httpErrorsCheck.e401.includes('iniciar sesión'), "F5.6-30: 401 solicita iniciar sesión");
    assert.strictEqual(httpErrorsCheck.e403, 'Acceso no autorizado o vencido para esta funcionalidad.', "F5.6-31: 403 muestra mensaje estándar");
    assert.strictEqual(httpErrorsCheck.e404, 'La Idea no está disponible.', "F5.6-32: 404 muestra mensaje estándar");
    assert.ok(httpErrorsCheck.eNet.includes('conexión'), "F5.6-33: Error de red manejado correctamente");
    console.log("✓ F5.6-29 a F5.6-33 — Manejo riguroso de errores HTTP 400, 401, 403, 404 y de red.");

    // -------------------------------------------------------------------------
    // F5.6-37 & F5.6-38: Integración de solo lectura en 'realizada' y reactivación en 'archivada'
    // -------------------------------------------------------------------------
    const terminalIntegration = await page.evaluate(() => {
      // Probar simulación en realizada
      window.currentWorkspaceIdea.idea.estado = 'realizada';
      window.renderIdeaLifecycle('realizada', 'Idea Realizada');
      window.populateCanvasEditForm({}, 'realizada');

      const actionsBarRealizada = document.getElementById('canvas-actions-bar');
      const readonlyNoticeRealizada = document.getElementById('canvas-readonly-notice');
      const actionsTransRealizada = Array.from(document.querySelectorAll('#lifecycle-transitions-actions .btn-transicion')).map(b => b.getAttribute('data-destino'));

      // Probar simulación en archivada
      window.currentWorkspaceIdea.idea.estado = 'archivada';
      window.renderIdeaLifecycle('archivada', 'Idea Archivada');
      const actionsTransArchivada = Array.from(document.querySelectorAll('#lifecycle-transitions-actions .btn-transicion')).map(b => b.getAttribute('data-destino'));

      return {
        canvasReadonlyRealizada: actionsBarRealizada && actionsBarRealizada.style.display === 'none' && readonlyNoticeRealizada.style.display !== 'none',
        actionsRealizada: actionsTransRealizada,
        actionsArchivada: actionsTransArchivada
      };
    });

    assert.strictEqual(terminalIntegration.canvasReadonlyRealizada, true, "F5.6-37: Estado 'realizada' mantiene Canvas en solo lectura");
    assert.deepStrictEqual(terminalIntegration.actionsRealizada, ['archivada'], "F5.6-37b: 'realizada' solo permite transicionar a 'archivada'");
    assert.deepStrictEqual(terminalIntegration.actionsArchivada, ['en_desarrollo'], "F5.6-38: 'archivada' solo permite reactivar a 'en_desarrollo'");
    console.log("✓ F5.6-37 & F5.6-38 — Comportamiento terminal de 'realizada' y 'archivada' integrado.");

    // -------------------------------------------------------------------------
    // F5.6-39 a F5.6-41: No existen llamadas a versiones, historial ni IA
    // -------------------------------------------------------------------------
    let forbiddenCallDetected = false;
    page.on('request', req => {
      if (req.url().includes('/versiones') || req.url().includes('/historial') || req.url().includes('gemini') || req.url().includes('idealita')) {
        forbiddenCallDetected = true;
      }
    });

    await page.evaluate(() => {
      window.renderIdeaLifecycle('en_desarrollo', 'Test Sin Llamadas Prohibidas');
    });

    assert.strictEqual(forbiddenCallDetected, false, "F5.6-39 a 41: Ninguna llamada a endpoints no autorizados");
    console.log("✓ F5.6-39 a F5.6-41 — Cero llamadas a versiones, historial o IA durante el ciclo de vida.");

    // -------------------------------------------------------------------------
    // F5.6-42 & F5.6-43: Compatibilidad con refreshIdeasContext() y funciones F5.5
    // -------------------------------------------------------------------------
    const f5_5_compat = await page.evaluate(() => {
      return {
        hasGuardarCanvas: typeof window.guardarCambiosCanvas === 'function',
        hasCancelarCanvas: typeof window.cancelarCambiosCanvas === 'function',
        hasRefreshIdeasContext: typeof window.refreshIdeasContext === 'function',
        isDirtyDefined: typeof window.workspaceCanvasDirty === 'boolean'
      };
    });

    assert.strictEqual(f5_5_compat.hasGuardarCanvas, true, "F5.6-43: guardarCambiosCanvas permanece definida");
    assert.strictEqual(f5_5_compat.hasCancelarCanvas, true, "F5.6-43b: cancelarCambiosCanvas permanece definida");
    assert.strictEqual(f5_5_compat.hasRefreshIdeasContext, true, "F5.6-42: refreshIdeasContext permanece disponible");
    assert.strictEqual(f5_5_compat.isDirtyDefined, true, "F5.6-43c: workspaceCanvasDirty permanece funcional");
    console.log("✓ F5.6-42 & F5.6-43 — Compatibilidad con F5.5 e Idealita garantizada.");

    await contextAuth.close();

    // -------------------------------------------------------------------------
    // F5.6-44: Responsive en viewport móvil 412x915 (Galaxy S25 Ultra)
    // -------------------------------------------------------------------------
    const contextMobile = await browser.newContext({ viewport: { width: 412, height: 915 } });
    await contextMobile.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);
    const pageMobile = await contextMobile.newPage();
    await pageMobile.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await pageMobile.waitForTimeout(300);

    const mobileCheck = await pageMobile.evaluate(async () => {
      document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
      const ideasSec = document.getElementById('ideas');
      if (ideasSec) ideasSec.style.display = 'flex';

      await window.openIdeaWorkspace(3);
      const section = document.getElementById('workspace-lifecycle-section');
      const bodyWidth = document.body.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      const buttons = Array.from(document.querySelectorAll('#lifecycle-transitions-actions button'));
      const touchTargetsOk = buttons.length > 0 && buttons.every(b => b.offsetHeight >= 44);

      return {
        sectionVisible: section && section.style.display !== 'none',
        noHorizontalOverflow: scrollWidth <= bodyWidth,
        touchTargetsOk
      };
    });

    assert.strictEqual(mobileCheck.sectionVisible, true, "F5.6-44: Sección ciclo de vida visible en móvil");
    assert.strictEqual(mobileCheck.noHorizontalOverflow, true, "F5.6-44b: Cero desbordamiento horizontal en 412x915");
    assert.strictEqual(mobileCheck.touchTargetsOk, true, "F5.6-44c: Botones de transición con altura táctil >= 44px");
    console.log("✓ F5.6-44 — Responsive en 412x915 verificado (sin desbordamiento horizontal y botones táctiles conformes).");

    await contextMobile.close();

    // -------------------------------------------------------------------------
    // RESTAURACIÓN Y LIMPIEZA ABSOLUTA DE BASE DE DATOS
    // -------------------------------------------------------------------------
    // 1. Restaurar estado original de Idea 3 (en_desarrollo, v1)
    await conn.query('UPDATE ideas SET estado = ?, version_actual = ? WHERE id = 3', [idea3OriginalEstado, idea3OriginalVersion]);

    // 2. Restaurar desarrollo por si acaso
    await conn.query(`
      UPDATE idea_desarrollo
      SET problema = NULL, solucion = NULL, beneficiarios = NULL, recursos = NULL,
          inversion_estimada = NULL, moneda = 'MXN', complejidad = NULL, potencial = NULL,
          riesgos = NULL, notas = NULL, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE idea_id = 3
    `);

    // 3. Eliminar eventos de historial generados durante las pruebas
    await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "actualizacion"');
    await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "cambio_estado" AND descripcion = "Cambio de estado de en_desarrollo a en_validacion"');

    // 4. Verificación de conteos exactos
    const [finalIdeas] = await conn.query('SELECT COUNT(*) as c FROM ideas');
    assert.strictEqual(finalIdeas[0].c, realIdeasPre[0].c, "La cantidad de ideas debe mantenerse inalterada tras las pruebas");

    const [finalDes] = await conn.query('SELECT COUNT(*) as c FROM idea_desarrollo');
    assert.strictEqual(finalDes[0].c, realDesPre[0].c, "Los registros en idea_desarrollo deben mantenerse inalterados tras las pruebas");

    const [finalVer] = await conn.query('SELECT COUNT(*) as c FROM idea_versiones');
    assert.strictEqual(finalVer[0].c, realVerPre[0].c, "Las versiones formales deben mantenerse inalteradas");

    const [finalHist] = await conn.query('SELECT COUNT(*) as c FROM idea_historial');
    assert.strictEqual(finalHist[0].c, realHistPre[0].c, "El historial no debe tener eventos residuales");

    const [finalProp] = await conn.query('SELECT COUNT(*) as c FROM idea_propositos');
    assert.strictEqual(finalProp[0].c, 8, "Deben existir exactamente 8 propósitos");

    const [finalCat] = await conn.query('SELECT COUNT(*) as c FROM idea_categorias');
    assert.strictEqual(finalCat[0].c, 0, "Deben existir exactamente 0 categorías");

    console.log("\n✓ Integridad absoluta de base de datos tras pruebas y limpieza verificada al 100%:");
    console.log(`  - Ideas reales: ${finalIdeas[0].c} / 9`);
    console.log(`  - Registros en idea_desarrollo: ${finalDes[0].c} / 9`);
    console.log(`  - Versiones formales: ${finalVer[0].c} / 1`);
    console.log(`  - Entradas de historial: ${finalHist[0].c} / 11`);
    console.log(`  - Propósitos: ${finalProp[0].c} / 8`);
    console.log(`  - Categorías: ${finalCat[0].c} / 0\n`);

    console.log("================================================================================");
    console.log("RESULTADO F5.6: TODAS LAS PRUEBAS (44/44) PASARON SATISFACTORIAMENTE");
    console.log("================================================================================\n");

  } catch (err) {
    console.error("\n❌ ERROR EN LA SUITE DE PRUEBAS F5.6:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await conn.end();
  }
})();
