/**
 * pensionSyncService.js
 * 
 * Orquestador principal de actualización automática de indicadores para Idealandia (Fase 4).
 * 
 * Principios y Restricciones:
 * 1. Concurrencia segura: Control distribuido a nivel MySQL con GET_LOCK.
 * 2. Cero valores inventados: Solo fuentes oficiales validadas.
 * 3. Opción C (Ley 73): SMG oficial derivado atómicamente a Pensión Mínima Ley 73 en la misma transacción.
 * 4. Idempotencia: 1 o 1,000 ejecuciones con el mismo valor no duplican filas en el historial.
 * 5. Telemetría completa: Todo intento y resultado se audita en pensiones_sincronizaciones.
 * 6. Política de bloqueo manual: Si bloqueo_actualizacion_automatica = 1, la sincronización se omite.
 * 7. Transacciones y caché: Caché en memoria se invalida estrictamente DESPUÉS del COMMIT exitoso.
 * 8. Respaldo y Rollback: Capacidad de revertir a cualquier valor previo del historial sin borrar auditorías.
 */

const { fetchBanxicoSerie } = require('./extractors/banxicoExtractor');
const { fetchInegiIndicador } = require('./extractors/inegiExtractor');
const { 
    normalizarValorNumerico, 
    normalizarFechaAISO, 
    extraerEjercicioFiscal, 
    determinarVigenciaIndicadorAnual,
    calcularPensionMinimaLey73 
} = require('./indicatorNormalizer');
const { 
    validarSalarioMinimoCandidato, 
    validarConsistenciaMatematicaLey73,
    validarINPCCandidato 
} = require('./indicatorValidator');
const { invalidarCacheIndicadores } = require('./pensionIndicadoresService');

const SYNC_LOCK_NAME = 'idealandia_indicadores_sync_lock';

/**
 * Registra un evento en la tabla de telemetría pensiones_sincronizaciones.
 */
async function registrarTelemetriaSincronizacion(connOrPool, {
    fuente,
    indicadorCodigo,
    ejercicioFiscal,
    estado,
    valorAnterior = null,
    valorCandidato = null,
    esDryRun = false,
    detalles = null,
    duracionMs = 0,
    ipOrigen = null,
    usuarioId = null
}) {
    try {
        await connOrPool.query(
            `INSERT INTO pensiones_sincronizaciones
             (fuente, indicador_codigo, ejercicio_fiscal, estado, valor_anterior,
              valor_candidato, es_dry_run, detalles, duracion_ms, ip_origen, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                fuente,
                indicadorCodigo,
                ejercicioFiscal,
                estado,
                valorAnterior,
                valorCandidato,
                esDryRun ? 1 : 0,
                detalles,
                duracionMs,
                ipOrigen,
                usuarioId
            ]
        );
    } catch (err) {
        console.error('[PENSION SYNC TELEMETRÍA] Error guardando registro de sincronización:', err.message);
    }
}

/**
 * Orquesta la sincronización automática de indicadores desde fuentes oficiales.
 * 
 * @param {Object} options
 * @param {Object} options.pool - Pool de conexiones MySQL
 * @param {boolean} [options.dryRun=false] - Modo simulación (no escribe cambios en indicadores)
 * @param {string} [options.fuente='BANXICO_SIE'] - Fuente a consultar ('BANXICO_SIE', 'INEGI_BIE')
 * @param {number|null} [options.usuarioId=null] - ID del usuario administrador si la llamada es manual
 * @param {string|null} [options.ip=null] - Dirección IP de origen
 * @param {Function} [options.fetchFn=null] - Cliente HTTP inyectable para pruebas unitarias
 * @param {number} [options.timeoutLockSeconds=3] - Tiempo de espera para adquirir el lock
 * @returns {Promise<Object>} Reporte detallado de la sincronización
 */
async function sincronizarIndicadores({
    pool,
    dryRun = false,
    fuente = 'BANXICO_SIE',
    usuarioId = null,
    ip = null,
    fetchFn = null,
    timeoutLockSeconds = 3
}) {
    const inicioProceso = Date.now();
    let connection = null;
    let lockAdquirido = false;
    let indicadorCodigoOperacion = fuente === 'INEGI_BIE' ? 'INPC_GENERAL' : 'SALARIO_MINIMO_GENERAL';
    let valorCandidatoOperacion = null;
    let anioFiscalOperacion = new Date().getFullYear();

    try {
        connection = await pool.getConnection();

        // 1. Control de Concurrencia con MySQL GET_LOCK
        const [lockResult] = await connection.query(
            'SELECT GET_LOCK(?, ?) AS lock_adquirido',
            [SYNC_LOCK_NAME, timeoutLockSeconds]
        );

        if (!lockResult || lockResult[0].lock_adquirido !== 1) {
            const duracionMs = Date.now() - inicioProceso;
            await registrarTelemetriaSincronizacion(pool, {
                fuente,
                indicadorCodigo: 'GENERAL',
                ejercicioFiscal: new Date().getFullYear(),
                estado: 'ERROR_BD',
                detalles: `No fue posible adquirir el lock distribuido '${SYNC_LOCK_NAME}' tras ${timeoutLockSeconds}s. Otra sincronización está en curso.`,
                duracionMs,
                ipOrigen: ip,
                usuarioId
            });

            return {
                success: false,
                error: 'SYNC_ALREADY_RUNNING',
                mensaje: 'Otra sincronización de indicadores está actualmente en ejecución.',
                duracionMs
            };
        }
        lockAdquirido = true;

        // 2. Despacho según Fuente Oficial
        if (fuente === 'BANXICO_SIE') {
            // Extracción de Salario Mínimo General via Banxico SIE Serie SL11298
            const extractorRes = await fetchBanxicoSerie({
                serieId: 'SL11298',
                token: process.env.BANXICO_TOKEN || (fetchFn ? 'mock-test-token' : null),
                timeoutMs: 8000,
                fetchFn: fetchFn || globalThis.fetch
            });

            const duracionExtractor = Date.now() - inicioProceso;

            if (!extractorRes.success) {
                let estadoFalla = 'ERROR_HTTP';
                if (extractorRes.error === 'TIMEOUT') estadoFalla = 'ERROR_TIMEOUT';
                else if (extractorRes.error && extractorRes.error.includes('JSON')) estadoFalla = 'ERROR_PARSER';
                else if (extractorRes.error && extractorRes.error.includes('TOKEN')) estadoFalla = 'ERROR_HTTP';

                await registrarTelemetriaSincronizacion(connection, {
                    fuente: extractorRes.fuente || fuente,
                    indicadorCodigo: 'SALARIO_MINIMO_GENERAL',
                    ejercicioFiscal: new Date().getFullYear(),
                    estado: estadoFalla,
                    detalles: extractorRes.detalles || extractorRes.error,
                    duracionMs: duracionExtractor,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: extractorRes.error,
                    mensaje: `Falla en extracción desde fuente oficial: ${extractorRes.detalles}`,
                    estado: estadoFalla,
                    duracionMs: duracionExtractor
                };
            }

            // 3. Normalización y Separación Semántica de Fechas
            // fechaObservacion: fecha devuelta intacta por Banxico (ej. '01/10/2026' -> '2026-10-01')
            // anioFiscal: ejercicio fiscal derivado de la observación (ej. 2026)
            // fechaVigenciaInicio / fechaVigenciaFin: periodo reglamentario del indicador anual ('2026-01-01' a '2026-12-31')
            const smgCandidato = normalizarValorNumerico(extractorRes.valorStr, 2);
            const fechaObservacion = normalizarFechaAISO(extractorRes.fechaStr);
            const anioFiscal = extraerEjercicioFiscal(fechaObservacion);
            const vigencia = determinarVigenciaIndicadorAnual(anioFiscal);
            const fechaVigenciaInicio = vigencia ? vigencia.fechaVigenciaInicio : null;
            const fechaVigenciaFin = vigencia ? vigencia.fechaVigenciaFin : null;

            if (!smgCandidato || !fechaObservacion || !anioFiscal || !fechaVigenciaInicio) {
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'BANXICO_SIE',
                    indicadorCodigo: 'SALARIO_MINIMO_GENERAL',
                    ejercicioFiscal: anioFiscal || new Date().getFullYear(),
                    estado: 'ERROR_PARSER',
                    detalles: `Error normalizando datos de fuente: valorStr='${extractorRes.valorStr}', fechaStr='${extractorRes.fechaStr}'`,
                    duracionMs: duracionExtractor,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: 'NORMALIZACION_FALLIDA',
                    mensaje: 'Los datos entregados por la fuente no pudieron ser normalizados a formato numérico o fecha válida.',
                    duracionMs: duracionExtractor
                };
            }

            // 4. Consulta del Estado Actual en BD
            const [indicadoresBD] = await connection.query(
                `SELECT id, codigo, valor, tipo_valor, fecha_vigencia_inicio, bloqueo_actualizacion_automatica, activo
                 FROM pensiones_indicadores 
                 WHERE codigo = 'SALARIO_MINIMO_GENERAL' AND anio_referencia = ? AND activo = 1`,
                [anioFiscal]
            );

            const registroActual = indicadoresBD.length > 0 ? indicadoresBD[0] : null;
            const valorActualEnBD = registroActual ? parseFloat(registroActual.valor) : null;

            // 5. Verificación de Bandera de Bloqueo Manual
            if (registroActual && registroActual.bloqueo_actualizacion_automatica === 1) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'BANXICO_SIE',
                    indicadorCodigo: 'SALARIO_MINIMO_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'BLOQUEO_MANUAL_ACTIVO',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: smgCandidato,
                    esDryRun: dryRun,
                    detalles: `El indicador SALARIO_MINIMO_GENERAL para el ejercicio ${anioFiscal} tiene bloqueo manual activo. Sincronización omitida. Fecha observación fuente: ${fechaObservacion}.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'BLOQUEO_MANUAL_ACTIVO',
                    mensaje: `Actualización automática omitida: el indicador para el ejercicio ${anioFiscal} está protegido por bloqueo manual.`,
                    ejercicioFiscal: anioFiscal,
                    fechaObservacionFuente: fechaObservacion,
                    valorActualEnBD,
                    valorCandidato: smgCandidato,
                    duracionMs: duracionTotal
                };
            }

            // 6. Validación Rigurosa y Sanity Checks Dinámicos
            const validacionSMG = validarSalarioMinimoCandidato(
                { valor: smgCandidato, anioReferencia: anioFiscal, fechaVigenciaInicio },
                valorActualEnBD
            );

            if (!validacionSMG.valido) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'BANXICO_SIE',
                    indicadorCodigo: 'SALARIO_MINIMO_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'RECHAZADO_VALIDACION',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: smgCandidato,
                    esDryRun: dryRun,
                    detalles: `${validacionSMG.motivoRechazo} (Fecha observación fuente: ${fechaObservacion}, Vigencia evaluada: ${fechaVigenciaInicio})`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: 'RECHAZADO_VALIDACION',
                    mensaje: `Dato candidato rechazado por validación de seguridad: ${validacionSMG.motivoRechazo}`,
                    fechaObservacionFuente: fechaObservacion,
                    valorCandidato: smgCandidato,
                    duracionMs: duracionTotal
                };
            }

            // 7. Verificación de Idempotencia (¿Dato sin cambios?)
            const hayCambio = !valorActualEnBD || Math.abs(valorActualEnBD - smgCandidato) >= 0.0001;

            if (!hayCambio) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'BANXICO_SIE',
                    indicadorCodigo: 'SALARIO_MINIMO_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'EXITO_SIN_CAMBIOS',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: smgCandidato,
                    esDryRun: dryRun,
                    detalles: `El indicador en BD ($${valorActualEnBD}) coincide exactamente con la fuente oficial ($${smgCandidato}). Observación de fuente: ${fechaObservacion}. Vigencia anual: ${fechaVigenciaInicio} a ${fechaVigenciaFin}. Cero escrituras realizadas.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'EXITO_SIN_CAMBIOS',
                    mensaje: `Indicador verificado en fuente oficial: sin cambios respecto a la BD ($${valorActualEnBD}).`,
                    ejercicioFiscal: anioFiscal,
                    fechaObservacionFuente: fechaObservacion,
                    fechaVigenciaInicio,
                    fechaVigenciaFin,
                    valorVigente: valorActualEnBD,
                    duracionMs: duracionTotal
                };
            }

            // 8. Cálculo de Opción C: Pensión Mínima Ley 73 Derivada Atómicamente
            const pensionLey73Candidata = calcularPensionMinimaLey73(smgCandidato);
            const validacionLey73 = validarConsistenciaMatematicaLey73(smgCandidato, pensionLey73Candidata);

            if (!validacionLey73.valido) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'BANXICO_SIE',
                    indicadorCodigo: 'PENSION_MINIMA_LEY_73',
                    ejercicioFiscal: anioFiscal,
                    estado: 'RECHAZADO_VALIDACION',
                    valorCandidato: pensionLey73Candidata,
                    detalles: validacionLey73.motivoRechazo,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: 'INCONSISTENCIA_LEY73',
                    mensaje: `Error en derivación de Ley 73: ${validacionLey73.motivoRechazo}`,
                    duracionMs: duracionTotal
                };
            }

            // 9. Modo DRY-RUN (Simulación sin escrituras en BD)
            if (dryRun) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'BANXICO_SIE',
                    indicadorCodigo: 'SALARIO_MINIMO_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'EXITO_ACTUALIZADO',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: smgCandidato,
                    esDryRun: true,
                    detalles: `[DRY-RUN] Simulación exitosa. Se actualizaría SMG a $${smgCandidato} y Pensión Ley 73 a $${pensionLey73Candidata}. Observación de fuente: ${fechaObservacion}, Vigencia anual: ${fechaVigenciaInicio} a ${fechaVigenciaFin}.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'EXITO_DRY_RUN',
                    esDryRun: true,
                    mensaje: 'Simulación completada exitosamente. Las validaciones fueron superadas y no se modificaron datos.',
                    fechaObservacionFuente: fechaObservacion,
                    cambiosPropuestos: [
                        {
                            codigo: 'SALARIO_MINIMO_GENERAL',
                            regimen: 'general',
                            ejercicioFiscal: anioFiscal,
                            fechaObservacionFuente: fechaObservacion,
                            fechaVigenciaInicio,
                            fechaVigenciaFin,
                            valorAnterior: valorActualEnBD,
                            valorCandidato: smgCandidato,
                            unidad: 'MXN_DIARIO'
                        },
                        {
                            codigo: 'PENSION_MINIMA_LEY_73',
                            regimen: 'ley73',
                            ejercicioFiscal: anioFiscal,
                            fechaObservacionFuente: fechaObservacion,
                            fechaVigenciaInicio,
                            fechaVigenciaFin,
                            formulaCalculo: `${smgCandidato} * (365 / 12) * 1.11`,
                            valorCandidato: pensionLey73Candidata,
                            unidad: 'MXN_MENSUAL'
                        }
                    ],
                    duracionMs: duracionTotal
                };
            }

            // 10. Persistencia Real en Transacción Atómica MySQL (Opción C)
            await connection.beginTransaction();

            try {
                // A. Persistir SALARIO_MINIMO_GENERAL
                let smgIndicadorId;
                const fuenteNombre = 'Banco de México (SIE API) / CONASAMI';
                const fuenteUrl = 'https://www.banxico.org.mx/SieAPIRest/';

                if (registroActual) {
                    smgIndicadorId = registroActual.id;
                    await connection.query(
                        `UPDATE pensiones_indicadores
                         SET valor = ?, tipo_valor = 'OFICIAL', fecha_vigencia_inicio = ?, fecha_vigencia_fin = ?,
                             fuente = ?, fuente_url = ?, metodo_obtencion = 'AUTOMATICA', updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [smgCandidato, fechaVigenciaInicio, fechaVigenciaFin, fuenteNombre, fuenteUrl, smgIndicadorId]
                    );
                } else {
                    const [insertSMG] = await connection.query(
                        `INSERT INTO pensiones_indicadores
                         (codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor, anio_referencia,
                          fecha_vigencia_inicio, fecha_vigencia_fin, fuente, fuente_url, fundamento_legal,
                          formula_calculo, metodo_obtencion, activo)
                         VALUES
                         ('SALARIO_MINIMO_GENERAL', 'general', ?, 'Salario mínimo general diario vigente en el área geográfica nacional',
                          ?, 'MXN_DIARIO', 'OFICIAL', ?, ?, ?, ?, ?, 'Resolución de CONASAMI publicada en DOF y reportada por Banxico SIE',
                          'Fijación anual por acuerdo tripartito en CONASAMI', 'AUTOMATICA', 1)`,
                        [
                            `Salario Mínimo General ${anioFiscal}`,
                            smgCandidato,
                            anioFiscal,
                            fechaVigenciaInicio,
                            fechaVigenciaFin,
                            fuenteNombre,
                            fuenteUrl
                        ]
                    );
                    smgIndicadorId = insertSMG.insertId;
                }

                // Historial de auditoría para SMG
                await connection.query(
                    `INSERT INTO pensiones_indicadores_historial
                     (indicador_id, codigo, regimen, valor_anterior, valor_nuevo, tipo_valor_nuevo,
                      motivo, fuente, fuente_url, usuario_id, metodo_actualizacion)
                     VALUES (?, 'SALARIO_MINIMO_GENERAL', 'general', ?, ?, 'OFICIAL',
                      ?, ?, ?, ?, 'AUTOMATICA')`,
                    [
                        smgIndicadorId,
                        valorActualEnBD,
                        smgCandidato,
                        `Actualización automática oficial desde ${fuenteNombre} (Observación fuente: ${fechaObservacion})`,
                        fuenteNombre,
                        fuenteUrl,
                        usuarioId
                    ]
                );

                // B. Persistir PENSION_MINIMA_LEY_73 (Opción C)
                const [pensionLey73BD] = await connection.query(
                    `SELECT id, valor FROM pensiones_indicadores 
                     WHERE codigo = 'PENSION_MINIMA_LEY_73' AND anio_referencia = ? AND activo = 1`,
                    [anioFiscal]
                );

                let pensionLey73Id;
                const valorAnteriorLey73 = pensionLey73BD.length > 0 ? parseFloat(pensionLey73BD[0].valor) : null;
                const formulaTexto = `${smgCandidato} * (365 / 12) * 1.11`;
                const fundamentoLey73 = 'Artículo 168 de la Ley del Seguro Social de 1973 y Decreto publicado en el DOF el 20 de diciembre de 2001 (factor 1.11)';

                if (pensionLey73BD.length > 0) {
                    pensionLey73Id = pensionLey73BD[0].id;
                    await connection.query(
                        `UPDATE pensiones_indicadores
                         SET valor = ?, tipo_valor = 'OFICIAL', fecha_vigencia_inicio = ?, fecha_vigencia_fin = ?,
                             fuente = ?, fuente_url = ?, formula_calculo = ?, metodo_obtencion = 'AUTOMATICA',
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [
                            pensionLey73Candidata,
                            fechaVigenciaInicio,
                            fechaVigenciaFin,
                            fuenteNombre,
                            fuenteUrl,
                            formulaTexto,
                            pensionLey73Id
                        ]
                    );
                } else {
                    const [insertPension] = await connection.query(
                        `INSERT INTO pensiones_indicadores
                         (codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor, anio_referencia,
                          fecha_vigencia_inicio, fecha_vigencia_fin, fuente, fuente_url, fundamento_legal,
                          formula_calculo, metodo_obtencion, activo)
                         VALUES
                         ('PENSION_MINIMA_LEY_73', 'ley73', ?, 'Pensión mínima garantizada mensual para pensionados bajo régimen Ley 73',
                          ?, 'MXN_MENSUAL', 'OFICIAL', ?, ?, ?, ?, ?, ?, ?, 'AUTOMATICA', 1)`,
                        [
                            `Pensión Mínima Garantizada Ley 73 (${anioFiscal})`,
                            pensionLey73Candidata,
                            anioFiscal,
                            fechaVigenciaInicio,
                            fechaVigenciaFin,
                            fuenteNombre,
                            fuenteUrl,
                            fundamentoLey73,
                            formulaTexto
                        ]
                    );
                    pensionLey73Id = insertPension.insertId;
                }

                // Historial de auditoría para Pensión Ley 73
                await connection.query(
                    `INSERT INTO pensiones_indicadores_historial
                     (indicador_id, codigo, regimen, valor_anterior, valor_nuevo, tipo_valor_nuevo,
                      motivo, fuente, fuente_url, usuario_id, metodo_actualizacion)
                     VALUES (?, 'PENSION_MINIMA_LEY_73', 'ley73', ?, ?, 'OFICIAL',
                      ?, ?, ?, ?, 'AUTOMATICA')`,
                    [
                        pensionLey73Id,
                        valorAnteriorLey73,
                        pensionLey73Candidata,
                        `Derivación automática oficial Ley 73 conforme a SMG ($${smgCandidato}) x (365/12) x 1.11 (Observación fuente: ${fechaObservacion})`,
                        fuenteNombre,
                        fuenteUrl,
                        usuarioId
                    ]
                );

                // Commit formal de la transacción
                await connection.commit();

                // 11. Post-Commit: Invalidación Inmediata de Caché
                invalidarCacheIndicadores();

                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'BANXICO_SIE',
                    indicadorCodigo: 'SALARIO_MINIMO_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'EXITO_ACTUALIZADO',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: smgCandidato,
                    esDryRun: false,
                    detalles: `Actualización automática exitosa. SMG: $${smgCandidato}, Pensión Ley 73: $${pensionLey73Candidata}. Observación de fuente: ${fechaObservacion}, Vigencia: ${fechaVigenciaInicio} a ${fechaVigenciaFin}.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'EXITO_ACTUALIZADO',
                    mensaje: `Indicadores para el ejercicio ${anioFiscal} actualizados exitosamente en base de datos.`,
                    ejercicioFiscal: anioFiscal,
                    fechaObservacionFuente: fechaObservacion,
                    fechaVigenciaInicio,
                    fechaVigenciaFin,
                    smg: {
                        valorAnterior: valorActualEnBD,
                        valorNuevo: smgCandidato
                    },
                    pensionLey73: {
                        valorAnterior: valorAnteriorLey73,
                        valorNuevo: pensionLey73Candidata,
                        formula: formulaTexto
                    },
                    duracionMs: duracionTotal
                };

            } catch (trxError) {
                await connection.rollback();
                // Nota: NUNCA se invalida el caché ante un ROLLBACK
                throw trxError;
            }

        } else if (fuente === 'INEGI_BIE') {
            // Extracción de INPC via INEGI BIE Indicador 910392
            const extractorRes = await fetchInegiIndicador({
                indicadorId: '910392',
                token: process.env.INEGI_TOKEN || (fetchFn ? 'mock-test-token' : null),
                timeoutMs: 8000,
                fetchFn: fetchFn || globalThis.fetch
            });

            const duracionExtractor = Date.now() - inicioProceso;

            if (!extractorRes.success) {
                let estadoFalla = 'ERROR_HTTP';
                if (extractorRes.error === 'TIMEOUT') estadoFalla = 'ERROR_TIMEOUT';
                else if (extractorRes.error && extractorRes.error.includes('JSON')) estadoFalla = 'ERROR_PARSER';
                else if (extractorRes.error && extractorRes.error.includes('TOKEN')) estadoFalla = 'ERROR_HTTP';

                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: new Date().getFullYear(),
                    estado: estadoFalla,
                    detalles: extractorRes.detalles || extractorRes.error,
                    duracionMs: duracionExtractor,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: extractorRes.error,
                    mensaje: `Falla en extracción desde INEGI BIE: ${extractorRes.detalles}`,
                    estado: estadoFalla,
                    duracionMs: duracionExtractor
                };
            }

            // Normalización y Separación Semántica
            const inpcCandidato = normalizarValorNumerico(extractorRes.valorStr, 4);
            const fechaObservacion = normalizarFechaAISO(extractorRes.periodoStr);
            const anioFiscal = extraerEjercicioFiscal(fechaObservacion) || new Date().getFullYear();
            const vigencia = determinarVigenciaIndicadorAnual(anioFiscal);
            const fechaVigenciaInicio = vigencia ? vigencia.fechaVigenciaInicio : `${anioFiscal}-01-01`;
            const fechaVigenciaFin = vigencia ? vigencia.fechaVigenciaFin : `${anioFiscal}-12-31`;

            indicadorCodigoOperacion = 'INPC_GENERAL';
            valorCandidatoOperacion = inpcCandidato;
            anioFiscalOperacion = anioFiscal;

            if (!inpcCandidato || !fechaObservacion) {
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'ERROR_PARSER',
                    detalles: `Error normalizando datos de INEGI: valorStr='${extractorRes.valorStr}', periodoStr='${extractorRes.periodoStr}'`,
                    duracionMs: duracionExtractor,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: 'NORMALIZACION_FALLIDA',
                    mensaje: 'Los datos entregados por INEGI no pudieron ser normalizados.',
                    duracionMs: duracionExtractor
                };
            }

            // Consulta del Estado Actual en BD
            const [indicadoresBD] = await connection.query(
                `SELECT id, codigo, valor, tipo_valor, fecha_vigencia_inicio, bloqueo_actualizacion_automatica, activo
                 FROM pensiones_indicadores 
                 WHERE codigo = 'INPC_GENERAL' AND anio_referencia = ? AND activo = 1`,
                [anioFiscal]
            );

            const registroActual = indicadoresBD.length > 0 ? indicadoresBD[0] : null;
            const valorActualEnBD = registroActual ? parseFloat(registroActual.valor) : null;

            // Bloqueo manual
            if (registroActual && registroActual.bloqueo_actualizacion_automatica === 1) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'BLOQUEO_MANUAL_ACTIVO',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: inpcCandidato,
                    esDryRun: dryRun,
                    detalles: `El indicador INPC_GENERAL para el ejercicio ${anioFiscal} tiene bloqueo manual activo. Sincronización omitida.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'BLOQUEO_MANUAL_ACTIVO',
                    mensaje: `Actualización automática omitida: el indicador para el ejercicio ${anioFiscal} está protegido por bloqueo manual.`,
                    ejercicioFiscal: anioFiscal,
                    fechaObservacionFuente: fechaObservacion,
                    valorActualEnBD,
                    valorCandidato: inpcCandidato,
                    duracionMs: duracionTotal
                };
            }

            // Validación INPC
            const validacionINPC = validarINPCCandidato(
                { valor: inpcCandidato, anioReferencia: anioFiscal },
                valorActualEnBD
            );

            if (!validacionINPC.valido) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'RECHAZADO_VALIDACION',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: inpcCandidato,
                    esDryRun: dryRun,
                    detalles: `${validacionINPC.motivoRechazo} (Fecha observación fuente: ${fechaObservacion})`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: 'RECHAZADO_VALIDACION',
                    mensaje: `Dato candidato INPC rechazado por validación de seguridad: ${validacionINPC.motivoRechazo}`,
                    fechaObservacionFuente: fechaObservacion,
                    valorCandidato: inpcCandidato,
                    duracionMs: duracionTotal
                };
            }

            // Idempotencia
            const hayCambio = !valorActualEnBD || Math.abs(valorActualEnBD - inpcCandidato) >= 0.0001;

            if (!hayCambio) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'EXITO_SIN_CAMBIOS',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: inpcCandidato,
                    esDryRun: dryRun,
                    detalles: `El indicador INPC en BD (${valorActualEnBD}) coincide exactamente con la fuente oficial INEGI (${inpcCandidato}). Observación de fuente: ${fechaObservacion}. Cero escrituras realizadas.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'EXITO_SIN_CAMBIOS',
                    mensaje: `Indicador INPC verificado en fuente oficial: sin cambios respecto a la BD (${valorActualEnBD}).`,
                    ejercicioFiscal: anioFiscal,
                    fechaObservacionFuente: fechaObservacion,
                    fechaVigenciaInicio,
                    fechaVigenciaFin,
                    valorVigente: valorActualEnBD,
                    duracionMs: duracionTotal
                };
            }

            // Modo DRY-RUN
            if (dryRun) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'EXITO_ACTUALIZADO',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: inpcCandidato,
                    esDryRun: true,
                    detalles: `[DRY-RUN] Simulación exitosa desde INEGI BIE. Se actualizaría INPC a ${inpcCandidato}. Observación de fuente: ${fechaObservacion}, Vigencia: ${fechaVigenciaInicio} a ${fechaVigenciaFin}.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'EXITO_DRY_RUN',
                    esDryRun: true,
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    mensaje: 'Simulación completada exitosamente desde INEGI BIE. Las validaciones fueron superadas y no se modificaron datos.',
                    fechaObservacionFuente: fechaObservacion,
                    cambiosPropuestos: [
                        {
                            codigo: 'INPC_GENERAL',
                            regimen: 'general',
                            indicadorId: '910392',
                            ejercicioFiscal: anioFiscal,
                            fechaObservacionFuente: fechaObservacion,
                            fechaVigenciaInicio,
                            fechaVigenciaFin,
                            valorAnterior: valorActualEnBD,
                            valorCandidato: inpcCandidato,
                            unidad: 'INDICE'
                        }
                    ],
                    duracionMs: duracionTotal
                };
            }

            // Verificación previa de compatibilidad de esquema para la unidad 'INDICE'
            // Regla arquitectónica: No inventar unidades erróneas ni alterar el esquema sin migración formal aprobada.
            const [columnInfo] = await connection.query(`
                SHOW COLUMNS FROM pensiones_indicadores WHERE Field = 'unidad'
            `);
            const enumDef = (columnInfo && columnInfo.length > 0 && columnInfo[0].Type) ? columnInfo[0].Type : '';
            const soportaUnidadIndice = enumDef.includes("'INDICE'");

            if (!soportaUnidadIndice) {
                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'ERROR_BD',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: inpcCandidato,
                    esDryRun: false,
                    detalles: `El esquema actual de pensiones_indicadores.unidad (${enumDef}) no admite la unidad 'INDICE'. No se modifica la BD ni se inventan unidades erróneas; se requiere migración formal previa.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: false,
                    error: 'UNIDAD_INDICE_NO_SOPORTADA',
                    estado: 'ERROR_BD',
                    mensaje: `No es posible persistir el INPC en base de datos: la columna 'unidad' no admite el valor 'INDICE'. Se requiere migración formal de esquema. Para simulación utilice dryRun=true.`,
                    ejercicioFiscal: anioFiscal,
                    fechaObservacionFuente: fechaObservacion,
                    valorCandidato: inpcCandidato,
                    duracionMs: duracionTotal
                };
            }

            // Persistencia Real en Transacción MySQL
            await connection.beginTransaction();

            try {
                let inpcIndicadorId;
                const fuenteNombre = 'Instituto Nacional de Estadística y Geografía (INEGI BIE)';
                const fuenteUrl = 'https://www.inegi.org.mx/app/api/indicadores/desarrolladores/';

                if (registroActual) {
                    inpcIndicadorId = registroActual.id;
                    await connection.query(
                        `UPDATE pensiones_indicadores
                         SET valor = ?, tipo_valor = 'OFICIAL', fecha_vigencia_inicio = ?, fecha_vigencia_fin = ?,
                             fuente = ?, fuente_url = ?, metodo_obtencion = 'AUTOMATICA', updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [inpcCandidato, fechaVigenciaInicio, fechaVigenciaFin, fuenteNombre, fuenteUrl, inpcIndicadorId]
                    );
                } else {
                    const [insertINPC] = await connection.query(
                        `INSERT INTO pensiones_indicadores
                         (codigo, regimen, nombre, descripcion, valor, unidad, tipo_valor, anio_referencia,
                          fecha_vigencia_inicio, fecha_vigencia_fin, fuente, fuente_url, fundamento_legal,
                          formula_calculo, metodo_obtencion, activo)
                         VALUES
                         ('INPC_GENERAL', 'general', ?, 'Índice Nacional de Precios al Consumidor para ajuste anual de pensiones',
                          ?, 'INDICE', 'OFICIAL', ?, ?, ?, ?, ?, 'Artículo 170 de la Ley del Seguro Social y publicación DOF',
                          'Publicación mensual en DOF/INEGI', 'AUTOMATICA', 1)`,
                        [
                            `Índice Nacional de Precios al Consumidor ${anioFiscal}`,
                            inpcCandidato,
                            anioFiscal,
                            fechaVigenciaInicio,
                            fechaVigenciaFin,
                            fuenteNombre,
                            fuenteUrl
                        ]
                    );
                    inpcIndicadorId = insertINPC.insertId;
                }

                await connection.query(
                    `INSERT INTO pensiones_indicadores_historial
                     (indicador_id, codigo, regimen, valor_anterior, valor_nuevo, tipo_valor_nuevo,
                      motivo, fuente, fuente_url, usuario_id, metodo_actualizacion)
                     VALUES (?, 'INPC_GENERAL', 'general', ?, ?, 'OFICIAL',
                      ?, ?, ?, ?, 'AUTOMATICA')`,
                    [
                        inpcIndicadorId,
                        valorActualEnBD,
                        inpcCandidato,
                        `Actualización automática oficial desde ${fuenteNombre} (Observación de fuente: ${fechaObservacion})`,
                        fuenteNombre,
                        fuenteUrl,
                        usuarioId
                    ]
                );

                await connection.commit();
                invalidarCacheIndicadores();

                const duracionTotal = Date.now() - inicioProceso;
                await registrarTelemetriaSincronizacion(connection, {
                    fuente: 'INEGI_BIE',
                    indicadorCodigo: 'INPC_GENERAL',
                    ejercicioFiscal: anioFiscal,
                    estado: 'EXITO_ACTUALIZADO',
                    valorAnterior: valorActualEnBD,
                    valorCandidato: inpcCandidato,
                    esDryRun: false,
                    detalles: `Actualización automática exitosa desde INEGI BIE. INPC: ${inpcCandidato}. Observación de fuente: ${fechaObservacion}, Vigencia: ${fechaVigenciaInicio} a ${fechaVigenciaFin}.`,
                    duracionMs: duracionTotal,
                    ipOrigen: ip,
                    usuarioId
                });

                return {
                    success: true,
                    estado: 'EXITO_ACTUALIZADO',
                    mensaje: `Indicador INPC para el ejercicio ${anioFiscal} actualizado exitosamente en base de datos.`,
                    ejercicioFiscal: anioFiscal,
                    fechaObservacionFuente: fechaObservacion,
                    fechaVigenciaInicio,
                    fechaVigenciaFin,
                    inpc: {
                        valorAnterior: valorActualEnBD,
                        valorNuevo: inpcCandidato
                    },
                    duracionMs: duracionTotal
                };

            } catch (trxError) {
                await connection.rollback();
                throw trxError;
            }

        } else {
            const duracionTotal = Date.now() - inicioProceso;
            await registrarTelemetriaSincronizacion(connection, {
                fuente,
                indicadorCodigo: 'GENERAL',
                ejercicioFiscal: new Date().getFullYear(),
                estado: 'ERROR_PARAMETRO',
                detalles: `La fuente '${fuente}' no está soportada. Fuentes disponibles: BANXICO_SIE, INEGI_BIE.`,
                duracionMs: duracionTotal,
                ipOrigen: ip,
                usuarioId
            });

            return {
                success: false,
                error: 'FUENTE_NO_SOPORTADA',
                mensaje: `La fuente '${fuente}' no está soportada. Fuentes disponibles: BANXICO_SIE, INEGI_BIE.`,
                duracionMs: duracionTotal
            };
        }

    } catch (err) {
        const duracionTotal = Date.now() - inicioProceso;
        console.error('[PENSION SYNC SERVICE] Error fatal en sincronización:', err);

        if (connection) {
            await registrarTelemetriaSincronizacion(connection, {
                fuente,
                indicadorCodigo: indicadorCodigoOperacion,
                ejercicioFiscal: anioFiscalOperacion,
                estado: 'ERROR_BD',
                valorAnterior: null,
                valorCandidato: valorCandidatoOperacion,
                esDryRun: dryRun,
                detalles: err.message || 'Excepción no controlada durante el proceso de sincronización.',
                duracionMs: duracionTotal,
                ipOrigen: ip,
                usuarioId
            });
        }

        return {
            success: false,
            error: 'SYNC_FATAL_ERROR',
            mensaje: `Error durante la sincronización: ${err.message}`,
            duracionMs: duracionTotal
        };
    } finally {
        if (connection) {
            if (lockAdquirido) {
                try {
                    await connection.query('SELECT RELEASE_LOCK(?)', [SYNC_LOCK_NAME]);
                } catch (relErr) {
                    console.warn('[PENSION SYNC LOCK] Advertencia al liberar lock:', relErr.message);
                }
            }
            connection.release();
        }
    }
}

/**
 * Revierte de forma auditable e inmutable un indicador al valor registrado en un punto del historial.
 * 
 * @param {Object} params
 * @param {Object} params.pool - Pool de conexiones MySQL
 * @param {number} params.indicadorId - ID del indicador en pensiones_indicadores
 * @param {number} params.historialId - ID de la fila en pensiones_indicadores_historial
 * @param {number|null} [params.usuarioId=null] - ID del usuario que solicita la reversión
 * @param {string} [params.motivo='Rollback auditado'] - Motivo formal de la reversión
 * @returns {Promise<Object>}
 */
async function revertirIndicadorAHistorial({
    pool,
    indicadorId,
    historialId,
    usuarioId = null,
    motivo = 'Rollback manual auditado a punto histórico'
}) {
    let connection = null;
    let lockAdquirido = false;

    try {
        connection = await pool.getConnection();

        const [lockResult] = await connection.query(
            'SELECT GET_LOCK(?, 3) AS lock_adquirido',
            [SYNC_LOCK_NAME]
        );
        if (!lockResult || lockResult[0].lock_adquirido !== 1) {
            return {
                success: false,
                error: 'SYNC_LOCKED',
                mensaje: 'No se puede ejecutar el rollback porque otra operación de sincronización está en curso.'
            };
        }
        lockAdquirido = true;

        // 1. Consultar el registro histórico a restaurar
        const [histRows] = await connection.query(
            `SELECT id, indicador_id, codigo, regimen, valor_anterior, valor_nuevo, tipo_valor_nuevo, fecha_cambio
             FROM pensiones_indicadores_historial
             WHERE id = ? AND indicador_id = ?`,
            [historialId, indicadorId]
        );

        if (histRows.length === 0) {
            return {
                success: false,
                error: 'HISTORIAL_NO_ENCONTRADO',
                mensaje: `No se encontró el registro de historial #${historialId} para el indicador #${indicadorId}.`
            };
        }

        const histPunto = histRows[0];
        const valorARestaurar = histPunto.valor_anterior !== null 
            ? parseFloat(histPunto.valor_anterior) 
            : parseFloat(histPunto.valor_nuevo);

        if (isNaN(valorARestaurar) || valorARestaurar <= 0) {
            return {
                success: false,
                error: 'VALOR_HISTORICO_INVALIDO',
                mensaje: 'El punto histórico no cuenta con un valor numérico anterior restaurable.'
            };
        }

        // 2. Consultar el indicador actual
        const [indRows] = await connection.query(
            'SELECT * FROM pensiones_indicadores WHERE id = ?',
            [indicadorId]
        );

        if (indRows.length === 0) {
            return {
                success: false,
                error: 'INDICADOR_NO_ENCONTRADO',
                mensaje: `Indicador #${indicadorId} no existe en la base de datos.`
            };
        }

        const indActual = indRows[0];
        const valorActual = parseFloat(indActual.valor);

        // 3. Ejecutar transacción de Reversión
        await connection.beginTransaction();

        try {
            await connection.query(
                `UPDATE pensiones_indicadores
                 SET valor = ?, metodo_obtencion = 'MANUAL', updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [valorARestaurar, indicadorId]
            );

            // Inserción de nuevo evento de auditoría (Inmutabilidad del historial)
            await connection.query(
                `INSERT INTO pensiones_indicadores_historial
                 (indicador_id, codigo, regimen, valor_anterior, valor_nuevo, tipo_valor_nuevo,
                  motivo, fuente, fuente_url, usuario_id, metodo_actualizacion)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL')`,
                [
                    indicadorId,
                    indActual.codigo,
                    indActual.regimen,
                    valorActual,
                    valorARestaurar,
                    indActual.tipo_valor,
                    `${motivo.trim()} (Restaurado desde punto histórico #${historialId})`,
                    indActual.fuente,
                    indActual.fuente_url,
                    usuarioId
                ]
            );

            // Si se revierte el Salario Mínimo General, revertir en cascada consistente la Pensión Ley 73
            if (indActual.codigo === 'SALARIO_MINIMO_GENERAL') {
                const pensionRevertida = calcularPensionMinimaLey73(valorARestaurar);
                const [pensionBD] = await connection.query(
                    `SELECT id, valor FROM pensiones_indicadores 
                     WHERE codigo = 'PENSION_MINIMA_LEY_73' AND anio_referencia = ? AND activo = 1`,
                    [indActual.anio_referencia]
                );

                if (pensionBD.length > 0) {
                    const penId = pensionBD[0].id;
                    const penValAnterior = parseFloat(pensionBD[0].valor);
                    await connection.query(
                        `UPDATE pensiones_indicadores
                         SET valor = ?, formula_calculo = ?, metodo_obtencion = 'MANUAL', updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [pensionRevertida, `${valorARestaurar} * (365 / 12) * 1.11`, penId]
                    );

                    await connection.query(
                        `INSERT INTO pensiones_indicadores_historial
                         (indicador_id, codigo, regimen, valor_anterior, valor_nuevo, tipo_valor_nuevo,
                          motivo, fuente, fuente_url, usuario_id, metodo_actualizacion)
                         VALUES (?, 'PENSION_MINIMA_LEY_73', 'ley73', ?, ?, 'OFICIAL',
                          ?, ?, ?, ?, 'MANUAL')`,
                        [
                            penId,
                            penValAnterior,
                            pensionRevertida,
                            `Reversión consistente Ley 73 derivada de Rollback en SMG #${indicadorId}`,
                            indActual.fuente,
                            indActual.fuente_url,
                            usuarioId
                        ]
                    );
                }
            }

            await connection.commit();

            // 4. Invalidar Caché tras Commit Exitoso
            invalidarCacheIndicadores();

            return {
                success: true,
                mensaje: `Indicador #${indicadorId} revertido exitosamente al valor histórico $${valorARestaurar}.`,
                valorAnterior: valorActual,
                valorRestaurado: valorARestaurar
            };

        } catch (trxErr) {
            await connection.rollback();
            throw trxErr;
        }

    } catch (err) {
        console.error('[PENSION ROLLBACK] Error en reversión:', err);
        return {
            success: false,
            error: 'ROLLBACK_FAILED',
            mensaje: err.message
        };
    } finally {
        if (connection) {
            if (lockAdquirido) {
                try {
                    await connection.query('SELECT RELEASE_LOCK(?)', [SYNC_LOCK_NAME]);
                } catch (e) {}
            }
            connection.release();
        }
    }
}

/**
 * Consulta la bitácora de telemetría de sincronizaciones.
 */
async function consultarHistorialSincronizaciones(pool, { limit = 50, estado = null, fuente = null } = {}) {
    let sql = `
        SELECT s.id, s.fuente, s.indicador_codigo, s.ejercicio_fiscal, s.estado,
               CAST(s.valor_anterior AS DOUBLE) AS valor_anterior,
               CAST(s.valor_candidato AS DOUBLE) AS valor_candidato,
               s.es_dry_run, s.detalles, s.duracion_ms, s.ip_origen,
               s.created_at, u.usuario AS ejecutado_por
        FROM pensiones_sincronizaciones s
        LEFT JOIN usuarios u ON s.usuario_id = u.id
        WHERE 1=1
    `;
    const params = [];

    if (estado) {
        sql += ' AND s.estado = ?';
        params.push(estado);
    }
    if (fuente) {
        sql += ' AND s.fuente = ?';
        params.push(fuente);
    }

    sql += ' ORDER BY s.created_at DESC, s.id DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 50);

    const [rows] = await pool.query(sql, params);
    return rows;
}

module.exports = {
    sincronizarIndicadores,
    revertirIndicadorAHistorial,
    consultarHistorialSincronizaciones,
    SYNC_LOCK_NAME
};
