/**
 * pensionIndicadoresService.js
 * 
 * Módulo de servicio para la gestión, consulta, caché y determinación del
 * mínimo legal de pensiones (Ley 73 y Ley 97) en Idealandia.
 * 
 * Principios:
 * 1. Cero valores fijos en la lógica de cálculo: la base de datos es la fuente de verdad.
 * 2. Distinción estricta de regímenes: Ley 73 y Ley 97 nunca se mezclan.
 * 3. Distinción binaria obligatoria: OFICIAL vs ESTIMADO.
 * 4. Resiliencia y contingencia: Si la BD falla, acude al caché en memoria o respaldo
 *    verificado. NUNCA devuelve cero, NUNCA inventa cifras.
 * 5. Invalidación reactiva de caché al actualizar o alternar indicadores.
 */

// Memoria caché de indicadores
let indicadoresCache = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora de vigencia

// Respaldo verificado inmutable de contingencia (usado ÚNICAMENTE si la BD falla en arranque en frío)
const RESPALDO_CONTINGENCIA_VERIFICADO = [
    {
        id: 1,
        codigo: 'SALARIO_MINIMO_GENERAL',
        regimen: 'general',
        nombre: 'Salario Mínimo General 2024',
        descripcion: 'Salario mínimo general diario vigente en el área geográfica nacional',
        valor: 248.9300,
        unidad: 'MXN_DIARIO',
        tipo_valor: 'OFICIAL',
        anio_referencia: 2024,
        fecha_vigencia_inicio: '2024-01-01',
        fecha_vigencia_fin: '2024-12-31',
        fuente: 'CONASAMI / Diario Oficial de la Federación',
        fuente_url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5711145&fecha=12/12/2023',
        fundamento_legal: 'Resolución del H. Consejo de Representantes de la CONASAMI (DOF 12/12/2023)',
        formula_calculo: 'Fijación anual por acuerdo tripartito en CONASAMI',
        metodo_obtencion: 'MANUAL',
        activo: 1
    },
    {
        id: 2,
        codigo: 'PENSION_MINIMA_LEY_73',
        regimen: 'ley73',
        nombre: 'Pensión Mínima Garantizada Ley 73 (2024)',
        descripcion: 'Pensión mínima garantizada mensual para pensionados bajo régimen Ley 73',
        valor: 8404.5000,
        unidad: 'MXN_MENSUAL',
        tipo_valor: 'OFICIAL',
        anio_referencia: 2024,
        fecha_vigencia_inicio: '2024-01-01',
        fecha_vigencia_fin: '2024-12-31',
        fuente: 'DOF / IMSS / CONASAMI',
        fuente_url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5711145&fecha=12/12/2023',
        fundamento_legal: 'Artículo 168 de la Ley del Seguro Social de 1973 y Decreto publicado en el DOF el 20 de diciembre de 2001 (factor 1.11)',
        formula_calculo: '248.93 * (365 / 12) * 1.11',
        metodo_obtencion: 'MANUAL',
        activo: 1
    },
    {
        id: 3,
        codigo: 'SALARIO_MINIMO_GENERAL',
        regimen: 'general',
        nombre: 'Salario Mínimo General 2025',
        descripcion: 'Salario mínimo general diario vigente en el área geográfica nacional',
        valor: 278.8000,
        unidad: 'MXN_DIARIO',
        tipo_valor: 'OFICIAL',
        anio_referencia: 2025,
        fecha_vigencia_inicio: '2025-01-01',
        fecha_vigencia_fin: '2025-12-31',
        fuente: 'CONASAMI / Diario Oficial de la Federación',
        fuente_url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5745678&fecha=19/12/2024',
        fundamento_legal: 'Resolución del H. Consejo de Representantes de la CONASAMI (DOF 19/12/2024)',
        formula_calculo: 'Fijación anual por acuerdo tripartito en CONASAMI',
        metodo_obtencion: 'MANUAL',
        activo: 1
    },
    {
        id: 4,
        codigo: 'PENSION_MINIMA_LEY_73',
        regimen: 'ley73',
        nombre: 'Pensión Mínima Garantizada Ley 73 (2025)',
        descripcion: 'Pensión mínima garantizada mensual para pensionados bajo régimen Ley 73',
        valor: 9412.9900,
        unidad: 'MXN_MENSUAL',
        tipo_valor: 'OFICIAL',
        anio_referencia: 2025,
        fecha_vigencia_inicio: '2025-01-01',
        fecha_vigencia_fin: '2025-12-31',
        fuente: 'DOF / IMSS / CONASAMI',
        fuente_url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5745678&fecha=19/12/2024',
        fundamento_legal: 'Artículo 168 de la Ley del Seguro Social de 1973 y Decreto publicado en el DOF el 20 de diciembre de 2001 (factor 1.11)',
        formula_calculo: '278.80 * (365 / 12) * 1.11',
        metodo_obtencion: 'MANUAL',
        activo: 1
    },
    {
        id: 5,
        codigo: 'SALARIO_MINIMO_GENERAL',
        regimen: 'general',
        nombre: 'Salario Mínimo General 2026',
        descripcion: 'Salario mínimo general diario vigente en el área geográfica nacional',
        valor: 315.0400,
        unidad: 'MXN_DIARIO',
        tipo_valor: 'OFICIAL',
        anio_referencia: 2026,
        fecha_vigencia_inicio: '2026-01-01',
        fecha_vigencia_fin: '2026-12-31',
        fuente: 'CONASAMI / Diario Oficial de la Federación',
        fuente_url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5776543&fecha=19/12/2025',
        fundamento_legal: 'Resolución del H. Consejo de Representantes de la CONASAMI (DOF 19/12/2025)',
        formula_calculo: 'Fijación anual por acuerdo tripartito en CONASAMI',
        metodo_obtencion: 'MANUAL',
        activo: 1
    },
    {
        id: 6,
        codigo: 'PENSION_MINIMA_LEY_73',
        regimen: 'ley73',
        nombre: 'Pensión Mínima Garantizada Ley 73 (2026)',
        descripcion: 'Pensión mínima garantizada mensual para pensionados bajo régimen Ley 73',
        valor: 10636.5400,
        unidad: 'MXN_MENSUAL',
        tipo_valor: 'OFICIAL',
        anio_referencia: 2026,
        fecha_vigencia_inicio: '2026-01-01',
        fecha_vigencia_fin: '2026-12-31',
        fuente: 'DOF / IMSS / CONASAMI',
        fuente_url: 'https://www.dof.gob.mx/nota_detalle.php?codigo=5776543&fecha=19/12/2025',
        fundamento_legal: 'Artículo 168 de la Ley del Seguro Social de 1973 y Decreto publicado en el DOF el 20 de diciembre de 2001 (factor 1.11)',
        formula_calculo: '315.04 * (365 / 12) * 1.11',
        metodo_obtencion: 'MANUAL',
        activo: 1
    },
    {
        id: 7,
        codigo: 'PENSION_MINIMA_GARANTIZADA_LEY_97',
        regimen: 'ley97',
        nombre: 'Pensión Mínima Garantizada Ley 97 Base (2026)',
        descripcion: 'Monto base referencial de pensión garantizada conforme a la tabla del Art. 170 LSS',
        valor: 3778.0000,
        unidad: 'MXN_MENSUAL',
        tipo_valor: 'OFICIAL',
        anio_referencia: 2026,
        fecha_vigencia_inicio: '2026-02-01',
        fecha_vigencia_fin: '2027-01-31',
        fuente: 'IMSS / INEGI / DOF',
        fuente_url: 'https://www.imss.gob.mx/pensiones/preguntas-frecuentes/pension-garantizada',
        fundamento_legal: 'Artículo 170 de la Ley del Seguro Social de 1997 (reforma DOF 16/12/2020). Actualización anual en febrero conforme al INPC anual publicado por el INEGI.',
        formula_calculo: 'Matriz legal Art. 170 LSS indexada por INPC INEGI',
        metodo_obtencion: 'MANUAL',
        activo: 1
    }
];

/**
 * Invalida el caché en memoria para forzar recarga desde BD.
 */
function invalidarCacheIndicadores() {
    indicadoresCache = null;
    cacheTimestamp = null;
}

/**
 * Carga todos los indicadores activos desde la BD con manejo de caché y contingencia.
 * @param {object} pool Pool de MySQL
 * @param {boolean} forzarRecarga Si es true, ignora el caché
 * @returns {Promise<Array>} Lista de indicadores
 */
async function obtenerIndicadoresActivos(pool, forzarRecarga = false) {
    const ahora = Date.now();
    if (!forzarRecarga && indicadoresCache && cacheTimestamp && (ahora - cacheTimestamp < CACHE_TTL_MS)) {
        return indicadoresCache;
    }

    try {
        if (!pool || typeof pool.query !== 'function') {
            throw new Error('Pool de base de datos no disponible');
        }

        const [rows] = await pool.query(`
            SELECT id, codigo, regimen, nombre, descripcion,
                   CAST(valor AS DOUBLE) AS valor, unidad, tipo_valor,
                   anio_referencia,
                   DATE_FORMAT(fecha_vigencia_inicio, '%Y-%m-%d') AS fecha_vigencia_inicio,
                   DATE_FORMAT(fecha_vigencia_fin, '%Y-%m-%d') AS fecha_vigencia_fin,
                   fuente, fuente_url, fundamento_legal, formula_calculo,
                   metodo_obtencion, activo, created_at, updated_at
            FROM pensiones_indicadores
            WHERE activo = 1
            ORDER BY anio_referencia DESC, codigo ASC
        `);

        if (Array.isArray(rows) && rows.length > 0) {
            indicadoresCache = rows;
            cacheTimestamp = ahora;
            return rows;
        }

        // Si la tabla está vacía en BD, recurrir a contingencia
        console.warn('[PENSIONES INDICADORES] La tabla en BD está vacía. Usando respaldo de contingencia verificado.');
        indicadoresCache = RESPALDO_CONTINGENCIA_VERIFICADO;
        cacheTimestamp = ahora;
        return RESPALDO_CONTINGENCIA_VERIFICADO;
    } catch (err) {
        console.error('[PENSIONES CONTINGENCIA] Error al consultar indicadores desde BD:', err.message);
        // Si ya teníamos caché previo, conservarlo
        if (indicadoresCache && indicadoresCache.length > 0) {
            console.warn('[PENSIONES CONTINGENCIA] Conservando caché previo en memoria.');
            return indicadoresCache;
        }
        // Si no teníamos caché previo, recurrir al respaldo inmutable verificado (NUNCA cero)
        console.warn('[PENSIONES CONTINGENCIA] Activando respaldo verificado de contingencia (sin ceros ni invenciones).');
        indicadoresCache = RESPALDO_CONTINGENCIA_VERIFICADO;
        cacheTimestamp = ahora;
        return RESPALDO_CONTINGENCIA_VERIFICADO;
    }
}

/**
 * Normaliza una fecha a formato ISO YYYY-MM-DD.
 */
function normalizarFechaIso(fechaInput) {
    if (!fechaInput) {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
    }

    if (typeof fechaInput === 'string') {
        const trimmed = fechaInput.trim();
        // YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        // DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
            const [d, m, y] = trimmed.split('/');
            return `${y}-${m}-${d}`;
        }
    }

    if (fechaInput instanceof Date && !isNaN(fechaInput.getTime())) {
        const y = fechaInput.getFullYear();
        const m = String(fechaInput.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaInput.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
    }

    return null;
}

/**
 * Determina el indicador legal aplicable según el régimen y la fecha efectiva de pensión.
 * 
 * Reglas de selección:
 * 1. Filtra estrictamente por régimen ('ley73', 'ley97' o 'general'). Nunca los mezcla.
 * 2. Si la fecha cae dentro del rango [vigencia_inicio, vigencia_fin] de un indicador oficial:
 *    Retorna tipo_valor = 'OFICIAL', esOficial = true.
 * 3. Si la fecha es futura y supera la última publicación oficial registrada:
 *    Retorna el último valor oficial activo marcándolo estrictamente como:
 *    tipo_valor = 'ESTIMADO', esOficial = false, con advertencia transparente.
 * 4. Si la fecha es anterior a los registros de BD, busca el más cercano anterior o reporta error controlado.
 * 
 * @param {object} params
 * @param {object} params.pool Pool MySQL
 * @param {string} params.regimen 'ley73' | 'ley97' | 'general'
 * @param {string|Date} params.fecha Fecha efectiva de pensión (no sólo el año actual)
 * @param {string} params.codigo Código específico (opcional, ej. 'PENSION_MINIMA_LEY_73')
 * @returns {Promise<object>} Objeto con indicador aplicable y metadatos legales
 */
async function determinarIndicadorAplicable({ pool, regimen = 'ley73', fecha = null, codigo = null }) {
    const regNorm = String(regimen || 'ley73').trim().toLowerCase();
    if (!['ley73', 'ley97', 'general'].includes(regNorm)) {
        return {
            success: false,
            error: 'INVALID_REGIME',
            message: `Régimen no reconocido: ${regimen}. Debe ser ley73, ley97 o general.`
        };
    }

    const isoFecha = normalizarFechaIso(fecha);
    if (!isoFecha) {
        return {
            success: false,
            error: 'INVALID_DATE',
            message: 'Fecha de pensión inválida o formato no soportado (se requiere YYYY-MM-DD o DD/MM/YYYY).'
        };
    }

    const anioFecha = parseInt(isoFecha.split('-')[0], 10);

    // Obtener indicadores activos desde BD o caché
    const indicadores = await obtenerIndicadoresActivos(pool);

    // Filtrar candidatos por régimen y código
    let candidatos = indicadores.filter(i => i.regimen === regNorm && i.activo === 1);

    if (codigo) {
        const codNorm = String(codigo).trim().toUpperCase();
        candidatos = candidatos.filter(i => i.codigo.toUpperCase() === codNorm);
    } else {
        // Códigos por defecto según régimen
        if (regNorm === 'ley73') {
            candidatos = candidatos.filter(i => i.codigo === 'PENSION_MINIMA_LEY_73');
        } else if (regNorm === 'ley97') {
            candidatos = candidatos.filter(i => i.codigo === 'PENSION_MINIMA_GARANTIZADA_LEY_97');
        } else if (regNorm === 'general') {
            candidatos = candidatos.filter(i => i.codigo === 'SALARIO_MINIMO_GENERAL');
        }
    }

    if (candidatos.length === 0) {
        return {
            success: false,
            error: 'INDICATOR_NOT_FOUND',
            message: `No existen indicadores activos configurados para el régimen ${regNorm}.`,
            regimen: regNorm
        };
    }

    // 1. Búsqueda exacta por rango de vigencia: fecha_vigencia_inicio <= isoFecha <= fecha_vigencia_fin
    const matchVigencia = candidatos.find(i => {
        const ini = i.fecha_vigencia_inicio;
        const fin = i.fecha_vigencia_fin || '9999-12-31';
        return isoFecha >= ini && isoFecha <= fin;
    });

    if (matchVigencia) {
        const esOficial = matchVigencia.tipo_valor === 'OFICIAL';
        return {
            success: true,
            regimen: matchVigencia.regimen,
            codigo: matchVigencia.codigo,
            nombre: matchVigencia.nombre,
            descripcion: matchVigencia.descripcion,
            valor: parseFloat(matchVigencia.valor),
            pensionMinima: matchVigencia.unidad === 'MXN_MENSUAL' ? parseFloat(matchVigencia.valor) : null,
            unidad: matchVigencia.unidad,
            tipoValor: matchVigencia.tipo_valor,
            esOficial: esOficial,
            anioReferencia: matchVigencia.anio_referencia,
            fechaVigenciaInicio: matchVigencia.fecha_vigencia_inicio,
            fechaVigenciaFin: matchVigencia.fecha_vigencia_fin,
            fuente: matchVigencia.fuente,
            fuenteUrl: matchVigencia.fuente_url,
            fundamentoLegal: matchVigencia.fundamento_legal,
            formulaCalculo: matchVigencia.formula_calculo,
            metodoObtencion: matchVigencia.metodo_obtencion,
            fechaConsulta: isoFecha,
            advertencia: esOficial ? null : 'El valor utilizado es estimado conforme a las reglas del modelo.'
        };
    }

    // 2. Si la fecha es FUTURA (superior a la última vigencia registrada):
    // Ordenar de mayor a menor por fecha_vigencia_fin / año de referencia
    candidatos.sort((a, b) => b.anio_referencia - a.anio_referencia);
    const masReciente = candidatos[0];

    if (isoFecha > (masReciente.fecha_vigencia_fin || masReciente.fecha_vigencia_inicio)) {
        return {
            success: true,
            regimen: masReciente.regimen,
            codigo: masReciente.codigo,
            nombre: `${masReciente.nombre} (Proyección ${anioFecha})`,
            descripcion: masReciente.descripcion,
            valor: parseFloat(masReciente.valor),
            pensionMinima: masReciente.unidad === 'MXN_MENSUAL' ? parseFloat(masReciente.valor) : null,
            unidad: masReciente.unidad,
            tipoValor: 'ESTIMADO',
            esOficial: false,
            anioReferencia: anioFecha,
            anioBaseOficial: masReciente.anio_referencia,
            fechaVigenciaInicio: `${anioFecha}-01-01`,
            fechaVigenciaFin: `${anioFecha}-12-31`,
            fuente: `${masReciente.fuente} (Referencia base)`,
            fuenteUrl: masReciente.fuente_url,
            fundamentoLegal: masReciente.fundamento_legal,
            formulaCalculo: masReciente.formula_calculo,
            metodoObtencion: 'MANUAL',
            fechaConsulta: isoFecha,
            advertencia: `Valor estimado para ${anioFecha}. El valor oficial correspondiente a este ejercicio aún no ha sido publicado en el DOF. La estimación utiliza como base el último valor oficial disponible (${masReciente.anio_referencia}) y se actualizará automáticamente cuando exista publicación oficial.`
        };
    }

    // 3. Si la fecha es ANTERIOR a la fecha de vigencia más antigua registrada
    candidatos.sort((a, b) => a.anio_referencia - b.anio_referencia);
    const masAntiguo = candidatos[0];

    return {
        success: true,
        regimen: masAntiguo.regimen,
        codigo: masAntiguo.codigo,
        nombre: masAntiguo.nombre,
        descripcion: masAntiguo.descripcion,
        valor: parseFloat(masAntiguo.valor),
        pensionMinima: masAntiguo.unidad === 'MXN_MENSUAL' ? parseFloat(masAntiguo.valor) : null,
        unidad: masAntiguo.unidad,
        tipoValor: masAntiguo.tipo_valor,
        esOficial: masAntiguo.tipo_valor === 'OFICIAL',
        anioReferencia: masAntiguo.anio_referencia,
        fechaVigenciaInicio: masAntiguo.fecha_vigencia_inicio,
        fechaVigenciaFin: masAntiguo.fecha_vigencia_fin,
        fuente: masAntiguo.fuente,
        fuenteUrl: masAntiguo.fuente_url,
        fundamentoLegal: masAntiguo.fundamento_legal,
        formulaCalculo: masAntiguo.formula_calculo,
        metodoObtencion: masAntiguo.metodo_obtencion,
        fechaConsulta: isoFecha,
        advertencia: `La fecha consultada (${isoFecha}) es anterior al registro histórico disponible más cercano (${masAntiguo.anio_referencia}).`
    };
}

/**
 * Obtiene el salario mínimo general vigente dinámicamente desde BD para una fecha.
 * @param {object} pool Pool MySQL
 * @param {string|Date} fecha Fecha de referencia
 * @returns {Promise<object>} Objeto con salarioMinimo, anio e histórico
 */
async function obtenerSalarioMinimoVigente(pool, fecha = null) {
    const res = await determinarIndicadorAplicable({
        pool,
        regimen: 'general',
        fecha,
        codigo: 'SALARIO_MINIMO_GENERAL'
    });

    // Construir tabla histórica de salarios mínimos desde BD
    let indicadores = [];
    try {
        indicadores = await obtenerIndicadoresActivos(pool);
    } catch (e) {
        indicadores = [];
    }

    const smgHist = Array.isArray(indicadores)
        ? indicadores.filter(i => i.codigo === 'SALARIO_MINIMO_GENERAL')
        : [];

    const historico = {};
    smgHist.forEach(item => {
        historico[item.anio_referencia] = parseFloat(item.valor);
    });

    // Si BD no entregó histórico (arranque en frío o falla de conexión), derivar del respaldo inmutable
    if (Object.keys(historico).length === 0) {
        const smgRespaldo = RESPALDO_CONTINGENCIA_VERIFICADO.filter(i => i.codigo === 'SALARIO_MINIMO_GENERAL');
        smgRespaldo.forEach(item => {
            historico[item.anio_referencia] = parseFloat(item.valor);
        });
    }

    if (res && res.success && res.valor > 0) {
        return {
            success: true,
            salarioMinimo: res.valor,
            anio: res.anioReferencia,
            tipoValor: res.tipoValor,
            esOficial: res.esOficial,
            fuente: res.fuente,
            historico
        };
    }

    // Respaldo de contingencia dinámico derivado de RESPALDO_CONTINGENCIA_VERIFICADO (cero hardcodeos inline)
    const smgContingencia = RESPALDO_CONTINGENCIA_VERIFICADO.filter(i => i.codigo === 'SALARIO_MINIMO_GENERAL');
    const respaldoSMG = smgContingencia[smgContingencia.length - 1];

    console.warn(`[PENSIONES SMG] Fallback a contingencia verificada de salario mínimo (${respaldoSMG.anio_referencia}: $${respaldoSMG.valor}).`);
    return {
        success: true,
        salarioMinimo: parseFloat(respaldoSMG.valor),
        anio: respaldoSMG.anio_referencia,
        tipoValor: respaldoSMG.tipo_valor,
        esOficial: respaldoSMG.tipo_valor === 'OFICIAL',
        fuente: `${respaldoSMG.fuente} (Respaldo verificado)`,
        historico
    };
}

module.exports = {
    obtenerIndicadoresActivos,
    invalidarCacheIndicadores,
    determinarIndicadorAplicable,
    obtenerSalarioMinimoVigente,
    normalizarFechaIso,
    RESPALDO_CONTINGENCIA_VERIFICADO
};
