const request = require('supertest');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server');
const { calculateIMSSLey73Pension, aplicarCapaPensionMinima } = require('../pension');
const { determinarIndicadorAplicable } = require('../pensionIndicadoresService');

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
    console.log('SUITE DE PRUEBAS: FASE 3 - INTEGRACIÓN DE PENSIÓN MÍNIMA LEGAL EN CALCULADORAS');
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
        // BLOQUE 1: Regla Fundamental MAX(Calculada, Mínima)
        // -------------------------------------------------------------
        console.log('--- BLOQUE 1: Casos Fundamentales de Comparación MAX() ---');

        // Caso 1: Calculada > Mínima ($25,000 > $10,636.54) -> Gana Calculada
        const mockCalculadaAlta = { pensionFinalMensual: 25000.00 };
        const mockMinima = { pensionMinima: 10636.54, tipoValor: 'OFICIAL', esOficial: true };
        const resCaso1 = aplicarCapaPensionMinima(mockCalculadaAlta, mockMinima);
        assert(
            resCaso1.pensionQueAplicara === 25000.00 && resCaso1.aplicaMinimoLegal === false,
            `Caso 1: Calculada ($25,000.00) > Mínima ($10,636.54) -> Aplica Calculada ($${resCaso1.pensionQueAplicara})`
        );

        // Caso 2: Calculada < Mínima ($6,500.00 < $10,636.54) -> Gana Mínima
        const mockCalculadaBaja = { pensionFinalMensual: 6500.00 };
        const resCaso2 = aplicarCapaPensionMinima(mockCalculadaBaja, mockMinima);
        assert(
            resCaso2.pensionQueAplicara === 10636.54 && resCaso2.aplicaMinimoLegal === true && resCaso2.explicacionMinimo.includes('mínima legal'),
            `Caso 2: Calculada ($6,500.00) < Mínima ($10,636.54) -> Aplica Mínima ($${resCaso2.pensionQueAplicara}) con leyenda legal`
        );

        // Caso 3: Calculada == Mínima ($10,636.54 == $10,636.54) -> Ambas
        const mockCalculadaIgual = { pensionFinalMensual: 10636.54 };
        const resCaso3 = aplicarCapaPensionMinima(mockCalculadaIgual, mockMinima);
        assert(
            resCaso3.pensionQueAplicara === 10636.54 && resCaso3.aplicaMinimoLegal === false,
            `Caso 3: Calculada ($10,636.54) == Mínima ($10,636.54) -> Aplica valor común ($${resCaso3.pensionQueAplicara})`
        );

        // Caso 10: La pensión aplicable NUNCA es menor que el mínimo legal determinado
        assert(
            resCaso1.pensionQueAplicara >= mockMinima.pensionMinima &&
            resCaso2.pensionQueAplicara >= mockMinima.pensionMinima &&
            resCaso3.pensionQueAplicara >= mockMinima.pensionMinima,
            'Caso 10: Invariante garantizado: pensión que aplicará NUNCA es inferior al mínimo legal'
        );

        // -------------------------------------------------------------
        // BLOQUE 2: Separación de Regímenes y Clasificación OFICIAL/ESTIMADO
        // -------------------------------------------------------------
        console.log('\n--- BLOQUE 2: Separación de Regímenes y Clasificación Oficial / Estimado ---');

        // Caso 4: Ley 73 no utiliza indicadores Ley 97
        const minL73 = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2026-03-01' });
        assert(
            minL73.codigo === 'PENSION_MINIMA_LEY_73' && minL73.regimen === 'ley73',
            'Caso 4: Ley 73 consulta exclusivamente PENSION_MINIMA_LEY_73 sin tocar Ley 97'
        );

        // Caso 5: Ley 97 no utiliza indicadores Ley 73
        const minL97 = await determinarIndicadorAplicable({ pool, regimen: 'ley97', fecha: '2026-03-01' });
        assert(
            minL97.codigo === 'PENSION_MINIMA_GARANTIZADA_LEY_97' && minL97.regimen === 'ley97',
            'Caso 5: Ley 97 consulta exclusivamente PENSION_MINIMA_GARANTIZADA_LEY_97 sin tocar Ley 73'
        );

        // Caso 6: Indicador oficial 2026 se presenta como OFICIAL
        assert(
            minL73.tipoValor === 'OFICIAL' && minL73.esOficial === true,
            'Caso 6: Indicador 2026 se presenta formalmente como OFICIAL (esOficial = true)'
        );

        // Caso 7: Proyección 2027 se presenta como ESTIMADO
        const minL73_2027 = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2027-06-15' });
        assert(
            minL73_2027.tipoValor === 'ESTIMADO' && minL73_2027.esOficial === false && minL73_2027.advertencia !== null,
            'Caso 7: Proyección 2027 se presenta formalmente como ESTIMADO con aviso legal transparente'
        );

        // Caso 8: El modal ⓘ contiene la información legal exacta
        assert(
            minL73.fundamentoLegal.includes('168') && minL73.formulaCalculo.includes('1.11') && minL73.fuente.includes('CONASAMI'),
            'Caso 8: Metadatos para modal ⓘ reflejan fundamento legal (Art 168), fórmula (1.11) y fuente oficial'
        );

        // -------------------------------------------------------------
        // BLOQUE 3: Integración de Endpoints Backend (/api/pension/*)
        // -------------------------------------------------------------
        console.log('\n--- BLOQUE 3: Integración Backend y Tres Conceptos ---');

        // Endpoint /api/pension/calcular con pensión baja (Gana mínimo)
        const resApiBaja = await request(app)
            .post('/api/pension/calcular')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                salarioMinimo: 315.04,
                salarioDiarioPromedio: 400.00,
                semanasCotizadas: 600,
                edad: 60,
                tieneEsposa: false,
                numeroHijos: 0,
                tienePadresDependientes: false,
                estaEnSoledad: false,
                tieneIncapacidad: false
            });

        assert(
            resApiBaja.status === 200 &&
            typeof resApiBaja.body.pensionCalculada === 'number' &&
            resApiBaja.body.pensionCalculada < 10000 &&
            resApiBaja.body.pensionMinimaAplicable === 10636.54 &&
            resApiBaja.body.pensionQueAplicara === 10636.54 &&
            resApiBaja.body.aplicaMinimoLegal === true,
            `Caso 11.1 (/api/pension/calcular): Devuelve 3 conceptos y prevalece el mínimo legal ($${resApiBaja.body.pensionQueAplicara})`
        );

        // Endpoint /api/pension/calcular con pensión alta (Gana calculada)
        const resApiAlta = await request(app)
            .post('/api/pension/calcular')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                salarioMinimo: 315.04,
                salarioDiarioPromedio: 2500.00,
                semanasCotizadas: 1800,
                edad: 65,
                tieneEsposa: true,
                numeroHijos: 0,
                tienePadresDependientes: false,
                estaEnSoledad: false,
                tieneIncapacidad: false
            });

        assert(
            resApiAlta.status === 200 &&
            resApiAlta.body.pensionCalculada > 10636.54 &&
            resApiAlta.body.pensionQueAplicara === resApiAlta.body.pensionCalculada &&
            resApiAlta.body.aplicaMinimoLegal === false,
            `Caso 11.2 (/api/pension/calcular): Devuelve 3 conceptos y prevalece la pensión calculada ($${resApiAlta.body.pensionQueAplicara.toFixed(2)})`
        );

        // Endpoint /api/pension/proyectar con fecha futura 2027
        const resApiProy = await request(app)
            .post('/api/pension/proyectar')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                semanasActuales: 1000,
                salarioPromedioActual: 800,
                salarioDiarioProyectado: 2500,
                fechaDesde: '2026-07-01',
                fechaHasta: '2027-11-30',
                edadRetiroActual: 60,
                fechaNacimiento: '1966-11-30'
            });

        assert(
            resApiProy.status === 200 &&
            resApiProy.body.situacionProyectada &&
            resApiProy.body.situacionProyectada.pensionCalculada !== undefined &&
            resApiProy.body.situacionProyectada.pensionMinimaAplicable !== undefined &&
            resApiProy.body.situacionProyectada.pensionQueAplicara !== undefined,
            'Caso 14: /api/pension/proyectar integra los 3 conceptos en Situación Actual y Proyectada'
        );

        // -------------------------------------------------------------
        // BLOQUE 4: No Regresión y Preservación de Línea Base
        // -------------------------------------------------------------
        console.log('\n--- BLOQUE 4: Pruebas Críticas de No Regresión ---');

        // Caso 9: La pensión calculada mantiene exactamente el resultado histórico del motor
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
        const resHistorico = calculateIMSSLey73Pension(baseData);
        const diffRegresion = Math.abs(resHistorico.pensionFinalMensual - 52733.069723125);
        assert(
            diffRegresion < 0.001,
            `Caso 9: Motor actuarial 100% idéntico a la línea base histórica ($52,733.07, delta: ${diffRegresion})`
        );

        // Caso 12: Contingencia continúa funcionando ante corte de BD
        const fakePoolDown = { query: async () => { throw new Error('DB_DOWN'); } };
        const resDown = await determinarIndicadorAplicable({ pool: fakePoolDown, regimen: 'ley73', fecha: '2026-01-01' });
        assert(
            resDown.success && resDown.valor === 10636.54,
            'Caso 12: Respaldo de contingencia funciona sin BD y nunca devuelve cero'
        );

    } catch (err) {
        console.error('Error durante la ejecución de pruebas de Fase 3:', err);
        failed++;
    } finally {
        await cleanup();
    }

    console.log('\n================================================================================');
    console.log(`RESUMEN FASE 3: ${passed} PRUEBAS PASADAS, ${failed} FALLADAS`);
    console.log('================================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests();
