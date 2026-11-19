/**
 * =============================================================================
 * SUITE DE PRUEBAS AUTOMATIZADAS: ARQUITECTURA DE MOTORES DE IDEAS & MOTOR EXPLORADOR
 * =============================================================================
 */

const assert = require('assert');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { IdeaEngineBase, ExploradorEngine, getEngine, listAvailableEngines } = require('./ideaEngines');

(async () => {
    console.log("================================================================================");
    console.log("SUITE DE PRUEBAS: ARQUITECTURA DE MOTORES DE IDEAS & MOTOR EXPLORADOR");
    console.log("================================================================================\n");

    let totalTests = 0;
    let passedTests = 0;

    function test(name, fn) {
        totalTests++;
        try {
            fn();
            passedTests++;
            console.log(`  [PASS] ${String(totalTests).padStart(2, '0')}. ${name}`);
        } catch (err) {
            console.error(`  [FAIL] ${String(totalTests).padStart(2, '0')}. ${name}`);
            console.error(`         ${err.message}`);
        }
    }

    async function testAsync(name, fn) {
        totalTests++;
        try {
            await fn();
            passedTests++;
            console.log(`  [PASS] ${String(totalTests).padStart(2, '0')}. ${name}`);
        } catch (err) {
            console.error(`  [FAIL] ${String(totalTests).padStart(2, '0')}. ${name}`);
            console.error(`         ${err.message}`);
        }
    }

    const pool = await mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'MYnagualito.5@',
        database: process.env.DB_NAME || 'idealandia_dev',
        waitForConnections: true,
        connectionLimit: 5
    });

    try {
        console.log("--- SECCIÓN 1: ARQUITECTURA BASE Y REGISTRO (IdeaEngineBase) ---");

        test("IdeaEngineBase rechaza configuración sin tipo identificador", () => {
            assert.throws(() => new IdeaEngineBase({}), /identificador único/);
        });

        test("El registro de motores expone getEngine y listAvailableEngines", () => {
            const list = listAvailableEngines();
            assert.ok(Array.isArray(list));
            assert.strictEqual(list.length >= 1, true);
            assert.strictEqual(list[0].type, 'explorador');

            const engine = getEngine('explorador');
            assert.ok(engine instanceof ExploradorEngine);
            assert.strictEqual(getEngine('inexistente'), null);
        });

        test("Validación de contexto identifica campos faltantes", () => {
            const engine = new IdeaEngineBase({ type: 'test', requiredFields: ['problema', 'solucion'] });
            
            // Faltan título y requeridos
            const res1 = engine.validateContext({}, {});
            assert.strictEqual(res1.valid, false);
            assert.ok(res1.missing.includes('idea.titulo'));
            assert.ok(res1.missing.includes('problema'));
            assert.ok(res1.missing.includes('solucion'));

            // Con contexto completo
            const res2 = engine.validateContext(
                { titulo: 'Idea Innovadora' },
                { problema: 'Problema real', solucion: 'Solución viable' }
            );
            assert.strictEqual(res2.valid, true);
            assert.strictEqual(res2.missing.length, 0);
        });

        test("Sanitización de entradas remueve caracteres de control y acota longitud", () => {
            const engine = getEngine('explorador');
            const rawInputs = {
                foco_exploratorio: '   Modelo de negocio circular \x00\x08 con impacto   ',
                numero: 42,
                booleano: true,
                textoLargo: 'a'.repeat(1500)
            };
            const clean = engine.sanitizeInputs(rawInputs);
            assert.strictEqual(clean.foco_exploratorio, 'Modelo de negocio circular  con impacto');
            assert.strictEqual(clean.numero, 42);
            assert.strictEqual(clean.booleano, true);
            assert.strictEqual(clean.textoLargo.length, 1000);
        });

        test("parseAndValidateOutput extrae JSON limpio de bloques Markdown", () => {
            const engine = getEngine('explorador');
            const markdownWrapped = '```json\n{\n  "resumen_ejecutivo": "Excelente potencial",\n  "angulos_no_vistos": []\n}\n```';
            const parsed = engine.parseAndValidateOutput(markdownWrapped);
            assert.strictEqual(parsed.resumen_ejecutivo, 'Excelente potencial');
            assert.ok(Array.isArray(parsed.angulos_no_vistos));
        });

        console.log("\n--- SECCIÓN 2: MOTOR EXPLORADOR (ExploradorEngine) ---");

        test("ExploradorEngine configura instrucciones del sistema y prompt estructurado", () => {
            const engine = getEngine('explorador');
            const sysInst = engine.getSystemInstructions();
            assert.ok(sysInst.includes('Motor Explorador'));
            assert.ok(sysInst.includes('angulos_no_vistos'));
            assert.ok(sysInst.includes('supuestos_cuestionados'));
            assert.ok(sysInst.includes('analogias_externas'));

            const prompt = engine.buildUserPrompt(
                { titulo: 'Taller de Huertos Urbanos', descripcion: 'Espacios verdes colaborativos', estado: 'en_desarrollo', version_actual: 1 },
                { problema: 'Falta de áreas verdes', solucion: 'Módulos hidropónicos comunitarios' },
                { foco_exploratorio: 'Escuelas primarias' }
            );

            assert.ok(prompt.includes('Taller de Huertos Urbanos'));
            assert.ok(prompt.includes('Falta de áreas verdes'));
            assert.ok(prompt.includes('Módulos hidropónicos comunitarios'));
            assert.ok(prompt.includes('Escuelas primarias'));
        });

        test("Esquema de salida garantiza presencia de todas las secciones cognitivas", () => {
            const engine = getEngine('explorador');
            const rawIncompleto = {
                resumen_ejecutivo: 'Síntesis breve.'
                // Faltan arreglos
            };
            const valid = engine.validateStructuredOutput(rawIncompleto);
            assert.ok(Array.isArray(valid.angulos_no_vistos));
            assert.ok(Array.isArray(valid.analogias_externas));
            assert.ok(Array.isArray(valid.supuestos_cuestionados));
            assert.ok(Array.isArray(valid.preguntas_provocadoras));
            assert.ok(Array.isArray(valid.posibles_pivotes));
        });

        console.log("\n--- SECCIÓN 3: INTEGRACIÓN CON BASE DE DATOS Y AUDITORÍA ---");

        let generatedAnalisisId = null;
        const testIdeaId = 3; // Idea #3 de referencia (Venta de servicios de orientación)
        const testUserId = 2; // Efraín

        // Medir baseline previo a la ejecución
        const [initialIdeas] = await pool.execute('SELECT COUNT(*) as c FROM ideas');
        const [initialAnalisis] = await pool.execute('SELECT COUNT(*) as c FROM idea_analisis_ia');

        await testAsync("Ejecución completa con persistencia en idea_analisis_ia e idea_historial", async () => {
            const engine = getEngine('explorador');

            // Simular respuesta válida de Gemini
            const mockOutput = {
                resumen_ejecutivo: 'La orientación vocacional puede expandirse mediante modelos de mentoría inversa y gamificación.',
                angulos_no_vistos: [
                    { titulo: 'Orientación para segundas carreras', descripcion: 'Foco en profesionales de más de 45 años.', impacto_potencial: 'alto' }
                ],
                analogias_externas: [
                    { dominio: 'Biomímesis', analogia: 'Redes de micelio', leccion_aplicable: 'Conectar comunidades de aprendizaje distribuido.' }
                ],
                supuestos_cuestionados: [
                    { supuesto: 'Los usuarios prefieren sesiones individuales 1 a 1', por_que_cuestionarlo: 'Las dinámicas de cohorte aumentan el compromiso.', experimento_sugerido: 'Lanzar un piloto de 5 personas.' }
                ],
                preguntas_provocadoras: [
                    '¿Y si la orientación no fuera un evento puntual sino una suscripción continua?'
                ],
                posibles_pivotes: [
                    { concepto: 'Plataforma B2B para empresas', ventaja_competitiva: 'Mayor ticket promedio y retención.' }
                ]
            };

            const mockAi = {
                models: {
                    generateContent: async () => ({
                        text: () => JSON.stringify(mockOutput)
                    })
                }
            };

            const runResult = await engine.run({
                pool,
                ai: mockAi,
                idea: { id: testIdeaId, titulo: 'Venta de servicios de orientación', version_actual: 1 },
                canvas: { problema: 'Indecisión vocacional', solucion: 'Mentoría guiada' },
                inputs: { foco_exploratorio: 'Segmentos desatendidos' },
                userId: testUserId,
                persist: true
            });

            assert.strictEqual(runResult.success, true);
            assert.strictEqual(runResult.motor, 'explorador');
            assert.ok(runResult.persistence);
            assert.ok(runResult.persistence.analisisId > 0);
            generatedAnalisisId = runResult.persistence.analisisId;

            // Verificar inserción en idea_analisis_ia
            const [rows] = await pool.execute(
                'SELECT id, idea_id, usuario_id, tipo_analisis, resumen, contenido, supuestos_cuestionados, version_idea FROM idea_analisis_ia WHERE id = ?',
                [generatedAnalisisId]
            );
            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0].tipo_analisis, 'explorador');
            assert.strictEqual(rows[0].idea_id, testIdeaId);
            assert.strictEqual(rows[0].usuario_id, testUserId);
            assert.strictEqual(rows[0].version_idea, 1);

            const contenidoDb = typeof rows[0].contenido === 'string' ? JSON.parse(rows[0].contenido) : rows[0].contenido;
            assert.strictEqual(contenidoDb.angulos_no_vistos.length, 1);
            assert.strictEqual(contenidoDb.analogias_externas.length, 1);

            // Verificar registro de auditoría en idea_historial
            const [histRows] = await pool.execute(
                'SELECT id, tipo_evento, descripcion, datos FROM idea_historial WHERE idea_id = ? AND tipo_evento = "analisis_ia" ORDER BY id DESC LIMIT 1',
                [testIdeaId]
            );
            assert.strictEqual(histRows.length, 1);
            assert.ok(histRows[0].descripcion.includes('Motor Explorador'));
            const datosHist = typeof histRows[0].datos === 'string' ? JSON.parse(histRows[0].datos) : histRows[0].datos;
            assert.strictEqual(datosHist.motor, 'explorador');
            assert.strictEqual(datosHist.analisis_id, generatedAnalisisId);
        });

        await testAsync("Limpieza segura de datos de prueba y restablecimiento de integridad", async () => {
            if (generatedAnalisisId) {
                await pool.execute('DELETE FROM idea_analisis_ia WHERE id = ?', [generatedAnalisisId]);
                await pool.execute('DELETE FROM idea_historial WHERE id = ? AND tipo_evento = "analisis_ia"', [testIdeaId]);
            }

            // Verificar conteos
            const [cAnalisis] = await pool.execute('SELECT COUNT(*) as c FROM idea_analisis_ia WHERE id = ?', [generatedAnalisisId]);
            const [cIdeas] = await pool.execute('SELECT COUNT(*) as c FROM ideas');

            assert.strictEqual(cIdeas[0].c, initialIdeas[0].c, 'El número de ideas no debe ser alterado por los motores');
            assert.strictEqual(cAnalisis[0].c, 0, 'No deben quedar análisis temporales huérfanos');
        });

    } finally {
        await pool.end();
    }

    console.log("\n========================================================================");
    console.log(`TOTAL PRUEBAS: ${totalTests} | APROBADAS: ${passedTests} | FALLIDAS: ${totalTests - passedTests}`);
    console.log(`PORCENTAJE DE APROBACIÓN: ${Math.round((passedTests / totalTests) * 100)}%`);
    console.log("========================================================================");

    if (passedTests === totalTests) {
        console.log("\n>>> ARQUITECTURA DE MOTORES Y MOTOR EXPLORADOR VERIFICADOS AL 100% <<<");
        process.exit(0);
    } else {
        process.exit(1);
    }
})();
