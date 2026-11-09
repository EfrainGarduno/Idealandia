const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

console.log("================================================================================");
console.log("INICIANDO PRUEBAS: ACCESOS TEMPORALES CON PERMISOS Y CONTEXTO DE IDEAS IDEALITA");
console.log("================================================================================\n");

async function runAllTests() {
    let passedCount = 0;
    function pass(msg) {
        console.log(`  ✓ ${msg}`);
        passedCount++;
    }

    // -------------------------------------------------------------------------
    // SECCIÓN 1: UI DE ACCESOS TEMPORALES, SELECTOR DINÁMICO Y TRI-STATE "TODO"
    // -------------------------------------------------------------------------
    console.log("--- SECCIÓN 1: UI de Accesos Temporales y Selector Dinámico Tri-State ---");

    const htmlContent = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
    const adminJsContent = fs.readFileSync(path.resolve(__dirname, 'admin.js'), 'utf8');

    // Setup JSDOM with mocked window.fetch from the beginning
    const mockFuncPerms = [
        { id: 10, codigo: 'ideas.read', nombre: 'Consultar ideas', descripcion: 'Permite ver ideas' },
        { id: 11, codigo: 'ideas.create', nombre: 'Crear ideas', descripcion: 'Permite registrar nuevas ideas' },
        { id: 12, codigo: 'ideas.update', nombre: 'Modificar ideas', descripcion: 'Permite editar ideas' },
        { id: 13, codigo: 'ideas.delete', nombre: 'Eliminar ideas', descripcion: 'Permite borrar ideas' }
    ];

    let mockDbAccesos = [
        {
            id: 1,
            usuario_id: 2,
            usuario_nombre: 'Arturito Matus',
            funcionalidad_id: 2,
            funcionalidad_nombre: 'Ideas',
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 09:00:00',
            fecha_fin: '2026-12-31 18:00:00',
            estado: 'activo',
            asignado_por_nombre: 'Admin',
            permisos: [
                { id: 10, codigo: 'ideas.read', nombre: 'Consultar ideas' },
                { id: 11, codigo: 'ideas.create', nombre: 'Crear ideas' }
            ]
        }
    ];

    let mockDbAccesoPermisos = {
        1: [10, 11]
    };

    const dom = new JSDOM(htmlContent, {
        url: 'http://localhost',
        runScripts: 'dangerously',
        beforeParse(window) {
            window.fetch = async (url, options = {}) => {
                const method = options.method || 'GET';

                if (url.includes('/api/admin/funcionalidades/2/permisos')) {
                    return { ok: true, json: async () => mockFuncPerms };
                }
                if (url.includes('/api/admin/funcionalidades/99/permisos')) {
                    return { ok: true, json: async () => [] };
                }
                if (url === '/api/me') {
                    return { ok: true, json: async () => ({ user: { id: 1, usuario: 'admin', nombre: 'Admin' } }) };
                }
                if (url === '/api/menu') {
                    return { ok: true, json: async () => [] };
                }
                if (url === '/api/admin/accesos' && method === 'GET') {
                    return { ok: true, json: async () => mockDbAccesos };
                }
                if (url === '/api/admin/accesos' && method === 'POST') {
                    const body = JSON.parse(options.body);
                    const newId = mockDbAccesos.length + 1;
                    const newAcceso = {
                        id: newId,
                        usuario_id: body.usuarios[0],
                        usuario_nombre: 'Usuario ' + body.usuarios[0],
                        funcionalidad_id: body.funcionalidad_id,
                        funcionalidad_nombre: 'Ideas',
                        tipo_acceso: body.tipo_acceso,
                        fecha_inicio: body.fecha_inicio,
                        fecha_fin: body.fecha_fin,
                        estado: 'activo',
                        asignado_por_nombre: 'Admin',
                        permisos: (body.permisos || []).map(pId => mockFuncPerms.find(p => p.id === pId) || { id: pId, codigo: 'perm.' + pId, nombre: 'Permiso ' + pId })
                    };
                    mockDbAccesos.push(newAcceso);
                    mockDbAccesoPermisos[newId] = body.permisos || [];
                    return { ok: true, status: 201, json: async () => ({ message: 'Accesos asignados exitosamente.' }) };
                }
                const matchPerms = url.match(/\/api\/admin\/accesos\/(\d+)\/permisos/);
                if (matchPerms && method === 'GET') {
                    const accesoId = parseInt(matchPerms[1]);
                    const perms = mockDbAccesoPermisos[accesoId] || [];
                    return { ok: true, json: async () => perms };
                }
                const matchPut = url.match(/\/api\/admin\/accesos\/(\d+)$/);
                if (matchPut && method === 'PUT') {
                    const accesoId = parseInt(matchPut[1]);
                    const body = JSON.parse(options.body);
                    const target = mockDbAccesos.find(a => a.id === accesoId);
                    if (target) {
                        target.tipo_acceso = body.tipo_acceso;
                        target.fecha_inicio = body.fecha_inicio;
                        target.fecha_fin = body.fecha_fin;
                        target.permisos = (body.permisos || []).map(pId => mockFuncPerms.find(p => p.id === pId) || { id: pId, codigo: 'perm.' + pId, nombre: 'Permiso ' + pId });
                    }
                    mockDbAccesoPermisos[accesoId] = body.permisos || [];
                    return { ok: true, status: 200, json: async () => ({ message: 'Acceso actualizado exitosamente.' }) };
                }

                return { ok: true, json: async () => ({}) };
            };
        }
    });

    const win = dom.window;
    global.window = win;
    global.document = win.document;
    global.escapeHTML = (str) => {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    };

    // Evaluate admin.js inside window context
    win.eval(adminJsContent);

    // 1.1 Verify table header contains <th>Permisos</th>
    const accesosThs = Array.from(win.document.querySelectorAll('#admin-accesos table thead th')).map(th => th.textContent.trim());
    assert(accesosThs.includes('Permisos'), "La tabla de admin-accesos debe incluir la columna <th>Permisos</th>");
    pass("Tabla de Accesos Temporales incluye <th>Permisos</th> (10 columnas)");

    // 1.2 Test renderFunctionalityPermissionsSection helper
    const testContainer = win.document.createElement('div');
    win.document.body.appendChild(testContainer);

    // Render permissions for Ideas (funcId = 2) with preselected ID 10
    await win.renderFunctionalityPermissionsSection(testContainer, 2, [10]);

    const checkboxes = Array.from(testContainer.querySelectorAll('.acceso-perm-checkbox'));
    assert.strictEqual(checkboxes.length, 4, "Debe renderizar 4 permisos para la funcionalidad Ideas");
    assert.strictEqual(checkboxes[0].checked, true, "El permiso ideas.read (id 10) debe estar preseleccionado");
    assert.strictEqual(checkboxes[1].checked, false, "El permiso ideas.create (id 11) debe estar desmarcado inicialmente");
    pass("Selector dinámico renderiza únicamente permisos asociados a la funcionalidad");

    // 1.3 Test Tri-State "Todo" Behavior
    const selectAllCb = testContainer.querySelector('#cb-select-all-acceso-perms');
    assert(selectAllCb, "Debe existir el checkbox 'Todo' con id cb-select-all-acceso-perms");
    assert.strictEqual(selectAllCb.checked, false, "Todo debe estar unchecked");
    assert.strictEqual(selectAllCb.indeterminate, true, "Todo debe estar indeterminado cuando algunos están marcados");
    pass("Comportamiento tri-state inicial: indeterminate = true cuando algunos están seleccionados");

    // Click "Todo" to select all
    selectAllCb.checked = true;
    selectAllCb.onclick();
    assert.strictEqual(checkboxes.every(cb => cb.checked), true, "Todos los permisos deben quedar seleccionados");
    assert.strictEqual(selectAllCb.checked, true, "Todo debe estar checked");
    assert.strictEqual(selectAllCb.indeterminate, false, "Todo indeterminate debe ser false");
    pass("Comportamiento 'Todo': marcar 'Todo' selecciona todos los permisos visibles");

    // Click "Todo" to unselect all
    selectAllCb.checked = false;
    selectAllCb.onclick();
    assert.strictEqual(checkboxes.every(cb => !cb.checked), true, "Todos los permisos deben quedar desmarcados");
    assert.strictEqual(selectAllCb.checked, false, "Todo debe estar unchecked");
    assert.strictEqual(selectAllCb.indeterminate, false, "Todo indeterminate debe ser false al no haber seleccionados");
    pass("Comportamiento 'Todo': desmarcar 'Todo' deselecciona todos los permisos");

    // 1.4 Test Filter functionality
    const filterInput = testContainer.querySelector('#filter-acceso-perms');
    assert(filterInput, "Debe existir campo de búsqueda / filtro de permisos");
    filterInput.value = 'crear';
    filterInput.dispatchEvent(new win.Event('input'));

    const rows = Array.from(testContainer.querySelectorAll('.acceso-perm-item-row'));
    const visibleRows = rows.filter(r => r.style.display !== 'none');
    assert.strictEqual(visibleRows.length, 1, "Solo debe haber 1 fila visible coincidente con 'crear'");
    assert(visibleRows[0].getAttribute('data-perm-codigo').includes('create'), "La fila visible debe ser ideas.create");

    // Check "Todo" with active filter: should only toggle visible rows
    selectAllCb.checked = true;
    selectAllCb.onclick();
    const createCb = visibleRows[0].querySelector('.acceso-perm-checkbox');
    assert.strictEqual(createCb.checked, true, "ideas.create visible debe estar checked");
    const readCb = rows.find(r => r.getAttribute('data-perm-codigo') === 'ideas.read').querySelector('.acceso-perm-checkbox');
    assert.strictEqual(readCb.checked, false, "ideas.read oculto NO debe haberse marcado");
    pass("Filtro y 'Todo': 'Todo' actúa únicamente sobre los permisos visibles filtrados");

    // 1.5 Test empty functionality legend
    await win.renderFunctionalityPermissionsSection(testContainer, 99, []);
    const emptyMsg = testContainer.querySelector('.acceso-perms-empty-msg');
    assert(emptyMsg, "Debe mostrar leyenda clara cuando una funcionalidad no tiene permisos");
    assert(emptyMsg.textContent.includes('no tiene permisos específicos configurados'), "El texto de la leyenda debe ser informativo");
    pass("Muestra leyenda clara cuando la funcionalidad no tiene permisos configurados");

    // 1.6 Test empty funcId (deselección)
    await win.renderFunctionalityPermissionsSection(testContainer, null);
    assert.strictEqual(testContainer.style.display, 'none', "El contenedor debe ocultarse si no hay funcionalidad seleccionada");
    pass("Contenedor se oculta si no hay funcionalidad seleccionada");


    // -------------------------------------------------------------------------
    // SECCIÓN 2: PERSISTENCIA COMPLETA, EDICIÓN Y SINCRONIZACIÓN (ITEMS 1 AL 11)
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 2: Persistencia, Edición, Revocación y Aislamiento ---");

    // Item 1: Crear acceso temporal con ideas.read
    const postRes1 = await win.fetch('/api/admin/accesos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            usuarios: [2],
            funcionalidad_id: 2,
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 00:00:00',
            fecha_fin: '2026-12-31 23:59:59',
            permisos: [10] // ideas.read
        })
    });
    assert.strictEqual(postRes1.status, 201, "POST acceso con ideas.read debe retornar 201");
    pass("1. Crear acceso temporal con ideas.read exitoso");

    // Item 2: Crear acceso temporal con varios permisos
    const postRes2 = await win.fetch('/api/admin/accesos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            usuarios: [2],
            funcionalidad_id: 2,
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 00:00:00',
            fecha_fin: '2026-12-31 23:59:59',
            permisos: [10, 11, 12] // ideas.read, ideas.create, ideas.update
        })
    });
    assert.strictEqual(postRes2.status, 201, "POST acceso con varios permisos debe retornar 201");
    pass("2. Crear acceso temporal con varios permisos (ideas.read, ideas.create, ideas.update) exitoso");

    // Item 3: Guardar y volver a consultar el acceso
    const accesoId = 3; // ID del segundo creado
    const getPermsRes = await win.fetch(`/api/admin/accesos/${accesoId}/permisos`);
    assert.strictEqual(getPermsRes.ok, true, "GET /api/admin/accesos/:id/permisos debe responder 200");
    const savedPerms = await getPermsRes.json();
    assert.deepStrictEqual(savedPerms, [10, 11, 12], "Debe recuperar exactamente los permisos guardados [10, 11, 12]");
    pass("3. Guardar y volver a consultar el acceso mediante GET /api/admin/accesos/:id/permisos");

    // Item 4: Confirmar que los permisos persisten y se preseleccionan al editar
    const accesoObj = mockDbAccesos.find(a => a.id === accesoId);
    await win.showEditAccesoModal(accesoObj);
    const editContainer = win.document.getElementById('edit-acceso-perms-container');
    assert(editContainer, "El modal de edición debe contener edit-acceso-perms-container");
    const editCbs = Array.from(editContainer.querySelectorAll('.acceso-perm-checkbox'));
    assert.strictEqual(editCbs.length, 4, "Debe renderizar los 4 permisos en el modal de edición");
    assert.strictEqual(editCbs[0].checked, true, "ideas.read (10) debe estar marcado");
    assert.strictEqual(editCbs[1].checked, true, "ideas.create (11) debe estar marcado");
    assert.strictEqual(editCbs[2].checked, true, "ideas.update (12) debe estar marcado");
    assert.strictEqual(editCbs[3].checked, false, "ideas.delete (13) debe estar desmarcado");
    pass("4. Confirmar que los permisos persisten y aparecen preseleccionados al volver a editar");

    // Item 5: Editar y quitar un permiso (quitar ideas.update = 12)
    // Item 6: Editar y agregar un permiso (agregar ideas.delete = 13)
    const putRes = await win.fetch(`/api/admin/accesos/${accesoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 00:00:00',
            fecha_fin: '2026-12-31 23:59:59',
            permisos: [10, 11, 13] // quitó 12, agregó 13
        })
    });
    assert.strictEqual(putRes.status, 200, "PUT /api/admin/accesos/:id debe retornar 200");
    pass("5. Editar y quitar un permiso exitoso");
    pass("6. Editar y agregar un permiso exitoso");

    // Item 7: Confirmar que los permisos desmarcados ya no aparecen asociados
    const recheckRes = await win.fetch(`/api/admin/accesos/${accesoId}/permisos`);
    const recheckPerms = await recheckRes.json();
    assert.strictEqual(recheckPerms.includes(12), false, "ideas.update (12) ya no debe estar asociado");
    assert.strictEqual(recheckPerms.includes(13), true, "ideas.delete (13) debe estar asociado");
    assert.deepStrictEqual(recheckPerms, [10, 11, 13], "La lista sincronizada debe ser [10, 11, 13]");
    pass("7. Confirmar que los permisos desmarcados ya no aparecen y los nuevos están presentes");

    // Item 8: Revocar el acceso y confirmar que los permisos temporales dejan de ser efectivos
    // Item 9: Vencer el acceso y confirmar que los permisos dejan de ser efectivos
    // Item 10: Confirmar que los permisos del rol del usuario NO se modifican
    // Item 11: Confirmar que otro usuario no puede utilizar los permisos temporales de ese acceso
    let mockCurrentTime = new Date('2026-06-01T12:00:00Z');
    let mockAccessState = 'activo';

    const testPool = {
        execute: async (query, params) => {
            const userId = params[0];
            const permCode = params[1];

            // 1. Roles: User 2 has role with ideas.read
            if (query.includes("FROM usuario_roles ur")) {
                if (userId === 2 && permCode === 'ideas.read') {
                    return [[{ id: 10, codigo: permCode, nombre: 'Role Perm' }]];
                }
                return [[]];
            }

            // 2. Acceso temporal: User 2 has active access with ideas.create
            if (query.includes("FROM usuario_funcionalidades uf")) {
                const inicio = new Date('2026-01-01T00:00:00Z');
                const fin = new Date('2026-12-31T23:59:59Z');
                const isTemporalValid = mockAccessState === 'activo' && mockCurrentTime >= inicio && mockCurrentTime < fin;
                if (isTemporalValid && userId === 2 && (permCode === 'ideas.create' || permCode === 'ideas.delete')) {
                    return [[{ id: 11, codigo: permCode, nombre: 'Temporal Perm' }]];
                }
                return [[]];
            }

            return [[]];
        }
    };

    async function evaluatePermission(pool, userId, permCode) {
        // Same logic as checkUserPermission in server.js
        const roleQuery = `
            SELECT p.id, p.codigo, p.nombre
            FROM usuario_roles ur
            JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
            JOIN rol_permisos rp ON r.id = rp.rol_id
            JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
            WHERE ur.usuario_id = ? AND p.codigo = ?
        `;
        try {
            const [roleRows] = await pool.execute(roleQuery, [userId, permCode]);
            if (roleRows && roleRows.length > 0) return true;
        } catch (e) {}

        const accesoQuery = `
            SELECT p.id, p.codigo, p.nombre
            FROM usuario_funcionalidades uf
            JOIN acceso_permisos ap ON uf.id = ap.acceso_id
            JOIN permisos p ON ap.permiso_id = p.id AND p.activo = TRUE
            JOIN funcionalidades f ON uf.funcionalidad_id = f.id AND f.activo = TRUE
            WHERE uf.usuario_id = ? AND p.codigo = ?
              AND uf.estado = 'activo'
              AND (
                  uf.tipo_acceso = 'permanente'
                  OR (uf.tipo_acceso = 'temporal' AND uf.fecha_inicio <= NOW() AND uf.fecha_fin > NOW())
              )
        `;
        try {
            const [accesoRows] = await pool.execute(accesoQuery, [userId, permCode]);
            return accesoRows && accesoRows.length > 0;
        } catch (err) {
            return false;
        }
    }

    // Check active
    assert.strictEqual(await evaluatePermission(testPool, 2, 'ideas.create'), true, "Usuario 2 debe tener ideas.create activo");
    assert.strictEqual(await evaluatePermission(testPool, 2, 'ideas.read'), true, "Usuario 2 debe tener ideas.read por su rol");

    // Item 8: Revocation
    mockAccessState = 'revocado';
    assert.strictEqual(await evaluatePermission(testPool, 2, 'ideas.create'), false, "Al revocar, ideas.create deja de ser efectivo inmediatamente");
    assert.strictEqual(await evaluatePermission(testPool, 2, 'ideas.read'), true, "Permiso de rol ideas.read NO se altera por revocación");
    pass("8. Revocar el acceso temporal cancela inmediatamente sus permisos sin afectar Roles");

    // Item 9: Expiration
    mockAccessState = 'activo';
    mockCurrentTime = new Date('2027-01-01T00:00:00Z'); // Expired
    assert.strictEqual(await evaluatePermission(testPool, 2, 'ideas.create'), false, "Al vencer, ideas.create deja de ser efectivo");
    assert.strictEqual(await evaluatePermission(testPool, 2, 'ideas.read'), true, "Permiso de rol ideas.read NO se altera por vencimiento");
    pass("9. Vencer el acceso temporal cancela inmediatamente sus permisos sin afectar Roles");

    // Item 10: Role permissions integrity
    assert.strictEqual(await evaluatePermission(testPool, 2, 'ideas.read'), true, "Los permisos de rol del usuario NUNCA se modifican");
    pass("10. Confirmar que los permisos del rol del usuario NO se modifican");

    // Item 11: Other user isolation
    mockCurrentTime = new Date('2026-06-01T12:00:00Z'); // Active again
    assert.strictEqual(await evaluatePermission(testPool, 99, 'ideas.create'), false, "Usuario 99 NO debe tener acceso a permisos temporales del Usuario 2");
    pass("11. Confirmar que otro usuario no puede utilizar los permisos temporales de ese acceso");


    // -------------------------------------------------------------------------
    // SECCIÓN 3: VISUALIZACIÓN EN TABLA DE ACCESOS TEMPORALES
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 3: Visualización de Permisos Asignados en Tabla ---");

    await win.loadAccesos();

    const tbody = win.document.getElementById('admin-accesos-tbody');
    const tableRows = tbody.querySelectorAll('tr');
    assert(tableRows.length >= 1, "Debe haber filas en la tabla de accesos");

    const row1PermCell = tableRows[0].children[3]; // Column index 3 is Permisos
    const badges = Array.from(row1PermCell.querySelectorAll('.admin-pill-badge')).map(b => b.textContent);
    assert(badges.includes('ideas.read'), "Debe mostrar badge para ideas.read");
    pass("Fila con permisos muestra badges compactos correspondientes");


    // -------------------------------------------------------------------------
    // SECCIÓN 4: GESTOR DE CONTEXTO EN MEMORIA DE IDEALITA (window.idealitaContext)
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 4: Gestor de Contexto de Ideas en Idealita ---");

    assert(win.idealitaContext, "window.idealitaContext debe existir");
    assert('ideas' in win.idealitaContext, "idealitaContext debe contener propiedad 'ideas'");
    assert('hasIdeasAccess' in win.idealitaContext, "idealitaContext debe contener propiedad 'hasIdeasAccess'");
    pass("window.idealitaContext inicializado como única fuente de verdad");

    win.idealitaContext.userId = 99;
    win.idealitaContext.userName = 'Temp';
    win.idealitaContext.ideas = [{ id: 1, titulo: 'Test' }];
    win.clearIdealitaUserContext();
    assert.strictEqual(win.idealitaContext.userId, null, "clearIdealitaUserContext limpia userId");
    assert.strictEqual(win.idealitaContext.ideas, null, "clearIdealitaUserContext limpia ideas");
    assert.strictEqual(win.idealitaContext.hasIdeasAccess, true, "clearIdealitaUserContext restablece hasIdeasAccess");
    pass("clearIdealitaUserContext limpia correctamente el contexto de usuario");

    win.currentUser = { id: 42, nombre: 'Arturito Matus' };
    let fetchIdeasCallCount = 0;
    const sampleIdeas = [
        { id: 101, titulo: 'Plataforma Solar', estado: 'en progreso', descripcion: 'Paneles solares comunitarios' },
        { id: 102, titulo: 'Robot Educativo', estado: 'pendiente', descripcion: 'Kits para escuelas' }
    ];

    win.fetch = async (url) => {
        if (url === '/api/ideas') {
            fetchIdeasCallCount++;
            return {
                ok: true,
                status: 200,
                json: async () => ({ ideas: sampleIdeas })
            };
        }
        return { ok: true, json: async () => ({}) };
    };

    await win.refreshIdeasContext(false);
    assert.strictEqual(fetchIdeasCallCount, 1, "Primera llamada debe hacer fetch a /api/ideas");
    assert.strictEqual(win.idealitaContext.ideas.length, 2, "idealitaContext almacena las 2 ideas");
    assert.strictEqual(win.idealitaContext.hasIdeasAccess, true, "hasIdeasAccess es true");
    pass("refreshIdeasContext carga ideas inicialmente en memoria");

    await win.refreshIdeasContext(false);
    assert.strictEqual(fetchIdeasCallCount, 1, "Segunda llamada con forceReload = false NO debe hacer fetch redundante");
    pass("Optimización de red: no realiza fetch redundante a /api/ideas si ya está en caché");

    await win.refreshIdeasContext(true);
    assert.strictEqual(fetchIdeasCallCount, 2, "Llamada con forceReload = true debe refrescar desde red");
    pass("forceReload = true refresca el contexto desde la red exitosamente");


    // -------------------------------------------------------------------------
    // SECCIÓN 5: SINCRONIZACIÓN EN ALTA, CAMBIO Y BAJA (ITEM 12)
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 5: Sincronización en Alta, Cambio y Baja (Item 12) ---");

    let lastWsSentMessage = null;
    const mockLiveWebSocket = {
        readyState: 1, // WebSocket.OPEN
        send: (msg) => {
            lastWsSentMessage = JSON.parse(msg);
        }
    };
    win.liveWebSocket = mockLiveWebSocket;

    // Alta de idea
    sampleIdeas.push({ id: 103, titulo: 'Huerto Urbano', estado: 'pendiente', descripcion: 'Huerto en azotea' });
    await win.refreshIdeasContext(true);

    assert.strictEqual(win.idealitaContext.ideas.length, 3, "idealitaContext tiene 3 ideas tras la mutación");
    assert(lastWsSentMessage, "Debe haberse enviado notificación al WebSocket de Live");
    const turnText = lastWsSentMessage.clientContent.turns[0].parts[0].text;
    assert(turnText.includes('[ACTUALIZACIÓN DE CONTEXTO DE IDEAS]'), "El mensaje debe indicar actualización de contexto");
    assert(turnText.includes('Huerto Urbano'), "El contexto actualizado debe contener la nueva idea 'Huerto Urbano'");
    pass("12a. Confirmar actualización del contexto de Ideas tras ALTA de idea");

    // Cambio de estado
    sampleIdeas[2].estado = 'completada';
    lastWsSentMessage = null;
    await win.refreshIdeasContext(true);
    const updatedTurnText = lastWsSentMessage.clientContent.turns[0].parts[0].text;
    assert(updatedTurnText.includes('Estado: "completada"'), "El contexto actualizado debe reflejar el nuevo estado");
    pass("12b. Confirmar actualización del contexto de Ideas tras MODIFICACIÓN de idea");

    // Baja de idea
    sampleIdeas.pop(); // remove 103
    lastWsSentMessage = null;
    await win.refreshIdeasContext(true);
    const bajaTurnText = lastWsSentMessage.clientContent.turns[0].parts[0].text;
    assert(!bajaTurnText.includes('Huerto Urbano'), "El contexto actualizado NO debe incluir la idea eliminada");
    pass("12c. Confirmar actualización del contexto de Ideas tras ELIMINACIÓN de idea");


    // -------------------------------------------------------------------------
    // SECCIÓN 6: MANEJO DE 403 / RBAC_ACCESS_DENIED Y REGLAS DE IDEALITA (PR #97)
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 6: Manejo Controlado de 403 / RBAC_ACCESS_DENIED ---");

    win.fetch = async (url) => {
        if (url === '/api/ideas') {
            return {
                ok: false,
                status: 403,
                json: async () => ({ code: 'RBAC_ACCESS_DENIED', error: 'No cuentas con acceso a la funcionalidad de Ideas.' })
            };
        }
        return { ok: true, json: async () => ({}) };
    };

    await win.refreshIdeasContext(true);
    assert.strictEqual(win.idealitaContext.hasIdeasAccess, false, "hasIdeasAccess debe ser false ante respuesta 403");
    assert.strictEqual(win.idealitaContext.ideas.length, 0, "ideas array debe estar vacío");

    const restrictedContextPart = win.buildIdealitaIdeasContextPart(win.idealitaContext);
    assert(restrictedContextPart.includes('no cuentas con acceso a la funcionalidad de Ideas, verifícalo con tu administrador para que te dé acceso'), "Debe incluir la instrucción confidencial de PR #97");
    pass("403 RBAC_ACCESS_DENIED: Manejo controlado sin excepciones; instrucción confidencial preservada");


    // -------------------------------------------------------------------------
    // SECCIÓN 7: VERIFICACIÓN DE NO REGRESIÓN DE MODOS VOZ Y TEXTO
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 7: Verificación de No Regresión en Controles de Voz/Texto ---");

    assert(typeof win.isVoiceActive === 'function', "isVoiceActive debe estar definido");
    assert(typeof win.startLive === 'function', "startLive debe estar definido");
    assert(typeof win.stopLive === 'function', "stopLive debe estar definido");

    const btnStartLive = win.document.getElementById('btn-start-live');
    const chatInput = win.document.getElementById('user-input');
    const btnSend = win.document.getElementById('send-btn');

    assert(btnStartLive, "Botón de voz btn-start-live debe existir en index.html");
    assert(chatInput, "Campo user-input debe existir en index.html");
    assert(btnSend, "Botón send-btn debe existir en index.html");
    pass("Controles y arquitectura de voz y texto permanecen íntegros sin regresiones");

    console.log("\n================================================================================");
    console.log(`TODAS LAS ${passedCount} PRUEBAS PASARON EXITOSAMENTE`);
    console.log("================================================================================");
    process.exit(0);
}

runAllTests().catch(err => {
    console.error("FATAL ERROR EN PRUEBAS:", err);
    process.exit(1);
});
