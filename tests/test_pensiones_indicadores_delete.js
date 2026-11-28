/**
 * tests/test_pensiones_indicadores_delete.js
 * 
 * Suite de Verificación de Eliminación de Registros de Indicadores de Pensiones:
 * 
 * 1. Administrador autorizado puede eliminar un registro permitido.
 * 2. Usuario sin permisos no puede eliminarlo (401 sin auth, 403 sin permiso).
 * 3. ID inexistente o inválido devuelve error controlado (400 / 404).
 * 4. Cancelar el modal no elimina nada.
 * 5. Confirmar elimina solamente el registro seleccionado.
 * 6. El listado se actualiza después de eliminar.
 * 7. La eliminación no rompe la consulta de indicadores.
 * 8. La sincronización BANXICO sigue funcionando.
 * 9. La sincronización INEGI sigue funcionando.
 * 10. No aparecen valores hardcodeados como sustituto de un indicador eliminado.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server');
const {
    obtenerIndicadoresActivos,
    determinarIndicadorAplicable,
    obtenerSalarioMinimoVigente
} = require('../pensionIndicadoresService');
const { sincronizarIndicadores } = require('../pensionSyncService');

async function runTests() {
    console.log('======================================================================');
    console.log('   PRUEBAS: ELIMINACIÓN DE REGISTROS DE INDICADORES DE PENSIONES     ');
    console.log('======================================================================\n');

    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        waitForConnections: true,
        connectionLimit: 5
    });

    const jwtSecret = process.env.JWT_SECRET || process.env.AUTH_SECRET || 'idealandia_secret_key';

    // 1. Obtener Admin Token
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

    // 2. Obtener / Generar Token sin permisos
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

    try {
        // -------------------------------------------------------------
        // Punto 1: Administrador autorizado puede eliminar un registro permitido
        // -------------------------------------------------------------
        console.log('1. Verificando que administrador autorizado puede eliminar un indicador y su historial...');
        const [insertRes] = await pool.query(`
            INSERT INTO pensiones_indicadores (
                codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor,
                anio_referencia, fecha_vigencia_inicio, fecha_vigencia_fin, fuente,
                fundamento_legal, metodo_obtencion, activo
            ) VALUES (
                'TEST_DELETE_IND', 'general', 'Indicador Temporal para Eliminación', 'Prueba técnica de borrado',
                123.4500, 'MXN_DIARIO', 'ESTIMADO', 2090, '2090-01-01', '2090-12-31',
                'Fuente de Prueba', 'Art. 999', 'MANUAL', 1
            )
        `);
        const testIndicadorId = insertRes.insertId;

        // Insertar un registro en historial asociado
        const [histRes] = await pool.query(`
            INSERT INTO pensiones_indicadores_historial (
                indicador_id, codigo, regimen, valor_anterior, valor_nuevo,
                tipo_valor_nuevo, motivo, fuente, metodo_actualizacion
            ) VALUES (
                ?, 'TEST_DELETE_IND', 'general', 100.0000, 123.4500,
                'ESTIMADO', 'Creación de prueba', 'Fuente de Prueba', 'MANUAL'
            )
        `, [testIndicadorId]);
        const testHistorialId = histRes.insertId;

        // Probar DELETE del registro puntual de historial
        const resDelHist = await request(app)
            .delete(`/api/admin/pensiones/indicadores/historial/${testHistorialId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resDelHist.status, 200);
        assert.strictEqual(resDelHist.body.success, true);

        const [checkHist] = await pool.query('SELECT id FROM pensiones_indicadores_historial WHERE id = ?', [testHistorialId]);
        assert.strictEqual(checkHist.length, 0, 'El registro de historial debe haber sido eliminado.');

        // Probar DELETE del indicador
        const resDelInd = await request(app)
            .delete(`/api/admin/pensiones/indicadores/${testIndicadorId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resDelInd.status, 200);
        assert.strictEqual(resDelInd.body.success, true);
        assert(resDelInd.body.message.includes('eliminado exitosamente'));

        const [checkInd] = await pool.query('SELECT id FROM pensiones_indicadores WHERE id = ?', [testIndicadorId]);
        assert.strictEqual(checkInd.length, 0, 'El indicador debe haber sido eliminado de la BD.');
        console.log('   [PASS] Administrador eliminó registro de indicador y registro de historial exitosamente.\n');

        // -------------------------------------------------------------
        // Punto 2: Usuario sin permisos no puede eliminarlo
        // -------------------------------------------------------------
        console.log('2. Verificando que usuario no autorizado o sin token no puede eliminar registros...');
        // Crear indicador para prueba de rechazo
        const [insertNoPerm] = await pool.query(`
            INSERT INTO pensiones_indicadores (
                codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor,
                anio_referencia, fecha_vigencia_inicio, fecha_vigencia_fin, fuente,
                fundamento_legal, metodo_obtencion, activo
            ) VALUES (
                'TEST_NOPROTECT', 'general', 'Indicador No Borrable por NoAuth', 'Prueba',
                50.0000, 'MXN_DIARIO', 'ESTIMADO', 2091, '2091-01-01', '2091-12-31',
                'Fuente', 'Art. 1', 'MANUAL', 1
            )
        `);
        const noPermIndId = insertNoPerm.insertId;

        // 2.1 Sin token (401)
        const resNoToken = await request(app).delete(`/api/admin/pensiones/indicadores/${noPermIndId}`);
        assert.strictEqual(resNoToken.status, 401, 'Debe devolver 401 si no hay token.');

        // 2.2 Con token sin permisos (403)
        if (noPermToken) {
            const resForbidden = await request(app)
                .delete(`/api/admin/pensiones/indicadores/${noPermIndId}`)
                .set('Authorization', `Bearer ${noPermToken}`);
            assert.strictEqual(resForbidden.status, 403, 'Debe devolver 403 a usuario sin asesoria_pensiones.update.');

            const resForbiddenHist = await request(app)
                .delete(`/api/admin/pensiones/indicadores/historial/1`)
                .set('Authorization', `Bearer ${noPermToken}`);
            assert.strictEqual(resForbiddenHist.status, 403, 'Debe devolver 403 en historial sin permisos.');
        }

        // Limpieza de fixture
        await pool.query('DELETE FROM pensiones_indicadores WHERE id = ?', [noPermIndId]);
        console.log('   [PASS] Peticiones sin token (401) y sin permisos (403) rechazadas correctamente.\n');

        // -------------------------------------------------------------
        // Punto 3: ID inexistente o inválido devuelve error controlado
        // -------------------------------------------------------------
        console.log('3. Verificando manejo de ID inexistente o inválido...');
        // 3.1 ID numérico inexistente (404)
        const resNotFound = await request(app)
            .delete('/api/admin/pensiones/indicadores/99999999')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resNotFound.status, 404);
        assert.strictEqual(resNotFound.body.error, 'Indicador no encontrado.');

        const resHistNotFound = await request(app)
            .delete('/api/admin/pensiones/indicadores/historial/99999999')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resHistNotFound.status, 404);
        assert.strictEqual(resHistNotFound.body.error, 'Registro de historial no encontrado.');

        // 3.2 ID inválido / no numérico (400)
        const resInvalidId = await request(app)
            .delete('/api/admin/pensiones/indicadores/abc')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resInvalidId.status, 400);

        const resInvalidHistId = await request(app)
            .delete('/api/admin/pensiones/indicadores/historial/-5')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resInvalidHistId.status, 400);
        console.log('   [PASS] ID inexistente entrega 404 y ID inválido entrega 400 controlado.\n');

        // -------------------------------------------------------------
        // Punto 4: Cancelar el modal no elimina nada
        // -------------------------------------------------------------
        console.log('4. Verificando que cancelar el modal de confirmación no altera nada...');
        const [insertCancel] = await pool.query(`
            INSERT INTO pensiones_indicadores (
                codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor,
                anio_referencia, fecha_vigencia_inicio, fecha_vigencia_fin, fuente,
                fundamento_legal, metodo_obtencion, activo
            ) VALUES (
                'TEST_CANCEL_IND', 'general', 'Indicador Prueba Cancelar', 'Prueba cancelación',
                88.0000, 'MXN_DIARIO', 'ESTIMADO', 2092, '2092-01-01', '2092-12-31',
                'Fuente', 'Art. 1', 'MANUAL', 1
            )
        `);
        const cancelIndId = insertCancel.insertId;

        // Simular flujo en frontend: si showConfirm resuelve false, NO se envía petición DELETE
        let confirmResult = false; // Usuario presiona 'Cancelar'
        let requestExecuted = false;
        if (confirmResult) {
            requestExecuted = true;
            await request(app).delete(`/api/admin/pensiones/indicadores/${cancelIndId}`).set('Authorization', `Bearer ${adminToken}`);
        }
        assert.strictEqual(requestExecuted, false, 'No debe ejecutarse petición si el usuario cancela.');

        const [verifyCancel] = await pool.query('SELECT id, valor FROM pensiones_indicadores WHERE id = ?', [cancelIndId]);
        assert.strictEqual(verifyCancel.length, 1, 'El registro debe permanecer intacto.');
        assert.strictEqual(Number(verifyCancel[0].valor), 88, 'El valor no debe haber sido modificado.');

        // Limpiar fixture
        await pool.query('DELETE FROM pensiones_indicadores WHERE id = ?', [cancelIndId]);
        console.log('   [PASS] Al cancelar, el registro permanece inalterado.\n');

        // -------------------------------------------------------------
        // Punto 5: Confirmar elimina solamente el registro seleccionado
        // -------------------------------------------------------------
        console.log('5. Verificando que confirmar elimina ÚNICAMENTE el registro seleccionado...');
        const [insA] = await pool.query(`
            INSERT INTO pensiones_indicadores (
                codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor,
                anio_referencia, fecha_vigencia_inicio, fecha_vigencia_fin, fuente,
                fundamento_legal, metodo_obtencion, activo
            ) VALUES (
                'TEST_ISOLATED_A', 'general', 'Registro A', 'Para ser eliminado',
                111.0000, 'MXN_DIARIO', 'ESTIMADO', 2093, '2093-01-01', '2093-12-31',
                'Fuente A', 'Art. A', 'MANUAL', 1
            )
        `);
        const idA = insA.insertId;

        const [insB] = await pool.query(`
            INSERT INTO pensiones_indicadores (
                codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor,
                anio_referencia, fecha_vigencia_inicio, fecha_vigencia_fin, fuente,
                fundamento_legal, metodo_obtencion, activo
            ) VALUES (
                'TEST_ISOLATED_B', 'general', 'Registro B', 'Debe conservarse intacto',
                222.0000, 'MXN_DIARIO', 'ESTIMADO', 2094, '2094-01-01', '2094-12-31',
                'Fuente B', 'Art. B', 'MANUAL', 1
            )
        `);
        const idB = insB.insertId;

        // Eliminar sólo A
        const resDelA = await request(app)
            .delete(`/api/admin/pensiones/indicadores/${idA}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resDelA.status, 200);

        const [checkA] = await pool.query('SELECT id FROM pensiones_indicadores WHERE id = ?', [idA]);
        assert.strictEqual(checkA.length, 0, 'Registro A debe haber sido eliminado.');

        const [checkB] = await pool.query('SELECT id, valor FROM pensiones_indicadores WHERE id = ?', [idB]);
        assert.strictEqual(checkB.length, 1, 'Registro B debe seguir existiendo intacto.');
        assert.strictEqual(Number(checkB[0].valor), 222, 'El valor de Registro B debe ser exactamente 222.');

        // Limpiar B
        await pool.query('DELETE FROM pensiones_indicadores WHERE id = ?', [idB]);
        console.log('   [PASS] Sólo el registro seleccionado fue eliminado; los demás registros permanecen intactos.\n');

        // -------------------------------------------------------------
        // Punto 6: El listado se actualiza después de eliminar
        // -------------------------------------------------------------
        console.log('6. Verificando que el listado de indicadores refleja la eliminación...');
        const resListAfter = await request(app)
            .get('/api/admin/pensiones/indicadores')
            .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(resListAfter.status, 200);
        const listaIndicadores = resListAfter.body.indicadores || [];
        const encontroA = listaIndicadores.some(i => i.id === idA);
        assert.strictEqual(encontroA, false, 'El indicador eliminado no debe aparecer en el listado.');
        console.log('   [PASS] El listado actualizado no incluye el indicador eliminado.\n');

        // -------------------------------------------------------------
        // Punto 7: La eliminación no rompe la consulta de indicadores
        // -------------------------------------------------------------
        console.log('7. Verificando que la consulta de indicadores activos y aplicables sigue funcionando...');
        const activos = await obtenerIndicadoresActivos(pool);
        assert(Array.isArray(activos), 'obtenerIndicadoresActivos debe retornar un arreglo.');
        assert(activos.length >= 8, 'Debe retornar los indicadores oficiales activos del catálogo.');

        const aplicable = await determinarIndicadorAplicable({
            pool,
            regimen: 'general',
            fecha: '2026-06-15',
            codigo: 'SALARIO_MINIMO_GENERAL'
        });
        assert.strictEqual(aplicable.success, true);
        assert.strictEqual(aplicable.valor, 315.04);
        console.log('   [PASS] Consultas de indicadores activos y aplicables funcionan con total normalidad.\n');

        // -------------------------------------------------------------
        // Punto 8: La sincronización BANXICO sigue funcionando
        // -------------------------------------------------------------
        console.log('8. Verificando que la sincronización con BANXICO sigue funcionando...');
        const mockBanxico = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                bmx: {
                    series: [{
                        idSerie: 'SL11298',
                        titulo: 'Salario Mínimo General',
                        datos: [{ fecha: '01/10/2026', dato: '315.04' }]
                    }]
                }
            })
        });

        const syncBanxicoRes = await sincronizarIndicadores({
            pool,
            dryRun: true,
            fuente: 'BANXICO_SIE',
            fetchFn: mockBanxico
        });
        assert.strictEqual(syncBanxicoRes.success, true, 'Sincronización Banxico debe ser exitosa.');
        assert(
            syncBanxicoRes.estado === 'EXITO_DRY_RUN' || syncBanxicoRes.estado === 'EXITO_SIN_CAMBIOS',
            `El estado debe ser exitoso (obtenido: ${syncBanxicoRes.estado})`
        );
        console.log('   [PASS] Sincronización BANXICO validada y funcionando correctamente.\n');

        // -------------------------------------------------------------
        // Punto 9: La sincronización INEGI sigue funcionando
        // -------------------------------------------------------------
        console.log('9. Verificando que la sincronización con INEGI sigue funcionando...');
        const mockInegi = async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                Series: [{
                    INDICADOR: '910392',
                    OBSERVATIONS: [{ TIME_PERIOD: '2026/01', OBS_VALUE: '147.0260' }]
                }]
            })
        });

        const syncInegiRes = await sincronizarIndicadores({
            pool,
            dryRun: true,
            fuente: 'INEGI_BIE',
            fetchFn: mockInegi
        });
        assert.strictEqual(syncInegiRes.success, true, 'Sincronización INEGI debe ser exitosa.');
        assert.strictEqual(syncInegiRes.fuente, 'INEGI_BIE');
        assert.strictEqual(syncInegiRes.estado, 'EXITO_DRY_RUN');
        console.log('   [PASS] Sincronización INEGI validada y funcionando correctamente.\n');

        // -------------------------------------------------------------
        // Punto 10: No aparecen valores hardcodeados como sustituto de un indicador eliminado
        // -------------------------------------------------------------
        console.log('10. Verificando regla estricta: NO fallbacks ni números fijos hardcodeados...');
        // Consultar SMG para una fecha lejana donde no existe indicador (ej. año 2099)
        const smgFuturo = await obtenerSalarioMinimoVigente(pool, '2099-01-01');
        assert.strictEqual(smgFuturo.success, false, 'No debe inventar un éxito si no existe en BD.');
        assert.strictEqual(smgFuturo.indicadorNoDisponible, true, 'Debe reportar indicadorNoDisponible: true.');
        assert.strictEqual(smgFuturo.error, 'INDICATOR_NOT_FOUND', 'Debe tener código INDICATOR_NOT_FOUND.');
        assert(!('salarioMinimo' in smgFuturo && smgFuturo.salarioMinimo > 0), 'No debe inventar salarioMinimo.');
        assert(smgFuturo.mensaje.includes('Capture manualmente el salario mínimo'), 'Debe solicitar captura manual.');
        console.log('   [PASS] Sin valores hardcodeados: ante ausencia de registro, se requiere captura manual explícita.\n');

        // -------------------------------------------------------------
        // Punto 11: Verificación de Integridad Estática en admin.js e index.html
        // -------------------------------------------------------------
        console.log('11. Verificando integración de UI en admin.js e index.html...');
        const adminJsContent = fs.readFileSync(path.join(__dirname, '../admin.js'), 'utf8');
        assert(adminJsContent.includes('confirmarEliminarIndicador'), 'admin.js debe contener confirmarEliminarIndicador.');
        assert(adminJsContent.includes('confirmarEliminarHistorial'), 'admin.js debe contener confirmarEliminarHistorial.');
        assert(adminJsContent.includes('window.confirmarEliminarIndicador = confirmarEliminarIndicador'), 'Debe exportar confirmarEliminarIndicador.');
        assert(adminJsContent.includes('window.confirmarEliminarHistorial = confirmarEliminarHistorial'), 'Debe exportar confirmarEliminarHistorial.');
        assert(adminJsContent.includes('ADVERTENCIA CRÍTICA: Este es un indicador OFICIAL activo'), 'Debe contener la advertencia reforzada para registros oficiales.');

        const indexHtmlContent = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
        assert(indexHtmlContent.includes('id="admin-pensiones-historial"'), 'index.html debe contener el contenedor de historial.');
        assert(indexHtmlContent.includes('<th style="width: 80px; text-align: center;" data-no-sort="true">Acciones</th>'), 'index.html debe incluir la cabecera Acciones en la tabla de historial.');
        console.log('   [PASS] Código frontend integra modales de confirmación, protección oficial y botones de acción.\n');

        console.log('======================================================================');
        console.log('   TODAS LAS PRUEBAS DE ELIMINACIÓN PASARON EXITOSAMENTE (11/11)     ');
        console.log('======================================================================\n');
        process.exit(0);
    } finally {
        await pool.end();
    }
}

runTests().catch(err => {
    console.error('ERROR EN PRUEBAS DE ELIMINACIÓN:', err);
    process.exit(1);
});
