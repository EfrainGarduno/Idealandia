const assert = require('assert');
const MotorFinanciero = require('../motorFinanciero.js');

console.log('====================================================================');
console.log('PRUEBAS: RESUMEN DE TRAMOS EN COLUMNAS INVERSIÓN 1 E INVERSIÓN 2');
console.log('====================================================================\n');

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

// 1. INSTITUCIÓN CON 1 TRAMO ($50,000 @ 10%, 12 meses)
test('Institución con 1 tramo: Inversión 1 = Total, Inversión 2 = 0', () => {
    const tramos1 = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 10.0 }
    ];

    const res = MotorFinanciero.simularInversion(50000, 12, tramos1);

    assert.strictEqual(res.inversion_base, 50000);
    assert.strictEqual(res.inversion_2, 0);
    assert.strictEqual(res.inversion_base + res.inversion_2, 50000);
    assert.strictEqual(res.tramos.length, 1);
    assert.strictEqual(res.tramos[0].monto_en_tramo, 50000);
    assert.strictEqual(res.rend1, 5000);
    assert.strictEqual(res.rend2, 0);
    assert.strictEqual(res.total_periodo, 5000);
});

// 2. INSTITUCIÓN CON 2 TRAMOS (NU: $0-$25k @ 13%, >$25k @ 6.5%, capital $40,000, 1 mes)
test('Institución con 2 tramos: Inversión 1 = Tramo 1, Inversión 2 = Tramo 2', () => {
    const tramosNU = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: null, tasa_anual: 6.5 }
    ];

    const res = MotorFinanciero.simularInversion(40000, 1, tramosNU);

    assert.strictEqual(res.inversion_base, 25000);
    assert.strictEqual(res.inversion_2, 15000);
    assert.strictEqual(res.inversion_base + res.inversion_2, 40000);
    assert.strictEqual(res.tramos.length, 2);
    assert.strictEqual(res.tramos[0].monto_en_tramo, 25000);
    assert.strictEqual(res.tramos[1].monto_en_tramo, 15000);
    assert.strictEqual(res.rend1.toFixed(2), '270.83');
    assert.strictEqual(res.rend2.toFixed(2), '81.25');
    assert.strictEqual(res.total_periodo.toFixed(2), '352.08');
    assert.strictEqual((res.rend1 + res.rend2).toFixed(2), res.total_periodo.toFixed(2));
});

// 3. INSTITUCIÓN CON 3 TRAMOS, COMO KLAR ($1,000,000, 1 mes)
// Tramo 1: $0 - $25,000 @ 15% -> $25,000
// Tramo 2: $25,000 - $200,000 @ 10% -> $175,000
// Tramo 3: > $200,000 @ 8% -> $800,000
test('Institución con 3 tramos (Klar $1,000,000): Inversión 1 = $25,000, Inversión 2 = $975,000', () => {
    const tramosKlar = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 15.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: 200000, tasa_anual: 10.0 },
        { numero_tramo: 3, limite_inferior: 200000, limite_superior: null, tasa_anual: 8.0 }
    ];

    const res = MotorFinanciero.simularInversion(1000000, 1, tramosKlar);

    // Desglose individual de los 3 tramos debe estar intacto
    assert.strictEqual(res.tramos.length, 3);
    assert.strictEqual(res.tramos[0].monto_en_tramo, 25000);
    assert.strictEqual(res.tramos[1].monto_en_tramo, 175000);
    assert.strictEqual(res.tramos[2].monto_en_tramo, 800000);

    // Columnas resumidas
    assert.strictEqual(res.inversion_base, 25000);
    // Inversión 2 = Tramo 2 ($175,000) + Tramo 3 ($800,000) = $975,000
    assert.strictEqual(res.inversion_2, 975000);
    assert.strictEqual(res.inversion_base + res.inversion_2, 1000000);

    // Rendimientos individuales
    // Tramo 1: 25000 * 15% / 12 = 312.50
    // Tramo 2: 175000 * 10% / 12 = 1458.333...
    // Tramo 3: 800000 * 8% / 12 = 5333.333...
    // Rend1 = 312.50
    // Rend2 = 1458.333... + 5333.333... = 6791.666...
    assert.strictEqual(res.rend1.toFixed(2), '312.50');
    assert.strictEqual(res.rend2.toFixed(2), '6791.67');
    assert.strictEqual(res.total_periodo.toFixed(2), '7104.17');
    assert.strictEqual((res.rend1 + res.rend2).toFixed(2), res.total_periodo.toFixed(2));
});

// 4. INSTITUCIÓN CON 4 TRAMOS ($1,000,000, 1 mes)
// Tramo 1: $25,000 @ 15%
// Tramo 2: $100,000 @ 12% (rango 25k - 125k)
// Tramo 3: $200,000 @ 10% (rango 125k - 325k)
// Tramo 4: $675,000 @ 8% (rango > 325k)
test('Institución con 4 tramos: Inversión 1 = $25,000, Inversión 2 = $975,000 (100k + 200k + 675k)', () => {
    const tramos4 = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 15.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: 125000, tasa_anual: 12.0 },
        { numero_tramo: 3, limite_inferior: 125000, limite_superior: 325000, tasa_anual: 10.0 },
        { numero_tramo: 4, limite_inferior: 325000, limite_superior: null, tasa_anual: 8.0 }
    ];

    const res = MotorFinanciero.simularInversion(1000000, 1, tramos4);

    // Desglose individual de los 4 tramos
    assert.strictEqual(res.tramos.length, 4);
    assert.strictEqual(res.tramos[0].monto_en_tramo, 25000);
    assert.strictEqual(res.tramos[1].monto_en_tramo, 100000);
    assert.strictEqual(res.tramos[2].monto_en_tramo, 200000);
    assert.strictEqual(res.tramos[3].monto_en_tramo, 675000);

    // Columnas resumidas
    assert.strictEqual(res.inversion_base, 25000);
    assert.strictEqual(res.inversion_2, 975000);
    assert.strictEqual(res.inversion_base + res.inversion_2, 1000000);

    // Rendimientos
    // Tramo 1: 25000 * 15% / 12 = 312.50
    // Tramo 2: 100000 * 12% / 12 = 1000.00
    // Tramo 3: 200000 * 10% / 12 = 1666.666...
    // Tramo 4: 675000 * 8% / 12 = 4500.00
    // Rend2 = 1000 + 1666.67 + 4500 = 7166.67
    // Total = 312.50 + 7166.67 = 7479.17
    assert.strictEqual(res.rend1.toFixed(2), '312.50');
    assert.strictEqual(res.rend2.toFixed(2), '7166.67');
    assert.strictEqual(res.total_periodo.toFixed(2), '7479.17');
    assert.strictEqual((res.rend1 + res.rend2).toFixed(2), res.total_periodo.toFixed(2));
});

// 5. VERIFICAR QUE EL DESGLOSE DETALLADO MUESTRA CADA TRAMO INDIVIDUALMENTE
test('El desglose detallado (res.tramos) mantiene cada tramo de forma individual e intacta', () => {
    const tramosKlar = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 15.0, descripcion_tramo: 'Saldo hasta 25 mil' },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: 200000, tasa_anual: 10.0, descripcion_tramo: 'De 25 a 200 mil' },
        { numero_tramo: 3, limite_inferior: 200000, limite_superior: null, tasa_anual: 8.0, descripcion_tramo: 'Excedente de 200 mil' }
    ];

    const res = MotorFinanciero.simularInversion(1000000, 3, tramosKlar);

    assert.strictEqual(res.tramos.length, 3);
    assert.strictEqual(res.tramos[0].numero_tramo, 1);
    assert.strictEqual(res.tramos[0].monto_en_tramo, 25000);
    assert.strictEqual(res.tramos[0].tasa_anual, 15.0);

    assert.strictEqual(res.tramos[1].numero_tramo, 2);
    assert.strictEqual(res.tramos[1].monto_en_tramo, 175000);
    assert.strictEqual(res.tramos[1].tasa_anual, 10.0);

    assert.strictEqual(res.tramos[2].numero_tramo, 3);
    assert.strictEqual(res.tramos[2].monto_en_tramo, 800000);
    assert.strictEqual(res.tramos[2].tasa_anual, 8.0);
});

// 6. INVERSIÓN 1 + INVERSIÓN 2 COINCIDE EXACTAMENTE CON EL CAPITAL TOTAL ASIGNADO
test('Invariante estricto: Inversión 1 + Inversión 2 === Capital Total asignado en múltiples montos', () => {
    const tramosKlar = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 15.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: 200000, tasa_anual: 10.0 },
        { numero_tramo: 3, limite_inferior: 200000, limite_superior: null, tasa_anual: 8.0 }
    ];

    const montosPrueba = [10000, 25000, 50000, 100000, 200000, 500000, 1000000, 3500000];

    montosPrueba.forEach(monto => {
        const res = MotorFinanciero.simularInversion(monto, 6, tramosKlar);
        assert.strictEqual(
            res.inversion_base + res.inversion_2,
            monto,
            `Fallo en monto ${monto}: Inv1 (${res.inversion_base}) + Inv2 (${res.inversion_2}) !== ${monto}`
        );
    });
});

// 7. VERIFICAR QUE ESTA CORRECCIÓN NO ALTERA NINGÚN CÁLCULO DE RENDIMIENTO
test('El rendimiento total del periodo y rendimiento mensual es exactamente idéntico al cálculo financiero por tramos', () => {
    const tramosKlar = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 15.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: 200000, tasa_anual: 10.0 },
        { numero_tramo: 3, limite_inferior: 200000, limite_superior: null, tasa_anual: 8.0 }
    ];

    const res = MotorFinanciero.simularInversion(1000000, 6, tramosKlar);

    // Suma manual directa por definición matemática
    const r1 = 25000 * (0.15 / 12) * 6;
    const r2 = 175000 * (0.10 / 12) * 6;
    const r3 = 800000 * (0.08 / 12) * 6;
    const totalEsperado = r1 + r2 + r3;

    assert.strictEqual(Math.round(res.total_periodo * 100) / 100, Math.round(totalEsperado * 100) / 100);
    assert.strictEqual(Math.round((res.rend1 + res.rend2) * 100) / 100, Math.round(totalEsperado * 100) / 100);
});

// 8. ASIGNACIÓN EN ESTRATEGIA DIVERSIFICADA
test('En estrategia diversificada, la asignación a Klar refleja inversion1 = $25k e inversion2 = $975k', () => {
    const instKlar = {
        id: 99,
        nombre: 'Klar',
        tipo: 'F',
        monto_minimo: 0,
        plazo_minimo: 1,
        nivel_riesgo: 'Medio',
        esquema: {
            tramos: [
                { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 15.0 },
                { numero_tramo: 2, limite_inferior: 25000, limite_superior: 200000, tasa_anual: 10.0 },
                { numero_tramo: 3, limite_inferior: 200000, limite_superior: null, tasa_anual: 8.0 }
            ]
        }
    };

    const resDiv = MotorFinanciero.calcularMejorInversionDiversificada({
        inversionTotal: 1000000,
        meses: 1,
        instituciones: [instKlar],
        estrategia: 'maximo_rendimiento'
    });

    assert.strictEqual(resDiv.exito, true);
    assert.strictEqual(resDiv.asignaciones.length, 1);
    const asig = resDiv.asignaciones[0];
    assert.strictEqual(asig.inversion1, 25000);
    assert.strictEqual(asig.inversion2, 975000);
    assert.strictEqual(asig.inversion1 + asig.inversion2, 1000000);
    assert.strictEqual(asig.tramosDetalle.length, 3);
});

console.log(`\n====================================================================`);
console.log(`RESULTADO DE LA SUITE: ${passCount} de ${totalCount} PRUEBAS SUPERADAS`);
console.log(`====================================================================\n`);
