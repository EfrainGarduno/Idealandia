const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

// Read index.html
const html = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');

console.log("=== INICIANDO PRUEBAS DE INTEGRACIÓN: IDEALITA RBAC IDEAS CONTEXT (PR #97) ===");

// Set up JSDOM environment
const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
});

const window = dom.window;
global.document = window.document;
global.window = window;
global.navigator = window.navigator;

// Mock marked and DOMPurify for chat rendering
window.marked = {
    parse: (txt) => `<p>${txt}</p>`
};
window.DOMPurify = {
    sanitize: (txt) => txt
};

// Mock Three.js
window.THREE = {
    Scene: class {},
    PerspectiveCamera: class { constructor() { this.position = {}; } },
    WebGLRenderer: class {
        constructor() { throw new Error("Mocked WebGL failure to trigger fallback"); }
    }
};
window.GLTFLoader = class {};
window.VRMLoaderPlugin = class {};

// Mock Web Audio API
window.AudioContext = class {
    constructor() {
        this.currentTime = 0;
        this.audioWorklet = {
            addModule: async () => {}
        };
        this.destination = {};
    }
    createBuffer(channels, length, sampleRate) {
        return {
            getChannelData: () => new Float32Array(length),
            duration: length / sampleRate
        };
    }
    createBufferSource() {
        return {
            connect: () => {},
            start: () => {},
            stop: () => {},
            onended: null
        };
    }
    createAnalyser() {
        return {
            fftSize: 256,
            frequencyBinCount: 128,
            connect: () => {},
            disconnect: () => {},
            getByteTimeDomainData: (arr) => arr.fill(128)
        };
    }
    createMediaStreamSource() {
        return { connect: () => {} };
    }
};

window.AudioWorkletNode = class {
    constructor() {
        this.port = { onmessage: null };
    }
    connect() {}
    disconnect() {}
};

window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

if (!window.navigator) window.navigator = {};
window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;

window.navigator.mediaDevices = {
    getUserMedia: async () => ({
        getTracks: () => []
    })
};

window.btoa = (str) => Buffer.from(str).toString('base64');
window.atob = (str) => Buffer.from(str, 'base64').toString();

// Track modal and navigation calls
let showModalCalls = [];
window.showModal = (msg) => {
    showModalCalls.push(msg);
};

// Mock WebSocket
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = 1; // OPEN
        MockWebSocket.instances.push(this);
        setTimeout(() => {
            if (this.onopen) this.onopen();
        }, 20);
    }
    send(data) {
        MockWebSocket.messagesSent.push(data);
    }
    close() {
        this.readyState = 3; // CLOSED
    }
}
MockWebSocket.instances = [];
MockWebSocket.messagesSent = [];
window.WebSocket = MockWebSocket;

// State control for mock fetch
let currentTestUser = {
    id: 10,
    usuario: 'arturito',
    nombre: 'Arturito Matus',
    rol: 'usuario_basico'
};
let mockIdeasAccess = false; // By default Arturito has NO ideas access

window.fetch = async (url, options) => {
    if (url === '/api/live-token') {
        return {
            ok: true,
            status: 200,
            json: async () => ({ token: 'mock-live-token' })
        };
    }

    if (url === '/docs/idealandia_manual.md') {
        return {
            ok: true,
            status: 200,
            text: async () => "# Manual de Idealandia\nPlataforma con asistente Idealita."
        };
    }

    if (url === '/api/me') {
        if (currentTestUser) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ user: currentTestUser })
            };
        }
        return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
    }

    if (url === '/api/menu') {
        return {
            ok: true,
            status: 200,
            json: async () => ([
                { id: 1, nombre: 'Inicio', ruta: '/' },
                { id: 2, nombre: 'Idealita', ruta: '/chat' }
            ])
        };
    }

    if (url.startsWith('/api/ideas')) {
        if (!mockIdeasAccess) {
            // RBAC Denied 403
            return {
                ok: false,
                status: 403,
                clone: function() { return this; },
                json: async () => ({
                    error: "Acceso no autorizado o vencido para esta funcionalidad.",
                    code: "RBAC_ACCESS_DENIED",
                    funcionalidad: "ideas"
                })
            };
        } else {
            // Authorized 200
            return {
                ok: true,
                status: 200,
                clone: function() { return this; },
                json: async () => ({
                    ideas: [
                        { id: 101, titulo: "Mi idea innovadora", estado: "pendiente", descripcion: "Detalles de idea" },
                        { id: 102, titulo: "Segunda idea", estado: "completada", descripcion: "Completada exitosamente" }
                    ]
                })
            };
        }
    }

    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
};

// Wait for DOMContentLoaded listener inside the script to execute
setTimeout(async () => {
    try {
        console.log("\n--- TEST CASO B: Usuario SIN acceso a Ideas (Arturito Matus) ---");
        
        // 1. Iniciar sesión como Arturito Matus
        currentTestUser = {
            id: 20,
            usuario: 'arturito_matus',
            nombre: 'Arturito Matus',
            rol: 'usuario_sin_ideas'
        };
        mockIdeasAccess = false;
        dom.window.currentUser = currentTestUser;
        showModalCalls = [];

        // Asegurar que la sección chat esté activa
        const chatSection = document.getElementById('chat');
        chatSection.style.display = 'block';

        // 2. Simular envío de mensaje normal (no relacionado a Ideas)
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        userInput.value = "¿Qué servicios ofrece Idealandia?";

        // Presionar Enviar
        sendBtn.click();

        // Esperar conexión WebSocket y envío de setup / context
        await new Promise(r => setTimeout(r, 100));

        const ws = MockWebSocket.instances[0];
        assert.ok(ws, "WebSocket de Idealita Live debió inicializarse.");

        // Simular que Gemini responde setupComplete
        ws.onmessage({
            data: JSON.stringify({ setupComplete: true })
        });

        // Esperar carga de contexto asíncrono
        await new Promise(r => setTimeout(r, 100));

        // 3. Verificaciones de seguridad y estabilidad:
        // - NO se debe haber mostrado modal de error fatal
        assert.strictEqual(
            showModalCalls.length, 
            0, 
            `No debió mostrarse modal de error para usuario sin ideas en chat. Llamadas: ${JSON.stringify(showModalCalls)}`
        );

        // - El chat NO se cerró (sigue visible)
        assert.notStrictEqual(chatSection.style.display, 'none', "La sección de chat no debe ocultarse.");

        // - Se debió enviar contexto inicial
        const contextMsgRaw = MockWebSocket.messagesSent.find(m => {
            try {
                const parsed = JSON.parse(m);
                return parsed.clientContent && parsed.clientContent.turns && 
                       parsed.clientContent.turns[0].parts[0].text.includes("Aquí tienes el contexto");
            } catch(e) { return false; }
        });
        assert.ok(contextMsgRaw, "Debió enviarse el contexto inicial de Idealita.");
        const contextText = JSON.parse(contextMsgRaw).clientContent.turns[0].parts[0].text;

        // - Verificar que el contexto incluye al usuario y manual
        assert.ok(contextText.includes("Arturito Matus"), "El contexto debe identificar al usuario Arturito Matus.");
        assert.ok(contextText.includes("MANUAL IDEALANDIA"), "El contexto debe incluir el manual.");

        // - Verificar que el contexto OMITIÓ la sección de Ideas
        assert.strictEqual(
            contextText.includes("--- IDEAS DEL USUARIO ---"), 
            false, 
            "El contexto NO debe incluir encabezado de ideas para usuario sin permiso."
        );
        assert.strictEqual(
            contextText.includes("No se pudieron obtener las ideas"), 
            false, 
            "El contexto NO debe incluir mensajes de error fatal sobre ideas."
        );

        // - Verificar que el mensaje del usuario se envió a Gemini
        const userTurnMsg = MockWebSocket.messagesSent.find(m => {
            try {
                const parsed = JSON.parse(m);
                return parsed.clientContent && parsed.clientContent.turns && 
                       parsed.clientContent.turns[0].parts[0].text === "¿Qué servicios ofrece Idealandia?";
            } catch(e) { return false; }
        });
        assert.ok(userTurnMsg, "El mensaje del usuario debió enviarse por WebSocket.");

        // - Simular respuesta de Gemini para pregunta normal
        ws.onmessage({
            data: JSON.stringify({
                serverContent: {
                    outputTranscription: { text: "Idealandia ofrece servicios digitales, cálculo de pensión y más." },
                    turnComplete: true
                }
            })
        });

        const chatHistory = document.getElementById('chat-history');
        const renderedMessages = chatHistory.querySelectorAll('.idealita-message');
        const lastMsg = renderedMessages[renderedMessages.length - 1];
        assert.ok(
            lastMsg.textContent.includes("Idealandia ofrece servicios digitales"), 
            "Idealita debe responder normalmente al mensaje del usuario."
        );
        assert.strictEqual(
            lastMsg.textContent.includes("no tienes acceso a Ideas"), 
            false, 
            "Idealita NO debe mencionar espontáneamente falta de acceso a Ideas en pregunta general."
        );
        console.log("  ✓ Mensaje normal procesado exitosamente sin interrupción ni alertas falsas.");
        console.log("  ✓ Contexto de Ideas omitido limpiamente sin provocar menciones espontáneas.");

        // 4. Pregunta explícita por las Ideas del usuario
        console.log("\n--- TEST: Pregunta explícita por Ideas para usuario sin acceso ---");
        const beforeToolCallsCount = MockWebSocket.messagesSent.length;

        // Gemini decide llamar a la herramienta consultar_ideas_usuario
        ws.onmessage({
            data: JSON.stringify({
                toolCall: {
                    functionCalls: [
                        { id: "call_arturito_ideas_1", name: "consultar_ideas_usuario", args: { tipo_consulta: "todas" } }
                    ]
                }
            })
        });

        await new Promise(r => setTimeout(r, 80));

        // Verificar que la herramienta respondió con falta de acceso sin cerrar el chat
        const newResponses = MockWebSocket.messagesSent.slice(beforeToolCallsCount);
        assert.ok(newResponses.length > 0, "Se debió enviar respuesta de la herramienta.");
        const toolResParsed = JSON.parse(newResponses[0]);
        assert.ok(toolResParsed.toolResponse, "La respuesta debe contener toolResponse.");
        
        const funcResp = toolResParsed.toolResponse.functionResponses[0];
        assert.strictEqual(funcResp.name, "consultar_ideas_usuario");
        assert.strictEqual(funcResp.response.sin_acceso, true, "La herramienta debe indicar sin_acceso: true");
        assert.ok(
            funcResp.response.error.includes("no tiene acceso a la funcionalidad de Ideas"),
            "La herramienta debe reportar que el usuario no tiene acceso a la funcionalidad de Ideas."
        );

        // No debe haberse disparado el interceptor global con modal ni redirección
        assert.strictEqual(showModalCalls.length, 0, "No debe mostrarse modal de error durante consulta de herramienta.");
        assert.notStrictEqual(chatSection.style.display, 'none', "El chat debe permanecer abierto.");

        // Simular respuesta de Gemini informando la falta de acceso de forma natural
        ws.onmessage({
            data: JSON.stringify({
                serverContent: {
                    outputTranscription: { text: "En este momento no tienes acceso a la funcionalidad de Ideas, por lo que no puedo consultar tus ideas." },
                    turnComplete: true
                }
            })
        });

        const messagesAfterIdeasQuery = chatHistory.querySelectorAll('.idealita-message');
        const ideasReply = messagesAfterIdeasQuery[messagesAfterIdeasQuery.length - 1];
        assert.ok(
            ideasReply.textContent.includes("no tienes acceso a la funcionalidad de Ideas"),
            "Idealita debe responder que no tiene acceso a Ideas."
        );
        assert.strictEqual(
            ideasReply.textContent.includes("Mi idea innovadora"),
            false,
            "No debe mostrar ideas inventadas ni de otros usuarios."
        );
        console.log("  ✓ Al preguntar por ideas, responde de manera natural que no tiene acceso a la funcionalidad Ideas.");
        console.log("  ✓ No se inventaron ideas ni se reutilizaron ideas de otros.");

        // 5. TEST CASO A: Usuario CON acceso a Ideas
        console.log("\n--- TEST CASO A: Usuario CON acceso a Ideas ---");
        // Detener live previo
        window.eval("if (typeof stopLive === 'function') stopLive();");
        currentTestUser = {
            id: 30,
            usuario: 'usuario_pro',
            nombre: 'Elena Creadora',
            rol: 'emprendedor'
        };
        mockIdeasAccess = true;
        dom.window.currentUser = currentTestUser;
        showModalCalls = [];

        // Enviar nuevo mensaje para iniciar sesión de usuario con acceso
        userInput.value = "Hola Idealita";
        sendBtn.click();

        await new Promise(r => setTimeout(r, 100));
        const wsUserWithIdeas = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        assert.ok(wsUserWithIdeas, "Nuevo WebSocket debe haberse abierto.");

        wsUserWithIdeas.onmessage({
            data: JSON.stringify({ setupComplete: true })
        });

        await new Promise(r => setTimeout(r, 100));

        const authorizedContextMsg = MockWebSocket.messagesSent.find(m => {
            try {
                const parsed = JSON.parse(m);
                return parsed.clientContent && parsed.clientContent.turns && 
                       parsed.clientContent.turns[0].parts[0].text.includes("--- IDEAS DEL USUARIO ---");
            } catch(e) { return false; }
        });
        assert.ok(authorizedContextMsg, "Usuario con permiso DEBE incluir sus ideas en el contexto.");
        const authContextText = JSON.parse(authorizedContextMsg).clientContent.turns[0].parts[0].text;
        assert.ok(authContextText.includes("Mi idea innovadora"), "Debe incluir las ideas reales del usuario.");
        assert.ok(authContextText.includes("Elena Creadora"), "Debe identificar a la usuaria Elena Creadora.");
        console.log("  ✓ Usuario con permiso recibe sus ideas en el contexto inicial normalmente.");

        // Consulta de ideas vía tool call para usuario autorizado
        const countBeforeAuthTool = MockWebSocket.messagesSent.length;
        wsUserWithIdeas.onmessage({
            data: JSON.stringify({
                toolCall: {
                    functionCalls: [
                        { id: "call_elena_ideas_1", name: "consultar_ideas_usuario", args: { tipo_consulta: "todas" } }
                    ]
                }
            })
        });

        await new Promise(r => setTimeout(r, 80));
        const authToolResponseRaw = MockWebSocket.messagesSent.slice(countBeforeAuthTool);
        assert.ok(authToolResponseRaw.length > 0, "Tool call debió responder.");
        const authToolResp = JSON.parse(authToolResponseRaw[0]).toolResponse.functionResponses[0];
        assert.strictEqual(authToolResp.name, "consultar_ideas_usuario");
        assert.ok(Array.isArray(authToolResp.response.result), "Debe devolver array de ideas.");
        assert.strictEqual(authToolResp.response.result[0].titulo, "Mi idea innovadora");
        console.log("  ✓ Tool call consultar_ideas_usuario devuelve ideas reales para usuario autorizado.");

        // 6. TEST CASO C: Regresión Chat/Live
        console.log("\n--- TEST CASO C: Verificación de Regresión Chat/Live ---");
        // Verificar setup systemInstruction
        const initialSetupMsg = JSON.parse(MockWebSocket.messagesSent[0]);
        assert.ok(initialSetupMsg.setup.systemInstruction.parts[0].text.includes("Eres Idealita, la asistente personal de Idealandia"));
        assert.ok(initialSetupMsg.setup.systemInstruction.parts[0].text.includes("funcionalidad de Ideas"));
        assert.ok(initialSetupMsg.setup.systemInstruction.parts[0].text.includes("NUNCA menciones espontáneamente la falta de acceso a Ideas"));

        // Verificar deduplicación de transcripción en streaming
        wsUserWithIdeas.onmessage({
            data: JSON.stringify({ serverContent: { outputTranscription: { text: "Parte 1 " } } })
        });
        wsUserWithIdeas.onmessage({
            data: JSON.stringify({ serverContent: { outputTranscription: { text: "Parte 2" } } })
        });
        wsUserWithIdeas.onmessage({
            data: JSON.stringify({ serverContent: { turnComplete: true } })
        });

        const messagesFinal = chatHistory.querySelectorAll('.idealita-message');
        const lastFinalMsg = messagesFinal[messagesFinal.length - 1];
        assert.ok(lastFinalMsg.textContent.includes("Parte 1 Parte 2"), "La transcripción streaming acumulativa/incremental funciona.");

        console.log("  ✓ Verificación de configuración Live, WebSocket y transcripciones superada.");

        console.log("\n=== TODAS LAS PRUEBAS DE IDEALITA RBAC IDEAS CONTEXT PASARON EXITOSAMENTE ===");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ Error en las pruebas:", err);
        process.exit(1);
    }
}, 500);
