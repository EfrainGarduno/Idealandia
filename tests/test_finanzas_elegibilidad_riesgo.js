const assert = require('assert');
const MotorFinanciero = require('../motorFinanciero.js');

console.log('=================================================================');
console.log('SUITE DE PRUEBAS AUTOMATIZADAS: ELEGIBILIDAD, PLAZOS Y RIESGO');
console.log('=================================================================\n');

let passCount = 0;
let totalCount = 0;

function test(name, fn) {
    totalCount++;
    try {
        fn();
        passCount++;
        console.log(`✅ [PASS] Caso ${totalCount}: ${name}`);
    } catch (err) {
        console.error(`❌ [FAIL] Caso ${totalCount}: ${name}`);
        console.error(err);
        process.exit(1);
    }
}

// Mock de esquemas para pruebas
const esquemaNu = {
    id: 1,
    nombre_esquema: 'Vigente 2026',
    tramos: [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: null, tasa_anual: 6.5 }
    ]
};

const esquemaOpenbank = {
    id: 2,
    nombre_esquema: 'Vigente 2026',
    tramos: [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 30000, tasa_anual: 12.5 },
        { numero_tramo: 2, limite_inferior: 30000, limite_superior: null, tasa_anual: 7.0 }
    ]
};

const esquemaFinsus = {
    id: 3,
    nombre_esquema: 'Pagaré 5 meses',
    fecha_fin_vigencia: null,
    tramos: [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 14.0 }
    ]
};

const esquemaUala = {
    id: 4,
    nombre_esquema: 'Tasa Alta Riesgo Alto',
    tramos: [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 100000, tasa_anual: 15.0 },
        { numero_tramo: 2, limite_inferior: 100000, limite_superior: null, tasa_anual: 5.0 }
    ]
};

// 1. PLAZO SOLICITADO < PLAZO MÍNIMO -> EXCLUIDA
test('Plazo solicitado < Plazo mínimo excluye la institución', () => {
    const inst = {
        id: 101,
        nombre: 'Caja Fuerte',
        tipo: 'B',
        plazo_minimo: 6,
        monto_minimo: 1000,
        nivel_riesgo: 'Bajo',
        esquema: esquemaNu
    };

    const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 10000, 3);
    assert.strictEqual(evalRes.elegible, false);
    assert.ok(evalRes.motivo.includes('plazo mínimo 6 meses'));
    assert.strictEqual(evalRes.plazo_aplicable, 0);
});

// 2. PLAZO SOLICITADO == PLAZO MÍNIMO -> INCLUIDA
test('Plazo solicitado == Plazo mínimo incluye la institución', () => {
    const inst = {
        id: 101,
        nombre: 'Caja Fuerte',
        tipo: 'B',
        plazo_minimo: 6,
        monto_minimo: 1000,
        nivel_riesgo: 'Bajo',
        esquema: esquemaNu
    };

    const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 10000, 6);
    assert.strictEqual(evalRes.elegible, true);
    assert.strictEqual(evalRes.plazo_aplicable, 6);
    assert.strictEqual(evalRes.motivo, null);
});

// 3. PLAZO SOLICITADO > PLAZO MÍNIMO -> INCLUIDA
test('Plazo solicitado > Plazo mínimo incluye la institución', () => {
    const inst = {
        id: 101,
        nombre: 'Caja Fuerte',
        tipo: 'B',
        plazo_minimo: 3,
        monto_minimo: 1000,
        nivel_riesgo: 'Bajo',
        esquema: esquemaNu
    };

    const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 10000, 12);
    assert.strictEqual(evalRes.elegible, true);
    assert.strictEqual(evalRes.plazo_aplicable, 12);
});

// 4. PLAZO MÍNIMO 5 MESES, SOLICITADO 6 MESES CON CONDICIÓN DE 5 MESES
test('Plazo solicitado 6 meses con condición que fija 5 meses -> plazo_aplicable = 5 meses', () => {
    const inst = {
        id: 102,
        nombre: 'Pagaré 5m',
        tipo: 'S',
        plazo_minimo: 5,
        monto_minimo: 1000,
        nivel_riesgo: 'Bajo',
        esquema: esquemaFinsus,
        restricciones: [
            { id: 1, descripcion: 'Plazo fijo de 5 meses para mantener tasa preferencial', activo: 1 }
        ]
    };

    const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 10000, 6);
    assert.strictEqual(evalRes.elegible, true);
    assert.strictEqual(evalRes.plazo_simulacion, 6);
    assert.strictEqual(evalRes.plazo_aplicable, 5);
    assert.ok(evalRes.motivoAjustePlazo.includes('5 meses'));
});

// 5. MONTO SOLICITADO == MONTO MÍNIMO -> INCLUIDA
test('Monto solicitado == Monto mínimo incluye la institución', () => {
    const inst = {
        id: 103,
        nombre: 'Banco VIP',
        tipo: 'B',
        plazo_minimo: 1,
        monto_minimo: 5000,
        nivel_riesgo: 'Bajo',
        esquema: esquemaOpenbank
    };

    const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 5000, 1);
    assert.strictEqual(evalRes.elegible, true);
});

// 6. MONTO SOLICITADO < MONTO MÍNIMO -> EXCLUIDA
test('Monto solicitado < Monto mínimo excluye la institución', () => {
    const inst = {
        id: 103,
        nombre: 'Banco VIP',
        tipo: 'B',
        plazo_minimo: 1,
        monto_minimo: 5000,
        nivel_riesgo: 'Bajo',
        esquema: esquemaOpenbank
    };

    const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 4999.99, 1);
    assert.strictEqual(evalRes.elegible, false);
    assert.ok(evalRes.motivo.includes('monto mínimo $5,000.00'));
});

// 7. MONTO MÍNIMO EN LA DISTRIBUCIÓN: NUNCA ASIGNAR MENOS DEL MÍNIMO
test('Distribución voraz nunca asigna a una institución menos de su monto mínimo', () => {
    // Capital = 10,000
    // Inst A: min $8,000, tasa 14%
    // Inst B: min $5,000, tasa 13%
    // No es posible dar 8,000 + 5,000 = 13,000 > 10,000.
    // Con max_concentracion 100%, Inst A debe recibir $10,000 (>= 8,000) e Inst B $0.
    const instA = {
        id: 201,
        nombre: 'Inst A',
        tipo: 'B',
        monto_minimo: 8000,
        plazo_minimo: 1,
        nivel_riesgo: 'Medio',
        esquema: {
            tramos: [{ numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 14.0 }]
        }
    };
    const instB = {
        id: 202,
        nombre: 'Inst B',
        tipo: 'S',
        monto_minimo: 5000,
        plazo_minimo: 1,
        nivel_riesgo: 'Medio',
        esquema: {
            tramos: [{ numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 13.0 }]
        }
    };

    const res = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 10000,
        meses: 1,
        instituciones: [instA, instB],
        estrategia: 'maximo_rendimiento'
    });

    assert.strictEqual(res.exito, true);
    // Cada asignación debe cumplir asignacion >= monto_minimo
    res.asignaciones.forEach(a => {
        assert.ok(a.inversionAsignada >= a.montoMinimo, `Asignado ${a.inversionAsignada} < min ${a.montoMinimo}`);
    });

    const asigB = res.asignaciones.find(a => a.institucionId === 202);
    assert.strictEqual(asigB, undefined, 'Inst B no debe tener asignación menor a $5,000');
    assert.strictEqual(res.capitalDistribuido, 10000);
});

// 8. CAPITAL INSUFICIENTE PARA CUBRIR MÍNIMOS CON TOPE DE CONCENTRACIÓN
test('Si el tope de concentración impide alcanzar el monto mínimo, ninguna recibe menos de su mínimo', () => {
    // Capital = 10,000, maxPct = 50% ($5,000 máx por institución)
    // Inst A: min $8,000 (tope $5,000 < min $8,000 -> no viable)
    // Inst B: min $6,000 (tope $5,000 < min $6,000 -> no viable)
    const instA = {
        id: 301,
        nombre: 'Inst A',
        tipo: 'B',
        monto_minimo: 8000,
        plazo_minimo: 1,
        nivel_riesgo: 'Medio',
        esquema: {
            tramos: [{ numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 14.0 }]
        }
    };
    const instB = {
        id: 302,
        nombre: 'Inst B',
        tipo: 'S',
        monto_minimo: 6000,
        plazo_minimo: 1,
        nivel_riesgo: 'Medio',
        esquema: {
            tramos: [{ numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 13.0 }]
        }
    };

    const res = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 10000,
        meses: 1,
        instituciones: [instA, instB],
        estrategia: 'conservadora', // max_concentracion 50%
        maxPorcentajePorInst: 50
    });

    // Ninguna institución debe recibir asignación menor a su mínimo
    res.asignaciones.forEach(a => {
        assert.ok(a.inversionAsignada >= a.montoMinimo);
    });
    assert.strictEqual(res.asignaciones.length, 0);
    assert.strictEqual(res.capitalDistribuido, 0);
    assert.strictEqual(res.capitalSinDistribuir, 10000);
});

// 9. RIESGO DESACTIVADO (Considerar nivel de riesgo: No)
test('Considerar riesgo = false ignora el nivel de riesgo por completo', () => {
    const instMuyAlto = {
        id: 401,
        nombre: 'Crypto / Alto Riesgo',
        tipo: 'F',
        monto_minimo: 0,
        plazo_minimo: 1,
        nivel_riesgo: 'Muy alto',
        esquema: esquemaUala
    };

    const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(instMuyAlto, 20000, 1, {
        considerarRiesgo: false,
        nivelMaximoRiesgo: 'Bajo'
    });
    assert.strictEqual(evalRes.elegible, true);
});

// 10. RIESGO ACTIVADO: MÁXIMO "BAJO"
test('Considerar riesgo = true con máximo "Bajo" excluye Medio, Alto y Muy alto', () => {
    const instBajo = { id: 1, nombre: 'Bajo', tipo: 'B', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Bajo', esquema: esquemaNu };
    const instMedio = { id: 2, nombre: 'Medio', tipo: 'S', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Medio', esquema: esquemaNu };
    const instAlto = { id: 3, nombre: 'Alto', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Alto', esquema: esquemaNu };
    const instMuyAlto = { id: 4, nombre: 'Muy alto', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Muy alto', esquema: esquemaNu };

    const opc = { considerarRiesgo: true, nivelMaximoRiesgo: 'Bajo' };
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instBajo, 10000, 1, opc).elegible, true);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instMedio, 10000, 1, opc).elegible, false);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instAlto, 10000, 1, opc).elegible, false);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instMuyAlto, 10000, 1, opc).elegible, false);
});

// 11. RIESGO ACTIVADO: MÁXIMO "MEDIO"
test('Considerar riesgo = true con máximo "Medio" incluye Bajo y Medio, excluye Alto y Muy alto', () => {
    const instBajo = { id: 1, nombre: 'Bajo', tipo: 'B', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Bajo', esquema: esquemaNu };
    const instMedio = { id: 2, nombre: 'Medio', tipo: 'S', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Medio', esquema: esquemaNu };
    const instAlto = { id: 3, nombre: 'Alto', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Alto', esquema: esquemaNu };
    const instMuyAlto = { id: 4, nombre: 'Muy alto', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Muy alto', esquema: esquemaNu };

    const opc = { considerarRiesgo: true, nivelMaximoRiesgo: 'Medio' };
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instBajo, 10000, 1, opc).elegible, true);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instMedio, 10000, 1, opc).elegible, true);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instAlto, 10000, 1, opc).elegible, false);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instMuyAlto, 10000, 1, opc).elegible, false);
});

// 12. RIESGO ACTIVADO: MÁXIMO "ALTO"
test('Considerar riesgo = true con máximo "Alto" incluye Bajo, Medio y Alto, excluye Muy alto', () => {
    const instBajo = { id: 1, nombre: 'Bajo', tipo: 'B', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Bajo', esquema: esquemaNu };
    const instMedio = { id: 2, nombre: 'Medio', tipo: 'S', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Medio', esquema: esquemaNu };
    const instAlto = { id: 3, nombre: 'Alto', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Alto', esquema: esquemaNu };
    const instMuyAlto = { id: 4, nombre: 'Muy alto', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Muy alto', esquema: esquemaNu };

    const opc = { considerarRiesgo: true, nivelMaximoRiesgo: 'Alto' };
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instBajo, 10000, 1, opc).elegible, true);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instMedio, 10000, 1, opc).elegible, true);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instAlto, 10000, 1, opc).elegible, true);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instMuyAlto, 10000, 1, opc).elegible, false);
});

// 13. RIESGO ACTIVADO: MÁXIMO "MUY ALTO"
test('Considerar riesgo = true con máximo "Muy alto" incluye todos los niveles', () => {
    const instBajo = { id: 1, nombre: 'Bajo', tipo: 'B', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Bajo', esquema: esquemaNu };
    const instMuyAlto = { id: 4, nombre: 'Muy alto', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Muy alto', esquema: esquemaNu };

    const opc = { considerarRiesgo: true, nivelMaximoRiesgo: 'Muy alto' };
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instBajo, 10000, 1, opc).elegible, true);
    assert.strictEqual(MotorFinanciero.evaluarElegibilidadInstitucion(instMuyAlto, 10000, 1, opc).elegible, true);
});

// 14. INSTITUCIÓN CON TASA ALTA Y RIESGO ALTO vs TASA BAJA Y RIESGO BAJO
test('Tasa alta de 15% con riesgo Alto queda fuera si el usuario acepta solo Bajo', () => {
    const instAlta = { id: 501, nombre: 'Tasa Alta', tipo: 'F', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Alto', esquema: esquemaUala };
    const instBaja = { id: 502, nombre: 'Tasa Segura', tipo: 'B', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Bajo', esquema: esquemaNu };

    const res = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 50000,
        meses: 1,
        instituciones: [instAlta, instBaja],
        estrategia: 'maximo_rendimiento',
        considerarRiesgo: true,
        nivelMaximoRiesgo: 'Bajo'
    });

    assert.strictEqual(res.exito, true);
    assert.strictEqual(res.asignaciones.length, 1);
    assert.strictEqual(res.asignaciones[0].institucionId, 502);
    assert.strictEqual(res.institucionesNoElegibles.length, 1);
    assert.strictEqual(res.institucionesNoElegibles[0].institucionId, 501);
});

// 15. EL RIESGO ES EXCLUSIVAMENTE UN FILTRO Y NO ALTERA MATEMÁTICAMENTE LAS TASAS
test('El nivel de riesgo NO modifica matemáticamente las tasas ni los rendimientos', () => {
    const inst = { id: 601, nombre: 'Inst Neutra', tipo: 'B', monto_minimo: 0, plazo_minimo: 1, nivel_riesgo: 'Bajo', esquema: esquemaNu };

    const simSinRiesgo = MotorFinanciero.simularInversion(20000, 1, inst.esquema.tramos);
    const divSinFiltro = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 20000,
        meses: 1,
        instituciones: [inst],
        considerarRiesgo: false
    });
    const divConFiltro = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 20000,
        meses: 1,
        instituciones: [inst],
        considerarRiesgo: true,
        nivelMaximoRiesgo: 'Bajo'
    });

    assert.strictEqual(divSinFiltro.rendimientoPeriodoTotal, divConFiltro.rendimientoPeriodoTotal);
    assert.strictEqual(divSinFiltro.tasaEfectivaPonderada, divConFiltro.tasaEfectivaPonderada);
    assert.strictEqual(divConFiltro.rendimientoPeriodoTotal, simSinRiesgo.total_periodo);
});

// 16. COMBINACIÓN SIMULTÁNEA: MONTO MÍNIMO + PLAZO MÍNIMO + NIVEL DE RIESGO
test('Combinación simultánea de monto, plazo y riesgo valida integralmente', () => {
    const inst = {
        id: 701,
        nombre: 'SofiCombo',
        tipo: 'S',
        monto_minimo: 10000,
        plazo_minimo: 6,
        nivel_riesgo: 'Medio',
        esquema: esquemaNu
    };

    // Falla por monto
    let r = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 5000, 6, { considerarRiesgo: true, nivelMaximoRiesgo: 'Alto' });
    assert.strictEqual(r.elegible, false);
    assert.ok(r.motivo.includes('monto mínimo'));

    // Falla por plazo
    r = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 15000, 3, { considerarRiesgo: true, nivelMaximoRiesgo: 'Alto' });
    assert.strictEqual(r.elegible, false);
    assert.ok(r.motivo.includes('plazo mínimo'));

    // Falla por riesgo
    r = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 15000, 6, { considerarRiesgo: true, nivelMaximoRiesgo: 'Bajo' });
    assert.strictEqual(r.elegible, false);
    assert.ok(r.motivo.includes('nivel de riesgo'));

    // Pasa todo
    r = MotorFinanciero.evaluarElegibilidadInstitucion(inst, 15000, 6, { considerarRiesgo: true, nivelMaximoRiesgo: 'Medio' });
    assert.strictEqual(r.elegible, true);
    assert.strictEqual(r.plazo_aplicable, 6);
});

// 17. INVARIANTE MATEMÁTICO: CAPITAL TOTAL = CAPITAL DISTRIBUIDO + CAPITAL SIN DISTRIBUIR
test('Invariante matemático estricto se mantiene bajo cualquier escenario de elegibilidad', () => {
    const inst1 = { id: 801, nombre: 'I1', tipo: 'B', monto_minimo: 15000, plazo_minimo: 3, nivel_riesgo: 'Bajo', esquema: esquemaNu };
    const inst2 = { id: 802, nombre: 'I2', tipo: 'S', monto_minimo: 20000, plazo_minimo: 1, nivel_riesgo: 'Medio', esquema: esquemaOpenbank };

    const capital = 30000;
    const res = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: capital,
        meses: 6,
        instituciones: [inst1, inst2],
        estrategia: 'equilibrada',
        considerarRiesgo: true,
        nivelMaximoRiesgo: 'Medio'
    });

    const suma = res.capitalDistribuido + res.capitalSinDistribuir;
    assert.strictEqual(Math.round(suma * 100) / 100, capital);
});

// 18. ESTRATEGIAS DIVERSIFICADAS CON PLAZO APLICABLE DIFERENCIADO
test('Institución con plazo_aplicable menor al plazo solicitado calcula su rendimiento con su plazo aplicable', () => {
    const instFija5m = {
        id: 901,
        nombre: 'Pagaré 5m',
        tipo: 'S',
        plazo_minimo: 5,
        monto_minimo: 0,
        nivel_riesgo: 'Bajo',
        esquema: {
            tramos: [{ numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 12.0 }]
        },
        restricciones: [
            { id: 10, descripcion: 'Plazo fijo de 5 meses', activo: 1 }
        ]
    };

    const res = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 10000,
        meses: 6, // Usuario solicita 6 meses
        instituciones: [instFija5m],
        estrategia: 'maximo_rendimiento'
    });

    assert.strictEqual(res.exito, true);
    assert.strictEqual(res.asignaciones.length, 1);
    const asig = res.asignaciones[0];
    assert.strictEqual(asig.plazoSimulacion, 6);
    assert.strictEqual(asig.plazoAplicable, 5);
    // Rendimiento anual = 10,000 * 12% = 1,200. Mensual = 100. A 5 meses = 500 (NO 600)
    assert.strictEqual(asig.rendimientoMensual, 100);
    assert.strictEqual(asig.rendimientoPeriodo, 500);
});

(async () => {
    const mysql = require('mysql2/promise');
    require('dotenv').config();

    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'idealandia',
            port: process.env.DB_PORT || 3306
        });

        // 19. INTEGRACIÓN BASE DE DATOS: COLUMNAS EN MYSQL
        await (async () => {
            totalCount++;
            const [cols] = await conn.query("SHOW COLUMNS FROM instituciones_financieras WHERE Field IN ('monto_minimo', 'plazo_minimo', 'nivel_riesgo')");
            assert.strictEqual(cols.length, 3, 'Deben existir las 3 columnas en instituciones_financieras');
            passCount++;
            console.log(`✅ [PASS] Caso ${totalCount}: Esquema MySQL contiene monto_minimo, plazo_minimo y nivel_riesgo`);
        })();

        // 20. INTEGRACIÓN BASE DE DATOS: PERSISTENCIA Y SEED DE NIVELES DE RIESGO
        await (async () => {
            totalCount++;
            const [rows] = await conn.query("SELECT nombre, monto_minimo, plazo_minimo, nivel_riesgo FROM instituciones_financieras WHERE nombre IN ('NU', 'Openbank', 'Uala', 'Didi')");
            assert.ok(rows.length >= 3, 'Deben encontrarse las instituciones en la base de datos');
            const nu = rows.find(r => r.nombre === 'NU');
            const uala = rows.find(r => r.nombre === 'Uala');
            assert.strictEqual(nu.nivel_riesgo, 'Bajo');
            assert.strictEqual(uala.nivel_riesgo, 'Muy alto');
            passCount++;
            console.log(`✅ [PASS] Caso ${totalCount}: Persistencia en BD de niveles de riesgo y reglas por institución`);
        })();

    } catch (e) {
        console.error('Error en pruebas de base de datos:', e);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
        console.log(`\n=================================================================`);
        console.log(`RESULTADO DE LA SUITE: ${passCount} de ${totalCount} PRUEBAS SUPERADAS`);
        console.log(`=================================================================\n`);
    }
})();
