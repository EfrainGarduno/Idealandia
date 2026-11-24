const assert = require('assert');
const mysql = require('mysql2/promise');
const http = require('http');
require('dotenv').config();

const { app } = require('../server.js');
const { getAIContexto, searchAIContexto, searchKnowledge } = require('../knowledgeService.js');

async function runTests() {
    console.log('=== TEST INTEGRAL: MODO PRUEBA CONTROLADA ai_contexto ===\n');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia'
    });

    let server;
    let port;

    try {
        server = app.listen(0);
        port = server.address().port;
        console.log(`✓ Servidor Express iniciado en puerto de prueba ${port}`);

        // Helper para hacer fetch HTTP
        const httpGet = async (path) => {
            const res = await fetch(`http://127.0.0.1:${port}${path}`);
            const data = await res.json();
            return { status: res.status, data };
        };

        // -------------------------------------------------------------
        // 1. Prueba de getAIContexto()
        // -------------------------------------------------------------
        console.log('\n1. Probando getAIContexto(conn)...');
        const contextoCompleto = await getAIContexto(conn);
        assert(typeof contextoCompleto === 'string', 'Debe retornar un string');
        assert(contextoCompleto.length > 0, 'El contexto no debe estar vacío');
        assert(contextoCompleto.includes('Idealandia'), 'Debe incluir categoría Idealandia');
        assert(contextoCompleto.includes('Finanzas'), 'Debe incluir categoría Finanzas');
        assert(contextoCompleto.includes('Reglas'), 'Debe incluir categoría Reglas');
        console.log('✓ getAIContexto() retornó exitosamente todo el conocimiento activo de ai_contexto.');

        // -------------------------------------------------------------
        // 2. Prueba de searchAIContexto()
        // -------------------------------------------------------------
        console.log('\n2. Probando searchAIContexto(conn, query)...');
        const matchFinanzas = await searchAIContexto(conn, 'finanzas', new Set(), null);
        assert(matchFinanzas !== null, 'Debe encontrar coincidencia para finanzas');
        assert(matchFinanzas.toLowerCase().includes('simulador') || matchFinanzas.toLowerCase().includes('finanzas'), 'Debe contener contenido relevante de finanzas');
        console.log('✓ searchAIContexto("finanzas") encontró registros relevantes.');

        const matchReglas = await searchAIContexto(conn, 'regla de oro', new Set(), null);
        assert(matchReglas !== null, 'Debe encontrar coincidencia para regla de oro');
        assert(matchReglas.includes('Regla de Oro'), 'Debe contener la regla de oro');
        console.log('✓ searchAIContexto("regla de oro") encontró registros relevantes.');

        const matchInexistente = await searchAIContexto(conn, 'palabra_totalmente_inexistente_xyz_987', new Set(), null);
        assert.strictEqual(matchInexistente, null, 'No debe encontrar coincidencia para texto inexistente');
        console.log('✓ searchAIContexto() retorna null cuando no hay coincidencias.');

        // -------------------------------------------------------------
        // 3. Prueba de endpoint GET /api/ai/contexto-activo
        // -------------------------------------------------------------
        console.log('\n3. Probando endpoint GET /api/ai/contexto-activo (utilizado por Gemini Live)...');
        const resContexto = await httpGet('/api/ai/contexto-activo');
        assert.strictEqual(resContexto.status, 200, 'HTTP Status debe ser 200');
        assert.strictEqual(resContexto.data.ok, true, 'ok debe ser true');
        assert(typeof resContexto.data.contexto === 'string', 'contexto debe ser string');
        assert(resContexto.data.contexto.includes('Simulador de Inversiones'), 'Debe incluir Simulador de Inversiones');
        console.log('✓ Endpoint /api/ai/contexto-activo responde 200 con el contexto formateado.');

        // -------------------------------------------------------------
        // 4. Prueba de endpoint GET /api/knowledge?query=...
        // -------------------------------------------------------------
        console.log('\n4. Probando endpoint GET /api/knowledge?query=finanzas (utilizado por consultar_documentacion)...');
        const resKnowledge = await httpGet('/api/knowledge?query=finanzas');
        assert.strictEqual(resKnowledge.status, 200, 'HTTP Status debe ser 200');
        assert(resKnowledge.data.result.includes('[Fuente: Contexto de Idealandia (MySQL ai_contexto)]'), 'La fuente debe ser MySQL ai_contexto');
        assert(resKnowledge.data.result.includes('Simulador'), 'Debe contener el contenido del simulador');
        console.log('✓ Endpoint /api/knowledge resolvió exitosamente desde ai_contexto.');

        // -------------------------------------------------------------
        // 5. Prueba de tiempo real (Requisito 12)
        // -------------------------------------------------------------
        console.log('\n5. Probando actualización en TIEMPO REAL sin reiniciar servidor ni modificar código...');
        const [origRows] = await conn.query('SELECT contenido FROM ai_contexto WHERE id = 3');
        const originalContent = origRows[0].contenido;
        const testToken = `TOKEN_TEST_TIEMPO_REAL_${Date.now()}`;

        // Modificar registro id 3
        await conn.query('UPDATE ai_contexto SET contenido = ? WHERE id = 3', [`${originalContent}\n${testToken}`]);

        // Consultar de inmediato sin reiniciar
        const resKnowledgeRT = await httpGet('/api/knowledge?query=finanzas');
        assert(resKnowledgeRT.data.result.includes(testToken), 'Debe reflejar inmediatamente el contenido actualizado de la base de datos');
        
        const resContextoRT = await httpGet('/api/ai/contexto-activo');
        assert(resContextoRT.data.contexto.includes(testToken), 'El endpoint de contexto Live debe reflejar de inmediato el cambio');
        console.log(`✓ Actualización en tiempo real comprobada exitosamente (${testToken} detectado en la respuesta inmediata).`);

        // Restaurar contenido original
        await conn.query('UPDATE ai_contexto SET contenido = ? WHERE id = 3', [originalContent]);
        console.log('✓ Contenido original restaurado en ai_contexto.');

        // -------------------------------------------------------------
        // 6. Prueba con registro inactivo (Requisito 13)
        // -------------------------------------------------------------
        console.log('\n6. Probando comportamiento con registro inactivo (activo = 0)...');
        // Desactivar id 3
        await conn.query('UPDATE ai_contexto SET activo = 0 WHERE id = 3');

        const resContextoInactivo = await httpGet('/api/ai/contexto-activo');
        assert(!resContextoInactivo.data.contexto.includes('Simulador de Inversiones y Rendimientos'), 'No debe incluir el título del registro desactivado');
        assert(!resContextoInactivo.data.contexto.includes('El simulador financiero de Idealandia permite comparar'), 'No debe incluir el contenido desactivado');

        const matchDesactivado = await searchAIContexto(conn, 'Simulador de Inversiones', new Set(), null);
        if (matchDesactivado) {
            assert(!matchDesactivado.includes('Simulador de Inversiones y Rendimientos'), 'No debe incluir el registro desactivado en las coincidencias');
            assert(!matchDesactivado.includes('El simulador financiero de Idealandia'), 'No debe incluir el contenido del registro desactivado');
        }
        console.log('✓ Con activo = 0, el registro deja de utilizarse tanto en contexto general como en búsqueda.');

        // Reactivar id 3
        await conn.query('UPDATE ai_contexto SET activo = 1 WHERE id = 3');
        const resContextoReactivado = await httpGet('/api/ai/contexto-activo');
        assert(resContextoReactivado.data.contexto.includes('Simulador de Inversiones y Rendimientos'), 'Debe volver a incluir el registro reactivado');
        console.log('✓ Con activo = 1, el registro vuelve a estar disponible inmediatamente.');

        console.log('\n=============================================================');
        console.log('¡TODAS LAS PRUEBAS DE INTEGRACIÓN DE ai_contexto PASARON (100%)!');
        console.log('=============================================================\n');

        process.exit(0);
    } catch (err) {
        console.error('Error durante las pruebas:', err);
        process.exit(1);
    } finally {
        if (conn) {
            try {
                await conn.query('UPDATE ai_contexto SET activo = 1 WHERE id = 3');
            } catch (e) {}
            await conn.end();
        }
        if (server) server.close();
    }
}

runTests();
