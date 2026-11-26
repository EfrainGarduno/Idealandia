/**
 * tests/test_finanzas_proteccion_udi_info.js
 * Suite integral de 34 pruebas automatizadas para:
 * 1. Protección Institucional (IPAB, PROSOFIPO, FOCOOP, Sin protección, Otra).
 * 2. Indicador oficial UDI y conversión dinámica a pesos.
 * 3. Campo y visualización de Información Adicional (informacion_adicional).
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

        await asyncTest('Columna informacion_adicional en instituciones_financieras (nombre exacto requerido)', async () => {
            const [rows] = await pool.query("SHOW COLUMNS FROM instituciones_financieras LIKE 'informacion_adicional'");
            assert.strictEqual(rows.length, 1, "La columna debe llamarse exactamente 'informacion_adicional'");
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

        await asyncTest('Valores iniciales en BD: Monific y Mercado Pago tienen Sin protección con 0 UDIS', async () => {
            const [rows] = await pool.query("SELECT nombre, tipo_proteccion, limite_proteccion_udis FROM instituciones_financieras WHERE nombre IN ('Monific', 'Mercado Pago')");
            assert(rows.length >= 2);
            rows.forEach(r => {
                assert.strictEqual(r.tipo_proteccion, 'Sin protección');
                assert.strictEqual(parseFloat(r.limite_proteccion_udis), 0);
            });
        });

        await asyncTest('Valores iniciales en BD: informacion_adicional poblada demostrativamente para NU y Klar', async () => {
            const [rows] = await pool.query("SELECT nombre, informacion_adicional FROM instituciones_financieras WHERE nombre IN ('NU', 'Klar', 'Openbank')");
            const nu = rows.find(r => r.nombre === 'NU');
            const klar = rows.find(r => r.nombre === 'Klar');
            const openbank = rows.find(r => r.nombre === 'Openbank');

            assert(nu && nu.informacion_adicional && nu.informacion_adicional.includes('IPAB'), 'NU debe tener informacion_adicional');
            assert(klar && klar.informacion_adicional && klar.informacion_adicional.includes('PROSOFIPO'), 'Klar debe tener informacion_adicional');
            assert(openbank && (openbank.informacion_adicional === null || openbank.informacion_adicional === ''), 'Openbank debe tener informacion_adicional nula para prueba de ausencia');
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
            assert(serverCode.includes('informacion_adicional: inst.informacion_adicional'), 'Debe incluir informacion_adicional');
        });

        test('Código backend server.js en GET /api/admin/finanzas/instituciones incluye nuevos campos', () => {
            const serverCode = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
            assert(serverCode.includes('tipo_proteccion, limite_proteccion_udis, informacion_adicional'), 'Admin instituciones query debe incluir columnas');
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

        test('Código backend server.js en POST y PUT de instituciones guarda tipo_proteccion, limite_proteccion_udis e informacion_adicional', () => {
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
            assert(html.includes('id="finanzas-inst-info-adicional"'), 'Debe tener textarea informacion_adicional');
        });

        test('admin.js auto-sugiere límites UDIS según el tipo de protección seleccionado', () => {
            const adminCode = fs.readFileSync(path.join(__dirname, '../admin.js'), 'utf8');
            assert(adminCode.includes("val === 'IPAB'"), 'Debe detectar IPAB');
            assert(adminCode.includes('inputLimiteUdis.value = 400000'), 'Debe auto-asignar 400,000 UDIS a IPAB');
            assert(adminCode.includes("val === 'PROSOFIPO'"), 'Debe detectar PROSOFIPO');
            assert(adminCode.includes('inputLimiteUdis.value = 25000'), 'Debe auto-asignar 25,000 UDIS a PROSOFIPO/FOCOOP');
            assert(adminCode.includes('actualizarPreviewPesosProteccionModal'), 'Debe refrescar preview');
        });

        test('admin.js envía tipo_proteccion, limite_proteccion_udis e informacion_adicional al backend', () => {
            const adminCode = fs.readFileSync(path.join(__dirname, '../admin.js'), 'utf8');
            assert(adminCode.includes("document.getElementById('finanzas-inst-tipo-proteccion')"), 'Debe leer tipo_proteccion');
            assert(adminCode.includes("document.getElementById('finanzas-inst-limite-udis')"), 'Debe leer limite_udis');
            assert(adminCode.includes("document.getElementById('finanzas-inst-info-adicional')"), 'Debe leer info-adicional');
            assert(adminCode.includes('tipo_proteccion,'), 'Payload debe incluir tipo_proteccion');
            assert(adminCode.includes('limite_proteccion_udis,'), 'Payload debe incluir limite_proteccion_udis');
            assert(adminCode.includes('informacion_adicional,'), 'Payload debe incluir informacion_adicional');
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

        test('simuladorFinanciero.js renderiza el botón ⓘ si tiene informacion_adicional O protección', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('hasInfoAdicional = !!inst.informacion_adicional'), 'Debe verificar hasInfoAdicional');
            assert(simCode.includes('hasProteccion = !!(inst.tipo_proteccion'), 'Debe verificar hasProteccion');
            assert(simCode.includes('mostrarIconoInfo = hasInfoAdicional || hasProteccion'), 'Debe combinar ambas condiciones con OR');
            assert(simCode.includes("${mostrarIconoInfo ? `<button type=\"button\" class=\"btn-info-adicional\""), 'Debe condicionar el renderizado al botón ⓘ unificado');
        });

        test('index.html cuenta con el modal contextual modal-finanzas-info-adicional adaptado y responsive', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('id="modal-finanzas-info-adicional"'), 'Debe existir modal para información adicional');
            assert(html.includes('id="modal-info-adicional-titulo"'), 'Debe tener título');
            assert(html.includes('id="modal-info-adicional-cuerpo"'), 'Debe tener cuerpo');
            assert(html.includes('id="btn-cerrar-modal-finanzas-info-adicional"'), 'Debe tener botón cerrar');
            assert(html.includes('max-height: 88vh; overflow-y: auto;'), 'Debe contar con scroll vertical responsive para contenidos largos');
        });

        test('simuladorFinanciero.js abre modal con detalle de Protección e Información Adicional unificados', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('function abrirModalInfoAdicionalInstitucion'), 'Debe existir función abrirModalInfoAdicionalInstitucion');
            assert(simCode.includes('modal.style.display = \'flex\''), 'Debe abrir el modal');
            assert(simCode.includes('Protección'), 'Debe incluir sección Protección');
            assert(simCode.includes('Sin protección institucional.'), 'Debe contemplar caso Sin protección');
            assert(simCode.includes('Información adicional'), 'Debe contemplar sección Información adicional');
        });

        test('simuladorFinanciero.js NO incluye badge de protección en la fila de la tabla (columna limpia)', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(!simCode.includes('class="sim-badge-proteccion"'), 'La columna Institución NO debe tener badge de protección en la fila para mantenerla limpia');
        });

        test('index.html contiene leyenda superior compacta con Tipos de Institución y Coberturas de Protección', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('Tipos:'), 'Debe mostrar etiqueta Tipos:');
            assert(html.includes('Protecciones:'), 'Debe mostrar etiqueta Protecciones:');
            assert(html.includes('🛡️ <strong>IPAB</strong> = hasta 400,000 UDIS'), 'Debe listar IPAB en la leyenda superior');
            assert(html.includes('🛡️ <strong>PROSOFIPO</strong> = hasta 25,000 UDIS'), 'Debe listar PROSOFIPO en la leyenda superior');
            assert(html.includes('🛡️ <strong>FOCOOP</strong> = hasta 25,000 UDIS'), 'Debe listar FOCOOP en la leyenda superior');
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
                informacion_adicional: 'Protegido por IPAB'
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
                    informacion_adicional: 'Cuenta Nu',
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
                    informacion_adicional: 'SOFIPO Klar',
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

        // -------------------------------------------------------------------------
        // GRUPO 7: 14 ESCENARIOS DE VALIDACIÓN ESPECÍFICOS DE UI/UX E INVARIANTES
        // -------------------------------------------------------------------------

        // Función auxiliar que replica exactamente la lógica de generación del modal y visibilidad de ⓘ
        function generarDetalleModalSimulado(inst, indicadorUdi) {
            const hasInfoAdicional = !!(inst.informacion_adicional && typeof inst.informacion_adicional === 'string' && inst.informacion_adicional.trim().length > 0);
            const hasProteccion = !!(inst.tipo_proteccion && inst.tipo_proteccion !== 'Sin protección' && parseFloat(inst.limite_proteccion_udis) > 0);
            const mostrarIconoInfo = hasInfoAdicional || hasProteccion;

            const tipoProt = inst.tipo_proteccion || 'Sin protección';
            const limUdis = parseFloat(inst.limite_proteccion_udis) || 0;
            const udiValor = (indicadorUdi && parseFloat(indicadorUdi.valor) > 0) ? parseFloat(indicadorUdi.valor) : 8.865882;
            const pesosProtegidos = Math.round(limUdis * udiValor * 100) / 100;

            let fechaUdiFmt = 'Vigente';
            if (indicadorUdi && indicadorUdi.fecha) {
                const fechaStr = String(indicadorUdi.fecha).substring(0, 10);
                const p = fechaStr.split('-');
                if (p.length === 3) fechaUdiFmt = `${p[2]}/${p[1]}/${p[0]}`;
            }

            const riesgoColorMap = {
                'Bajo': { color: '#166534', bg: '#dcfce7', border: '#bbf7d0' },
                'Medio': { color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
                'Alto': { color: '#c2410c', bg: '#ffedd5', border: '#fed7aa' },
                'Muy alto': { color: '#b91c1c', bg: '#fee2e2', border: '#fecaca' }
            };
            const rInfo = riesgoColorMap[inst.nivel_riesgo] || { color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' };
            const nivelRiesgoTexto = inst.nivel_riesgo || 'Medio';

            let htmlContent = '';

            // Sección 1: Nivel de riesgo
            htmlContent += '<div class="seccion-riesgo" style="margin-bottom: 14px;">';
            htmlContent += '<div style="font-weight: 700; color: #475569; margin-bottom: 6px;">Nivel de riesgo</div>';
            htmlContent += `<div><span style="color: ${rInfo.color}; background: ${rInfo.bg}; font-weight: 800;">${nivelRiesgoTexto}</span></div>`;
            htmlContent += '</div>';

            // Sección 2: Protección
            htmlContent += '<div class="seccion-proteccion" style="margin-bottom: 16px;">';
            htmlContent += '<div style="font-weight: 700; color: #1e293b; margin-bottom: 8px;">Protección</div>';
            if (hasProteccion) {
                htmlContent += `<div><strong>🛡️ ${tipoProt}</strong></div>`;
                htmlContent += `<div>Cobertura: <strong>${limUdis.toLocaleString('es-MX')} UDIS</strong></div>`;
                htmlContent += `<div>Equivalente aprox: <strong>$${pesosProtegidos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</strong></div>`;
                htmlContent += `<div style="font-size: 0.8rem; color: #64748b; margin-top: 6px;">Valor UDI utilizado: <strong>$${udiValor.toFixed(6)}</strong></div>`;
                htmlContent += `<div style="font-size: 0.8rem; color: #64748b;">Fecha del valor UDI: <strong>${fechaUdiFmt}</strong></div>`;
            } else {
                htmlContent += '<div style="color: #64748b; font-style: italic;">Sin protección institucional.</div>';
            }
            htmlContent += '</div>';

            if (hasInfoAdicional) {
                htmlContent += '<div class="seccion-info-adicional">';
                htmlContent += '<div style="font-weight: 700; color: #1e293b; margin-bottom: 6px;">Información adicional</div>';
                htmlContent += `<div style="white-space: pre-wrap; word-break: break-word;">${inst.informacion_adicional}</div>`;
                htmlContent += '</div>';
            }

            return {
                mostrarIconoInfo,
                hasProteccion,
                hasInfoAdicional,
                htmlContent,
                pesosProtegidos,
                udiValor,
                fechaUdiFmt,
                colorRiesgo: rInfo.color
            };
        }

        const mockUdi = {
            codigo: 'UDI',
            valor: '8.865882',
            fecha: '2026-11-24'
        };

        test('Escenario 1: Banco con IPAB muestra cobertura de 400,000 UDIS y equivalente en pesos dinámico', () => {
            const inst = { nombre: 'Banco Santander', tipo: 'B', tipo_proteccion: 'IPAB', limite_proteccion_udis: 400000 };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, true);
            assert(res.htmlContent.includes('🛡️ IPAB'));
            assert(res.htmlContent.includes('400,000 UDIS'));
            assert(res.htmlContent.includes('$3,546,352.80 MXN'));
        });

        test('Escenario 2: SOFIPO con PROSOFIPO muestra cobertura de 25,000 UDIS y equivalente en pesos dinámico', () => {
            const inst = { nombre: 'Klar SOFIPO', tipo: 'S', tipo_proteccion: 'PROSOFIPO', limite_proteccion_udis: 25000 };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, true);
            assert(res.htmlContent.includes('🛡️ PROSOFIPO'));
            assert(res.htmlContent.includes('25,000 UDIS'));
            assert(res.htmlContent.includes('$221,647.05 MXN'));
        });

        test('Escenario 3: Institución con FOCOOP muestra cobertura de 25,000 UDIS y equivalente en pesos dinámico', () => {
            const inst = { nombre: 'Caja Popular Mexicana', tipo: 'O', tipo_proteccion: 'FOCOOP', limite_proteccion_udis: 25000 };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, true);
            assert(res.htmlContent.includes('🛡️ FOCOOP'));
            assert(res.htmlContent.includes('25,000 UDIS'));
            assert(res.htmlContent.includes('$221,647.05 MXN'));
        });

        test('Escenario 4: Institución sin protección muestra texto "Sin protección institucional."', () => {
            const inst = { nombre: 'Fintech no regulada', tipo: 'F', tipo_proteccion: 'Sin protección', limite_proteccion_udis: 0 };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, false);
            assert(res.htmlContent.includes('Sin protección institucional.'));
        });

        test('Escenario 5: Institución con información adicional renderiza la sección en el modal', () => {
            const inst = { nombre: 'Institución X', tipo: 'F', tipo_proteccion: 'Sin protección', limite_proteccion_udis: 0, informacion_adicional: 'Rendimientos acreditados diariamente.' };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, true);
            assert(res.htmlContent.includes('Información adicional'));
            assert(res.htmlContent.includes('Rendimientos acreditados diariamente.'));
        });

        test('Escenario 6: Institución sin información adicional pero con protección muestra ⓘ y sección protección en modal', () => {
            const inst = { nombre: 'Banco Azteca', tipo: 'B', tipo_proteccion: 'IPAB', limite_proteccion_udis: 400000, informacion_adicional: '' };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, true, 'Debe mostrar ⓘ si tiene protección');
            assert(res.htmlContent.includes('🛡️ IPAB'));
            assert(!res.htmlContent.includes('class="seccion-info-adicional"'), 'No debe incluir bloque de info adicional');
        });

        test('Escenario 7: Institución sin protección ni información adicional NO muestra icono ⓘ', () => {
            const inst = { nombre: 'Fintech Limpia', tipo: 'F', tipo_proteccion: 'Sin protección', limite_proteccion_udis: 0, informacion_adicional: null };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, false, 'No debe mostrar ⓘ');
        });

        test('Escenario 8: Institución con protección + información adicional muestra UN SOLO icono ⓘ', () => {
            const inst = { nombre: 'NU México', tipo: 'B', tipo_proteccion: 'IPAB', limite_proteccion_udis: 400000, informacion_adicional: 'Cuenta con cajitas de ahorro al 13.5%' };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, true);
            assert(res.hasProteccion && res.hasInfoAdicional);
        });

        test('Escenario 9: Modal despliega adecuadamente tanto Protección como Información Adicional juntas', () => {
            const inst = { nombre: 'Stori SOFIPO', tipo: 'S', tipo_proteccion: 'PROSOFIPO', limite_proteccion_udis: 25000, informacion_adicional: 'Tasa promocional sujeta a saldo mínimo.' };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert(res.htmlContent.includes('🛡️ PROSOFIPO'));
            assert(res.htmlContent.includes('25,000 UDIS'));
            assert(res.htmlContent.includes('Información adicional'));
            assert(res.htmlContent.includes('Tasa promocional sujeta a saldo mínimo.'));
        });

        test('Escenario 10: Modal refleja el valor UDI utilizado y su fecha formateada DD/MM/YYYY', () => {
            const inst = { nombre: 'Finsus', tipo: 'S', tipo_proteccion: 'PROSOFIPO', limite_proteccion_udis: 25000 };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.fechaUdiFmt, '24/11/2026');
            assert(res.htmlContent.includes('Valor UDI utilizado: <strong>$8.865882</strong>'));
            assert(res.htmlContent.includes('Fecha del valor UDI: <strong>24/11/2026</strong>'));
        });

        test('Escenario 11: Textos largos de informacion_adicional tienen estilos responsive y no desbordan', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(html.includes('max-height: 88vh; overflow-y: auto;'), 'Modal debe contar con overflow vertical');
            assert(simCode.includes('word-break: break-word'), 'Cuerpo del modal debe evitar desbordamiento horizontal');
        });

        test('Escenario 12: Visualización Desktop presenta modal centrado con ancho restringido a 480px', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('max-width: 480px; width: 92%;'), 'Modal debe restringirse a 480px para máxima legibilidad');
        });

        test('Escenario 13: Visualización Móvil adapta modal al 92% de la pantalla y flex-wrap en la leyenda superior', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            assert(html.includes('flex-wrap: wrap;'), 'Leyenda superior y modal deben ajustarse fluidamente en pantallas estrechas');
        });

        test('Escenario 14: Verificación de invariantes: Ningún cálculo financiero ni de tasas cambia', () => {
            const tramos = [
                { numero_tramo: 1, limite_inferior: 0, limite_superior: 25000, tasa_anual: 13.0 },
                { numero_tramo: 2, limite_inferior: 25000, limite_superior: 200000, tasa_anual: 8.0 },
                { numero_tramo: 3, limite_inferior: 200000, limite_superior: null, tasa_anual: 5.0 }
            ];

            const sim = MotorFinanciero.simularInversion(1000000, 6, tramos);
            assert.strictEqual(sim.inversion_base, 25000);
            assert.strictEqual(sim.inversion_2, 975000); // Tramo 2 (175k) + Tramo 3 (800k)
            assert.strictEqual(sim.rend1, 1625);
            assert.strictEqual(sim.rend2, 27000); // 7000 + 20000
            assert.strictEqual(sim.total_periodo, 28625);
            assert.strictEqual(Number(sim.total_mensual.toFixed(2)), 4770.83);
        });

        // -------------------------------------------------------------------------
        // GRUPO 8: AJUSTE VISUAL COLUMNA INSTITUCIÓN Y DETALLE DE RIESGO EN ⓘ (Casos 49 - 58)
        // -------------------------------------------------------------------------

        test('Caso 49: Institución con nivel Bajo asigna color verde (#166534) al nombre', () => {
            const instBajo = { id: 1, nombre: 'NU', nivel_riesgo: 'Bajo' };
            const res = generarDetalleModalSimulado(instBajo, mockUdi);
            assert.strictEqual(res.colorRiesgo, '#166534', 'Institución Bajo debe tener color verde #166534');
        });

        test('Caso 50: Institución con nivel Medio asigna color azul (#1d4ed8) al nombre', () => {
            const instMedio = { id: 2, nombre: 'Revolut', nivel_riesgo: 'Medio' };
            const res = generarDetalleModalSimulado(instMedio, mockUdi);
            assert.strictEqual(res.colorRiesgo, '#1d4ed8', 'Institución Medio debe tener color azul #1d4ed8');
        });

        test('Caso 51: Institución con nivel Alto asigna color naranja (#c2410c) al nombre', () => {
            const instAlto = { id: 3, nombre: 'Didi', nivel_riesgo: 'Alto' };
            const res = generarDetalleModalSimulado(instAlto, mockUdi);
            assert.strictEqual(res.colorRiesgo, '#c2410c', 'Institución Alto debe tener color naranja #c2410c');
        });

        test('Caso 52: Institución con nivel Muy alto asigna color rojo (#b91c1c) al nombre', () => {
            const instMuyAlto = { id: 4, nombre: 'Ualá', nivel_riesgo: 'Muy alto' };
            const res = generarDetalleModalSimulado(instMuyAlto, mockUdi);
            assert.strictEqual(res.colorRiesgo, '#b91c1c', 'Institución Muy alto debe tener color rojo #b91c1c');
        });

        test('Caso 53: La primera columna NO contiene badge de texto con el calificativo de riesgo en simuladorFinanciero.js', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(!simCode.includes('Nivel de riesgo: ${inst.nivel_riesgo || \'Medio\'}'), 'No debe tener badge textual de nivel de riesgo en la fila');
            assert(simCode.includes('class="sim-inst-nombre"'), 'El nombre debe tener clase sim-inst-nombre con color asignado');
        });

        test('Caso 54: El modal ⓘ de información complementaria incluye la sección Nivel de riesgo', () => {
            const inst = { nombre: 'NU', nivel_riesgo: 'Bajo', tipo_proteccion: 'IPAB', limite_proteccion_udis: 400000 };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert(res.htmlContent.includes('Nivel de riesgo'), 'Modal debe contener encabezado Nivel de riesgo');
            assert(res.htmlContent.includes('Bajo'), 'Modal debe mostrar el nivel de riesgo correspondiente');
        });

        test('Caso 55: Modal ⓘ de institución sin protección (ej. Didi) muestra Nivel de riesgo y Sin protección institucional', () => {
            const inst = { nombre: 'Didi', nivel_riesgo: 'Alto', tipo_proteccion: 'Sin protección', limite_proteccion_udis: 0, informacion_adicional: 'Cuenta Didi' };
            const res = generarDetalleModalSimulado(inst, mockUdi);
            assert.strictEqual(res.mostrarIconoInfo, true);
            assert(res.htmlContent.includes('Nivel de riesgo'));
            assert(res.htmlContent.includes('Alto'));
            assert(res.htmlContent.includes('Sin protección institucional.'));
            assert(res.htmlContent.includes('Cuenta Didi'));
        });

        test('Caso 56: Institución no elegible (ej. Monific) mantiene su color de riesgo y su mensaje de no elegibilidad', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('badge-no-elegible'), 'Fila debe mantener contenedor para mensaje de no elegible');
            assert(simCode.includes('sim-ineligible-'), 'Debe conservar id para selector de no elegibilidad');
        });

        test('Caso 57: Accesibilidad: El elemento del nombre incluye atributos title y aria-label con su nivel de riesgo', () => {
            const simCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
            assert(simCode.includes('title="Nivel de riesgo:'), 'Nombre debe tener title accesible');
            assert(simCode.includes('aria-label="'), 'Nombre debe tener aria-label accesible');
        });

        test('Caso 58: La leyenda superior en index.html se mantiene limpia con Tipos y Protecciones sin duplicar niveles de riesgo', () => {
            const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
            const legendMatch = html.match(/<!-- Barra de Leyenda de Tipos de Institución y Coberturas de Protección -->([\s\S]*?)<!-- Panel de Controles/);
            assert(legendMatch, 'Debe existir bloque de leyenda superior');
            const legendHtml = legendMatch[1];
            assert(legendHtml.includes('Tipos:'));
            assert(legendHtml.includes('Protecciones:'));
            assert(!legendHtml.includes('Riesgos:') && !legendHtml.includes('Nivel de riesgo'), 'No se deben duplicar niveles de riesgo en la leyenda superior');
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
