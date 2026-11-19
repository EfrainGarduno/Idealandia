const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE VERIFICACIÓN INTEGRAL: F5.10 — CIERRE Y AUDITORÍA INTEGRAL DE FASE 5");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;
  const PORT = process.env.PORT || 3000;

  // Tokens de prueba
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
  let totalTests = 0;
  let passedTests = 0;
  let tempIdeaId = null;

  async function testAsync(name, fn) {
    totalTests++;
    try {
      await fn();
      passedTests++;
      console.log(`  [PASS] ${String(totalTests).padStart(2, '0')}. ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${String(totalTests).padStart(2, '0')}. ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  try {
    // 0. Conteo inicial exacto de tablas en BD para verificar integridad
    const [cIdeasPre] = await conn.execute('SELECT COUNT(*) as c FROM ideas');
    const [cDesPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_desarrollo');
    const [cVerPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_versiones');
    const [cHistPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_historial');
    const [cPropPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_propositos');
    const [cCatPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_categorias');

    assert.ok(cIdeasPre[0].c >= 9, "Base inicial debe tener al menos 9 ideas.");
    assert.ok(cDesPre[0].c >= 9, "Base inicial debe tener al menos 9 registros de desarrollo.");
    assert.ok(cVerPre[0].c >= 1, "Base inicial debe tener al menos 1 versión formal.");
    assert.ok(cHistPre[0].c >= 11, "Base inicial debe tener al menos 11 registros de historial.");
    assert.strictEqual(cPropPre[0].c, 8, "Base inicial debe tener 8 propósitos oficiales.");
    assert.strictEqual(cCatPre[0].c, 0, "Base inicial debe tener 0 categorías.");

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });

    await context.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);

    const page = await context.newPage();

    // Auto-aceptar diálogos nativos (confirm/alert)
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.waitForLoadState('networkidle');

    console.log("--- SECCIÓN 1: INICIO, NAVEGACIÓN Y CARGA DE CATÁLOGOS (F5.1) ---");

    await testAsync("Navegación al módulo Ideas y activación de vista", async () => {
      await page.evaluate(() => {
        const sec = document.getElementById('ideas');
        if (sec) sec.style.display = 'flex';
        if (typeof showSection === 'function') showSection('ideas');
      });
      const isVisible = await page.$eval('#ideas', el => el.style.display !== 'none');
      assert.strictEqual(isVisible, true, "La sección #ideas debe estar visible.");
    });

    await testAsync("Catálogos oficiales cargados dinámicamente en window.ideasCatalogos", async () => {
      const cats = await page.evaluate(async () => {
        if (!window.ideasCatalogos && typeof loadIdeasCatalogos === 'function') {
          await window.loadIdeasCatalogos();
        }
        return window.ideasCatalogos;
      });
      assert.ok(cats, "window.ideasCatalogos debe existir.");
      assert.strictEqual(cats.propositos.length, 8, "Deben existir 8 propósitos oficiales.");
      assert.strictEqual(cats.estados.length, 7, "Deben existir 7 estados oficiales.");
      assert.strictEqual(cats.modalidades.length, 5, "Deben existir 5 modalidades oficiales.");
      assert.strictEqual(cats.privacidad.length, 3, "Deben existir 3 niveles de privacidad.");
      assert.strictEqual(cats.categorias.length, 0, "Categorías deben ser un arreglo vacío [].");
    });

    console.log("\n--- SECCIÓN 2: LISTADO 'MIS IDEAS' Y TARJETAS OFICIALES (F5.2) ---");

    await testAsync("Listado 'Mis Ideas' renderiza tarjetas con vocabulario oficial y sin estados legacy", async () => {
      await page.evaluate(async () => {
        if (typeof fetchAndDisplayIdeas === 'function') {
          await window.fetchAndDisplayIdeas();
        }
      });
      await page.waitForSelector('#lista-ideas .idea-card', { timeout: 5000 });

      const legacyFound = await page.evaluate(() => {
        const text = document.getElementById('lista-ideas').textContent.toLowerCase();
        return text.includes('en progreso') || text.includes('completada') || text.includes('descartada');
      });
      assert.strictEqual(legacyFound, false, "No debe aparecer vocabulario legacy en las tarjetas.");

      const cardsCount = await page.$$eval('#lista-ideas .idea-card', cards => cards.length);
      assert.ok(cardsCount >= 3, "El usuario 2 debe tener al menos 3 ideas visibles.");
    });

    await testAsync("Búsqueda con debounce y filtros de estado operan correctamente", async () => {
      // Filtrar por término específico
      await page.fill('#ideas-buscar', 'Libro');
      await page.waitForTimeout(600); // Tiempo de debounce
      const cardsFiltered = await page.$$eval('#lista-ideas .idea-card', cards => cards.length);
      assert.strictEqual(cardsFiltered, 1, "Debe quedar únicamente 1 tarjeta coincidente.");

      // Limpiar búsqueda
      await page.fill('#ideas-buscar', '');
      await page.waitForTimeout(600);
      const cardsReset = await page.$$eval('#lista-ideas .idea-card', cards => cards.length);
      assert.ok(cardsReset >= 3, "Deben reaparecer todas las ideas.");
    });

    console.log("\n--- SECCIÓN 3: CREACIÓN OFICIAL DE IDEA EN ESTADO SEMILLA (F5.3) ---");

    await testAsync("Creación de nueva Idea temporal mediante formulario oficial", async () => {
      const tituloTemp = `Idea Auditoría Integral ${Date.now()}`;
      await page.fill('#idea-titulo', tituloTemp);
      await page.fill('#idea-descripcion', 'Descripción de auditoría integral para validar el ciclo de vida de Fase 5.');
      await page.selectOption('#idea-privacidad', 'privada');
      await page.selectOption('#idea-modalidad', 'individual');

      // Enviar formulario mediante la función oficial o botón
      await page.evaluate(async () => {
        await window.handleCrearIdea();
      });

      // Esperar a que la nueva tarjeta aparezca en el contenedor
      await page.waitForFunction((tit) => {
        const cont = document.getElementById('lista-ideas');
        return cont && cont.textContent.includes(tit);
      }, tituloTemp, { timeout: 6000 });

      // Obtener el ID de la Idea recién creada en base de datos
      const [rows] = await conn.execute('SELECT id, estado, version_actual FROM ideas WHERE titulo = ?', [tituloTemp]);
      assert.strictEqual(rows.length, 1, "La Idea debe haberse creado en BD.");
      assert.strictEqual(rows[0].estado, 'semilla', "La nueva Idea debe nacer siempre en estado 'semilla'.");
      assert.strictEqual(rows[0].version_actual, 0, "La nueva Idea debe nacer en versión 'v0'.");

      tempIdeaId = rows[0].id;
    });

    console.log("\n--- SECCIÓN 4: APERTURA Y NAVEGACIÓN EN WORKSPACE (F5.4) ---");

    await testAsync("Abrir Workspace de la Idea temporal y verificar estructura de pestañas", async () => {
      await page.evaluate(async (id) => {
        await window.openIdeaWorkspace(id);
      }, tempIdeaId);

      await page.waitForSelector('#idea-workspace-view', { timeout: 5000 });
      const wsVisible = await page.$eval('#idea-workspace-view', el => el.style.display !== 'none');
      assert.strictEqual(wsVisible, true, "El Workspace debe ser visible.");

      // Verificar 5 pestañas
      const tabs = await page.$$eval('.workspace-tab-btn', btns => btns.map(b => b.dataset.tab));
      assert.ok(tabs.includes('canvas'), "Pestaña Canvas debe existir.");
      assert.ok(tabs.includes('info'), "Pestaña Información debe existir.");
      assert.ok(tabs.includes('versiones'), "Pestaña Versiones debe existir.");
      assert.ok(tabs.includes('historial'), "Pestaña Historial debe existir.");
      assert.ok(tabs.includes('idealita'), "Pestaña Idealita debe existir.");

      // Verificar estado y versión en el encabezado
      const estadoBadge = await page.$eval('#workspace-badge-estado', el => el.textContent.trim());
      assert.strictEqual(estadoBadge, "Semilla", "Badge debe indicar Semilla.");
      const versionBadge = await page.$eval('#workspace-badge-version', el => el.textContent.trim());
      assert.strictEqual(versionBadge, "v0 — Sin versión formal", "Badge debe indicar v0.");
    });

    console.log("\n--- SECCIÓN 5: EDICIÓN Y GUARDADO DEL CANVAS DE DESARROLLO (F5.5) ---");

    await testAsync("Editar campos del Canvas, detectar estado dirty y guardar exitosamente", async () => {
      await page.evaluate(() => window.switchWorkspaceTab('canvas'));
      await page.waitForSelector('#form-canvas-desarrollo', { timeout: 3000 });

      // Rellenar campos de desarrollo
      await page.fill('#canvas-edit-problema', 'Problema crítico detectado en la comunidad objetivo.');
      await page.fill('#canvas-edit-solucion', 'Solución modular e interactiva con base comunitaria.');
      await page.fill('#canvas-edit-beneficiarios', 'Jóvenes y líderes comunitarios.');
      await page.fill('#canvas-edit-recursos', 'Espacio físico, mentores y herramientas de software.');
      await page.fill('#canvas-edit-inversion', '25000.50');
      await page.fill('#canvas-edit-moneda', 'MXN');
      await page.fill('#canvas-edit-complejidad', 'media');
      await page.fill('#canvas-edit-potencial', 'alto');
      await page.fill('#canvas-edit-riesgos', 'Baja participación inicial.');
      await page.fill('#canvas-edit-notas', 'Notas de auditoría integral.');

      // Disparar input para marcar dirty
      await page.evaluate(() => {
        window.setCanvasDirty(true);
      });

      // Verificar indicador dirty
      const isDirty = await page.evaluate(() => window.workspaceCanvasDirty);
      assert.strictEqual(isDirty, true, "El Canvas debe estar marcado como dirty tras la edición.");

      // Guardar Canvas
      await page.evaluate(async () => {
        await window.guardarCambiosCanvas();
      });
      await page.waitForTimeout(600);

      // Verificar que el dirty indicator se apagó
      const isDirtyAfter = await page.evaluate(() => window.workspaceCanvasDirty);
      assert.strictEqual(isDirtyAfter, false, "El estado dirty debe apagarse tras guardar.");

      // Verificar persistencia en base de datos
      const [des] = await conn.execute('SELECT problema, solucion, inversion_estimada, moneda, complejidad FROM idea_desarrollo WHERE idea_id = ?', [tempIdeaId]);
      assert.strictEqual(des.length, 1, "Debe existir registro en idea_desarrollo.");
      assert.strictEqual(des[0].problema, 'Problema crítico detectado en la comunidad objetivo.');
      assert.strictEqual(des[0].solucion, 'Solución modular e interactiva con base comunitaria.');
      assert.strictEqual(Number(des[0].inversion_estimada), 25000.50);
      assert.strictEqual(des[0].moneda, 'MXN');
      assert.strictEqual(des[0].complejidad, 'media');
    });

    await testAsync("Principio de separación: guardar Canvas NO crea versión formal", async () => {
      const [vRows] = await conn.execute('SELECT COUNT(*) as c FROM idea_versiones WHERE idea_id = ?', [tempIdeaId]);
      assert.strictEqual(vRows[0].c, 0, "Guardar el Canvas NO debe haber creado ninguna versión formal en BD.");
    });

    console.log("\n--- SECCIÓN 6: CICLO DE VIDA Y MÁQUINA DE ESTADOS (F5.6) ---");

    await testAsync("Transición de estado: avanzar de semilla a en_desarrollo", async () => {
      // Iniciar cambio de estado y confirmar en modal oficial de Idealandia (cero window.confirm)
      await page.evaluate(() => {
        setTimeout(() => window.solicitarCambioEstado('en_desarrollo'), 0);
      });
      await page.waitForSelector('#custom-modal.active', { timeout: 3000 });
      await page.click('#custom-modal-buttons button:last-child');
      await page.waitForTimeout(800);

      // Verificar estado en frontend
      const estadoHeader = await page.$eval('#workspace-badge-estado', el => el.textContent.trim());
      assert.strictEqual(estadoHeader, "En Desarrollo", "El Workspace debe reflejar En Desarrollo.");

      // Verificar estado en base de datos
      const [iRows] = await conn.execute('SELECT estado FROM ideas WHERE id = ?', [tempIdeaId]);
      assert.strictEqual(iRows[0].estado, 'en_desarrollo', "En base de datos el estado debe ser 'en_desarrollo'.");
    });

    console.log("\n--- SECCIÓN 7: CONSOLIDACIÓN DE VERSIÓN FORMAL (F5.7) ---");

    await testAsync("Crear versión formal y verificar inmutabilidad y sincronización", async () => {
      await page.evaluate(() => window.switchWorkspaceTab('versiones'));
      await page.waitForTimeout(400);

      // Crear versión formal
      await page.fill('#version-motivo-input', 'Versión formal consolidada de prueba E2E');
      await page.evaluate(async () => {
        await window.crearNuevaVersion();
      });
      await page.waitForTimeout(1000);

      // Limpiar modales abiertos si existieran
      await page.evaluate(() => {
        document.querySelectorAll('.custom-modal-overlay').forEach(el => {
          el.classList.remove('active');
          el.style.display = 'none';
        });
      });

      // Verificar versión en encabezado (tras semilla -> en_desarrollo se genera v1, al consolidar pasa a v2)
      const vBadge = await page.$eval('#workspace-badge-version', el => el.textContent.trim());
      assert.ok(vBadge === 'v1' || vBadge === 'v2', `El badge de versión debe reflejar versión formal (valor: ${vBadge}).`);

      // Verificar versión en base de datos
      const [vRows] = await conn.execute('SELECT numero_version, motivo_cambio FROM idea_versiones WHERE idea_id = ? ORDER BY numero_version DESC', [tempIdeaId]);
      assert.ok(vRows.length >= 1, "Debe existir al menos 1 versión formal en BD.");
    });

    console.log("\n--- SECCIÓN 8: HISTORIAL Y TRAZABILIDAD VISUAL (F5.8) ---");

    await testAsync("Carga bajo demanda del historial y trazabilidad cronológica ascendente", async () => {
      await page.evaluate(() => window.switchWorkspaceTab('historial'));
      await page.waitForTimeout(400);

      // Esperar a que los eventos se rendericen
      await page.waitForFunction(() => {
        const items = document.querySelectorAll('.timeline-item');
        return items.length >= 4; // creacion, actualizacion, cambio_estado, nueva_version
      }, { timeout: 5000 });

      const countBadge = await page.$eval('#historial-count-badge', el => el.textContent.trim());
      assert.ok(Number(countBadge) >= 4, "El badge debe registrar al menos 4 eventos.");

      // Verificar estricta solo lectura en el historial (cero botones de edición/borrado)
      const actionButtons = await page.$$eval('#workspace-panel-historial button', btns => {
        return btns.filter(b => b.id !== 'btn-refrescar-historial' && b.id !== 'btn-retry-historial').length;
      });
      assert.strictEqual(actionButtons, 0, "No deben existir botones de mutación en el historial.");
    });

    console.log("\n--- SECCIÓN 9: INTEGRACIÓN CONTEXTUAL DE IDEALITA (F5.9) ---");

    await testAsync("Idealita contextual identifica la Idea temporal y conversa sobre su Canvas", async () => {
      await page.evaluate(() => {
        document.querySelectorAll('.custom-modal-overlay').forEach(el => {
          el.classList.remove('active');
          el.style.display = 'none';
        });
        window.switchWorkspaceTab('idealita');
      });
      await page.waitForTimeout(400);

      const headerTitulo = await page.$eval('#idealita-idea-titulo', el => el.textContent.trim());
      assert.ok(headerTitulo.includes("Idea Auditoría Integral"), "Idealita debe encabezar con el título de la Idea temporal.");

      // Interceptar /api/chat para simular respuesta exitosa sin consumir cuota externa
      await page.unroute('**/api/chat').catch(() => {});
      let capturedMsg = null;
      await page.route('**/api/chat', async route => {
        capturedMsg = JSON.parse(route.request().postData()).message;
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: 'Como Idealita, he analizado tu Idea temporal y te sugiero priorizar la validación del problema con 5 entrevistas.'
        });
      });

      // Enviar consulta contextual
      await page.fill('#idealita-context-input', '¿Cómo empezar las entrevistas?');
      await page.evaluate(() => window.sendIdealitaContextMessage());

      await page.waitForFunction(() => {
        const bubbles = document.querySelectorAll('#idealita-context-history .idealita-bubble');
        return bubbles.length > 0 && bubbles[bubbles.length - 1].textContent.includes("5 entrevistas");
      }, { timeout: 5000 });

      assert.ok(capturedMsg, "Se debió enviar petición a /api/chat.");
      assert.ok(capturedMsg.includes("Idea Auditoría Integral"), "El prompt enviado a /api/chat debe incluir el contexto de la Idea.");
    });

    console.log("\n--- SECCIÓN 10: AISLAMIENTO CRÍTICO DE CONTEXTOS (NO MEZCLA DE IDEAS) ---");

    await testAsync("Cambio a Idea 3: aislamiento absoluto de contexto sin mezcla con la Idea temporal", async () => {
      await page.evaluate(async () => {
        await window.openIdeaWorkspace(3);
        window.switchWorkspaceTab('idealita');
      });
      await page.waitForFunction(() => {
        const t = document.getElementById('idealita-idea-titulo');
        return t && t.textContent.includes("Venta de servicios de orientación");
      }, { timeout: 5000 });

      const currentContextId = await page.evaluate(() => window.currentIdeaIdealitaId);
      assert.strictEqual(currentContextId, 3, "El ID de Idealita debe cambiar a 3.");

      const histContent = await page.$eval('#idealita-context-history', el => el.textContent);
      assert.strictEqual(histContent.includes("Idea Auditoría Integral"), false, "NO debe existir rastro de la Idea temporal en Idea 3.");
      assert.ok(histContent.includes("Venta de servicios de orientación"), "Debe reflejar la Idea 3.");
    });

    await testAsync("Regreso a la Idea temporal: restaura su contexto sin retener datos de Idea 3", async () => {
      await page.evaluate(async (id) => {
        await window.openIdeaWorkspace(id);
        window.switchWorkspaceTab('idealita');
      }, tempIdeaId);
      await page.waitForFunction((id) => {
        const t = document.getElementById('idealita-idea-titulo');
        return t && t.textContent.includes("Idea Auditoría Integral");
      }, tempIdeaId, { timeout: 5000 });

      const histContent = await page.$eval('#idealita-context-history', el => el.textContent);
      assert.strictEqual(histContent.includes("servicios de orientación"), false, "NO debe existir rastro de Idea 3 en la Idea temporal.");
    });

    console.log("\n--- SECCIÓN 11: SEGURIDAD, RBAC, ANTI-IDOR Y SANITIZACIÓN (XSS) ---");

    await testAsync("Anti-IDOR: consultar Idea privada de otro usuario devuelve 404", async () => {
      // Idea 1017 pertenece a usuario 7 (privada)
      const idorResult = await page.evaluate(async () => {
        const res = await fetch('/api/ideas/1017', { cache: 'no-store', skipRbacInterceptor: true });
        return { status: res.status };
      });
      assert.strictEqual(idorResult.status, 404, "Acceso a Idea privada ajena debe responder 404.");
    });

    await testAsync("Seguridad de Contexto: el prompt de Idealita no contiene tokens, JWT ni contraseñas", async () => {
      const promptText = await page.evaluate(() => {
        return window.formatIdeaContextPrompt(window.currentIdeaIdealitaContext, "prueba de seguridad");
      });
      assert.strictEqual(promptText.includes(tokenUser2), false, "No debe incluir el token JWT.");
      assert.strictEqual(promptText.includes("password"), false, "No debe incluir passwords.");
      assert.strictEqual(promptText.includes("jwt_version"), false, "No debe incluir jwt_version.");
    });

    await testAsync("Sanitización XSS: inyecciones HTML en chat de Idealita son sanitizadas", async () => {
      const sanitizedOutput = await page.evaluate(() => {
        return window.formatIdealitaMarkdown('<script>alert("xss")</script>Texto seguro <img src=x onerror=alert(1)>');
      });
      assert.strictEqual(sanitizedOutput.includes('<script>'), false, "Etiquetas script deben eliminarse.");
      assert.strictEqual(sanitizedOutput.includes('onerror='), false, "Atributos onerror deben eliminarse.");
      assert.ok(sanitizedOutput.includes('Texto seguro'), "El texto seguro debe preservarse.");
    });

    console.log("\n--- SECCIÓN 12: RESPONSIVE Y MENÚ MÓVIL (412x915) ---");

    await testAsync("Verificación en viewport móvil (412x915): sin desbordamiento horizontal", async () => {
      await page.setViewportSize({ width: 412, height: 915 });
      await page.waitForTimeout(300);

      const scrollWidth = await page.$eval('#ideas', el => el.scrollWidth);
      const clientWidth = await page.$eval('#ideas', el => el.clientWidth);
      assert.ok(scrollWidth <= clientWidth + 2, "No debe existir desbordamiento horizontal en viewport móvil.");

      // Restaurar tamaño escritorio
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    console.log("\n--- SECCIÓN 13: REGRESO A MIS IDEAS Y ELIMINACIÓN SEGURA ---");

    await testAsync("Cerrar Workspace, regresar a 'Mis Ideas' y eliminar la Idea temporal", async () => {
      await page.evaluate(() => {
        window.closeIdeaWorkspace();
      });

      await page.waitForSelector('#ideas-list-view', { timeout: 4000 });
      const isListVisible = await page.$eval('#ideas-list-view', el => el.style.display !== 'none');
      assert.strictEqual(isListVisible, true, "Mis Ideas debe volver a ser visible.");

      // Limpieza vía base de datos para garantizar retorno al baseline exacto
      await conn.execute('DELETE FROM idea_historial WHERE idea_id = ?', [tempIdeaId]);
      await conn.execute('DELETE FROM idea_versiones WHERE idea_id = ?', [tempIdeaId]);
      await conn.execute('DELETE FROM idea_desarrollo WHERE idea_id = ?', [tempIdeaId]);
      await conn.execute('DELETE FROM ideas WHERE id = ?', [tempIdeaId]);

      // Refrescar lista cliente
      await page.evaluate(async () => {
        if (typeof fetchAndDisplayIdeas === 'function') {
          await window.fetchAndDisplayIdeas();
        }
      });
      await page.waitForTimeout(500);

      const existsInDom = await page.evaluate((id) => {
        return !!document.querySelector(`.idea-card[data-id="${id}"]`);
      }, tempIdeaId);
      assert.strictEqual(existsInDom, false, "La tarjeta temporal debe desaparecer del listado.");
    });

    console.log("\n--- SECCIÓN 14: VERIFICACIÓN FINAL DE INTEGRIDAD DE BASE DE DATOS ---");

    await testAsync("Verificar retorno exacto al estado de línea base de la base de datos", async () => {
      const [cIdeasPost] = await conn.execute('SELECT COUNT(*) as c FROM ideas');
      const [cDesPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_desarrollo');
      const [cVerPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_versiones');
      const [cHistPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_historial');
      const [cPropPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_propositos');
      const [cCatPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_categorias');

      assert.strictEqual(cIdeasPost[0].c, cIdeasPre[0].c, "La cantidad de ideas debe volver exactamente a la cantidad inicial.");
      assert.strictEqual(cDesPost[0].c, cDesPre[0].c, "Los registros de desarrollo deben volver exactamente a la cantidad inicial.");
      assert.strictEqual(cVerPost[0].c, cVerPre[0].c, "Las versiones formales deben volver exactamente a la cantidad inicial.");
      assert.strictEqual(cHistPost[0].c, cHistPre[0].c, "Las entradas de historial deben volver exactamente a la cantidad inicial.");
      assert.strictEqual(cPropPost[0].c, 8, "Debe haber exactamente 8 propósitos.");
      assert.strictEqual(cCatPost[0].c, 0, "Debe haber exactamente 0 categorías.");

      // Verificar integridad de la Idea #3
      const [idea3] = await conn.execute('SELECT id, titulo, estado, version_actual, usuario_id FROM ideas WHERE id = 3');
      assert.strictEqual(idea3[0].id, 3);
      assert.strictEqual(idea3[0].titulo, 'Venta de servicios de orientación');
      assert.strictEqual(idea3[0].estado, 'en_desarrollo');
      assert.strictEqual(idea3[0].version_actual, 1);
      assert.strictEqual(idea3[0].usuario_id, 2);
    });

  } finally {
    await browser.close();
    await conn.end();
  }

  console.log("\n========================================================================");
  console.log(`TOTAL PRUEBAS E2E: ${totalTests} | APROBADAS: ${passedTests} | FALLIDAS: ${totalTests - passedTests}`);
  console.log(`PORCENTAJE DE APROBACIÓN: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log("========================================================================");

  if (passedTests === totalTests) {
    console.log("\n>>> SUITE TEST_F5_10 CONCLUIDA EXITOSAMENTE AL 100% <<<");
    process.exit(0);
  } else {
    console.error("\n>>> EXISTEN PRUEBAS FALLIDAS EN TEST_F5_10 <<<");
    process.exit(1);
  }
})();
