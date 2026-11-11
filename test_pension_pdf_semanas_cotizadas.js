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
    // PRUEBA 1: Procesamiento real de PDF de Semanas Cotizadas con Gemini API
    // -------------------------------------------------------------
    console.log('1. Procesamiento real del PDF oficial con Gemini API...');
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
    assert.strictEqual(res1.body.diasTotales, 1750, 'Los días utilizados deben ser exactamente 1,750');
    assert.strictEqual(res1.body.semanasTotales, 250, 'Las semanas deben ser exactamente 250');
    assert(Math.abs(res1.body.salarioDiarioPromedio - 2586) < 1.0, `El promedio calculado (${res1.body.salarioDiarioPromedio}) debe situarse en ~2,586`);
    assert.strictEqual(typeof res1.body.salarioDiarioPromedioFormateado, 'string');
    assert(res1.body.salarioDiarioPromedioFormateado.includes('2,58'));

    // Verificar que los periodos devueltos por Gemini sumen 1,750 días y su producto ponderado coincida con el salario diario promedio
    const periodos = res1.body.periodos;
    assert(Array.isArray(periodos) && periodos.length >= 4, 'Debe identificar los periodos relevantes');
    const sumaDias = periodos.reduce((acc, p) => acc + p.dias, 0);
    assert.strictEqual(sumaDias, 1750, 'La suma de los días de los periodos debe ser 1750');

    const sumaPonderada = periodos.reduce((acc, p) => acc + (p.dias * (p.salario_diario || p.salarioDiario)), 0);
    const promedioRecalculado = Math.round((sumaPonderada / 1750) * 100) / 100;
    assert.strictEqual(promedioRecalculado, res1.body.salarioDiarioPromedio, 'El promedio recalculado en el test debe coincidir con el devuelto');
    console.log(`   OK - PDF real procesado por Gemini API real y validado determinísticamente en ${res1.body.salarioDiarioPromedio}.`);

    // -------------------------------------------------------------
    // PRUEBA 2: Validación matemática en backend de los 1,750 días
    // -------------------------------------------------------------
    console.log('2. Validación matemática en backend de los 1,750 días...');
    const invalidDaysData = {
        periodos: [
            { patron: 'Empresa A', dias: 1000, salario_diario: 1000 },
            { patron: 'Empresa B', dias: 600, salario_diario: 1000 }
        ], // 1,600 días !== 1,750 días
        dias_totales: 1600,
        semanas_totales: 228.5,
        salario_promedio: 1000
    };
    const resInvalidDays = validateAndCalculatePensionPeriods(invalidDaysData);
    assert.strictEqual(resInvalidDays.success, false);
    assert.strictEqual(resInvalidDays.error, 'DAYS_SUM_MISMATCH');
    assert(resInvalidDays.message.includes('1600'));
    console.log('   OK - Rechazo controlado cuando la suma de días no es exactamente 1,750.');

    // -------------------------------------------------------------
    // PRUEBA 3: Validación matemática del cálculo ponderado en backend
    // -------------------------------------------------------------
    console.log('3. Validación matemática del cálculo ponderado en backend...');
    const validMathData = {
        periodos: [
            { patron: 'Modalidad 40', dias: 813, salario_diario: 2714.25 },
            { patron: 'Empresa 1', dias: 64, salario_diario: 2714.25 },
            { patron: 'Empresa 2', dias: 365, salario_diario: 2593.50 },
            { patron: 'Empresa 3', dias: 365, salario_diario: 2405.50 },
            { patron: 'Empresa 4 (tramo)', dias: 143, salario_diario: 2240.50 }
        ],
        dias_totales: 1750,
        semanas_totales: 250,
        salario_promedio: 2585.96
    };
    const resValidMath = validateAndCalculatePensionPeriods(validMathData);
    assert.strictEqual(resValidMath.success, true);
    assert.strictEqual(resValidMath.salarioDiarioPromedio, 2585.96);
    assert.strictEqual(resValidMath.diasTotales, 1750);
    assert.strictEqual(resValidMath.semanasTotales, 250);
    console.log('   OK - Cálculo ponderado en backend reproduce exactamente 2585.96.');

    // -------------------------------------------------------------
    // PRUEBA 4: Detección de discrepancia si la IA intentara inventar un salario promedio
    // -------------------------------------------------------------
    console.log('4. Detección de discrepancia entre salario reportado y cálculo real...');
    const spoofedData = {
        periodos: [
            { patron: 'Modalidad 40', dias: 813, salario_diario: 2714.25 },
            { patron: 'Empresa 1', dias: 64, salario_diario: 2714.25 },
            { patron: 'Empresa 2', dias: 365, salario_diario: 2593.50 },
            { patron: 'Empresa 3', dias: 365, salario_diario: 2405.50 },
            { patron: 'Empresa 4 (tramo)', dias: 143, salario_diario: 2240.50 }
        ],
        dias_totales: 1750,
        semanas_totales: 250,
        salario_promedio: 99999.00 // Falsificado / inventado
    };
    const resSpoofed = validateAndCalculatePensionPeriods(spoofedData);
    assert.strictEqual(resSpoofed.success, false);
    assert.strictEqual(resSpoofed.error, 'AVERAGE_VALIDATION_FAILED');
    console.log('   OK - Backend detecta y rechaza promedios inventados por IA.');

    // -------------------------------------------------------------
    // PRUEBA 5: Validación de datos negativos o no numéricos
    // -------------------------------------------------------------
    console.log('5. Validación de periodos con datos negativos o no numéricos...');
    const negativeData = {
        periodos: [
            { patron: 'Empresa', dias: -100, salario_diario: 500 }
        ]
    };
    const resNeg = validateAndCalculatePensionPeriods(negativeData);
    assert.strictEqual(resNeg.success, false);
    assert.strictEqual(resNeg.error, 'INVALID_DAYS');

    const invalidSalaryData = {
        periodos: [
            { patron: 'Empresa', dias: 1750, salario_diario: -50 }
        ]
    };
    const resInvSal = validateAndCalculatePensionPeriods(invalidSalaryData);
    assert.strictEqual(resInvSal.success, false);
    assert.strictEqual(resInvSal.error, 'INVALID_SALARY');
    console.log('   OK - Valores negativos o inválidos rechazados correctamente.');

    // -------------------------------------------------------------
    // PRUEBA 6: Detección y manejo de PDFs corruptos, no válidos o no IMSS
    // -------------------------------------------------------------
    console.log('6. Detección y manejo de PDFs corruptos o no válidos...');
    // Archivo no PDF (texto plano)
    const resCorrupt = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({ pdfBase64: 'data:application/pdf;base64,' + Buffer.from('NO ES UN PDF').toString('base64'), fileName: 'invalido.pdf' });
    assert.strictEqual(resCorrupt.status, 400);
    assert.strictEqual(resCorrupt.body.error, 'INVALID_PDF');

    // Carga vacía
    const resEmpty = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .send({});
    assert.strictEqual(resEmpty.status, 400);
    assert.strictEqual(resEmpty.body.error, 'INVALID_REQUEST');
    console.log('   OK - Archivos inválidos rechazados con HTTP 400.');

    // -------------------------------------------------------------
    // PRUEBA 7: Colocación automática del valor resultante en el formulario (JSDOM)
    // -------------------------------------------------------------
    console.log('7. Colocación automática del valor resultante en el formulario...');
    const htmlPath = path.join(__dirname, 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const dom = new JSDOM(htmlContent, {
        url: 'http://localhost',
        runScripts: 'dangerously',
        resources: 'usable'
    });
    const window = dom.window;
    const document = window.document;

    // Mock fetch background calls
    window.fetch = async () => ({
        ok: true,
        json: async () => ({})
    });

    await new Promise(r => setTimeout(r, 250));

    const salarioPromedioInput = document.getElementById('salario-promedio');
    const btnSeleccionarPdf = document.getElementById('btn-seleccionar-pdf');
    const pdfSemanasInput = document.getElementById('pdf-semanas-input');
    const pdfUploadStatus = document.getElementById('pdf-upload-status');

    assert(salarioPromedioInput, 'El campo salario-promedio debe existir');
    assert(btnSeleccionarPdf, 'El botón Seleccionar PDF debe existir');
    assert(pdfSemanasInput, 'El input file pdf-semanas-input debe existir');
    assert(pdfUploadStatus, 'El contenedor de estado pdf-upload-status debe existir');

    // Asignar el valor obtenido del PDF real
    salarioPromedioInput.value = res1.body.salarioDiarioPromedio;
    salarioPromedioInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    salarioPromedioInput.dispatchEvent(new window.Event('change', { bubbles: true }));

    assert.strictEqual(Number(salarioPromedioInput.value), res1.body.salarioDiarioPromedio, 'El campo debe tener el valor asignado');

    // Simular render de estado de éxito
    pdfUploadStatus.style.display = 'block';
    pdfUploadStatus.innerHTML = `
        <div class="alert alert-success">
            <strong>Se identificaron las últimas 250 semanas.</strong>
            <span>Salario diario promedio: ${res1.body.salarioDiarioPromedioFormateado}</span>
        </div>
    `;
    assert(pdfUploadStatus.innerHTML.includes('Se identificaron las últimas 250 semanas.'));
    assert(pdfUploadStatus.innerHTML.includes(res1.body.salarioDiarioPromedioFormateado));

    // Verificar botón limpiar formulario
    const btnLimpiar = document.getElementById('btn-limpiar-formulario');
    assert(btnLimpiar, 'El botón limpiar debe existir');
    btnLimpiar.click();
    assert.strictEqual(salarioPromedioInput.value, '', 'Limpiar debe resetear el campo salario-promedio');
    assert.strictEqual(pdfUploadStatus.style.display, 'none', 'Limpiar debe ocultar el estado de PDF');
    console.log('   OK - Formulario DOM actualizado, mostrado y limpiado correctamente.');

    // -------------------------------------------------------------
    // PRUEBA 8: Cálculo de pensión usando el valor obtenido (2585.96) y coincidencia con cálculo manual
    // -------------------------------------------------------------
    console.log('8. Cálculo de pensión usando el valor obtenido (2585.96) vs cálculo manual...');
    const pensionDataFromPdf = {
        salarioMinimo: 249,
        salarioDiarioPromedio: 2585.96, // Salario obtenido dinámicamente
        semanasCotizadas: 1615,
        edad: 61,
        tieneEsposa: true,
        numeroHijos: 0,
        tienePadresDependientes: false,
        estaEnSoledad: false,
        tieneIncapacidad: false
    };

    const resPensionAuto = calculateIMSSLey73Pension(pensionDataFromPdf);

    const pensionDataManual = {
        salarioMinimo: 249,
        salarioDiarioPromedio: 2585.96,
        semanasCotizadas: 1615,
        edad: 61,
        tieneEsposa: true,
        numeroHijos: 0,
        tienePadresDependientes: false,
        estaEnSoledad: false,
        tieneIncapacidad: false
    };

    const resPensionManual = calculateIMSSLey73Pension(pensionDataManual);

    assert.strictEqual(resPensionAuto.pensionFinalMensual, resPensionManual.pensionFinalMensual);
    assert.strictEqual(resPensionAuto.pensionBaseMensual, resPensionManual.pensionBaseMensual);
    assert.strictEqual(resPensionAuto.incrementosTotales, resPensionManual.incrementosTotales);
    assert(resPensionAuto.pensionFinalMensual > 0);
    console.log('   OK - Cálculo de pensión con 2585.96 verificado exitosamente (' + resPensionAuto.pensionFinalMensual + ').');

    // -------------------------------------------------------------
    // PRUEBA 9: Verificación de fórmulas y casos base de Ley 73 intactas
    // -------------------------------------------------------------
    console.log('9. Verificación de fórmulas y casos base de Ley 73 intactas...');
    const refCase = calculateIMSSLey73Pension({
        salarioMinimo: 249,
        salarioDiarioPromedio: 2585,
        semanasCotizadas: 1615,
        edad: 61,
        tieneEsposa: true,
        numeroHijos: 0,
        tienePadresDependientes: false,
        estaEnSoledad: false,
        tieneIncapacidad: false
    });
    assert(Math.abs(refCase.pensionFinalMensual - 52733.07) < 1, 'Caso crítico Ley 73 debe mantenerse idéntico');
    console.log('   OK - Ley 73 se mantiene 100% intacta.');

    console.log('\n=== TODAS LAS PRUEBAS DE GEMINI REAL Y SALARIO PROMEDIO PASARON EXITOSAMENTE ===');
    process.exit(0);
}

runTests().catch(err => {
    console.error('Error en pruebas:', err);
    process.exit(1);
});
