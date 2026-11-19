/**
 * =============================================================================
 * REGISTRO CENTRAL DE MOTORES DE IDEAS
 * =============================================================================
 */

const IdeaEngineBase = require('./baseEngine');
const ExploradorEngine = require('./exploradorEngine');

// Instancia única (singleton) de los motores disponibles
const enginesRegistry = {
    explorador: new ExploradorEngine()
    // Próximos motores a incorporar incrementalmente:
    // madurador: new MaduradorEngine(),
    // validador: new ValidadorEngine(),
    // negocio: new NegocioEngine(),
    // impacto: new ImpactoEngine(),
    // proposito: new PropositoEngine(),
    // conector: new ConectorEngine(),
    // ejecutor: new EjecutorEngine()
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
 * Lista los motores registrados y su metadata.
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
    getEngine,
    listAvailableEngines
};
