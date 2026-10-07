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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateIMSSLey73Pension,
        TABLA_GRUPOS_SALARIALES,
        TABLA_EDAD,
        FACTOR_ADICIONAL
    };
}
