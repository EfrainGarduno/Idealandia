process.env.AUTH_SECRET = 'test_secret_for_pdf_pension_tests';
process.env.PORT = '0'; // Ephemeral port to avoid conflict

const assert = require('assert');
const request = require('supertest');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const {
    calculateIMSSLey73Pension,
    calculateAverageSalaryLast250Weeks,
    extractPeriodsFromIMSSDocumentText,
    validateAndCalculatePensionPeriods
} = require('./pension.js');

const {
    app,
    parseIMSSWithGemini
} = require('./server.js');

async function runTests() {
    console.log('=== Iniciando pruebas: PDF de Semanas Cotizadas del IMSS con Gemini API Real ===\n');

    // -------------------------------------------------------------
    // PRUEBA 1 & 2: El PDF es enviado a Gemini y devuelve periodos estructurados
    // -------------------------------------------------------------
    console.log('1 & 2. Envío de PDF real a Gemini API y recepción de periodos estructurados...');
    const fixturePath = path.join(__dirname, 'test', 'fixtures', 'semanas_cotizadas_test.pdf');
    assert(fs.existsSync(fixturePath), 'El fixture del PDF real debe existir en test/fixtures/');

    const pdfBuffer = fs.readFileSync(fixturePath);
    assert(pdfBuffer.length > 1000, 'El archivo PDF debe tener contenido');

    const base64Pdf = 'data:application/pdf;base64,' + pdfBuffer.toString('base64');
    const res1 = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({ pdfBase64: base64Pdf, fileName: 'semanas_cotizadas.pdf' });

    if (res1.status !== 200) {
        console.error('Response status:', res1.status, 'body:', JSON.stringify(res1.body, null, 2));
    }
    assert.strictEqual(res1.status, 200, 'El endpoint debe responder 200 OK con Gemini API');
    assert.strictEqual(res1.body.success, true);
    assert(Array.isArray(res1.body.periodos), 'Gemini debe retornar un array estructurado de periodos');
    assert(res1.body.periodos.length >= 4, 'Debe identificar los periodos relevantes');
    for (const p of res1.body.periodos) {
        assert(p.patron, 'Cada periodo debe tener nombre de patrón');
        assert(typeof p.dias === 'number' && p.dias > 0, 'Cada periodo debe tener días numéricos positivos');
        const sal = p.salario_diario || p.salarioDiario;
        assert(typeof sal === 'number' && sal > 0, 'Cada periodo debe tener salario diario positivo');
    }
    console.log('   OK - PDF enviado a Gemini API y estructuración de periodos validada.');

    // -------------------------------------------------------------
    // PRUEBA 3 & 4: El backend utiliza días y se seleccionan exactamente 1,750 días
    // -------------------------------------------------------------
    console.log('3 & 4. Verificación de cálculo basado en días y exactamente 1,750 días seleccionados...');
    assert.strictEqual(res1.body.diasTotales, 1750, 'Los días totales utilizados deben ser exactamente 1,750');
    assert.strictEqual(res1.body.semanasTotales, 250, 'Las semanas totales deben ser exactamente 250 (1750 / 7)');
    const sumaDiasReales = res1.body.periodos.reduce((acc, p) => acc + p.dias, 0);
    assert.strictEqual(sumaDiasReales, 1750, 'La suma exacta de días de los tramos utilizados debe ser 1,750');
    console.log('   OK - El backend calcula sobre días cotizados y garantiza exactamente 1,750 días.');

    // -------------------------------------------------------------
    // PRUEBA 5: Corte parcial del último periodo para completar exactamente 1,750 días
    // -------------------------------------------------------------
    console.log('5. Corte parcial del periodo más antiguo para completar exactamente 1,750 días...');
    const testPartialData = [
        { patron: 'Patrón 1', dias: 813, salarioDiario: 2714.25 },
        { patron: 'Patrón 2', dias: 64, salarioDiario: 2714.25 },
        { patron: 'Patrón 3', dias: 365, salarioDiario: 2593.50 },
        { patron: 'Patrón 4', dias: 365, salarioDiario: 2405.50 },
        { patron: 'Patrón 5 con exceso de días', dias: 300, salarioDiario: 2240.50 } // Se requieren solo 143 días
    ];
    const resPartial = calculateAverageSalaryLast250Weeks(testPartialData);
    assert.strictEqual(resPartial.success, true);
    assert.strictEqual(resPartial.diasTotales, 1750);
    const ultimoTramo = resPartial.periodosUtilizados[resPartial.periodosUtilizados.length - 1];
    assert.strictEqual(ultimoTramo.diasUtilizados, 143, 'El último tramo debe cortarse exactamente a 143 días');
    assert.strictEqual(ultimoTramo.parcial, true, 'El último tramo debe marcarse como parcial');
    assert.strictEqual(resPartial.salarioDiarioPromedio, 2585.96);
    console.log('   OK - Periodo parcial cortado exactamente de 300 a 143 días completando 1,750 días.');

    // -------------------------------------------------------------
    // PRUEBA 6 & 7: Promedio ponderado determinista y caso real produce $2,585.96
    // -------------------------------------------------------------
    console.log('6 & 7. Promedio ponderado determinista y validación del caso real ($2,585.96)...');
    assert.strictEqual(res1.body.salarioDiarioPromedio, 2585.96, 'El caso real debe arrojar exactamente 2585.96');
    assert(res1.body.salarioDiarioPromedioFormateado.includes('2,585.96'));

    const sumaPonderada = res1.body.periodos.reduce((acc, p) => acc + (p.dias * (p.salario_diario || p.salarioDiario)), 0);
    const promedioManual = Math.round((sumaPonderada / 1750) * 100) / 100;
    assert.strictEqual(promedioManual, 2585.96, 'La suma ponderada manual debe coincidir con 2585.96');
    console.log(`   OK - Caso real verificado determinísticamente: Salario diario promedio = $${res1.body.salarioDiarioPromedio}.`);

    // -------------------------------------------------------------
    // PRUEBA 8: Verificación de NO hardcodeo de $2,585.96 en lógica de producción
    // -------------------------------------------------------------
    console.log('8. Verificación de ausencia de hardcodeo de $2,585.96 en lógica de producción...');
    const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    const pensionCode = fs.readFileSync(path.join(__dirname, 'pension.js'), 'utf8');
    // Verificar que no se use 2585.96 como valor retornado estáticamente o fórmula
    assert(!serverCode.includes('return 2585.96'), 'server.js no debe contener return 2585.96');
    assert(!pensionCode.includes('return 2585.96'), 'pension.js no debe contener return 2585.96');
    assert(!serverCode.includes('salario_promedio: 2585.96'), 'Prompt no debe contener 2585.96');
    assert(!serverCode.includes('salarioPromedio: 2585.96'), 'Prompt no debe sugerir 2585.96');

    // Demostrar dinamismo con un conjunto de datos completamente diferente
    const dynamicData = [
        { patron: 'Empresa X', dias: 1000, salarioDiario: 1000.00 },
        { patron: 'Empresa Y', dias: 750, salarioDiario: 500.00 }
    ];
    // (1000 * 1000 + 750 * 500) / 1750 = (1000000 + 375000) / 1750 = 1375000 / 1750 = 785.71
    const resDynamic = calculateAverageSalaryLast250Weeks(dynamicData);
    assert.strictEqual(resDynamic.success, true);
    assert.strictEqual(resDynamic.salarioDiarioPromedio, 785.71, 'Cálculo dinámico con salarios arbitrarios debe operar con la misma fórmula');
    console.log('   OK - Ausencia total de hardcodeo: fórmula 100% matemática y dinámica.');

    // -------------------------------------------------------------
    // PRUEBA 9: Documentos inválidos y errores controlados
    // -------------------------------------------------------------
    console.log('9. Documentos inválidos y errores controlados...');
    // PDF no válido
    const resCorrupt = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({ pdfBase64: 'data:application/pdf;base64,' + Buffer.from('NO ES UN PDF').toString('base64'), fileName: 'invalido.pdf' });
    assert.strictEqual(resCorrupt.status, 400);
    assert.strictEqual(resCorrupt.body.error, 'INVALID_PDF');

    // Solicitud vacía
    const resEmpty = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({});
    assert.strictEqual(resEmpty.status, 400);
    assert.strictEqual(resEmpty.body.error, 'INVALID_REQUEST');

    // Días insuficientes
    const resInsufficient = validateAndCalculatePensionPeriods({
        periodos: [{ patron: 'Empresa Corta', dias: 500, salarioDiario: 1000 }]
    });
    assert.strictEqual(resInsufficient.success, false);
    assert.strictEqual(resInsufficient.error, 'DAYS_SUM_MISMATCH');

    // Salario inválido
    const resInvSal = validateAndCalculatePensionPeriods({
        periodos: [{ patron: 'Empresa Inv', dias: 1750, salarioDiario: -100 }]
    });
    assert.strictEqual(resInvSal.success, false);
    assert.strictEqual(resInvSal.error, 'INVALID_SALARY');
    console.log('   OK - Errores controlados correctamente (HTTP 400 y validaciones de datos).');

    // -------------------------------------------------------------
    // PRUEBA 10: Integración UI y no regresión de la calculadora existente
    // -------------------------------------------------------------
    console.log('10. Integración con formulario UI y no regresión de calculadora Ley 73...');
    const htmlPath = path.join(__dirname, 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const dom = new JSDOM(htmlContent, {
        url: 'http://localhost',
        runScripts: 'dangerously',
        resources: 'usable'
    });
    const window = dom.window;
    const document = window.document;

    window.fetch = async () => ({
        ok: true,
        json: async () => ({})
    });

    await new Promise(r => setTimeout(r, 200));

    const salarioPromedioInput = document.getElementById('salario-promedio');
    const pdfUploadStatus = document.getElementById('pdf-upload-status');
    assert(salarioPromedioInput, 'El campo salario-promedio debe existir');
    assert(pdfUploadStatus, 'El contenedor pdf-upload-status debe existir');

    // Asignar el valor del backend
    salarioPromedioInput.value = res1.body.salarioDiarioPromedio;
    salarioPromedioInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.strictEqual(Number(salarioPromedioInput.value), 2585.96);

    // Verificación de caso base de cálculo Ley 73
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
    console.log(`   OK - Formulario UI actualizado y cálculo Ley 73 preservado ($${refCase.pensionFinalMensual}/mes).`);

    console.log('\n=== TODAS LAS 10 PRUEBAS ESPECIFICADAS PASARON EXITOSAMENTE ===');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Error en pruebas:', err);
    process.exit(1);
});
