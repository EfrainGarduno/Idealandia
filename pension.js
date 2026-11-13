// Salario Mínimo General Vigente en México (pesos diarios)
// Preparado para fácil actualización anual
const SALARIO_MINIMO_GENERAL_VIGENTE = 315.04;
const SALARIOS_MINIMOS_GENERALES = {
    2024: 248.93,
    2025: 278.80,
    2026: 315.04
};

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

function extractPeriodsFromIMSSDocumentText(text) {
    if (!text || typeof text !== 'string') return null;
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

    const periodos = aiData.periodos;
    if (!Array.isArray(periodos) || periodos.length === 0) {
        return { success: false, error: 'NO_PERIODS', message: 'No se identificaron periodos de cotización en el documento.' };
    }

    return calculateAverageSalaryLast250Weeks(periodos);
}

if (typeof window !== 'undefined') {
    window.SALARIO_MINIMO_GENERAL_VIGENTE = SALARIO_MINIMO_GENERAL_VIGENTE;
    window.SALARIOS_MINIMOS_GENERALES = SALARIOS_MINIMOS_GENERALES;
    window.calculateIMSSLey73Pension = calculateIMSSLey73Pension;
    window.calculateAverageSalaryLast250Weeks = calculateAverageSalaryLast250Weeks;
    window.extractPeriodsFromIMSSDocumentText = extractPeriodsFromIMSSDocumentText;
    window.validateAndCalculatePensionPeriods = validateAndCalculatePensionPeriods;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SALARIO_MINIMO_GENERAL_VIGENTE,
        SALARIOS_MINIMOS_GENERALES,
        calculateIMSSLey73Pension,
        calculateAverageSalaryLast250Weeks,
        extractPeriodsFromIMSSDocumentText,
        validateAndCalculatePensionPeriods,
        TABLA_GRUPOS_SALARIALES,
        TABLA_EDAD,
        FACTOR_ADICIONAL
    };
}
