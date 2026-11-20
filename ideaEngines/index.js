/**
 * =============================================================================
 * REGISTRO CENTRAL DE MOTORES DE IDEAS (8 MOTORES OFICIALES)
 * =============================================================================
 * 
 * 1. Explorador - Posibilidades, ángulos no vistos, analogías y pivotes.
 * 2. Madurador - Profundidad, claridad, completitud y propuesta de valor.
 * 3. Validador - Hipótesis críticas, riesgos y experimentos de validación.
 * 4. Negocio - Viabilidad económica, monetización y estructura de costos.
 * 5. Impacto - Beneficiarios, transformación social/ambiental e indicadores.
 * 6. Propósito - Intención ética, valores y alineación de sentido.
 * 7. Conector - Colaboradores, alianzas estratégicas y sinergias en red.
 * 8. Ejecutor - Plan primeros 7 días, hitos 30-60-90 días y primera acción hoy.
 */

const IdeaEngineBase = require('./baseEngine');
const ExploradorEngine = require('./exploradorEngine');
const MaduradorEngine = require('./maduradorEngine');
const ValidadorEngine = require('./validadorEngine');
const NegocioEngine = require('./negocioEngine');
const ImpactoEngine = require('./impactoEngine');
const PropositoEngine = require('./propositoEngine');
const ConectorEngine = require('./conectorEngine');
const EjecutorEngine = require('./ejecutorEngine');

// Instancia única (singleton) de los 8 motores oficiales de Idealandia
const enginesRegistry = {
    explorador: new ExploradorEngine(),
    madurador: new MaduradorEngine(),
    validador: new ValidadorEngine(),
    negocio: new NegocioEngine(),
    impacto: new ImpactoEngine(),
    proposito: new PropositoEngine(),
    conector: new ConectorEngine(),
    ejecutor: new EjecutorEngine()
};

/**
 * Obtiene un motor por su clave identificadora.
 * @param {string} type
 * @returns {IdeaEngineBase|null}
 */
function getEngine(type) {
    if (!type) return null;
    return enginesRegistry[String(type).toLowerCase().trim()] || null;
}

/**
 * Lista los 8 motores registrados y su metadata oficial.
 * @returns {Array<{ type: string, displayName: string, description: string }>}
 */
function listAvailableEngines() {
    return Object.values(enginesRegistry).map(engine => ({
        type: engine.type,
        displayName: engine.displayName,
        description: engine.description
    }));
}

module.exports = {
    IdeaEngineBase,
    ExploradorEngine,
    MaduradorEngine,
    ValidadorEngine,
    NegocioEngine,
    ImpactoEngine,
    PropositoEngine,
    ConectorEngine,
    EjecutorEngine,
    getEngine,
    listAvailableEngines
};
