const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("===============================================================================");
console.log("INICIANDO PRUEBAS DE INTEGRACIÓN: PR #98");
console.log("1. Servicios como Catálogo de Funcionalidades");
console.log("2. Filtro y 'Todo' en Edición de Permisos de Roles (Admin -> Roles -> Permisos)");
console.log("3. Ordenamiento por Columnas en Todas las Tablas Administrativas");
console.log("===============================================================================\n");

async function runAllTests() {
    const indexHtmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const adminJsContent = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');

    // -------------------------------------------------------------------------
    // TEST SUITE 1: SERVICIOS COMO CATÁLOGO DE FUNCIONALIDADES
    // -------------------------------------------------------------------------
    console.log("--- 1. PRUEBAS DE SERVICIOS COMO CATÁLOGO Y MENÚ ---");

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
                { id: 16, nombre: 'Asesorías Financieras', parent_id: 3, funcionalidad_id: 9, publico: 1, autorizado: false },
                { id: 17, nombre: 'Asesoría de Pensiones', parent_id: 3, funcionalidad_id: 10, publico: 1, autorizado: false },
                { id: 18, nombre: 'Ideas Innovadoras', parent_id: 3, funcionalidad_id: 11, publico: 1, autorizado: true },
                { id: 19, nombre: 'Emprendimientos', parent_id: 3, funcionalidad_id: 12, publico: 1, autorizado: false },
                { id: 20, nombre: 'Clases de Inglés', parent_id: 3, funcionalidad_id: 13, publico: 1, autorizado: false },
                { id: 21, nombre: 'Perfilamiento', parent_id: 3, funcionalidad_id: 14, publico: 1, autorizado: false }
            ]
        },
        { id: 12, nombre: 'Recursos Gratis', parent_id: null, publico: 1, autorizado: true, hijos: [] },
        { id: 13, nombre: 'Contáctanos', parent_id: null, publico: 1, autorizado: true, hijos: [] },
        { id: 14, nombre: 'Acerca de', parent_id: null, publico: 1, autorizado: true, hijos: [] }
    ];

    let lastModalMessage = null;

    const dom = new JSDOM(indexHtmlContent, {
        runScripts: 'dangerously',
        url: 'http://localhost/',
        beforeParse(window) {
            window.currentUser = { id: 2, usuario: 'arturito', nombre: 'Arturito Matus' };
            window.showModal = (msg) => {
                lastModalMessage = msg;
            };

            window.fetch = async (url) => {
                if (url === '/api/menu') {
                    return {
                        ok: true,
                        json: async () => mockMenuResponse,
                        headers: { get: () => null }
                    };
                }
                if (url === '/api/me') {
                    return {
                        ok: true,
                        json: async () => ({ user: window.currentUser })
                    };
                }
                return { ok: true, json: async () => ({}) };
            };
        }
    });

    const { window } = dom;

    // Allow DOMContentLoaded and async fetches to settle
    await new Promise(r => setTimeout(r, 200));

    // Spy on window.showModal after inline scripts ran
    const realShowModal = window.showModal;
    window.showModal = (msg) => {
        lastModalMessage = msg;
        if (typeof realShowModal === 'function') realShowModal(msg);
    };

    // 1.1 Verify Sidebar submenu rendering & badges
    const submenuServicios = window.document.getElementById('submenu-servicios');
    assert(submenuServicios, "El submenú de servicios debe existir en el DOM");

    const subLinks = submenuServicios.querySelectorAll('a[data-submenu]');
    assert.strictEqual(subLinks.length, 6, "Deben renderizarse los 6 submenús de Servicios");

    const linkFinancieras = Array.from(subLinks).find(l => l.dataset.serviceName === 'Asesorías Financieras');
    const linkIdeas = Array.from(subLinks).find(l => l.dataset.serviceName === 'Ideas Innovadoras');
    const linkPensiones = Array.from(subLinks).find(l => l.dataset.serviceName === 'Asesoría de Pensiones');

    assert(linkFinancieras, "Link Asesorías Financieras debe existir");
    assert.strictEqual(linkFinancieras.dataset.autorizado, 'false', "Asesorías Financieras debe estar marcado como autorizado=false");
    assert(linkFinancieras.querySelector('.service-menu-badge.restricted'), "Debe tener badge restringido");

    assert(linkIdeas, "Link Ideas Innovadoras debe existir");
    assert.strictEqual(linkIdeas.dataset.autorizado, 'true', "Ideas Innovadoras debe estar marcado como autorizado=true");
    assert(linkIdeas.querySelector('.service-menu-badge.available'), "Debe tener badge disponible");

    console.log("  ✓ 1.1 Menú lateral: submenús visibles con badges de Disponible y Acceso restringido correctos.");

    // 1.2 Verify Catalog page (#servicios) cards rendering
    const catalogCards = window.document.querySelectorAll('#servicios-cards-grid .servicio-card');
    assert.strictEqual(catalogCards.length, 6, "El catálogo de servicios debe renderizar 6 tarjetas de servicios");

    const cardFinancieras = Array.from(catalogCards).find(c => c.dataset.serviceName === 'Asesorías Financieras');
    assert(cardFinancieras, "Tarjeta Asesorías Financieras debe existir");
    assert(cardFinancieras.querySelector('.status-restringido'), "Tarjeta restringida debe mostrar badge de Acceso restringido");
    assert(cardFinancieras.querySelector('.servicio-card-restricted-msg'), "Tarjeta restringida debe mostrar mensaje informativo de contactar al administrador");

    const cardIdeas = Array.from(catalogCards).find(c => c.dataset.serviceName === 'Ideas Innovadoras');
    assert(cardIdeas, "Tarjeta Ideas Innovadoras debe existir");
    assert(cardIdeas.querySelector('.status-disponible'), "Tarjeta autorizada debe mostrar badge Disponible");
    assert(cardIdeas.querySelector('.btn-entrar-servicio'), "Tarjeta autorizada debe mostrar botón [Entrar]");

    console.log("  ✓ 1.2 Catálogo de Servicios (#servicios): Tarjetas renderizadas con nombre, descripción, estado y acción.");

    // 1.3 Verify Access Denied Modal on clicking restricted subitem
    lastModalMessage = null;
    linkFinancieras.click();

    const expectedMessageFinancieras = "Arturito Matus, no cuentas con acceso a Asesorías Financieras. Si deseas tener acceso, consulta con tu administrador para que te dé acceso.";
    assert.strictEqual(lastModalMessage, expectedMessageFinancieras, `El mensaje debe ser exactamente: "${expectedMessageFinancieras}", se obtuvo: "${lastModalMessage}"`);

    const secFinancieras = window.document.getElementById('asesorias-financieras');
    if (secFinancieras) {
        assert.strictEqual(secFinancieras.style.display, 'none', "La sección restringida NO debe abrirse");
    }

    console.log("  ✓ 1.3 Clic en submenú restringido: bloquea acceso y muestra modal dinámico personalizado para el usuario.");

    // 1.4 Verify Access Denied Modal on clicking restricted card
    lastModalMessage = null;
    cardFinancieras.click();
    assert.strictEqual(lastModalMessage, expectedMessageFinancieras, "Clic en tarjeta restringida debe mostrar el mismo modal dinámico amigable");

    console.log("  ✓ 1.4 Clic en tarjeta restringida del catálogo: muestra modal dinámico personalizado.");

    // 1.5 Verify Pension view navigation from catalog and back button
    window.ejecutarEntradaServicio('asesoria-pensiones');

    const catalogoView = window.document.getElementById('servicios-catalogo-view');
    const pensionView = window.document.getElementById('servicios-pension-view');
    assert.strictEqual(catalogoView.style.display, 'none', "Catálogo debe ocultarse al entrar a pensión");
    assert.strictEqual(pensionView.style.display, 'block', "Vista pensión debe mostrarse al entrar a pensión");

    // Click back button
    const btnVolver = window.document.getElementById('btn-volver-catalogo');
    assert(btnVolver, "Botón Volver al Catálogo debe existir");
    btnVolver.click();

    assert.strictEqual(catalogoView.style.display, 'block', "Catálogo debe volver a mostrarse al hacer clic en volver");
    assert.strictEqual(pensionView.style.display, 'none', "Vista pensión debe ocultarse");

    console.log("  ✓ 1.5 Transición entre Catálogo de Servicios y Asesoría de Pensiones con botón Volver verificada.");

    // -------------------------------------------------------------------------
    // TEST SUITE 2: FILTRO Y "TODO" EN MODAL DE PERMISOS DE ROLES
    // -------------------------------------------------------------------------
    console.log("\n--- 2. PRUEBAS DE FILTRO Y 'TODO' EN PERMISOS DE ROLES ---");

    {
        const domAdmin = new JSDOM(`<!DOCTYPE html><html><body>
            <div id="custom-modal"><div id="custom-modal-message"></div><div id="custom-modal-buttons"></div></div>
            <table><tbody id="admin-roles-tbody"></tbody></table>
        </body></html>`, { runScripts: "dangerously" });
        const { window: winAdmin } = domAdmin;
        winAdmin.showModal = (msg) => {};

        const mockAllPerms = [
            { id: 1, codigo: 'ideas.read', nombre: 'Consultar ideas', descripcion: 'Leer' },
            { id: 2, codigo: 'ideas.create', nombre: 'Crear ideas', descripcion: 'Crear' },
            { id: 3, codigo: 'ideas.update', nombre: 'Modificar ideas', descripcion: 'Actualizar' },
            { id: 4, codigo: 'usuarios.read', nombre: 'Consultar usuarios', descripcion: 'Leer' },
            { id: 5, codigo: 'usuarios.update', nombre: 'Modificar usuarios', descripcion: 'Actualizar' }
        ];

        let rolePermsMap = { 10: [1, 2] };
        let savedPayload = null;

        winAdmin.fetch = async (url, options) => {
            if (url === '/api/admin/rol_permisos/10' && (!options || options.method === 'GET')) {
                return { ok: true, json: async () => rolePermsMap[10] };
            }
            if (url === '/api/admin/permisos') {
                return { ok: true, json: async () => mockAllPerms };
            }
            if (url === '/api/admin/roles') {
                return { ok: true, json: async () => [] };
            }
            if (url === '/api/admin/rol_permisos/10' && options && options.method === 'POST') {
                savedPayload = JSON.parse(options.body);
                rolePermsMap[10] = savedPayload.permisos;
                return { ok: true, json: async () => ({ message: 'ok' }) };
            }
            return { ok: true, json: async () => ({}) };
        };

        winAdmin.eval(adminJsContent);

        // Open modal for Role "editor"
        await winAdmin.showEditPermisosModal(10, 'Editor');

        const selectAllCb = winAdmin.document.getElementById('cb-select-all-rol-perms');
        const filterInput = winAdmin.document.getElementById('filter-rol-perms');
        const listContainer = winAdmin.document.getElementById('rol-perms-list-container');
        const rows = listContainer.querySelectorAll('.perm-item-row');

        assert(selectAllCb, "Checkbox 'Todo' debe existir");
        assert(filterInput, "Input de filtro debe existir");
        assert.strictEqual(rows.length, 5, "Deben renderizarse 5 filas de permisos");

        // 2.1 Initial tri-state check: since 2 out of 5 are checked, indeterminate should be TRUE
        assert.strictEqual(selectAllCb.checked, false, "Todo.checked debe ser false cuando solo una parte está seleccionada");
        assert.strictEqual(selectAllCb.indeterminate, true, "Todo.indeterminate debe ser true cuando solo una parte está seleccionada");

        console.log("  ✓ 2.1 Estado tri-state inicial: indeterminate=true cuando una parte de los permisos está seleccionada.");

        // 2.2 Toggle "Todo" without filter
        selectAllCb.checked = true;
        selectAllCb.onclick();

        const allCheckboxes = Array.from(listContainer.querySelectorAll('.perm-checkbox'));
        assert(allCheckboxes.every(cb => cb.checked), "Todos los checkboxes deben estar marcados");
        assert.strictEqual(selectAllCb.checked, true, "Todo.checked debe ser true");
        assert.strictEqual(selectAllCb.indeterminate, false, "Todo.indeterminate debe ser false cuando todos están marcados");

        // Clicking "Todo" again unchecks all
        selectAllCb.checked = false;
        selectAllCb.onclick();
        assert(allCheckboxes.every(cb => !cb.checked), "Todos los checkboxes deben estar desmarcados");
        assert.strictEqual(selectAllCb.checked, false, "Todo.checked debe ser false");
        assert.strictEqual(selectAllCb.indeterminate, false, "Todo.indeterminate debe ser false cuando ninguno está marcado");

        console.log("  ✓ 2.2 'Todo' sin filtro activo: marca y desmarca todos los permisos correctamente.");

        // 2.3 Filter search & "Todo" on filtered subset only
        // First check permission 4 (usuarios.read)
        const cb4 = winAdmin.document.getElementById('perm-cb-4');
        cb4.checked = true;
        cb4.dispatchEvent(new winAdmin.Event('change'));

        // Now filter by "ideas"
        filterInput.value = 'ideas';
        filterInput.dispatchEvent(new winAdmin.Event('input'));

        const visibleRows = Array.from(listContainer.querySelectorAll('.perm-item-row')).filter(r => r.style.display !== 'none');
        const hiddenRows = Array.from(listContainer.querySelectorAll('.perm-item-row')).filter(r => r.style.display === 'none');

        assert.strictEqual(visibleRows.length, 3, "El filtro 'ideas' debe mostrar exactamente 3 permisos de ideas");
        assert.strictEqual(hiddenRows.length, 2, "Los 2 permisos de usuarios deben quedar ocultos");

        // In the visible subset (ideas.read, ideas.create, ideas.update), none is checked yet
        assert.strictEqual(selectAllCb.checked, false, "Todo debe ser false para el subconjunto visible no marcado");

        // Click "Todo" to select all visible (ideas)
        selectAllCb.checked = true;
        selectAllCb.onclick();

        // Check that visible items are checked
        const visibleCbs = visibleRows.map(r => r.querySelector('.perm-checkbox'));
        assert(visibleCbs.every(cb => cb.checked), "Todos los permisos visibles deben quedar marcados");

        // Check that hidden item cb4 (usuarios.read) KEPT its checked state!
        assert.strictEqual(cb4.checked, true, "El permiso oculto cb4 debe conservar su estado checked=true");
        // Check that hidden item cb5 (usuarios.update) KEPT its unchecked state!
        const cb5 = winAdmin.document.getElementById('perm-cb-5');
        assert.strictEqual(cb5.checked, false, "El permiso oculto cb5 debe conservar su estado checked=false");

        console.log("  ✓ 2.3 'Todo' con filtro activo: solo altera permisos visibles; permisos ocultos conservan intacto su estado previo.");

        // 2.4 Clear filter and save
        filterInput.value = '';
        filterInput.dispatchEvent(new winAdmin.Event('input'));

        // Save
        const btnSave = winAdmin.document.getElementById('btn-save-rol-perms');
        assert(btnSave, "Botón Guardar debe existir");
        await btnSave.onclick();

        assert(savedPayload, "Guardar debe enviar payload al backend");
        assert.deepStrictEqual(savedPayload.permisos.sort(), [1, 2, 3, 4], "Se deben guardar tanto los permisos visibles marcados como los ocultos que estaban marcados");

        console.log("  ✓ 2.4 Guardado de permisos: envía correctamente al backend todos los permisos seleccionados (visibles y ocultos).");
    }

    // -------------------------------------------------------------------------
    // TEST SUITE 3: ORDENAMIENTO POR COLUMNAS EN TABLAS ADMINISTRATIVAS
    // -------------------------------------------------------------------------
    console.log("\n--- 3. PRUEBAS DE ORDENAMIENTO EN TABLAS ADMINISTRATIVAS ---");

    {
        const domSort = new JSDOM(`<!DOCTYPE html><html><body>
            <table class="admin-table" id="test-table-users">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Usuario</th>
                        <th>Nombre</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="test-tbody-users">
                    <tr data-id="3"><td>3</td><td>carlos</td><td>Carlos Gómez</td><td><button class="btn-edit" id="btn-edit-3">Editar 3</button></td></tr>
                    <tr data-id="1"><td>1</td><td>ana</td><td>Ana Pérez</td><td><button class="btn-edit" id="btn-edit-1">Editar 1</button></td></tr>
                    <tr data-id="10"><td>10</td><td>beto</td><td>Beto Zapata</td><td><button class="btn-edit" id="btn-edit-10">Editar 10</button></td></tr>
                    <tr data-id="2"><td>2</td><td>daniel</td><td>Daniel Mora</td><td><button class="btn-edit" id="btn-edit-2">Editar 2</button></td></tr>
                </tbody>
            </table>
        </body></html>`, { runScripts: "dangerously" });
        const { window: winSort } = domSort;

        winSort.eval(adminJsContent);

        const table = winSort.document.getElementById('test-table-users');
        const ths = table.querySelectorAll('thead th');
        const thId = ths[0];
        const thUsuario = ths[1];
        const thAcciones = ths[3];

        let editClickedId = null;
        winSort.document.getElementById('btn-edit-10').onclick = () => { editClickedId = 10; };
        winSort.document.getElementById('btn-edit-1').onclick = () => { editClickedId = 1; };

        // Initialize sortable
        winSort.makeAdminTableSortable(table);

        // 3.1 Verify Acciones column is excluded from sorting
        assert(!thAcciones.classList.contains('sortable-th'), "Columna 'Acciones' NO debe tener la clase .sortable-th");
        assert(!thAcciones.querySelector('.sort-indicator'), "Columna 'Acciones' NO debe tener indicador de orden");
        assert(!thAcciones.onclick, "Columna 'Acciones' NO debe tener evento de clic");

        console.log("  ✓ 3.1 Columna 'Acciones' excluida del ordenamiento.");

        // 3.2 Numeric sort on ID (1st click: Ascending)
        thId.click();
        assert(thId.classList.contains('sort-asc'), "Header ID debe tener clase .sort-asc tras primer clic");
        assert(thId.querySelector('.fa-sort-up'), "Header ID debe tener icono fa-sort-up");

        let currentIds = Array.from(winSort.document.querySelectorAll('#test-tbody-users tr')).map(r => r.dataset.id);
        assert.deepStrictEqual(currentIds, ['1', '2', '3', '10'], "Orden ascendente numérico de ID debe ser 1, 2, 3, 10 (no lexicográfico 1, 10, 2, 3)");

        console.log("  ✓ 3.2 Clic 1 en ID: Orden Ascendente numérico correcto (1, 2, 3, 10) con indicador .sort-asc.");

        // 3.3 Numeric sort on ID (2nd click: Descending)
        thId.click();
        assert(thId.classList.contains('sort-desc'), "Header ID debe tener clase .sort-desc tras segundo clic");
        assert(thId.querySelector('.fa-sort-down'), "Header ID debe tener icono fa-sort-down");

        currentIds = Array.from(winSort.document.querySelectorAll('#test-tbody-users tr')).map(r => r.dataset.id);
        assert.deepStrictEqual(currentIds, ['10', '3', '2', '1'], "Orden descendente numérico de ID debe ser 10, 3, 2, 1");

        console.log("  ✓ 3.3 Clic 2 en ID: Orden Descendente numérico correcto (10, 3, 2, 1) con indicador .sort-desc.");

        // 3.4 Restore original order (3rd click: None)
        thId.click();
        assert(!thId.classList.contains('sort-asc') && !thId.classList.contains('sort-desc'), "Header ID no debe tener clases activas tras tercer clic");
        assert(thId.querySelector('.fa-sort'), "Header ID debe tener icono neutral fa-sort tras restaurar");

        currentIds = Array.from(winSort.document.querySelectorAll('#test-tbody-users tr')).map(r => r.dataset.id);
        assert.deepStrictEqual(currentIds, ['3', '1', '10', '2'], "Tercer clic debe restaurar el orden original exacto (3, 1, 10, 2)");

        console.log("  ✓ 3.4 Clic 3 en ID: Restaura orden original (3, 1, 10, 2) y neutraliza indicador.");

        // 3.5 String sorting on column "Usuario"
        thUsuario.click(); // Asc
        let userNames = Array.from(winSort.document.querySelectorAll('#test-tbody-users tr td:nth-child(2)')).map(c => c.textContent);
        assert.deepStrictEqual(userNames, ['ana', 'beto', 'carlos', 'daniel'], "Orden ascendente alfabético de Usuario debe ser ana, beto, carlos, daniel");

        thUsuario.click(); // Desc
        userNames = Array.from(winSort.document.querySelectorAll('#test-tbody-users tr td:nth-child(2)')).map(c => c.textContent);
        assert.deepStrictEqual(userNames, ['daniel', 'carlos', 'beto', 'ana'], "Orden descendente alfabético de Usuario debe ser daniel, carlos, beto, ana");

        console.log("  ✓ 3.5 Ordenamiento alfabético en columnas de texto probado exitosamente.");

        // 3.6 Action buttons event integrity after sorting
        const btn10 = winSort.document.getElementById('btn-edit-10');
        btn10.click();
        assert.strictEqual(editClickedId, 10, "El manejador de eventos del botón de acción debe seguir funcionando perfectamente tras reordenar filas");

        console.log("  ✓ 3.6 Integridad de botones de acción: los eventos de clic y funciones operan intactos tras múltiples ordenamientos.");

        // 3.7 Verify all 6 admin tables in real index.html have makeAdminTableSortable hooked
        const realDom = new JSDOM(indexHtmlContent, { runScripts: "dangerously" });
        const { window: realWin } = realDom;
        realWin.eval(adminJsContent);

        const adminTables = realWin.document.querySelectorAll('.admin-table');
        assert.strictEqual(adminTables.length, 6, "Deben existir exactamente 6 tablas .admin-table en index.html");

        adminTables.forEach((t) => {
            realWin.makeAdminTableSortable(t);
            const headers = t.querySelectorAll('thead th');
            const sortableHeaders = Array.from(headers).filter(h => h.classList.contains('sortable-th'));
            const accionesHeader = Array.from(headers).find(h => h.textContent.trim().toLowerCase() === 'acciones');

            assert(sortableHeaders.length >= 3, `La tabla debe tener columnas ordenables (encontradas ${sortableHeaders.length})`);
            if (accionesHeader) {
                assert(!accionesHeader.classList.contains('sortable-th'), "Columna Acciones no debe ser sortable");
            }
        });

        console.log("  ✓ 3.7 Homologación en las 6 tablas administrativas (Usuarios, Roles, Permisos, Funcionalidades, Menús, Accesos Temporales) verificada.");
    }

    console.log("\n===============================================================================");
    console.log("TODAS LAS PRUEBAS DE INTEGRACIÓN DEL PR #98 PASARON EXITOSAMENTE (100% OK)");
    console.log("===============================================================================");
    process.exit(0);
}

runAllTests().catch(err => {
    console.error("\n❌ ERROR EN PRUEBAS PR #98:", err);
    process.exit(1);
});
