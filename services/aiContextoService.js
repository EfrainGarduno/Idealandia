/**
 * services/aiContextoService.js
 * Servicio de backend para la administración y consulta del contexto y base de conocimiento de Idealita.
 * 
 * Preparado arquitectónicamente para la Fase 2:
 * Permite a la IA consultar el contexto activo ordenado por prioridad de forma dinámica desde MySQL.
 */

const CATEGORIAS_SUGERIDAS_DEFAULT = [
    'General',
    'Idealandia',
    'Idealita',
    'Reglas',
    'Ideas',
    'Finanzas',
    'Pensiones',
    'Asociados',
    'Servicios',
    'Administración'
];

/**
 * Consulta los registros de contexto de Idealita.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').Connection} dbPool 
 * @param {Object} options
 * @param {string} [options.categoria] - Filtrar por categoría específica
 * @param {boolean} [options.soloActivos=true] - Filtrar solo registros activos (activo = 1)
 * @param {string} [options.busqueda] - Término de búsqueda en título, contenido o categoría
 * @param {number} [options.limite] - Límite opcional de registros
 * @returns {Promise<Array<Object>>}
 */
async function obtenerContextoIdealita(dbPool, {
    categoria = null,
    soloActivos = true,
    busqueda = null,
    limite = null
} = {}) {
    let query = `
        SELECT id, categoria, titulo, contenido, prioridad, activo, version, created_at, updated_at
        FROM ai_contexto
        WHERE 1=1
    `;
    const params = [];

    if (soloActivos) {
        query += ` AND activo = 1`;
    }

    if (categoria && categoria.trim() !== '') {
        query += ` AND categoria = ?`;
        params.push(categoria.trim());
    }

    if (busqueda && busqueda.trim() !== '') {
        query += ` AND (titulo LIKE ? OR contenido LIKE ? OR categoria LIKE ?)`;
        const wildcard = `%${busqueda.trim()}%`;
        params.push(wildcard, wildcard, wildcard);
    }

    query += ` ORDER BY prioridad DESC, updated_at DESC`;

    if (limite && Number.isInteger(limite) && limite > 0) {
        query += ` LIMIT ${parseInt(limite, 10)}`;
    }

    const [rows] = await dbPool.query(query, params);
    return rows;
}

/**
 * Obtiene un registro individual por ID.
 */
async function obtenerContextoPorId(dbPool, id) {
    const [rows] = await dbPool.query(
        'SELECT id, categoria, titulo, contenido, prioridad, activo, version, created_at, updated_at FROM ai_contexto WHERE id = ?',
        [id]
    );
    return rows[0] || null;
}

/**
 * Obtiene la lista unificada de categorías disponibles (las registradas en BD + sugerencias iniciales).
 */
async function obtenerCategoriasDisponibles(dbPool) {
    const [rows] = await dbPool.query(
        'SELECT DISTINCT categoria FROM ai_contexto WHERE categoria IS NOT NULL AND categoria != "" ORDER BY categoria ASC'
    );
    const categoriasBD = rows.map(r => r.categoria);
    
    // Unir sin duplicados preservando mayúsculas/minúsculas
    const setCategorias = new Set([...CATEGORIAS_SUGERIDAS_DEFAULT]);
    categoriasBD.forEach(c => setCategorias.add(c));
    return Array.from(setCategorias);
}

/**
 * Formatea un arreglo de contextos a un bloque de texto enriquecido en Markdown.
 * Preparado para inyectar en prompts de IA en la Fase 2.
 */
function formatearContextoParaPrompt(registros) {
    if (!Array.isArray(registros) || registros.length === 0) return '';
    return registros.map(r => `### [${r.categoria}] ${r.titulo} (v${r.version})\n${r.contenido}`).join('\n\n');
}

module.exports = {
    CATEGORIAS_SUGERIDAS_DEFAULT,
    obtenerContextoIdealita,
    obtenerContextoPorId,
    obtenerCategoriasDisponibles,
    formatearContextoParaPrompt
};
