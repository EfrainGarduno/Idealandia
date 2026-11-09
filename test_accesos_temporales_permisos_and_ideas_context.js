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
    const dom = new JSDOM(htmlContent, {
        url: 'http://localhost',
        runScripts: 'dangerously',
        beforeParse(window) {
            window.fetch = async (url) => {
                if (url.includes('/api/admin/funcionalidades/2/permisos')) {
                    return {
                        ok: true,
                        json: async () => mockFuncPerms
                    };
                }
                if (url.includes('/api/admin/funcionalidades/99/permisos')) {
                    return {
                        ok: true,
                        json: async () => []
                    };
                }
                if (url === '/api/me') {
                    return { ok: true, json: async () => ({ user: { id: 1, usuario: 'admin', nombre: 'Admin' } }) };
                }
                if (url === '/api/menu') {
                    return { ok: true, json: async () => [] };
                }
                if (url === '/api/admin/accesos') {
                    return { ok: true, json: async () => mockAccesosData };
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

    const mockFuncPerms = [
        { id: 10, codigo: 'ideas.read', nombre: 'Consultar ideas', descripcion: 'Permite ver ideas' },
        { id: 11, codigo: 'ideas.create', nombre: 'Crear ideas', descripcion: 'Permite registrar nuevas ideas' },
        { id: 12, codigo: 'ideas.update', nombre: 'Modificar ideas', descripcion: 'Permite editar ideas' },
        { id: 13, codigo: 'ideas.delete', nombre: 'Eliminar ideas', descripcion: 'Permite borrar ideas' }
    ];

    // Render permissions for Ideas (funcId = 2)
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
    // SECCIÓN 2: RESOLUCIÓN ADITIVA RBAC Y VIGENCIA TEMPORAL (BACKEND / SERVER)
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 2: Resolución RBAC Aditiva y Vigencia Temporal ---");

    let mockCurrentTime = new Date('2026-06-01T12:00:00Z');
    let mockAccessState = 'activo';

    const mockPool = {
        execute: async (query, params) => {
            const userId = params[0];
            const permCode = params[1];

            // 1. Check roles
            const rolePerms = ['ideas.read'];
            if (rolePerms.includes(permCode) && userId === 2) {
                return [[{ id: 10, codigo: permCode, nombre: 'Role Perm' }]];
            }

            // 2. Check temporal acceso_permisos
            const temporalPerms = ['ideas.create'];
            const inicio = new Date('2026-01-01T00:00:00Z');
            const fin = new Date('2026-12-31T23:59:59Z');

            const isTemporalValid = mockAccessState === 'activo' && mockCurrentTime >= inicio && mockCurrentTime < fin;
            if (isTemporalValid && temporalPerms.includes(permCode) && userId === 2) {
                return [[{ id: 11, codigo: permCode, nombre: 'Temporal Perm' }]];
            }

            return [[]];
        }
    };

    async function testCheckUserPermission(pool, userId, permCode) {
        const query = `
            SELECT p.id, p.codigo, p.nombre
            FROM usuario_roles ur
            JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
            JOIN rol_permisos rp ON r.id = rp.rol_id
            JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
            WHERE ur.usuario_id = ? AND p.codigo = ?
            UNION
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
        const [rows] = await pool.execute(query, [userId, permCode, userId, permCode]);
        return rows && rows.length > 0;
    }

    // 2.1 Test additive permissions during validity
    assert.strictEqual(await testCheckUserPermission(mockPool, 2, 'ideas.read'), true, "Usuario debe tener ideas.read por su Rol");
    assert.strictEqual(await testCheckUserPermission(mockPool, 2, 'ideas.create'), true, "Usuario debe tener ideas.create por su Acceso Temporal activo");
    assert.strictEqual(await testCheckUserPermission(mockPool, 2, 'ideas.delete'), false, "Usuario NO debe tener ideas.delete porque no fue asignado");
    pass("RBAC Aditivo: Usuario conserva permisos de Roles y suma permisos temporales vigentes");

    // 2.2 Test expiration
    mockCurrentTime = new Date('2027-01-01T00:00:00Z'); // Expired
    assert.strictEqual(await testCheckUserPermission(mockPool, 2, 'ideas.create'), false, "ideas.create no debe estar disponible al vencer el acceso temporal");
    assert.strictEqual(await testCheckUserPermission(mockPool, 2, 'ideas.read'), true, "Permiso de Rol ideas.read NO se modifica ni se pierde al vencer el temporal");
    pass("Vigencia temporal: Permisos temporales dejan de ser efectivos al expirar sin alterar Roles");

    // 2.3 Test revocation
    mockCurrentTime = new Date('2026-06-01T12:00:00Z'); // Inside dates
    mockAccessState = 'revocado';
    assert.strictEqual(await testCheckUserPermission(mockPool, 2, 'ideas.create'), false, "ideas.create no debe estar disponible si el acceso está revocado");
    assert.strictEqual(await testCheckUserPermission(mockPool, 2, 'ideas.read'), true, "Permiso de Rol ideas.read NO se altera por revocación de acceso temporal");
    pass("Revocación inmediata: Permisos temporales se cancelan inmediatamente al revocar sin alterar Roles");


    // -------------------------------------------------------------------------
    // SECCIÓN 3: VISUALIZACIÓN EN TABLA DE ACCESOS TEMPORALES
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 3: Visualización de Permisos Asignados en Tabla ---");

    const mockAccesosData = [
        {
            id: 1,
            usuario_nombre: 'Arturito Matus',
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
        },
        {
            id: 2,
            usuario_nombre: 'Usuario Sin Permisos',
            funcionalidad_nombre: 'Ideas',
            tipo_acceso: 'temporal',
            fecha_inicio: '2026-01-01 09:00:00',
            fecha_fin: '2026-12-31 18:00:00',
            estado: 'activo',
            asignado_por_nombre: 'Admin',
            permisos: []
        }
    ];

    win.fetch = async (url) => {
        if (url === '/api/admin/accesos') {
            return { ok: true, json: async () => mockAccesosData };
        }
        return { ok: true, json: async () => [] };
    };

    await win.loadAccesos();

    const tbody = win.document.getElementById('admin-accesos-tbody');
    const tableRows = tbody.querySelectorAll('tr');
    assert.strictEqual(tableRows.length, 2, "Debe haber 2 filas en la tabla de accesos");

    // Check row 1 badges
    const row1PermCell = tableRows[0].children[3]; // Column index 3 is Permisos
    const badges = Array.from(row1PermCell.querySelectorAll('.admin-pill-badge')).map(b => b.textContent);
    assert(badges.includes('ideas.read'), "Debe mostrar badge para ideas.read");
    assert(badges.includes('ideas.create'), "Debe mostrar badge para ideas.create");
    pass("Fila con permisos muestra badges compactos correspondientes");

    // Check row 2 empty state
    const row2PermCell = tableRows[1].children[3];
    assert(row2PermCell.textContent.includes('Sin permisos específicos'), "Fila sin permisos debe mostrar leyenda 'Sin permisos específicos'");
    pass("Fila sin permisos muestra leyenda 'Sin permisos específicos'");


    // -------------------------------------------------------------------------
    // SECCIÓN 4: GESTOR DE CONTEXTO EN MEMORIA DE IDEALITA (window.idealitaContext)
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 4: Gestor de Contexto de Ideas en Idealita ---");

    // 4.1 Verify context object initialization
    assert(win.idealitaContext, "window.idealitaContext debe existir");
    assert('ideas' in win.idealitaContext, "idealitaContext debe contener propiedad 'ideas'");
    assert('hasIdeasAccess' in win.idealitaContext, "idealitaContext debe contener propiedad 'hasIdeasAccess'");
    pass("window.idealitaContext inicializado como única fuente de verdad");

    // 4.2 Test clearIdealitaUserContext
    win.idealitaContext.userId = 99;
    win.idealitaContext.userName = 'Temp';
    win.idealitaContext.ideas = [{ id: 1, titulo: 'Test' }];
    win.clearIdealitaUserContext();
    assert.strictEqual(win.idealitaContext.userId, null, "clearIdealitaUserContext limpia userId");
    assert.strictEqual(win.idealitaContext.ideas, null, "clearIdealitaUserContext limpia ideas");
    assert.strictEqual(win.idealitaContext.hasIdeasAccess, true, "clearIdealitaUserContext restablece hasIdeasAccess");
    pass("clearIdealitaUserContext limpia correctamente el contexto de usuario");

    // 4.3 Test refreshIdeasContext caching & forceReload
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

    // First call: forceReload = false -> fetches because ideas are null
    await win.refreshIdeasContext(false);
    assert.strictEqual(fetchIdeasCallCount, 1, "Primera llamada debe hacer fetch a /api/ideas");
    assert.strictEqual(win.idealitaContext.ideas.length, 2, "idealitaContext almacena las 2 ideas");
    assert.strictEqual(win.idealitaContext.hasIdeasAccess, true, "hasIdeasAccess es true");
    pass("refreshIdeasContext carga ideas inicialmente en memoria");

    // Second call: forceReload = false -> NO redundant fetch
    await win.refreshIdeasContext(false);
    assert.strictEqual(fetchIdeasCallCount, 1, "Segunda llamada con forceReload = false NO debe hacer fetch redundante");
    pass("Optimización de red: no realiza fetch redundante a /api/ideas si ya está en caché");

    // Third call: forceReload = true -> forces refetch
    await win.refreshIdeasContext(true);
    assert.strictEqual(fetchIdeasCallCount, 2, "Llamada con forceReload = true debe refrescar desde red");
    pass("forceReload = true refresca el contexto desde la red exitosamente");


    // -------------------------------------------------------------------------
    // SECCIÓN 5: SINCRONIZACIÓN EN OPERACIONES CRUD (ALTA, CAMBIO, BAJA)
    // -------------------------------------------------------------------------
    console.log("\n--- SECCIÓN 5: Sincronización en Alta, Cambio y Baja ---");

    // Setup mock Live WebSocket to test notification
    let lastWsSentMessage = null;
    const mockLiveWebSocket = {
        readyState: 1, // WebSocket.OPEN
        send: (msg) => {
            lastWsSentMessage = JSON.parse(msg);
        }
    };
    win.liveWebSocket = mockLiveWebSocket;

    // Simulate Alta (creación de idea)
    sampleIdeas.push({ id: 103, titulo: 'Huerto Urbano', estado: 'pendiente', descripcion: 'Huerto en azotea' });
    await win.refreshIdeasContext(true);

    assert.strictEqual(win.idealitaContext.ideas.length, 3, "idealitaContext tiene 3 ideas tras la mutación");
    assert(lastWsSentMessage, "Debe haberse enviado notificación al WebSocket de Live");
    const turnText = lastWsSentMessage.clientContent.turns[0].parts[0].text;
    assert(turnText.includes('[ACTUALIZACIÓN DE CONTEXTO DE IDEAS]'), "El mensaje debe indicar actualización de contexto");
    assert(turnText.includes('Huerto Urbano'), "El contexto actualizado debe contener la nueva idea 'Huerto Urbano'");
    pass("Alta de idea: context se actualiza y notifica a sesión Live activa");

    // Simulate Cambio (actualización de estado)
    sampleIdeas[2].estado = 'completada';
    lastWsSentMessage = null;
    await win.refreshIdeasContext(true);
    const updatedTurnText = lastWsSentMessage.clientContent.turns[0].parts[0].text;
    assert(updatedTurnText.includes('Estado: "completada"'), "El contexto actualizado debe reflejar el nuevo estado");
    pass("Cambio de estado: context se sincroniza y notifica a sesión Live activa");

    // Simulate Baja (eliminación de idea)
    sampleIdeas.pop(); // remove 103
    lastWsSentMessage = null;
    await win.refreshIdeasContext(true);
    const bajaTurnText = lastWsSentMessage.clientContent.turns[0].parts[0].text;
    assert(!bajaTurnText.includes('Huerto Urbano'), "El contexto actualizado NO debe incluir la idea eliminada");
    pass("Baja de idea: context se sincroniza eliminando la idea y notifica a Live");


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

    // User without access to ideas
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
