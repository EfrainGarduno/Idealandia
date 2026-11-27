/**
 * indicatorNormalizer.js
 * 
 * Módulo de normalización determinística de datos crudos extraídos de fuentes oficiales.
 * Estandariza valores numéricos, fechas, ejercicios fiscales y cálculo de montos derivados.
 */

/**
 * Normaliza un valor numérico a decimal con precisión controlada.
 * @param {string|number} valorInput 
 * @param {number} [decimales=4] 
 * @returns {number|null}
 */
function normalizarValorNumerico(valorInput, decimales = 4) {
    if (valorInput === null || valorInput === undefined || valorInput === '') return null;
    let limpio = typeof valorInput === 'string' 
        ? valorInput.replace(/,/g, '').trim() 
        : valorInput;
    const num = parseFloat(limpio);
    if (isNaN(num) || !isFinite(num)) return null;
    return parseFloat(num.toFixed(decimales));
}

/**
 * Normaliza fechas provenientes de diversas fuentes (ej. 'DD/MM/YYYY', 'YYYY/MM/DD', 'YYYY-MM-DD')
 * al estándar ISO 'YYYY-MM-DD'.
 * @param {string} fechaInput 
 * @returns {string|null}
 */
function normalizarFechaAISO(fechaInput) {
    if (!fechaInput || typeof fechaInput !== 'string') return null;
    const str = fechaInput.trim();

    // Formato 'DD/MM/YYYY' (Banxico)
    const matchDDMMYYYY = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (matchDDMMYYYY) {
        const dia = matchDDMMYYYY[1].padStart(2, '0');
        const mes = matchDDMMYYYY[2].padStart(2, '0');
        const anio = matchDDMMYYYY[3];
        return `${anio}-${mes}-${dia}`;
    }

    // Formato 'YYYY/MM' (INEGI periodo)
    const matchYYYYMM = str.match(/^(\d{4})\/(\d{1,2})$/);
    if (matchYYYYMM) {
        const anio = matchYYYYMM[1];
        const mes = matchYYYYMM[2].padStart(2, '0');
        return `${anio}-${mes}-01`;
    }

    // Formato 'YYYY-MM-DD'
    const matchISO = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (matchISO) {
        return str;
    }

    return null;
}

/**
 * Determina el ejercicio fiscal (año de referencia) a partir de una fecha normalizada.
 * @param {string} fechaISO 
 * @returns {number|null}
 */
function extraerEjercicioFiscal(fechaISO) {
    if (!fechaISO || typeof fechaISO !== 'string') return null;
    const match = fechaISO.match(/^(\d{4})-/);
    if (!match) return null;
    const anio = parseInt(match[1], 10);
    return isNaN(anio) ? null : anio;
}

/**
 * Calcula la Pensión Mínima Garantizada de Ley 73 conforme a la fórmula legal oficial:
 * SMG * (365 / 12) * 1.11
 * 
 * @param {number} smgDiario - Salario Mínimo General diario en MXN
 * @returns {number|null} Monto mensual en MXN redondeado a 2 decimales
 */
function calcularPensionMinimaLey73(smgDiario) {
    if (typeof smgDiario !== 'number' || isNaN(smgDiario) || smgDiario <= 0) return null;
    // Multiplicación actuarial exacta con factor 1.11 del Decreto DOF 20/12/2001
    const mensual = smgDiario * (365 / 12) * 1.11;
    return Math.round((mensual + Number.EPSILON) * 100) / 100;
}

module.exports = {
    normalizarValorNumerico,
    normalizarFechaAISO,
    extraerEjercicioFiscal,
    calcularPensionMinimaLey73
};
