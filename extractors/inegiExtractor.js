/**
 * extractors/inegiExtractor.js
 * 
 * Extractor estructurado para la API de Indicadores del Banco de Información
 * Económica (BIE) del Instituto Nacional de Estadística y Geografía (INEGI).
 * 
 * Cumplimiento estricto:
 * - Cero credenciales hardcodeadas (se lee exclusivamente process.env.INEGI_TOKEN).
 * - Manejo estricto de timeouts con AbortController.
 * - Respuestas normalizadas estructuradas: { success, data, error, rawStatus, duracionMs, detalles }.
 * - Soporte para inyección de cliente HTTP / fetchFn para pruebas determinísticas sin red.
 * - Manejo granular de códigos HTTP (400, 401, 403, 404, 429, 5xx).
 */

const INEGI_API_BASE = 'https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR';

// Indicador oficial por defecto en INEGI BIE para INPC General (Índice Nacional de Precios al Consumidor)
const INDICADOR_DEFAULT_INPC = '910392';

/**
 * Mapea códigos de estado HTTP a errores y descripciones claras para INEGI.
 */
function resolverErrorHttpInegi(status) {
    switch (status) {
        case 400:
            return {
                error: 'HTTP_400_BAD_REQUEST',
                detalles: 'Solicitud inválida ante INEGI: Identificador de indicador numérico o parámetros incorrectos.'
            };
        case 401:
            return {
                error: 'HTTP_401_UNAUTHORIZED',
                detalles: 'Autenticación rechazada por INEGI: El token no fue proporcionado o no está autorizado.'
            };
        case 403:
            return {
                error: 'HTTP_403_FORBIDDEN',
                detalles: 'Acceso denegado por INEGI: El token de desarrollador es inválido o se encuentra inactivo.'
            };
        case 404:
            return {
                error: 'HTTP_404_NOT_FOUND',
                detalles: 'Indicador no encontrado en el Banco de Información Económica (BIE).'
            };
        case 429:
            return {
                error: 'HTTP_429_TOO_MANY_REQUESTS',
                detalles: 'Límite de tasa de consultas excedido en la API de desarrolladores de INEGI.'
            };
        default:
            if (status >= 500) {
                return {
                    error: `HTTP_${status}_SERVER_ERROR`,
                    detalles: `Error interno en los servidores de INEGI (HTTP ${status}).`
                };
            }
            return {
                error: `HTTP_${status}`,
                detalles: `INEGI API respondió con código de estado HTTP ${status}.`
            };
    }
}

/**
 * Consulta un indicador del Banco de Indicadores del INEGI (INPC u homólogo).
 * 
 * @param {Object} params
 * @param {string|number} [params.indicadorId='910392'] - ID numérico del indicador INEGI
 * @param {string} [params.token] - Token opcional (por defecto usa process.env.INEGI_TOKEN)
 * @param {number} [params.timeoutMs=8000] - Tiempo límite en milisegundos
 * @param {Function} [params.fetchFn] - Función fetch inyectable para pruebas unitarias
 * @returns {Promise<Object>} Resultado estandarizado
 */
async function fetchInegiIndicador({
    indicadorId = INDICADOR_DEFAULT_INPC,
    token = process.env.INEGI_TOKEN,
    timeoutMs = 8000,
    fetchFn = globalThis.fetch
} = {}) {
    const inicio = Date.now();
    const idStr = (indicadorId !== undefined && indicadorId !== null) ? String(indicadorId).trim() : '';

    if (!idStr || !/^\d+$/.test(idStr)) {
        return {
            success: false,
            error: 'INDICADOR_ID_INVALIDO',
            detalles: 'Se requiere un identificador numérico de indicador para INEGI (ej. 910392).',
            duracionMs: 0
        };
    }

    if (!token || typeof token !== 'string' || token.trim() === '') {
        return {
            success: false,
            error: 'INEGI_TOKEN_MISSING',
            detalles: 'No se ha configurado la variable de entorno INEGI_TOKEN para autenticación ante el INEGI.',
            duracionMs: 0
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Formato oficial INEGI: /INDICATOR/[IdIndicador]/es/00/true/BIE-BISE/2.0/[Token]?type=json
    const url = `${INEGI_API_BASE}/${encodeURIComponent(idStr)}/es/00/true/BIE-BISE/2.0/${encodeURIComponent(token.trim())}?type=json`;

    try {
        const response = await fetchFn(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: controller.signal
        });

        clearTimeout(timer);
        const duracionMs = Date.now() - inicio;

        if (!response.ok) {
            const errInfo = resolverErrorHttpInegi(response.status);
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
                error: 'INEGI_JSON_PARSE_ERROR',
                detalles: 'La respuesta de INEGI no pudo ser interpretada como JSON válido (posible respuesta XML o HTML de error).',
                duracionMs
            };
        }

        // Estructura oficial INEGI: json.Series[0].OBSERVATIONS[0] = { TIME_PERIOD: 'YYYY/MM', OBS_VALUE: '147.02' }
        if (!json || !Array.isArray(json.Series) || json.Series.length === 0) {
            return {
                success: false,
                error: 'INEGI_JSON_ESTRUCTURA_INVALIDA',
                detalles: 'El cuerpo de respuesta no contiene el nodo esperado Series.',
                duracionMs
            };
        }

        const serieObj = json.Series[0];
        if (!Array.isArray(serieObj.OBSERVATIONS) || serieObj.OBSERVATIONS.length === 0) {
            return {
                success: false,
                error: 'INEGI_OBSERVACIONES_VACIAS',
                detalles: `El indicador ${idStr} no contiene observaciones recientes registradas en el BIE.`,
                duracionMs
            };
        }

        const obsPunto = serieObj.OBSERVATIONS[0];
        if (!obsPunto || typeof obsPunto.OBS_VALUE === 'undefined' || !obsPunto.TIME_PERIOD) {
            return {
                success: false,
                error: 'INEGI_DATOS_CORRUPTOS',
                detalles: 'La observación más reciente carece de TIME_PERIOD u OBS_VALUE válidos.',
                duracionMs
            };
        }

        return {
            success: true,
            fuente: 'INEGI_BIE',
            indicadorId: serieObj.INDICADOR || idStr,
            periodoStr: String(obsPunto.TIME_PERIOD).trim(), // ej. '2026/01'
            valorStr: String(obsPunto.OBS_VALUE).trim(),     // ej. '145.8900'
            duracionMs
        };
    } catch (err) {
        clearTimeout(timer);
        const duracionMs = Date.now() - inicio;
        if (err.name === 'AbortError') {
            return {
                success: false,
                error: 'TIMEOUT',
                detalles: `Tiempo de espera agotado (${timeoutMs}ms) consultando INEGI API.`,
                duracionMs
            };
        }
        return {
            success: false,
            error: 'INEGI_FETCH_ERROR',
            detalles: err.message || 'Error de conexión de red al consultar INEGI BIE.',
            duracionMs
        };
    }
}

module.exports = {
    fetchInegiIndicador,
    INDICADOR_DEFAULT_INPC
};
