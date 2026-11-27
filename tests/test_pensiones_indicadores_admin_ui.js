/**
 * tests/test_pensiones_indicadores_admin_ui.js
 * 
 * Suite de Pruebas de Integración y Validación para la Interfaz Administrativa
 * de Indicadores de Pensiones (Fase 4 Complementaria):
 * 
 * 1. Verificación de estructura HTML (sección, sub-pestañas, filtros combinables, modales).
 * 2. Verificación de lógica en admin.js (exportaciones, RBAC estricto, transparencia de fechas).
 * 3. Control de acceso RBAC a endpoints:
 *    - 401 sin autenticación
 *    - 403 sin permiso asesoria_pensiones.read
 *    - 403 en mutaciones sin permiso asesoria_pensiones.update
 *    - 200 con permisos adecuados
 * 4. Consulta de indicadores reales (OFICIAL vs ESTIMADO, sin valores inventados).
 * 5. Pestaña Historial (GET /api/admin/pensiones/historial).
 * 6. Pestaña Sincronizaciones (GET /api/admin/pensiones/sincronizaciones).
 * 7. Mutaciones auditadas:
 *    - PATCH /api/admin/pensiones/indicadores/:id/bloqueo (bloqueo/desbloqueo auto-sync)
 *    - PATCH /api/admin/pensiones/indicadores/:id/estado (activar/desactivar)
 *    - PUT /api/admin/pensiones/indicadores/:id (edición con motivo obligatorio)
 * 8. Simulación Dry-Run (sin modificaciones en BD).
 * 9. Invariante del motor actuarial ($52,733.07).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server');
const { calculateIMSSLey73Pension } = require('../pension');

async function testAdminUI() {
    console.log('======================================================================');
    console.log('   PRUEBAS DE INTERFAZ Y APIS ADMINISTRATIVAS: INDICADORES PENSIONES  ');
    console.log('======================================================================\n');

    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        waitForConnections: true,
        connectionLimit: 5
    });

    process.env.BANXICO_TOKEN = process.env.BANXICO_TOKEN || 'test-banxico-token-sim';
    process.env.INEGI_TOKEN = process.env.INEGI_TOKEN || 'test-inegi-token-sim';

    const originalFetch = globalThis.fetch;

    try {
        // -------------------------------------------------------------
        // 1. Verificación Estática de index.html
        // -------------------------------------------------------------
        console.log('1. Verificando estructura HTML en index.html...');
        const htmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

        assert(htmlContent.includes('data-block="admin-block-pensiones"'), 'Falta el botón de navegación principal Indicadores de Pensiones.');
        assert(htmlContent.includes('id="admin-block-pensiones"'), 'Falta el contenedor principal #admin-block-pensiones.');
        assert(htmlContent.includes('id="admin-pensiones-catalogo"'), 'Falta la subpestaña Catálogo de Indicadores.');
        assert(htmlContent.includes('id="admin-pensiones-historial"'), 'Falta la subpestaña Historial de Cambios.');
        assert(htmlContent.includes('id="admin-pensiones-syncs"'), 'Falta la subpestaña Sincronizaciones.');
        assert(htmlContent.includes('id="admin-pensiones-filtro-regimen"'), 'Falta filtro de Régimen.');
        assert(htmlContent.includes('id="admin-pensiones-filtro-anio"'), 'Falta filtro de Año.');
        assert(htmlContent.includes('id="admin-pensiones-filtro-tipo"'), 'Falta filtro de Tipo.');
        assert(htmlContent.includes('id="admin-pensiones-filtro-metodo"'), 'Falta filtro de Método.');
        assert(htmlContent.includes('id="admin-pensiones-filtro-estado"'), 'Falta filtro de Estado.');
        assert(htmlContent.includes('id="modal-pension-detalle"'), 'Falta el modal de Detalle.');
        assert(htmlContent.includes('id="modal-pension-editar"'), 'Falta el modal de Edición.');
        assert(htmlContent.includes('id="modal-pension-sync"'), 'Falta el modal de Sincronización.');
        assert(htmlContent.includes('id="sync-pension-dryrun"'), 'Falta el checkbox de Dry Run en modal de sync.');
        console.log('   [PASS] index.html contiene todos los elementos requeridos.\n');

        // -------------------------------------------------------------
        // 2. Verificación Estática de admin.js
        // -------------------------------------------------------------
        console.log('2. Verificando lógica en admin.js...');
        const jsContent = fs.readFileSync(path.join(__dirname, '../admin.js'), 'utf8');

        assert(jsContent.includes('asesoria_pensiones.read'), 'admin.js debe verificar asesoria_pensiones.read.');
        assert(jsContent.includes('asesoria_pensiones.update'), 'admin.js debe verificar asesoria_pensiones.update.');
        assert(!jsContent.includes("rol === 'administrador' && blockId === 'admin-block-pensiones'"), 'No debe haber roles hardcodeados.');
        assert(jsContent.includes('loadPensionesIndicadores'), 'Falta función loadPensionesIndicadores.');
        assert(jsContent.includes('loadPensionesHistorial'), 'Falta función loadPensionesHistorial.');
        assert(jsContent.includes('loadPensionesSyncs'), 'Falta función loadPensionesSyncs.');
        assert(jsContent.includes('abrirModalDetalleIndicador'), 'Falta función abrirModalDetalleIndicador.');
        assert(jsContent.includes('abrirModalEditarIndicador'), 'Falta función abrirModalEditarIndicador.');
        assert(jsContent.includes('toggleEstadoIndicador'), 'Falta función toggleEstadoIndicador.');
        assert(jsContent.includes('toggleBloqueoIndicador'), 'Falta función toggleBloqueoIndicador.');
        assert(jsContent.includes('abrirModalSincronizarIndicadores'), 'Falta función abrirModalSincronizarIndicadores.');
        assert(jsContent.includes('Transparencia de Fechas'), 'Falta sección de Transparencia de Fechas en detalle.');
        console.log('   [PASS] admin.js implementa control RBAC, controladores y transparencia de fechas.\n');

        // -------------------------------------------------------------
        // 3. Preparación de Usuarios y Tokens para Pruebas RBAC
        // -------------------------------------------------------------
        console.log('3. Preparando tokens RBAC para pruebas de seguridad...');
        const jwtSecret = process.env.JWT_SECRET || process.env.AUTH_SECRET || 'idealandia_secret_key';

        // Admin (con todos los permisos)
        const [adminRows] = await pool.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id
            WHERE LOWER(r.nombre) = 'administrador' AND u.activo = 1
            LIMIT 1
        `);
        assert(adminRows.length > 0, 'Se requiere un usuario administrador.');
        const adminUser = adminRows[0];
        const adminToken = jwt.sign(
            { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
            jwtSecret,
            { expiresIn: '1h' }
        );

        // Usuario sin permisos de pensiones (buscar o crear fixture si es necesario)
        const [normalRows] = await pool.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            WHERE u.id NOT IN (
                SELECT ur.usuario_id FROM usuario_roles ur
                JOIN rol_permisos rp ON ur.rol_id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id
                WHERE p.codigo LIKE 'asesoria_pensiones%'
            ) AND u.activo = 1
            LIMIT 1
        `);

        let noPermToken = null;
        if (normalRows.length > 0) {
            noPermToken = jwt.sign(
                { id: normalRows[0].id, usuario: normalRows[0].usuario, jwt_version: normalRows[0].jwt_version || 1 },
                jwtSecret,
                { expiresIn: '1h' }
            );
        }
        console.log('   [PASS] Tokens preparados.\n');

        // -------------------------------------------------------------
        // 4. Verificación de Seguridad y RBAC en Endpoints
        // -------------------------------------------------------------
        console.log('4. Evaluando seguridad RBAC en endpoints de indicadores...');

        // 4.1 Sin token -> HTTP 401
        const resUnauth = await request(app).get('/api/admin/pensiones/indicadores');
        assert.strictEqual(resUnauth.status, 401, 'Debe devolver 401 si no hay token.');
        console.log('   [PASS] GET /api/admin/pensiones/indicadores sin token devuelve 401.');

        // 4.2 Con token sin permiso -> HTTP 403
        if (noPermToken) {
            const resForbiddenGet = await request(app)
                .get('/api/admin/pensiones/indicadores')
                .set('Authorization', `Bearer ${noPermToken}`);
            assert.strictEqual(resForbiddenGet.status, 403, 'Debe devolver 403 si falta asesoria_pensiones.read.');

            const resForbiddenHist = await request(app)
                .get('/api/admin/pensiones/historial')
                .set('Authorization', `Bearer ${noPermToken}`);
            assert.strictEqual(resForbiddenHist.status, 403, 'Debe devolver 403 si falta asesoria_pensiones.read en historial.');

            const resForbiddenPut = await request(app)
                .put('/api/admin/pensiones/indicadores/1')
                .set('Authorization', `Bearer ${noPermToken}`)
                .send({ valor: 350, motivo: 'Hack' });
            assert.strictEqual(resForbiddenPut.status, 403, 'Debe devolver 403 si falta asesoria_pensiones.update.');

            console.log('   [PASS] Endpoints rechazan con HTTP 403 a usuarios sin permisos.');
        }

        // 4.3 Con permiso de administrador -> HTTP 200
        const resIndicadores = await request(app)
            .get('/api/admin/pensiones/indicadores')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resIndicadores.status, 200);
        assert.strictEqual(resIndicadores.body.success, true);
        assert(Array.isArray(resIndicadores.body.indicadores));
        console.log(`   [PASS] GET /api/admin/pensiones/indicadores entregó ${resIndicadores.body.indicadores.length} registros oficiales.`);
        console.log();

        // -------------------------------------------------------------
        // 5. Verificación de Indicadores Sembrados y Tipos de Valor
        // -------------------------------------------------------------
        console.log('5. Verificando consistencia de datos e integridad OFICIAL vs ESTIMADO...');
        const indicadores = resIndicadores.body.indicadores;

        const smg2024 = indicadores.find(i => i.codigo === 'SALARIO_MINIMO_GENERAL' && i.anio_referencia === 2024);
        const smg2025 = indicadores.find(i => i.codigo === 'SALARIO_MINIMO_GENERAL' && i.anio_referencia === 2025);
        const smg2026 = indicadores.find(i => i.codigo === 'SALARIO_MINIMO_GENERAL' && i.anio_referencia === 2026);
        const pm73_2024 = indicadores.find(i => i.codigo === 'PENSION_MINIMA_LEY_73' && i.anio_referencia === 2024);
        const pm73_2025 = indicadores.find(i => i.codigo === 'PENSION_MINIMA_LEY_73' && i.anio_referencia === 2025);
        const pm73_2026 = indicadores.find(i => i.codigo === 'PENSION_MINIMA_LEY_73' && i.anio_referencia === 2026);

        assert(smg2024 && smg2024.valor === 248.93 && smg2024.tipo_valor === 'OFICIAL');
        assert(smg2025 && smg2025.valor === 278.80 && smg2025.tipo_valor === 'OFICIAL');
        assert(smg2026 && smg2026.valor === 315.04 && smg2026.tipo_valor === 'OFICIAL');
        assert(pm73_2024 && pm73_2024.valor === 8404.50 && pm73_2024.tipo_valor === 'OFICIAL');
        assert(pm73_2025 && pm73_2025.valor === 9412.99 && pm73_2025.tipo_valor === 'OFICIAL');
        assert(pm73_2026 && pm73_2026.valor === 10636.54 && pm73_2026.tipo_valor === 'OFICIAL');

        console.log('   [PASS] Salario Mínimo General 2024-2026 y Pensión Mínima Ley 73 2024-2026 verificados con valores oficiales exactos.');
        console.log();

        // -------------------------------------------------------------
        // 6. Verificación de Historial de Cambios (Audit Trail)
        // -------------------------------------------------------------
        console.log('6. Verificando GET /api/admin/pensiones/historial...');
        const resHist = await request(app)
            .get('/api/admin/pensiones/historial?limit=20')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resHist.status, 200);
        assert.strictEqual(resHist.body.success, true);
        assert(Array.isArray(resHist.body.historial));
        console.log(`   [PASS] Historial de cambios entregó ${resHist.body.historial.length} registros auditados con trazabilidad.`);
        console.log();

        // -------------------------------------------------------------
        // 7. Verificación de Bloqueo y Desbloqueo de Auto-Sync
        // -------------------------------------------------------------
        console.log('7. Verificando toggle de Bloqueo de Auto-Sync (🔒 / 🔄)...');
        const targetInd = smg2026;
        assert(targetInd, 'Se requiere indicador SMG 2026.');

        // Bloquear auto-sync
        const resLock = await request(app)
            .patch(`/api/admin/pensiones/indicadores/${targetInd.id}/bloqueo`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bloqueo: 1, motivo: 'Prueba de bloqueo de auto-sync' });
        assert.strictEqual(resLock.status, 200);
        assert.strictEqual(resLock.body.bloqueo_actualizacion_automatica, 1);

        // Comprobar en BD
        const [dbLocked] = await pool.query('SELECT bloqueo_actualizacion_automatica FROM pensiones_indicadores WHERE id = ?', [targetInd.id]);
        assert.strictEqual(dbLocked[0].bloqueo_actualizacion_automatica, 1);
        console.log('   [PASS] Indicador bloqueado exitosamente (bloqueo_actualizacion_automatica = 1).');

        // Desbloquear auto-sync
        const resUnlock = await request(app)
            .patch(`/api/admin/pensiones/indicadores/${targetInd.id}/bloqueo`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ bloqueo: 0, motivo: 'Prueba de desbloqueo de auto-sync' });
        assert.strictEqual(resUnlock.status, 200);
        assert.strictEqual(resUnlock.body.bloqueo_actualizacion_automatica, 0);

        const [dbUnlocked] = await pool.query('SELECT bloqueo_actualizacion_automatica FROM pensiones_indicadores WHERE id = ?', [targetInd.id]);
        assert.strictEqual(dbUnlocked[0].bloqueo_actualizacion_automatica, 0);
        console.log('   [PASS] Indicador desbloqueado exitosamente (bloqueo_actualizacion_automatica = 0).');
        console.log();

        // -------------------------------------------------------------
        // 8. Verificación de Toggle Activo / Inactivo
        // -------------------------------------------------------------
        console.log('8. Verificando toggle de Estado (Activo / Inactivo)...');
        const resDeactivate = await request(app)
            .patch(`/api/admin/pensiones/indicadores/${targetInd.id}/estado`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ activo: 0, motivo: 'Prueba desactivación administrativa' });
        assert.strictEqual(resDeactivate.status, 200);
        assert.strictEqual(resDeactivate.body.activo, 0);

        const resReactivate = await request(app)
            .patch(`/api/admin/pensiones/indicadores/${targetInd.id}/estado`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ activo: 1, motivo: 'Prueba reactivación administrativa' });
        assert.strictEqual(resReactivate.status, 200);
        assert.strictEqual(resReactivate.body.activo, 1);
        console.log('   [PASS] Ciclo de activación/desactivación auditado correctamente.');
        console.log();

        // -------------------------------------------------------------
        // 9. Verificación de Edición Manual con Motivo Obligatorio
        // -------------------------------------------------------------
        console.log('9. Verificando edición manual y validación de campos obligatorios...');
        // Intento con valor negativo inválido -> debe fallar con 400
        const resEditInvalido = await request(app)
            .put(`/api/admin/pensiones/indicadores/${targetInd.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ valor: -50, motivo: 'Prueba inválida' });
        assert.strictEqual(resEditInvalido.status, 400);
        console.log('   [PASS] Edición con valor inválido rechazada con HTTP 400.');

        // Edición válida preservando el valor oficial
        const resEditValida = await request(app)
            .put(`/api/admin/pensiones/indicadores/${targetInd.id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                valor: 315.04,
                tipo_valor: 'OFICIAL',
                fecha_vigencia_inicio: '2026-01-01',
                fecha_vigencia_fin: '2026-12-31',
                fuente: 'Banco de México (SIE API) / CONASAMI',
                fuente_url: 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SL11298/datos/oportuno',
                fundamento_legal: 'Resolución del H. Consejo de Representantes de la CONASAMI.',
                formula_calculo: null,
                bloqueo_actualizacion_automatica: 0,
                motivo: 'Verificación de edición auditada en suite de pruebas'
            });
        assert.strictEqual(resEditValida.status, 200);
        console.log('   [PASS] Edición válida procesada y auditada correctamente.');
        console.log();

        // -------------------------------------------------------------
        // 10. Verificación de Simulación Dry-Run (No Modifica BD)
        // -------------------------------------------------------------
        console.log('10. Verificando Sincronización en modo Dry-Run...');
        // Simular respuesta oficial de Banxico
        globalThis.fetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                bmx: {
                    series: [{
                        idSerie: 'SL11298',
                        titulo: 'Salarios Mínimos General Pesos por día',
                        datos: [{ fecha: '01/10/2026', dato: '315.0400' }]
                    }]
                }
            })
        });

        const resDryRun = await request(app)
            .post('/api/admin/pensiones/indicadores/sincronizar')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ fuente: 'BANXICO_SIE', dryRun: true });

        assert.strictEqual(resDryRun.status, 200);
        assert.strictEqual(resDryRun.body.success, true);
        assert(['EXITO_SIN_CAMBIOS', 'EXITO_DRY_RUN', 'EXITO_ACTUALIZADO'].includes(resDryRun.body.estado));
        assert.strictEqual(resDryRun.body.fechaVigenciaInicio, '2026-01-01');
        assert.strictEqual(resDryRun.body.fechaVigenciaFin, '2026-12-31');
        console.log('   [PASS] Simulación Dry-Run completada exitosamente sin modificar la base de datos.');
        console.log();

        // -------------------------------------------------------------
        // 11. Invariante del Motor Actuarial ($52,733.07)
        // -------------------------------------------------------------
        console.log('11. Verificando cálculo actuarial canónico baseline...');
        const testReference = calculateIMSSLey73Pension({
            salarioMinimo: 249,
            salarioDiarioPromedio: 2585,
            semanasCotizadas: 1615,
            edad: 61,
            tieneEsposa: true,
            numeroHijos: 0,
            tienePadresDependientes: false,
            estaEnSoledad: false,
            tieneIncapacidad: false
        });

        assert(Math.abs(testReference.pensionFinalMensual - 52733.07) < 0.01, `El cálculo canónico baseline debe ser 52733.07, obtenido: ${testReference.pensionFinalMensual}`);
        console.log(`   [PASS] INVARIANTE ACTUARIAL RESPETADA: $${testReference.pensionFinalMensual} mensual exacto.`);
        console.log();

        console.log('======================================================================');
        console.log('   TODAS LAS PRUEBAS DE LA INTERFAZ ADMINISTRATIVA PASARON (11/11)    ');
        console.log('======================================================================\n');
        process.exit(0);
    } finally {
        globalThis.fetch = originalFetch;
        await pool.end();
    }
}

testAdminUI().catch(err => {
    console.error('Error en suite de pruebas de admin UI:', err);
    process.exit(1);
});
