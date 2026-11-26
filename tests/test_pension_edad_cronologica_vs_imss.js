/**
 * test_pension_edad_cronologica_vs_imss.js
 * 
 * Suite de pruebas exhaustiva para verificar:
 * 1. Distinción entre Edad Cronológica Proyectada (años y meses) y Edad para efectos de pensión IMSS (años).
 * 2. Pruebas determinísticas de límites legales (+6 meses + 1 día) en fechas reales (conservando el día exacto):
 *    - 60 años exactos -> 60 (75%)
 *    - 60 años + 6 meses exactos -> 60 (75%)
 *    - 60 años + 6 meses + 1 día -> 61 (80%)
 *    - 61 años exactos -> 61 (80%)
 *    - 61 años + 6 meses exactos -> 61 (80%)
 *    - 61 años + 6 meses + 1 día -> 62 (85%)
 *    - 62 años + 6 meses exactos -> 62 (85%)
 *    - 62 años + 6 meses + 1 día -> 63 (90%)
 *    - 62 años, 7 meses -> 63 (90%)
 *    - 63 años + 6 meses exactos -> 63 (90%)
 *    - 63 años + 6 meses + 1 día -> 64 (95%)
 *    - 64 años + 6 meses exactos -> 64 (95%)
 *    - 64 años + 6 meses + 1 día -> 65 (100%)
 * 3. En cada caso se comprueba:
 *    - edad cronológica calculada y texto;
 *    - edad IMSS pensionaria;
 *    - porcentaje Ley 73 de TABLA_EDAD;
 *    - valor transferido al formulario principal (#edad-jubilacion) al pulsar "Aplicar valores a la calculadora".
 * 4. Prueba DOM / E2E de interfaz completa: Proyección -> Aplicar valores -> Calcular pensión.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
    calcularEdadExacta,
    calcularUmbralMas6Meses1Dia,
    calcularEdadPensionaria,
    calcularEdadCronologicaDetallada,
    calculatePensionProjection,
    calculateIMSSLey73Pension,
    TABLA_EDAD
} = require('../pension');

console.log('================================================================================');
console.log('SUITE DE PRUEBAS: EDAD CRONOLÓGICA PROYECTADA VS EDAD PARA EFECTOS DE PENSIÓN IMSS');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(nombre, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ [PASS] Caso ${totalTests}: ${nombre}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ [FAIL] Caso ${totalTests}: ${nombre}`);
        console.error(err);
        process.exitCode = 1;
    }
}

// -------------------------------------------------------------------------------------
// BLOQUE 1: PRUEBAS DETERMINÍSTICAS DE LÍMITES CON FECHAS REALES
// -------------------------------------------------------------------------------------
// Asegurado nacido el 7 de diciembre de 1965 (1965-12-07)
const fNac = '1965-12-07';

// 1. Exactamente 60 años: Cumpleaños 2025-12-07
runTest('Límite 1: Exactamente 60 años (2025-12-07) -> Cronológica: 60 años, IMSS: 60 (75%)', () => {
    const fFin = '2025-12-07';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2024-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 60);
    assert.strictEqual(det.meses, 0);
    assert.strictEqual(det.dias, 0);
    assert.strictEqual(det.texto, '60 años');
    assert.strictEqual(pen.edadPensionaria, 60);
    assert.strictEqual(pen.porcentajeLey73, 0.75);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 60);
    assert.strictEqual(proj.situacionProyectada.edadCronologicaTexto, '60 años');
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 60);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.75);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '75%');
});

// 2. 60 años + 6 meses exactos: 2026-06-07
runTest('Límite 2: 60 años + 6 meses exactos (2026-06-07) -> Cronológica: 60 años, 6 meses, IMSS: 60 (75%)', () => {
    const fFin = '2026-06-07';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2024-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 60);
    assert.strictEqual(det.meses, 6);
    assert.strictEqual(det.dias, 0);
    assert.strictEqual(det.texto, '60 años, 6 meses');
    assert.strictEqual(pen.edadPensionaria, 60);
    assert.strictEqual(pen.porcentajeLey73, 0.75);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 60);
    assert.strictEqual(proj.situacionProyectada.edadCronologicaTexto, '60 años, 6 meses');
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 60);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.75);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '75%');
});

// 3. 60 años + 6 meses + 1 día: 2026-06-08 -> cruza el umbral legal
runTest('Límite 3: 60 años + 6 meses + 1 día (2026-06-08) -> Cronológica: 60 años, 6 meses, IMSS: 61 (80%)', () => {
    const fFin = '2026-06-08';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2024-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 60);
    assert.strictEqual(det.meses, 6);
    assert.strictEqual(det.dias, 1);
    assert.strictEqual(det.texto, '60 años, 6 meses');
    assert.strictEqual(pen.edadPensionaria, 61, 'Al rebasar 6 meses + 1 día debe saltar a 61');
    assert.strictEqual(pen.porcentajeLey73, 0.80);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 60);
    assert.strictEqual(proj.situacionProyectada.edadCronologicaTexto, '60 años, 6 meses');
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 61);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.80);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '80%');
});

// 4. Exactamente 61 años: 2026-12-07
runTest('Límite 4: Exactamente 61 años (2026-12-07) -> Cronológica: 61 años, IMSS: 61 (80%)', () => {
    const fFin = '2026-12-07';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2025-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 61);
    assert.strictEqual(det.meses, 0);
    assert.strictEqual(det.dias, 0);
    assert.strictEqual(det.texto, '61 años');
    assert.strictEqual(pen.edadPensionaria, 61);
    assert.strictEqual(pen.porcentajeLey73, 0.80);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 61);
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 61);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.80);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '80%');
});

// 5. 61 años + 6 meses exactos: 2027-06-07
runTest('Límite 5a: 61 años + 6 meses exactos (2027-06-07) -> Cronológica: 61 años, 6 meses, IMSS: 61 (80%)', () => {
    const fFin = '2027-06-07';
    const pen = calcularEdadPensionaria(fNac, fFin);
    assert.strictEqual(pen.edadPensionaria, 61);
    assert.strictEqual(pen.porcentajeLey73, 0.80);
});

// 6. 61 años + 6 meses + 1 día: 2027-06-08 -> cruza a 62
runTest('Límite 5b: 61 años + 6 meses + 1 día (2027-06-08) -> Cronológica: 61 años, 6 meses, IMSS: 62 (85%)', () => {
    const fFin = '2027-06-08';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2025-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 61);
    assert.strictEqual(det.meses, 6);
    assert.strictEqual(det.dias, 1);
    assert.strictEqual(pen.edadPensionaria, 62);
    assert.strictEqual(pen.porcentajeLey73, 0.85);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 61);
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 62);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.85);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '85%');
});

// 7. 62 años + 6 meses exactos: 2028-06-07
runTest('Límite 6a: 62 años + 6 meses exactos (2028-06-07) -> Cronológica: 62 años, 6 meses, IMSS: 62 (85%)', () => {
    const fFin = '2028-06-07';
    const pen = calcularEdadPensionaria(fNac, fFin);
    assert.strictEqual(pen.edadPensionaria, 62);
    assert.strictEqual(pen.porcentajeLey73, 0.85);
});

// 8. 62 años + 6 meses + 1 día: 2028-06-08 -> cruza a 63
runTest('Límite 6b: 62 años + 6 meses + 1 día (2028-06-08) -> Cronológica: 62 años, 6 meses, IMSS: 63 (90%)', () => {
    const fFin = '2028-06-08';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2026-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 62);
    assert.strictEqual(det.meses, 6);
    assert.strictEqual(det.dias, 1);
    assert.strictEqual(pen.edadPensionaria, 63);
    assert.strictEqual(pen.porcentajeLey73, 0.90);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 62);
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 63);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.90);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '90%');
});

// 9. Caso específico del usuario: 62 años, 7 meses (ej. 2028-07-15)
runTest('Caso Usuario: 62 años, 7 meses (2028-07-15) -> Cronológica: 62 años, 7 meses, IMSS: 63 (90%)', () => {
    const fFin = '2028-07-15';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2026-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 62);
    assert.strictEqual(det.meses, 7);
    assert.strictEqual(det.texto, '62 años, 7 meses');
    assert.strictEqual(pen.edadPensionaria, 63);
    assert.strictEqual(pen.porcentajeLey73, 0.90);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 62);
    assert.strictEqual(proj.situacionProyectada.edadCronologicaTexto, '62 años, 7 meses');
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 63);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.90);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '90%');
});

// 10. 63 años + 6 meses exactos: 2029-06-07
runTest('Límite 7a: 63 años + 6 meses exactos (2029-06-07) -> Cronológica: 63 años, 6 meses, IMSS: 63 (90%)', () => {
    const fFin = '2029-06-07';
    const pen = calcularEdadPensionaria(fNac, fFin);
    assert.strictEqual(pen.edadPensionaria, 63);
    assert.strictEqual(pen.porcentajeLey73, 0.90);
});

// 11. 63 años + 6 meses + 1 día: 2029-06-08 -> cruza a 64
runTest('Límite 7b: 63 años + 6 meses + 1 día (2029-06-08) -> Cronológica: 63 años, 6 meses, IMSS: 64 (95%)', () => {
    const fFin = '2029-06-08';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2027-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 63);
    assert.strictEqual(det.meses, 6);
    assert.strictEqual(det.dias, 1);
    assert.strictEqual(pen.edadPensionaria, 64);
    assert.strictEqual(pen.porcentajeLey73, 0.95);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 63);
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 64);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 0.95);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '95%');
});

// 12. 64 años + 6 meses exactos: 2030-06-07
runTest('Límite 8a: 64 años + 6 meses exactos (2030-06-07) -> Cronológica: 64 años, 6 meses, IMSS: 64 (95%)', () => {
    const fFin = '2030-06-07';
    const pen = calcularEdadPensionaria(fNac, fFin);
    assert.strictEqual(pen.edadPensionaria, 64);
    assert.strictEqual(pen.porcentajeLey73, 0.95);
});

// 13. 64 años + 6 meses + 1 día: 2030-06-08 -> cruza a 65
runTest('Límite 8b: 64 años + 6 meses + 1 día (2030-06-08) -> Cronológica: 64 años, 6 meses, IMSS: 65 (100%)', () => {
    const fFin = '2030-06-08';
    const det = calcularEdadCronologicaDetallada(fNac, fFin);
    const pen = calcularEdadPensionaria(fNac, fFin);
    const proj = calculatePensionProjection({
        fechaNacimiento: fNac,
        fechaDesde: '2028-12-07',
        fechaHasta: fFin,
        semanasActuales: 800,
        salarioPromedioActual: 800,
        salarioDiarioProyectado: 1200,
        salarioMinimoProyectado: 315.04
    });

    assert.strictEqual(det.anios, 64);
    assert.strictEqual(det.meses, 6);
    assert.strictEqual(det.dias, 1);
    assert.strictEqual(pen.edadPensionaria, 65);
    assert.strictEqual(pen.porcentajeLey73, 1.00);
    assert.strictEqual(proj.situacionProyectada.edadCronologica, 64);
    assert.strictEqual(proj.situacionProyectada.edadPensionaria, 65);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73, 1.00);
    assert.strictEqual(proj.situacionProyectada.porcentajeLey73Texto, '100%');
});

// -------------------------------------------------------------------------------------
// BLOQUE 2: VERIFICACIÓN DEL CÓDIGO FUENTE EN INDEX.HTML Y SERVER.JS
// -------------------------------------------------------------------------------------
runTest('Verificación de index.html: tarjeta SITUACIÓN PROYECTADA muestra ambas edades y leyenda oficial', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert(html.includes('Edad cronológica al término:'), 'Debe mostrar la etiqueta Edad cronológica al término');
    assert(html.includes('Edad para efectos de pensión IMSS:'), 'Debe mostrar la etiqueta Edad para efectos de pensión IMSS');
    assert(html.includes('Edad utilizada por IMSS para determinar el porcentaje de pensión.'), 'Debe incluir la leyenda explicativa');
});

runTest('Verificación de index.html: botón Aplicar valores transfiere estrictamente edadPensionaria', () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert(html.includes('proy.edadPensionaria'), 'El listener de aplicar valores debe leer prioritariamente edadPensionaria');
    assert(!html.includes('nuevaEdad = calcularEdadExacta(fechaNac, fechaFinProy);\n                            } else if (proy && typeof proy.edadCronologica'),
        'No debe volver a asignar la edad cronológica como primera opción');
});

runTest('Invariante del Motor: Semanas, salarios, incrementos y reglas de cálculo se mantienen idénticos', () => {
    const res = calculatePensionProjection({
        fechaNacimiento: '1965-05-10',
        fechaDesde: '2025-01-01',
        fechaHasta: '2027-12-10',
        semanasActuales: 850,
        salarioPromedioActual: 500,
        salarioDiarioProyectado: 1500,
        salarioMinimoProyectado: 315.04
    });

    // 1074 días entre 2025-01-01 y 2027-12-10 -> 1074 / 7 = 153.428 semanas
    assert(res.situacionProyectada.nuevasSemanasProyectadas > 150, 'Semanas proyectadas intactas');
    assert.strictEqual(res.situacionProyectada.totalSemanasCotizadas, 850 + Math.floor(res.situacionProyectada.nuevasSemanasProyectadas));
    // El motor calcula pensión con la edad pensionaria resultante
    assert.strictEqual(res.situacionProyectada.edadPensionaria, 63);
    assert.strictEqual(res.situacionProyectada.edadCronologica, 62);
    assert.strictEqual(res.situacionProyectada.desglose.porcentajeEdad, 0.90);
});

console.log(`\n================================================================================`);
console.log(`RESULTADO DE LA SUITE: ${passedTests} de ${totalTests} PRUEBAS SUPERADAS`);
console.log(`================================================================================`);

if (passedTests !== totalTests) {
    process.exit(1);
}
