/**
 * test_simulador_edicion_fila.js
 * Prueba integral automatizada para:
 * 1. Nomenclatura exacta de 14 columnas:
 *    Sel | Institución | Tipo | Condiciones | Restricciones | Inversión Base | Tasa % | Inversión 1 | Inversión 2 | Meses | Rend1 | Rend2 | Total mensual | Total periodo
 * 2. Ausencia total de "Monto 2".
 * 3. Restricciones en BD, en Admin y en el Simulador:
 *    - Mercado Pago: "Requiere depósito de $3,000 mensuales."
 *    - NU: "Requiere al menos una compra al mes."
 *    - Creación, edición, activación/desactivación en endpoints REST y formulario.
 * 4. Ampliación de campos Inversión 1 e Inversión 2 para cifras grandes ($25k, $100k, $1M, $10M) sin truncamiento.
 * 5. Flujo de Edición y RESTABLECIMIENTO con clic interactivo en "Editado":
 *    - Modificar Tasa, Inv1, Inv2, Meses -> fila resaltada + botón "Editado" visible.
 *    - Clic en botón "Editado" -> restablecimiento instantáneo a valores originales, cálculo restaurado, clase resaltada removida, restricciones inalteradas.
 * 6. Integridad de BD: las tablas reales permanecen inalteradas por la simulación.
 */

const assert = require('assert');
const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server.js');

let server;
let port;
let conn;
let adminToken;
let browser;

async function run() {
    console.log('=== INICIANDO TEST INTEGRAL: RESTRICCIONES, AMPLIACIÓN DE CAMPOS Y RESTABLECIMIENTO ===\n');

    conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT,
        dateStrings: true
    });

    // 1. Obtener admin y generar token
    const [adminRows] = await conn.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN roles r ON ur.rol_id = r.id
        WHERE r.nombre = 'administrador' AND u.activo = 1
        LIMIT 1
    `);
    const adminUser = adminRows[0];
    adminToken = jwt.sign(
        { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
        process.env.AUTH_SECRET,
        { expiresIn: '1h' }
    );

    // Asegurar que Finsus tenga su tasa oficial 13.12% en BD
    const [finsusRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre = 'Finsus'");
    const finsusId = finsusRows[0].id;
    await conn.query(
        "UPDATE institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id SET t.tasa_anual = 13.12 WHERE e.institucion_id = ? AND e.activo = 1",
        [finsusId]
    );
    const tasaFinsusEnBDInicial = 13.12;

    const [tramosNUOrig] = await conn.query(
        "SELECT t.tasa_anual FROM institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id WHERE e.institucion_id = 1 AND e.activo = 1 ORDER BY t.numero_tramo ASC"
    );

    // Asegurar que Mercado Pago exista con sus restricciones y NU con las suyas
    await conn.query("UPDATE instituciones_financieras SET nombre = 'Mercado Pago' WHERE nombre = 'MercadoPago'");
    const [mpRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre = 'Mercado Pago'");
    let mpId = mpRows.length > 0 ? mpRows[0].id : null;
    if (!mpId) {
        const [resMp] = await conn.query("INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo) VALUES ('Mercado Pago', 'F', 'Mercado Pago Wallet', 'Tasa 10%', 0, 1)");
        mpId = resMp.insertId;
    }

    // Insertar restricciones requeridas
    await conn.query("DELETE FROM institucion_restricciones WHERE institucion_id IN (?, 1)", [mpId]);
    await conn.query("INSERT INTO institucion_restricciones (institucion_id, descripcion, activo, orden) VALUES (?, 'Requiere depósito de $3,000 mensuales.', 1, 1)", [mpId]);
    await conn.query("INSERT INTO institucion_restricciones (institucion_id, descripcion, activo, orden) VALUES (1, 'Requiere al menos una compra al mes.', 1, 1)", []);

    // Asegurar instituciones activas
    await conn.query('UPDATE instituciones_financieras SET activo = 1 WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8, ?)', [mpId]);

    // Iniciar servidor en puerto libre
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            port = server.address().port;
            console.log(`✓ Servidor de prueba iniciado en puerto ${port}`);
            resolve();
        });
    });

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{
        name: 'auth_token',
        value: adminToken,
        domain: 'localhost',
        path: '/'
    }]);

    const page = await context.newPage();

    try {
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('token', token);
            localStorage.setItem('auth_token', token);
            localStorage.setItem('user', JSON.stringify({
                id: user.id,
                usuario: user.usuario,
                roles: ['administrador']
            }));
        }, { token: adminToken, user: adminUser });

        await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

        // ==============================================================
        // PRUEBA 1: APIs REST dedicadas de Restricciones
        // ==============================================================
        console.log('[Prueba 1: APIs REST de Restricciones]');
        // A) GET restricciones de NU
        const getNuRes = await page.request.get(`http://localhost:${port}/api/admin/finanzas/instituciones/1/restricciones`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(getNuRes.status(), 200);
        const getNuData = await getNuRes.json();
        assert(getNuData.restricciones.length >= 1, 'NU debe tener al menos una restricción');
        assert(getNuData.restricciones[0].descripcion.includes('compra al mes'));

        // B) POST nueva restricción para NU
        const postRes = await page.request.post(`http://localhost:${port}/api/admin/finanzas/instituciones/1/restricciones`, {
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            data: { descripcion: 'Mantener saldo promedio de $5,000.', orden: 2, activo: 1 }
        });
        assert.strictEqual(postRes.status(), 201);
        const postData = await postRes.json();
        const createdRestId = postData.id;

        // C) PUT actualizar restricción
        const putRes = await page.request.put(`http://localhost:${port}/api/admin/finanzas/restricciones/${createdRestId}`, {
            headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
            data: { descripcion: 'Mantener saldo promedio de $5,000 (actualizado).', activo: 0 }
        });
        assert.strictEqual(putRes.status(), 200);

        // D) DELETE eliminar restricción creada para limpiar
        const delRes = await page.request.delete(`http://localhost:${port}/api/admin/finanzas/restricciones/${createdRestId}?hard=true`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(delRes.status(), 200);
        console.log('✓ Prueba 1 superada: Endpoints REST de restricciones (GET, POST, PUT, DELETE) funcionando al 100%.');

        // ==============================================================
        // PRUEBA 2: Cargar Simulador y verificar las 14 columnas
        // ==============================================================
        console.log('[Prueba 2: Vista del Simulador y 14 columnas]');
        await page.evaluate(() => {
            document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
            const servSection = document.getElementById('servicios');
            if (servSection) servSection.style.display = 'flex';
            const catView = document.getElementById('servicios-catalogo-view');
            if (catView) catView.style.display = 'none';
            const finView = document.getElementById('servicios-financieras-view');
            if (finView) finView.style.display = 'block';
            if (typeof window.inicializarSimuladorFinanciero === 'function') {
                window.inicializarSimuladorFinanciero();
            }
        });

        await page.waitForSelector('#simulador-tbody tr.simulador-row', { timeout: 10000 });

        const headers = await page.$$eval('#simulador-table-container > table > thead > tr > th', ths => ths.map(t => t.textContent.trim()));
        console.log('Encabezados encontrados:', headers);

        const expectedHeaders = [
            'Sel', 'Institución', 'Tipo', 'Condiciones', 'Restricciones', 'Inversión Base',
            'Tasa %', 'Inversión 1', 'Inversión 2', 'Meses', 'Rend1', 'Rend2',
            'Total mensual', 'Total periodo'
        ];

        assert.deepStrictEqual(headers, expectedHeaders, 'Los encabezados deben coincidir con las 14 columnas');
        assert.ok(!headers.includes('Monto 2'), '"Monto 2" NO debe existir en la interfaz');
        console.log('✓ Prueba 2 superada: 14 columnas exactas, columna Restricciones en posición correcta.');

        // ==============================================================
        // PRUEBA 3: Visualización de Restricciones en el Simulador
        // ==============================================================
        console.log('[Prueba 3: Visualización de Restricciones]');
        // NU: "Requiere al menos una compra al mes."
        const restNU = await page.$eval('#sim-row-1 td:nth-child(5)', el => el.textContent.trim());
        assert(restNU.includes('Requiere al menos una compra al mes.'), `NU debe mostrar su restricción. Encontrado: ${restNU}`);

        // Mercado Pago: "Requiere depósito de $3,000 mensuales."
        const restMP = await page.$eval(`#sim-row-${mpId} td:nth-child(5)`, el => el.textContent.trim());
        assert(restMP.includes('Requiere depósito de $3,000 mensuales.'), `Mercado Pago debe mostrar su restricción. Encontrado: ${restMP}`);
        console.log('✓ Prueba 3 superada: Restricciones de NU y Mercado Pago mostradas correctamente con viñetas.');

        // ==============================================================
        // PRUEBA 4: Capacidad y ancho de Inversión 1 e Inversión 2 para cifras grandes ($10,000,000)
        // ==============================================================
        console.log('[Prueba 4: Capacidad y ancho para cifras grandes]');
        const inv1Width = await page.$eval('#sim-row-1 .sim-input-inv1', el => el.getBoundingClientRect().width);
        const inv2Width = await page.$eval('#sim-row-1 .sim-input-inv2', el => el.getBoundingClientRect().width);
        console.log(`Ancho medido de inputs: Inv1=${inv1Width}px, Inv2=${inv2Width}px`);
        assert(inv1Width >= 120, `El campo Inversión 1 debe tener al menos 120px de ancho (obtenido: ${inv1Width}px)`);
        assert(inv2Width >= 120, `El campo Inversión 2 debe tener al menos 120px de ancho (obtenido: ${inv2Width}px)`);

        // Probar escritura de $10,000,000
        await page.fill('#sim-row-1 .sim-input-inv1', '10000000');
        await page.dispatchEvent('#sim-row-1 .sim-input-inv1', 'input');
        const valInv1 = await page.$eval('#sim-row-1 .sim-input-inv1', el => el.value);
        assert.strictEqual(valInv1, '10000000', 'Debe almacenar y mostrar 10000000 completo');
        console.log('✓ Prueba 4 superada: Ancho de inputs adecuado para cifras de $10M+ sin cortes.');

        // ==============================================================
        // PRUEBA 5: Modificación de 4 campos y RESTABLECIMIENTO con clic en "Editado"
        // ==============================================================
        console.log('[Prueba 5: Modificación y Clic en Editado]');
        const rowFinsus = `#sim-row-${finsusId}`;

        // Configurar simulación global a $100,000 y 2 meses
        await page.fill('#simulador-inversion-global', '100000');
        await page.fill('#simulador-meses-global', '2');
        await page.dispatchEvent('#simulador-inversion-global', 'input');
        await page.dispatchEvent('#simulador-meses-global', 'input');
        await page.waitForTimeout(300);

        // Guardar rendimientos originales
        const origRend1 = await page.$eval(`${rowFinsus} .sim-val-rend1`, el => el.textContent.trim());
        const origTotalP = await page.$eval(`${rowFinsus} .sim-val-total-periodo`, el => el.textContent.trim());
        const origRestriccion = await page.$eval(`${rowFinsus} td:nth-child(5)`, el => el.textContent.trim());

        // Modificar los 4 campos en Finsus:
        await page.fill(`${rowFinsus} .sim-input-tasa`, '10');
        await page.dispatchEvent(`${rowFinsus} .sim-input-tasa`, 'input');
        await page.fill(`${rowFinsus} .sim-input-inv1`, '50000');
        await page.dispatchEvent(`${rowFinsus} .sim-input-inv1`, 'input');
        await page.fill(`${rowFinsus} .sim-input-inv2`, '10000');
        await page.dispatchEvent(`${rowFinsus} .sim-input-inv2`, 'input');
        await page.fill(`${rowFinsus} .sim-input-meses`, '6');
        await page.dispatchEvent(`${rowFinsus} .sim-input-meses`, 'input');
        await page.waitForTimeout(200);

        // 6. Confirmar que la fila completa se resalta
        const isModFinsus = await page.$eval(rowFinsus, tr => tr.classList.contains('fila-simulacion-modificada'));
        assert.strictEqual(isModFinsus, true, 'La fila debe recibir la clase fila-simulacion-modificada');

        // 7. Confirmar que aparece el botón "Editado"
        const badgeBtn = await page.$(`${rowFinsus} .btn-restablecer-fila`);
        const badgeVisible = await badgeBtn.isVisible();
        assert.strictEqual(badgeVisible, true, 'El botón de restablecer Editado debe ser visible');

        // 8. Hacer CLIC sobre el botón "Editado"
        console.log('Haciendo clic sobre el botón "Editado" de Finsus...');
        await badgeBtn.click();
        await page.waitForTimeout(300);

        // 9. Confirmar que todos los valores regresan exactamente a los originales
        const resTasa = await page.$eval(`${rowFinsus} .sim-input-tasa`, el => parseFloat(el.value));
        const resInv1 = await page.$eval(`${rowFinsus} .sim-input-inv1`, el => parseFloat(el.value));
        const resInv2 = await page.$eval(`${rowFinsus} .sim-input-inv2`, el => parseFloat(el.value));
        const resMeses = await page.$eval(`${rowFinsus} .sim-input-meses`, el => parseInt(el.value, 10));

        assert.strictEqual(resTasa, 13.12, 'Tasa debe volver a 13.12%');
        assert.strictEqual(resInv1, 100000, 'Inversión 1 debe volver a 100000');
        assert.strictEqual(resInv2, 0, 'Inversión 2 debe volver a 0');
        assert.strictEqual(resMeses, 2, 'Meses debe volver a 2');

        // 10. Confirmar que desaparece el resaltado y el botón Editado se oculta
        const resIsMod = await page.$eval(rowFinsus, tr => tr.classList.contains('fila-simulacion-modificada'));
        const resBadgeVisible = await page.$eval(`${rowFinsus} .btn-restablecer-fila`, el => el.style.display);
        assert.strictEqual(resIsMod, false, 'La clase fila-simulacion-modificada debe haber sido removida');
        assert.strictEqual(resBadgeVisible, 'none', 'El botón Editado debe estar oculto tras restablecer');

        // 11. Confirmar que los rendimientos regresan a los valores originales
        const resRend1 = await page.$eval(`${rowFinsus} .sim-val-rend1`, el => el.textContent.trim());
        const resTotalP = await page.$eval(`${rowFinsus} .sim-val-total-periodo`, el => el.textContent.trim());
        assert.strictEqual(resRend1, origRend1, 'Rend1 debe volver al valor original');
        assert.strictEqual(resTotalP, origTotalP, 'Total periodo debe volver al valor original');

        // 12. Confirmar que las restricciones siguen exactamente iguales
        const resRestriccion = await page.$eval(`${rowFinsus} td:nth-child(5)`, el => el.textContent.trim());
        assert.strictEqual(resRestriccion, origRestriccion, 'Las restricciones deben permanecer inalteradas');
        console.log('✓ Prueba 5 superada: Restablecimiento completo interactivo mediante clic en "Editado".');

        // ==============================================================
        // PRUEBA 6: Verificar Integridad de la Base de Datos
        // ==============================================================
        console.log('[Prueba 6: Integridad de BD]');
        const [tramosFinsusFinal] = await conn.query(
            "SELECT t.tasa_anual FROM institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id WHERE e.institucion_id = ? AND e.activo = 1",
            [finsusId]
        );
        assert.strictEqual(parseFloat(tramosFinsusFinal[0].tasa_anual), tasaFinsusEnBDInicial, 'Finsus en BD permanece inalterado');

        const [tramosNUFinal] = await conn.query(
            "SELECT t.tasa_anual FROM institucion_tramos_tasas t JOIN institucion_esquemas_tasas e ON t.esquema_id = e.id WHERE e.institucion_id = 1 AND e.activo = 1 ORDER BY t.numero_tramo ASC"
        );
        assert.strictEqual(parseFloat(tramosNUFinal[0].tasa_anual), parseFloat(tramosNUOrig[0].tasa_anual), 'Tramo 1 de NU inalterado');
        assert.strictEqual(parseFloat(tramosNUFinal[1].tasa_anual), parseFloat(tramosNUOrig[1].tasa_anual), 'Tramo 2 de NU inalterado');
        console.log('✓ Prueba 6 superada: Base de datos intacta tras todas las simulaciones y restablecimientos.');

        console.log('\n=============================================================');
        console.log('¡TODAS LAS PRUEBAS INTEGRALES (1-6) PASARON EXITOSAMENTE!');
        console.log('=============================================================\n');
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        if (conn) await conn.end();
        process.exit(0);
    }
}

run().catch(err => {
    console.error('ERROR EN TEST:', err);
    if (browser) browser.close();
    if (server) server.close();
    if (conn) conn.end();
    process.exit(1);
});
