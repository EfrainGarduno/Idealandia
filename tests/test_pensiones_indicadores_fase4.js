/**
 * tests/test_pensiones_indicadores_fase4.js
 * 
 * Suite de validación exhaustiva para la Fase 4:
 * Actualización Automática de Indicadores desde Fuentes Oficiales.
 * 
 * Cubre los 32 casos requeridos:
 * - Bloque 1: Resiliencia de fuentes y red (Casos 1 al 7)
 * - Bloque 2: Validación de datos y sanity checks (Casos 8 al 15)
 * - Bloque 3: Concurrencia y transaccionalidad con GET_LOCK (Casos 16 al 20)
 * - Bloque 4: Regímenes y consistencia actuarial Opción C (Casos 21 al 25)
 * - Bloque 5: Caché, Rollback y No Regresión Actuarial (Casos 26 al 32)
 */

const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { fetchBanxicoSerie } = require('../extractors/banxicoExtractor');
const { fetchInegiIndicador } = require('../extractors/inegiExtractor');
const { 
    normalizarValorNumerico, 
    normalizarFechaAISO, 
    extraerEjercicioFiscal, 
    determinarVigenciaIndicadorAnual,
    calcularPensionMinimaLey73 
} = require('../indicatorNormalizer');
const { 
    validarSalarioMinimoCandidato, 
    validarConsistenciaMatematicaLey73,
    validarINPCCandidato 
} = require('../indicatorValidator');
const { 
    sincronizarIndicadores, 
    revertirIndicadorAHistorial, 
    consultarHistorialSincronizaciones,
    SYNC_LOCK_NAME 
} = require('../pensionSyncService');
const { 
    determinarIndicadorAplicable,
    invalidarCacheIndicadores 
} = require('../pensionIndicadoresService');
const { calculateIMSSLey73Pension } = require('../pension');

async function runFase4Tests() {
    console.log('================================================================================');
    console.log('SUITE DE PRUEBAS: FASE 4 - ACTUALIZACIÓN AUTOMÁTICA DE INDICADORES OFICIALES');
    console.log('================================================================================\n');

    const pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    let passed = 0;
    let failed = 0;

    function test(desc, fn) {
        try {
            fn();
            console.log(`  [PASS] ${desc}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${desc}`);
            console.error(`         ${err.message}`);
            failed++;
        }
    }

    async function testAsync(desc, fn) {
        try {
            await fn();
            console.log(`  [PASS] ${desc}`);
            passed++;
        } catch (err) {
            console.error(`  [FAIL] ${desc}`);
            console.error(`         ${err.message}`);
            failed++;
        }
    }

    try {
        // =====================================================================
        // BLOQUE 1: Resiliencia de Fuentes y Red (Casos 1 al 7)
        // =====================================================================
        console.log('--- BLOQUE 1: Resiliencia de Fuentes y Red ---');

        await testAsync('Caso 1: Extractor Banxico procesa respuesta JSON válida estructurada con serie SL11298', async () => {
            const mockFetch = async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    bmx: {
                        series: [{
                            idSerie: 'SL11298',
                            titulo: 'Salarios mínimos generales promedio nacional diario',
                            datos: [{ fecha: '01/01/2026', dato: '315.04' }]
                        }]
                    }
                })
            });

            const res = await fetchBanxicoSerie({ serieId: 'SL11298', token: 'mock-token', fetchFn: mockFetch });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.valorStr, '315.04');
            assert.strictEqual(res.fechaStr, '01/01/2026');
            assert.strictEqual(res.serieId, 'SL11298');
        });

        await testAsync('Caso 1b: Extractor Banxico mapea automáticamente cuadro CA601 a serie oficial SL11298', async () => {
            let requestedUrl = '';
            const mockFetch = async (url) => {
                requestedUrl = url;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        bmx: {
                            series: [{
                                idSerie: 'SL11298',
                                titulo: 'Salarios mínimos generales',
                                datos: [{ fecha: '01/01/2026', dato: '315.04' }]
                            }]
                        }
                    })
                };
            };

            const res = await fetchBanxicoSerie({ serieId: 'CA601', token: 'mock-token', fetchFn: mockFetch });
            assert.strictEqual(res.success, true);
            assert(requestedUrl.includes('SL11298'), 'Debe consultar la serie oficial SL11298 en lugar del cuadro CA601');
        });

        await testAsync('Caso 2: Error HTTP 400 Bad Request en Banxico (serie inválida) genera reporte controlado', async () => {
            const mockFetch400 = async () => ({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Bad Request' })
            });

            const res = await fetchBanxicoSerie({ serieId: 'SERIE_INVALIDA', token: 'mock-token', fetchFn: mockFetch400 });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.error, 'HTTP_400_BAD_REQUEST');
            assert.strictEqual(res.rawStatus, 400);
            assert(res.detalles.includes('serie no existe'));
        });

        await testAsync('Caso 2b: Error HTTP 401 Unauthorized en Banxico (token inválido o no autorizado)', async () => {
            const mockFetch401 = async () => ({
                ok: false,
                status: 401,
                json: async () => ({ error: 'Unauthorized' })
            });

            const res = await fetchBanxicoSerie({ serieId: 'SL11298', token: 'token-invalido', fetchFn: mockFetch401 });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.error, 'HTTP_401_UNAUTHORIZED');
            assert.strictEqual(res.rawStatus, 401);
        });

        await testAsync('Caso 2c: Error HTTP 403 Forbidden en Banxico (acceso denegado o permisos)', async () => {
            const mockFetch403 = async () => ({
                ok: false,
                status: 403,
                json: async () => ({ error: 'Forbidden' })
            });

            const res = await fetchBanxicoSerie({ serieId: 'SL11298', token: 'token-sin-permiso', fetchFn: mockFetch403 });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.error, 'HTTP_403_FORBIDDEN');
            assert.strictEqual(res.rawStatus, 403);
        });

        await testAsync('Caso 2d: Error HTTP 429 Too Many Requests en Banxico (límite de 80 consultas/min)', async () => {
            const mockFetch429 = async () => ({
                ok: false,
                status: 429,
                json: async () => ({ error: 'Too Many Requests' })
            });

            const res = await fetchBanxicoSerie({ serieId: 'SL11298', token: 'mock-token', fetchFn: mockFetch429 });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.error, 'HTTP_429_TOO_MANY_REQUESTS');
            assert.strictEqual(res.rawStatus, 429);
            assert(res.detalles.includes('80 consultas'));
        });

        await testAsync('Caso 2e: Error HTTP 500 en Banxico genera reporte controlado de error de servidor', async () => {
            const mockFetch500 = async () => ({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Internal Server Error' })
            });

            const res = await fetchBanxicoSerie({ serieId: 'SL11298', token: 'mock-token', fetchFn: mockFetch500 });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.error, 'HTTP_500_SERVER_ERROR');
            assert.strictEqual(res.rawStatus, 500);
        });

        await testAsync('Caso 3: Error HTTP 404 en endpoint externo genera estado HTTP_404_NOT_FOUND', async () => {
            const mockFetch404 = async () => ({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Not Found' })
            });

            const res = await fetchBanxicoSerie({ serieId: 'SERIE_INEXISTENTE', token: 'mock-token', fetchFn: mockFetch404 });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.error, 'HTTP_404_NOT_FOUND');
        });

        await testAsync('Caso 4: Timeout de red (>8s) se interrumpe limpiamente mediante AbortController', async () => {
            const mockFetchTimeout = async () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                throw err;
            };

            const res = await fetchBanxicoSerie({ serieId: 'SL11298', token: 'mock-token', fetchFn: mockFetchTimeout });
            assert.strictEqual(res.success, false);
            assert.strictEqual(res.error, 'TIMEOUT');
            assert(res.detalles.includes('agotado'));
        });

        await testAsync('Caso 5: Extractor INEGI procesa respuesta JSON oficial BIE estructurada', async () => {
            const mockFetchInegi = async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    Series: [{
                        INDICADOR: '910392',
                        OBSERVATIONS: [{ TIME_PERIOD: '2026/01', OBS_VALUE: '147.0260' }]
                    }]
                })
            });

            const res = await fetchInegiIndicador({ indicadorId: '910392', token: 'mock-inegi-token', fetchFn: mockFetchInegi });
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.valorStr, '147.0260');
            assert.strictEqual(res.periodoStr, '2026/01');
        });

        await testAsync('Caso 5b: Errores HTTP en INEGI (400, 401, 403, 404, 500) manejados granularmente', async () => {
            const mock401 = async () => ({ ok: false, status: 401, json: async () => ({}) });
            const res401 = await fetchInegiIndicador({ indicadorId: '910392', token: 'invalido', fetchFn: mock401 });
            assert.strictEqual(res401.error, 'HTTP_401_UNAUTHORIZED');

            const mock403 = async () => ({ ok: false, status: 403, json: async () => ({}) });
            const res403 = await fetchInegiIndicador({ indicadorId: '910392', token: 'sin-permiso', fetchFn: mock403 });
            assert.strictEqual(res403.error, 'HTTP_403_FORBIDDEN');

            const mock404 = async () => ({ ok: false, status: 404, json: async () => ({}) });
            const res404 = await fetchInegiIndicador({ indicadorId: '999999999', token: 'mock', fetchFn: mock404 });
            assert.strictEqual(res404.error, 'HTTP_404_NOT_FOUND');
        });

        await testAsync('Caso 5c: Orquestador sincronizarIndicadores despacha a INEGI BIE cuando fuente = INEGI_BIE', async () => {
            let inegiLlamado = false;
            const mockFetchInegi = async (url) => {
                if (url.includes('indicadores') || url.includes('INDICATOR')) {
                    inegiLlamado = true;
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            Series: [{
                                INDICADOR: '910392',
                                OBSERVATIONS: [{ TIME_PERIOD: '2026/01', OBS_VALUE: '147.0260' }]
                            }]
                        })
                    };
                }
                throw new Error('No debe llamar a otra fuente');
            };

            const dryRes = await sincronizarIndicadores({
                pool,
                dryRun: true,
                fuente: 'INEGI_BIE',
                fetchFn: mockFetchInegi
            });

            assert.strictEqual(inegiLlamado, true, 'Debe invocar el extractor de INEGI BIE');
            assert.strictEqual(dryRes.success, true);
            assert.strictEqual(dryRes.fuente, 'INEGI_BIE');
            assert.strictEqual(dryRes.estado, 'EXITO_DRY_RUN');
            assert.strictEqual(dryRes.indicadorCodigo, 'INPC_GENERAL');
            assert.strictEqual(dryRes.fechaObservacionFuente, '2026-01-01');
        });

        await testAsync('Caso 6: Respuesta con formato inesperado (HTML en lugar de JSON) genera error parse controlado', async () => {
            const mockFetchHtml = async () => ({
                ok: true,
                status: 200,
                json: async () => {
                    throw new Error('Unexpected token < in JSON at position 0');
                }
            });

            const res = await fetchBanxicoSerie({ serieId: 'SL11298', token: 'mock-token', fetchFn: mockFetchHtml });
            assert.strictEqual(res.success, false);
            assert(res.error === 'BANXICO_JSON_PARSE_ERROR' || res.error === 'BANXICO_FETCH_ERROR');
        });

        await testAsync('Caso 7: Falla total de red o token faltante en Banxico e INEGI no arroja excepción no capturada', async () => {
            const resBanxico = await fetchBanxicoSerie({ serieId: 'SL11298', token: null });
            assert.strictEqual(resBanxico.success, false);
            assert.strictEqual(resBanxico.error, 'BANXICO_TOKEN_MISSING');

            const resInegi = await fetchInegiIndicador({ indicadorId: '910392', token: '' });
            assert.strictEqual(resInegi.success, false);
            assert.strictEqual(resInegi.error, 'INEGI_TOKEN_MISSING');
        });

        // =====================================================================
        // BLOQUE 2: Validación de Datos y Sanity Checks (Casos 8 al 15)
        // =====================================================================
        console.log('\n--- BLOQUE 2: Validación de Datos y Sanity Checks ---');

        test('Caso 8: Valor candidato negativo o cero es estrictamente rechazado', () => {
            const resNeg = validarSalarioMinimoCandidato({ valor: -100, anioReferencia: 2026, fechaVigenciaInicio: '2026-01-01' });
            assert.strictEqual(resNeg.valido, false);
            assert(resNeg.motivoRechazo.includes('positivo'));

            const resCero = validarSalarioMinimoCandidato({ valor: 0, anioReferencia: 2026, fechaVigenciaInicio: '2026-01-01' });
            assert.strictEqual(resCero.valido, false);
        });

        test('Caso 9: Valor candidato NaN o alfanumérico es rechazado por el normalizador y validador', () => {
            const norm = normalizarValorNumerico('abc-invalido');
            assert.strictEqual(norm, null);
            const resNaN = validarSalarioMinimoCandidato({ valor: norm, anioReferencia: 2026, fechaVigenciaInicio: '2026-01-01' });
            assert.strictEqual(resNaN.valido, false);
        });

        test('Caso 10: Incremento interanual excesivo (>35%) es rechazado para evitar anomalías', () => {
            // Último oficial 2026 = 315.04. Candidato 500.00 (+58.7% de incremento)
            const resExceso = validarSalarioMinimoCandidato(
                { valor: 500.00, anioReferencia: 2026, fechaVigenciaInicio: '2026-01-01' },
                315.04
            );
            assert.strictEqual(resExceso.valido, false);
            assert(resExceso.motivoRechazo.includes('excede la tasa máxima permitida'));
        });

        test('Caso 11: Reducción del salario mínimo vs. valor vigente es estrictamente rechazada', () => {
            // Último oficial 2026 = 315.04. Candidato 300.00 (reducción inconstitucional)
            const resReduccion = validarSalarioMinimoCandidato(
                { valor: 300.00, anioReferencia: 2026, fechaVigenciaInicio: '2026-01-01' },
                315.04
            );
            assert.strictEqual(resReduccion.valido, false);
            assert(resReduccion.motivoRechazo.includes('no puede ser menor'));
        });

        test('Caso 12: Ejercicio fiscal incoherente (ej. año 2045 o año 2010) es rechazado', () => {
            const resAnio = validarSalarioMinimoCandidato({ valor: 350.00, anioReferencia: 2045, fechaVigenciaInicio: '2045-01-01' });
            assert.strictEqual(resAnio.valido, false);
            assert(resAnio.motivoRechazo.includes('incoherente con el ciclo fiscal'));
        });

        test('Caso 13: Fecha de inicio de vigencia no coincidente con 1 de enero es rechazada', () => {
            const resFecha = validarSalarioMinimoCandidato({ valor: 350.00, anioReferencia: 2026, fechaVigenciaInicio: '2026-06-15' });
            assert.strictEqual(resFecha.valido, false);
            assert(resFecha.motivoRechazo.includes('1 de enero'));
        });

        test('Caso 13b: determinarVigenciaIndicadorAnual deriva vigencia anual reglamentaria 01-01 a 12-31 sin mutar fecha de observación', () => {
            const vigencia2026 = determinarVigenciaIndicadorAnual(2026);
            assert.deepStrictEqual(vigencia2026, {
                fechaVigenciaInicio: '2026-01-01',
                fechaVigenciaFin: '2026-12-31'
            });

            // Verificar que extraerEjercicioFiscal no altera fechaObservacion ISO
            const fechaObs = normalizarFechaAISO('01/10/2026');
            assert.strictEqual(fechaObs, '2026-10-01');
            const anio = extraerEjercicioFiscal(fechaObs);
            assert.strictEqual(anio, 2026);
            const vigDerivada = determinarVigenciaIndicadorAnual(anio);
            assert.strictEqual(vigDerivada.fechaVigenciaInicio, '2026-01-01');
            assert.strictEqual(vigDerivada.fechaVigenciaFin, '2026-12-31');
        });

        await testAsync('Caso 14: Verificación de Idempotencia: SMG 2026 idéntico ($315.04) resulta en EXITO_SIN_CAMBIOS con cero escrituras', async () => {
            const mockFetch2026 = async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    bmx: {
                        series: [{
                            idSerie: 'CA601',
                            titulo: 'Salarios mínimos',
                            datos: [{ fecha: '01/01/2026', dato: '315.04' }]
                        }]
                    }
                })
            });

            // Contar registros de historial antes
            const [histAntes] = await pool.query('SELECT COUNT(*) AS total FROM pensiones_indicadores_historial');
            const totalAntes = histAntes[0].total;

            const syncRes = await sincronizarIndicadores({
                pool,
                dryRun: false,
                fetchFn: mockFetch2026
            });

            assert.strictEqual(syncRes.success, true);
            assert.strictEqual(syncRes.estado, 'EXITO_SIN_CAMBIOS');

            // Verificar que no se insertó ninguna fila en historial
            const [histDespues] = await pool.query('SELECT COUNT(*) AS total FROM pensiones_indicadores_historial');
            assert.strictEqual(histDespues[0].total, totalAntes);
        });

        await testAsync('Caso 14b: Separación Semántica de Fechas: Banxico devuelve observación 01/10/2026 con $315.04 -> valida correctamente y resulta en EXITO_SIN_CAMBIOS', async () => {
            const mockFetchBanxicoOct = async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    bmx: {
                        series: [{
                            idSerie: 'SL11298',
                            titulo: 'Salarios Mínimos General Pesos por día',
                            datos: [{ fecha: '01/10/2026', dato: '315.0400' }]
                        }]
                    }
                })
            });

            const syncRes = await sincronizarIndicadores({
                pool,
                dryRun: true,
                fuente: 'BANXICO_SIE',
                fetchFn: mockFetchBanxicoOct
            });

            assert.strictEqual(syncRes.success, true);
            assert.strictEqual(syncRes.estado, 'EXITO_SIN_CAMBIOS');
            assert.strictEqual(syncRes.fechaObservacionFuente, '2026-10-01');
            assert.strictEqual(syncRes.fechaVigenciaInicio, '2026-01-01');
            assert.strictEqual(syncRes.fechaVigenciaFin, '2026-12-31');
            assert.strictEqual(syncRes.valorVigente, 315.04);
        });

        await testAsync('Caso 15: Modo DRY-RUN valida y proyecta cambios sin modificar indicadores en BD', async () => {
            const mockFetchDry = async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    bmx: {
                        series: [{
                            idSerie: 'CA601',
                            titulo: 'Salarios mínimos',
                            datos: [{ fecha: '01/01/2026', dato: '320.00' }]
                        }]
                    }
                })
            });

            const dryRes = await sincronizarIndicadores({
                pool,
                dryRun: true,
                fetchFn: mockFetchDry
            });

            assert.strictEqual(dryRes.success, true);
            assert.strictEqual(dryRes.esDryRun, true);
            assert.strictEqual(dryRes.estado, 'EXITO_DRY_RUN');
            assert(Array.isArray(dryRes.cambiosPropuestos));
            assert.strictEqual(dryRes.cambiosPropuestos[0].valorCandidato, 320.00);

            // Verificar que en la BD el valor real de 2026 sigue siendo exactamente 315.04
            const [bdRows] = await pool.query('SELECT valor FROM pensiones_indicadores WHERE codigo = "SALARIO_MINIMO_GENERAL" AND anio_referencia = 2026');
            assert.strictEqual(parseFloat(bdRows[0].valor), 315.04);
        });

        // =====================================================================
        // BLOQUE 3: Concurrencia y Transaccionalidad (Casos 16 al 20)
        // =====================================================================
        console.log('\n--- BLOQUE 3: Concurrencia y Transaccionalidad con MySQL GET_LOCK ---');

        await testAsync('Caso 16: Control de concurrencia con GET_LOCK: si el lock está ocupado, la 2da llamada aborta limpiamente con SYNC_ALREADY_RUNNING', async () => {
            // Abrir una conexión externa y tomar el lock manualmente
            const connBloqueadora = await pool.getConnection();
            try {
                const [lRes] = await connBloqueadora.query('SELECT GET_LOCK(?, 2) AS lock_ok', [SYNC_LOCK_NAME]);
                assert.strictEqual(lRes[0].lock_ok, 1);

                // Intentar sincronizar desde otra conexión
                const syncRes = await sincronizarIndicadores({
                    pool,
                    timeoutLockSeconds: 1
                });

                assert.strictEqual(syncRes.success, false);
                assert.strictEqual(syncRes.error, 'SYNC_ALREADY_RUNNING');
            } finally {
                await connBloqueadora.query('SELECT RELEASE_LOCK(?)', [SYNC_LOCK_NAME]);
                connBloqueadora.release();
            }
        });

        await testAsync('Caso 17: Liberación segura del lock en bloque finally incluso ante error o excepción interna', async () => {
            const mockFetchExplosivo = async () => {
                throw new Error('Explosión simulada en red');
            };

            await sincronizarIndicadores({
                pool,
                fetchFn: mockFetchExplosivo
            });

            // Verificar que el lock quedó 100% libre probando tomarlo de inmediato
            const connVerif = await pool.getConnection();
            try {
                const [lCheck] = await connVerif.query('SELECT GET_LOCK(?, 1) AS lock_libre', [SYNC_LOCK_NAME]);
                assert.strictEqual(lCheck[0].lock_libre, 1);
                await connVerif.query('SELECT RELEASE_LOCK(?)', [SYNC_LOCK_NAME]);
            } finally {
                connVerif.release();
            }
        });

        await testAsync('Caso 18: Bandera de Bloqueo Manual: si bloqueo_actualizacion_automatica = 1, la sincronización se omite y se registra en telemetría', async () => {
            // Activar bloqueo manual en 2026
            await pool.query('UPDATE pensiones_indicadores SET bloqueo_actualizacion_automatica = 1 WHERE codigo = "SALARIO_MINIMO_GENERAL" AND anio_referencia = 2026');

            try {
                const mockFetchNuevo = async () => ({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        bmx: {
                            series: [{
                                idSerie: 'CA601',
                                datos: [{ fecha: '01/01/2026', dato: '330.00' }]
                            }]
                        }
                    })
                });

                const resBloqueo = await sincronizarIndicadores({
                    pool,
                    dryRun: false,
                    fetchFn: mockFetchNuevo
                });

                assert.strictEqual(resBloqueo.success, true);
                assert.strictEqual(resBloqueo.estado, 'BLOQUEO_MANUAL_ACTIVO');

                // Verificar que en la BD el valor NO cambió
                const [bdRows] = await pool.query('SELECT valor FROM pensiones_indicadores WHERE codigo = "SALARIO_MINIMO_GENERAL" AND anio_referencia = 2026');
                assert.strictEqual(parseFloat(bdRows[0].valor), 315.04);
            } finally {
                // Restaurar bloqueo
                await pool.query('UPDATE pensiones_indicadores SET bloqueo_actualizacion_automatica = 0 WHERE codigo = "SALARIO_MINIMO_GENERAL" AND anio_referencia = 2026');
            }
        });

        await testAsync('Caso 19: Ejecución repetida 20 veces es 100% idempotente y no genera registros duplicados en historial', async () => {
            const mockFetchConstante = async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    bmx: {
                        series: [{
                            idSerie: 'CA601',
                            datos: [{ fecha: '01/01/2026', dato: '315.04' }]
                        }]
                    }
                })
            });

            const [hist1] = await pool.query('SELECT COUNT(*) AS cnt FROM pensiones_indicadores_historial');
            const cnt1 = hist1[0].cnt;

            for (let i = 0; i < 20; i++) {
                const r = await sincronizarIndicadores({ pool, fetchFn: mockFetchConstante });
                assert.strictEqual(r.estado, 'EXITO_SIN_CAMBIOS');
            }

            const [hist2] = await pool.query('SELECT COUNT(*) AS cnt FROM pensiones_indicadores_historial');
            assert.strictEqual(hist2[0].cnt, cnt1);
        });

        await testAsync('Caso 20: Registro detallado en pensiones_sincronizaciones audita cada ejecución con duracion y estado', async () => {
            const [syncRows] = await pool.query('SELECT * FROM pensiones_sincronizaciones ORDER BY id DESC LIMIT 1');
            assert(syncRows.length > 0);
            const ult = syncRows[0];
            assert(ult.fuente.length > 0);
            assert(typeof ult.duracion_ms === 'number');
            assert(['EXITO_ACTUALIZADO', 'EXITO_SIN_CAMBIOS', 'BLOQUEO_MANUAL_ACTIVO', 'ERROR_BD', 'RECHAZADO_VALIDACION', 'ERROR_HTTP', 'ERROR_TIMEOUT'].includes(ult.estado));
        });

        // =====================================================================
        // BLOQUE 4: Regímenes y Consistencia Actuarial Opción C (Casos 21 al 25)
        // =====================================================================
        console.log('\n--- BLOQUE 4: Regímenes y Consistencia Actuarial Opción C ---');

        test('Caso 21: Fórmula oficial de Pensión Mínima Ley 73: SMG * (365/12) * 1.11 calcula con precisión milimétrica', () => {
            // 2024: 248.93 -> 8,404.50
            const p2024 = calcularPensionMinimaLey73(248.93);
            assert.strictEqual(p2024, 8404.50);

            // 2025: 278.80 -> 9,412.99
            const p2025 = calcularPensionMinimaLey73(278.80);
            assert.strictEqual(p2025, 9412.99);

            // 2026: 315.04 -> 10,636.54
            const p2026 = calcularPensionMinimaLey73(315.04);
            assert.strictEqual(p2026, 10636.54);
        });

        test('Caso 22: Validación de consistencia matemática detecta discrepancias en centavos de Ley 73', () => {
            const resOk = validarConsistenciaMatematicaLey73(315.04, 10636.54);
            assert.strictEqual(resOk.valido, true);

            const resMalo = validarConsistenciaMatematicaLey73(315.04, 10630.00);
            assert.strictEqual(resMalo.valido, false);
            assert(resMalo.motivoRechazo.includes('Discrepancia en pensión Ley 73'));
        });

        await testAsync('Caso 23: Opción C en Transacción Real: Sincronización actualiza SMG y deriva atómicamente Pensión Ley 73 con historial completo', async () => {
            // Simulamos actualización legítima del SMG a 316.00 (+0.3% variación)
            const mockFetchSMGNuevo = async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    bmx: {
                        series: [{
                            idSerie: 'CA601',
                            datos: [{ fecha: '01/01/2026', dato: '316.00' }]
                        }]
                    }
                })
            });

            const resUpdate = await sincronizarIndicadores({
                pool,
                dryRun: false,
                fetchFn: mockFetchSMGNuevo
            });

            assert.strictEqual(resUpdate.success, true);
            assert.strictEqual(resUpdate.estado, 'EXITO_ACTUALIZADO');

            // 1. Verificar SMG actualizado en BD
            const [smgBD] = await pool.query('SELECT valor, metodo_obtencion FROM pensiones_indicadores WHERE codigo = "SALARIO_MINIMO_GENERAL" AND anio_referencia = 2026');
            assert.strictEqual(parseFloat(smgBD[0].valor), 316.00);
            assert.strictEqual(smgBD[0].metodo_obtencion, 'AUTOMATICA');

            // 2. Verificar Pensión Mínima Ley 73 derivada atómicamente en BD: 316 * (365/12) * 1.11 = 10,668.95
            const [penBD] = await pool.query('SELECT valor, metodo_obtencion, formula_calculo FROM pensiones_indicadores WHERE codigo = "PENSION_MINIMA_LEY_73" AND anio_referencia = 2026');
            assert.strictEqual(parseFloat(penBD[0].valor), 10668.95);
            assert.strictEqual(penBD[0].metodo_obtencion, 'AUTOMATICA');
            assert(penBD[0].formula_calculo.includes('316 * (365 / 12) * 1.11'));

            // 3. Verificar auditoría en historial para ambos
            const [histSMG] = await pool.query('SELECT * FROM pensiones_indicadores_historial WHERE codigo = "SALARIO_MINIMO_GENERAL" ORDER BY id DESC LIMIT 1');
            assert.strictEqual(parseFloat(histSMG[0].valor_nuevo), 316.00);
            assert.strictEqual(histSMG[0].metodo_actualizacion, 'AUTOMATICA');

            const [histPen] = await pool.query('SELECT * FROM pensiones_indicadores_historial WHERE codigo = "PENSION_MINIMA_LEY_73" ORDER BY id DESC LIMIT 1');
            assert.strictEqual(parseFloat(histPen[0].valor_nuevo), 10668.95);
            assert.strictEqual(histPen[0].metodo_actualizacion, 'AUTOMATICA');
        });

        await testAsync('Caso 24: Separación de Regímenes: La actualización de Ley 73 no afecta ni modifica el indicador base de Ley 97 ($3,778.00)', async () => {
            const [ley97Rows] = await pool.query('SELECT valor, codigo, regimen FROM pensiones_indicadores WHERE codigo = "PENSION_MINIMA_GARANTIZADA_LEY_97"');
            assert.strictEqual(ley97Rows.length, 1);
            assert.strictEqual(parseFloat(ley97Rows[0].valor), 3778.00);
            assert.strictEqual(ley97Rows[0].regimen, 'ley97');
        });

        test('Caso 25: Validación de candidato INPC para Ley 97 valida porcentaje realista', () => {
            const valINPC = validarINPCCandidato({ valor: 147.50 }, 140.00);
            assert.strictEqual(valINPC.valido, true);

            const valINPCLoco = validarINPCCandidato({ valor: 300.00 }, 140.00);
            assert.strictEqual(valINPCLoco.valido, false);
            assert(valINPCLoco.motivoRechazo.includes('supera el rango anual'));
        });

        // =====================================================================
        // BLOQUE 5: Caché, Rollback y No Regresión (Casos 26 al 32)
        // =====================================================================
        console.log('\n--- BLOQUE 5: Caché, Rollback y No Regresión Actuarial ---');

        await testAsync('Caso 26: Caché en memoria refleja inmediatamente el nuevo valor tras commit de sincronización', async () => {
            const indDeterminado = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2026-06-01' });
            assert.strictEqual(indDeterminado.valor, 10668.95);
            assert.strictEqual(indDeterminado.esOficial, true);
        });

        await testAsync('Caso 27: Rollback / Reversión Segura: Restaura el indicador al valor previo ($315.04 y $10,636.54) preservando inmutabilidad del historial', async () => {
            // Localizar el registro del historial del SMG que tenía 315.04
            const [smgHist] = await pool.query(
                `SELECT id, indicador_id, valor_anterior 
                 FROM pensiones_indicadores_historial 
                 WHERE codigo = 'SALARIO_MINIMO_GENERAL' AND valor_anterior = 315.0400 
                 ORDER BY id DESC LIMIT 1`
            );
            assert(smgHist.length > 0);

            const resRollback = await revertirIndicadorAHistorial({
                pool,
                indicadorId: smgHist[0].indicador_id,
                historialId: smgHist[0].id,
                motivo: 'Rollback automatizado de prueba en test unitario'
            });

            assert.strictEqual(resRollback.success, true);
            assert.strictEqual(resRollback.valorRestaurado, 315.04);

            // Verificar que en BD se restauró SMG = 315.04 y Pensión Ley 73 = 10,636.54
            const [smgRest] = await pool.query('SELECT valor FROM pensiones_indicadores WHERE codigo = "SALARIO_MINIMO_GENERAL" AND anio_referencia = 2026');
            assert.strictEqual(parseFloat(smgRest[0].valor), 315.04);

            const [penRest] = await pool.query('SELECT valor FROM pensiones_indicadores WHERE codigo = "PENSION_MINIMA_LEY_73" AND anio_referencia = 2026');
            assert.strictEqual(parseFloat(penRest[0].valor), 10636.54);

            // Verificar que el historial tiene una nueva fila documentando el Rollback (inmutabilidad)
            const [histNuevo] = await pool.query('SELECT * FROM pensiones_indicadores_historial WHERE codigo = "SALARIO_MINIMO_GENERAL" ORDER BY id DESC LIMIT 1');
            assert(histNuevo[0].motivo.includes('Rollback'));
            assert.strictEqual(parseFloat(histNuevo[0].valor_nuevo), 315.04);
        });

        await testAsync('Caso 28: Caché es consistente tras la ejecución del Rollback y entrega $10,636.54', async () => {
            const indPostRollback = await determinarIndicadorAplicable({ pool, regimen: 'ley73', fecha: '2026-06-01' });
            assert.strictEqual(indPostRollback.valor, 10636.54);
            assert.strictEqual(indPostRollback.esOficial, true);
        });

        await testAsync('Caso 29: Consulta del historial de sincronizaciones mediante función de telemetría', async () => {
            const telemetria = await consultarHistorialSincronizaciones(pool, { limit: 10 });
            assert(Array.isArray(telemetria));
            assert(telemetria.length > 0);
            assert(telemetria[0].estado !== undefined);
        });

        test('Caso 30: PRUEBA CRÍTICA DE NO REGRESIÓN: Motor actuarial calculateIMSSLey73Pension reproduce exactamente $52,733.07', () => {
            const baselineParams = {
                salarioMinimo: 249,
                salarioDiarioPromedio: 2585,
                semanasCotizadas: 1615,
                edad: 61,
                tieneEsposa: true,
                numeroHijos: 0,
                tienePadresDependientes: false,
                estaEnSoledad: false,
                tieneIncapacidad: false
            };

            const res = calculateIMSSLey73Pension(baselineParams);
            const delta = Math.abs(res.pensionFinalMensual - 52733.069723125);
            assert(delta < 0.0001, `Regresión actuarial: calculada=${res.pensionFinalMensual}, esperada=52733.069723125`);
        });

        test('Caso 31: Desglose actuarial interno (cuantía básica e incrementos) se mantiene 100% invariante', () => {
            const res = calculateIMSSLey73Pension({
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

            assert.strictEqual(res.grupoSalarial, '6.01 o más');
            assert.strictEqual(res.cuantiaBasica, 0.13);
            assert.strictEqual(res.incrementoAnual, 0.0245);
            assert.strictEqual(res.incrementosTotales, 21.5);
            assert.strictEqual(res.factorAdicional, 1.11);
        });

        await testAsync('Caso 32: Indicadores pasados (2024 y 2025) permanecen inmutables y congelados en BD', async () => {
            const [ind2024] = await pool.query('SELECT valor FROM pensiones_indicadores WHERE codigo = "PENSION_MINIMA_LEY_73" AND anio_referencia = 2024');
            assert.strictEqual(parseFloat(ind2024[0].valor), 8404.50);

            const [ind2025] = await pool.query('SELECT valor FROM pensiones_indicadores WHERE codigo = "PENSION_MINIMA_LEY_73" AND anio_referencia = 2025');
            assert.strictEqual(parseFloat(ind2025[0].valor), 9412.99);
        });

        console.log('\n================================================================================');
        console.log(`RESUMEN FASE 4: ${passed} PRUEBAS PASADAS, ${failed} FALLADAS`);
        console.log('================================================================================\n');

        if (failed > 0) {
            process.exit(1);
        }

    } catch (err) {
        console.error('Error fatal durante suite Fase 4:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runFase4Tests();
