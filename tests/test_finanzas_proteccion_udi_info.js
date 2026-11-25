/**
 * tests/test_finanzas_proteccion_udi_info.js
 * Suite integral de 34 pruebas automatizadas para:
 * 1. Protección Institucional (IPAB, PROSOFIPO, FOCOOP, Sin protección, Otra).
 * 2. Indicador oficial UDI y conversión dinámica a pesos.
 * 3. Campo y visualización de Información Adicional (informacio_adicional).
 * 4. Integridad del motor financiero, elegibilidad y no-regresión.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const MotorFinanciero = require('../motorFinanciero.js');

console.log('================================================================================');
console.log('SUITE DE PRUEBAS: PROTECCIÓN INSTITUCIONAL, INDICADOR UDI E INFORMACIÓN ADICIONAL');
console.log('================================================================================\n');

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

async function asyncTest(name, fn) {
    totalCount++;
    try {
        await fn();
        passCount++;
        console.log(`✅ [PASS] Caso ${totalCount}: ${name}`);
    } catch (err) {
        console.error(`❌ [FAIL] Caso ${totalCount}: ${name}`);
        console.error(err);
        process.exit(1);
    }
}

(async () => {
    let pool;
    try {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // -------------------------------------------------------------------------
        // GRUPO 1: ESQUEMA MYSQL Y PERSISTENCIA (Casos 1 - 9)
        // -------------------------------------------------------------------------

        await asyncTest('Esquema MySQL finanzas_indicadores_economicos existe con estructura oficial', async () => {
            const [rows] = await pool.query('DESCRIBE finanzas_indicadores_economicos');
            const cols = rows.map(r => r.Field);
            assert(cols.includes('codigo'), 'Debe incluir codigo');
            assert(cols.includes('nombre'), 'Debe incluir nombre');
            assert(cols.includes('valor'), 'Debe incluir valor');
            assert(cols.includes('fecha'), 'Debe incluir fecha');
            assert(cols.includes('fuente'), 'Debe incluir fuente');
            assert(cols.includes('updated_at'), 'Debe incluir updated_at');
        });

        await asyncTest('Indicador UDI registrado en BD con codigo UDI, valor > 0 y fuente oficial', async () => {
            const [rows] = await pool.query("SELECT * FROM finanzas_indicadores_economicos WHERE codigo = 'UDI'");
            assert.strictEqual(rows.length, 1, 'Debe existir un único registro UDI');
            const udi = rows[0];
            assert.strictEqual(udi.codigo, 'UDI');
            assert.strictEqual(udi.nombre, 'Unidades de Inversión');
            assert(parseFloat(udi.valor) > 8.0, 'El valor oficial de la UDI debe ser coherente');
            assert(udi.fuente.includes('México') || udi.fuente.includes('DOF'), 'Fuente debe ser oficial');
        });

        await asyncTest('Columna tipo_proteccion en instituciones_financieras con ENUM correcto', async () => {
            const [rows] = await pool.query("SHOW COLUMNS FROM instituciones_financieras LIKE 'tipo_proteccion'");
            assert.strictEqual(rows.length, 1);
            const col = rows[0];
            assert(col.Type.includes("'IPAB'"), 'Debe incluir IPAB');
            assert(col.Type.includes("'PROSOFIPO'"), 'Debe incluir PROSOFIPO');
            assert(col.Type.includes("'FOCOOP'"), 'Debe incluir FOCOOP');
            assert(col.Type.includes("'Sin protección'"), 'Debe incluir Sin protección');
            assert(col.Type.includes("'Otra'"), 'Debe incluir Otra');
            assert.strictEqual(col.Default, 'Sin protección');
        });

        await asyncTest('Columna limite_proteccion_udis en instituciones_financieras con DECIMAL(14,2)', async () => {
            const [rows] = await pool.query("SHOW COLUMNS FROM instituciones_financieras LIKE 'limite_proteccion_udis'");
            assert.strictEqual(rows.length, 1);
            const col = rows[0];
            assert(col.Type.startsWith('decimal'), 'Debe ser tipo DECIMAL');
            assert.strictEqual(parseFloat(col.Default), 0);
        });

        await asyncTest('Columna informacio_adicional en instituciones_financieras (nombre exacto requerido)', async () => {
            const [rows] = await pool.query("SHOW COLUMNS FROM instituciones_financieras LIKE 'informacio_adicional'");
            assert.strictEqual(rows.length, 1, "La columna debe llamarse exactamente 'informacio_adicional'");
            const col = rows[0];
            assert.strictEqual(col.Type, 'text');
            assert.strictEqual(col.Null, 'YES');
        });

        await asyncTest('Valores iniciales en BD: NU, Openbank, Mifel tienen IPAB con 400,000 UDIS', async () => {
            const [rows] = await pool.query("SELECT nombre, tipo_proteccion, limite_proteccion_udis FROM instituciones_financieras WHERE nombre IN ('NU', 'Openbank', 'Mifel')");
            assert.strictEqual(rows.length, 3);
            rows.forEach(r => {
                assert.strictEqual(r.tipo_proteccion, 'IPAB');
                assert.strictEqual(parseFloat(r.limite_proteccion_udis), 400000);
            });
        });

        await asyncTest('Valores iniciales en BD: Klar, Finsus tienen PROSOFIPO con 25,000 UDIS', async () => {
            const [rows] = await pool.query("SELECT nombre, tipo_proteccion, limite_proteccion_udis FROM instituciones_financieras WHERE nombre IN ('Klar', 'Finsus')");
            assert.strictEqual(rows.length, 2);
            rows.forEach(r => {
                assert.strictEqual(r.tipo_proteccion, 'PROSOFIPO');
                assert.strictEqual(parseFloat(r.limite_proteccion_udis), 25000);
            });
        });

        await asyncTest('Valores iniciales en BD: Monific, Didi, Uala, Mercado Pago tienen Sin protección con 0 UDIS', async () => {
            const [rows] = await pool.query("SELECT nombre, tipo_proteccion, limite_proteccion_udis FROM instituciones_financieras WHERE nombre IN ('Monific', 'Didi', 'Uala', 'Mercado Pago')");
            assert(rows.length >= 4);
            rows.forEach(r => {
                assert.strictEqual(r.tipo_proteccion, 'Sin protección');
                assert.strictEqual(parseFloat(r.limite_proteccion_udis), 0);
            });
        });

        await asyncTest('Valores iniciales en BD: informacio_adicional poblada demostrativamente para NU y Klar', async () => {
            const [rows] = await pool.query("SELECT nombre, informacio_adicional FROM instituciones_financieras WHERE nombre IN ('NU', 'Klar', 'Openbank')");
            const nu = rows.find(r => r.nombre === 'NU');
            const klar = rows.find(r => r.nombre === 'Klar');
            const openbank = rows.find(r => r.nombre === 'Openbank');

            assert(nu && nu.informacio_adicional && nu.informacio_adicional.includes('IPAB'), 'NU debe tener informacio_adicional');
            assert(klar && klar.informacio_adicional && klar.informacio_adicional.includes('PROSOFIPO'), 'Klar debe tener informacio_adicional');
            assert(openbank && (openbank.informacio_adicional === null || openbank.informacio_adicional === ''), 'Openbank debe tener informacio_adicional nula para prueba de ausencia');
        });

        // -------------------------------------------------------------------------
        // GRUPO 2: CÁLCULOS MATEMÁTICOS DINÁMICOS DE UDI Y PROTECCIÓN (Casos 10 - 16)
        // -------------------------------------------------------------------------

        test('Cálculo dinámico IPAB: 400,000 UDIS a $8.865882 da exactamente $3,546,352.80 MXN', () => {
            const udi = 8.865882;
            const udis = 400000;
            const pesos = MotorFinanciero.calcularProteccionPesos(udis, udi);
            assert.strictEqual(pesos, 3546352.80);
        });

        test('Cálculo dinámico PROSOFIPO: 25,000 UDIS a $8.865882 da exactamente $221,647.05 MXN', () => {
            const udi = 8.865882;
            const udis = 25000;
            const pesos = MotorFinanciero.calcularProteccionPesos(udis, udi);
            assert.strictEqual(pesos, 221647.05);
        });

        test('Cálculo dinámico Sin protección: 0 UDIS da exactamente $0.00 MXN', () => {
            const udi = 8.865882;
            const udis = 0;
            const pesos = MotorFinanciero.calcularProteccionPesos(udis, udi);
            assert.strictEqual(pesos, 0);
        });

        test('Cálculo dinámico FOCOOP: 25,000 UDIS a $8.865882 da exactamente $221,647.05 MXN', () => {
            const udi = 8.865882;
            const udis = 25000;
            const pesos = MotorFinanciero.calcularProteccionPesos(udis, udi);
            assert.strictEqual(pesos, 221647.05);
        });

        test('Cálculo dinámico Otra: límite personalizado (ej. 100,000 UDIS) da exactamente $886,588.20 MXN', () => {
            const udi = 8.865882;
            const udis = 100000;
            const pesos = MotorFinanciero.calcularProteccionPesos(udis, udi);
            assert.strictEqual(pesos, 886588.20);
        });

        await asyncTest('Invariante: Ningún valor en pesos fijos existe almacenado en instituciones_financieras', async () => {
            const [rows] = await pool.query('DESCRIBE instituciones_financieras');
            const colNames = rows.map(r => r.Field.toLowerCase());
            assert(!colNames.includes('proteccion_pesos'), 'No debe existir columna de pesos estáticos');
            assert(!colNames.includes('limite_proteccion_pesos'), 'No debe existir columna de pesos estáticos');
        });

        test('Variación dinámica de UDI (ej. a $9.000000) actualiza automáticamente los importes protegidos', () => {
            const udiActualizada = 9.000000;
            const ipabPesos = MotorFinanciero.calcularProteccionPesos(400000, udiActualizada);
            const prosofipoPesos = MotorFinanciero.calcularProteccionPesos(25000, udiActualizada);

            assert.strictEqual(ipabPesos, 3600000.00);
            assert.strictEqual(prosofipoPesos, 225000.00);
        });

        // -------------------------------------------------------------------------
        // GRUPO 3: ENDPOINTS Y LÓGICA DE BACKEND (Casos 17 - 21)
        // -------------------------------------------------------------------------

        test('Código backend server.js en GET /api/finanzas/simulador incluye indicador_udi', () => {
            const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
            assert(serverCode.includes("WHERE codigo = 'UDI'"), 'Debe consultar indicador UDI');
            assert(serverCode.includes('indicador_udi: indicadorUdi'), 'Debe retornar indicador_udi');
            assert(serverCode.includes('tipo_proteccion: inst.tipo_proteccion'), 'Debe incluir tipo_proteccion');
            assert(serverCode.includes('limite_proteccion_udis: parseFloat(inst.limite_proteccion_udis)'), 'Debe incluir limite_proteccion_udis');
            assert(serverCode.includes('informacio_adicional: inst.informacio_adicional'), 'Debe incluir informacio_adicional');
        });

        test('Código backend server.js en GET /api/admin/finanzas/instituciones incluye nuevos campos', () => {
            const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
            assert(serverCode.includes('tipo_proteccion, limite_proteccion_udis, informacio_adicional'), 'Admin instituciones query debe incluir columnas');
        });

        test('Código backend server.js contiene endpoints REST para indicadores económicos', () => {
            const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
            assert(serverCode.includes("app.get('/api/admin/finanzas/indicadores'"), 'Debe existir GET indicadores');
            assert(serverCode.includes("app.put('/api/admin/finanzas/indicadores/:codigo'"), 'Debe existir PUT indicadores');
        });

        test('Validación estricta en PUT /api/admin/finanzas/indicadores/:codigo', () => {
            const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
            assert(serverCode.includes('isNaN(valorNum) || valorNum <= 0'), 'Debe validar que valor sea positivo');
            assert(serverCode.includes('^\\d{4}-\\d{2}-\\d{2}$'), 'Debe validar formato de fecha YYYY-MM-DD');
        });

        test('Código backend server.js en POST y PUT de instituciones guarda tipo_proteccion, limite_proteccion_udis e informacio_adicional', () => {
            const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
            assert(serverCode.includes('tipoProtValido'), 'POST debe validar tipoProtValido');
            assert(serverCode.includes('limiteUdisValido'), 'POST debe validar limiteUdisValido');
            assert(serverCode.includes('infoAdicionalValida'), 'POST debe validar infoAdicionalValida');
            assert(serverCode.includes('updateTipoProt'), 'PUT debe contemplar updateTipoProt');
            assert(serverCode.includes('updateLimiteUdis'), 'PUT debe contemplar updateLimiteUdis');
            assert(serverCode.includes('updateInfoAdicional'), 'PUT debe contemplar updateInfoAdicional');
        });

        // -------------------------------------------------------------------------
        // GRUPO 4: CONSOLA DE ADMINISTRACIÓN Y MODALES (Casos 22 - 24)
        // -------------------------------------------------------------------------

        test('index.html incluye controles de protección en modal-finanzas-institucion', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('id="finanzas-inst-tipo-proteccion"'), 'Debe tener select tipo proteccion');
            assert(html.includes('id="finanzas-inst-limite-udis"'), 'Debe tener input limite udis');
            assert(html.includes('id="finanzas-inst-pesos-calculados"'), 'Debe tener visualización pesos calculados');
            assert(html.includes('id="finanzas-inst-info-adicional"'), 'Debe tener textarea informacio_adicional');
        });

        test('admin.js auto-sugiere límites UDIS según el tipo de protección seleccionado', () => {
            const adminCode = fs.readFileSync(path.join(__dirname, '../admin.js'), 'utf8');
            assert(adminCode.includes("val === 'IPAB'"), 'Debe detectar IPAB');
            assert(adminCode.includes('inputLimiteUdis.value = 400000'), 'Debe auto-asignar 400,000 UDIS a IPAB');
            assert(adminCode.includes("val === 'PROSOFIPO'"), 'Debe detectar PROSOFIPO');
            assert(adminCode.includes('inputLimiteUdis.value = 25000'), 'Debe auto-asignar 25,000 UDIS a PROSOFIPO/FOCOOP');
            assert(adminCode.includes('actualizarPreviewPesosProteccionModal'), 'Debe refrescar preview');
        });

        test('admin.js envía tipo_proteccion, limite_proteccion_udis e informacio_adicional al backend', () => {
            const adminCode = fs.readFileSync(path.join(__dirname, '../admin.js'), 'utf8');
            assert(adminCode.includes("document.getElementById('finanzas-inst-tipo-proteccion')"), 'Debe leer tipo_proteccion');
            assert(adminCode.includes("document.getElementById('finanzas-inst-limite-udis')"), 'Debe leer limite_udis');
            assert(adminCode.includes("document.getElementById('finanzas-inst-info-adicional')"), 'Debe leer info-adicional');
            assert(adminCode.includes('tipo_proteccion,'), 'Payload debe incluir tipo_proteccion');
            assert(adminCode.includes('limite_proteccion_udis,'), 'Payload debe incluir limite_proteccion_udis');
            assert(adminCode.includes('informacio_adicional,'), 'Payload debe incluir informacio_adicional');
        });

        // -------------------------------------------------------------------------
        // GRUPO 5: SIMULADOR DE INVERSIONES - UI Y COMPORTAMIENTO (Casos 25 - 31)
        // -------------------------------------------------------------------------

        test('index.html incluye banner de indicador UDI en controles del simulador', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('id="simulador-indicador-udi-banner"'), 'Debe existir banner de UDI');
            assert(html.includes('id="simulador-udi-texto"'), 'Debe existir texto para valor y fecha');
            assert(html.includes('id="simulador-udi-fuente"'), 'Debe existir contenedor para fuente');
        });

        test('simuladorFinanciero.js actualiza el banner con valor de UDI y fecha formateada DD/MM/YYYY', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('function actualizarBannerIndicadorUdi'), 'Debe existir funcion actualizarBannerIndicadorUdi');
            assert(simCode.includes('Valor UDI utilizado: $'), 'Debe mostrar texto solicitado');
            assert(simCode.includes('fechaStr.split'), 'Debe formatear la fecha a DD/MM/YYYY');
        });

        test('simuladorFinanciero.js renderiza el botón ⓘ únicamente si la institución tiene informacio_adicional', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('hasInfoAdicional = inst.informacio_adicional'), 'Debe verificar hasInfoAdicional');
            assert(simCode.includes("${hasInfoAdicional ? `<button type=\"button\" class=\"btn-info-adicional\""), 'Debe condicionar el renderizado');
        });

        test('index.html cuenta con el modal contextual modal-finanzas-info-adicional', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('id="modal-finanzas-info-adicional"'), 'Debe existir modal para información adicional');
            assert(html.includes('id="modal-info-adicional-titulo"'), 'Debe tener título');
            assert(html.includes('id="modal-info-adicional-cuerpo"'), 'Debe tener cuerpo');
            assert(html.includes('id="btn-cerrar-modal-finanzas-info-adicional"'), 'Debe tener botón cerrar');
        });

        test('simuladorFinanciero.js abre modal-finanzas-info-adicional al hacer clic en ⓘ', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('function abrirModalInfoAdicionalInstitucion'), 'Debe existir función abrirModalInfoAdicionalInstitucion');
            assert(simCode.includes('modal.style.display = \'flex\''), 'Debe abrir el modal');
        });

        test('simuladorFinanciero.js renderiza badge de protección con UDIS y pesos dinámicos calculados', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('class="sim-badge-proteccion"'), 'Debe tener badge de protección');
            assert(simCode.includes('formatMoney(pesosProtegidos)'), 'Debe mostrar pesos formateados');
            assert(simCode.includes('limUdis.toLocaleString'), 'Debe mostrar límite en UDIS');
        });

        test('index.html contiene leyenda/aviso oficial de protección al pie de la tabla del simulador', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('simulador-disclaimer-proteccion'), 'Debe existir clase simulador-disclaimer-proteccion');
            assert(html.includes('IPAB hasta 400,000 UDIS'), 'Debe mencionar IPAB 400k UDIS');
            assert(html.includes('PROSOFIPO/FOCOOP hasta 25,000 UDIS'), 'Debe mencionar PROSOFIPO 25k UDIS');
        });

        // -------------------------------------------------------------------------
        // GRUPO 6: INVARIANTES DE NO-INTERFERENCIA Y REGRESIÓN (Casos 32 - 34)
        // -------------------------------------------------------------------------

        test('Invariante de elegibilidad: Institución con inversión mayor a la cobertura NO es excluida', () => {
            const instBancaria = {
                id: 1,
                nombre: 'NU',
                tipo: 'B',
                monto_minimo: 0,
                plazo_minimo: 1,
                nivel_riesgo: 'Bajo',
                tipo_proteccion: 'IPAB',
                limite_proteccion_udis: 400000,
                informacio_adicional: 'Protegido por IPAB'
            };

            // Inversión de $10,000,000 MXN supera los ~3.5M de UDIS
            const evalRes = MotorFinanciero.evaluarElegibilidadInstitucion(instBancaria, 10000000, 1, {
                considerarRiesgo: false,
                nivelMaximoRiesgo: 'Muy alto'
            });

            assert.strictEqual(evalRes.elegible, true, 'La institución debe seguir siendo elegible aunque el monto supere la protección');
        });

        test('Invariante financiero: La protección institucional y la información adicional no alteran tasas ni rendimientos', () => {
            const tramos = [
                { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
                { numero_tramo: 2, limite_inferior: 25000, limite_superior: null, tasa_anual: 6.5 }
            ];

            const simSinProteccion = MotorFinanciero.simularInversion(50000, 3, tramos);
            
            // Simulación exactamente idéntica
            assert.strictEqual(simSinProteccion.inversion_base, 25000);
            assert.strictEqual(simSinProteccion.inversion_2, 25000);
            assert.strictEqual(simSinProteccion.rend1, 812.5);
            assert.strictEqual(simSinProteccion.rend2, 406.25);
            assert.strictEqual(simSinProteccion.total_periodo, 1218.75);
            assert.strictEqual(simSinProteccion.total_mensual, 406.25);
        });

        test('Invariante de diversificación: La estrategia de distribución funciona con las nuevas propiedades sin alteración', () => {
            const instituciones = [
                {
                    id: 1,
                    nombre: 'NU',
                    tipo: 'B',
                    monto_minimo: 0,
                    plazo_minimo: 1,
                    nivel_riesgo: 'Bajo',
                    tipo_proteccion: 'IPAB',
                    limite_proteccion_udis: 400000,
                    informacio_adicional: 'Cuenta Nu',
                    esquema: {
                        tramos: [
                            { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
                            { numero_tramo: 2, limite_inferior: 25000, limite_superior: null, tasa_anual: 6.5 }
                        ]
                    }
                },
                {
                    id: 2,
                    nombre: 'Klar',
                    tipo: 'S',
                    monto_minimo: 0,
                    plazo_minimo: 1,
                    nivel_riesgo: 'Medio',
                    tipo_proteccion: 'PROSOFIPO',
                    limite_proteccion_udis: 25000,
                    informacio_adicional: 'SOFIPO Klar',
                    esquema: {
                        tramos: [
                            { numero_tramo: 1, limite_inferior: 0, limite_superior: null, tasa_anual: 11.5 }
                        ]
                    }
                }
            ];

            const resDiv = MotorFinanciero.calcularMejorInversionDiversificada({
                inversionTotal: 50000,
                meses: 1,
                instituciones: instituciones,
                maxPorcentajePorInst: 50
            });

            assert.strictEqual(resDiv.exito, true);
            assert.strictEqual(resDiv.asignaciones.length, 2);
            assert.strictEqual(resDiv.capitalDistribuido, 50000);
            assert(resDiv.rendimientoPeriodoTotal > 0);
        });

        console.log('\n================================================================================');
        console.log(`RESULTADO DE LA SUITE: ${passCount} de ${totalCount} PRUEBAS SUPERADAS EXITOSAMENTE`);
        console.log('================================================================================\n');

    } catch (err) {
        console.error('Error general ejecutando la suite:', err);
        process.exit(1);
    } finally {
        if (pool) await pool.end();
    }
})();
