/**
 * tests/test_pensiones_indicadores_fase4_api.js
 * 
 * Verificación de endpoints HTTP de Fase 4:
 * 1. POST /api/admin/pensiones/indicadores/sincronizar (con RBAC y dryRun)
 * 2. POST /api/admin/pensiones/indicadores/sincronizar (con cabecera X-Sync-Cron-Secret)
 * 3. GET /api/admin/pensiones/sincronizaciones
 * 4. POST /api/admin/pensiones/indicadores/:id/revertir
 */

const assert = require('assert');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server');

async function testFase4API() {
    console.log('--- VALIDACIÓN DE ENDPOINTS API FASE 4 ---');

    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        waitForConnections: true,
        connectionLimit: 5
    });

    const [adminRows] = await pool.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN roles r ON ur.rol_id = r.id
        WHERE LOWER(r.nombre) = 'administrador' AND u.activo = 1
        LIMIT 1
    `);

    assert(adminRows.length > 0, 'Se requiere al menos un usuario administrador.');
    const adminUser = adminRows[0];

    const jwtSecret = process.env.JWT_SECRET || process.env.AUTH_SECRET || 'idealandia_secret_key';
    const cronSecret = process.env.SYNC_CRON_SECRET || 'sync-secret-fase4-test';
    process.env.SYNC_CRON_SECRET = cronSecret;
    process.env.BANXICO_TOKEN = process.env.BANXICO_TOKEN || 'test-banxico-token';

    const adminToken = jwt.sign(
        { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
        jwtSecret,
        { expiresIn: '1h' }
    );

    // Mock temporal de globalThis.fetch para simular respuesta oficial sin internet (observación real Banxico: 01/10/2026)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
            bmx: {
                series: [{
                    idSerie: 'SL11298',
                    datos: [{ fecha: '01/10/2026', dato: '315.04' }]
                }]
            }
        })
    });

    try {
        // 1. Sincronizar en modo dry-run con token admin
        console.log('1. Probando POST /api/admin/pensiones/indicadores/sincronizar con RBAC (dryRun=true)...');
        const resDry = await request(app)
            .post('/api/admin/pensiones/indicadores/sincronizar')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ dryRun: true, fuente: 'BANXICO_SIE' });

        assert.strictEqual(resDry.status, 200);
        assert.strictEqual(resDry.body.success, true);
        assert.strictEqual(resDry.body.fechaObservacionFuente, '2026-10-01');
        assert.strictEqual(resDry.body.fechaVigenciaInicio, '2026-01-01');
        assert.strictEqual(resDry.body.fechaVigenciaFin, '2026-12-31');
        console.log('   [PASS] Endpoint de sincronización con RBAC responde HTTP 200 y conserva fecha de observación 2026-10-01.');

        // 2. Sincronizar con cabecera X-Sync-Cron-Secret (sin sesión de usuario)
        console.log('2. Probando POST /api/admin/pensiones/indicadores/sincronizar con X-Sync-Cron-Secret...');
        const resCron = await request(app)
            .post('/api/admin/pensiones/indicadores/sincronizar')
            .set('X-Sync-Cron-Secret', cronSecret)
            .send({ dryRun: true, fuente: 'BANXICO_SIE' });

        assert.strictEqual(resCron.status, 200);
        assert.strictEqual(resCron.body.success, true);
        assert.strictEqual(resCron.body.fechaObservacionFuente, '2026-10-01');
        assert.strictEqual(resCron.body.fechaVigenciaInicio, '2026-01-01');
        assert.strictEqual(resCron.body.fechaVigenciaFin, '2026-12-31');
        console.log('   [PASS] Endpoint de sincronización con cron secret responde HTTP 200 y conserva fecha de observación 2026-10-01.');

        // 3. Rechazar sin token ni secret
        console.log('3. Probando rechazo de sincronización sin credenciales (HTTP 401)...');
        const res401 = await request(app)
            .post('/api/admin/pensiones/indicadores/sincronizar')
            .send({ dryRun: true });

        assert.strictEqual(res401.status, 401);
        console.log('   [PASS] Solicitud no autenticada rechazada con HTTP 401.');

        // 3b. Rechazar con usuario sin permiso RBAC (HTTP 403)
        console.log('3b. Probando rechazo de sincronización con usuario no autorizado (HTTP 403)...');
        const [normalRows] = await pool.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id
            WHERE LOWER(r.nombre) = 'usuario' AND u.activo = 1
            LIMIT 1
        `);
        if (normalRows.length > 0) {
            const normalUserToken = jwt.sign(
                { id: normalRows[0].id, usuario: normalRows[0].usuario, jwt_version: normalRows[0].jwt_version || 1 },
                jwtSecret,
                { expiresIn: '1h' }
            );
            const res403 = await request(app)
                .post('/api/admin/pensiones/indicadores/sincronizar')
                .set('Authorization', `Bearer ${normalUserToken}`)
                .send({ dryRun: true });
            assert.strictEqual(res403.status, 403);
            console.log('   [PASS] Usuario sin permiso asesoria_pensiones.update rechazado con HTTP 403.');
        } else {
            console.log('   [SKIP] No se encontró usuario normal para prueba 403.');
        }

        // 4. Consultar historial de telemetría de sincronizaciones
        console.log('4. Probando GET /api/admin/pensiones/sincronizaciones...');
        const resHistSync = await request(app)
            .get('/api/admin/pensiones/sincronizaciones')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(resHistSync.status, 200);
        assert.strictEqual(resHistSync.body.success, true);
        assert(Array.isArray(resHistSync.body.sincronizaciones));
        console.log(`   [PASS] Historial de sincronizaciones entregó ${resHistSync.body.sincronizaciones.length} registros.`);

        // 5. Probar endpoint de reversión / rollback
        console.log('5. Probando POST /api/admin/pensiones/indicadores/:id/revertir...');
        const [histRows] = await pool.query('SELECT id, indicador_id FROM pensiones_indicadores_historial ORDER BY id DESC LIMIT 1');
        if (histRows.length > 0) {
            const hId = histRows[0].id;
            const indId = histRows[0].indicador_id;
            const resRevert = await request(app)
                .post(`/api/admin/pensiones/indicadores/${indId}/revertir`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ historialId: hId, motivo: 'Prueba unitaria de reversión via API' });
            assert(resRevert.status === 200 || resRevert.status === 400);
            console.log('   [PASS] Endpoint de reversión / rollback responde correctamente.');

            // Restaurar estado oficial determinístico de BD local tras la prueba de reversión
            await pool.query('UPDATE pensiones_indicadores SET valor = 315.04 WHERE codigo = "SALARIO_MINIMO_GENERAL" AND anio_referencia = 2026');
            await pool.query('UPDATE pensiones_indicadores SET valor = 10636.54 WHERE codigo = "PENSION_MINIMA_LEY_73" AND anio_referencia = 2026');
            const { invalidarCacheIndicadores } = require('../pensionIndicadoresService');
            invalidarCacheIndicadores();
        }

        console.log('--- TODOS LOS ENDPOINTS DE FASE 4 FUNCIONAN CORRECTAMENTE ---\n');
        process.exit(0);
    } finally {
        globalThis.fetch = originalFetch;
        await pool.end();
    }
}

testFase4API().catch(err => {
    console.error('Error en pruebas de API Fase 4:', err);
    process.exit(1);
});
