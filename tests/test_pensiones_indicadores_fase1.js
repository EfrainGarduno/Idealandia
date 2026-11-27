const request = require('supertest');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server');
const { calculateIMSSLey73Pension } = require('../pension');

const JWT_SECRET = process.env.AUTH_SECRET || 'idealandia_jwt_secret_key_default';

let pool;
let adminUserId;
let regularUserId;
let adminToken;
let regularToken;

const TEST_INDICADOR_CODIGO = 'TEST_INDICADOR_PENSION_F1';

async function setup() {
    pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        waitForConnections: true,
        connectionLimit: 5
    });

    // 1. Obtener un usuario administrador con permisos
    const [adminRows] = await pool.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN roles r ON ur.rol_id = r.id
        WHERE LOWER(r.nombre) = 'administrador' AND u.activo = 1
        LIMIT 1
    `);

    if (adminRows.length > 0) {
        adminUserId = adminRows[0].id;
        adminToken = jwt.sign(
            { id: adminRows[0].id, usuario: adminRows[0].usuario, jwt_version: adminRows[0].jwt_version || 1 },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
    }

    // 2. Obtener un usuario regular sin permisos de asesoria_pensiones
    const [regRows] = await pool.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
        LEFT JOIN rol_permisos rp ON ur.rol_id = rp.rol_id
        LEFT JOIN permisos p ON rp.permiso_id = p.id AND p.codigo LIKE 'asesoria_pensiones.%'
        WHERE u.activo = 1
        GROUP BY u.id
        HAVING COUNT(p.id) = 0
        LIMIT 1
    `);

    if (regRows.length > 0) {
        regularUserId = regRows[0].id;
        regularToken = jwt.sign(
            { id: regRows[0].id, usuario: regRows[0].usuario, jwt_version: regRows[0].jwt_version || 1 },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
    }

    // Limpiar indicador de prueba si existiera
    await pool.query('DELETE FROM pensiones_indicadores WHERE codigo = ?', [TEST_INDICADOR_CODIGO]);
}

async function cleanup() {
    if (pool) {
        await pool.query('DELETE FROM pensiones_indicadores WHERE codigo = ?', [TEST_INDICADOR_CODIGO]);
        await pool.end();
    }
}

async function runTests() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS: FASE 1 - SISTEMA DE INDICADORES DE PENSIONES (RBAC Y CRUD)');
    console.log('================================================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  [PASS] ${message}`);
            passed++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failed++;
        }
    }

    try {
        await setup();

        // -------------------------------------------------------------
        // BLOQUE 1: Verificación de Esquema e Integridad en MySQL
        // -------------------------------------------------------------
        console.log('--- BLOQUE 1: Verificación de Esquema e Integridad de BD ---');
        const [tables] = await pool.query("SHOW TABLES LIKE 'pensiones_indicadores%'");
        const tableNames = tables.map(t => Object.values(t)[0]);
        assert(tableNames.includes('pensiones_indicadores'), '1.1 Tabla pensiones_indicadores existe en la BD');
        assert(tableNames.includes('pensiones_indicadores_historial'), '1.2 Tabla pensiones_indicadores_historial existe en la BD');

        const [cols] = await pool.query('DESCRIBE pensiones_indicadores');
        const colNames = cols.map(c => c.Field);
        assert(
            ['id', 'codigo', 'regimen', 'valor', 'unidad', 'tipo_valor', 'anio_referencia', 'fecha_vigencia_inicio', 'fundamento_legal', 'metodo_obtencion', 'activo'].every(col => colNames.includes(col)),
            '1.3 Columnas obligatorias presentes en pensiones_indicadores'
        );

        // -------------------------------------------------------------
        // BLOQUE 2: Seguridad y Control de Acceso RBAC
        // -------------------------------------------------------------
        console.log('\n--- BLOQUE 2: Seguridad y Control de Acceso RBAC ---');
        
        // 2.1 Petición sin token -> 401
        const resNoAuth = await request(app).get('/api/admin/pensiones/indicadores');
        assert(resNoAuth.status === 401, '2.1 Petición sin token es rechazada con HTTP 401');

        // 2.2 Usuario sin permiso asesoria_pensiones.read -> 403
        if (regularToken) {
            const resSinPermiso = await request(app)
                .get('/api/admin/pensiones/indicadores')
                .set('Authorization', `Bearer ${regularToken}`);
            assert(resSinPermiso.status === 403, '2.2 Usuario sin permiso asesoria_pensiones.read es rechazado con HTTP 403');
        } else {
            console.log('  [SKIP] 2.2 No se encontró usuario regular sin permisos para prueba');
        }

        // 2.3 Usuario con permiso (Admin) -> 200
        const resAdminGet = await request(app)
            .get('/api/admin/pensiones/indicadores')
            .set('Authorization', `Bearer ${adminToken}`);
        assert(resAdminGet.status === 200 && resAdminGet.body.success === true, '2.3 Usuario autorizado puede listar indicadores (HTTP 200)');

        // -------------------------------------------------------------
        // BLOQUE 3: CRUD y Auditoría de Indicadores de Pensiones
        // -------------------------------------------------------------
        console.log('\n--- BLOQUE 3: Operaciones CRUD y Auditoría Histórica ---');

        // 3.1 Creación de indicador con validación de campos obligatorios
        const resBadPost = await request(app)
            .post('/api/admin/pensiones/indicadores')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ codigo: TEST_INDICADOR_CODIGO }); // Faltan campos
        assert(resBadPost.status === 400, '3.1 Rechazo de creación incompleta con HTTP 400');

        // 3.2 Creación exitosa
        const resCreate = await request(app)
            .post('/api/admin/pensiones/indicadores')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                codigo: TEST_INDICADOR_CODIGO,
                regimen: 'ley73',
                nombre: 'Indicador de Prueba Automatizada',
                descripcion: 'Indicador temporal para verificar CRUD e historial',
                valor: 5000.50,
                unidad: 'MXN_MENSUAL',
                tipo_valor: 'OFICIAL',
                anio_referencia: 2026,
                fecha_vigencia_inicio: '2026-01-01',
                fecha_vigencia_fin: '2026-12-31',
                fuente: 'DOF / Test Suite',
                fuente_url: 'https://dof.gob.mx/test',
                fundamento_legal: 'Art. 168 LSS 1973',
                formula_calculo: 'SMG * 30.4 * 1.11',
                motivo: 'Alta inicial en prueba unitaria'
            });
        assert(resCreate.status === 201 && resCreate.body.id > 0, '3.2 Creación exitosa de indicador con HTTP 201');
        const indicadorId = resCreate.body.id;

        // 3.3 Verificación de unicidad (codigo + regimen + anio)
        const resDuplicate = await request(app)
            .post('/api/admin/pensiones/indicadores')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                codigo: TEST_INDICADOR_CODIGO,
                regimen: 'ley73',
                nombre: 'Duplicado',
                valor: 6000,
                unidad: 'MXN_MENSUAL',
                tipo_valor: 'OFICIAL',
                anio_referencia: 2026,
                fecha_vigencia_inicio: '2026-01-01',
                fuente: 'DOF',
                fundamento_legal: 'LSS'
            });
        assert(resDuplicate.status === 409, '3.3 Rechazo de registro duplicado para mismo régimen y año con HTTP 409');

        // 3.4 Historial automático generado en la creación
        const [histRows1] = await pool.query(
            'SELECT * FROM pensiones_indicadores_historial WHERE indicador_id = ?',
            [indicadorId]
        );
        assert(
            histRows1.length === 1 && histRows1[0].metodo_actualizacion === 'MANUAL' && histRows1[0].valor_anterior === null,
            '3.4 Registro automático en historial en la creación inicial (valor_anterior NULL, método MANUAL)'
        );

        // 3.5 Consulta por ID
        const resGetById = await request(app)
            .get(`/api/admin/pensiones/indicadores/${indicadorId}`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert(
            resGetById.status === 200 && resGetById.body.indicador.codigo === TEST_INDICADOR_CODIGO && resGetById.body.indicador.valor === 5000.5,
            '3.5 Consulta por ID retorna datos y valor con precisión numérica'
        );

        // 3.6 Actualización (PUT) con modificación de valor y auditoría
        const resPut = await request(app)
            .put(`/api/admin/pensiones/indicadores/${indicadorId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                valor: 5500.75,
                tipo_valor: 'ESTIMADO',
                motivo: 'Ajuste anual proyectado para prueba'
            });
        assert(resPut.status === 200, '3.6 Actualización exitosa (PUT) con HTTP 200');

        // 3.7 Verificación de historial de cambios tras PUT
        const resHistorial = await request(app)
            .get(`/api/admin/pensiones/indicadores/${indicadorId}/historial`)
            .set('Authorization', `Bearer ${adminToken}`);
        assert(
            resHistorial.status === 200 && resHistorial.body.historial.length === 2 && resHistorial.body.historial[0].valor_anterior === 5000.5 && resHistorial.body.historial[0].valor_nuevo === 5500.75,
            '3.7 Historial audita correctamente valor_anterior (5000.50) y valor_nuevo (5500.75) con timestamp'
        );

        // 3.8 Inactivación y Reactivación (PATCH estado) sin DELETE
        const resInactivar = await request(app)
            .patch(`/api/admin/pensiones/indicadores/${indicadorId}/estado`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ activo: 0, motivo: 'Inactivación de prueba' });
        assert(resInactivar.status === 200 && resInactivar.body.activo === 0, '3.8 Inactivación exitosa (activo = 0)');

        const resActivar = await request(app)
            .patch(`/api/admin/pensiones/indicadores/${indicadorId}/estado`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ activo: 1, motivo: 'Reactivación de prueba' });
        assert(resActivar.status === 200 && resActivar.body.activo === 1, '3.9 Reactivación exitosa (activo = 1)');

        // Comprobar que el registro sigue existiendo en BD (nunca DELETE)
        const [rowCheck] = await pool.query('SELECT activo FROM pensiones_indicadores WHERE id = ?', [indicadorId]);
        assert(rowCheck.length === 1 && rowCheck[0].activo === 1, '3.10 El indicador permanece íntegro en BD tras alternar estados');

        // -------------------------------------------------------------
        // BLOQUE 4: No Regresión del Motor Actuarial Existente
        // -------------------------------------------------------------
        console.log('\n--- BLOQUE 4: Prueba Crítica de No Regresión del Motor Actual ---');
        const baseData = {
            salarioMinimo: 249,
            salarioDiarioPromedio: 2585,
            semanasCotizadas: 1615,
            edad: 61,
            tieneEsposa: true,
            numeroHijos: 0,
            tienePadresDependientes: false,
            estaEnSoledad: false,
            tieneIncapacidad: false
        };
        const resultadoActuarial = calculateIMSSLey73Pension(baseData);
        assert(
            resultadoActuarial && typeof resultadoActuarial.pensionFinalMensual === 'number' && resultadoActuarial.pensionFinalMensual > 0,
            `4.1 calculateIMSSLey73Pension produce resultado actuarial válido ($${resultadoActuarial.pensionFinalMensual.toFixed(2)})`
        );
        // Verificar consistencia exacta con la línea base conocida
        const diffRegresion = Math.abs(resultadoActuarial.pensionFinalMensual - 52733.069723125);
        assert(diffRegresion < 0.001, `4.2 Pensión calculada idéntica a la línea base histórica ($52,733.07, delta: ${diffRegresion})`);

    } catch (err) {
        console.error('Error durante la ejecución de pruebas:', err);
        failed++;
    } finally {
        await cleanup();
    }

    console.log('\n================================================================================');
    console.log(`RESUMEN FASE 1: ${passed} PRUEBAS PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
