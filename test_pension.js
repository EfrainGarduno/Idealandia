const { calculateIMSSLey73Pension } = require('./pension.js');

function assertClose(actual, expected, tolerance = 0.01) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`Expected ${expected} but got ${actual} (difference ${Math.abs(actual - expected)} > ${tolerance})`);
    }
}

try {
    // 19. PRUEBA CRÍTICA (Reference Data)
    const testReference = calculateIMSSLey73Pension({
        salarioMinimo: 249,
        salarioDiarioPromedio: 2585,
        semanasCotizadas: 1615,
        edad: 61,
        tieneEsposa: true,
        numeroHijos: 0,
        tienePadresDependientes: false,
        estaEnSoledad: false,
        tieneIncapacidad: false
    });

    console.log("PRUEBA CRÍTICA: ", testReference.pensionFinalMensual);
    assertClose(testReference.vecesSalarioMinimo, 10.38);
    assertClose(testReference.incrementosCompletos, 21);
    assertClose(testReference.semanasPendientes, 23);
    assertClose(testReference.incrementoAdicional, 0.5);
    assertClose(testReference.incrementosTotales, 21.5);
    assertClose(testReference.porcentajeEdad, 0.80);
    assertClose(testReference.porcentajeAsignaciones, 0.15); // Esposa
    assertClose(testReference.pensionFinalMensual, 52733.07, 1);

    // Other permutations tests
    // Edad
    const d = {
        salarioMinimo: 249,
        salarioDiarioPromedio: 2585,
        semanasCotizadas: 1615,
        tieneEsposa: false,
        numeroHijos: 0,
        tienePadresDependientes: false,
        estaEnSoledad: false,
        tieneIncapacidad: false
    };

    assertClose(calculateIMSSLey73Pension({...d, edad: 60}).porcentajeEdad, 0.75);
    assertClose(calculateIMSSLey73Pension({...d, edad: 62}).porcentajeEdad, 0.85);
    assertClose(calculateIMSSLey73Pension({...d, edad: 63}).porcentajeEdad, 0.90);
    assertClose(calculateIMSSLey73Pension({...d, edad: 64}).porcentajeEdad, 0.95);
    assertClose(calculateIMSSLey73Pension({...d, edad: 65}).porcentajeEdad, 1.00);

    // Semanas boundaries
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, semanasCotizadas: 500}).incrementosTotales, 0); // 500 - 500 = 0
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, semanasCotizadas: 512}).incrementosTotales, 0); // 12 pendientes = 0 adicional
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, semanasCotizadas: 513}).incrementosTotales, 0.5); // 13 pendientes = 0.5 adicional
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, semanasCotizadas: 526}).incrementosTotales, 0.5); // 26 pendientes = 0.5 adicional
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, semanasCotizadas: 527}).incrementosTotales, 1.0); // 27 pendientes = 1.0 adicional

    // Assignations
    const baseTest = calculateIMSSLey73Pension({...d, edad: 65});
    assertClose(baseTest.porcentajeAsignaciones, 0); // No assignation default

    // Con esposa
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, tieneEsposa: true}).porcentajeAsignaciones, 0.15);

    // Con hijos (2 hijos)
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, numeroHijos: 2}).porcentajeAsignaciones, 0.20);

    // Con padres
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, tienePadresDependientes: true}).porcentajeAsignaciones, 0.10);

    // Con soledad
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, estaEnSoledad: true}).porcentajeAsignaciones, 0.15);

    // Con incapacidad
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, tieneIncapacidad: true}).porcentajeAsignaciones, 0.20);

    // Combinations (Esposa + 1 hijo = 25%)
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, tieneEsposa: true, numeroHijos: 1}).porcentajeAsignaciones, 0.25);

    // Invalid combinations validation: Si hay esposa, no aplica padres ni soledad
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, tieneEsposa: true, tienePadresDependientes: true, estaEnSoledad: true}).porcentajeAsignaciones, 0.15);

    // Invalid combinations validation: Si hay hijos, no aplica padres ni soledad
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, numeroHijos: 1, tienePadresDependientes: true, estaEnSoledad: true}).porcentajeAsignaciones, 0.10);

    // Combinations (Esposa + incapacidad = 35%)
    assertClose(calculateIMSSLey73Pension({...d, edad: 65, tieneEsposa: true, tieneIncapacidad: true}).porcentajeAsignaciones, 0.35);

    console.log("All pension tests passed successfully!");
} catch (error) {
    console.error("Test failed: ", error);
    process.exit(1);
}
