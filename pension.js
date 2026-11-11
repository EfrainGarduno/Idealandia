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


function calculateAverageSalaryLast250Weeks(periodos) {
    if (!Array.isArray(periodos) || periodos.length === 0) {
        return {
            success: false,
            error: 'NO_PERIODS',
            message: 'No se encontraron registros de periodos cotizados en el documento.'
        };
    }

    const validPeriods = [];
    for (let i = 0; i < periodos.length; i++) {
        const p = periodos[i];
        if (!p || typeof p !== 'object') continue;

        let salario = typeof p.salarioDiario === 'number'
            ? p.salarioDiario
            : parseFloat(String(p.salarioDiario || '').replace(/[^0-9.]/g, ''));
        if (isNaN(salario) || salario <= 0) continue;

        let semanas = typeof p.semanas === 'number'
            ? p.semanas
            : parseFloat(String(p.semanas || '').replace(/[^0-9.]/g, ''));

        if ((isNaN(semanas) || semanas <= 0) && p.fechaInicio && p.fechaFin) {
            const d1 = new Date(p.fechaInicio);
            const d2 = new Date(p.fechaFin);
            if (!isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d2 >= d1) {
                const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)) + 1;
                semanas = Math.round((diffDays / 7) * 100) / 100;
            }
        }
        if (isNaN(semanas) || semanas <= 0) continue;

        let timeVal = 0;
        if (p.fechaFin) {
            const df = new Date(p.fechaFin);
            if (!isNaN(df.getTime())) timeVal = df.getTime();
        }
        if (!timeVal && p.fechaInicio) {
            const di = new Date(p.fechaInicio);
            if (!isNaN(di.getTime())) timeVal = di.getTime();
        }
        if (!timeVal) timeVal = 1000000000000 - i;

        validPeriods.push({
            patron: p.patron || p.empresa || 'Patrón IMSS',
            fechaInicio: p.fechaInicio || null,
            fechaFin: p.fechaFin || null,
            timeVal,
            semanas,
            salarioDiario: salario
        });
    }

    if (validPeriods.length === 0) {
        return {
            success: false,
            error: 'NO_VALID_PERIODS',
            message: 'No se pudieron extraer registros con salarios numéricos válidos.'
        };
    }

    // Ordenar cronológicamente del más reciente al más antiguo
    validPeriods.sort((a, b) => b.timeVal - a.timeVal);

    const totalSemanas = validPeriods.reduce((acc, p) => acc + p.semanas, 0);
    if (totalSemanas < 250) {
        return {
            success: false,
            error: 'INSUFFICIENT_WEEKS',
            totalSemanas: Math.round(totalSemanas * 100) / 100,
            semanasFaltantes: Math.round((250 - totalSemanas) * 100) / 100,
            message: `El documento contiene solo ${Math.round(totalSemanas)} semanas cotizadas registradas. Se requieren al menos 250 semanas para calcular el salario promedio de las últimas 250 semanas.`
        };
    }

    let accumulatedWeeks = 0;
    let weightedSalarySum = 0;
    const periodosUtilizados = [];

    for (const p of validPeriods) {
        const needed = 250 - accumulatedWeeks;
        if (needed <= 0) break;

        const weeksToUse = Math.min(p.semanas, needed);
        weightedSalarySum += weeksToUse * p.salarioDiario;
        accumulatedWeeks += weeksToUse;

        periodosUtilizados.push({
            patron: p.patron,
            fechaInicio: p.fechaInicio,
            fechaFin: p.fechaFin,
            salarioDiario: p.salarioDiario,
            semanasDisponibles: p.semanas,
            semanasUtilizadas: Math.round(weeksToUse * 100) / 100,
            parcial: weeksToUse < p.semanas
        });

        if (accumulatedWeeks >= 250) break;
    }

    const promedioDiario = weightedSalarySum / 250;
    const salarioDiarioPromedio = Math.round(promedioDiario * 100) / 100;

    return {
        success: true,
        salarioDiarioPromedio,
        semanasAnalizadas: 250,
        totalSemanasDocumento: Math.round(totalSemanas * 100) / 100,
        periodosUtilizados
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

    let sumaDias = 0;
    let sumaPonderada = 0;
    const periodosValidados = [];

    for (let i = 0; i < periodos.length; i++) {
        const p = periodos[i];
        if (!p || typeof p !== 'object') {
            return { success: false, error: 'INVALID_PERIOD_STRUCTURE', message: 'Estructura de periodo no válida.' };
        }

        const dias = typeof p.dias === 'number' ? p.dias : parseInt(p.dias, 10);
        const salario = typeof p.salario_diario === 'number'
            ? p.salario_diario
            : parseFloat(String(p.salario_diario || p.salarioDiario || '').replace(/[^0-9.]/g, ''));

        if (isNaN(dias) || dias <= 0) {
            return { success: false, error: 'INVALID_DAYS', message: `Número de días inválido en periodo ${i + 1}.` };
        }
        if (isNaN(salario) || salario <= 0) {
            return { success: false, error: 'INVALID_SALARY', message: `Salario diario inválido en periodo ${i + 1}.` };
        }

        sumaDias += dias;
        sumaPonderada += dias * salario;

        periodosValidados.push({
            patron: p.patron || p.empresa || 'Patrón IMSS',
            fecha_inicio: p.fecha_inicio || p.fechaInicio || null,
            fecha_fin: p.fecha_fin || p.fechaFin || null,
            dias,
            semanas: Math.round((dias / 7) * 100) / 100,
            salario_diario: salario,
            salarioDiario: salario,
            semanasUtilizadas: Math.round((dias / 7) * 100) / 100,
            semanasDisponibles: Math.round((dias / 7) * 100) / 100
        });
    }

    // Comprobar que los días utilizados sumen exactamente 1,750 (250 semanas * 7)
    if (sumaDias !== 1750) {
        return {
            success: false,
            error: 'DAYS_SUM_MISMATCH',
            sumaDias,
            message: `La suma de días analizados (${sumaDias}) no coincide con los 1,750 días requeridos para 250 semanas.`
        };
    }

    // Calcular determinísticamente en backend el promedio ponderado
    const promedioPonderado = sumaPonderada / 1750;
    const salarioDiarioPromedio = Math.round(promedioPonderado * 100) / 100;

    // Validar concordancia con el número de Gemini si fue provisto
    if (aiData.salario_promedio && typeof aiData.salario_promedio === 'number') {
        const diff = Math.abs(salarioDiarioPromedio - aiData.salario_promedio);
        if (diff > 0.05) {
            return {
                success: false,
                error: 'AVERAGE_VALIDATION_FAILED',
                message: `El promedio recalculado en backend (${salarioDiarioPromedio}) difiere del reportado (${aiData.salario_promedio}).`
            };
        }
    }

    return {
        success: true,
        salarioDiarioPromedio,
        diasTotales: 1750,
        semanasTotales: 250,
        semanasAnalizadas: 250,
        semanasConsideradas: 250,
        totalSemanasDocumento: 250,
        periodos: periodosValidados,
        periodosUtilizados: periodosValidados
    };
}

if (typeof window !== 'undefined') {
    window.calculateIMSSLey73Pension = calculateIMSSLey73Pension;
    window.calculateAverageSalaryLast250Weeks = calculateAverageSalaryLast250Weeks;
    window.extractPeriodsFromIMSSDocumentText = extractPeriodsFromIMSSDocumentText;
    window.validateAndCalculatePensionPeriods = validateAndCalculatePensionPeriods;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateIMSSLey73Pension,
        calculateAverageSalaryLast250Weeks,
        extractPeriodsFromIMSSDocumentText,
        validateAndCalculatePensionPeriods,
        TABLA_GRUPOS_SALARIALES,
        TABLA_EDAD,
        FACTOR_ADICIONAL
    };
}
