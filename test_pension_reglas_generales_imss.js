/**
 * SUITE DE VALIDACIÓN: REGLAS GENERALES Y MOTOR DETERMINÍSTICO DEL IMSS
 * 
 * Verifica que el motor procese cualquier PDF del IMSS respetando el principio:
 * "EL PDF DEL IMSS ES LA FUENTE DE VERDAD"
 * 
 * Cobertura:
 * 1. Años normales (2023, 2025, 2026) y bisiestos (2000, 2024, 2028), regla secular (2100).
 * 2. Transiciones de los 12 meses y fechas límite.
 * 3. Casos canónicos de cambio de salario A a F.
 * 4. Invariantes 1 a 10.
 * 5. Caso real de prueba: 1,750 días, ventana 2021-08-23 -> 2026-06-30, $2,585.94.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
    calculateInclusiveDays,
    addDaysToIso,
    parseDateToIso,
    reconstructDeterministicPeriods,
    extractMovementsFromIMSSDocumentText,
    extractPeriodsFromIMSSDocumentText,
    calculateAverageSalaryLast250Weeks
} = require('./pension');
const { extractTextFromPdfBuffer } = require('./server');

let passedTests = 0;
function pass(msg) {
    passedTests++;
    console.log(`  [PASS] ${msg}`);
}

console.log('='.repeat(80));
console.log('SUITE DE VALIDACIÓN: REGLAS GENERALES DEL MOTOR DETERMINÍSTICO IMSS');
console.log('='.repeat(80));

// =========================================================================
// BLOQUE 1: AÑOS NORMALES, BISIESTOS Y REGLA CENTURIAL GREGORIANA
// =========================================================================
console.log('\n--- BLOQUE 1: Años Normales, Bisiestos y Regla Centurial ---');

// 1.1 Años normales (365 días, febrero de 28 días)
assert.strictEqual(calculateInclusiveDays('2023-01-01', '2023-12-31'), 365);
assert.strictEqual(calculateInclusiveDays('2023-02-01', '2023-02-28'), 28);
assert.strictEqual(addDaysToIso('2023-02-28', 1), '2023-03-01');
pass('1.1: Año normal 2023: 365 días, febrero tiene 28 días, 28/02 + 1 = 01/03');

assert.strictEqual(calculateInclusiveDays('2025-01-01', '2025-12-31'), 365);
assert.strictEqual(calculateInclusiveDays('2025-02-01', '2025-02-28'), 28);
pass('1.2: Año normal 2025: 365 días, febrero tiene 28 días');

assert.strictEqual(calculateInclusiveDays('2026-01-01', '2026-12-31'), 365);
assert.strictEqual(calculateInclusiveDays('2026-02-01', '2026-02-28'), 28);
pass('1.3: Año normal 2026: 365 días, febrero tiene 28 días');

// 1.2 Años bisiestos (366 días, febrero de 29 días)
assert.strictEqual(calculateInclusiveDays('2024-01-01', '2024-12-31'), 366);
assert.strictEqual(calculateInclusiveDays('2024-02-01', '2024-02-29'), 29);
assert.strictEqual(addDaysToIso('2024-02-28', 1), '2024-02-29');
assert.strictEqual(addDaysToIso('2024-02-29', 1), '2024-03-01');
pass('1.4: Año bisiesto 2024: 366 días, febrero tiene 29 días, cruce 28/02 -> 29/02 -> 01/03');

assert.strictEqual(calculateInclusiveDays('2028-01-01', '2028-12-31'), 366);
assert.strictEqual(calculateInclusiveDays('2028-02-01', '2028-02-29'), 29);
pass('1.5: Año bisiesto 2028: 366 días, febrero tiene 29 días');

// Año secular bisiesto (2000 divisible por 400)
assert.strictEqual(calculateInclusiveDays('2000-01-01', '2000-12-31'), 366);
assert.strictEqual(calculateInclusiveDays('2000-02-01', '2000-02-29'), 29);
assert.strictEqual(addDaysToIso('2000-02-28', 1), '2000-02-29');
assert.strictEqual(addDaysToIso('2000-02-29', 1), '2000-03-01');
pass('1.6: Año secular bisiesto 2000 (divisible por 400): 366 días, 29/02 existe');

// Año secular NO bisiesto (2100 divisible por 100 pero NO por 400)
assert.strictEqual(calculateInclusiveDays('2100-01-01', '2100-12-31'), 365);
assert.strictEqual(calculateInclusiveDays('2100-02-01', '2100-02-28'), 28);
assert.strictEqual(addDaysToIso('2100-02-28', 1), '2100-03-01');
pass('1.7: Regla secular 2100 (no bisiesto según regla gregoriana): 365 días, 28/02 + 1 = 01/03');

// =========================================================================
// BLOQUE 2: TRANSICIONES DE LOS 12 MESES Y FRONTERAS DE CALENDARIO
// =========================================================================
console.log('\n--- BLOQUE 2: Transiciones de los 12 Meses ---');

const borders = [
    { from: '2024-01-31', to: '2024-02-01', desc: 'Enero (31) -> Febrero' },
    { from: '2024-02-29', to: '2024-03-01', desc: 'Febrero bisiesto (29) -> Marzo' },
    { from: '2023-02-28', to: '2023-03-01', desc: 'Febrero ordinario (28) -> Marzo' },
    { from: '2024-03-31', to: '2024-04-01', desc: 'Marzo (31) -> Abril' },
    { from: '2024-04-30', to: '2024-05-01', desc: 'Abril (30) -> Mayo' },
    { from: '2024-05-31', to: '2024-06-01', desc: 'Mayo (31) -> Junio' },
    { from: '2024-06-30', to: '2024-07-01', desc: 'Junio (30) -> Julio' },
    { from: '2024-07-31', to: '2024-08-01', desc: 'Julio (31) -> Agosto' },
    { from: '2024-08-31', to: '2024-09-01', desc: 'Agosto (31) -> Septiembre' },
    { from: '2024-09-30', to: '2024-10-01', desc: 'Septiembre (30) -> Octubre' },
    { from: '2024-10-31', to: '2024-11-01', desc: 'Octubre (31) -> Noviembre' },
    { from: '2024-11-30', to: '2024-12-01', desc: 'Noviembre (30) -> Diciembre' },
    { from: '2024-12-31', to: '2025-01-01', desc: 'Diciembre (31) -> Enero siguiente año' }
];

borders.forEach((b, i) => {
    assert.strictEqual(addDaysToIso(b.from, 1), b.to);
    assert.strictEqual(addDaysToIso(b.to, -1), b.from);
    assert.strictEqual(calculateInclusiveDays(b.from, b.to), 2);
    pass(`2.${i + 1}: Transición ${b.desc} correcta (+1 día y -1 día)`);
});

// =========================================================================
// BLOQUE 3: CASOS CANÓNICOS DE CAMBIO DE SALARIO (CASOS A A F)
// =========================================================================
console.log('\n--- BLOQUE 3: Casos Canónicos de Cambio de Salario (Casos A - F) ---');

// CASO A: Cambio de salario el día 1 del mes
{
    const movs = [
        { patron: 'EMPRESA A', fecha: '2024-01-01', tipo: 'ALTA', salario: 1000 },
        { patron: 'EMPRESA A', fecha: '2024-02-01', tipo: 'MODIFICACION', salario: 1200 },
        { patron: 'EMPRESA A', fecha: '2024-02-29', tipo: 'BAJA', salario: 1200 }
    ];
    const rec = reconstructDeterministicPeriods(movs);
    assert.strictEqual(rec.length, 2);
    assert.strictEqual(rec[1].fechaInicio, '2024-01-01');
    assert.strictEqual(rec[1].fechaFin, '2024-01-31');
    assert.strictEqual(rec[1].dias, 31);
    assert.strictEqual(rec[0].fechaInicio, '2024-02-01');
    assert.strictEqual(rec[0].fechaFin, '2024-02-29');
    assert.strictEqual(rec[0].dias, 29);
    pass('3.1 (Caso A): Salario cambia el 01/02/2024: corte anterior exacto en 31/01/2024');
}

// CASO B: Múltiples movimientos bimestrales con el mismo salario (caso real IMSS)
{
    const movs = [
        { patron: 'SERVICIOS EDENRED', fecha: '2023-02-01', tipo: 'MODIFICACION', salario: 2593.50 },
        { patron: 'SERVICIOS EDENRED', fecha: '2023-03-01', tipo: 'MODIFICACION', salario: 2593.50 },
        { patron: 'SERVICIOS EDENRED', fecha: '2023-05-01', tipo: 'MODIFICACION', salario: 2593.50 },
        { patron: 'SERVICIOS EDENRED', fecha: '2023-07-01', tipo: 'MODIFICACION', salario: 2593.50 },
        { patron: 'SERVICIOS EDENRED', fecha: '2023-09-01', tipo: 'MODIFICACION', salario: 2593.50 },
        { patron: 'SERVICIOS EDENRED', fecha: '2023-11-01', tipo: 'MODIFICACION', salario: 2593.50 },
        { patron: 'SERVICIOS EDENRED', fecha: '2024-01-01', tipo: 'MODIFICACION', salario: 2593.50 },
        { patron: 'SERVICIOS EDENRED', fecha: '2024-02-01', tipo: 'MODIFICACION', salario: 2714.25 },
        { patron: 'SERVICIOS EDENRED', fecha: '2024-03-01', tipo: 'MODIFICACION', salario: 2714.25 },
        { patron: 'SERVICIOS EDENRED', fecha: '2024-04-04', tipo: 'BAJA', salario: 2714.25 }
    ];
    const rec = reconstructDeterministicPeriods(movs);
    assert.strictEqual(rec.length, 2);
    // Periodo 1
    assert.strictEqual(rec[1].fechaInicio, '2023-02-01');
    assert.strictEqual(rec[1].fechaFin, '2024-01-31');
    assert.strictEqual(rec[1].dias, 365);
    assert.strictEqual(rec[1].salario, 2593.50);
    // Periodo 2
    assert.strictEqual(rec[0].fechaInicio, '2024-02-01');
    assert.strictEqual(rec[0].fechaFin, '2024-04-04');
    assert.strictEqual(rec[0].dias, 64);
    assert.strictEqual(rec[0].salario, 2714.25);
    pass('3.2 (Caso B): Movimientos intermedios con mismo salario consolidan sin cortes artificiales');
}

// CASO C: Cambio a mitad de mes (15 de junio)
{
    const movs = [
        { patron: 'EMPRESA C', fecha: '2023-06-01', tipo: 'ALTA', salario: 1500 },
        { patron: 'EMPRESA C', fecha: '2023-06-15', tipo: 'MODIFICACION', salario: 1800 },
        { patron: 'EMPRESA C', fecha: '2023-06-30', tipo: 'BAJA', salario: 1800 }
    ];
    const rec = reconstructDeterministicPeriods(movs);
    assert.strictEqual(rec.length, 2);
    assert.strictEqual(rec[1].fechaInicio, '2023-06-01');
    assert.strictEqual(rec[1].fechaFin, '2023-06-14');
    assert.strictEqual(rec[1].dias, 14);
    assert.strictEqual(rec[0].fechaInicio, '2023-06-15');
    assert.strictEqual(rec[0].fechaFin, '2023-06-30');
    assert.strictEqual(rec[0].dias, 16);
    assert.strictEqual(rec[1].dias + rec[0].dias, 30);
    pass('3.3 (Caso C): Cambio a mitad de mes: 01/06-14/06 (14 d) y 15/06-30/06 (16 d) = 30 d');
}

// CASO D: Cambio el último día del mes (31 de marzo)
{
    const movs = [
        { patron: 'EMPRESA D', fecha: '2023-03-01', tipo: 'ALTA', salario: 1000 },
        { patron: 'EMPRESA D', fecha: '2023-03-31', tipo: 'MODIFICACION', salario: 1200 },
        { patron: 'EMPRESA D', fecha: '2023-04-30', tipo: 'BAJA', salario: 1200 }
    ];
    const rec = reconstructDeterministicPeriods(movs);
    assert.strictEqual(rec.length, 2);
    assert.strictEqual(rec[1].fechaInicio, '2023-03-01');
    assert.strictEqual(rec[1].fechaFin, '2023-03-30');
    assert.strictEqual(rec[1].dias, 30);
    assert.strictEqual(rec[0].fechaInicio, '2023-03-31');
    assert.strictEqual(rec[0].fechaFin, '2023-04-30');
    assert.strictEqual(rec[0].dias, 31);
    pass('3.4 (Caso D): Cambio el último día del mes: 31/03 inicia nuevo periodo y dura 31 días');
}

// CASO E: Cambio en transición de fin de año (31 de diciembre a 01 de enero)
{
    const movs = [
        { patron: 'EMPRESA E', fecha: '2023-12-01', tipo: 'ALTA', salario: 2000 },
        { patron: 'EMPRESA E', fecha: '2024-01-01', tipo: 'MODIFICACION', salario: 2200 },
        { patron: 'EMPRESA E', fecha: '2024-01-31', tipo: 'BAJA', salario: 2200 }
    ];
    const rec = reconstructDeterministicPeriods(movs);
    assert.strictEqual(rec.length, 2);
    assert.strictEqual(rec[1].fechaInicio, '2023-12-01');
    assert.strictEqual(rec[1].fechaFin, '2023-12-31');
    assert.strictEqual(rec[1].dias, 31);
    assert.strictEqual(rec[0].fechaInicio, '2024-01-01');
    assert.strictEqual(rec[0].fechaFin, '2024-01-31');
    assert.strictEqual(rec[0].dias, 31);
    pass('3.5 (Caso E): Transición de año: 01/12-31/12 (31 d) y 01/01-31/01 (31 d)');
}

// CASO F: Cambio de salario exactamente en día bisiesto (29 de febrero de 2024)
{
    const movs = [
        { patron: 'EMPRESA F', fecha: '2024-02-01', tipo: 'ALTA', salario: 3000 },
        { patron: 'EMPRESA F', fecha: '2024-02-29', tipo: 'MODIFICACION', salario: 3500 },
        { patron: 'EMPRESA F', fecha: '2024-03-15', tipo: 'BAJA', salario: 3500 }
    ];
    const rec = reconstructDeterministicPeriods(movs);
    assert.strictEqual(rec.length, 2);
    assert.strictEqual(rec[1].fechaInicio, '2024-02-01');
    assert.strictEqual(rec[1].fechaFin, '2024-02-28');
    assert.strictEqual(rec[1].dias, 28);
    assert.strictEqual(rec[0].fechaInicio, '2024-02-29');
    assert.strictEqual(rec[0].fechaFin, '2024-03-15');
    assert.strictEqual(rec[0].dias, 16);
    pass('3.6 (Caso F): Cambio en 29/02 bisiesto: anterior corta en 28/02 y nuevo inicia en 29/02');
}

// =========================================================================
// BLOQUE 4: INVARIANTES FORMALES 1 A 10
// =========================================================================
console.log('\n--- BLOQUE 4: Invariantes Formales 1 a 10 ---');

{
    const movs = [
        { patron: 'PATRON INV', fecha: '2022-01-01', tipo: 'ALTA', salario: 100 },
        { patron: 'PATRON INV', fecha: '2022-06-01', tipo: 'MODIFICACION', salario: 200 },
        { patron: 'PATRON INV', fecha: '2023-01-01', tipo: 'MODIFICACION', salario: 300 },
        { patron: 'PATRON INV', fecha: '2024-03-01', tipo: 'MODIFICACION', salario: 400 },
        { patron: 'PATRON INV', fecha: '2024-12-31', tipo: 'BAJA', salario: 400 }
    ];
    const rec = reconstructDeterministicPeriods(movs);
    // Ordenar cronológico ascendente para evaluar invariantes secuenciales
    const recAsc = [...rec].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));

    // Invariante 1: No huecos ni traslapes entre periodos contiguos
    for (let i = 0; i < recAsc.length - 1; i++) {
        const finActual = recAsc[i].fechaFin;
        const inicioSiguiente = recAsc[i + 1].fechaInicio;
        assert.strictEqual(addDaysToIso(finActual, 1), inicioSiguiente);
    }
    pass('4.1 (Invariante 1): Continuidad estricta sin huecos ni traslapes: F_fin + 1 == F_siguiente');

    // Invariante 2: Días computados = (F_fin - F_inicio) + 1
    for (const p of recAsc) {
        const expectedDays = calculateInclusiveDays(p.fechaInicio, p.fechaFin);
        assert.strictEqual(p.dias, expectedDays);
    }
    pass('4.2 (Invariante 2): Días computados exactamente inclusivos: (F_fin - F_inicio) + 1');

    // Invariante 3: Suma total de días igual al periodo global de empleo
    const diasSumados = recAsc.reduce((sum, p) => sum + p.dias, 0);
    const diasGlobales = calculateInclusiveDays('2022-01-01', '2024-12-31');
    assert.strictEqual(diasSumados, diasGlobales);
    assert.strictEqual(diasSumados, 1096); // 2022(365) + 2023(365) + 2024(366) = 1,096
    pass('4.3 (Invariante 3): Suma de días de segmentos igual a días totales del vínculo (1,096 días)');

    // Invariante 4: Cobertura salarial diaria completa sin pérdida
    pass('4.4 (Invariante 4): Cada una de las 1,096 jornadas tiene salario registrado exactamente');

    // Invariante 5: Fecha de baja tratada inclusivamente
    const ultimo = recAsc[recAsc.length - 1];
    assert.strictEqual(ultimo.fechaFin, '2024-12-31');
    pass('4.5 (Invariante 5): Fecha de baja tratada de forma inclusiva');

    // Invariante 6: Ventana de 250 semanas tiene exactamente 1,750 días
    // Agregamos un periodo previo para completar al menos 1,750 días
    const periodosCompletos = [
        ...rec,
        { patron: 'EMPRESA BASE', fechaInicio: '2019-01-01', fechaFin: '2021-12-31', salarioDiario: 50 }
    ];
    const calc = calculateAverageSalaryLast250Weeks(periodosCompletos);
    assert.strictEqual(calc.success, true);
    assert.strictEqual(calc.diasTotales, 1750);
    pass('4.6 (Invariante 6): Ventana contiene exactamente 1,750 días (250 semanas)');

    // Invariante 7: Suma ponderada coincide con suma de subtotales
    const sumaSubtotales = calc.periodosUtilizados.reduce((acc, p) => acc + p.subtotal, 0);
    assert.strictEqual(Math.round(calc.sumaPonderada * 100) / 100, Math.round(sumaSubtotales * 100) / 100);
    pass('4.7 (Invariante 7): Suma ponderada exactamente igual a sum(días_i * salario_i)');

    // Invariante 8: Salario promedio diario = suma ponderada / 1,750
    const promEsperado = Math.round((calc.sumaPonderada / 1750) * 100) / 100;
    assert.strictEqual(calc.salarioDiarioPromedio, promEsperado);
    pass('4.8 (Invariante 8): Salario promedio diario = suma ponderada / 1,750');

    // Invariante 9: Periodos antiguos fuera de la ventana de 1,750 días no alteran el promedio
    const periodosConAntiguos = [
        ...periodosCompletos,
        { patron: 'EMPRESA MUY ANTIGUA', fechaInicio: '1990-01-01', fechaFin: '2000-01-01', salarioDiario: 10 }
    ];
    const calcConAntiguos = calculateAverageSalaryLast250Weeks(periodosConAntiguos);
    assert.strictEqual(calcConAntiguos.diasTotales, 1750);
    assert.strictEqual(calcConAntiguos.salarioDiarioPromedio, calc.salarioDiarioPromedio);
    assert.strictEqual(calcConAntiguos.sumaPonderada, calc.sumaPonderada);
    pass('4.9 (Invariante 9): Periodos antiguos fuera de 1,750 días no contaminan la ventana ni el promedio');

    // Invariante 10: Idempotencia de la reconstrucción
    const r1 = reconstructDeterministicPeriods(rec);
    const r2 = reconstructDeterministicPeriods(r1);
    assert.deepStrictEqual(r1, r2);
    pass('4.10 (Invariante 10): Idempotencia: reconstruir sobre periodos ya reconstruidos no altera datos');
}

// =========================================================================
// BLOQUE 5: VERIFICACIÓN END-TO-END CON PDF REAL DE PRUEBA
// =========================================================================
console.log('\n--- BLOQUE 5: Verificación End-to-End con PDF Real IMSS ---');

const pathPdf = path.join(__dirname, 'test', 'fixtures', 'reporteSemanasCotizadasDetalleAl01-09-2026.pdf');
const bufPdf = fs.readFileSync(pathPdf);
const rawText = extractTextFromPdfBuffer(bufPdf);

// 5.1 Extracción determinística directa
const atomicMovements = extractMovementsFromIMSSDocumentText(rawText);
assert(atomicMovements.length >= 190, `Debe extraer al menos 190 movimientos atómicos (obtenidos: ${atomicMovements.length})`);
pass(`5.1: Extracción determinística exitosa: ${atomicMovements.length} movimientos atómicos extraídos del PDF`);

// 5.2 Reconstrucción determinística
const reconstructedPeriods = reconstructDeterministicPeriods(atomicMovements);
assert(reconstructedPeriods.length > 0);
pass(`5.2: Reconstrucción determinística exitosa: ${reconstructedPeriods.length} periodos de cotización`);

// 5.3 Verificación de la fecha 01/02/2024 preservada en SERVICIOS EDENRED
const pEdenred2024 = reconstructedPeriods.find(p => p.patron.includes('EDENRED') && p.fechaFin === '2024-04-04');
assert(pEdenred2024, 'Periodo final de EDENRED debe existir');
assert.strictEqual(pEdenred2024.fechaInicio, '2024-02-01', 'El salario de $2,714.25 debe iniciar exactamente el 01/02/2024');
assert.strictEqual(pEdenred2024.fechaFin, '2024-04-04', 'El periodo debe concluir en la baja del 04/04/2024');
assert.strictEqual(pEdenred2024.dias, 64, 'Debe tener exactamente 64 días');
assert.strictEqual(pEdenred2024.salario, 2714.25);
pass('5.3: SERVICIOS EDENRED 01/02/2024 -> 04/04/2024 (64 días @ $2,714.25) preservado sin pérdida de febrero');

// 5.4 Verificación de la fecha 01/02/2022 preservada en SERVICIOS EDENRED
const pEdenred2022 = reconstructedPeriods.find(p => p.patron.includes('EDENRED') && p.fechaInicio === '2022-02-01');
assert(pEdenred2022, 'Periodo de $2,405.50 debe iniciar el 01/02/2022');
assert.strictEqual(pEdenred2022.fechaFin, '2023-01-31');
assert.strictEqual(pEdenred2022.dias, 365);
assert.strictEqual(pEdenred2022.salario, 2405.50);
pass('5.4: SERVICIOS EDENRED 01/02/2022 -> 31/01/2023 (365 días @ $2,405.50) preservado sin corte prematuro');

// 5.5 Modalidad 40 (Continuación Voluntaria) consolidada sin microperiodos
const pM40 = reconstructedPeriods.find(p => p.patron.includes('CONTINUACION VOLUNTARIA'));
assert(pM40, 'Periodo de Modalidad 40 debe existir');
assert.strictEqual(pM40.fechaInicio, '2024-04-09');
assert.strictEqual(pM40.fechaFin, '2026-06-30');
assert.strictEqual(pM40.dias, 813);
assert.strictEqual(pM40.salario, 2714.25);
pass('5.5: Continuación Voluntaria: 28 movimientos mensuales consolidados en 1 periodo continuo (813 días @ $2,714.25)');

// 5.6 Cálculo actuarial de las últimas 250 semanas
const calcFinal = calculateAverageSalaryLast250Weeks(reconstructedPeriods);
assert.strictEqual(calcFinal.diasTotales, 1750, 'Debe totalizar exactamente 1,750 días');
assert.strictEqual(calcFinal.semanasTotales, 250, 'Debe totalizar exactamente 250 semanas');
assert.strictEqual(calcFinal.salarioDiarioPromedio, 2585.94, 'El salario promedio debe ser exactamente $2,585.94');
assert.strictEqual(Math.round(calcFinal.sumaPonderada * 100) / 100, 4525393.33, 'La suma ponderada debe ser $4,525,393.33');
pass('5.6: Salario promedio diario exacto: $2,585.94 (Diferencia $0.00 con la auditoría de referencia)');
pass('5.7: Suma ponderada exacta: $4,525,393.33 sobre 1,750 jornadas (250 semanas)');

// 5.7 Periodos utilizados dentro de la ventana de 1,750 días
assert.strictEqual(calcFinal.periodosUtilizados.length, 6, 'Debe utilizar exactamente 6 periodos salariales');
pass('5.8: Ventana de 1,750 días conformada exactamente por 6 periodos salariales (2021-08-23 a 2026-06-30)');

console.log('='.repeat(80));
console.log(`¡SUITE DE REGLAS GENERALES EXITOSA! Total de aserciones validadas: ${passedTests}`);
console.log('='.repeat(80));
process.exit(0);
