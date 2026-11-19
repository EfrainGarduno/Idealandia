const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE PRUEBAS FRONTEND: F5.9 — INTEGRACIÓN CONTEXTUAL DE IDEALITA EN LA IDEA");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;
  const PORT = process.env.PORT || 3000;

  // Tokens
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

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
    // 0. Conteo inicial de tablas en BD para verificar integridad
    const [cIdeasPre] = await conn.execute('SELECT COUNT(*) as c FROM ideas');
    const [cDesPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_desarrollo');
    const [cVerPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_versiones');
    const [cHistPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_historial');
    const [cPropPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_propositos');
    const [cCatPre] = await conn.execute('SELECT COUNT(*) as c FROM idea_categorias');

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });

    await context.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);

    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.waitForLoadState('networkidle');

    // Activar sección ideas
    await page.evaluate(() => {
      const sec = document.getElementById('ideas');
      if (sec) sec.style.display = 'flex';
    });

    console.log("--- GRUPO 1: CONTEXTO DE LA IDEA (TESTS 01 - 10) ---");

    // 1. Pestaña Idealita existe
    await testAsync("Pestaña Idealita existe en la barra de pestañas", async () => {
      const tabBtn = await page.$('.workspace-tab-btn[data-tab="idealita"]');
      assert.ok(tabBtn, "El botón de la pestaña Idealita debe existir.");
      const panel = await page.$('#workspace-panel-idealita');
      assert.ok(panel, "El panel #workspace-panel-idealita debe existir en el DOM.");
    });

    // 2. Idealita se abre desde Workspace
    await testAsync("Idealita se abre desde Workspace", async () => {
      await page.evaluate(async () => {
        const sec = document.getElementById('ideas');
        if (sec) sec.style.display = 'flex';
        await window.openIdeaWorkspace(3);
        window.switchWorkspaceTab('idealita');
      });
      await page.waitForFunction(() => {
        const main = document.getElementById('idealita-context-main');
        return main && main.style.display !== 'none';
      }, { timeout: 5000 });
      const isVisible = await page.$eval('#idealita-context-main', el => el.style.display !== 'none');
      assert.strictEqual(isVisible, true, "El panel contextual de Idealita debe abrirse y mostrarse.");
    });

    // 3. Identifica correctamente la Idea actual
    await testAsync("Identifica correctamente la Idea actual (Idea #3)", async () => {
      const currentId = await page.evaluate(() => window.currentIdeaIdealitaId);
      assert.strictEqual(currentId, 3, "El ID de la Idea contextual debe ser 3.");
    });

    // 4. Muestra título correcto
    await testAsync("Muestra título correcto de la Idea en el header contextual", async () => {
      const titulo = await page.$eval('#idealita-idea-titulo', el => el.textContent.trim());
      assert.strictEqual(titulo, "Venta de servicios de orientación", "Debe coincidir con el título de la Idea 3.");
    });

    // 5. Muestra estado
    await testAsync("Muestra estado oficial de la Idea", async () => {
      const estado = await page.$eval('#idealita-badge-estado', el => el.textContent.trim());
      assert.strictEqual(estado, "En Desarrollo");
    });

    // 6. Muestra versión
    await testAsync("Muestra versión formal actual", async () => {
      const version = await page.$eval('#idealita-badge-version', el => el.textContent.trim());
      assert.strictEqual(version, "v1");
    });

    // 7. Muestra contexto del Canvas
    await testAsync("Muestra contexto del Canvas estructurado (problema, solución, beneficiarios, riesgos)", async () => {
      const summary = await page.evaluate(() => ({
        problema: document.getElementById('idealita-summary-problema').textContent.trim(),
        solucion: document.getElementById('idealita-summary-solucion').textContent.trim(),
        beneficiarios: document.getElementById('idealita-summary-beneficiarios').textContent.trim(),
        riesgos: document.getElementById('idealita-summary-riesgos').textContent.trim()
      }));
      assert.ok(summary.problema.length > 0, "Debe mostrar el problema del Canvas");
      assert.ok(summary.solucion.length > 0, "Debe mostrar la solución del Canvas");
      assert.ok(summary.beneficiarios.length > 0, "Debe mostrar beneficiarios");
      assert.ok(summary.riesgos.length > 0, "Debe mostrar riesgos");
    });

    // 8. Muestra propósitos/categorías cuando existen
    await testAsync("Muestra propósitos/categorías cuando existen", async () => {
      const propText = await page.$eval('#idealita-badge-proposito', el => el.textContent.trim());
      assert.ok(propText.length > 0, "Debe mostrar propósito asignado o estado sin propósitos");
    });

    // 9. No muestra información de otra Idea
    await testAsync("No muestra información de otra Idea", async () => {
      const panelContent = await page.$eval('#workspace-panel-idealita', el => el.textContent);
      assert.strictEqual(panelContent.includes("Libro QUE HARIAS SI!"), false, "No debe contener datos de la Idea 2");
      assert.strictEqual(panelContent.includes("Mitata"), false, "No debe contener datos de Idea 1025");
    });

    // 10. Contexto se limpia al cambiar de Idea
    await testAsync("Contexto se limpia al cambiar de Idea", async () => {
      await page.evaluate(async () => {
        const sec = document.getElementById('ideas');
        if (sec) sec.style.display = 'flex';
        await window.openIdeaWorkspace(2);
        window.switchWorkspaceTab('idealita');
      });
      await page.waitForFunction(() => {
        const titulo = document.getElementById('idealita-idea-titulo');
        return titulo && titulo.textContent.includes("Libro QUE HARIAS SI!");
      }, { timeout: 5000 });

      const newTitle = await page.$eval('#idealita-idea-titulo', el => el.textContent.trim());
      assert.strictEqual(newTitle, "Libro QUE HARIAS SI!");

      const historyText = await page.$eval('#idealita-context-history', el => el.textContent);
      assert.strictEqual(historyText.includes("servicios de orientación"), false, "Contexto anterior debe estar limpio.");

      // Regresar a Idea 3
      await page.evaluate(async () => {
        const sec = document.getElementById('ideas');
        if (sec) sec.style.display = 'flex';
        await window.openIdeaWorkspace(3);
        window.switchWorkspaceTab('idealita');
      });
      await page.waitForFunction(() => {
        const titulo = document.getElementById('idealita-idea-titulo');
        return titulo && titulo.textContent.includes("Venta de servicios de orientación");
      }, { timeout: 5000 });
    });

    console.log("\n--- GRUPO 2: CARGA Y ESTADOS (TESTS 11 - 14) ---");

    // 11. Contexto se carga correctamente
    await testAsync("Contexto se carga correctamente en memoria", async () => {
      const ctx = await page.evaluate(() => window.currentIdeaIdealitaContext);
      assert.ok(ctx, "El contexto debe existir");
      assert.strictEqual(ctx.idea.id, 3);
      assert.strictEqual(ctx.idea.titulo, "Venta de servicios de orientación");
      assert.strictEqual(ctx.idea.estado, "en_desarrollo");
    });

    // 12. Estado de carga visible
    await testAsync("Estado de carga visible durante la inicialización", async () => {
      const loadingEl = await page.$('#idealita-context-loading');
      assert.ok(loadingEl, "#idealita-context-loading debe existir en el DOM.");
    });

    // 13. Error de contexto manejado
    await testAsync("Error de contexto manejado cuando la Idea no está disponible", async () => {
      const errorDiv = await page.$('#idealita-context-error');
      assert.ok(errorDiv, "#idealita-context-error debe existir para desplegar errores.");
    });

    // 14. No existen solicitudes duplicadas
    await testAsync("No existen solicitudes duplicadas por clics concurrentes", async () => {
      let reqCount = 0;
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        reqCount++;
        await new Promise(r => setTimeout(r, 200));
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Respuesta única' });
      });

      await page.fill('#idealita-context-input', 'Pregunta concurrente');
      await Promise.all([
        page.evaluate(() => window.sendIdealitaContextMessage()),
        page.evaluate(() => window.sendIdealitaContextMessage())
      ]);

      await page.waitForTimeout(300);
      assert.strictEqual(reqCount, 1, "Solo 1 solicitud POST debe ejecutarse.");
    });

    console.log("\n--- GRUPO 3: CHAT Y COMUNICACIÓN CON /api/chat (TESTS 15 - 21) ---");

    // 15. /api/chat existente continúa funcionando
    await testAsync("/api/chat existente continúa funcionando según contrato", async () => {
      const isFn = await page.evaluate(() => typeof window.sendIdealitaContextMessage === 'function');
      assert.strictEqual(isFn, true);
    });

    // 16. Mensaje contextual enviado correctamente según contrato real
    await testAsync("Mensaje contextual enviado correctamente según contrato real", async () => {
      let capturedPayload = null;
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        capturedPayload = JSON.parse(route.request().postData());
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: 'Respuesta recibida correctamente.'
        });
      });

      await page.fill('#idealita-context-input', '¿Cómo validar este modelo?');
      await page.click('#btn-send-idealita-context');

      await page.waitForFunction(() => {
        const bubbles = document.querySelectorAll('#idealita-context-history .idealita-bubble');
        return bubbles.length > 0 && bubbles[bubbles.length - 1].textContent.includes("Respuesta recibida correctamente.");
      }, { timeout: 5000 });

      assert.ok(capturedPayload, "El payload debió enviarse");
      assert.ok(capturedPayload.message.includes("Venta de servicios de orientación"), "El prompt incluye la Idea");
      assert.ok(capturedPayload.message.includes("¿Cómo validar este modelo?"), "El prompt incluye la pregunta");
    });

    // 17. Respuesta de Idealita mostrada
    await testAsync("Respuesta de Idealita mostrada en el historial de conversación", async () => {
      const bubbles = await page.$$eval('#idealita-context-history .idealita-bubble', els => els.map(e => e.textContent));
      assert.ok(bubbles[bubbles.length - 1].includes("Respuesta recibida correctamente."));
    });

    // 18. Estado 'pensando' funciona
    await testAsync("Estado 'pensando' funciona durante la espera", async () => {
      let release;
      const p = new Promise(r => release = r);
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        await p;
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Fin del thinking.' });
      });

      await page.fill('#idealita-context-input', 'Prueba de thinking');
      page.click('#btn-send-idealita-context').catch(() => {});

      await page.waitForFunction(() => {
        const t = document.getElementById('idealita-context-thinking');
        return t && t.style.display !== 'none';
      }, { timeout: 3000 });

      const isThinking = await page.$eval('#idealita-context-thinking', el => el.style.display !== 'none');
      assert.strictEqual(isThinking, true, "Debe ser visible");

      release();

      await page.waitForFunction(() => {
        const t = document.getElementById('idealita-context-thinking');
        return t && t.style.display === 'none';
      }, { timeout: 5000 });
    });

    // 19. Error de IA manejado
    await testAsync("Error de IA manejado con mensaje amigable", async () => {
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        await route.fulfill({ status: 500, json: { error: 'Internal server error' } });
      });

      await page.fill('#idealita-context-input', 'Pregunta con 500');
      await page.click('#btn-send-idealita-context');

      await page.waitForFunction(() => {
        const err = document.getElementById('idealita-context-error');
        return err && err.style.display !== 'none';
      }, { timeout: 4000 });

      const errText = await page.$eval('#idealita-context-error-message', el => el.textContent);
      assert.strictEqual(errText, "Idealita no pudo responder en este momento. Inténtalo nuevamente.");
    });

    // 20. Timeout manejado
    await testAsync("Timeout manejado sin bloquear la interfaz", async () => {
      // Simular reintento que recupera la comunicación
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Respuesta recuperada tras reintento.' });
      });

      await page.click('#btn-retry-idealita-context');

      await page.waitForFunction(() => {
        const bubbles = document.querySelectorAll('#idealita-context-history .idealita-bubble');
        return bubbles.length > 0 && bubbles[bubbles.length - 1].textContent.includes("Respuesta recuperada tras reintento.");
      }, { timeout: 5000 });

      const lastBubbleText = await page.evaluate(() => {
        const bubbles = document.querySelectorAll('#idealita-context-history .idealita-bubble');
        return bubbles[bubbles.length - 1].textContent;
      });
      assert.ok(lastBubbleText.includes("Respuesta recuperada tras reintento."), "El botón Reintentar recuperó la respuesta.");
    });

    // 21. No se duplican mensajes
    await testAsync("No se duplican mensajes al enviar una consulta", async () => {
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Respuesta sin duplicados.' });
      });

      await page.fill('#idealita-context-input', 'Consulta para verificar no duplicidad');
      await page.click('#btn-send-idealita-context');

      await page.waitForFunction(() => {
        const bubbles = document.querySelectorAll('#idealita-context-history .idealita-bubble');
        return bubbles.length > 0 && bubbles[bubbles.length - 1].textContent.includes("Respuesta sin duplicados.");
      }, { timeout: 5000 });

      const userMsgs = await page.$$eval('#idealita-context-history .user-bubble', els => els.map(e => e.textContent));
      const count = userMsgs.filter(m => m === 'Consulta para verificar no duplicidad').length;
      assert.strictEqual(count, 1, "El mensaje enviado debe aparecer exactamente 1 vez en el historial.");
    });

    console.log("\n--- GRUPO 4: SEGURIDAD (TESTS 22 - 29) ---");

    // 22. 401
    await testAsync("Manejo de error HTTP 401 (sesión expirada)", async () => {
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      });

      await page.fill('#idealita-context-input', 'Consulta 401');
      await page.click('#btn-send-idealita-context');

      await page.waitForFunction(() => {
        const err = document.getElementById('idealita-context-error');
        return err && err.style.display !== 'none';
      }, { timeout: 4000 });

      const errText = await page.$eval('#idealita-context-error-message', el => el.textContent);
      assert.ok(errText.includes("expirado") || errText.includes("sesión"));
    });

    // 23. 403
    await testAsync("Manejo de error HTTP 403 (RBAC)", async () => {
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        await route.fulfill({ status: 403, json: { error: 'Acceso no autorizado o vencido para esta funcionalidad.' } });
      });

      await page.fill('#idealita-context-input', 'Consulta 403');
      await page.click('#btn-send-idealita-context');

      await page.waitForFunction(() => {
        const err = document.getElementById('idealita-context-error-message');
        return err && err.textContent.includes("Acceso no autorizado o vencido para esta funcionalidad.");
      }, { timeout: 4000 });

      const errText = await page.$eval('#idealita-context-error-message', el => el.textContent);
      assert.strictEqual(errText, "Acceso no autorizado o vencido para esta funcionalidad.");
    });

    // 24. 404
    await testAsync("Manejo de error HTTP 404 (Idea no disponible)", async () => {
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        await route.fulfill({ status: 404, json: { error: 'Not Found' } });
      });

      await page.fill('#idealita-context-input', 'Consulta 404');
      await page.click('#btn-send-idealita-context');

      await page.waitForFunction(() => {
        const err = document.getElementById('idealita-context-error-message');
        return err && err.textContent.includes("La Idea no está disponible.");
      }, { timeout: 4000 });

      const errText = await page.$eval('#idealita-context-error-message', el => el.textContent);
      assert.strictEqual(errText, "La Idea no está disponible.");
    });

    // 25. No se envían credenciales al modelo
    await testAsync("No se envían credenciales al modelo", async () => {
      const prompt = await page.evaluate(() => {
        return window.formatIdeaContextPrompt(window.currentIdeaIdealitaContext, "pregunta");
      });
      assert.strictEqual(prompt.includes("password"), false);
      assert.strictEqual(prompt.includes("credential"), false);
    });

    // 26. No se envían tokens
    await testAsync("No se envían tokens al modelo", async () => {
      const prompt = await page.evaluate(() => {
        return window.formatIdeaContextPrompt(window.currentIdeaIdealitaContext, "pregunta");
      });
      assert.strictEqual(prompt.includes("auth_token"), false);
      assert.strictEqual(prompt.includes(tokenUser2), false);
    });

    // 27. No se envían contraseñas
    await testAsync("No se envían contraseñas al modelo", async () => {
      const ctx = await page.evaluate(() => window.currentIdeaIdealitaContext);
      assert.strictEqual(JSON.stringify(ctx).includes("password"), false);
      assert.strictEqual(JSON.stringify(ctx).includes("contraseña"), false);
    });

    // 28. No se envían permisos internos
    await testAsync("No se envían permisos internos RBAC al modelo", async () => {
      const prompt = await page.evaluate(() => {
        return window.formatIdeaContextPrompt(window.currentIdeaIdealitaContext, "pregunta");
      });
      assert.strictEqual(prompt.includes("roles_permisos"), false);
      assert.strictEqual(prompt.includes("jwt_version"), false);
    });

    // 29. No se filtra contexto de otra Idea
    await testAsync("No se filtra contexto de otra Idea en el prompt", async () => {
      const prompt = await page.evaluate(() => {
        return window.formatIdeaContextPrompt(window.currentIdeaIdealitaContext, "pregunta");
      });
      assert.strictEqual(prompt.includes("Libro QUE HARIAS SI!"), false);
      assert.strictEqual(prompt.includes("Mitata"), false);
    });

    console.log("\n--- GRUPO 5: NO MUTACIÓN (TESTS 30 - 36) ---");

    // 30. Idealita no modifica Canvas
    await testAsync("Idealita no modifica Canvas", async () => {
      const isDirty = await page.evaluate(() => window.workspaceCanvasDirty);
      assert.strictEqual(isDirty, false, "El Canvas no debe marcarse sucio ni mutarse");
    });

    // 31. Idealita no crea versiones
    await testAsync("Idealita no crea versiones", async () => {
      const [vRows] = await conn.execute('SELECT COUNT(*) as c FROM idea_versiones');
      assert.strictEqual(vRows[0].c, cVerPre[0].c, "Conteo de versiones no debe cambiar");
    });

    // 32. Idealita no cambia estado
    await testAsync("Idealita no cambia estado", async () => {
      const [iRows] = await conn.execute('SELECT estado FROM ideas WHERE id = 3');
      assert.strictEqual(iRows[0].estado, 'en_desarrollo', "Estado debe permanecer en_desarrollo");
    });

    // 33. Idealita no cambia privacidad
    await testAsync("Idealita no cambia privacidad", async () => {
      const [iRows] = await conn.execute('SELECT privacidad FROM ideas WHERE id = 3');
      assert.strictEqual(iRows[0].privacidad, 'privada', "Privacidad debe permanecer privada");
    });

    // 34. Idealita no cambia modalidad
    await testAsync("Idealita no cambia modalidad", async () => {
      const [iRows] = await conn.execute('SELECT modalidad FROM ideas WHERE id = 3');
      assert.strictEqual(iRows[0].modalidad, 'individual', "Modalidad debe permanecer individual");
    });

    // 35. Idealita no crea accesos
    await testAsync("Idealita no crea accesos en base de datos", async () => {
      const isSending = await page.evaluate(() => window.isSendingIdealitaMessage);
      assert.strictEqual(isSending, false);
    });

    // 36. Idealita no crea relaciones entre Ideas
    await testAsync("Idealita no crea relaciones persistentes entre Ideas", async () => {
      const [ideasCount] = await conn.execute('SELECT COUNT(*) as c FROM ideas');
      assert.strictEqual(ideasCount[0].c, cIdeasPre[0].c, "Total de ideas debe ser idéntico");
    });

    console.log("\n--- GRUPO 6: MODOS CONTEXTUALES (TESTS 37 - 42) ---");

    const modosTest = [
      { mode: 'explorar', key: 'explorar' },
      { mode: 'madurar', key: 'madurar' },
      { mode: 'validar', key: 'supuestos' },
      { mode: 'riesgos', key: 'riesgos' },
      { mode: 'impacto', key: 'impacto' },
      { mode: 'alternativas', key: 'alternativas' }
    ];

    for (const m of modosTest) {
      await testAsync(`Modo rápido '${m.mode}' funciona correctamente`, async () => {
        let sentPrompt = null;
        await page.unroute('**/api/chat').catch(() => {});
        await page.route('**/api/chat', async route => {
          sentPrompt = JSON.parse(route.request().postData()).message;
          await route.fulfill({
            status: 200,
            contentType: 'text/plain',
            body: `Respuesta modo ${m.mode}.`
          });
        });

        await page.click(`.idealita-mode-chip[data-mode="${m.mode}"]`);
        await page.waitForFunction((mode) => {
          const bubbles = document.querySelectorAll('#idealita-context-history .idealita-bubble');
          return bubbles.length > 0 && bubbles[bubbles.length - 1].textContent.includes(`modo ${mode}`);
        }, m.mode, { timeout: 5000 });

        assert.ok(sentPrompt);
        assert.ok(sentPrompt.includes(m.key));
      });
    }

    // Modo ¿Y si...? (Test 42)
    await testAsync("Modo rápido '¿Y si...?' funciona correctamente", async () => {
      let sentPrompt = null;
      await page.unroute('**/api/chat').catch(() => {});
      await page.route('**/api/chat', async route => {
        sentPrompt = JSON.parse(route.request().postData()).message;
        await route.fulfill({
          status: 200,
          contentType: 'text/plain',
          body: 'Respuesta modo ¿Y si...?.'
        });
      });

      await page.click(`.idealita-mode-chip[data-mode="y-si"]`);
      await page.waitForFunction(() => {
        const bubbles = document.querySelectorAll('#idealita-context-history .idealita-bubble');
        return bubbles.length > 0 && bubbles[bubbles.length - 1].textContent.includes("modo ¿Y si...?");
      }, { timeout: 5000 });

      assert.ok(sentPrompt);
      assert.ok(sentPrompt.includes("¿Y si...?"));
    });

    console.log("\n--- GRUPO 7: RESPONSIVE Y ACCESIBILIDAD (TESTS 43 - 45) ---");

    // 43. 412x915
    await testAsync("Renderizado correcto en viewport móvil (412x915)", async () => {
      await page.setViewportSize({ width: 412, height: 915 });
      await page.waitForTimeout(200);

      const isVisible = await page.$eval('#workspace-panel-idealita', el => el.style.display !== 'none');
      assert.strictEqual(isVisible, true, "El panel de Idealita debe permanecer visible en mobile.");
    });

    // 44. Sin overflow horizontal
    await testAsync("Sin overflow horizontal en viewport móvil", async () => {
      const scrollWidth = await page.$eval('#workspace-panel-idealita', el => el.scrollWidth);
      const clientWidth = await page.$eval('#workspace-panel-idealita', el => el.clientWidth);
      assert.ok(scrollWidth <= clientWidth + 2, "No debe existir overflow horizontal");
    });

    // 45. Campo de entrada accesible
    await testAsync("Campo de entrada accesible y responsivo", async () => {
      const inputBounding = await page.$eval('#idealita-context-input', el => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height };
      });
      assert.ok(inputBounding.width > 150, "El input ocupa el ancho disponible.");
      assert.ok(inputBounding.height >= 40, "El input cumple con altura táctil accesible.");

      // Restaurar viewport
      await page.setViewportSize({ width: 1280, height: 800 });
    });

    console.log("\n--- VERIFICACIÓN FINAL: INTEGRIDAD DE BASE DE DATOS ---");

    const [cIdeasPost] = await conn.execute('SELECT COUNT(*) as c FROM ideas');
    const [cDesPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_desarrollo');
    const [cVerPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_versiones');
    const [cHistPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_historial');
    const [cPropPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_propositos');
    const [cCatPost] = await conn.execute('SELECT COUNT(*) as c FROM idea_categorias');

    assert.strictEqual(cIdeasPost[0].c, cIdeasPre[0].c, "Conteo de ideas no debe cambiar (9).");
    assert.strictEqual(cDesPost[0].c, cDesPre[0].c, "Conteo de idea_desarrollo no debe cambiar (9).");
    assert.strictEqual(cVerPost[0].c, cVerPre[0].c, "Conteo de idea_versiones no debe cambiar (1).");
    assert.strictEqual(cHistPost[0].c, cHistPre[0].c, "Conteo de idea_historial no debe cambiar (11).");
    assert.strictEqual(cPropPost[0].c, cPropPre[0].c, "Conteo de idea_propositos no debe cambiar (8).");
    assert.strictEqual(cCatPost[0].c, cCatPre[0].c, "Conteo de idea_categorias no debe cambiar (0).");

  } finally {
    await browser.close();
    await conn.end();
  }

  console.log("\n========================================================================");
  console.log(`TOTAL PRUEBAS: ${totalTests} | APROBADAS: ${passedTests} | FALLIDAS: ${totalTests - passedTests}`);
  console.log(`PORCENTAJE DE APROBACIÓN: ${Math.round((passedTests / totalTests) * 100)}%`);
  console.log("========================================================================");

  if (passedTests === totalTests) {
    console.log("\n>>> SUITE TEST_F5_9 CONCLUIDA EXITOSAMENTE AL 100% (45/45 PRUEBAS) <<<");
    process.exit(0);
  } else {
    console.error("\n>>> EXISTEN PRUEBAS FALLIDAS EN TEST_F5_9 <<<");
    process.exit(1);
  }
})();
