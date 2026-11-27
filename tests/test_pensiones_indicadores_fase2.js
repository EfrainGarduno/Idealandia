const request = require('supertest');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server');
const { calculateIMSSLey73Pension } = require('../pension');
const {
    determinarIndicadorAplicable,
    obtenerIndicadoresActivos,
    invalidarCacheIndicadores,
    obtenerSalarioMinimoVigente
} = require('../pensionIndicadoresService');

const JWT_SECRET = process.env.AUTH_SECRET || 'idealandia_jwt_secret_key_default';

let pool;
let adminToken;
let userToken;

async function setup() {
    pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        waitForConnections: true,
        connectionLimit: 5
    });

    // 1. Obtener usuario administrador
    const [adminRows] = await pool.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN roles r ON ur.rol_id = r.id
        WHERE LOWER(r.nombre) = 'administrador' AND u.activo = 1
        LIMIT 1
    `);

    if (adminRows.length > 0) {
        adminToken = jwt.sign(
            { id: adminRows[0].id, usuario: adminRows[0].usuario, jwt_version: adminRows[0].jwt_version || 1 },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
    }

    // 2. Obtener usuario con permiso calculadora.basica
    const [userRows] = await pool.query(`
        SELECT u.id, u.usuario, u.jwt_version 
        FROM usuarios u
        JOIN usuario_roles ur ON u.id = ur.usuario_id
        JOIN rol_permisos rp ON ur.rol_id = rp.rol_id
        JOIN permisos p ON rp.permiso_id = p.id
        WHERE p.codigo = 'calculadora.basica' AND u.activo = 1
        LIMIT 1
    `);

    if (userRows.length > 0) {
        userToken = jwt.sign(
            { id: userRows[0].id, usuario: userRows[0].usuario, jwt_version: userRows[0].jwt_version || 1 },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
    } else {
        userToken = adminToken;
    }
}

async function cleanup() {
    if (pool) {
        await pool.end();
    }
}

async function runTests() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS: FASE 2 - CONSULTA DE INDICADORES, VIGENCIAS, CACHÉ Y CONTINGENCIA');
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

        // -----------------------------------------------------------------
        // 1, 2, 3: Consulta de indicador Ley 73 para 2024, 2025 y 2026
        // -----------------------------------------------------------------
        console.log('--- BLOQUE 1: Consulta de Indicadores Oficiales Ley 73 ---');
        
        // 1. Indicador Ley 73 2024
        const res2024 = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2024-06-15' });
        assert(
            res2024.success && res2024.valor === 8404.50 && res2024.pensionMinima === 8404.50 && res2024.anioReferencia === 2024,
            `1. Consulta Ley 73 2024 retorna exactamente $8,404.50 (Obtenido: $${res2024.valor})`
        );

        // 2. Indicador Ley 73 2025
        const res2025 = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2025-07-20' });
        assert(
            res2025.success && res2025.valor === 9412.99 && res2025.pensionMinima === 9412.99 && res2025.anioReferencia === 2025,
            `2. Consulta Ley 73 2025 retorna exactamente $9,412.99 (Obtenido: $${res2025.valor})`
        );

        // 3. Indicador Ley 73 2026
        const res2026 = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2026-03-01' });
        assert(
            res2026.success && res2026.valor === 10636.54 && res2026.pensionMinima === 10636.54 && res2026.anioReferencia === 2026,
            `3. Consulta Ley 73 2026 retorna exactamente $10,636.54 (Obtenido: $${res2026.valor})`
        );

        // -----------------------------------------------------------------
        // 4, 5: Selección de vigencias y delimitación estricta por fecha
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 2: Selección de Vigencias y Fechas ---');
        
        // 4. Consulta por fecha selecciona la vigencia correcta
        assert(
            res2024.fechaVigenciaInicio === '2024-01-01' && res2024.fechaVigenciaFin === '2024-12-31' &&
            res2025.fechaVigenciaInicio === '2025-01-01' && res2025.fechaVigenciaFin === '2025-12-31' &&
            res2026.fechaVigenciaInicio === '2026-01-01' && res2026.fechaVigenciaFin === '2026-12-31',
            '4. Cada consulta por fecha selecciona estrictamente el rango de vigencia anual oficial'
        );

        // 5. No seleccionar fuera de vigencia (el indicador de 2024 nunca se aplica a 2025)
        const fechaTransicion1 = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2024-12-31' });
        const fechaTransicion2 = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2025-01-01' });
        assert(
            fechaTransicion1.valor === 8404.50 && fechaTransicion2.valor === 9412.99,
            '5. Transición estricta de vigencias entre 31/12/2024 ($8,404.50) y 01/01/2025 ($9,412.99)'
        );

        // -----------------------------------------------------------------
        // 6: Separación absoluta de Ley 73 y Ley 97
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 3: Separación Absoluta de Regímenes ---');
        
        const resLey97 = await determinarIndicadorAplicable({ pool, regimen: 'ley97', fecha: '2026-05-10' });
        assert(
            resLey97.success && resLey97.regimen === 'ley97' && resLey97.codigo === 'PENSION_MINIMA_GARANTIZADA_LEY_97' && resLey97.valor === 3778.00,
            `6.1 Consulta Ley 97 devuelve su propio indicador garantizado ($${resLey97.valor}, Art. 170 LSS)`
        );
        assert(
            res2026.regimen === 'ley73' && res2026.codigo === 'PENSION_MINIMA_LEY_73' && res2026.codigo !== resLey97.codigo,
            '6.2 Ley 73 y Ley 97 no se mezclan jamás en código, régimen ni fórmula legal'
        );

        // -----------------------------------------------------------------
        // 7: Indicadores inactivos no se utilizan
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 4: Exclusión de Indicadores Inactivos ---');
        
        // Crear un indicador inactivo de prueba
        await pool.query(`
            INSERT INTO pensiones_indicadores
            (codigo, regimen, nombre, valor, unidad, tipo_valor, anio_referencia, fecha_vigencia_inicio, fecha_vigencia_fin, fuente, fundamento_legal, activo)
            VALUES ('TEST_INACTIVO_L73', 'ley73', 'Inactivo Test', 99999.00, 'MXN_MENSUAL', 'OFICIAL', 2026, '2026-01-01', '2026-12-31', 'Test', 'Art. Test', 0)
            ON DUPLICATE KEY UPDATE activo = 0
        `);
        invalidarCacheIndicadores();

        const resInactivoTest = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2026-06-01', codigo: 'TEST_INACTIVO_L73' });
        assert(
            resInactivoTest.success === false && resInactivoTest.error === 'INDICATOR_NOT_FOUND',
            '7. Indicador con activo = 0 es estrictamente ignorado por el servicio de determinación'
        );
        await pool.query("DELETE FROM pensiones_indicadores WHERE codigo = 'TEST_INACTIVO_L73'");
        invalidarCacheIndicadores();

        // -----------------------------------------------------------------
        // 8, 9: Distinción binaria OFICIAL vs ESTIMADO
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 5: Distinción Binaria OFICIAL vs ESTIMADO ---');
        
        // 8. Identificación de valor oficial
        assert(
            res2026.tipoValor === 'OFICIAL' && res2026.esOficial === true && res2026.advertencia === null,
            '8. Valor 2026 se identifica correctamente como OFICIAL (esOficial = true, sin advertencia de estimación)'
        );

        // 9. Identificación de valor estimado para proyección futura (ej. 2027)
        const resFuturo = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2027-08-15' });
        assert(
            resFuturo.success && resFuturo.tipoValor === 'ESTIMADO' && resFuturo.esOficial === false && resFuturo.advertencia !== null && resFuturo.advertencia.includes('estimado'),
            `9. Proyección futura 2027 se identifica estrictamente como ESTIMADO con advertencia clara (Año Ref: ${resFuturo.anioReferencia}, Base: ${resFuturo.anioBaseOficial})`
        );

        // -----------------------------------------------------------------
        // 10, 11: Caché en memoria e invalidación reactiva
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 6: Caché en Memoria e Invalidación Reactiva ---');
        
        // 10. Comprobar que el caché almacena los registros
        invalidarCacheIndicadores();
        const lista1 = await obtenerIndicadoresActivos(pool);
        const lista2 = await obtenerIndicadoresActivos(pool);
        assert(
            lista1 === lista2 && lista1.length > 0,
            '10. Consultas subsecuentes retornan la misma instancia en memoria mediante caché (TTL activo)'
        );

        // 11. Invalidación al modificar
        invalidarCacheIndicadores();
        const lista3 = await obtenerIndicadoresActivos(pool);
        assert(
            lista3 !== lista1 && lista3.length === lista1.length,
            '11. La llamada a invalidarCacheIndicadores() fuerza recarga limpia y renueva el caché en memoria'
        );

        // -----------------------------------------------------------------
        // 12, 13: Resiliencia, Contingencia y NUNCA devolver cero
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 7: Resiliencia, Contingencia y Ausencia de Ceros ---');
        
        // 12. Si la BD falla o pool es inválido, acude al respaldo verificado
        invalidarCacheIndicadores();
        const fakePoolError = {
            query: async () => { throw new Error('DB_CONNECTION_LOST'); }
        };
        const resContingencia = await determinarIndicadorAplicable({ pool: fakePoolError, regimen: 'ley73', fecha: '2026-05-01' });
        assert(
            resContingencia.success && resContingencia.valor === 10636.54,
            `12. Ante falla total de base de datos, el mecanismo de contingencia entrega el último valor oficial verificado ($${resContingencia.valor})`
        );

        // 13. NUNCA se devuelve cero
        assert(
            resContingencia.valor > 0 && resContingencia.valor !== 0,
            '13. Principio inmutable cumplido: NUNCA se devuelve cero como sustituto de un indicador'
        );

        // -----------------------------------------------------------------
        // 14: Manejo de errores controlados
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 8: Manejo de Errores Controlados ---');
        
        const resRegimenInvalido = await determinarIndicadorAplicable({ pool, regimen: 'regimen_inexistente', fecha: '2026-01-01' });
        assert(
            resRegimenInvalido.success === false && resRegimenInvalido.error === 'INVALID_REGIME',
            '14.1 Régimen inválido genera error controlado y explicable (HTTP 400)'
        );

        const resFechaInvalida = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: 'fecha-no-valida' });
        assert(
            resFechaInvalida.success === false && resFechaInvalida.error === 'INVALID_DATE',
            '14.2 Fecha inválida genera error controlado y explicable (HTTP 400)'
        );

        // -----------------------------------------------------------------
        // 14.3: Endpoints API en Servidor Express
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 9: Verificación de Endpoints API (/api/pension/*) ---');
        
        const apiGetMinimo = await request(app)
            .get('/api/pension/minimo-aplicable?regimen=ley73&fecha=2026-03-15')
            .set('Authorization', `Bearer ${userToken}`);
        assert(
            apiGetMinimo.status === 200 && apiGetMinimo.body.success === true && apiGetMinimo.body.pensionMinima === 10636.54,
            `14.3 Endpoint /api/pension/minimo-aplicable retorna HTTP 200 con valor oficial ($${apiGetMinimo.body.pensionMinima})`
        );

        const apiGetSmg = await request(app)
            .get('/api/pension/salario-minimo-vigente?fecha=2026-01-01')
            .set('Authorization', `Bearer ${userToken}`);
        assert(
            apiGetSmg.status === 200 && apiGetSmg.body.salarioMinimo === 315.04 && apiGetSmg.body.historico[2024] === 248.93 && apiGetSmg.body.historico[2025] === 278.80,
            `14.4 Endpoint /api/pension/salario-minimo-vigente consume dinámicamente de BD ($${apiGetSmg.body.salarioMinimo}, histórico cargado)`
        );

        const apiGetIndicadores = await request(app)
            .get('/api/pension/indicadores')
            .set('Authorization', `Bearer ${userToken}`);
        assert(
            apiGetIndicadores.status === 200 && Array.isArray(apiGetIndicadores.body.indicadores) && apiGetIndicadores.body.indicadores.length >= 7,
            `14.5 Endpoint /api/pension/indicadores lista los indicadores activos (${apiGetIndicadores.body.indicadores.length} encontrados)`
        );

        // -----------------------------------------------------------------
        // 14.6 - 14.11: SMG Dinámico por Fecha desde BD (Sin Hardcodeo)
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 9B: Salario Mínimo General Dinámico desde BD por Fecha ---');

        // SMG 2024 desde BD
        const smg2024 = await obtenerSalarioMinimoVigente(pool, '2024-06-15');
        assert(
            smg2024.success && smg2024.salarioMinimo === 248.93 && smg2024.anio === 2024,
            `14.6 SMG 2024 obtenido dinámicamente de BD ($${smg2024.salarioMinimo})`
        );

        // SMG 2025 desde BD
        const smg2025 = await obtenerSalarioMinimoVigente(pool, '2025-06-15');
        assert(
            smg2025.success && smg2025.salarioMinimo === 278.80 && smg2025.anio === 2025,
            `14.7 SMG 2025 obtenido dinámicamente de BD ($${smg2025.salarioMinimo})`
        );

        // SMG 2026 desde BD
        const smg2026 = await obtenerSalarioMinimoVigente(pool, '2026-06-15');
        assert(
            smg2026.success && smg2026.salarioMinimo === 315.04 && smg2026.anio === 2026,
            `14.8 SMG 2026 obtenido dinámicamente de BD ($${smg2026.salarioMinimo})`
        );

        // Selección dependiente de la fecha
        assert(
            smg2024.salarioMinimo !== smg2025.salarioMinimo && smg2025.salarioMinimo !== smg2026.salarioMinimo,
            '14.9 La selección de SMG varía estrictamente en función de la fecha'
        );

        // /api/pension/calcular sin salarioMinimo (debe resolver de BD por fecha)
        const apiCalcularSinSmg = await request(app)
            .post('/api/pension/calcular')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                salarioDiarioPromedio: 2585,
                semanasCotizadas: 1615,
                edad: 61,
                tieneEsposa: true,
                fechaPension: '2026-06-01'
            });
        assert(
            apiCalcularSinSmg.status === 200 && apiCalcularSinSmg.body.success === true,
            '14.10 /api/pension/calcular resuelve SMG dinámicamente de BD si no se envía en payload'
        );

        // /api/pension/proyectar sin salarioMinimoActual ni salarioMinimoProyectado
        const apiProyectarSinSmg = await request(app)
            .post('/api/pension/proyectar')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                semanasActuales: 1615,
                salarioPromedioActual: 2585,
                salarioDiarioProyectado: 2700,
                fechaDesde: '2026-01-01',
                fechaHasta: '2027-01-01'
            });
        assert(
            apiProyectarSinSmg.status === 200 && apiProyectarSinSmg.body.success === true,
            '14.11 /api/pension/proyectar resuelve SMG dinámicamente de BD si no se envía en payload'
        );

        // -----------------------------------------------------------------
        // 15: No Regresión del Motor Actuarial Existente
        // -----------------------------------------------------------------
        console.log('\n--- BLOQUE 10: Prueba Crítica de No Regresión del Motor Actual ---');
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
            `15.1 calculateIMSSLey73Pension produce resultado actuarial válido ($${resultadoActuarial.pensionFinalMensual.toFixed(2)})`
        );
        const diffRegresion = Math.abs(resultadoActuarial.pensionFinalMensual - 52733.069723125);
        assert(
            diffRegresion < 0.001,
            `15.2 Pensión calculada 100% idéntica a la línea base histórica ($52,733.07, delta: ${diffRegresion})`
        );

    } catch (err) {
        console.error('Error durante la ejecución de pruebas de Fase 2:', err);
        failed++;
    } finally {
        await cleanup();
    }

    console.log('\n================================================================================');
    console.log(`RESUMEN FASE 2: ${passed} PRUEBAS PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
