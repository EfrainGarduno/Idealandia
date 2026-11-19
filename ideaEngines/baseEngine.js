/**
 * =============================================================================
 * ARQUITECTURA BASE: IDEA ENGINE BASE (MOTOR DE IDEAS)
 * =============================================================================
 * Clase base abstracta reutilizable para los 8 motores conceptuales de Idealandia:
 * 1. Explorador
 * 2. Madurador
 * 3. Validador
 * 4. Negocio
 * 5. Impacto
 * 6. Propósito
 * 7. Conector
 * 8. Ejecutor
 *
 * Principios:
 * - Desacopla la lógica cognitiva de los controladores HTTP.
 * - Garantiza tipado y validación de salida estructurada JSON.
 * - Integra persistencia estándar en `idea_analisis_ia` y auditoría en `idea_historial`.
 * - No muta destructivamente la Idea ni el Canvas.
 */

class IdeaEngineBase {
    /**
     * @param {Object} config
     * @param {string} config.type - Clave del motor (ej. 'explorador')
     * @param {string} config.displayName - Nombre legible (ej. 'Motor Explorador')
     * @param {string} config.description - Propósito del motor
     * @param {string[]} config.requiredFields - Campos requeridos del Canvas/Idea
     */
    constructor(config) {
        if (!config || !config.type) {
            throw new Error('Todo motor debe definir un tipo identificador único.');
        }
        this.type = config.type;
        this.displayName = config.displayName || config.type;
        this.description = config.description || '';
        this.requiredFields = config.requiredFields || [];
    }

    /**
     * Valida que la Idea y el Canvas cuenten con la información mínima requerida.
     * @param {Object} idea - Registro de la tabla `ideas`
     * @param {Object} canvas - Registro de la tabla `idea_desarrollo`
     * @returns {{ valid: boolean, missing: string[] }}
     */
    validateContext(idea, canvas) {
        const missing = [];
        if (!idea || !idea.titulo) {
            missing.push('idea.titulo');
        }

        const merged = { ...idea, ...(canvas || {}) };
        for (const field of this.requiredFields) {
            const val = merged[field];
            if (val === undefined || val === null || String(val).trim() === '') {
                missing.push(field);
            }
        }

        return {
            valid: missing.length === 0,
            missing
        };
    }

    /**
     * Sanitiza entradas libres del usuario para evitar inyecciones de prompts o datos sensibles.
     * @param {Object} inputs
     * @returns {Object}
     */
    sanitizeInputs(inputs) {
        if (!inputs || typeof inputs !== 'object') return {};
        const clean = {};
        for (const [key, value] of Object.entries(inputs)) {
            if (typeof value === 'string') {
                // Eliminar caracteres de control y acotar longitud
                clean[key] = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, 1000);
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                clean[key] = value;
            }
        }
        return clean;
    }

    /**
     * Genera las instrucciones de sistema (System Instructions) para Gemini.
     * Debe ser sobreescrito por cada motor concreto.
     * @returns {string}
     */
    getSystemInstructions() {
        throw new Error(`El motor ${this.type} debe implementar getSystemInstructions().`);
    }

    /**
     * Construye el contenido del prompt con la Idea, el Canvas y las entradas sanitizadas.
     * Debe ser sobreescrito por cada motor concreto.
     * @param {Object} idea
     * @param {Object} canvas
     * @param {Object} sanitizedInputs
     * @returns {string}
     */
    buildUserPrompt(idea, canvas, sanitizedInputs) {
        throw new Error(`El motor ${this.type} debe implementar buildUserPrompt().`);
    }

    /**
     * Valida y normaliza la salida JSON generada por el LLM contra el contrato del motor.
     * @param {string|Object} rawOutput
     * @returns {Object}
     */
    parseAndValidateOutput(rawOutput) {
        let parsed = rawOutput;
        if (typeof rawOutput === 'string') {
            let cleaned = rawOutput.trim();
            // Limpiar bloques de código markdown ```json ... ``` si están presentes
            if (cleaned.startsWith('```json')) {
                cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
            } else if (cleaned.startsWith('```')) {
                cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            try {
                parsed = JSON.parse(cleaned);
            } catch (err) {
                throw new Error(`Error al parsear respuesta JSON del motor ${this.type}: ${err.message}`);
            }
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error(`La salida del motor ${this.type} debe ser un objeto estructurado.`);
        }

        return this.validateStructuredOutput(parsed);
    }

    /**
     * Validación específica de esquema según cada motor.
     * @param {Object} output
     * @returns {Object}
     */
    validateStructuredOutput(output) {
        // Implementación básica por defecto; los motores concretos deben especializarlo
        return output;
    }

    /**
     * Persiste el análisis estructurado en `idea_analisis_ia` y registra el evento en `idea_historial`.
     * @param {Object} pool - Pool de conexiones MySQL
     * @param {number} ideaId - ID de la Idea
     * @param {number} userId - ID del usuario que ejecuta
     * @param {Object} parsedOutput - Resultado JSON ya validado
     * @param {number} versionIdea - Versión formal de la Idea al momento del análisis
     * @returns {Promise<{ analisisId: number, fecha: Date }>}
     */
    async persistAnalysis(pool, ideaId, userId, parsedOutput, versionIdea = 0) {
        const resumen = parsedOutput.resumen_ejecutivo || parsedOutput.resumen || `${this.displayName} completado con éxito.`;
        const supuestos = parsedOutput.supuestos_cuestionados || null;

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Insertar en idea_analisis_ia
            const [insertResult] = await connection.execute(
                `INSERT INTO idea_analisis_ia (
                    idea_id, usuario_id, tipo_analisis, resumen, contenido, supuestos_cuestionados, version_idea, fecha
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    ideaId,
                    userId,
                    this.type,
                    resumen,
                    JSON.stringify(parsedOutput),
                    supuestos ? JSON.stringify(supuestos) : null,
                    versionIdea
                ]
            );

            const analisisId = insertResult.insertId;

            // 2. Registrar evento en idea_historial
            const datosHistorial = {
                motor: this.type,
                motor_nombre: this.displayName,
                analisis_id: analisisId,
                resumen: resumen.slice(0, 200)
            };

            await connection.execute(
                `INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos, fecha)
                 VALUES (?, ?, 'analisis_ia', ?, ?, NOW())`,
                [
                    ideaId,
                    userId,
                    `Análisis ejecutado con ${this.displayName}`,
                    JSON.stringify(datosHistorial)
                ]
            );

            await connection.commit();
            return {
                analisisId,
                resumen,
                fecha: new Date()
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }

    /**
     * Flujo completo de ejecución del motor.
     * @param {Object} params
     * @param {Object} params.pool - Pool MySQL
     * @param {Object} params.ai - Cliente Gemini (GoogleGenAI)
     * @param {Object} params.idea - Datos de la Idea
     * @param {Object} params.canvas - Datos del Canvas
     * @param {Object} [params.inputs] - Parámetros adicionales
     * @param {number} params.userId - Usuario ejecutor
     * @param {boolean} [params.persist=true] - Si debe guardar en BD
     * @returns {Promise<{ success: boolean, output: Object, persistence?: Object }>}
     */
    async run({ pool, ai, idea, canvas, inputs = {}, userId, persist = true }) {
        // 1. Validar contexto mínimo
        const valContext = this.validateContext(idea, canvas);
        if (!valContext.valid) {
            throw new Error(`Contexto insuficiente para ejecutar ${this.displayName}. Campos requeridos faltantes: ${valContext.missing.join(', ')}`);
        }

        // 2. Sanitizar entradas
        const cleanInputs = this.sanitizeInputs(inputs);

        // 3. Preparar prompt e instrucciones
        const systemInstruction = this.getSystemInstructions();
        const userPrompt = this.buildUserPrompt(idea, canvas, cleanInputs);

        // 4. Invocar modelo con Gemini
        let rawText = '';
        if (ai && ai.models && typeof ai.models.generateContent === 'function') {
            const response = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json'
                }
            });
            rawText = response.text ? (typeof response.text === 'function' ? response.text() : response.text) : '';
        } else {
            throw new Error('Cliente de IA (ai.models.generateContent) no disponible.');
        }

        // 5. Parsear y validar contrato estructurado
        const validatedOutput = this.parseAndValidateOutput(rawText);

        // 6. Persistir si se solicita
        let persistence = null;
        if (persist && pool && idea && idea.id && userId) {
            persistence = await this.persistAnalysis(pool, idea.id, userId, validatedOutput, idea.version_actual || 0);
        }

        return {
            success: true,
            motor: this.type,
            output: validatedOutput,
            persistence
        };
    }
}

module.exports = IdeaEngineBase;
