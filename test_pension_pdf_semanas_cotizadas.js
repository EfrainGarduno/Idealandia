process.env.AUTH_SECRET = 'test_secret_for_pdf_pension_tests';
process.env.PORT = '0'; // Ephemeral port

const assert = require('assert');
const request = require('supertest');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const {
    calculateIMSSLey73Pension,
    calculateAverageSalaryLast250Weeks,
    validateAndCalculatePensionPeriods
} = require('./pension.js');

const { app } = require('./server.js');

async function runTests() {
    console.log('=== Iniciando pruebas: Algoritmo de 1,750 días calendario y traslapes IMSS ===\n');

    // -------------------------------------------------------------
    // PRUEBA 1: Periodos sin traslape
    // -------------------------------------------------------------
    console.log('1. Periodos sin traslape...');
    const periodosSinTraslape = [
        { patron: 'Patrón A', fechaInicio: '2023-01-01', fechaFin: '2023-12-31', salarioDiario: 2000.00 }, // 365d
        { patron: 'Patrón B', fechaInicio: '2022-01-01', fechaFin: '2022-12-31', salarioDiario: 1500.00 }, // 365d
        { patron: 'Patrón C', fechaInicio: '2021-01-01', fechaFin: '2021-12-31', salarioDiario: 1200.00 }, // 365d
        { patron: 'Patrón D', fechaInicio: '2020-01-01', fechaFin: '2020-12-31', salarioDiario: 1000.00 }, // 366d (bisiesto)
        { patron: 'Patrón E', fechaInicio: '2019-01-01', fechaFin: '2019-12-31', salarioDiario: 800.00 }   // 365d (se usan 289d)
    ];
    // 365*2000 + 365*1500 + 365*1200 + 366*1000 + 289*800 = 2,312,700 / 1750 = 1321.5428... -> 1321.54
    const resSinTraslape = calculateAverageSalaryLast250Weeks(periodosSinTraslape);
    assert.strictEqual(resSinTraslape.success, true);
    assert.strictEqual(resSinTraslape.diasTotales, 1750);
    assert.strictEqual(resSinTraslape.salarioDiarioPromedio, 1321.54);
    assert.strictEqual(resSinTraslape.periodos.length, 5);
    assert.strictEqual(resSinTraslape.periodos[0].traslapado, false);
    console.log('   OK - Periodos sin traslape calculados correctamente (1,750 días exactos, $1,321.54).');

    // -------------------------------------------------------------
    // PRUEBA 2: Periodos con traslape y mismo SBC
    // -------------------------------------------------------------
    console.log('2. Periodos con traslape y mismo SBC...');
    // Periodo base de 1800 días (2019-01-01 a 2023-12-05) a $1,000.00
    // Periodo traslapado de 30 días (2023-11-01 a 2023-11-30) con mismo SBC $1,000.00
    const periodosMismoSBC = [
        { patron: 'Empresa Principal', fechaInicio: '2019-01-01', fechaFin: '2023-12-05', salarioDiario: 1000.00 },
        { patron: 'Empresa Secundaria', fechaInicio: '2023-11-01', fechaFin: '2023-11-30', salarioDiario: 1000.00 }
    ];
    const resMismoSBC = calculateAverageSalaryLast250Weeks(periodosMismoSBC);
    assert.strictEqual(resMismoSBC.success, true);
    assert.strictEqual(resMismoSBC.diasTotales, 1750);
    // Los 30 días traslapados no deben duplicarse:
    assert.strictEqual(resMismoSBC.salarioDiarioPromedio, 1000.00);
    // Verificar que el segmento traslapado fue identificado:
    const segTraslapado = resMismoSBC.periodos.find(s => s.traslapado);
    assert(segTraslapado, 'Debe existir un segmento marcado con traslape');
    assert.strictEqual(segTraslapado.dias, 30);
    assert.strictEqual(segTraslapado.salarioDiario, 1000.00);
    assert.strictEqual(segTraslapado.registrosParticipantes.length, 2);
    console.log('   OK - Traslape con mismo SBC deduplicado (los 30 días cuentan solo 1 vez).');

    // -------------------------------------------------------------
    // PRUEBA 3: Periodos con traslape y SBC diferentes (Regla MAX_PROVISIONAL)
    // -------------------------------------------------------------
    console.log('3. Periodos con traslape y SBC diferentes (regla MAX_PROVISIONAL)...');
    // Periodo base de 1800 días a $1,000.00
    // Periodo traslapado de 30 días (2023-11-01 a 2023-11-30) a $1,500.00
    // 30 días a $1,500 + 1720 días a $1,000 = 45,000 + 1,720,000 = 1,765,000 / 1750 = 1008.57
    const periodosSBCDif = [
        { patron: 'Empresa Base', fechaInicio: '2019-01-01', fechaFin: '2023-12-05', salarioDiario: 1000.00 },
        { patron: 'Empresa Mayor', fechaInicio: '2023-11-01', fechaFin: '2023-11-30', salarioDiario: 1500.00 }
    ];
    const resSBCDif = calculateAverageSalaryLast250Weeks(periodosSBCDif);
    assert.strictEqual(resSBCDif.success, true);
    assert.strictEqual(resSBCDif.diasTotales, 1750);
    assert.strictEqual(resSBCDif.salarioDiarioPromedio, 1008.57);
    assert.strictEqual(resSBCDif.reglaTraslape, 'MAX_PROVISIONAL');
    const segMax = resSBCDif.periodos.find(s => s.traslapado);
    assert.strictEqual(segMax.salarioDiario, 1500.00, 'Debe usar el salario diario máximo de los concurrentes');
    console.log('   OK - Traslape con SBC diferentes aplica MAX_PROVISIONAL correctamente ($1,008.57).');

    // -------------------------------------------------------------
    // PRUEBA 4: Exactamente 1,750 días
    // -------------------------------------------------------------
    console.log('4. Exactamente 1,750 días cotizados...');
    // 2019-01-01 a 2023-10-16 = exactamente 1750 días
    const periodosExactos = [
        { patron: 'Empresa Justa', fechaInicio: '2019-01-01', fechaFin: '2023-10-16', salarioDiario: 500.00 }
    ];
    const resExactos = calculateAverageSalaryLast250Weeks(periodosExactos);
    assert.strictEqual(resExactos.success, true);
    assert.strictEqual(resExactos.diasTotales, 1750);
    assert.strictEqual(resExactos.totalDiasDocumento, 1750);
    assert.strictEqual(resExactos.salarioDiarioPromedio, 500.00);
    assert.strictEqual(resExactos.periodos[0].parcial, false);
    console.log('   OK - Documento con exactamente 1,750 días procesado sin corte parcial.');

    // -------------------------------------------------------------
    // PRUEBA 5: Menos de 1,750 días (DAYS_SUM_MISMATCH)
    // -------------------------------------------------------------
    console.log('5. Días insuficientes (menos de 1,750 días)...');
    const periodosCortos = [
        { patron: 'Empresa Breve', fechaInicio: '2023-01-01', fechaFin: '2023-06-30', salarioDiario: 500.00 } // 181 días
    ];
    const resCortos = calculateAverageSalaryLast250Weeks(periodosCortos);
    assert.strictEqual(resCortos.success, false);
    assert.strictEqual(resCortos.error, 'DAYS_SUM_MISMATCH');
    assert.strictEqual(resCortos.sumaDias, 181);
    console.log('   OK - Días insuficientes rechazados con DAYS_SUM_MISMATCH.');

    // -------------------------------------------------------------
    // PRUEBA 6: Salario inválido
    // -------------------------------------------------------------
    console.log('6. Validación de salario inválido...');
    const periodosSalInvalido = [
        { patron: 'Empresa Sin Sueldo', fechaInicio: '2020-01-01', fechaFin: '2024-12-31', salarioDiario: -50.00 }
    ];
    const resSalInvalido = calculateAverageSalaryLast250Weeks(periodosSalInvalido);
    assert.strictEqual(resSalInvalido.success, false);
    assert.strictEqual(resSalInvalido.error, 'INVALID_SALARY');
    console.log('   OK - Salario menor o igual a cero rechazado con INVALID_SALARY.');

    // -------------------------------------------------------------
    // PRUEBA 7: Corte parcial del periodo más antiguo
    // -------------------------------------------------------------
    console.log('7. Corte parcial del periodo más antiguo...');
    assert.strictEqual(resSinTraslape.periodos[4].parcial, true);
    assert.strictEqual(resSinTraslape.periodos[4].diasUtilizados, 289);
    assert.strictEqual(resSinTraslape.periodos[0].parcial, false);
    console.log('   OK - Periodo más antiguo marcado como parcial (289 de 365 días utilizados).');

    // -------------------------------------------------------------
    // PRUEBA 8: Rechazo de documentos inválidos en endpoint
    // -------------------------------------------------------------
    console.log('8. Rechazo de documentos inválidos en endpoint...');
    const resCorrupt = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({ pdfBase64: 'data:application/pdf;base64,' + Buffer.from('NO_PDF').toString('base64'), fileName: 'corrupto.pdf' });
    assert.strictEqual(resCorrupt.status, 400);
    assert.strictEqual(resCorrupt.body.error, 'INVALID_PDF');

    const resEmpty = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({});
    assert.strictEqual(resEmpty.status, 400);
    assert.strictEqual(resEmpty.body.error, 'INVALID_REQUEST');
    console.log('   OK - Documentos inválidos y peticiones vacías rechazadas con HTTP 400.');

    // -------------------------------------------------------------
    // PRUEBA 9: Ausencia total de hardcodeo en código de producción
    // -------------------------------------------------------------
    console.log('9. Verificación de ausencia de hardcodeo en lógica de producción...');
    const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const pensionCode = fs.readFileSync(path.join(__dirname, 'pension.js'), 'utf8');

    // Ningún return con resultados fijos
    assert(!serverCode.includes('return 2585.96'), 'server.js no debe contener return 2585.96');
    assert(!pensionCode.includes('return 2585.96'), 'pension.js no debe contener return 2585.96');
    assert(!serverCode.includes('return 2585.94'), 'server.js no debe contener return 2585.94');
    assert(!pensionCode.includes('return 2585.94'), 'pension.js no debe contener return 2585.94');
    assert(!serverCode.includes('return 1073.92'), 'server.js no debe contener return 1073.92');
    assert(!pensionCode.includes('return 1073.92'), 'pension.js no debe contener return 1073.92');

    // Ningún prompt de Gemini con datos duros específicos
    assert(!serverCode.includes('2714.25'), 'server.js no debe incluir salarios duros en prompt');
    assert(!serverCode.includes('2593.50'), 'server.js no debe incluir salarios duros en prompt');
    assert(!serverCode.includes('2405.50'), 'server.js no debe incluir salarios duros en prompt');
    assert(!serverCode.includes('2240.50'), 'server.js no debe incluir salarios duros en prompt');
    assert(!serverCode.includes('1073.92'), 'server.js no debe mencionar 1073.92');
    assert(!serverCode.includes('2585.96'), 'server.js no debe sugerir 2585.96');
    assert(!serverCode.includes('Edenred'), 'server.js no debe nombrar patrones específicos');
    console.log('   OK - Código de producción limpio: cálculo 100% matemático y dinámico.');

    // -------------------------------------------------------------
    // PRUEBA 10: No regresión de la calculadora existente Ley 73
    // -------------------------------------------------------------
    console.log('10. No regresión de calculadora Ley 73...');
    const refCase = calculateIMSSLey73Pension({
        salarioMinimo: 249,
        salarioDiarioPromedio: 2585.96,
        semanasCotizadas: 1615,
        edad: 61,
        tieneEsposa: true,
        numeroHijos: 0,
        tienePadresDependientes: false,
        estaEnSoledad: false,
        tieneIncapacidad: false
    });
    assert(Math.abs(refCase.pensionFinalMensual - 52752.65) < 1, 'Cálculo de pensión Ley 73 consistente');
    console.log(`   OK - Calculadora Ley 73 consistente ($${refCase.pensionFinalMensual}/mes).`);

    // -------------------------------------------------------------
    // PRUEBA 11 & 12: Pruebas con los dos PDFs reales enviados a Gemini API
    // -------------------------------------------------------------
    console.log('\n--- Pruebas reales con PDFs enviados a Gemini API ---');
    const pathA = path.join(__dirname, 'test', 'fixtures', 'reporteSemanasCotizadasDetalleAl01-09-2026.pdf');
    const pathB = path.join(__dirname, 'test', 'fixtures', 'reporteSemanasCotizadasAl28-04-2022.pdf');
    assert(fs.existsSync(pathA), 'Fixture PDF A debe existir');
    assert(fs.existsSync(pathB), 'Fixture PDF B debe existir');

    const bufA = fs.readFileSync(pathA);
    const bufB = fs.readFileSync(pathB);

    console.log('11. Enviando PDF A (Reporte 2026) a /api/pension/calcular-salario-pdf...');
    const resA = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({ pdfBase64: 'data:application/pdf;base64,' + bufA.toString('base64'), fileName: 'pdfA.pdf' });

    assert.strictEqual(resA.status, 200, 'PDF A debe responder 200 OK');
    assert.strictEqual(resA.body.success, true);
    assert.strictEqual(resA.body.diasTotales, 1750, 'PDF A debe tener 1,750 días');
    assert(Array.isArray(resA.body.periodos), 'PDF A debe retornar periodos');
    console.log(`   Salario Diario Promedio PDF A: $${resA.body.salarioDiarioPromedio}`);
    assert(Math.abs(resA.body.salarioDiarioPromedio - 2585.94) <= 0.05, `PDF A debe dar ~2585.94, dio: ${resA.body.salarioDiarioPromedio}`);
    console.log('   OK - PDF A procesado dinámicamente con éxito.');

    console.log('12. Enviando PDF B (Reporte 2022) a /api/pension/calcular-salario-pdf...');
    const resB = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({ pdfBase64: 'data:application/pdf;base64,' + bufB.toString('base64'), fileName: 'pdfB.pdf' });

    assert.strictEqual(resB.status, 200, 'PDF B debe responder 200 OK');
    assert.strictEqual(resB.body.success, true);
    assert.strictEqual(resB.body.diasTotales, 1750, 'PDF B debe tener 1,750 días');
    assert(Array.isArray(resB.body.periodos), 'PDF B debe retornar periodos');
    console.log(`   Salario Diario Promedio PDF B: $${resB.body.salarioDiarioPromedio}`);
    assert(Math.abs(resB.body.salarioDiarioPromedio - 1073.92) <= 0.05, `PDF B debe dar ~1073.92, dio: ${resB.body.salarioDiarioPromedio}`);

    // Verificar que en PDF B el traslape de 47 días fue detectado y NO contado doble
    const segTraslapeB = resB.body.periodos.find(s => s.traslapado);
    assert(segTraslapeB, 'PDF B debe identificar el segmento con traslape (CAPSERVICES / CASCER)');
    assert.strictEqual(segTraslapeB.dias, 47, 'El segmento traslapado debe contar exactamente 47 días una sola vez');
    console.log('   OK - PDF B comprobado: traslape de 47 días no duplicado y promedio $1,073.92.');

    // Verificar que ambos PDFs producen resultados diferentes
    assert.notStrictEqual(resA.body.salarioDiarioPromedio, resB.body.salarioDiarioPromedio, 'Ambos PDFs deben dar resultados distintos');
    console.log('   OK - Ambos PDFs procesados independientemente sin reusar respuestas.');

    console.log('\n=== TODAS LAS PRUEBAS OBLIGATORIAS PASARON EXITOSAMENTE ===');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Error en pruebas:', err);
    process.exit(1);
});
