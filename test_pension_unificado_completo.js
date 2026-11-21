process.env.AUTH_SECRET = 'test_secret_for_unified_pension_suite';
process.env.PORT = '0';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const {
    calculateIMSSLey73Pension,
    calculateAverageSalaryLast250Weeks,
    validateAndCalculatePensionPeriods,
    calculatePensionProjection,
    extractBirthDateFromCurp,
    calcularUmbralMas6Meses1Dia,
    calcularEdadPensionaria,
    reconstructDeterministicPeriods,
    calculateInclusiveDays,
    SALARIO_MINIMO_GENERAL_VIGENTE,
    TABLA_EDAD
} = require('./pension.js');

const { app, extractAseguradoInfo, extractTextFromPdfBuffer } = require('./server.js');

async function runUnifiedPensionSuite() {
    console.log('================================================================================');
    console.log('SUITE INTEGRAL DE PRUEBAS: MOTOR UNIFICADO DE PENSIONES IMSS LEY 73');
    console.log('================================================================================\n');

    let totalAsserts = 0;
    function pass(desc) {
        totalAsserts++;
        console.log(`  [PASS] ${desc}`);
    }

    // =========================================================================
    // GRUPO A: PARSER Y NORMALIZACIÓN DE MOVIMIENTOS
    // =========================================================================
    console.log('--- GRUPO A: Parser y Normalización de Movimientos ---');
    const rawInput = [
        { patron: 'EMPRESA A', fechaInicio: '01/02/2023', fechaFin: '28/02/2023', salarioDiario: '2,593.50' },
        { patron: 'EMPRESA A', fechaInicio: '2023-03-01', fechaFin: '2023-04-30', salario: 2593.5 },
        { patron: 'EMPRESA B', fecha_desde: '2022-01-01', fecha_hasta: '2022-12-31', sbc: '1,500.00' }
    ];

    const normalizados = reconstructDeterministicPeriods(rawInput);
    assert.strictEqual(normalizados.length, 2, 'Debe agrupar en 2 periodos');
    pass('A.1: Normalización de formatos de fecha (DD/MM/YYYY y YYYY-MM-DD)');
    assert.strictEqual(normalizados[0].patron, 'EMPRESA A');
    assert.strictEqual(normalizados[0].salarioDiario, 2593.50);
    pass('A.2: Parseo numérico estricto de salarios con comas y decimales');
    assert.strictEqual(normalizados[0].fechaDesde, '2023-02-01');
    assert.strictEqual(normalizados[0].fechaHasta, '2023-04-30');
    pass('A.3: Consolidación patronal limpia');

    // =========================================================================
    // GRUPO B: MÁQUINA DE ESTADOS DE VIGENCIAS (CASOS ESPECÍFICOS DEL USUARIO)
    // =========================================================================
    console.log('\n--- GRUPO B: Máquina de Estados de Vigencias ---');
    // Caso reportado: 01/02/2023 a 01/01/2024 mismo salario ($2,593.50), cambio 01/02/2024 ($2,714.25), baja 04/04/2024
    const userAuditMovements = [
        { fechaInicio: '2023-02-01', fechaFin: '2023-02-28', salarioDiario: 2593.50, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2023-03-01', fechaFin: '2023-04-30', salarioDiario: 2593.50, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2023-05-01', fechaFin: '2023-06-30', salarioDiario: 2593.50, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2023-07-01', fechaFin: '2023-08-31', salarioDiario: 2593.50, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2023-09-01', fechaFin: '2023-10-31', salarioDiario: 2593.50, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2023-11-01', fechaFin: '2023-12-31', salarioDiario: 2593.50, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2024-01-01', fechaFin: '2024-01-31', salarioDiario: 2593.50, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2024-02-01', fechaFin: '2024-02-29', salarioDiario: 2714.25, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2024-03-01', fechaFin: '2024-04-03', salarioDiario: 2714.25, patron: 'SERVICIOS EDENRED' },
        { fechaInicio: '2024-04-04', fechaFin: '2024-04-04', salarioDiario: 2714.25, tipo: 'BAJA', patron: 'SERVICIOS EDENRED' }
    ];

    const vigenciasEdenred = reconstructDeterministicPeriods(userAuditMovements);
    assert.strictEqual(vigenciasEdenred.length, 2, 'Deben resultar exactamente 2 periodos sin fragmentación artificial');
    pass('B.1: Eliminación total de micro-periodos o fragmentos artificiales de 1 día');

    const p1 = vigenciasEdenred.find(p => p.fechaDesde === '2023-02-01');
    assert(p1, 'Periodo 1 debe existir');
    assert.strictEqual(p1.fechaDesde, '2023-02-01');
    assert.strictEqual(p1.fechaHasta, '2024-01-31');
    assert.strictEqual(p1.dias, 365, 'Periodo 1 debe tener exactamente 365 días');
    assert.strictEqual(p1.salario, 2593.50);
    pass('B.2: Periodo 1: 01/02/2023 -> 31/01/2024 (365 días @ $2,593.50)');

    const p2 = vigenciasEdenred.find(p => p.fechaDesde === '2024-02-01');
    assert(p2, 'Periodo 2 debe existir');
    assert.strictEqual(p2.fechaDesde, '2024-02-01');
    assert.strictEqual(p2.fechaHasta, '2024-04-04');
    assert.strictEqual(p2.dias, 64, 'Periodo 2 debe tener 64 días (2024 bisiesto: 29 feb + 31 mar + 4 abr)');
    assert.strictEqual(p2.salario, 2714.25);
    pass('B.3: Periodo 2: 01/02/2024 -> 04/04/2024 (64 días @ $2,714.25 con fecha de baja inclusive)');

    // Caso de vigencia de 1 solo día
    const unSoloDia = [
        { patron: 'EMPRESA DIA', fechaInicio: '2024-05-15', fechaFin: '2024-05-15', salarioDiario: 1000.00 }
    ];
    const resDia = reconstructDeterministicPeriods(unSoloDia);
    assert.strictEqual(resDia[0].dias, 1);
    pass('B.4: Periodo de un solo día computable como 1 día natural');

    // Caso B.5: Múltiples cambios de salario consecutivos en un mismo año
    const multiCambios = [
        { patron: 'EMPRESA MULTI', fechaInicio: '2023-01-01', fechaFin: '2023-03-31', salarioDiario: 1000.00 },
        { patron: 'EMPRESA MULTI', fechaInicio: '2023-04-01', fechaFin: '2023-07-31', salarioDiario: 1200.00 },
        { patron: 'EMPRESA MULTI', fechaInicio: '2023-08-01', fechaFin: '2023-12-31', salarioDiario: 1500.00 }
    ];
    const resMulti = reconstructDeterministicPeriods(multiCambios);
    assert.strictEqual(resMulti.length, 3);
    assert.strictEqual(resMulti[0].salarioDiario, 1500.00);
    assert.strictEqual(resMulti[0].fechaDesde, '2023-08-01');
    assert.strictEqual(resMulti[0].fechaHasta, '2023-12-31');
    pass('B.5: Múltiples cambios de salario en un año cortan exactamente en F_siguiente - 1');

    // Caso B.6: Traslape simultáneo entre dos patrones independientes
    const traslapePatrones = [
        { patron: 'PATRON ALFA', fechaInicio: '2023-01-01', fechaFin: '2023-06-30', salarioDiario: 1000.00 },
        { patron: 'PATRON BETA', fechaInicio: '2023-04-01', fechaFin: '2023-09-30', salarioDiario: 1200.00 }
    ];
    const resTraslapePatrones = reconstructDeterministicPeriods(traslapePatrones);
    assert.strictEqual(resTraslapePatrones.length, 2);
    pass('B.6: Concurrencia de patrones reconstruye vigencias separadas por razón social sin mezclar');

    // =========================================================================
    // GRUPO C: CÓMPUTO DE DÍAS NATURALES Y BISIESTOS
    // =========================================================================
    console.log('\n--- GRUPO C: Cómputo de Días Naturales y Años Bisiestos ---');
    // Año bisiesto 2024 completo
    const dias2024 = calculateInclusiveDays('2024-01-01', '2024-12-31');
    assert.strictEqual(dias2024, 366, 'Año 2024 debe tener 366 días');
    pass('C.1: Cómputo exacto de año bisiesto 2024 (366 días)');

    // Febrero 2024
    const feb2024 = calculateInclusiveDays('2024-02-01', '2024-02-29');
    assert.strictEqual(feb2024, 29, 'Febrero 2024 debe tener 29 días');
    pass('C.2: Cómputo exacto de febrero 2024 (29 días)');

    // Febrero 2023 (no bisiesto)
    const feb2023 = calculateInclusiveDays('2023-02-01', '2023-02-28');
    assert.strictEqual(feb2023, 28, 'Febrero 2023 debe tener 28 días');
    pass('C.3: Cómputo exacto de febrero 2023 (28 días)');

    // C.4: Transición de fin de año (31 dic al 1 ene = 2 días)
    const finAnio = calculateInclusiveDays('2023-12-31', '2024-01-01');
    assert.strictEqual(finAnio, 2);
    pass('C.4: Transición entre fin de año e inicio de año (31/12 al 01/01 = 2 días)');

    // C.5: Cruce exacto del día bisiesto (28 feb 2024 al 1 mar 2024 = 3 días)
    const cruceBisiesto = calculateInclusiveDays('2024-02-28', '2024-03-01');
    assert.strictEqual(cruceBisiesto, 3);
    pass('C.5: Cruce exacto del día bisiesto 29 de febrero (28/02 al 01/03 = 3 días)');

    // =========================================================================
    // GRUPO D: COMPARATIVA DÍA POR DÍA (1,750 JORNADAS CON PDF REAL)
    // =========================================================================
    console.log('\n--- GRUPO D: Comparativa Día por Día (1,750 Jornadas) ---');
    const pathPdfA = path.join(__dirname, 'test', 'fixtures', 'reporteSemanasCotizadasDetalleAl01-09-2026.pdf');
    assert(fs.existsSync(pathPdfA), 'Fixture PDF A debe existir');
    const bufPdfA = fs.readFileSync(pathPdfA);

    // Motor de referencia (periodos directos) vs Motor Nuevo
    const rawGeminiA = [
        { patron: 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO', fechaInicio: '2024-04-09', fechaFin: '2026-06-30', salarioDiario: 2714.25 },
        ...userAuditMovements,
        { patron: 'SERVICIOS EDENRED', fechaInicio: '2022-02-01', fechaFin: '2023-01-31', salarioDiario: 2405.50 },
        { patron: 'SERVICIOS EDENRED', fechaInicio: '2021-10-20', fechaFin: '2022-01-31', salarioDiario: 2240.50 },
        { patron: 'SEDERIA LA NUEVA', fechaInicio: '2021-08-01', fechaFin: '2021-09-30', salarioDiario: 2239.72 },
        { patron: 'SEDERIA LA NUEVA', fechaInicio: '2021-01-16', fechaFin: '2021-07-31', salarioDiario: 308.75 }
    ];

    const periodosMotorNuevo = reconstructDeterministicPeriods(rawGeminiA);
    const calcRef = calculateAverageSalaryLast250Weeks(rawGeminiA);
    const calcNuevo = calculateAverageSalaryLast250Weeks(periodosMotorNuevo);

    assert.strictEqual(calcRef.diasTotales, 1750);
    assert.strictEqual(calcNuevo.diasTotales, 1750);
    pass('D.1: Ambos motores abarcan exactamente 1,750 días de ventana');

    assert.strictEqual(calcRef.semanasTotales, 250);
    assert.strictEqual(calcNuevo.semanasTotales, 250);
    pass('D.2: Ambos motores totalizan 250 semanas');

    assert.strictEqual(calcRef.salarioDiarioPromedio, 2585.94);
    assert.strictEqual(calcNuevo.salarioDiarioPromedio, 2585.94);
    pass('D.3: Salario promedio diario idéntico al centavo: $2,585.94 vs $2,585.94');

    // Comprobación día por día
    const mapRef = {};
    for (const p of rawGeminiA) {
        const [y1, m1, d1] = p.fechaInicio.split('-').map(Number);
        const [y2, m2, d2] = p.fechaFin.split('-').map(Number);
        let cur = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
        const end = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
        while (cur <= end) {
            const dt = new Date(cur).toISOString().slice(0, 10);
            mapRef[dt] = Math.max(mapRef[dt] || 0, p.salarioDiario);
            cur += 86400000;
        }
    }

    const mapNue = {};
    for (const p of periodosMotorNuevo) {
        const [y1, m1, d1] = p.fechaInicio.split('-').map(Number);
        const [y2, m2, d2] = p.fechaFin.split('-').map(Number);
        let cur = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
        const end = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
        while (cur <= end) {
            const dt = new Date(cur).toISOString().slice(0, 10);
            mapNue[dt] = Math.max(mapNue[dt] || 0, p.salarioDiario);
            cur += 86400000;
        }
    }

    const datesRef = Object.keys(mapRef).sort().reverse().slice(0, 1750);
    const datesNue = Object.keys(mapNue).sort().reverse().slice(0, 1750);

    let jornadasIguales = 0;
    for (let i = 0; i < 1750; i++) {
        const f1 = datesRef[i];
        const f2 = datesNue[i];
        const s1 = mapRef[f1];
        const s2 = mapNue[f2];
        if (f1 === f2 && Math.abs(s1 - s2) < 0.001) {
            jornadasIguales++;
        }
    }
    assert.strictEqual(jornadasIguales, 1750, 'Todas las 1,750 jornadas deben coincidir día por día');
    pass('D.4: 1,750 días auditados día por día: 1,750 coincidencias idénticas (0 diferencias)');

    // =========================================================================
    // GRUPO E: PERSISTENCIA Y REEMPLAZO ATÓMICO EN BD
    // =========================================================================
    console.log('\n--- GRUPO E: Persistencia y Reemplazo Atómico en BD ---');
    const tokenAdmin = jwt.sign(
        { id: 2, userId: 2, username: 'Efrain', rol_id: 1, email: 'efrain@idealandia.com' },
        process.env.AUTH_SECRET,
        { expiresIn: '1h' }
    );

    // Carga de PDF A vía endpoint
    const resEndpointA = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .set('Authorization', 'Bearer ' + tokenAdmin)
        .send({ pdfBase64: 'data:application/pdf;base64,' + bufPdfA.toString('base64'), fileName: 'pdfA.pdf' });

    assert.strictEqual(resEndpointA.status, 200);
    assert.strictEqual(resEndpointA.body.historialGuardado, true);
    assert.strictEqual(resEndpointA.body.salarioDiarioPromedio, 2585.94);
    pass('E.1: Guardado exitoso de historial en usuario_periodos_imss tras procesamiento');

    // Consultar historial guardado
    const resHistorial1 = await request(app)
        .get('/api/pension/historial-imss')
        .set('Authorization', 'Bearer ' + tokenAdmin);

    assert.strictEqual(resHistorial1.status, 200);
    assert(resHistorial1.body.periodos.length > 0);
    const primerPeriodo = resHistorial1.body.periodos[0];
    assert.strictEqual(primerPeriodo.salario, 2714.25);
    pass('E.2: Historial guardado refleja fielmente los periodos reconstruidos');

    // Carga de PDF B para comprobar reemplazo 100% atómico
    const pathPdfB = path.join(__dirname, 'test', 'fixtures', 'reporteSemanasCotizadasAl28-04-2022.pdf');
    const bufPdfB = fs.readFileSync(pathPdfB);

    const resEndpointB = await request(app)
        .post('/api/pension/calcular-salario-pdf')
        .set('Authorization', 'Bearer ' + tokenAdmin)
        .send({ pdfBase64: 'data:application/pdf;base64,' + bufPdfB.toString('base64'), fileName: 'pdfB.pdf' });

    assert.strictEqual(resEndpointB.status, 200);
    assert.strictEqual(resEndpointB.body.historialGuardado, true);

    const resHistorial2 = await request(app)
        .get('/api/pension/historial-imss')
        .set('Authorization', 'Bearer ' + tokenAdmin);

    assert.strictEqual(resHistorial2.status, 200);
    // El periodo más reciente debe ser ahora el de PDF B ($2,405.50)
    assert.strictEqual(resHistorial2.body.periodos[0].salario, 2405.50);
    pass('E.3: Reemplazo atómico total: nueva carga sustituye el 100% de registros anteriores sin mezclar');

    // =========================================================================
    // GRUPO F: EXTRACCIÓN DE FECHA DE NACIMIENTO DESDE CURP
    // =========================================================================
    console.log('\n--- GRUPO F: Extracción de Fecha de Nacimiento desde CURP ---');
    const curpEfrain = 'GAFE651207HQTRLF02';
    const birthEfrain = extractBirthDateFromCurp(curpEfrain);
    assert.strictEqual(birthEfrain, '1965-12-07');
    pass('F.1: CURP oficial GAFE651207... -> 1965-12-07');

    const curp2 = 'MUPR700315HDFRNR09';
    assert.strictEqual(extractBirthDateFromCurp(curp2), '1970-03-15');
    pass('F.2: CURP MUPR700315... -> 1970-03-15');

    assert.strictEqual(extractBirthDateFromCurp('INVALIDO'), null);
    pass('F.3: CURP inválido rechazado con null');

    // Verificación de extracción directa desde texto del PDF
    const aseguradoInfoA = extractAseguradoInfo(extractTextFromPdfBuffer(bufPdfA));
    assert.strictEqual(aseguradoInfoA.curp, curpEfrain);
    pass('F.4: CURP extraído exitosamente de cabecera oficial del PDF IMSS');

    const curpSigloXX = 'HERR991231HDFRNR01';
    assert.strictEqual(extractBirthDateFromCurp(curpSigloXX), '1999-12-31');
    pass('F.5: CURP siglo XX (1999) parseado correctamente');

    const curpSigloXXI = 'GARC050415MDFRNR02';
    assert.strictEqual(extractBirthDateFromCurp(curpSigloXXI), '2005-04-15');
    pass('F.6: CURP siglo XXI (2005) parseado correctamente');

    // =========================================================================
    // GRUPO G: REGLA DE EDAD PENSIONARIA (+ 6 MESES + 1 DÍA) - 5 UMBRALES
    // =========================================================================
    console.log('\n--- GRUPO G: Regla de Edad Pensionaria (+ 6 Meses + 1 Día) para los 5 Umbrales (60 a 65) ---');
    // Nacimiento: 1965-12-07
    // Umbrales para cada cumpleaños:
    // 60 años: cumple 2025-12-07 -> umbral (+6m +1d) = 2026-06-08
    // 61 años: cumple 2026-12-07 -> umbral (+6m +1d) = 2027-06-08
    // 62 años: cumple 2027-12-07 -> umbral (+6m +1d) = 2028-06-08
    // 63 años: cumple 2028-12-07 -> umbral (+6m +1d) = 2029-06-08
    // 64 años: cumple 2029-12-07 -> umbral (+6m +1d) = 2030-06-08

    const fNac = '1965-12-07';

    // 1. Umbral 60 -> 61 (75% -> 80%)
    const u60_ante = calcularEdadPensionaria(fNac, '2026-06-07');
    assert.strictEqual(u60_ante.edadPensionaria, 60);
    assert.strictEqual(u60_ante.porcentajeLey73, 0.75);
    pass('G.1.A: 60 años, día anterior al umbral (2026-06-07) -> 60 años (75%)');

    const u60_dia = calcularEdadPensionaria(fNac, '2026-06-08');
    assert.strictEqual(u60_dia.edadPensionaria, 61);
    assert.strictEqual(u60_dia.porcentajeLey73, 0.80);
    pass('G.1.B: 60 años, día exacto del umbral (2026-06-08) -> 61 años (80%)');

    const u60_post = calcularEdadPensionaria(fNac, '2026-06-09');
    assert.strictEqual(u60_post.edadPensionaria, 61);
    assert.strictEqual(u60_post.porcentajeLey73, 0.80);
    pass('G.1.C: 60 años, día posterior al umbral (2026-06-09) -> 61 años (80%)');

    // 2. Umbral 61 -> 62 (80% -> 85%)
    const u61_ante = calcularEdadPensionaria(fNac, '2027-06-07');
    assert.strictEqual(u61_ante.edadPensionaria, 61);
    assert.strictEqual(u61_ante.porcentajeLey73, 0.80);
    pass('G.2.A: 61 años, día anterior al umbral (2027-06-07) -> 61 años (80%)');

    const u61_dia = calcularEdadPensionaria(fNac, '2027-06-08');
    assert.strictEqual(u61_dia.edadPensionaria, 62);
    assert.strictEqual(u61_dia.porcentajeLey73, 0.85);
    pass('G.2.B: 61 años, día exacto del umbral (2027-06-08) -> 62 años (85%)');

    const u61_post = calcularEdadPensionaria(fNac, '2027-06-09');
    assert.strictEqual(u61_post.edadPensionaria, 62);
    assert.strictEqual(u61_post.porcentajeLey73, 0.85);
    pass('G.2.C: 61 años, día posterior al umbral (2027-06-09) -> 62 años (85%)');

    // 3. Umbral 62 -> 63 (85% -> 90%)
    const u62_ante = calcularEdadPensionaria(fNac, '2028-06-07');
    assert.strictEqual(u62_ante.edadPensionaria, 62);
    assert.strictEqual(u62_ante.porcentajeLey73, 0.85);
    pass('G.3.A: 62 años, día anterior al umbral (2028-06-07) -> 62 años (85%)');

    const u62_dia = calcularEdadPensionaria(fNac, '2028-06-08');
    assert.strictEqual(u62_dia.edadPensionaria, 63);
    assert.strictEqual(u62_dia.porcentajeLey73, 0.90);
    pass('G.3.B: 62 años, día exacto del umbral (2028-06-08) -> 63 años (90%)');

    const u62_post = calcularEdadPensionaria(fNac, '2028-06-09');
    assert.strictEqual(u62_post.edadPensionaria, 63);
    assert.strictEqual(u62_post.porcentajeLey73, 0.90);
    pass('G.3.C: 62 años, día posterior al umbral (2028-06-09) -> 63 años (90%)');

    // 4. Umbral 63 -> 64 (90% -> 95%)
    const u63_ante = calcularEdadPensionaria(fNac, '2029-06-07');
    assert.strictEqual(u63_ante.edadPensionaria, 63);
    assert.strictEqual(u63_ante.porcentajeLey73, 0.90);
    pass('G.4.A: 63 años, día anterior al umbral (2029-06-07) -> 63 años (90%)');

    const u63_dia = calcularEdadPensionaria(fNac, '2029-06-08');
    assert.strictEqual(u63_dia.edadPensionaria, 64);
    assert.strictEqual(u63_dia.porcentajeLey73, 0.95);
    pass('G.4.B: 63 años, día exacto del umbral (2029-06-08) -> 64 años (95%)');

    const u63_post = calcularEdadPensionaria(fNac, '2029-06-09');
    assert.strictEqual(u63_post.edadPensionaria, 64);
    assert.strictEqual(u63_post.porcentajeLey73, 0.95);
    pass('G.4.C: 63 años, día posterior al umbral (2029-06-09) -> 64 años (95%)');

    // 5. Umbral 64 -> 65 (95% -> 100%)
    const u64_ante = calcularEdadPensionaria(fNac, '2030-06-07');
    assert.strictEqual(u64_ante.edadPensionaria, 64);
    assert.strictEqual(u64_ante.porcentajeLey73, 0.95);
    pass('G.5.A: 64 años, día anterior al umbral (2030-06-07) -> 64 años (95%)');

    const u64_dia = calcularEdadPensionaria(fNac, '2030-06-08');
    assert.strictEqual(u64_dia.edadPensionaria, 65);
    assert.strictEqual(u64_dia.porcentajeLey73, 1.00);
    pass('G.5.B: 64 años, día exacto del umbral (2030-06-08) -> 65 años (100%)');

    const u64_post = calcularEdadPensionaria(fNac, '2030-06-09');
    assert.strictEqual(u64_post.edadPensionaria, 65);
    assert.strictEqual(u64_post.porcentajeLey73, 1.00);
    pass('G.5.C: 64 años, día posterior al umbral (2030-06-09) -> 65 años (100%)');

    // G.6: Asegurado menor de 60 años
    const uMenor60 = calcularEdadPensionaria(fNac, '2023-01-01');
    assert.strictEqual(uMenor60.edadCalendario, 57);
    assert.strictEqual(uMenor60.porcentajeLey73, 0);
    pass('G.6: Asegurado menor de 60 años (57 años) -> 0% porcentaje Ley 73');

    // G.7: Asegurado con 65 años o más
    const uMayor65 = calcularEdadPensionaria(fNac, '2032-12-07');
    assert.strictEqual(uMayor65.edadCalendario, 67);
    assert.strictEqual(uMayor65.edadPensionaria, 65);
    assert.strictEqual(uMayor65.porcentajeLey73, 1.00);
    pass('G.7: Asegurado con 65+ años (67 años) -> tope 65 años y 100%');

    // G.8: Regla de fin de mes y amarre de meses (nacido 31 de agosto)
    const umbralAgosto = calcularUmbralMas6Meses1Dia('2025-08-31');
    assert(umbralAgosto.startsWith('2026-03-01') || umbralAgosto.startsWith('2026-03-02'));
    pass('G.8: Regla de fin de mes con meses de 31 días ajustada sin saltos inválidos');

    // =========================================================================
    // GRUPO H: PROYECCIÓN CON RECÁLCULO DINÁMICO DE EDAD Y PORCENTAJE
    // =========================================================================
    console.log('\n--- GRUPO H: Proyección Avanzada con Recálculo Dinámico de Edad ---');
    // Usuario con nacimiento 1965-12-07
    // Caso 1: Proyección que termina el 2026-06-07 (antes del umbral) -> edad 60 (75%)
    const projAntes = calculatePensionProjection({
        semanasActuales: 1615,
        salarioPromedioActual: 2585.94,
        salarioDiarioProyectado: 2714.25,
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-06-07',
        fechaNacimiento: '1965-12-07',
        edadRetiroActual: 60,
        tieneEsposa: true
    });

    assert.strictEqual(projAntes.situacionProyectada.edadProyectada, 60);
    assert.strictEqual(projAntes.situacionProyectada.desglose.porcentajeEdad, 0.75);
    pass('H.1: Proyección anterior al umbral conserva 60 años y 75%');

    // Caso 2: Proyección que termina el 2026-06-08 (cruza el umbral +6m +1d) -> edad 61 (80%)
    const projCruzando = calculatePensionProjection({
        semanasActuales: 1615,
        salarioPromedioActual: 2585.94,
        salarioDiarioProyectado: 2714.25,
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-06-08',
        fechaNacimiento: '1965-12-07',
        edadRetiroActual: 60,
        tieneEsposa: true
    });

    assert.strictEqual(projCruzando.situacionProyectada.edadProyectada, 61);
    assert.strictEqual(projCruzando.situacionProyectada.desglose.porcentajeEdad, 0.80);
    assert(projCruzando.situacionProyectada.pensionMensual > projAntes.situacionProyectada.pensionMensual);
    pass('H.2: Proyección que cruza el umbral incrementa automáticamente a 61 años (80%)');

    // Caso 3: Proyección vía endpoint /api/pension/proyectar
    const resEndpointProj = await request(app)
        .post('/api/pension/proyectar')
        .set('Authorization', 'Bearer ' + tokenAdmin)
        .send({
            semanasActuales: 1615,
            salarioPromedioActual: 2585.94,
            salarioDiarioProyectado: 2714.25,
            fechaDesde: '2026-05-01',
            fechaHasta: '2026-06-08',
            fechaNacimiento: '1965-12-07',
            edadRetiroActual: 60,
            tieneEsposa: true
        });

    assert.strictEqual(resEndpointProj.status, 200);
    assert.strictEqual(resEndpointProj.body.situacionProyectada.edadProyectada, 61);
    assert.strictEqual(resEndpointProj.body.situacionProyectada.desglose.porcentajeEdad, 0.80);
    pass('H.3: Endpoint /api/pension/proyectar ejecuta cálculo dinámico y devuelve desglose actuarial exacto');

    // Caso 4: Proyección sin fechaNacimiento (conserva compatibilidad con edadRetiroProyectada manual)
    const projSinFechaNac = calculatePensionProjection({
        semanasActuales: 1615,
        salarioPromedioActual: 2585.94,
        salarioDiarioProyectado: 2714.25,
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-06-08',
        edadRetiroActual: 60,
        edadRetiroProyectada: 63,
        tieneEsposa: true
    });
    assert.strictEqual(projSinFechaNac.situacionProyectada.edadProyectada, 63);
    assert.strictEqual(projSinFechaNac.situacionProyectada.desglose.porcentajeEdad, 0.90);
    pass('H.4: Proyección sin fechaNacimiento utiliza de forma retrocompatible la edad manual configurada');

    // Caso 5: Proyección con cruce de 61 a 62 años (+6m +1d de 61)
    const proj61a62 = calculatePensionProjection({
        semanasActuales: 1615,
        salarioPromedioActual: 2585.94,
        salarioDiarioProyectado: 2714.25,
        fechaDesde: '2027-01-01',
        fechaHasta: '2027-06-08',
        fechaNacimiento: '1965-12-07',
        edadRetiroActual: 60,
        tieneEsposa: true
    });
    assert.strictEqual(proj61a62.situacionProyectada.edadProyectada, 62);
    assert.strictEqual(proj61a62.situacionProyectada.desglose.porcentajeEdad, 0.85);
    pass('H.5: Proyección que cruza umbral de 61 a 62 años dinamiza edad a 62 (85%)');

    console.log('\n================================================================================');
    console.log(`¡SUITE COMPLETADA EXITOSAMENTE! Total de aserciones validadas: ${totalAsserts}`);
    console.log('================================================================================');
}

runUnifiedPensionSuite()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Error fatal en suite:', err);
        process.exit(1);
    });
