const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const request = require('supertest');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('./server.js');

(async () => {
  console.log("================================================================================");
  console.log("SUITE DE VERIFICACIÓN DE CORRECCIONES EN PR #108");
  console.log("1. Confirmación de ciclo de vida con modal propio (cero window.confirm)");
  console.log("2. Endpoint /api/chat responde 200 OK con streaming real (cero HTTP 500)");
  console.log("================================================================================\n");

  const secret = process.env.AUTH_SECRET;
  const PORT = process.env.PORT || 3000;
  const tokenUser2 = jwt.sign({ id: 2, usuario: 'Efrain', jwt_version: 1 }, secret, { expiresIn: '1h' });

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'idealandia_dev'
  });

  // Asegurar estado inicial de Idea 3
  await conn.query('UPDATE ideas SET estado = "en_desarrollo" WHERE id = 3');
  await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "cambio_estado" AND descripcion LIKE "%en_validacion%"');

  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Verificar que /api/chat responde 200 OK y no genera HTTP 500
    // -------------------------------------------------------------------------
    console.log("--- TEST 1: Verificación de /api/chat (Backend Gemini Streaming) ---");
    const chatResponse = await request(app)
      .post('/api/chat')
      .set('Cookie', [`auth_token=${tokenUser2}`])
      .send({ message: 'Hola Idealita, confírmame que estás en línea con una frase breve.' });

    assert.strictEqual(chatResponse.status, 200, "El endpoint /api/chat debe responder HTTP 200 OK");
    assert.strictEqual(chatResponse.headers['content-type'], 'text/plain; charset=utf-8', "Debe responder con text/plain streaming");
    assert.ok(chatResponse.text && chatResponse.text.length > 5, "La respuesta debe contener texto generado por Idealita");
    console.log("  [PASS] /api/chat responde 200 OK con streaming real exitoso.");
    console.log("         Respuesta recibida:", chatResponse.text.trim().slice(0, 100), "...\n");

    // -------------------------------------------------------------------------
    // TEST 2: Flujo interactivo en frontend con modal propio de Idealandia
    // -------------------------------------------------------------------------
    console.log("--- TEST 2: Verificación del Modal Propio de Idealandia (Frontend) ---");
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await context.addCookies([
      { name: 'auth_token', value: tokenUser2, domain: 'localhost', path: '/' }
    ]);
    const page = await context.newPage();

    let nativeConfirmTriggered = false;
    page.on('dialog', dialog => {
      if (dialog.type() === 'confirm') {
        nativeConfirmTriggered = true;
      }
    });

    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);

    // Abrir Workspace de Idea 3
    await page.evaluate(async () => {
      await window.openIdeaWorkspace(3);
    });

    // 2.1 Intentar transición y Cancelar
    console.log("  2.1 Probando cancelación en modal propio...");
    await page.evaluate(() => {
      setTimeout(() => window.solicitarCambioEstado('en_validacion'), 0);
    });

    await page.waitForSelector('#custom-modal.active', { timeout: 3000 });
    const modalText = await page.$eval('#custom-modal-message', el => el.textContent.trim());
    assert.ok(modalText.includes('Venta de servicios de orientación') || modalText.includes('¿Deseas cambiar la Idea'), "El modal debe contener el mensaje oficial");

    // Clic en Cancelar
    await page.click('#custom-modal-buttons button:first-child');
    await page.waitForTimeout(200);

    const estadoTrasCancelar = await page.evaluate(() => window.currentWorkspaceIdea.idea.estado);
    assert.strictEqual(nativeConfirmTriggered, false, "NUNCA debe dispararse window.confirm (sin diálogo nativo)");
    assert.strictEqual(estadoTrasCancelar, 'en_desarrollo', "Cancelar no debe cambiar el estado");
    console.log("  [PASS] Cancelar en modal propio mantiene el estado en 'en_desarrollo' y cero llamadas a window.confirm.");

    // 2.2 Intentar transición y Confirmar
    console.log("  2.2 Probando confirmación en modal propio...");
    await page.evaluate(() => {
      setTimeout(() => window.solicitarCambioEstado('en_validacion'), 0);
    });

    await page.waitForSelector('#custom-modal.active', { timeout: 3000 });
    // Clic en Confirmar
    await page.click('#custom-modal-buttons button:last-child');
    await page.waitForTimeout(600);

    const estadoTrasConfirmar = await page.evaluate(() => window.currentWorkspaceIdea.idea.estado);
    assert.strictEqual(nativeConfirmTriggered, false, "NUNCA debe dispararse window.confirm");
    assert.strictEqual(estadoTrasConfirmar, 'en_validacion', "Confirmar debe ejecutar la transición a 'en_validacion'");

    const [dbIdea3] = await conn.query('SELECT estado FROM ideas WHERE id = 3');
    assert.strictEqual(dbIdea3[0].estado, 'en_validacion', "En base de datos el estado debe ser 'en_validacion'");
    console.log("  [PASS] Confirmar en modal propio ejecuta la transición y actualiza estado a 'en_validacion'.\n");

    // -------------------------------------------------------------------------
    // TEST 3: Interacción directa de Idealita en Workspace sin error 500
    // -------------------------------------------------------------------------
    console.log("--- TEST 3: Idealita contextual en Workspace conversa sin errores ---");
    await page.evaluate(async () => {
      const sec = document.getElementById('ideas');
      if (sec) sec.style.display = 'flex';
      await window.openIdeaWorkspace(3);
      window.switchWorkspaceTab('idealita');
    });
    await page.waitForTimeout(400);

    // Enviar pregunta
    await page.fill('#idealita-context-input', 'Hola Idealita, cuéntame sobre el estado de esta idea');
    await page.evaluate(() => {
      if (typeof window.sendIdealitaContextMessage === 'function') {
        window.sendIdealitaContextMessage();
      }
    });

    // Esperar respuesta de Idealita
    await page.waitForFunction(() => {
      const bubbles = document.querySelectorAll('#idealita-context-history .idealita-msg-bubble.idealita-bubble');
      if (bubbles.length < 2) return false;
      const last = bubbles[bubbles.length - 1];
      return !last.textContent.includes('Escribiendo') && last.textContent.trim().length > 20;
    }, { timeout: 35000 });

    const errorVisible = await page.$eval('#idealita-context-error', el => el.style.display !== 'none');
    assert.strictEqual(errorVisible, false, "No debe mostrarse mensaje de error en la pestaña de Idealita");

    const bubblesText = await page.$$eval('#idealita-context-history .idealita-msg-bubble.idealita-bubble', els => els.map(e => e.textContent));
    assert.ok(bubblesText.length > 1, "Debe existir al menos una respuesta de Idealita además de la bienvenida");
    console.log("  [PASS] Idealita del Workspace respondió satisfactoriamente sin error 500 ni timeouts.");
    console.log("         Contenido de respuesta:", bubblesText[bubblesText.length - 1].trim().slice(0, 140), "...\n");

    // Limpieza de prueba
    await conn.query('UPDATE ideas SET estado = "en_desarrollo" WHERE id = 3');
    await conn.query('DELETE FROM idea_historial WHERE idea_id = 3 AND tipo_evento = "cambio_estado" AND descripcion LIKE "%en_validacion%"');

    await context.close();

    console.log("================================================================================");
    console.log("TODAS LAS VERIFICACIONES DE CORRECCIÓN EN PR #108 PASARON EXITOSAMENTE (100%)");
    console.log("================================================================================\n");

  } catch (err) {
    console.error("❌ ERROR EN TEST_FIXES_PR108:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await conn.end();
  }
})();
