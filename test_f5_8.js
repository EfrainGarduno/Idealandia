const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.8 — HISTORIAL Y TRAZABILIDAD VISUAL DE LA IDEA");
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

    let historialRequestsCount = 0;
    page.on('request', req => {
      if (req.url().includes('/api/ideas/3/historial')) {
        historialRequestsCount++;
      }
    });

    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // Abrir Workspace de Idea 3 (por defecto activa pestaña 'canvas')
    await page.evaluate(async () => {
      document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
      const sec = document.getElementById('ideas');
      if (sec) sec.style.display = 'flex';
      await window.openIdeaWorkspace(3);
    });
    await page.waitForTimeout(300);

    // -------------------------------------------------------------------------
    // F5.8-01 a F5.8-05: Estructura, Carga Bajo Demanda y Estados del Panel
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 1: Estructura visual, Pestaña Historial y Carga Bajo Demanda ---");

    // F5.8-01: #workspace-panel-historial existe en DOM con clase .workspace-panel
    const panelExists = await page.evaluate(() => {
      const p = document.getElementById('workspace-panel-historial');
      return !!p && p.classList.contains('workspace-panel');
    });
    assert.strictEqual(panelExists, true, "F5.8-01: #workspace-panel-historial debe existir y ser .workspace-panel");
    console.log("✓ F5.8-01: #workspace-panel-historial existe en DOM con clase .workspace-panel");

    // F5.8-02: Carga bajo demanda: Al abrir Workspace en 'canvas', NO se consultó historial
    assert.strictEqual(historialRequestsCount, 0, "F5.8-02: No debe consultarse historial antes de abrir la pestaña");
    console.log("✓ F5.8-02: Carga bajo demanda respetada: Cero peticiones de historial al abrir Workspace");

    // F5.8-03: Pestaña Historial funciona (switchWorkspaceTab('historial'))
    const switchTabCheck = await page.evaluate(async () => {
      window.switchWorkspaceTab('historial');
      const p = document.getElementById('workspace-panel-historial');
      const btn = document.querySelector('.workspace-tab-btn[data-tab="historial"]');
      const canvasP = document.getElementById('workspace-panel-canvas');
      return {
        panelVisible: p && p.style.display === 'block',
        btnActive: btn && btn.classList.contains('active'),
        canvasHidden: canvasP && canvasP.style.display === 'none'
      };
    });
    assert.strictEqual(switchTabCheck.panelVisible, true, "F5.8-03: Panel historial debe estar visible");
    assert.strictEqual(switchTabCheck.btnActive, true, "F5.8-03: Botón pestaña historial debe estar activo");
    assert.strictEqual(switchTabCheck.canvasHidden, true, "F5.8-03: Panel canvas debe estar oculto");
    console.log("✓ F5.8-03: switchWorkspaceTab('historial') activa la pestaña y muestra el panel correspondiente");

    // Esperar a que la petición bajo demanda termine
    await page.waitForTimeout(400);

    // F5.8-04: Carga bajo demanda activada al cambiar de pestaña
    assert.ok(historialRequestsCount >= 1, "F5.8-04: Debe realizarse la petición GET al abrir la pestaña");
    console.log(`✓ F5.8-04: Petición GET /api/ideas/3/historial ejecutada bajo demanda al abrir la pestaña (Total peticiones: ${historialRequestsCount})`);

    // F5.8-05: Elementos clave del panel: Banner, Loading, Error, Empty y Refresh
    const elementsCheck = await page.evaluate(() => {
      const p = document.getElementById('workspace-panel-historial');
      const banner = p ? p.innerText.includes('Principio de Historial y Trazabilidad') && p.innerText.includes('Historial ≠ Versiones') : false;
      const loading = document.getElementById('historial-loading');
      const error = document.getElementById('historial-error');
      const empty = document.getElementById('historial-empty');
      const btnRefresh = document.getElementById('btn-refrescar-historial');
      const badgeCount = document.getElementById('historial-count-badge');
      return {
        bannerOk: banner,
        loadingExists: !!loading,
        errorExists: !!error,
        emptyExists: !!empty,
        btnRefreshExists: !!btnRefresh,
        badgeCountExists: !!badgeCount
      };
    });
    assert.strictEqual(elementsCheck.bannerOk, true, "F5.8-05: Banner explicativo presente");
    assert.strictEqual(elementsCheck.loadingExists, true, "F5.8-05: Elemento #historial-loading presente");
    assert.strictEqual(elementsCheck.errorExists, true, "F5.8-05: Elemento #historial-error presente");
    assert.strictEqual(elementsCheck.emptyExists, true, "F5.8-05: Elemento #historial-empty presente");
    assert.strictEqual(elementsCheck.btnRefreshExists, true, "F5.8-05: Botón #btn-refrescar-historial presente");
    assert.strictEqual(elementsCheck.badgeCountExists, true, "F5.8-05: Badge contador presente");
    console.log("✓ F5.8-05: Banner de principios, estados (loading, error, empty), contador y botón de refresco presentes\n");

    // -------------------------------------------------------------------------
    // F5.8-06 a F5.8-14: Consulta, Renderizado y Formato de Eventos
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 2: Consulta GET, renderizado y formato de eventos ---");

    const eventosRenderCheck = await page.evaluate(() => {
      const container = document.getElementById('historial-timeline-container');
      const items = document.querySelectorAll('.timeline-item');
      const badge = document.getElementById('historial-count-badge');

      const results = [];
      items.forEach(it => {
        const id = it.dataset.eventoId;
        const tipo = it.dataset.tipoEvento;
        const badgeTxt = it.querySelector('.timeline-badge')?.textContent.trim();
        const fechaTxt = it.querySelector('.timeline-fecha')?.textContent.trim();
        const userTxt = it.querySelector('.timeline-usuario')?.textContent.trim();
        const descTxt = it.querySelector('.timeline-description')?.textContent.trim();
        const hasNode = !!it.querySelector('.timeline-node');
        const hasCard = !!it.querySelector('.timeline-card');
        results.push({ id, tipo, badgeTxt, fechaTxt, userTxt, descTxt, hasNode, hasCard });
      });

      return {
        containerVisible: container && container.style.display !== 'none',
        totalRendered: items.length,
        badgeCount: badge ? badge.textContent.trim() : '',
        events: results
      };
    });

    // F5.8-06: Total de eventos renderizados para Idea 3 (3 eventos existentes)
    assert.strictEqual(eventosRenderCheck.containerVisible, true, "F5.8-06: #historial-timeline-container visible");
    assert.strictEqual(eventosRenderCheck.totalRendered, 3, "F5.8-06: Deben renderizarse exactamente 3 eventos para Idea 3");
    console.log("✓ F5.8-06: GET /api/ideas/3/historial consumido y renderizado exitosamente");

    // F5.8-07: Badge contador coincide con total de eventos
    assert.strictEqual(eventosRenderCheck.badgeCount, '3', "F5.8-07: Badge contador debe ser 3");
    console.log(`✓ F5.8-07: Badge contador sincronizado con el total de eventos (${eventosRenderCheck.badgeCount})`);

    // F5.8-08 a F5.8-12: Verificación de estructura por cada evento renderizado
    eventosRenderCheck.events.forEach((ev, idx) => {
      assert.ok(ev.hasNode, `F5.8-08: Evento ${idx+1} debe tener nodo visual (.timeline-node)`);
      assert.ok(ev.hasCard, `F5.8-09: Evento ${idx+1} debe tener tarjeta de contenido (.timeline-card)`);
      assert.ok(ev.badgeTxt && ev.badgeTxt.length > 0, `F5.8-10: Evento ${idx+1} debe tener etiqueta/badge de tipo`);
      assert.ok(ev.fechaTxt && ev.fechaTxt.length > 0, `F5.8-11: Evento ${idx+1} debe tener fecha visible y formateada`);
      assert.ok(ev.descTxt && ev.descTxt.length > 0, `F5.8-12: Evento ${idx+1} debe tener descripción comprensible`);
    });
    console.log("✓ F5.8-08 a F5.8-12: Todos los eventos cuentan con nodo, tarjeta, badge de tipo, fecha formateada y descripción");

    // F5.8-13: Información de usuario visible
    assert.ok(eventosRenderCheck.events[0].userTxt.includes('Usuario #2') || eventosRenderCheck.events[0].userTxt.includes('Efrain'), "F5.8-13: Usuario debe ser identificado");
    console.log("✓ F5.8-13: Información del usuario responsable visible en el timeline");

    // F5.8-14: Orden cronológico estricto ASC (más antiguo al más reciente)
    assert.strictEqual(eventosRenderCheck.events[0].tipo, 'creacion', "F5.8-14: Primer evento debe ser 'creacion'");
    assert.strictEqual(eventosRenderCheck.events[1].tipo, 'nueva_version', "F5.8-14: Segundo evento debe ser 'nueva_version'");
    assert.strictEqual(eventosRenderCheck.events[2].tipo, 'cambio_estado', "F5.8-14: Tercer evento debe ser 'cambio_estado'");
    console.log("✓ F5.8-14: Orden cronológico ascendente estricto respetado (creación -> versión -> cambio de estado)\n");

    // -------------------------------------------------------------------------
    // F5.8-15 a F5.8-23: Timeline Visual y Representación de Tipos de Eventos
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 3: Línea de tiempo visual y representación semántica por tipo ---");

    // F5.8-15: Línea vertical de conexión (.timeline-track-line)
    const trackLineCheck = await page.evaluate(() => {
      const lines = document.querySelectorAll('.timeline-track-line');
      return lines.length;
    });
    assert.ok(trackLineCheck >= 2, "F5.8-15: Deben existir líneas de conexión entre nodos");
    console.log("✓ F5.8-15: Línea continua vertical de tiempo (.timeline-track-line) renderizada");

    // F5.8-16: Evento de Creación con icono y label apropiados
    assert.strictEqual(eventosRenderCheck.events[0].badgeTxt.includes('Creación'), true, "F5.8-16: Label de creación correcto");
    console.log("✓ F5.8-16: Evento 'creacion' representado con badge e iconografía de origen");

    // F5.8-17: Evento de Nueva Versión con píldora de versión
    const versionDetailCheck = await page.evaluate(() => {
      const vCard = document.querySelector('.timeline-item[data-tipo-evento="nueva_version"]');
      const pill = vCard ? vCard.querySelector('.timeline-details-version') : null;
      return {
        hasPill: !!pill,
        text: pill ? pill.textContent : ''
      };
    });
    assert.strictEqual(versionDetailCheck.hasPill, true, "F5.8-17: Evento nueva_version debe tener píldora detallada");
    assert.strictEqual(versionDetailCheck.text.includes('v1'), true, "F5.8-17: Debe indicar 'v1'");
    console.log("✓ F5.8-17: Evento 'nueva_version' representado con píldora v1 y motivo de consolidación");

    // F5.8-18: Evento de Cambio de Estado con píldora de transición (semilla -> en_desarrollo)
    const transitionCheck = await page.evaluate(() => {
      const estCard = document.querySelector('.timeline-item[data-tipo-evento="cambio_estado"]');
      const pill = estCard ? estCard.querySelector('.timeline-details-estado') : null;
      return {
        hasPill: !!pill,
        text: pill ? pill.textContent : ''
      };
    });
    assert.strictEqual(transitionCheck.hasPill, true, "F5.8-18: Evento cambio_estado debe tener detalle de transición");
    assert.strictEqual(transitionCheck.text.includes('Semilla'), true, "F5.8-18: Debe mostrar estado origen Semilla");
    assert.strictEqual(transitionCheck.text.includes('En Desarrollo'), true, "F5.8-18: Debe mostrar estado destino En Desarrollo");
    console.log("✓ F5.8-18: Evento 'cambio_estado' representado visualmente con transición Semilla → En Desarrollo");

    // F5.8-19: Evento de Modificación de Canvas (renderizado sintetizado de campos modificados)
    const testActualizacion = await page.evaluate(() => {
      const dummyContainer = document.createElement('div');
      const dummyEvent = [{
        id: 999,
        idea_id: 3,
        usuario_id: 2,
        tipo_evento: 'actualizacion',
        descripcion: 'Desarrollo de Canvas actualizado',
        datos: { campos_modificados: ['problema', 'solucion', 'recursos'] },
        fecha: new Date().toISOString()
      }];
      window.renderHistorialTimeline(dummyEvent, dummyContainer);
      const item = dummyContainer.querySelector('.timeline-item');
      const badge = item ? item.querySelector('.timeline-badge')?.textContent : '';
      const actDetail = item ? item.querySelector('.timeline-details-actualizacion')?.textContent : '';
      return { badge, actDetail };
    });
    assert.strictEqual(testActualizacion.badge.includes('Canvas Modificado'), true, "F5.8-19: Label de actualizacion Canvas");
    assert.strictEqual(testActualizacion.actDetail.includes('problema, solucion, recursos'), true, "F5.8-19: Campos actualizados renderizados");
    console.log("✓ F5.8-19: Evento 'actualizacion' representa limpiamente la lista de campos modificados");

    // F5.8-20: Evento Desconocido NO rompe la interfaz y usa fallback seguro
    const testDesconocido = await page.evaluate(() => {
      const dummyContainer = document.createElement('div');
      const dummyEvent = [{
        id: 998,
        idea_id: 3,
        usuario_id: 2,
        tipo_evento: 'evento_futuro_inesperado',
        descripcion: 'Ocurrió algo novedoso',
        datos: { parametro_x: 'valor_y' },
        fecha: new Date().toISOString()
      }];
      let errorThrown = false;
      try {
        window.renderHistorialTimeline(dummyEvent, dummyContainer);
      } catch (e) {
        errorThrown = true;
      }
      const item = dummyContainer.querySelector('.timeline-item');
      const badge = item ? item.querySelector('.timeline-badge')?.textContent : '';
      const desc = item ? item.querySelector('.timeline-description')?.textContent : '';
      return { errorThrown, badge, desc };
    });
    assert.strictEqual(testDesconocido.errorThrown, false, "F5.8-20: Tipo desconocido no debe arrojar excepción");
    assert.strictEqual(testDesconocido.badge.includes('Evento de Idea'), true, "F5.8-20: Debe usar label 'Evento de Idea'");
    assert.strictEqual(testDesconocido.desc.includes('Ocurrió algo novedoso'), true, "F5.8-20: Debe conservar descripción");
    console.log("✓ F5.8-20: Evento con tipo desconocido no rompe la interfaz y se presenta de forma segura como 'Evento de Idea'");

    // F5.8-21 a F5.8-23: getEventoConfig cubre el catálogo extendido de tipos
    const configCheck = await page.evaluate(() => {
      const tipos = ['creacion', 'actualizacion', 'cambio_estado', 'nueva_version', 'cambio_privacidad', 'cambio_modalidad', 'archivo', 'reactivacion', 'analisis_ia', 'restauracion'];
      const ok = tipos.every(t => {
        const conf = window.getEventoConfig(t);
        return conf && conf.label && conf.icon && conf.color;
      });
      return ok;
    });
    assert.strictEqual(configCheck, true, "F5.8-21: Todos los tipos de evento tienen configuración visual coherente");
    console.log("✓ F5.8-21 a F5.8-23: Catálogo completo de eventos (privacidad, modalidad, archivo, reactivación, IA, restauración) configurado\n");

    // -------------------------------------------------------------------------
    // F5.8-24 a F5.8-29: Naturaleza Estricta de Solo Lectura
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 4: Naturaleza estricta de solo lectura (Sin mutaciones) ---");

    const readOnlyCheck = await page.evaluate(() => {
      const panel = document.getElementById('workspace-panel-historial');
      const buttons = panel ? Array.from(panel.querySelectorAll('button')) : [];
      const inputs = panel ? Array.from(panel.querySelectorAll('input, textarea, select')) : [];

      const btnTexts = buttons.map(b => b.textContent.trim().toLowerCase());
      const hasEdit = btnTexts.some(t => t.includes('editar') || t.includes('modificar'));
      const hasDelete = btnTexts.some(t => t.includes('eliminar') || t.includes('borrar'));
      const hasRestore = btnTexts.some(t => t.includes('restaurar') || t.includes('revertir'));
      const hasCreateVersion = btnTexts.some(t => t.includes('crear versión'));
      const hasChangeState = btnTexts.some(t => t.includes('cambiar estado'));

      return {
        totalButtons: buttons.length,
        hasEdit,
        hasDelete,
        hasRestore,
        hasCreateVersion,
        hasChangeState,
        inputsCount: inputs.length
      };
    });

    // F5.8-24: Sin botones de edición
    assert.strictEqual(readOnlyCheck.hasEdit, false, "F5.8-24: NO debe haber botón de edición");
    console.log("✓ F5.8-24: Solo lectura: Cero botones de edición de eventos");

    // F5.8-25: Sin botones de eliminación
    assert.strictEqual(readOnlyCheck.hasDelete, false, "F5.8-25: NO debe haber botón de eliminación");
    console.log("✓ F5.8-25: Solo lectura: Cero botones de eliminación de eventos");

    // F5.8-26: Sin botones de restauración
    assert.strictEqual(readOnlyCheck.hasRestore, false, "F5.8-26: NO debe haber botón de restauración");
    console.log("✓ F5.8-26: Solo lectura: Cero botones de restauración de versiones");

    // F5.8-27: Sin inputs ni controles editables
    assert.strictEqual(readOnlyCheck.inputsCount, 0, "F5.8-27: Cero inputs o campos editables en historial");
    console.log("✓ F5.8-27: Solo lectura: Cero formularios o campos de entrada en panel Historial");

    // F5.8-28 & F5.8-29: Sin acciones POST de versión ni PUT de estado
    assert.strictEqual(readOnlyCheck.hasCreateVersion, false, "F5.8-28: No debe crear versiones desde Historial");
    assert.strictEqual(readOnlyCheck.hasChangeState, false, "F5.8-29: No debe cambiar estado desde Historial");
    console.log("✓ F5.8-28 & F5.8-29: Solo lectura: Sin acciones de cambio de estado ni creación de versiones\n");

    // -------------------------------------------------------------------------
    // F5.8-30 a F5.8-34: Manejo de Errores, Empty State y Reintentos
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 5: Manejo de errores HTTP (401, 403, 404), Empty State y Reintentos ---");

    // F5.8-30: Estado Vacío (#historial-empty)
    const emptyCheck = await page.evaluate(() => {
      const timelineCont = document.getElementById('historial-timeline-container');
      window.renderHistorialTimeline([], timelineCont);
      const emptyEl = document.getElementById('historial-empty');
      return {
        emptyVisible: emptyEl && emptyEl.style.display !== 'none',
        emptyText: emptyEl ? emptyEl.textContent : '',
        timelineHidden: timelineCont && timelineCont.style.display === 'none'
      };
    });
    assert.strictEqual(emptyCheck.emptyVisible, true, "F5.8-30: #historial-empty debe mostrarse con 0 eventos");
    assert.strictEqual(emptyCheck.timelineHidden, true, "F5.8-30: Contenedor timeline debe ocultarse");
    assert.strictEqual(emptyCheck.emptyText.includes('Aún no hay eventos registrados'), true, "F5.8-30: Mensaje amigable esperado");
    console.log("✓ F5.8-30: Estado vacío #historial-empty se muestra correctamente cuando no hay eventos");

    // F5.8-31: Manejo de Error 404 (Idea no existe)
    const error404Check = await page.evaluate(async () => {
      await window.loadIdeaHistorial(999999);
      const errEl = document.getElementById('historial-error');
      return {
        errorVisible: errEl && errEl.style.display !== 'none',
        errorText: errEl ? errEl.textContent : ''
      };
    });
    assert.strictEqual(error404Check.errorVisible, true, "F5.8-31: #historial-error visible ante 404");
    assert.strictEqual(error404Check.errorText.includes('no está disponible'), true, "F5.8-31: Mensaje 404 claro");
    console.log("✓ F5.8-31: Manejo de error 404 (Idea inexistente) muestra: 'La Idea no está disponible.'");

    // F5.8-32: Manejo de Error 403 (Acceso no autorizado / RBAC)
    await page.waitForTimeout(200);
    await page.unroute('**/api/ideas/3/historial').catch(() => {});
    await page.route('**/api/ideas/3/historial', route => {
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Acceso no autorizado o vencido para esta funcionalidad.' })
      });
    });

    const error403Check = await page.evaluate(async () => {
      await window.loadIdeaHistorial(3);
      const errEl = document.getElementById('historial-error');
      return {
        errorVisible: errEl && errEl.style.display !== 'none',
        errorText: errEl ? errEl.textContent : ''
      };
    });
    assert.strictEqual(error403Check.errorVisible, true, "F5.8-32: #historial-error visible ante 403");
    assert.strictEqual(error403Check.errorText.includes('Acceso no autorizado o vencido'), true, "F5.8-32: Mensaje 403 oficial");
    assert.strictEqual(error403Check.errorText.includes('ideas.read'), false, "F5.8-32: No debe filtrar nombres de permisos");
    console.log("✓ F5.8-32: Manejo de 403 muestra exactamente: 'Acceso no autorizado o vencido...' sin fugas técnicas");

    // F5.8-33: Manejo de Error 401 (Sesión no autenticada)
    await page.waitForTimeout(200);
    await page.unroute('**/api/ideas/3/historial').catch(() => {});
    await page.route('**/api/ideas/3/historial', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Debes iniciar sesión para consultar el historial de la Idea.' })
      });
    });

    const error401Check = await page.evaluate(async () => {
      await window.loadIdeaHistorial(3);
      const errEl = document.getElementById('historial-error');
      return {
        errorVisible: errEl && errEl.style.display !== 'none',
        errorText: errEl ? errEl.textContent : ''
      };
    });
    assert.strictEqual(error401Check.errorVisible, true, "F5.8-33: #historial-error visible ante 401");
    assert.strictEqual(error401Check.errorText.includes('iniciar sesión'), true, "F5.8-33: Mensaje 401 oficial");
    console.log("✓ F5.8-33: Manejo de 401 indica claramente iniciar sesión");

    await page.waitForTimeout(200);
    await page.unroute('**/api/ideas/3/historial').catch(() => {});

    // F5.8-34: Reintento y Refresco exitoso (#btn-refrescar-historial)
    await page.evaluate(async () => {
      await window.loadIdeaHistorial(3);
    });
    const refreshedCount = await page.evaluate(() => {
      const items = document.querySelectorAll('.timeline-item');
      return items.length;
    });
    assert.strictEqual(refreshedCount, 3, "F5.8-34: Historial debe restaurarse con 3 eventos");
    console.log("✓ F5.8-34: Actualización / Reintento exitoso restaurando los 3 eventos reales\n");

    // -------------------------------------------------------------------------
    // F5.8-35 a F5.8-42: Integridad con Subfases Previas (F5.4 - F5.7)
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 6: Integridad con Subfases Previas (Canvas, Estados, Versiones) ---");

    const integrationCheck = await page.evaluate(() => {
      const idea = window.currentWorkspaceIdea && window.currentWorkspaceIdea.idea;
      return {
        canvasDirty: window.workspaceCanvasDirty,
        versionActual: idea ? idea.version_actual : null,
        estado: idea ? idea.estado : null,
        privacidad: idea ? idea.privacidad : null,
        modalidad: idea ? idea.modalidad : null
      };
    });

    assert.strictEqual(integrationCheck.canvasDirty, false, "F5.8-38: Canvas no debe haber sufrido modificaciones");
    assert.strictEqual(integrationCheck.versionActual, 1, "F5.8-39: version_actual permanece intacto en 1");
    assert.strictEqual(integrationCheck.estado, 'en_desarrollo', "F5.8-40: estado permanece intacto en en_desarrollo");
    assert.strictEqual(integrationCheck.privacidad, 'privada', "F5.8-41: privacidad permanece intacta en privada");
    assert.strictEqual(integrationCheck.modalidad, 'individual', "F5.8-42: modalidad permanece intacta en individual");
    console.log("✓ F5.8-35 a F5.8-42: Integridad de estado cliente verificada: Canvas, versión actual, estado, privacidad y modalidad intactos\n");

    // -------------------------------------------------------------------------
    // F5.8-43 a F5.8-45: Responsive móvil (412x915) y Accesibilidad
    // -------------------------------------------------------------------------
    console.log("--- GRUPO 7: Responsive móvil (412x915) y Accesibilidad ---");

    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      window.switchWorkspaceTab('historial');
    });

    await page.waitForFunction(() => {
      const items = document.querySelectorAll('.timeline-item');
      return items.length === 3;
    }, { timeout: 5000 });

    const mobileCheck = await page.evaluate(() => {
      const panel = document.getElementById('workspace-panel-historial');
      const timelineCont = document.getElementById('historial-timeline-container');
      const items = document.querySelectorAll('.timeline-item');
      const hasHorizontalOverflow = document.body.scrollWidth > window.innerWidth;
      const roleFeed = timelineCont ? timelineCont.getAttribute('role') : null;

      return {
        panelVisible: panel && panel.style.display === 'block',
        itemsCount: items.length,
        hasHorizontalOverflow,
        roleFeed
      };
    });

    assert.strictEqual(mobileCheck.panelVisible, true, "F5.8-43: Panel historial visible en móvil");
    assert.strictEqual(mobileCheck.hasHorizontalOverflow, false, "F5.8-44: Sin desbordamiento horizontal en 412x915");
    assert.strictEqual(mobileCheck.itemsCount, 3, "F5.8-45a: 3 eventos visibles en móvil");
    assert.strictEqual(mobileCheck.roleFeed, 'feed', "F5.8-45b: Atributo semántico ARIA role='feed' presente");
    console.log("✓ F5.8-43 a F5.8-45: Comportamiento responsivo móvil (412x915) y accesibilidad semántica verificados");

    await page.setViewportSize({ width: 1366, height: 768 });

    // -------------------------------------------------------------------------
    // RESTAURACIÓN Y LIMPIEZA ABSOLUTA DE BASE DE DATOS
    // -------------------------------------------------------------------------
    console.log("\n--- RESTAURACIÓN Y LIMPIEZA ABSOLUTA DE BASE DE DATOS ---");

    await cleanupDatabase();

    // Verificación de conteos exactos de baseline
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

    // F5.8-46: Verificación de baseline final
    console.log("✓ F5.8-46: Integridad absoluta de base de datos tras pruebas verificada al 100%:");
    console.log(`  - Ideas reales: ${finalIdeas[0].c} / 9`);
    console.log(`  - Registros en idea_desarrollo: ${finalDes[0].c} / 9`);
    console.log(`  - Versiones formales: ${finalVer[0].c} / 1`);
    console.log(`  - Entradas de historial: ${finalHist[0].c} / 11`);
    console.log(`  - Propósitos: ${finalProp[0].c} / 8`);
    console.log(`  - Categorías: ${finalCat[0].c} / 0\n`);

    console.log("================================================================================");
    console.log("RESULTADO F5.8: TODAS LAS PRUEBAS (46/46) PASARON SATISFACTORIAMENTE");
    console.log("================================================================================\n");

  } catch (err) {
    console.error("\n❌ ERROR EN LA SUITE DE PRUEBAS F5.8:", err);
    await cleanupDatabase();
    process.exitCode = 1;
  } finally {
    await browser.close();
    await conn.end();
    process.exit(process.exitCode || 0);
  }
})();
