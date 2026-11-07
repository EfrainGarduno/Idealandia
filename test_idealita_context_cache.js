const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

async function runTestSuite() {
    console.log('======================================================================');
    console.log('  SUITE DE PRUEBAS PR #96: CACHÉ Y SINCRONIZACIÓN DE CONTEXTO IDEALITA');
    console.log('======================================================================\n');

    const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    // Estado simulado del backend
    let currentSessionUser = { id: 101, usuario: 'usuarioA', nombre: 'Usuario Alfa' };
    let ideasDb = {
        101: [
            { id: 1, usuario_id: 101, titulo: 'Idea Alfa 1', descripcion: 'Primera idea de Alfa', estado: 'pendiente', fecha: '2026-11-06T10:00:00Z' },
            { id: 2, usuario_id: 101, titulo: 'Idea Alfa 2', descripcion: 'Segunda idea de Alfa', estado: 'en progreso', fecha: '2026-11-06T11:00:00Z' }
        ],
        202: [
            { id: 3, usuario_id: 202, titulo: 'Idea Beta 1', descripcion: 'Idea secreta de Beta', estado: 'pendiente', fecha: '2026-11-06T12:00:00Z' }
        ]
    };

    let fetchIdeasCallCount = 0;
    let fetchManualCallCount = 0;
    let capturedWsMessages = [];

    // Mock WebSocket
    class MockWebSocket {
        constructor(url) {
            this.url = url;
            this.readyState = 1;
            setTimeout(() => {
                if (this.onopen) this.onopen();
                if (this.onmessage) {
                    this.onmessage({ data: JSON.stringify({ setupComplete: true }) });
                }
            }, 10);
        }
        send(data) {
            capturedWsMessages.push(JSON.parse(data));
        }
        close() {}
    }

    let capturedWindow = null;

    const dom = new JSDOM(htmlContent, {
        runScripts: 'dangerously',
        url: 'http://localhost/',
        beforeParse(win) {
            capturedWindow = win;
            win.WebSocket = MockWebSocket;
            win.showModal = () => {};
            win.showConfirm = async () => true;

            win.matchMedia = win.matchMedia || function() {
                return {
                    matches: false,
                    addListener: function() {},
                    removeListener: function() {},
                    addEventListener: function() {},
                    removeEventListener: function() {}
                };
            };

            win.AudioContext = class {
                constructor() {
                    this.state = 'running';
                }
                createAnalyser() {
                    return {
                        connect: () => {},
                        disconnect: () => {},
                        frequencyBinCount: 16,
                        getByteFrequencyData: () => {}
                    };
                }
                createMediaStreamSource() {
                    return { connect: () => {}, disconnect: () => {} };
                }
                close() { return Promise.resolve(); }
            };
            win.webkitAudioContext = win.AudioContext;

            win.navigator.mediaDevices = {
                getUserMedia: async () => ({
                    getTracks: () => [{ stop: () => {} }]
                })
            };

            win.fetch = async (url, options = {}) => {
                const method = (options.method || 'GET').toUpperCase();

                if (url === '/docs/idealandia_manual.md') {
                    fetchManualCallCount++;
                    return {
                        ok: true,
                        status: 200,
                        text: async () => 'MANUAL DE IDEALANDIA MOCK: Plataforma de ideas y servicios digitales.'
                    };
                }

                if (url === '/api/me') {
                    if (currentSessionUser) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({ user: currentSessionUser })
                        };
                    } else {
                        return {
                            ok: false,
                            status: 401,
                            json: async () => ({ error: 'No autorizado' })
                        };
                    }
                }

                if (url === '/api/menu') {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => [
                            { id: 1, nombre: 'Inicio', funcionalidad_id: 1, parent_id: null, publico: 1, orden: 1 },
                            { id: 2, nombre: 'Ideas', funcionalidad_id: 2, parent_id: null, publico: 1, orden: 2 }
                        ]
                    };
                }

                if (url === '/api/live-token') {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ token: 'mock-live-token' })
                    };
                }

                if (url === '/api/ideas' && method === 'GET') {
                    fetchIdeasCallCount++;
                    if (!currentSessionUser) {
                        return { ok: false, status: 401, json: async () => ({ error: 'No autorizado' }) };
                    }
                    const userIdeas = ideasDb[currentSessionUser.id] || [];
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ ideas: JSON.parse(JSON.stringify(userIdeas)) })
                    };
                }

                if (url === '/api/ideas' && method === 'POST') {
                    if (!currentSessionUser) {
                        return { ok: false, status: 401, json: async () => ({ error: 'No autorizado' }) };
                    }
                    const body = JSON.parse(options.body);
                    const newIdea = {
                        id: Date.now(),
                        usuario_id: currentSessionUser.id,
                        titulo: body.titulo,
                        descripcion: body.descripcion,
                        estado: body.estado || 'pendiente',
                        fecha: new Date().toISOString()
                    };
                    if (!ideasDb[currentSessionUser.id]) ideasDb[currentSessionUser.id] = [];
                    ideasDb[currentSessionUser.id].push(newIdea);
                    return {
                        ok: true,
                        status: 201,
                        json: async () => ({ message: 'Idea creada exitosamente.', id: newIdea.id })
                    };
                }

                if (url.match(/\/api\/ideas\/\d+\/estado/) && method === 'PUT') {
                    const ideaId = parseInt(url.split('/')[3]);
                    const body = JSON.parse(options.body);
                    const userIdeas = ideasDb[currentSessionUser.id] || [];
                    const target = userIdeas.find(i => i.id === ideaId);
                    if (target) {
                        target.estado = body.estado;
                        return { ok: true, status: 200, json: async () => ({ message: 'Estado actualizado' }) };
                    }
                    return { ok: false, status: 404, json: async () => ({ error: 'No encontrada' }) };
                }

                if (url.match(/\/api\/ideas\/\d+$/) && method === 'DELETE') {
                    const ideaId = parseInt(url.split('/')[3]);
                    if (ideasDb[currentSessionUser.id]) {
                        ideasDb[currentSessionUser.id] = ideasDb[currentSessionUser.id].filter(i => i.id !== ideaId);
                    }
                    return { ok: true, status: 200, json: async () => ({ message: 'Idea eliminada correctamente.' }) };
                }

                if (url === '/api/logout' && method === 'POST') {
                    currentSessionUser = null;
                    return { ok: true, status: 200, json: async () => ({ message: 'Logout exitoso' }) };
                }

                if (url === '/api/login' && method === 'POST') {
                    const body = JSON.parse(options.body);
                    if (body.usuario === 'usuarioB') {
                        currentSessionUser = { id: 202, usuario: 'usuarioB', nombre: 'Usuario Beta' };
                    } else {
                        currentSessionUser = { id: 101, usuario: 'usuarioA', nombre: 'Usuario Alfa' };
                    }
                    return { ok: true, status: 200, json: async () => ({ message: 'Login exitoso', user: currentSessionUser }) };
                }

                return { ok: true, status: 200, json: async () => ({}) };
            };
        }
    });

    const window = capturedWindow;

    // Esperar a que checkAuthStatus y loadIdealitaContext inicialicen
    await new Promise(r => setTimeout(r, 150));

    // -------------------------------------------------------------------------
    // Bloque 1: Carga y Almacenamiento Inicial en Memoria
    // -------------------------------------------------------------------------
    console.log('--- Bloque 1: Carga Inicial de Contexto en Memoria ---');

    if (!window.idealitaContext) {
        throw new Error('[1.1] window.idealitaContext debe existir en memoria.');
    }
    if (!window.idealitaContext.manual || !window.idealitaContext.manual.includes('MANUAL DE IDEALANDIA MOCK')) {
        throw new Error('[1.2] El manual debe quedar precargado en memoria en window.idealitaContext.manual.');
    }
    if (window.cachedManualText !== window.idealitaContext.manual) {
        throw new Error('[1.3] window.cachedManualText debe estar sincronizado con window.idealitaContext.manual.');
    }
    if (!Array.isArray(window.idealitaContext.ideas) || window.idealitaContext.ideas.length !== 2) {
        throw new Error(`[1.4] Las ideas de Usuario Alfa deben estar en memoria (esperadas 2, obtenidas ${window.idealitaContext.ideas ? window.idealitaContext.ideas.length : 0}).`);
    }
    if (window.idealitaContext.userId !== 101) {
        throw new Error(`[1.5] El userId en contexto debe ser 101, encontrado ${window.idealitaContext.userId}`);
    }
    if (window.idealitaContext.status !== 'ready') {
        throw new Error(`[1.6] El estado del contexto debe ser 'ready', encontrado '${window.idealitaContext.status}'`);
    }

    const initialFetchIdeasCalls = fetchIdeasCallCount;
    const initialFetchManualCalls = fetchManualCallCount;
    if (initialFetchIdeasCalls !== 1) {
        throw new Error(`[1.7] Se esperaba exactamente 1 llamada inicial a /api/ideas, llamadas: ${initialFetchIdeasCalls}`);
    }
    console.log('  ✓ [1.1-1.7] Contexto inicial cargado y disponible en memoria (Manual + 2 Ideas de Usuario Alfa).');

    // -------------------------------------------------------------------------
    // Bloque 2: Reutilización de Contexto en Conexiones Live (CERO peticiones adicionales)
    // -------------------------------------------------------------------------
    console.log('\n--- Bloque 2: Conexión Gemini Live Reutiliza Memoria ---');

    // Iniciar conexión Gemini Live
    capturedWsMessages = [];
    await window.eval('startLive(false)');
    await new Promise(r => setTimeout(r, 60));

    // Verificar que se envió clientContent con el contexto
    const setupMsg1 = capturedWsMessages.find(m => m.clientContent && m.clientContent.turns);
    if (!setupMsg1) {
        throw new Error('[2.1] No se envió el mensaje de contexto clientContent a Gemini Live.');
    }
    const contextSent1 = setupMsg1.clientContent.turns[0].parts[0].text;
    if (!contextSent1.includes('MANUAL DE IDEALANDIA MOCK')) {
        throw new Error('[2.2] El contexto enviado no incluye el manual.');
    }
    if (!contextSent1.includes('Usuario Alfa')) {
        throw new Error('[2.3] El contexto enviado no incluye la identidad del usuario.');
    }
    if (!contextSent1.includes('Idea Alfa 1') || !contextSent1.includes('Idea Alfa 2')) {
        throw new Error('[2.4] El contexto enviado no incluye las ideas del usuario en memoria.');
    }

    // VERIFICACIÓN CLAVE: NO DEBE HABER VUELTO A CONSULTAR /api/ideas NI /docs/idealandia_manual.md
    if (fetchIdeasCallCount !== initialFetchIdeasCalls) {
        throw new Error(`[2.5] ¡FALLO DE EFICIENCIA! Gemini Live volvió a consultar /api/ideas (${fetchIdeasCallCount} llamadas vs ${initialFetchIdeasCalls} iniciales).`);
    }
    if (fetchManualCallCount !== initialFetchManualCalls) {
        throw new Error(`[2.6] ¡FALLO DE EFICIENCIA! Gemini Live volvió a descargar el manual.`);
    }
    console.log('  ✓ [2.1-2.6] Conexión Live 1 utilizó el contexto en memoria SIN hacer peticiones de red adicionales.');

    // Detener y reiniciar sesión Live (Segunda conexión Live)
    window.eval('stopLive()');
    capturedWsMessages = [];
    await window.eval('startLive(false)');
    await new Promise(r => setTimeout(r, 60));

    const setupMsg2 = capturedWsMessages.find(m => m.clientContent && m.clientContent.turns);
    if (!setupMsg2) {
        throw new Error('[2.7] Conexión Live 2 no envió mensaje de contexto.');
    }
    if (fetchIdeasCallCount !== initialFetchIdeasCalls) {
        throw new Error(`[2.8] Conexión Live 2 provocó llamadas a /api/ideas.`);
    }
    console.log('  ✓ [2.7-2.8] Conexión Live 2 reutilizó exitosamente la misma copia en memoria (0 consultas a /api/ideas).');

    // -------------------------------------------------------------------------
    // Bloque 3: Sincronización en Crear, Modificar y Eliminar Ideas
    // -------------------------------------------------------------------------
    console.log('\n--- Bloque 3: Sincronización del Contexto en Memoria ante Cambios ---');

    // 3.1 Crear idea mediante formulario
    window.document.getElementById('idea-titulo').value = 'Idea Alfa 3 (Nueva)';
    window.document.getElementById('idea-descripcion').value = 'Tercera idea creada durante la sesión';
    window.document.getElementById('idea-estado').value = 'pendiente';
    window.document.getElementById('btn-agregar-idea').click();
    await new Promise(r => setTimeout(r, 60));

    const ideasAfterAdd = window.idealitaContext.ideas;
    if (!ideasAfterAdd || ideasAfterAdd.length !== 3) {
        throw new Error(`[3.1] El contexto en memoria no se actualizó al agregar idea (esperadas 3, encontradas ${ideasAfterAdd ? ideasAfterAdd.length : 0})`);
    }
    if (!ideasAfterAdd.find(i => i.titulo === 'Idea Alfa 3 (Nueva)')) {
        throw new Error('[3.1] La nueva idea no se encuentra en el contexto en memoria.');
    }
    console.log('  ✓ [3.1] Crear idea actualizó automáticamente el contexto en memoria (3 ideas ahora).');

    // 3.2 Modificar estado de la Idea 2 (de en progreso a completada)
    const allSelects = window.document.querySelectorAll('#lista-ideas select');
    const selectIdea2 = allSelects.length > 1 ? allSelects[1] : allSelects[0];
    if (selectIdea2) {
        selectIdea2.value = 'completada';
        selectIdea2.dispatchEvent(new window.Event('change'));
        await new Promise(r => setTimeout(r, 60));

        const updatedIdea2 = window.idealitaContext.ideas.find(i => i.id === 2);
        if (!updatedIdea2 || updatedIdea2.estado !== 'completada') {
            throw new Error('[3.2] El estado modificado de Idea 2 no se reflejó en window.idealitaContext.ideas');
        }
        console.log('  ✓ [3.2] Modificar estado de idea sincronizó el contexto en memoria (Idea 2 ahora completada).');
    }

    // 3.3 Eliminar Idea 1 (que sigue en estado pendiente)
    const deleteBtn = window.document.querySelector('#lista-ideas button');
    if (deleteBtn) {
        deleteBtn.click();
        const confirmBtn = window.document.querySelector('#custom-modal-buttons .custom-modal-btn.primary');
        if (confirmBtn) confirmBtn.click();
        await new Promise(r => setTimeout(r, 80));

        const ideasAfterDelete = window.idealitaContext.ideas;
        if (ideasAfterDelete.length !== 2) {
            throw new Error(`[3.3] Eliminar idea debió reducir las ideas en memoria a 2, encontradas ${ideasAfterDelete.length}`);
        }
        if (ideasAfterDelete.find(i => i.id === 1)) {
            throw new Error('[3.3] La idea 1 eliminada todavía permanece en window.idealitaContext.ideas');
        }
        console.log('  ✓ [3.3] Eliminar idea actualizó el contexto en memoria (Idea 1 removida, 2 ideas restantes).');
    }

    // 3.4 Verificar que una nueva conexión Live recibe los cambios actualizados de memoria
    window.eval('stopLive()');
    capturedWsMessages = [];
    const callsBeforeSyncLive = fetchIdeasCallCount;
    await window.eval('startLive(false)');
    await new Promise(r => setTimeout(r, 60));

    const syncLiveMsg = capturedWsMessages.find(m => m.clientContent && m.clientContent.turns);
    const syncText = syncLiveMsg.clientContent.turns[0].parts[0].text;
    if (!syncText.includes('Idea Alfa 3 (Nueva)')) {
        throw new Error('[3.4] Nueva sesión Live no recibió la idea recién creada en el contexto.');
    }
    if (syncText.includes("Idea Alfa 1")) {
        throw new Error('[3.4] Nueva sesión Live incluyó la idea 1 que ya fue eliminada.');
    }
    if (fetchIdeasCallCount !== callsBeforeSyncLive) {
        throw new Error('[3.4] Live realizó peticiones a /api/ideas en lugar de usar la memoria sincronizada.');
    }
    console.log('  ✓ [3.4] Nueva conexión Live reflejó las ideas sincronizadas directamente desde memoria (Idea 3 incluida, Idea 1 omitida).');

    // -------------------------------------------------------------------------
    // Bloque 4: Seguridad y Aislamiento de Usuario (Logout y Cambio de Usuario)
    // -------------------------------------------------------------------------
    console.log('\n--- Bloque 4: Seguridad y Aislamiento de Contexto entre Usuarios ---');

    // 4.1 Logout
    window.document.getElementById('btn-logout').click();
    await new Promise(r => setTimeout(r, 80));

    if (window.idealitaContext.ideas !== null) {
        throw new Error('[4.1] Al cerrar sesión, window.idealitaContext.ideas DEBE ser null para evitar fugas.');
    }
    if (window.idealitaContext.userId !== null) {
        throw new Error('[4.2] Al cerrar sesión, window.idealitaContext.userId DEBE ser null.');
    }
    if (window.currentUser !== null) {
        throw new Error('[4.3] Al cerrar sesión, window.currentUser DEBE ser null.');
    }

    // Live en modo invitado
    capturedWsMessages = [];
    await window.eval('startLive(false)');
    await new Promise(r => setTimeout(r, 60));
    const guestMsg = capturedWsMessages.find(m => m.clientContent && m.clientContent.turns);
    const guestText = guestMsg.clientContent.turns[0].parts[0].text;
    if (guestText.includes('Idea Alfa') || guestText.includes('Usuario Alfa')) {
        throw new Error('[4.4] ¡FUGA DE DATOS GRAVE! Las ideas de Usuario Alfa aparecieron en sesión no autenticada.');
    }
    if (!guestText.includes('El usuario actual NO está autenticado')) {
        throw new Error('[4.5] El contexto invitado debe indicar que no está autenticado.');
    }
    console.log('  ✓ [4.1-4.5] Logout limpió completamente las ideas y el usuario del contexto.');

    // 4.2 Login con Usuario B
    window.eval('stopLive()');
    window.document.getElementById('login-usuario').value = 'usuarioB';
    window.document.getElementById('login-password').value = 'secret';
    window.document.getElementById('btn-login').click();
    await new Promise(r => setTimeout(r, 120));

    if (!window.currentUser || window.currentUser.id !== 202) {
        throw new Error('[4.6] Login con Usuario B falló.');
    }
    if (window.idealitaContext.userId !== 202) {
        throw new Error(`[4.7] El contexto debe corresponder a Usuario B (202), encontrado ${window.idealitaContext.userId}`);
    }
    if (!window.idealitaContext.ideas || window.idealitaContext.ideas.length !== 1) {
        throw new Error(`[4.8] Usuario B debe tener exactamente 1 idea, encontradas ${window.idealitaContext.ideas ? window.idealitaContext.ideas.length : 0}`);
    }
    if (window.idealitaContext.ideas[0].titulo !== 'Idea Beta 1') {
        throw new Error('[4.9] Usuario B debe tener únicamente su propia idea (Idea Beta 1).');
    }

    // Live con Usuario B
    capturedWsMessages = [];
    await window.eval('startLive(false)');
    await new Promise(r => setTimeout(r, 60));
    const userBMsg = capturedWsMessages.find(m => m.clientContent && m.clientContent.turns);
    const userBText = userBMsg.clientContent.turns[0].parts[0].text;
    if (userBText.includes('Idea Alfa') || userBText.includes('Usuario Alfa')) {
        throw new Error('[4.10] ¡FUGA DE DATOS! Se encontraron datos de Usuario Alfa en la sesión de Usuario B.');
    }
    if (!userBText.includes('Idea Beta 1') || !userBText.includes('Usuario Beta')) {
        throw new Error('[4.11] El contexto de Usuario B no incluyó sus propios datos.');
    }
    console.log('  ✓ [4.6-4.11] Aislamiento de sesión certificado: Usuario B tiene únicamente sus ideas y CERO datos de Usuario Alfa.');

    console.log('\n======================================================================');
    console.log('  ✅ TODAS LAS PRUEBAS DE CACHÉ DE CONTEXTO DE IDEALITA PASARON (100%)');
    console.log('======================================================================');
    process.exit(0);
}

runTestSuite().catch(err => {
    console.error('\n❌ ERROR EN PRUEBA DE CONTEXTO IDEALITA:', err.message);
    process.exit(1);
});
