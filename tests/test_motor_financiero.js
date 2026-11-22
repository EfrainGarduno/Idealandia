const assert = require('assert');
const MotorFinanciero = require('../public/js/motorFinanciero.js');

console.log('--- Iniciando Pruebas Unitarias del Motor Financiero ---');

// CASO 1: Un tramo ($50,000 al 10%, 12 meses -> Rendimiento = $5,000)
{
    const tramos = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 10.0 }
    ];
    const res = MotorFinanciero.simularInversion(50000, 12, tramos);
    console.log('\n[Caso 1: Un tramo]');
    console.log('Total mensual:', res.total_mensual.toFixed(2));
    console.log('Total periodo (12 meses):', res.total_periodo.toFixed(2));

    assert.strictEqual(res.inversion_total, 50000);
    assert.strictEqual(res.meses, 12);
    assert.strictEqual(Math.round(res.total_periodo), 5000);
    assert.strictEqual(res.inversion_base, 50000);
    assert.strictEqual(res.inversion_2, 0);
    console.log('✓ Caso 1 superado exitosamente ($5,000.00).');
}

// CASO 2: Dos tramos sin excedente ($20,000 en NU: $0-$25,000 @ 13%, >$25,000 @ 6.5%, 1 mes)
{
    const tramosNU = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: null, tasa_anual: 6.5 }
    ];
    const res = MotorFinanciero.simularInversion(20000, 1, tramosNU);
    console.log('\n[Caso 2: Dos tramos sin excedente]');
    console.log('Inv Base:', res.inversion_base);
    console.log('Inv 2:', res.inversion_2);
    console.log('Rend mensual:', res.total_mensual.toFixed(2));

    assert.strictEqual(res.inversion_base, 20000);
    assert.strictEqual(res.inversion_2, 0);
    assert.strictEqual(res.total_mensual.toFixed(2), '216.67');
    console.log('✓ Caso 2 superado exitosamente ($216.67).');
}

// CASO 3: Dos tramos con excedente ($40,000 en NU: $25k @ 13%, $15k @ 6.5%, 1 mes)
{
    const tramosNU = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
        { numero_tramo: 2, limite_inferior: 25000, limite_superior: null, tasa_anual: 6.5 }
    ];
    const res = MotorFinanciero.simularInversion(40000, 1, tramosNU);
    console.log('\n[Caso 3: Dos tramos con excedente]');
    console.log('Inv Base:', res.inversion_base);
    console.log('Inv 2:', res.inversion_2);
    console.log('Rend1:', res.rend1.toFixed(2));
    console.log('Rend2:', res.rend2.toFixed(2));
    console.log('Total mensual:', res.total_mensual.toFixed(2));

    assert.strictEqual(res.inversion_base, 25000);
    assert.strictEqual(res.inversion_2, 15000);
    assert.strictEqual(res.rend1.toFixed(2), '270.83');
    assert.strictEqual(res.rend2.toFixed(2), '81.25');
    assert.strictEqual(res.total_mensual.toFixed(2), '352.08');
    console.log('✓ Caso 3 superado exitosamente (Rend1=$270.83, Rend2=$81.25, Total=$352.08).');
}

// CASO 4: Tres tramos (Openbank: $30k @ 13%, $70k @ 7%, >$100k @ 6.5%, inversión $120,000 a 6 meses)
{
    const tramosOpenbank = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 30000, tasa_anual: 13.0 },
        { numero_tramo: 2, limite_inferior: 30000, limite_superior: 100000, tasa_anual: 7.0 },
        { numero_tramo: 3, limite_inferior: 100000, limite_superior: null, tasa_anual: 6.5 }
    ];
    const res = MotorFinanciero.simularInversion(120000, 6, tramosOpenbank);
    console.log('\n[Caso 4: Tres tramos Openbank $120,000 a 6 meses]');
    console.log('Tramo 1 en inversión:', res.tramos[0].monto_en_tramo, '@', res.tramos[0].tasa_anual, '%');
    console.log('Tramo 2 en inversión:', res.tramos[1].monto_en_tramo, '@', res.tramos[1].tasa_anual, '%');
    console.log('Tramo 3 en inversión:', res.tramos[2].monto_en_tramo, '@', res.tramos[2].tasa_anual, '%');
    console.log('Total mensual:', res.total_mensual.toFixed(2));
    console.log('Total periodo (6 meses):', res.total_periodo.toFixed(2));

    assert.strictEqual(res.tramos[0].monto_en_tramo, 30000);
    assert.strictEqual(res.tramos[1].monto_en_tramo, 70000);
    assert.strictEqual(res.tramos[2].monto_en_tramo, 20000);
    assert.strictEqual(res.total_mensual.toFixed(2), '841.67');
    assert.strictEqual(res.total_periodo.toFixed(2), '5050.00');
    console.log('✓ Caso 4 superado exitosamente (Total mensual=$841.67, Total 6 meses=$5,050.00).');
}

// CASO 5: Tramo con tasa 0% (Uala $80,000 -> $50k @ 14%, $30k @ 0%)
{
    const tramosUala = [
        { numero_tramo: 1, limite_inferior: 0, limite_superior: 50000, tasa_anual: 14.0 },
        { numero_tramo: 2, limite_inferior: 50000, limite_superior: null, tasa_anual: 0.0 }
    ];
    const res = MotorFinanciero.simularInversion(80000, 1, tramosUala);
    console.log('\n[Caso 5: Tramo con tasa 0%]');
    console.log('Tramo 1 en inversión:', res.tramos[0].monto_en_tramo, 'Rend:', res.tramos[0].rendimiento_mensual.toFixed(2));
    console.log('Tramo 2 en inversión:', res.tramos[1].monto_en_tramo, 'Rend:', res.tramos[1].rendimiento_mensual.toFixed(2));
    console.log('Total mensual:', res.total_mensual.toFixed(2));

    assert.strictEqual(res.tramos[0].monto_en_tramo, 50000);
    assert.strictEqual(res.tramos[1].monto_en_tramo, 30000);
    assert.strictEqual(res.tramos[1].rendimiento_mensual, 0);
    assert.strictEqual(res.total_mensual.toFixed(2), '583.33');
    console.log('✓ Caso 5 superado exitosamente (Tramo 0% genera exactamente $0.00).');
}

// Validación de tramos
{
    const tramosInvalidos1 = [
        { limite_inferior: 100, limite_superior: 500, tasa_anual: 10 }
    ];
    const v1 = MotorFinanciero.validarTramos(tramosInvalidos1);
    assert.strictEqual(v1.valido, false);

    const tramosInvalidos2 = [
        { limite_inferior: 0, limite_superior: 500, tasa_anual: 10 },
        { limite_inferior: 600, limite_superior: null, tasa_anual: 8 }
    ];
    const v2 = MotorFinanciero.validarTramos(tramosInvalidos2);
    assert.strictEqual(v2.valido, false);

    const tramosValidos = [
        { limite_inferior: 0, limite_superior: 500, tasa_anual: 10 },
        { limite_inferior: 500, limite_superior: null, tasa_anual: 8 }
    ];
    const v3 = MotorFinanciero.validarTramos(tramosValidos);
    assert.strictEqual(v3.valido, true);
    console.log('✓ Validaciones de tramos probadas exitosamente.');
}

console.log('\n>>> TODOS LOS CASOS MATEMÁTICOS DEL MOTOR FINANCIERO PASARON CON ÉXITO <<<\n');
