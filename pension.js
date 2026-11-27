// Contingencia técnica de último recurso para entornos aislados u offline (ej. tests unitarios síncronos).
// NOTA DE ARQUITECTURA: La FUENTE DE VERDAD oficial y productiva para el Salario Mínimo General
// reside exclusivamente en la base de datos (pensiones_indicadores) a través de
// pensionIndicadoresService.js y endpoints de API (/api/pension/salario-minimo-vigente).
// Este módulo (pension.js) es un motor actuarial puro y no contiene tablas anuales de producción.
const CONTINGENCIA_TECNICA_SMG = 315.04;

const TABLA_GRUPOS_SALARIALES = [
    { max: 1.00, cuantia: 0.8000, incremento: 0.00563 },
    { max: 1.25, cuantia: 0.7711, incremento: 0.00814 },
    { max: 1.50, cuantia: 0.5818, incremento: 0.01178 },
    { max: 1.75, cuantia: 0.4923, incremento: 0.01430 },
    { max: 2.00, cuantia: 0.4267, incremento: 0.01615 },
    { max: 2.25, cuantia: 0.3765, incremento: 0.01756 },
    { max: 2.50, cuantia: 0.3368, incremento: 0.01868 },
    { max: 2.75, cuantia: 0.3048, incremento: 0.01958 },
    { max: 3.00, cuantia: 0.2783, incremento: 0.02033 },
    { max: 3.25, cuantia: 0.2560, incremento: 0.02096 },
    { max: 3.50, cuantia: 0.2370, incremento: 0.02149 },
    { max: 3.75, cuantia: 0.2207, incremento: 0.02195 },
    { max: 4.00, cuantia: 0.2065, incremento: 0.02235 },
    { max: 4.25, cuantia: 0.1939, incremento: 0.02271 },
    { max: 4.50, cuantia: 0.1829, incremento: 0.02302 },
    { max: 4.75, cuantia: 0.1730, incremento: 0.02330 },
    { max: 5.00, cuantia: 0.1641, incremento: 0.02355 },
    { max: 5.25, cuantia: 0.1561, incremento: 0.02377 },
    { max: 5.50, cuantia: 0.1488, incremento: 0.02398 },
    { max: 5.75, cuantia: 0.1422, incremento: 0.02416 },
    { max: 6.00, cuantia: 0.1362, incremento: 0.02433 },
    { max: Infinity, cuantia: 0.1300, incremento: 0.02450 }
];

const TABLA_EDAD = {
    60: 0.75,
    61: 0.80,
    62: 0.85,
    63: 0.90,
    64: 0.95,
    65: 1.00
};

const FACTOR_ADICIONAL = 1.11;

function getGrupoSalarial(vecesSalarioMinimo) {
    for (let grupo of TABLA_GRUPOS_SALARIALES) {
        if (vecesSalarioMinimo <= grupo.max) {
            return grupo;
        }
    }
    return TABLA_GRUPOS_SALARIALES[TABLA_GRUPOS_SALARIALES.length - 1];
}

function calculateIMSSLey73Pension(data) {
    const {
        salarioMinimo,
        salarioDiarioPromedio,
        semanasCotizadas,
        edad,
        tieneEsposa,
        numeroHijos,
        tienePadresDependientes,
        estaEnSoledad,
        tieneIncapacidad
    } = data;

    // 2. CÁLCULO DE VECES EL SALARIO MÍNIMO
    const vecesSalarioMinimoStr = (salarioDiarioPromedio / salarioMinimo).toString();
    const decimalIndex = vecesSalarioMinimoStr.indexOf('.');
    let vecesSalarioMinimo;
    if (decimalIndex !== -1) {
        vecesSalarioMinimo = parseFloat(vecesSalarioMinimoStr.substring(0, decimalIndex + 3)); // Truncate to 2 decimals
    } else {
        vecesSalarioMinimo = parseFloat(vecesSalarioMinimoStr);
    }

    // 4. SALARIO DIARIO, MENSUAL Y ANUAL
    const salarioDiario = salarioDiarioPromedio;
    const salarioMensual = salarioDiario * 30.4;
    const salarioAnual = salarioDiario * 365;

    // 5. CÁLCULO DE SEMANAS E INCREMENTOS
    const anosParaIncrementos = (semanasCotizadas - 500) / 52;
    const incrementosCompletos = Math.trunc(anosParaIncrementos);
    const semanasPendientes = semanasCotizadas - ((incrementosCompletos * 52) + 500);

    let incrementoAdicional = 0;
    if (semanasPendientes > 26) {
        incrementoAdicional = 1;
    } else if (semanasPendientes > 12) {
        incrementoAdicional = 0.5;
    }

    const incrementosTotales = incrementosCompletos + incrementoAdicional;

    // 6 & 7. CUANTÍA BÁSICA E INCREMENTOS -> IMPORTE BASE POR VEJEZ
    const grupoSalarial = getGrupoSalarial(vecesSalarioMinimo);
    const cuantiaBasica = grupoSalarial.cuantia;
    const incrementoAnual = grupoSalarial.incremento;

    const importeAnualIncrementos = salarioAnual * incrementoAnual * incrementosTotales;
    const importeAnualBasico = salarioAnual * cuantiaBasica;
    const pensionBaseAnualCalculada = importeAnualBasico + importeAnualIncrementos;

    // 8. PORCENTAJE SEGÚN EDAD
    const porcentajeEdad = TABLA_EDAD[Math.min(Math.max(edad, 60), 65)];
    const pensionBaseAnual = pensionBaseAnualCalculada * porcentajeEdad;
    const pensionBaseMensual = pensionBaseAnual / 12;

    // 9, 10, 11. ASIGNACIONES FAMILIARES Y AYUDA ASISTENCIAL
    let porcentajeAsignacionesFamiliar = 0;
    let porcentajeAyudaAsistencial = 0;

    let asigEsposa = 0;
    let asigHijos = 0;
    let asigPadres = 0;
    let asigSoledad = 0;
    let asigIncapacidad = 0;

    if (tieneEsposa) {
        asigEsposa = 0.15;
    }

    if (numeroHijos > 0) {
        asigHijos = 0.10 * numeroHijos;
    }

    if (!tieneEsposa && numeroHijos === 0 && tienePadresDependientes) {
        asigPadres = 0.10;
    }

    if (!tieneEsposa && numeroHijos === 0 && !tienePadresDependientes && estaEnSoledad) {
        asigSoledad = 0.15;
    }

    if (tieneIncapacidad) {
        asigIncapacidad = 0.20;
    }

    porcentajeAsignacionesFamiliar = asigEsposa + asigHijos + asigPadres;
    porcentajeAyudaAsistencial = asigSoledad + asigIncapacidad;

    const totalPorcentajeAsignaciones = porcentajeAsignacionesFamiliar + porcentajeAyudaAsistencial;

    const asignacionesAnualesFamiliar = pensionBaseAnual * porcentajeAsignacionesFamiliar;
    const asignacionesAnualesAsistencial = pensionBaseAnual * porcentajeAyudaAsistencial;

    const asignacionesAnuales = pensionBaseAnual * totalPorcentajeAsignaciones;
    const asignacionesMensuales = asignacionesAnuales / 12;

    const pensionAntesFactorAnual = pensionBaseAnual + asignacionesAnuales;

    // 13. FACTOR FINAL DEL EXCEL
    const pensionFinalAnual = pensionAntesFactorAnual * FACTOR_ADICIONAL;
    const pensionFinalMensual = pensionFinalAnual / 12;

    return {
        salarioDiario,
        salarioMensual,
        salarioAnual,
        vecesSalarioMinimo,
        grupoSalarial: `${grupoSalarial.max === Infinity ? '6.01 o más' : (grupoSalarial.max - 0.24).toFixed(2) + ' - ' + grupoSalarial.max.toFixed(2)}`, // Approximate logic just to show the group
        cuantiaBasica,
        incrementoAnual,
        incrementosCompletos,
        semanasPendientes,
        incrementoAdicional,
        incrementosTotales,
        porcentajeEdad,
        pensionBaseAnual,
        pensionBaseMensual,
        porcentajeAsignaciones: totalPorcentajeAsignaciones,
        asignacionesFamiliaresAnuales: asignacionesAnualesFamiliar,
        ayudaAsistencialAnual: asignacionesAnualesAsistencial,
        asignacionesAnuales,
        asignacionesMensuales,
        factorAdicional: FACTOR_ADICIONAL,
        pensionFinalAnual,
        pensionFinalMensual
    };
}

/**
 * Capa posterior para determinar la pensión aplicable según el mínimo legal garantizado.
 * Regla: PENSIÓN QUE APLICARÁ = MAX(Pensión calculada, Pensión mínima aplicable)
 * 
 * NO modifica la matemática existente de calculateIMSSLey73Pension.
 * 
 * @param {object} pensionCalculadaResult Resultado retornado por calculateIMSSLey73Pension
 * @param {object} infoMinimoLegal Objeto con información del indicador mínimo legal (de pensionIndicadoresService)
 * @returns {object} Objeto enriquecido con los 3 conceptos y metadatos de transparencia
 */
function aplicarCapaPensionMinima(pensionCalculadaResult, infoMinimoLegal) {
    if (!pensionCalculadaResult) return null;
    const calculada = typeof pensionCalculadaResult.pensionFinalMensual === 'number'
        ? pensionCalculadaResult.pensionFinalMensual
        : 0;

    let minima = 0;
    if (infoMinimoLegal) {
        if (typeof infoMinimoLegal.pensionMinima === 'number') {
            minima = infoMinimoLegal.pensionMinima;
        } else if (typeof infoMinimoLegal.valor === 'number') {
            minima = infoMinimoLegal.valor;
        }
    }

    const pensionQueAplicara = Math.max(calculada, minima);
    const aplicaMinimoLegal = minima > calculada;

    let explicacionMinimo = '';
    if (aplicaMinimoLegal) {
        explicacionMinimo = 'Se aplica la pensión mínima legal porque es superior a la pensión calculada.';
    } else if (calculada > minima) {
        explicacionMinimo = 'La pensión calculada es superior a la pensión mínima legal, por lo que se toma como referencia la pensión calculada.';
    } else {
        explicacionMinimo = 'La pensión calculada coincide con la pensión mínima legal aplicable.';
    }

    return {
        ...pensionCalculadaResult,
        pensionCalculada: calculada,
        pensionMinimaAplicable: minima,
        pensionQueAplicara,
        aplicaMinimoLegal,
        explicacionMinimo,
        minimoLegal: infoMinimoLegal || null
    };
}


function iterateDays(startDateIso, endDateIso) {
    const [y1, m1, d1] = startDateIso.split('-').map(Number);
    const [y2, m2, d2] = endDateIso.split('-').map(Number);
    let currentUtc = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
    const endUtc = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
    const days = [];
    while (currentUtc <= endUtc) {
        const dt = new Date(currentUtc);
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dt.getUTCDate()).padStart(2, '0');
        days.push(`${y}-${m}-${d}`);
        currentUtc += 86400000;
    }
    return days;
}

function calculateAverageSalaryLast250Weeks(periodos) {
    if (!Array.isArray(periodos) || periodos.length === 0) {
        return {
            success: false,
            error: 'NO_PERIODS',
            message: 'No se encontraron registros de periodos cotizados en el documento.'
        };
    }

    const validPeriods = [];
    let syntheticBaseDate = null;

    for (let i = 0; i < periodos.length; i++) {
        const p = periodos[i];
        if (!p || typeof p !== 'object') {
            return {
                success: false,
                error: 'INVALID_PERIOD_STRUCTURE',
                message: `Estructura de periodo no válida en la posición ${i + 1}.`
            };
        }

        const patron = typeof p.patron === 'string' && p.patron.trim()
            ? p.patron.trim()
            : (typeof p.empresa === 'string' && p.empresa.trim() ? p.empresa.trim() : null);

        if (!patron) {
            return {
                success: false,
                error: 'INVALID_PATRON',
                message: `Nombre de patrón no válido en periodo ${i + 1}.`
            };
        }

        const salario = typeof p.salarioDiario === 'number'
            ? p.salarioDiario
            : (typeof p.salario_diario === 'number'
                ? p.salario_diario
                : parseFloat(String(p.salarioDiario || p.salario_diario || '').replace(/[^0-9.]/g, '')));

        if (isNaN(salario) || salario <= 0) {
            return {
                success: false,
                error: 'INVALID_SALARY',
                message: `Salario diario inválido en periodo ${i + 1}.`
            };
        }

        let fechaInicio = parseDateToIso(p.fechaInicio || p.fecha_inicio);
        let fechaFin = parseDateToIso(p.fechaFin || p.fecha_fin);

        // Soporte de compatibilidad para datos sintéticos que sólo proporcionan días numéricos
        if ((!fechaInicio || !fechaFin) && (typeof p.dias === 'number' || typeof p.semanas === 'number')) {
            const diasCount = typeof p.dias === 'number' && p.dias > 0
                ? p.dias
                : Math.round(Number(p.semanas) * 7);

            if (diasCount > 0) {
                if (!syntheticBaseDate) {
                    syntheticBaseDate = new Date(Date.UTC(2025, 0, 1, 12, 0, 0));
                }
                const dtFin = new Date(syntheticBaseDate.getTime());
                const dtInicio = new Date(syntheticBaseDate.getTime() - (diasCount - 1) * 86400000);
                
                fechaFin = dtFin.toISOString().slice(0, 10);
                fechaInicio = dtInicio.toISOString().slice(0, 10);
                // Mover base hacia atrás para el siguiente periodo sintético (1 día antes)
                syntheticBaseDate = new Date(dtInicio.getTime() - 86400000);
            }
        }

        if (!fechaInicio || !fechaFin) {
            return {
                success: false,
                error: 'INVALID_DATES',
                message: `Fechas no válidas en periodo ${i + 1}.`
            };
        }

        if (fechaFin < fechaInicio) {
            return {
                success: false,
                error: 'INVALID_DATE_RANGE',
                message: `Rango de fechas invertido en periodo ${i + 1} (${fechaInicio} a ${fechaFin}).`
            };
        }

        validPeriods.push({
            patron,
            fechaInicio,
            fechaFin,
            salarioDiario: salario
        });
    }

    if (validPeriods.length === 0) {
        return {
            success: false,
            error: 'NO_VALID_PERIODS',
            message: 'No se pudieron extraer registros con periodos válidos.'
        };
    }

    // Construcción del mapa por DÍA CALENDARIO con regla MAX_PROVISIONAL en traslapes
    const dayMap = {};
    for (const p of validPeriods) {
        const days = iterateDays(p.fechaInicio, p.fechaFin);
        for (const dia of days) {
            if (!dayMap[dia]) {
                dayMap[dia] = {
                    sbc: p.salarioDiario,
                    registros: [p],
                    traslapado: false
                };
            } else {
                dayMap[dia].sbc = Math.max(dayMap[dia].sbc, p.salarioDiario);
                dayMap[dia].registros.push(p);
                dayMap[dia].traslapado = true;
            }
        }
    }

    // Verificar que existan al menos 1,750 días únicos de cotización
    const uniqueDates = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
    const totalDiasUnicos = uniqueDates.length;

    if (totalDiasUnicos < 1750) {
        return {
            success: false,
            error: 'DAYS_SUM_MISMATCH',
            sumaDias: totalDiasUnicos,
            totalDias: totalDiasUnicos,
            totalSemanas: Math.round((totalDiasUnicos / 7) * 100) / 100,
            diasFaltantes: 1750 - totalDiasUnicos,
            semanasFaltantes: Math.round(((1750 - totalDiasUnicos) / 7) * 100) / 100,
            message: `La suma de días analizados (${totalDiasUnicos}) no coincide con los 1,750 días requeridos para 250 semanas.`
        };
    }

    // Seleccionar exactamente los primeros 1,750 días (ordenados de más reciente a más antiguo)
    const selectedDates = uniqueDates.slice(0, 1750);

    // Calcular determinísticamente suma ponderada y promedio en backend
    let weightedSalarySum = 0;
    for (const dia of selectedDates) {
        weightedSalarySum += dayMap[dia].sbc;
    }

    const promedioDiario = weightedSalarySum / 1750;
    const salarioDiarioPromedio = Math.round(promedioDiario * 100) / 100;

    // Reconstrucción estructurada de los segmentos utilizados
    const segments = [];
    let currentSegment = null;

    for (let i = 0; i < selectedDates.length; i++) {
        const dateStr = selectedDates[i];
        const info = dayMap[dateStr];
        const patronsKey = info.registros.map(r => r.patron).sort().join(' | ');

        let isContiguous = false;
        if (currentSegment) {
            const [y1, m1, d1] = currentSegment.lastDate.split('-').map(Number);
            const prevUtc = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
            const [y2, m2, d2] = dateStr.split('-').map(Number);
            const curUtc = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
            if (prevUtc - curUtc === 86400000 &&
                currentSegment.salarioDiario === info.sbc &&
                currentSegment.patronsKey === patronsKey) {
                isContiguous = true;
            }
        }

        if (isContiguous) {
            currentSegment.dias++;
            currentSegment.fechaInicio = dateStr; // Se extiende hacia atrás
            currentSegment.lastDate = dateStr;
        } else {
            if (currentSegment) {
                delete currentSegment.lastDate;
                delete currentSegment.patronsKey;
                segments.push(currentSegment);
            }

            const patronName = info.registros.length === 1
                ? info.registros[0].patron
                : info.registros.map(r => r.patron).join(' / ');

            currentSegment = {
                patron: patronName,
                fechaInicio: dateStr,
                fechaFin: dateStr,
                fecha_inicio: dateStr,
                fecha_fin: dateStr,
                lastDate: dateStr,
                patronsKey,
                dias: 1,
                diasUtilizados: 1,
                salarioDiario: info.sbc,
                salario_diario: info.sbc,
                traslapado: info.traslapado,
                traslape: info.traslapado,
                reglaTraslape: info.traslapado ? 'MAX_PROVISIONAL' : null,
                registrosParticipantes: info.registros.map(r => ({
                    patron: r.patron,
                    salarioDiario: r.salarioDiario,
                    fechaInicio: r.fechaInicio,
                    fechaFin: r.fechaFin
                })),
                parcial: false
            };
        }
    }

    if (currentSegment) {
        delete currentSegment.lastDate;
        delete currentSegment.patronsKey;
        segments.push(currentSegment);
    }

    // Completar campos derivados y verificar corte parcial en el segmento más antiguo
    for (const s of segments) {
        s.diasUtilizados = s.dias;
        s.semanas = Math.round((s.dias / 7) * 100) / 100;
        s.semanasUtilizadas = s.semanas;
        s.subtotal = Math.round(s.dias * s.salarioDiario * 100) / 100;
    }

    const oldestSegment = segments[segments.length - 1];
    let wasCut = false;
    for (const reg of oldestSegment.registrosParticipantes) {
        if (reg.fechaInicio < oldestSegment.fechaInicio) {
            wasCut = true;
            break;
        }
    }
    oldestSegment.parcial = wasCut;

    return {
        success: true,
        salarioDiarioPromedio,
        diasTotales: 1750,
        semanasTotales: 250,
        semanasAnalizadas: 250,
        semanasConsideradas: 250,
        totalDiasDocumento: totalDiasUnicos,
        totalSemanasDocumento: Math.round((totalDiasUnicos / 7) * 100) / 100,
        sumaPonderada: weightedSalarySum,
        reglaTraslape: 'MAX_PROVISIONAL',
        periodos: segments,
        periodosUtilizados: segments
    };
}

function parseDateToIso(str) {
    if (!str) return null;
    str = str.trim();
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
        return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (ymd) {
        return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }
    return null;
}

/**
 * Determina el último periodo registrado cronológicamente a partir de un conjunto de periodos.
 * REGLA ESTRICTA: El orden se determina únicamente por la fecha más reciente (fechaHasta DESC, luego fechaDesde DESC).
 * NUNCA se utiliza el 'id' de la tabla ni de los objetos.
 * Fechas comparadas como strings de calendario ISO YYYY-MM-DD sin conversiones con desfase de timezone.
 */
function determinarUltimoPeriodoCronologico(periodos) {
    if (!Array.isArray(periodos) || periodos.length === 0) {
        return null;
    }

    const periodosValidos = [];
    for (const p of periodos) {
        if (!p) continue;
        const fDesde = parseDateToIso(p.fechaDesde || p.fecha_desde || p.fechaInicio || p.fecha_inicio);
        const fHasta = parseDateToIso(p.fechaHasta || p.fecha_hasta || p.fechaFin || p.fecha_fin);
        const sal = parseFloat(p.salario || p.salarioDiario || p.salario_diario);
        const dias = parseInt(p.dias || p.diasUtilizados, 10) || 1;

        if (fDesde && fHasta && !isNaN(sal) && sal > 0) {
            periodosValidos.push({
                ...p,
                fechaDesde: fDesde,
                fechaHasta: fHasta,
                salario: sal,
                dias: dias
            });
        }
    }

    if (periodosValidos.length === 0) {
        return null;
    }

    // Ordenamiento estrictamente cronológico:
    // 1. fechaHasta descendente (el que termine más recientemente primero)
    // 2. fechaDesde descendente (en caso de empate en fechaHasta, el que haya iniciado más tarde)
    // Se excluye terminantemente el 'id'
    periodosValidos.sort((a, b) => {
        if (a.fechaHasta !== b.fechaHasta) {
            return b.fechaHasta.localeCompare(a.fechaHasta);
        }
        return b.fechaDesde.localeCompare(a.fechaDesde);
    });

    return periodosValidos[0];
}

/**
 * Valida el salario proyectado frente al último salario diario vigente registrado en usuario_periodos_imss.
 * Regla de negocio:
 * Si el usuario introduce un salario menor al último salario registrado cronológicamente,
 * se debe advertir que el salario promedio de las 250 semanas podría disminuir en lugar de aumentar.
 * 
 * Casos contemplados:
 * 1. Salario proyectado menor -> requiere advertencia (permite Cancelar / Continuar)
 * 2. Salario proyectado igual -> sin advertencia
 * 3. Salario proyectado mayor -> sin advertencia
 * 4. Usuario sin periodos registrados -> seguro, no ejecuta comparación
 * 5. Valor no numérico, vacío, cero o negativo -> error de validación estándar de campo
 */
function validarSalarioProyectadoVsUltimoPeriodo(params) {
    const { salarioProyectado, ultimoSalarioRegistrado } = params || {};

    // 1. Validación de campo salario proyectado (Caso 5)
    if (salarioProyectado === undefined || salarioProyectado === null || String(salarioProyectado).trim() === '') {
        return {
            valido: false,
            error: 'EMPTY_PROJECTED_SALARY',
            mensaje: 'Por favor ingresa un salario diario proyectado válido mayor a cero.'
        };
    }

    const salProj = parseFloat(salarioProyectado);
    if (isNaN(salProj) || salProj <= 0) {
        return {
            valido: false,
            error: 'INVALID_PROJECTED_SALARY',
            mensaje: 'Por favor ingresa un salario diario proyectado válido mayor a cero.'
        };
    }

    // 2. Validación de historial registrado (Caso 4)
    const ultimoSal = parseFloat(ultimoSalarioRegistrado);
    if (isNaN(ultimoSal) || ultimoSal <= 0) {
        return {
            valido: true,
            requiereAdvertencia: false,
            sinHistorial: true,
            salarioProyectado: salProj,
            ultimoSalarioRegistrado: null
        };
    }

    // Redondear a 2 decimales para evitar problemas de precisión en punto flotante
    const salProjRound = Math.round(salProj * 100) / 100;
    const ultimoSalRound = Math.round(ultimoSal * 100) / 100;

    // 3. Comparación contra el último salario cronológicamente vigente
    if (salProjRound < ultimoSalRound) {
        // Caso 1: Proyectado menor
        const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
        const salProjFmt = formatter.format(salProjRound);
        const ultimoSalFmt = formatter.format(ultimoSalRound);

        return {
            valido: true,
            requiereAdvertencia: true,
            sinHistorial: false,
            salarioProyectado: salProjRound,
            ultimoSalarioRegistrado: ultimoSalRound,
            diferencia: Math.round((ultimoSalRound - salProjRound) * 100) / 100,
            salarioProyectadoFormateado: salProjFmt,
            ultimoSalarioFormateado: ultimoSalFmt,
            mensajeAdvertencia: `⚠️ Advertencia: El salario diario proyectado (${salProjFmt}) es menor que tu último salario diario registrado (${ultimoSalFmt}). Esto puede disminuir tu salario promedio de las últimas 250 semanas y, por lo tanto, reducir la pensión proyectada.\n\n¿Deseas continuar con este salario?`
        };
    }

    // Caso 2 (igual) o Caso 3 (mayor)
    return {
        valido: true,
        requiereAdvertencia: false,
        sinHistorial: false,
        salarioProyectado: salProjRound,
        ultimoSalarioRegistrado: ultimoSalRound,
        diferencia: Math.round((salProjRound - ultimoSalRound) * 100) / 100
    };
}

function addDaysToIso(isoStr, numDays) {
    const [y, m, d] = isoStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + numDays, 12, 0, 0));
    return dt.toISOString().slice(0, 10);
}

function calculateInclusiveDays(isoDesde, isoHasta) {
    const [y1, m1, d1] = isoDesde.split('-').map(Number);
    const [y2, m2, d2] = isoHasta.split('-').map(Number);
    const utc1 = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
    const utc2 = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
    return Math.round((utc2 - utc1) / 86400000) + 1;
}

/**
 * Extrae la fecha de nacimiento (YYYY-MM-DD) a partir del CURP oficial de 18 caracteres.
 * Aplica regla de siglo RENAPO y contexto de asegurados Ley 73.
 */
function extractBirthDateFromCurp(curp) {
    if (!curp || typeof curp !== 'string') return null;
    const match = curp.trim().toUpperCase().match(/^[A-Z]{4}(\d{2})(\d{2})(\d{2})[HM][A-Z]{5}[A-Z0-9]\d$/);
    if (!match) return null;
    const yy = parseInt(match[1], 10);
    const mm = match[2];
    const dd = match[3];
    // Regla de siglo oficial RENAPO para CURP: Si el año de nacimiento de dos dígitos es > 30 (o según el dígito verificador), pertenece a 1900s, si es <= 30 a 2000s
    // Para asegurados del régimen Ley 73 (cotizaciones previas a julio 1997), nacieron en el siglo XX (1900s)
    const fullYear = yy >= 20 ? 1900 + yy : 2000 + yy;
    return `${fullYear}-${mm}-${dd}`;
}

/**
 * Calcula el umbral legal de cumpleaños + 6 meses + 1 día para avanzar de escalón de edad en Ley 73.
 */
function calcularUmbralMas6Meses1Dia(fechaCumple) {
    const [y, m, d] = fechaCumple.split('-').map(Number);
    let targetYear = y;
    let targetMonth = m + 6;
    if (targetMonth > 12) {
        targetYear += Math.floor((targetMonth - 1) / 12);
        targetMonth = ((targetMonth - 1) % 12) + 1;
    }
    const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    const clampedDay = Math.min(d, daysInTargetMonth);
    const dt = new Date(Date.UTC(targetYear, targetMonth - 1, clampedDay, 12, 0, 0));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
}

/**
 * Calcula la edad cronológica exacta a una fecha determinada basada en la fecha de nacimiento.
 * Regla fundamental: edad = año_final - año_nacimiento, restando 1 si en la fecha final aún no se cumple el cumpleaños de ese año.
 * NO utiliza división simple entre 365 días.
 *
 * @param {string} fechaNacimientoStr - Fecha de nacimiento en formato YYYY-MM-DD o DD/MM/YYYY
 * @param {string} fechaFinalStr - Fecha de corte o final de proyección en formato YYYY-MM-DD o DD/MM/YYYY
 * @returns {number|null} Edad en años cumplidos o null si las fechas no son válidas
 */
function calcularEdadExacta(fechaNacimientoStr, fechaFinalStr) {
    const fNac = parseDateToIso(fechaNacimientoStr);
    const fFin = parseDateToIso(fechaFinalStr);
    if (!fNac || !fFin) return null;

    const [yNac, mNac, dNac] = fNac.split('-').map(Number);
    const [yFin, mFin, dFin] = fFin.split('-').map(Number);

    let edad = yFin - yNac;
    if (mFin < mNac || (mFin === mNac && dFin < dNac)) {
        edad--;
    }
    return edad;
}

/**
 * Calcula la edad cronológica detallada (años, meses y días exactos) entre la fecha de nacimiento
 * y la fecha final, preservando la exactitud de días y meses naturales.
 *
 * @param {string} fechaNacimientoStr - Fecha de nacimiento en formato YYYY-MM-DD o DD/MM/YYYY
 * @param {string} fechaFinalStr - Fecha de corte o final de proyección en formato YYYY-MM-DD o DD/MM/YYYY
 * @returns {object|null} { anios, meses, dias, texto }
 */
function calcularEdadCronologicaDetallada(fechaNacimientoStr, fechaFinalStr) {
    const fNac = parseDateToIso(fechaNacimientoStr);
    const fFin = parseDateToIso(fechaFinalStr);
    if (!fNac || !fFin) return null;

    const [yNac, mNac, dNac] = fNac.split('-').map(Number);
    const [yFin, mFin, dFin] = fFin.split('-').map(Number);

    let anios = yFin - yNac;
    let meses = mFin - mNac;
    let dias = dFin - dNac;

    if (dias < 0) {
        meses--;
        // Días en el mes previo a la fecha final
        const diasMesPrevio = new Date(Date.UTC(yFin, mFin - 1, 0)).getUTCDate();
        dias += diasMesPrevio;
    }

    if (meses < 0) {
        anios--;
        meses += 12;
    }

    let texto = `${anios} años`;
    if (meses > 0) {
        texto += `, ${meses} mes${meses > 1 ? 'es' : ''}`;
    }

    return {
        anios,
        meses,
        dias,
        texto
    };
}

/**
 * Evalúa determinísticamente la edad pensionaria resultante y el porcentaje aplicable según la Ley 73.
 * Aplica la regla general de Cumpleaños + 6 meses + 1 día para todas las edades de 60 a 65:
 * 60 -> 61 (75% -> 80%), 61 -> 62 (80% -> 85%), 62 -> 63 (85% -> 90%),
 * 63 -> 64 (90% -> 95%), 64 -> 65 (95% -> 100%).
 */
function calcularEdadPensionaria(fechaNacimientoStr, fechaBajaStr) {
    const fNac = parseDateToIso(fechaNacimientoStr);
    const fBaja = parseDateToIso(fechaBajaStr);
    if (!fNac || !fBaja) return null;

    const [yNac, mNac, dNac] = fNac.split('-').map(Number);
    let edadCalendario = calcularEdadExacta(fNac, fBaja);
    const detalleCronologico = calcularEdadCronologicaDetallada(fNac, fBaja);

    if (edadCalendario < 60) {
        return {
            fechaNacimiento: fNac,
            fechaBaja: fBaja,
            edadCalendario,
            edadPensionaria: edadCalendario,
            porcentajeLey73: 0,
            aplicaFraccion6Meses1Dia: false,
            umbralSiguienteEdad: null,
            edadCronologicaDetallada: detalleCronologico,
            edadCronologicaTexto: detalleCronologico ? detalleCronologico.texto : `${edadCalendario} años`
        };
    }

    if (edadCalendario >= 65) {
        return {
            fechaNacimiento: fNac,
            fechaBaja: fBaja,
            edadCalendario,
            edadPensionaria: 65,
            porcentajeLey73: 1.00,
            aplicaFraccion6Meses1Dia: false,
            umbralSiguienteEdad: null,
            edadCronologicaDetallada: detalleCronologico,
            edadCronologicaTexto: detalleCronologico ? detalleCronologico.texto : `${edadCalendario} años`
        };
    }

    const anioCumple = yNac + edadCalendario;
    const fechaCumple = `${anioCumple}-${String(mNac).padStart(2, '0')}-${String(dNac).padStart(2, '0')}`;
    const umbral = calcularUmbralMas6Meses1Dia(fechaCumple);

    let edadPensionaria = edadCalendario;
    let aplicaFraccion = false;
    if (fBaja >= umbral) {
        edadPensionaria = Math.min(edadCalendario + 1, 65);
        aplicaFraccion = true;
    }

    return {
        fechaNacimiento: fNac,
        fechaBaja: fBaja,
        fechaCumple,
        umbralSiguienteEdad: umbral,
        edadCalendario,
        edadPensionaria,
        porcentajeLey73: TABLA_EDAD[edadPensionaria] || 0.75,
        aplicaFraccion6Meses1Dia: aplicaFraccion,
        edadCronologicaDetallada: detalleCronologico,
        edadCronologicaTexto: detalleCronologico ? detalleCronologico.texto : `${edadCalendario} años`
    };
}

/**
 * Máquina de Estados determinística para la reconstrucción de vigencias salariales:
 * 1. Procesa cada sección patronal de forma independiente en orden cronológico.
 * 2. Inicio de vigencia en fecha del movimiento.
 * 3. Movimientos consecutivos del mismo patrón con mismo salario se consolidan sin corte artificial.
 * 4. Cambio efectivo de salario corta el periodo anterior en (F_siguiente - 1 día natural).
 * 5. Baja concluye exactamente en la fecha de baja (inclusive).
 * 6. Cómputo exacto de días naturales: (F_hasta - F_desde) + 1.
 */
function reconstructDeterministicPeriods(rawPeriods) {
    if (!Array.isArray(rawPeriods) || rawPeriods.length === 0) return [];

    const normalized = [];
    for (const p of rawPeriods) {
        const patron = String(p.patron || p.empresa || 'PATRÓN REGISTRADO').trim();
        const fDesde = parseDateToIso(p.fechaInicio || p.fecha_inicio || p.fechaDesde || p.fecha_desde || p.fecha);
        const fHasta = parseDateToIso(p.fechaFin || p.fecha_fin || p.fechaHasta || p.fecha_hasta || p.fecha);
        const rawSalStr = String(p.salarioDiario !== undefined ? p.salarioDiario : (p.salario_diario !== undefined ? p.salario_diario : (p.salario !== undefined ? p.salario : (p.sbc !== undefined ? p.sbc : '')))).replace(/,/g, '').trim();
        const sal = parseFloat(rawSalStr);
        const tipo = String(p.tipo || p.tipoMovimiento || '').toUpperCase();

        if (fDesde && !isNaN(sal) && sal > 0) {
            normalized.push({
                patron,
                fechaDesde: fDesde,
                fechaHasta: fHasta || fDesde,
                salario: Math.round(sal * 100) / 100,
                tipo
            });
        }
    }

    if (normalized.length === 0) return [];

    const patronMap = new Map();
    for (const item of normalized) {
        const key = item.patron.toUpperCase();
        if (!patronMap.has(key)) {
            patronMap.set(key, { patron: item.patron, items: [] });
        }
        patronMap.get(key).items.push(item);
    }

    const reconstructed = [];

    for (const [_, group] of patronMap.entries()) {
        const items = [...group.items].sort((a, b) => {
            if (a.fechaDesde !== b.fechaDesde) return a.fechaDesde.localeCompare(b.fechaDesde);
            if (a.tipo.includes('BAJA') && !b.tipo.includes('BAJA')) return 1;
            if (!a.tipo.includes('BAJA') && b.tipo.includes('BAJA')) return -1;
            return a.fechaHasta.localeCompare(b.fechaHasta);
        });

        let curPeriod = null;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const isBaja = item.tipo.includes('BAJA');

            if (!curPeriod) {
                if (isBaja) {
                    reconstructed.push({
                        patron: group.patron,
                        fechaInicio: item.fechaDesde,
                        fechaFin: item.fechaDesde,
                        fechaDesde: item.fechaDesde,
                        fechaHasta: item.fechaDesde,
                        salarioDiario: item.salario,
                        salario: item.salario,
                        dias: 1
                    });
                } else {
                    curPeriod = {
                        patron: group.patron,
                        fechaDesde: item.fechaDesde,
                        fechaHasta: item.fechaHasta,
                        salario: item.salario
                    };
                }
            } else {
                if (isBaja) {
                    curPeriod.fechaHasta = item.fechaDesde;
                    curPeriod.salario = item.salario || curPeriod.salario;
                    const dias = calculateInclusiveDays(curPeriod.fechaDesde, curPeriod.fechaHasta);
                    reconstructed.push({
                        patron: curPeriod.patron,
                        fechaInicio: curPeriod.fechaDesde,
                        fechaFin: curPeriod.fechaHasta,
                        fechaDesde: curPeriod.fechaDesde,
                        fechaHasta: curPeriod.fechaHasta,
                        salarioDiario: curPeriod.salario,
                        salario: curPeriod.salario,
                        dias
                    });
                    curPeriod = null;
                } else if (item.salario === curPeriod.salario) {
                    if (item.fechaHasta > curPeriod.fechaHasta) {
                        curPeriod.fechaHasta = item.fechaHasta;
                    }
                } else {
                    const prevDay = addDaysToIso(item.fechaDesde, -1);
                    curPeriod.fechaHasta = prevDay;
                    const dias = calculateInclusiveDays(curPeriod.fechaDesde, curPeriod.fechaHasta);
                    if (dias > 0) {
                        reconstructed.push({
                            patron: curPeriod.patron,
                            fechaInicio: curPeriod.fechaDesde,
                            fechaFin: curPeriod.fechaHasta,
                            fechaDesde: curPeriod.fechaDesde,
                            fechaHasta: curPeriod.fechaHasta,
                            salarioDiario: curPeriod.salario,
                            salario: curPeriod.salario,
                            dias
                        });
                    }
                    curPeriod = {
                        patron: group.patron,
                        fechaDesde: item.fechaDesde,
                        fechaHasta: item.fechaHasta,
                        salario: item.salario
                    };
                }
            }
        }

        if (curPeriod) {
            const dias = calculateInclusiveDays(curPeriod.fechaDesde, curPeriod.fechaHasta);
            if (dias > 0) {
                reconstructed.push({
                    patron: curPeriod.patron,
                    fechaInicio: curPeriod.fechaDesde,
                    fechaFin: curPeriod.fechaHasta,
                    fechaDesde: curPeriod.fechaDesde,
                    fechaHasta: curPeriod.fechaHasta,
                    salarioDiario: curPeriod.salario,
                    salario: curPeriod.salario,
                    dias
                });
            }
        }
    }

    reconstructed.sort((a, b) => b.fechaHasta.localeCompare(a.fechaHasta) || b.fechaDesde.localeCompare(a.fechaDesde));

    return reconstructed;
}

/**
 * Extrae movimientos atómicos del texto plano estructurado de un PDF digital del IMSS.
 */
function extractMovementsFromIMSSDocumentText(text) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rawMovements = [];
    let currentPatron = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/nombre\s+del\s+patr[oó]n/i.test(line)) {
            if (i + 1 < lines.length) {
                currentPatron = lines[i + 1];
            }
        }

        const dateMatch = line.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
        if (dateMatch) {
            const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
            let tipo = null;
            let sal = null;
            for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
                const nextL = lines[j];
                if (!tipo && (nextL.includes('BAJA') || nextL.includes('REINGRESO') || nextL.includes('MODIFICACION') || nextL.includes('ALTA'))) {
                    tipo = nextL;
                }
                if (sal === null && nextL.includes('$')) {
                    const sm = nextL.match(/[$]?\s*([0-9]+(?:\.[0-9]+)?)/);
                    if (sm) {
                        sal = parseFloat(sm[1]);
                    }
                }
                if (tipo && sal !== null) break;
            }
            if (tipo && sal !== null) {
                rawMovements.push({
                    patron: currentPatron || 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO',
                    fecha: isoDate,
                    fechaInicio: isoDate,
                    fechaFin: isoDate,
                    fechaDesde: isoDate,
                    fechaHasta: isoDate,
                    tipo,
                    salarioDiario: sal,
                    salario: sal
                });
            }
        }
    }
    return rawMovements;
}

function extractPeriodsFromIMSSDocumentText(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. Intento primario: extracción de movimientos atómicos del formato oficial del IMSS
    const movements = extractMovementsFromIMSSDocumentText(text);
    if (movements && movements.length > 0) {
        const reconstructed = reconstructDeterministicPeriods(movements);
        if (reconstructed && reconstructed.length > 0) {
            return reconstructed;
        }
    }

    // 2. Fallback: extracción de líneas con pares de fechas
    const periods = [];
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
        const dateMatches = line.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g);
        if (!dateMatches || dateMatches.length < 2) continue;

        const fechaInicio = parseDateToIso(dateMatches[0]);
        const fechaFin = parseDateToIso(dateMatches[1]);

        // Find salary
        let salario = 0;
        const labeledSalaryMatch = line.match(/(?:salario|sbc|s\.b\.c|cuota|base)[^\d\$\n\r]*[$]?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
        if (labeledSalaryMatch) {
            salario = parseFloat(labeledSalaryMatch[1].replace(/,/g, ''));
        } else {
            const dollarMatch = line.match(/[$]\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
            if (dollarMatch) {
                salario = parseFloat(dollarMatch[1].replace(/,/g, ''));
            } else {
                const decimalMatches = line.match(/\b([0-9]{2,6}\.[0-9]{2})\b/g);
                if (decimalMatches) {
                    for (const dm of decimalMatches) {
                        const val = parseFloat(dm);
                        if (val > 0 && val <= 50000) {
                            salario = val;
                            break;
                        }
                    }
                }
            }
        }

        // Find semanas
        let semanas = 0;
        const labeledWeeksMatch = line.match(/(?:semanas?(?:\s*cotizadas?)?)[^\d\n\r]*([0-9]{1,4})/i);
        if (labeledWeeksMatch) {
            semanas = parseInt(labeledWeeksMatch[1], 10);
        } else {
            const numbers = line.match(/\b([0-9]{1,4})\b/g);
            if (numbers) {
                for (const num of numbers) {
                    const val = parseInt(num, 10);
                    if (val > 0 && val <= 3000 &&
                        !dateMatches[0].includes(num) &&
                        !dateMatches[1].includes(num) &&
                        (!salario || !salario.toString().includes(num))) {
                        semanas = val;
                    }
                }
            }
        }

        if ((!semanas || semanas <= 0) && fechaInicio && fechaFin) {
            const d1 = new Date(fechaInicio);
            const d2 = new Date(fechaFin);
            if (!isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d2 >= d1) {
                semanas = Math.round(((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24) + 1) / 7);
            }
        }

        if (salario > 0 && semanas > 0) {
            let patron = line
                .replace(dateMatches[0], '')
                .replace(dateMatches[1], '')
                .replace(/[|\-_]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            periods.push({
                patron: patron || 'Patrón IMSS',
                fechaInicio,
                fechaFin,
                salarioDiario: salario,
                semanas
            });
        }
    }

    return periods.length > 0 ? periods : null;
}

function validateAndCalculatePensionPeriods(aiData) {
    if (!aiData || typeof aiData !== 'object') {
        return { success: false, error: 'INVALID_AI_RESPONSE', message: 'La respuesta no contiene una estructura de datos válida.' };
    }

    const rawPeriodos = aiData.periodos;
    if (!Array.isArray(rawPeriodos) || rawPeriodos.length === 0) {
        return { success: false, error: 'NO_PERIODS', message: 'No se identificaron periodos de cotización en el documento.' };
    }

    // Unificación de la fuente de verdad: Reconstrucción determinística de vigencias (Máquina de Estados)
    const periodosReconstruidos = reconstructDeterministicPeriods(rawPeriodos);
    const periodosParaCalculo = (periodosReconstruidos && periodosReconstruidos.length > 0)
        ? periodosReconstruidos
        : rawPeriodos;

    const result = calculateAverageSalaryLast250Weeks(periodosParaCalculo);
    if (result && result.success) {
        result.periodosReconstruidos = periodosReconstruidos;
    }
    return result;
}

/**
 * Calcula la proyección actuarial de pensión Ley 73 con ventana deslizante de 250 semanas (1,750 días).
 * Si se proporciona periodosHistoricos (del usuario autenticado en BD), realiza un cálculo
 * cronológico exacto sobre la línea de tiempo real con validación estricta de traslapes.
 * Si no se proporciona, opera en modo de respaldo/estimado a partir del salario promedio actual.
 */
function calculatePensionProjection(params) {
    const {
        semanasActuales,
        salarioPromedioActual,
        salarioMinimoActual = null,
        salarioMinimoProyectado = null,
        salarioDiarioProyectado,
        fechaDesde,
        fechaHasta,
        edadRetiroActual = 60,
        edadRetiroProyectada = null,
        fechaNacimiento = null,
        curp = null,
        tieneEsposa = false,
        numeroHijos = 0,
        tienePadresDependientes = false,
        estaEnSoledad = false,
        tieneIncapacidad = false,
        periodosHistoricos = null
    } = params || {};

    // 1. Validaciones generales
    const semAct = parseInt(semanasActuales, 10);
    if (isNaN(semAct) || semAct < 0) {
        return { success: false, error: 'INVALID_WEEKS', message: 'Las semanas cotizadas actuales deben ser un número mayor o igual a cero.' };
    }

    const salAct = parseFloat(salarioPromedioActual);
    if (isNaN(salAct) || salAct <= 0) {
        return { success: false, error: 'INVALID_CURRENT_SALARY', message: 'El salario promedio actual debe ser mayor a cero.' };
    }

    // Salario mínimo: fuente de verdad en BD; si un caller síncrono offline no lo pasa, acude a contingencia técnica
    const salMinAct = parseFloat(salarioMinimoActual) || CONTINGENCIA_TECNICA_SMG;
    const salMinProj = parseFloat(salarioMinimoProyectado) || salMinAct;
    if (isNaN(salMinProj) || salMinProj <= 0) {
        return { success: false, error: 'INVALID_MIN_SALARY', message: 'El salario mínimo estimado debe ser un número mayor a cero.' };
    }

    const salProj = parseFloat(salarioDiarioProyectado);
    if (isNaN(salProj) || salProj <= 0) {
        return { success: false, error: 'INVALID_PROJECTED_SALARY', message: 'El salario de cotización proyectado debe ser un número mayor a cero.' };
    }

    const isoDesde = parseDateToIso(fechaDesde);
    const isoHasta = parseDateToIso(fechaHasta);
    if (!isoDesde || !isoHasta) {
        return { success: false, error: 'INVALID_DATES', message: 'Por favor ingresa fechas válidas para el periodo de cotización (Desde y Hasta).' };
    }

    if (isoHasta < isoDesde) {
        return { success: false, error: 'INVALID_DATE_RANGE', message: 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".' };
    }

    // 2. Días y semanas del periodo proyectado
    const diasArray = iterateDays(isoDesde, isoHasta);
    const diasProyectados = diasArray.length;
    if (diasProyectados <= 0) {
        return { success: false, error: 'ZERO_DAYS', message: 'El periodo de cotización proyectado debe contener al menos 1 día.' };
    }

    const semanasProyectadas = Math.round((diasProyectados / 7) * 100) / 100;
    const totalSemanasCotizadas = Math.round((semAct + semanasProyectadas) * 100) / 100;

    let nuevoSalarioPromedio = 0;
    let supuestoUtilizado = '';
    let modoCalculo = 'ESTIMADO_SIN_HISTORIAL';
    let esCalculoEstimado = true;
    let diasHistoricosEnVentana = 0;
    let diasProyectadosEnVentana = 0;

    // 3. Validación y Cálculo con Historial Estructurado si está disponible
    const tieneHistorialValido = Array.isArray(periodosHistoricos) && periodosHistoricos.length > 0;

    if (tieneHistorialValido) {
        // A) Validar coherencia temporal y traslapes con periodos históricos
        let maxHistHasta = null;
        for (let i = 0; i < periodosHistoricos.length; i++) {
            const h = periodosHistoricos[i];
            const hDesde = parseDateToIso(h.fechaDesde || h.fecha_desde);
            const hHasta = parseDateToIso(h.fechaHasta || h.fecha_hasta);

            if (hHasta && (!maxHistHasta || hHasta > maxHistHasta)) {
                maxHistHasta = hHasta;
            }

            // Detección estricta de traslapes: [isoDesde, isoHasta] intersecta [hDesde, hHasta]
            if (hDesde && hHasta) {
                if (isoDesde <= hHasta && isoHasta >= hDesde) {
                    return {
                        success: false,
                        error: 'OVERLAPPING_PERIOD',
                        message: `El periodo proyectado (${isoDesde} a ${isoHasta}) se traslapa con un periodo histórico ya registrado en el expediente del IMSS (${hDesde} a ${hHasta}). La proyección debe iniciar posterior a tus cotizaciones registradas.`
                    };
                }
            }
        }

        // Validación de coherencia cronológica: no proyectar en el pasado del expediente
        if (maxHistHasta && isoHasta < maxHistHasta) {
            return {
                success: false,
                error: 'INVALID_CHRONOLOGY',
                message: `La fecha final proyectada (${isoHasta}) no puede ser anterior al último registro del expediente del IMSS (${maxHistHasta}).`
            };
        }

        // B) Construir mapa diario cronológico unificado
        const dayMap = {};
        for (const h of periodosHistoricos) {
            const hDesde = parseDateToIso(h.fechaDesde || h.fecha_desde);
            const hHasta = parseDateToIso(h.fechaHasta || h.fecha_hasta);
            const hSal = parseFloat(h.salario || h.salarioDiario || h.salario_diario);
            if (hDesde && hHasta && !isNaN(hSal) && hSal > 0) {
                const days = iterateDays(hDesde, hHasta);
                for (const d of days) {
                    dayMap[d] = hSal;
                }
            }
        }

        // Integrar días proyectados
        for (const d of diasArray) {
            dayMap[d] = salProj;
        }

        // C) Ventana deslizante de las últimas 250 semanas (1,750 días) hacia atrás
        const allDaysSortedDesc = Object.keys(dayMap).sort((a, b) => b.localeCompare(a));
        const windowDays = allDaysSortedDesc.slice(0, 1750);

        if (windowDays.length === 0) {
            return {
                success: false,
                error: 'EMPTY_TIMELINE',
                message: 'No fue posible construir la línea de tiempo de cotizaciones.'
            };
        }

        const weightedSum = windowDays.reduce((acc, d) => acc + dayMap[d], 0);
        nuevoSalarioPromedio = Math.round((weightedSum / windowDays.length) * 100) / 100;

        diasProyectadosEnVentana = windowDays.filter(d => d >= isoDesde && d <= isoHasta).length;
        diasHistoricosEnVentana = windowDays.length - diasProyectadosEnVentana;
        const semProjVentana = Math.round((diasProyectadosEnVentana / 7) * 100) / 100;
        const semHistVentana = Math.round((diasHistoricosEnVentana / 7) * 100) / 100;

        modoCalculo = 'CRONOLOGICO_EXACTO_HISTORIAL';
        esCalculoEstimado = false;
        supuestoUtilizado = `Cálculo cronológico exacto con base en historial del IMSS: Las últimas 250 semanas (${windowDays.length} días) integran ${semProjVentana} semanas proyectadas a $${salProj.toFixed(2)} y ${semHistVentana} semanas históricas de cotización, desplazando a las cotizaciones anteriores.`;

    } else {
        // Fallback: Ventana deslizante agregada sin historial registrado
        modoCalculo = 'ESTIMADO_SIN_HISTORIAL';
        esCalculoEstimado = true;

        if (diasProyectados >= 1750) {
            nuevoSalarioPromedio = salProj;
            diasProyectadosEnVentana = 1750;
            diasHistoricosEnVentana = 0;
            supuestoUtilizado = `Cálculo estimado: El periodo proyectado cubre ${diasProyectados} días (más de 250 semanas), sustituyendo el 100% de la ventana de cotización por el nuevo salario proyectado.`;
        } else {
            const diasConservados = 1750 - diasProyectados;
            const sumaPonderada = (diasProyectados * salProj) + (diasConservados * salAct);
            nuevoSalarioPromedio = Math.round((sumaPonderada / 1750) * 100) / 100;
            diasProyectadosEnVentana = diasProyectados;
            diasHistoricosEnVentana = diasConservados;
            const semanasConservadas = Math.round((diasConservados / 7) * 100) / 100;
            supuestoUtilizado = `Cálculo estimado: Se integran ${semanasProyectadas} semanas (${diasProyectados} días) al salario proyectado de $${salProj.toFixed(2)}, desplazando a los días más antiguos y conservando ${semanasConservadas} semanas (${diasConservados} días) al salario promedio actual de $${salAct.toFixed(2)} para completar 250 semanas (1,750 días).`;
        }
    }

    // 4. Cálculo de Pensión Actual
    const dataActual = {
        salarioMinimo: salMinAct,
        salarioDiarioPromedio: salAct,
        semanasCotizadas: semAct,
        edad: parseInt(edadRetiroActual, 10) || 60,
        tieneEsposa,
        numeroHijos,
        tienePadresDependientes,
        estaEnSoledad,
        tieneIncapacidad
    };
    const pensionActual = calculateIMSSLey73Pension(dataActual);

    // 5. Cálculo de Pensión Proyectada
    let birthDate = fechaNacimiento ? parseDateToIso(fechaNacimiento) : null;
    if (!birthDate && curp) {
        birthDate = extractBirthDateFromCurp(curp);
    }

    let edadProy = edadRetiroProyectada !== null && !isNaN(parseInt(edadRetiroProyectada, 10))
        ? parseInt(edadRetiroProyectada, 10)
        : dataActual.edad;

    let edadPensionariaInfo = null;
    let edadCronologica = null;
    if (birthDate && isoHasta) {
        edadCronologica = calcularEdadExacta(birthDate, isoHasta);
        edadPensionariaInfo = calcularEdadPensionaria(birthDate, isoHasta);
        if (edadPensionariaInfo && edadPensionariaInfo.edadPensionaria) {
            edadProy = edadPensionariaInfo.edadPensionaria;
        }
    }

    const dataProyectada = {
        salarioMinimo: salMinProj,
        salarioDiarioPromedio: nuevoSalarioPromedio,
        semanasCotizadas: Math.floor(totalSemanasCotizadas), // El IMSS computa semanas enteras para incrementos
        edad: edadProy,
        tieneEsposa,
        numeroHijos,
        tienePadresDependientes,
        estaEnSoledad,
        tieneIncapacidad
    };
    const pensionProyectada = calculateIMSSLey73Pension(dataProyectada);

    // 6. Comparación y Métricas de Incremento
    const diferenciaMensual = Math.round((pensionProyectada.pensionFinalMensual - pensionActual.pensionFinalMensual) * 100) / 100;
    const porcentajeIncremento = pensionActual.pensionFinalMensual > 0
        ? Math.round(((pensionProyectada.pensionFinalMensual - pensionActual.pensionFinalMensual) / pensionActual.pensionFinalMensual) * 10000) / 100
        : 0;

    return {
        success: true,
        modoCalculo,
        esCalculoEstimado,
        periodo: {
            fechaDesde: isoDesde,
            fechaHasta: isoHasta,
            diasProyectados,
            semanasProyectadas
        },
        supuestoUtilizado,
        detallesVentana: {
            diasProyectadosEnVentana,
            diasHistoricosEnVentana,
            totalDiasVentana: diasProyectadosEnVentana + diasHistoricosEnVentana
        },
        situacionActual: {
            semanasCotizadas: semAct,
            salarioPromedio: salAct,
            salarioMinimoUtilizado: salMinAct,
            pensionMensual: pensionActual.pensionFinalMensual,
            desglose: pensionActual
        },
        situacionProyectada: {
            nuevasSemanasProyectadas: semanasProyectadas,
            totalSemanasCotizadas: Math.floor(totalSemanasCotizadas),
            totalSemanasDecimal: totalSemanasCotizadas,
            nuevoSalarioPromedio,
            salarioMinimoEstimado: salMinProj,
            salarioDiarioProyectado: salProj,
            edadProyectada: edadProy,
            edadPensionaria: edadProy,
            edadCronologica: edadCronologica !== null ? edadCronologica : edadProy,
            edadCronologicaTexto: (edadPensionariaInfo && edadPensionariaInfo.edadCronologicaTexto)
                ? edadPensionariaInfo.edadCronologicaTexto
                : (edadCronologica !== null ? `${edadCronologica} años` : `${edadProy} años`),
            porcentajeLey73: TABLA_EDAD[Math.min(Math.max(edadProy, 60), 65)] || 0.75,
            porcentajeLey73Texto: `${Math.round((TABLA_EDAD[Math.min(Math.max(edadProy, 60), 65)] || 0.75) * 100)}%`,
            fechaNacimiento: birthDate,
            edadPensionariaInfo,
            pensionMensual: pensionProyectada.pensionFinalMensual,
            desglose: pensionProyectada
        },
        comparativa: {
            diferenciaMensual,
            porcentajeIncremento,
            esMejora: diferenciaMensual > 0
        }
    };
}

if (typeof window !== 'undefined') {
    window.CONTINGENCIA_TECNICA_SMG = CONTINGENCIA_TECNICA_SMG;
    window.SALARIO_MINIMO_GENERAL_VIGENTE = CONTINGENCIA_TECNICA_SMG; // Retrocompatibilidad
    window.calculateIMSSLey73Pension = calculateIMSSLey73Pension;
    window.calculateAverageSalaryLast250Weeks = calculateAverageSalaryLast250Weeks;
    window.extractPeriodsFromIMSSDocumentText = extractPeriodsFromIMSSDocumentText;
    window.extractMovementsFromIMSSDocumentText = extractMovementsFromIMSSDocumentText;
    window.validateAndCalculatePensionPeriods = validateAndCalculatePensionPeriods;
    window.calculatePensionProjection = calculatePensionProjection;
    window.extractBirthDateFromCurp = extractBirthDateFromCurp;
    window.calcularUmbralMas6Meses1Dia = calcularUmbralMas6Meses1Dia;
    window.calcularEdadPensionaria = calcularEdadPensionaria;
    window.calcularEdadExacta = calcularEdadExacta;
    window.calcularEdadCronologicaDetallada = calcularEdadCronologicaDetallada;
    window.reconstructDeterministicPeriods = reconstructDeterministicPeriods;
    window.calculateInclusiveDays = calculateInclusiveDays;
    window.parseDateToIso = parseDateToIso;
    window.addDaysToIso = addDaysToIso;
    window.determinarUltimoPeriodoCronologico = determinarUltimoPeriodoCronologico;
    window.validarSalarioProyectadoVsUltimoPeriodo = validarSalarioProyectadoVsUltimoPeriodo;
    window.aplicarCapaPensionMinima = aplicarCapaPensionMinima;
    window.TABLA_PORCENTAJES_LEY73 = TABLA_EDAD;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONTINGENCIA_TECNICA_SMG,
        SALARIO_MINIMO_GENERAL_VIGENTE: CONTINGENCIA_TECNICA_SMG, // Retrocompatibilidad para tests
        calculateIMSSLey73Pension,
        aplicarCapaPensionMinima,
        calculateAverageSalaryLast250Weeks,
        extractPeriodsFromIMSSDocumentText,
        extractMovementsFromIMSSDocumentText,
        validateAndCalculatePensionPeriods,
        calculatePensionProjection,
        extractBirthDateFromCurp,
        calcularUmbralMas6Meses1Dia,
        calcularEdadPensionaria,
        calcularEdadExacta,
        calcularEdadCronologicaDetallada,
        reconstructDeterministicPeriods,
        calculateInclusiveDays,
        parseDateToIso,
        addDaysToIso,
        determinarUltimoPeriodoCronologico,
        validarSalarioProyectadoVsUltimoPeriodo,
        TABLA_GRUPOS_SALARIALES,
        TABLA_EDAD,
        TABLA_PORCENTAJES_LEY73: TABLA_EDAD,
        FACTOR_ADICIONAL
    };
}
