/**
 * extractors/banxicoExtractor.js
 * 
 * Extractor estructurado para el Sistema de Información Económica (SIE API)
 * del Banco de México (Banxico).
 * 
 * Cumplimiento estricto:
 * - Cero tokens o credenciales hardcodeadas (consume exclusivamente process.env.BANXICO_TOKEN).
 * - Manejo estricto de timeouts con AbortController.
 * - Respuestas normalizadas estructuradas: { success, data, error, rawStatus, duracionMs, detalles }.
 * - Soporte para inyección de cliente HTTP / fetchFn para pruebas determinísticas unitarias.
 * - Soporte para series oficiales de Banxico (ej. 'SL11298' para Salario Mínimo General).
 * - Manejo granular de códigos HTTP (400, 401, 403, 404, 429, 5xx).
 */

const BANXICO_API_BASE = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series';

// Serie oficial por defecto en Banxico SIE para Salario Mínimo General (promedio nacional diario)
const SERIE_DEFAULT_SALARIO_MINIMO = 'SL11298';

/**
 * Mapea códigos de estado HTTP a errores y descripciones claras.
 */
function resolverErrorHttpBanxico(status) {
    switch (status) {
        case 400:
            return {
                error: 'HTTP_400_BAD_REQUEST',
                detalles: 'Solicitud inválida ante Banxico: El identificador de serie no existe o el formato de consulta es incorrecto.'
            };
        case 401:
            return {
                error: 'HTTP_401_UNAUTHORIZED',
                detalles: 'Autenticación rechazada por Banxico: El token no fue proporcionado o no está autorizado.'
            };
        case 403:
            return {
                error: 'HTTP_403_FORBIDDEN',
                detalles: 'Acceso denegado por Banxico: El token es inválido o no cuenta con permisos suficientes en el SIE.'
            };
        case 404:
            return {
                error: 'HTTP_404_NOT_FOUND',
                detalles: 'Recurso o serie no encontrada en el catálogo de series de Banxico.'
            };
        case 429:
            return {
                error: 'HTTP_429_TOO_MANY_REQUESTS',
                detalles: 'Cuota de peticiones excedida en la API de Banxico (límite de 80 consultas por minuto).'
            };
        default:
            if (status >= 500) {
                return {
                    error: `HTTP_${status}_SERVER_ERROR`,
                    detalles: `Error interno en los servidores de Banco de México (HTTP ${status}).`
                };
            }
            return {
                error: `HTTP_${status}`,
                detalles: `Banxico API respondió con código de estado HTTP ${status}.`
            };
    }
}

/**
 * Consulta una serie del SIE de Banxico (dato oportuno o histórico).
 * 
 * @param {Object} params
 * @param {string} [params.serieId='SL11298'] - Identificador de la serie oficial (ej. 'SL11298')
 * @param {string} [params.token] - Token opcional (por defecto usa process.env.BANXICO_TOKEN)
 * @param {number} [params.timeoutMs=8000] - Tiempo límite en milisegundos
 * @param {Function} [params.fetchFn] - Función fetch inyectable para pruebas unitarias
 * @returns {Promise<Object>} Resultado estandarizado
 */
async function fetchBanxicoSerie({
    serieId = SERIE_DEFAULT_SALARIO_MINIMO,
    token = process.env.BANXICO_TOKEN,
    timeoutMs = 8000,
    fetchFn = globalThis.fetch
} = {}) {
    const inicio = Date.now();
    
    // Normalizar ID de serie: si pasan 'CA601' (cuadro analítico), redirigir a serie oficial SL11298
    let idFinal = (serieId && typeof serieId === 'string') ? serieId.trim() : '';
    if (idFinal.toUpperCase() === 'CA601') {
        idFinal = SERIE_DEFAULT_SALARIO_MINIMO;
    }

    if (!idFinal) {
        return {
            success: false,
            error: 'SERIE_ID_INVALIDO',
            detalles: 'Se requiere un identificador de serie alfanumérico válido para Banxico (ej. SL11298).',
            duracionMs: 0
        };
    }

    if (!token || typeof token !== 'string' || token.trim() === '') {
        return {
            success: false,
            error: 'BANXICO_TOKEN_MISSING',
            detalles: 'No se ha configurado la variable de entorno BANXICO_TOKEN para autenticación ante el SIE.',
            duracionMs: 0
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Endpoint oficial Banxico SIE REST: /series/{idSerie}/datos/oportuno
    const url = `${BANXICO_API_BASE}/${encodeURIComponent(idFinal)}/datos/oportuno`;

    try {
        const response = await fetchFn(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Bmx-Token': token.trim()
            },
            signal: controller.signal
        });

        clearTimeout(timer);
        const duracionMs = Date.now() - inicio;

        if (!response.ok) {
            const errInfo = resolverErrorHttpBanxico(response.status);
            return {
                success: false,
                error: errInfo.error,
                rawStatus: response.status,
                detalles: errInfo.detalles,
                duracionMs
            };
        }

        let json;
        try {
            json = await response.json();
        } catch (parseErr) {
            return {
                success: false,
                error: 'BANXICO_JSON_PARSE_ERROR',
                detalles: 'La respuesta de Banxico no pudo ser interpretada como JSON válido (posible respuesta HTML de error).',
                duracionMs
            };
        }
        
        // Estructura oficial Banxico: json.bmx.series[0].datos[0] = { fecha: 'DD/MM/YYYY', dato: 'XXX.XX' }
        if (!json || !json.bmx || !Array.isArray(json.bmx.series) || json.bmx.series.length === 0) {
            return {
                success: false,
                error: 'BANXICO_JSON_ESTRUCTURA_INVALIDA',
                detalles: 'El cuerpo de respuesta no contiene el nodo esperado bmx.series.',
                duracionMs
            };
        }

        const serieObj = json.bmx.series[0];
        if (!Array.isArray(serieObj.datos) || serieObj.datos.length === 0) {
            return {
                success: false,
                error: 'BANXICO_SERIE_VACIA',
                detalles: `La serie ${idFinal} no contiene puntos de datos disponibles en el SIE.`,
                duracionMs
            };
        }

        const datoPunto = serieObj.datos[0];
        if (!datoPunto || typeof datoPunto.dato === 'undefined' || !datoPunto.fecha) {
            return {
                success: false,
                error: 'BANXICO_DATOS_CORRUPTOS',
                detalles: 'El punto de dato más reciente carece de los campos obligatorios "fecha" o "dato".',
                duracionMs
            };
        }

        return {
            success: true,
            fuente: 'BANXICO_SIE',
            serieId: serieObj.idSerie || idFinal,
            titulo: serieObj.titulo || '',
            fechaStr: datoPunto.fecha, // 'DD/MM/YYYY'
            valorStr: String(datoPunto.dato).trim(), // '315.04' o numérico formateado
            duracionMs
        };
    } catch (err) {
        clearTimeout(timer);
        const duracionMs = Date.now() - inicio;
        if (err.name === 'AbortError') {
            return {
                success: false,
                error: 'TIMEOUT',
                detalles: `Tiempo de espera agotado (${timeoutMs}ms) consultando Banxico API.`,
                duracionMs
            };
        }
        return {
            success: false,
            error: 'BANXICO_FETCH_ERROR',
            detalles: err.message || 'Error de conexión de red al consultar Banxico SIE.',
            duracionMs
        };
    }
}

module.exports = {
    fetchBanxicoSerie,
    SERIE_DEFAULT_SALARIO_MINIMO
};
