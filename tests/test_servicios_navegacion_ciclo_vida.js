/**
 * tests/test_servicios_navegacion_ciclo_vida.js
 * Suite integral de pruebas para la navegación, ciclo de vida y exclusividad mutua
 * de las subvistas del Catálogo de Servicios, Asesoría en Pensiones y Asesorías Financieras (Simulador).
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================================');
console.log('SUITE DE PRUEBAS: NAVEGACIÓN Y EXCLUSIVIDAD DE SUBVISTAS DE SERVICIOS');
console.log('================================================================================\n');

let passCount = 0;
let totalCount = 0;

function test(name, fn) {
    totalCount++;
    try {
        fn();
        passCount++;
        console.log(`✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`❌ [FAIL] ${name}`);
        console.error(err);
        process.exit(1);
    }
}

async function asyncTest(name, fn) {
    totalCount++;
    try {
        await fn();
        passCount++;
        console.log(`✅ [PASS] ${name}`);
    } catch (err) {
        console.error(`❌ [FAIL] ${name}`);
        console.error(err);
        process.exit(1);
    }
}

(async () => {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    const mockMenuResponse = [
        { id: 1, nombre: 'Inicio', parent_id: null, publico: 1, autorizado: true, hijos: [] },
        { id: 2, nombre: 'Ideas', parent_id: null, publico: 1, autorizado: true, hijos: [] },
        {
            id: 3,
            nombre: 'Servicios',
            parent_id: null,
            publico: 1,
            autorizado: true,
            hijos: [
                { id: 16, nombre: 'Asesorías Financieras', parent_id: 3, funcionalidad_id: 9, publico: 1, autorizado: true },
                { id: 17, nombre: 'Asesoría de Pensiones', parent_id: 3, funcionalidad_id: 10, publico: 1, autorizado: true }
            ]
        }
    ];

    function createDOMInstance() {
        const dom = new JSDOM(html, {
            runScripts: 'dangerously',
            url: 'http://localhost/',
            beforeParse(window) {
                window.currentUser = { id: 1, usuario: 'test_user', nombre: 'Usuario Prueba' };
                window.showModal = () => {};
                window.fetch = async (url) => {
                    if (url === '/api/menu') return { ok: true, json: async () => mockMenuResponse };
                    if (url === '/api/me') return { ok: true, json: async () => ({ user: window.currentUser }) };
                    if (url.startsWith('/api/finanzas/simulador')) {
                        return {
                            ok: true,
                            json: async () => ({
                                instituciones: [
                                    { id: 1, nombre: 'NU', tipo: 'B', tipo_proteccion: 'IPAB', limite_proteccion_udis: 400000, nivel_riesgo: 'Bajo', orden: 1, activo: 1 }
                                ],
                                estrategias: [],
                                indicador_udi: { codigo: 'UDI', valor: '8.865882', fecha: '2026-11-24', fuente: 'Banco de México' }
                            })
                        };
                    }
                    return { ok: true, json: async () => ({}) };
                };
            }
        });
        return dom;
    }

    const dom = createDOMInstance();
    const { window } = dom;
    const { document } = window;

    // Cargar simuladorFinanciero.js en el entorno JSDOM
    const simJsCode = fs.readFileSync(path.join(__dirname, '../simuladorFinanciero.js'), 'utf8');
    window.eval(simJsCode);

    // Wait for initial scripts to settle
    await new Promise(r => setTimeout(r, 200));

    const catalogoView = document.getElementById('servicios-catalogo-view');
    const pensionView = document.getElementById('servicios-pension-view');
    const financierasView = document.getElementById('servicios-financieras-view');
    const secServicios = document.getElementById('servicios');

    function assertExclusividadSubvistas(vistaActivaEsperada) {
        const subvistas = [
            { id: 'servicios-catalogo-view', el: catalogoView },
            { id: 'servicios-pension-view', el: pensionView },
            { id: 'servicios-financieras-view', el: financierasView }
        ];

        let visibles = 0;
        subvistas.forEach(sub => {
            if (sub.id === vistaActivaEsperada) {
                assert.strictEqual(sub.el.style.display, 'block', `Subvista esperada activa ${sub.id} debe tener display: block`);
                visibles++;
            } else {
                assert.strictEqual(sub.el.style.display, 'none', `Subvista ${sub.id} debe tener display: none`);
            }
        });
        assert.strictEqual(visibles, 1, 'Exactamente una subvista de servicios debe estar visible a la vez');

        if (vistaActivaEsperada === 'servicios-financieras-view') {
            assert.strictEqual(financierasView.style.display, 'block', 'Simulador debe estar visible');
        } else {
            assert.strictEqual(financierasView.style.display, 'none', 'Simulador debe estar completamente oculto');
        }
    }

    // -------------------------------------------------------------------------
    // PRUEBA 1: Catálogo → Asesorías Financieras (Aparece el simulador)
    // -------------------------------------------------------------------------
    test('Prueba 1: Catálogo → Asesorías Financieras muestra el simulador y oculta las demás', () => {
        window.ejecutarEntradaServicio('asesorias-financieras');
        assert.strictEqual(secServicios.style.display, 'flex');
        assertExclusividadSubvistas('servicios-financieras-view');
    });

    // -------------------------------------------------------------------------
    // PRUEBA 2: Asesorías Financieras → Catálogo (Desaparece completamente el simulador)
    // -------------------------------------------------------------------------
    test('Prueba 2: Asesorías Financieras → Catálogo (vía botón volver y vía menú lateral)', () => {
        // Vía botón volver
        const btnVolverFinancieras = document.getElementById('btn-volver-catalogo-financieras');
        btnVolverFinancieras.click();
        assertExclusividadSubvistas('servicios-catalogo-view');

        // Reingresar a Financieras y luego volver vía clic en "Servicios" en el menú
        window.ejecutarEntradaServicio('asesorias-financieras');
        assertExclusividadSubvistas('servicios-financieras-view');

        const menuServiciosLink = document.getElementById('menu-servicios-link');
        menuServiciosLink.click();
        assertExclusividadSubvistas('servicios-catalogo-view');
    });

    // -------------------------------------------------------------------------
    // PRUEBA 3: Asesorías Financieras → Asesoría en Pensiones (Desaparece completamente el simulador)
    // -------------------------------------------------------------------------
    test('Prueba 3: Asesorías Financieras → Asesoría en Pensiones oculta completamente el simulador', () => {
        // Entrar a Financieras
        window.ejecutarEntradaServicio('asesorias-financieras');
        assertExclusividadSubvistas('servicios-financieras-view');

        // Ir a Pensiones vía submenú
        const pensionSubmenuLink = document.querySelector('a[data-submenu="asesoria-pensiones"]');
        pensionSubmenuLink.click();
        assertExclusividadSubvistas('servicios-pension-view');

        // Entrar de nuevo a Financieras y pasar a Pensiones vía ejecutarEntradaServicio
        window.ejecutarEntradaServicio('asesorias-financieras');
        assertExclusividadSubvistas('servicios-financieras-view');

        window.ejecutarEntradaServicio('asesoria-pensiones');
        assertExclusividadSubvistas('servicios-pension-view');
    });

    // -------------------------------------------------------------------------
    // PRUEBA 4: Catálogo → Asesoría en Pensiones (Nunca aparece el simulador)
    // -------------------------------------------------------------------------
    test('Prueba 4: Catálogo → Asesoría en Pensiones nunca activa el simulador', () => {
        window.mostrarSubvistaServicios('servicios-catalogo-view');
        assertExclusividadSubvistas('servicios-catalogo-view');

        const pensionSubmenuLink = document.querySelector('a[data-submenu="asesoria-pensiones"]');
        pensionSubmenuLink.click();
        assertExclusividadSubvistas('servicios-pension-view');
        assert.strictEqual(financierasView.style.display, 'none');
    });

    // -------------------------------------------------------------------------
    // PRUEBA 5: Pensiones → Asesorías Financieras (Aparece correctamente el simulador)
    // -------------------------------------------------------------------------
    test('Prueba 5: Pensiones → Asesorías Financieras activa el simulador y oculta pensiones', () => {
        window.ejecutarEntradaServicio('asesoria-pensiones');
        assertExclusividadSubvistas('servicios-pension-view');

        const finSubmenuLink = document.querySelector('a[data-submenu="asesorias-financieras"]');
        finSubmenuLink.click();
        assertExclusividadSubvistas('servicios-financieras-view');
    });

    // -------------------------------------------------------------------------
    // PRUEBA 6: Secuencia compuesta: Financieras → Pensiones → Catálogo → Financieras → Catálogo → Pensiones
    // -------------------------------------------------------------------------
    test('Prueba 6: Secuencia compuesta mantiene siempre exclusividad mutua e invariante del simulador', () => {
        // 1. Financieras
        window.ejecutarEntradaServicio('asesorias-financieras');
        assertExclusividadSubvistas('servicios-financieras-view');

        // 2. Pensiones
        document.querySelector('a[data-submenu="asesoria-pensiones"]').click();
        assertExclusividadSubvistas('servicios-pension-view');

        // 3. Catálogo (vía botón volver)
        document.getElementById('btn-volver-catalogo').click();
        assertExclusividadSubvistas('servicios-catalogo-view');

        // 4. Financieras
        document.querySelector('a[data-submenu="asesorias-financieras"]').click();
        assertExclusividadSubvistas('servicios-financieras-view');

        // 5. Catálogo (vía menú principal)
        document.getElementById('menu-servicios-link').click();
        assertExclusividadSubvistas('servicios-catalogo-view');

        // 6. Pensiones
        window.ejecutarEntradaServicio('asesoria-pensiones');
        assertExclusividadSubvistas('servicios-pension-view');
    });

    // -------------------------------------------------------------------------
    // PRUEBA 7: Recargar la página en diferentes vistas y verificar estado limpio
    // -------------------------------------------------------------------------
    test('Prueba 7: Inicialización y recarga de página garantiza estado por defecto limpio sin simulador duplicado', () => {
        const dom2 = createDOMInstance();
        const doc2 = dom2.window.document;

        const secServ2 = doc2.getElementById('servicios');
        const cat2 = doc2.getElementById('servicios-catalogo-view');
        const pen2 = doc2.getElementById('servicios-pension-view');
        const fin2 = doc2.getElementById('servicios-financieras-view');

        // En carga inicial, la sección servicios no está activa o tiene sus subvistas adecuadamente inicializadas
        assert.strictEqual(pen2.style.display, 'none');
        assert.strictEqual(fin2.style.display, 'none');
        assert.strictEqual(doc2.querySelectorAll('#servicios-financieras-view').length, 1, 'Solo existe un contenedor de simulador');
        assert.strictEqual(doc2.querySelectorAll('#simulador-main-table').length, 1, 'Solo existe una tabla de simulador');
    });

    // -------------------------------------------------------------------------
    // PRUEBA 8: Entrar varias veces consecutivamente a Asesorías Financieras y salir de ella
    // -------------------------------------------------------------------------
    test('Prueba 8: Entrar y salir 10 veces consecutivas de Asesorías Financieras no duplica listeners ni tablas', () => {
        const inputInversion = document.getElementById('simulador-inversion-global');
        const mainTable = document.getElementById('simulador-main-table');

        for (let i = 0; i < 10; i++) {
            // Entrar
            window.ejecutarEntradaServicio('asesorias-financieras');
            assertExclusividadSubvistas('servicios-financieras-view');

            // Salir
            document.getElementById('btn-volver-catalogo-financieras').click();
            assertExclusividadSubvistas('servicios-catalogo-view');
        }

        // Verificar guardas de configuración
        assert.strictEqual(inputInversion.dataset.configured, 'true');
        assert.strictEqual(document.querySelectorAll('#simulador-main-table').length, 1, 'No se duplica la tabla');
        assert.strictEqual(document.querySelectorAll('#simulador-tbody').length, 1, 'No se duplica el tbody');
        assert.strictEqual(document.querySelectorAll('#simulador-section-card').length, 0); // clase común, sin duplicaciones por inserción
    });

    // -------------------------------------------------------------------------
    // PRUEBA ADICIONAL: Invariante al navegar a secciones ajenas a Servicios (Inicio, Ideas, etc.)
    // -------------------------------------------------------------------------
    test('Prueba 9: Navegar a secciones ajenas (Inicio, Ideas) y regresar a Servicios inicia limpiamente en Catálogo', () => {
        window.ejecutarEntradaServicio('asesorias-financieras');
        assertExclusividadSubvistas('servicios-financieras-view');

        // Navegar a Ideas
        window.ejecutarEntradaServicio('ideas');
        const secIdeas = document.getElementById('ideas');
        assert.strictEqual(secIdeas.style.display, 'flex');
        assert.strictEqual(secServicios.style.display, 'none');

        // Regresar a Servicios vía menú
        document.getElementById('menu-servicios-link').click();
        assert.strictEqual(secServicios.style.display, 'flex');
        assertExclusividadSubvistas('servicios-catalogo-view');
    });

    console.log('\n================================================================================');
    console.log(`RESULTADO DE LA SUITE: ${passCount} de ${totalCount} PRUEBAS SUPERADAS EXITOSAMENTE`);
    console.log('================================================================================\n');

    process.exit(0);
})();
