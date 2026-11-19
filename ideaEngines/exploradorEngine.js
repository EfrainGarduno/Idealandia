/**
 * =============================================================================
 * MOTOR DE IDEAS 1: MOTOR EXPLORADOR
 * =============================================================================
 * Especialidad cognitiva:
 * - Pensamiento divergente y lateral.
 * - Desafío socrático de supuestos subyacentes.
 * - Identificación de ángulos ciegos y oportunidades no exploradas.
 * - Analogías cross-industria (biomímesis, modelos exponenciales, economía circular).
 * - Preguntas provocadoras y posibles direcciones de pivote.
 *
 * Contrato de salida garantizado: JSON estructurado.
 * Persistencia: `idea_analisis_ia` (tipo_analisis: 'explorador') + `idea_historial`.
 */

const IdeaEngineBase = require('./baseEngine');

class ExploradorEngine extends IdeaEngineBase {
    constructor() {
        super({
            type: 'explorador',
            displayName: 'Motor Explorador',
            description: 'Explora ángulos ocultos, desafía supuestos fundamentales y descubre oportunidades adyacentes mediante pensamiento divergente.',
            requiredFields: ['titulo']
        });
    }

    getSystemInstructions() {
        return `Eres el "Motor Explorador" de Idealandia, un servicio cognitivo de IA especializado en innovación, pensamiento lateral y exploración divergente de Ideas.

Tu rol NO es juzgar ni descartar la Idea, sino expandir su horizonte de posibilidades:
1. Identifica qué ángulos, beneficiarios o problemas derivados no han sido considerados.
2. Cuestiona con rigor socrático los supuestos que el creador da por sentados.
3. Encuentra analogías creativas en otras industrias, en la naturaleza o en la historia que iluminen soluciones novedosas.
4. Formula preguntas provocadoras que obliguen a mirar el problema desde otra perspectiva.
5. Sugiere posibles pivotes o variantes conceptuales.

Debes responder SIEMPRE en formato JSON estrictamente válido, sin texto introductorio ni conclusiones fuera del JSON. El esquema debe ser exactamente:
{
  "resumen_ejecutivo": "string breve de 2 o 3 oraciones sintetizando el potencial exploratorio",
  "angulos_no_vistos": [
    {
      "titulo": "string corto",
      "descripcion": "string explicando el ángulo",
      "impacto_potencial": "alto | medio | estrategico"
    }
  ],
  "analogias_externas": [
    {
      "dominio": "string (ej. Biomímesis, Logística Marítima, Gaming, etc.)",
      "analogia": "string explicando el caso de referencia",
      "leccion_aplicable": "string con la lección concreta para esta Idea"
    }
  ],
  "supuestos_cuestionados": [
    {
      "supuesto": "string con el supuesto tácito que parece asumirse",
      "por_que_cuestionarlo": "string explicando por qué podría ser falso o limitante",
      "experimento_sugerido": "string con una prueba de bajo costo para validarlo o refutarlo"
    }
  ],
  "preguntas_provocadoras": [
    "string con pregunta profunda que desafíe la premisa central"
  ],
  "posibles_pivotes": [
    {
      "concepto": "string con el nombre o resumen del pivote",
      "ventaja_competitiva": "string con la ventaja o diferenciación que aportaría"
    }
  ]
}`;
    }

    buildUserPrompt(idea, canvas, sanitizedInputs) {
        const c = canvas || {};
        let prompt = `ANALIZA LA SIGUIENTE IDEA CON EL MOTOR EXPLORADOR:

[DATOS CENTRALES DE LA IDEA]
- Título: ${idea.titulo || 'Sin título'}
- Descripción: ${idea.descripcion || 'Sin descripción detallada'}
- Estado Oficial Actual: ${idea.estado || 'semilla'}
- Modalidad: ${idea.modalidad || 'individual'}
- Privacidad: ${idea.privacidad || 'privada'}
- Versión Actual: v${idea.version_actual !== undefined ? idea.version_actual : 0}

[CANVAS DE DESARROLLO ACTUAL]
- Problema identificado: ${c.problema || 'No especificado aún'}
- Solución propuesta: ${c.solucion || 'No especificada aún'}
- Beneficiarios objetivo: ${c.beneficiarios || 'No especificados aún'}
- Recursos considerados: ${c.recursos || 'No especificados aún'}
- Inversión estimada: ${c.inversion_estimada ? `${c.inversion_estimada} ${c.moneda || 'MXN'}` : 'No calculada'}
- Complejidad prevista: ${c.complejidad || 'No definida'}
- Potencial previsto: ${c.potencial || 'No definido'}
- Riesgos preliminares: ${c.riesgos || 'No documentados'}
- Notas de trabajo: ${c.notas || 'Sin notas adicionales'}`;

        if (sanitizedInputs && Object.keys(sanitizedInputs).length > 0) {
            prompt += `\n\n[INSTRUCCIONES / ENFOQUE ESPECÍFICO DEL USUARIO]\n`;
            if (sanitizedInputs.foco_exploratorio) {
                prompt += `- Foco específico solicitado: ${sanitizedInputs.foco_exploratorio}\n`;
            }
            if (sanitizedInputs.restriccion_a_romper) {
                prompt += `- Restricción que se desea desafiar: ${sanitizedInputs.restriccion_a_romper}\n`;
            }
            if (sanitizedInputs.pregunta_abierta) {
                prompt += `- Pregunta clave del creador: ${sanitizedInputs.pregunta_abierta}\n`;
            }
        }

        prompt += `\n\nGenera el análisis en el formato JSON requerido respetando todos los campos del esquema.`;
        return prompt;
    }

    validateStructuredOutput(output) {
        if (!output.resumen_ejecutivo || typeof output.resumen_ejecutivo !== 'string') {
            output.resumen_ejecutivo = 'Análisis exploratorio completado.';
        }

        if (!Array.isArray(output.angulos_no_vistos)) {
            output.angulos_no_vistos = [];
        }

        if (!Array.isArray(output.analogias_externas)) {
            output.analogias_externas = [];
        }

        if (!Array.isArray(output.supuestos_cuestionados)) {
            output.supuestos_cuestionados = [];
        }

        if (!Array.isArray(output.preguntas_provocadoras)) {
            output.preguntas_provocadoras = [];
        }

        if (!Array.isArray(output.posibles_pivotes)) {
            output.posibles_pivotes = [];
        }

        return output;
    }
}

module.exports = ExploradorEngine;
