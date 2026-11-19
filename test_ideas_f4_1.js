const assert = require('assert');
const server = require('./server.js');

console.log("=== INICIANDO PRUEBAS UNITARIAS: F4.1 ADAPTADOR DE ESTADOS Y MAPEO DESCRIPTIVO ===");

// 1. Verificar exportación de constantes
assert.ok(server.IDEAS_ESTADOS_OFICIALES, "IDEAS_ESTADOS_OFICIALES debe estar exportado");
assert.strictEqual(server.IDEAS_ESTADOS_OFICIALES.length, 7, "Debe contener exactamente 7 estados oficiales");
const expectedOficiales = ['semilla', 'en_desarrollo', 'en_validacion', 'lista', 'en_accion', 'realizada', 'archivada'];
assert.deepStrictEqual([...server.IDEAS_ESTADOS_OFICIALES], expectedOficiales, "Los estados oficiales deben ser exactamente los acordados");
console.log("✓ Constante IDEAS_ESTADOS_OFICIALES verificada (7 estados oficiales).");

// 2. Verificar exportación del mapa legado
assert.ok(server.IDEAS_ESTADOS_LEGADOS_MAP, "IDEAS_ESTADOS_LEGADOS_MAP debe estar exportado");
const expectedLegados = {
    'pendiente': 'semilla',
    'en progreso': 'en_desarrollo',
    'completada': 'realizada',
    'descartada': 'archivada'
};
assert.deepStrictEqual(server.IDEAS_ESTADOS_LEGADOS_MAP, expectedLegados, "El mapa de estados legados debe mapear a oficiales");
console.log("✓ Constante IDEAS_ESTADOS_LEGADOS_MAP verificada (4 estados legados mapeados a oficiales).");

// 3. Probar normalizeIdeaEstado con estados legados (conversión legado -> oficial)
assert.strictEqual(server.normalizeIdeaEstado('pendiente'), 'semilla');
assert.strictEqual(server.normalizeIdeaEstado('en progreso'), 'en_desarrollo');
assert.strictEqual(server.normalizeIdeaEstado('completada'), 'realizada');
assert.strictEqual(server.normalizeIdeaEstado('descartada'), 'archivada');
console.log("✓ normalizeIdeaEstado convierte correctamente todos los estados legados a oficiales.");

// 4. Probar normalizeIdeaEstado con estados oficiales (identidad)
for (const est of expectedOficiales) {
    assert.strictEqual(server.normalizeIdeaEstado(est), est, `Estado oficial '${est}' debe conservarse`);
}
console.log("✓ normalizeIdeaEstado conserva intactos los 7 estados oficiales.");

// 5. Probar tolerancia a mayúsculas y espacios
assert.strictEqual(server.normalizeIdeaEstado('  PENDIENTE  '), 'semilla');
assert.strictEqual(server.normalizeIdeaEstado('En Progreso'), 'en_desarrollo');
assert.strictEqual(server.normalizeIdeaEstado('  SEMILLA '), 'semilla');
assert.strictEqual(server.normalizeIdeaEstado('EN_DESARROLLO'), 'en_desarrollo');
console.log("✓ normalizeIdeaEstado es tolerante a mayúsculas y espacios en blanco.");

// 6. Probar rechazo de estados inválidos
assert.strictEqual(server.normalizeIdeaEstado('invalido'), null);
assert.strictEqual(server.normalizeIdeaEstado(''), null);
assert.strictEqual(server.normalizeIdeaEstado(null), null);
assert.strictEqual(server.normalizeIdeaEstado(undefined), null);
assert.strictEqual(server.normalizeIdeaEstado(123), null);
assert.strictEqual(server.normalizeIdeaEstado({}), null);
console.log("✓ normalizeIdeaEstado rechaza correctamente valores inválidos retornando null.");

// 7. Probar isValidIdeaEstado
assert.strictEqual(server.isValidIdeaEstado('semilla'), true);
assert.strictEqual(server.isValidIdeaEstado('pendiente'), true);
assert.strictEqual(server.isValidIdeaEstado('en progreso'), true);
assert.strictEqual(server.isValidIdeaEstado('en_desarrollo'), true);
assert.strictEqual(server.isValidIdeaEstado('otro_estado'), false);
assert.strictEqual(server.isValidIdeaEstado(''), false);
console.log("✓ isValidIdeaEstado valida adecuadamente estados oficiales y legados.");

// 8. Probar toLegacyIdeaEstado (compatibilidad inversa)
assert.strictEqual(server.toLegacyIdeaEstado('semilla'), 'pendiente');
assert.strictEqual(server.toLegacyIdeaEstado('en_desarrollo'), 'en progreso');
assert.strictEqual(server.toLegacyIdeaEstado('realizada'), 'completada');
assert.strictEqual(server.toLegacyIdeaEstado('archivada'), 'descartada');
console.log("✓ toLegacyIdeaEstado convierte correctamente oficiales a legados.");

console.log("\n=== TODAS LAS PRUEBAS DE F4.1 PASARON EXITOSAMENTE (8/8) ===");
process.exit(0);
