/**
 * indicatorValidator.js
 * 
 * Motor de validación rigurosa y sanity checks dinámicos para indicadores candidatos.
 * 
 * Principio:
 * Evita límites estáticos arbitrarios. Valida mediante:
 * 1. Tipado y no negatividad.
 * 2. Variación interanual relativa acotada vs. último valor oficial verificado.
 * 3. Coherencia de ejercicio fiscal y vigencia.
 * 4. Consistencia jurídica/matemática estricta para Ley 73.
 */

const { calcularPensionMinimaLey73 } = require('./indicatorNormalizer');

const MAXIMA_VARIACION_ANUAL_SMG = 0.35; // Máximo 35% de incremento interanual permitido sin intervención manual
const MAXIMA_VARIACION_ANUAL_INPC = 0.25; // Máximo 25% de inflación anual permitida sin revisión

/**
 * Valida un candidato a Salario Mínimo General diario.
 * 
 * @param {Object} candidato - Objeto normalizado con { valor, anioReferencia, fechaVigenciaInicio }
 * @param {number|null} [valorVigenteEnBD=null] - Último valor oficial persistido en BD
 * @returns {Object} { valido: boolean, motivoRechazo?: string }
 */
function validarSalarioMinimoCandidato(candidato, valorVigenteEnBD = null) {
    if (!candidato || typeof candidato !== 'object') {
        return { valido: false, motivoRechazo: 'Candidato no proporcionado o formato inválido.' };
    }

    const { valor, anioReferencia, fechaVigenciaInicio } = candidato;

    // 1. Validación de valor numérico
    if (typeof valor !== 'number' || isNaN(valor) || valor <= 0) {
        return { valido: false, motivoRechazo: `El valor del SMG debe ser un número positivo (obtenido: ${valor}).` };
    }

    // 2. Validación de ejercicio fiscal
    const anioActual = new Date().getFullYear();
    if (!anioReferencia || anioReferencia < anioActual - 1 || anioReferencia > anioActual + 1) {
        return { 
            valido: false, 
            motivoRechazo: `Año de referencia (${anioReferencia}) incoherente con el ciclo fiscal actual (${anioActual}).` 
        };
    }

    // 3. Validación de fecha de vigencia
    if (!fechaVigenciaInicio || !/^\d{4}-01-01$/.test(fechaVigenciaInicio)) {
        return { 
            valido: false, 
            motivoRechazo: `La fecha de inicio de vigencia debe ser el 1 de enero del año fiscal (obtenido: ${fechaVigenciaInicio}).` 
        };
    }

    // 4. Validación dinámica relativa vs. valor vigente previo en BD
    if (typeof valorVigenteEnBD === 'number' && valorVigenteEnBD > 0) {
        // Regla: El salario mínimo no puede reducirse por mandato constitucional
        if (valor < valorVigenteEnBD) {
            return { 
                valido: false, 
                motivoRechazo: `El valor candidato ($${valor}) no puede ser menor que el valor oficial vigente ($${valorVigenteEnBD}).` 
            };
        }

        // Regla: No incremento desproporcionado (máx +35% interanual)
        const incrementoRelativo = (valor - valorVigenteEnBD) / valorVigenteEnBD;
        if (incrementoRelativo > MAXIMA_VARIACION_ANUAL_SMG) {
            const pct = (incrementoRelativo * 100).toFixed(2);
            return { 
                valido: false, 
                motivoRechazo: `El incremento del ${pct}% excede la tasa máxima permitida (${MAXIMA_VARIACION_ANUAL_SMG * 100}%). Se requiere revisión manual.` 
            };
        }
    }

    return { valido: true };
}

/**
 * Valida la consistencia matemática entre el Salario Mínimo General y la Pensión Mínima Ley 73.
 * 
 * @param {number} smgDiario 
 * @param {number} pensionLey73Mensual 
 * @returns {Object} { valido: boolean, motivoRechazo?: string }
 */
function validarConsistenciaMatematicaLey73(smgDiario, pensionLey73Mensual) {
    const calculadaEsperada = calcularPensionMinimaLey73(smgDiario);
    if (calculadaEsperada === null) {
        return { valido: false, motivoRechazo: 'No fue posible calcular la pensión esperada a partir del SMG.' };
    }

    const delta = Math.abs(pensionLey73Mensual - calculadaEsperada);
    if (delta > 0.02) {
        return { 
            valido: false, 
            motivoRechazo: `Discrepancia en pensión Ley 73: esperada $${calculadaEsperada}, candidata $${pensionLey73Mensual} (delta: ${delta.toFixed(4)}).` 
        };
    }

    return { valido: true };
}

/**
 * Valida un candidato a índice INPC para la actualización de Ley 97.
 * 
 * @param {Object} candidato 
 * @param {number|null} [valorVigenteEnBD=null] 
 * @returns {Object} { valido: boolean, motivoRechazo?: string }
 */
function validarINPCCandidato(candidato, valorVigenteEnBD = null) {
    if (!candidato || typeof candidato !== 'object') {
        return { valido: false, motivoRechazo: 'Candidato INPC no proporcionado o formato inválido.' };
    }

    const { valor } = candidato;
    if (typeof valor !== 'number' || isNaN(valor) || valor <= 0) {
        return { valido: false, motivoRechazo: `El valor del INPC debe ser un número positivo (obtenido: ${valor}).` };
    }

    if (typeof valorVigenteEnBD === 'number' && valorVigenteEnBD > 0) {
        const variacion = Math.abs((valor - valorVigenteEnBD) / valorVigenteEnBD);
        if (variacion > MAXIMA_VARIACION_ANUAL_INPC) {
            return {
                valido: false,
                motivoRechazo: `La variación del INPC (${(variacion * 100).toFixed(2)}%) supera el rango anual esperado.`
            };
        }
    }

    return { valido: true };
}

module.exports = {
    validarSalarioMinimoCandidato,
    validarConsistenciaMatematicaLey73,
    validarINPCCandidato
};
