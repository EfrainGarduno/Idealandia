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

        // - Verificar que el contexto contiene la instrucción explícita de falta de acceso:
        assert.ok(
            contextText.includes("--- ESTADO DE ACCESO A IDEAS ---"), 
            "El contexto DEBE incluir la sección de estado de acceso a Ideas."
        );
        assert.ok(
            contextText.includes("El usuario autenticado no tiene acceso a la funcionalidad Ideas."), 
            "El contexto DEBE declarar que el usuario autenticado no tiene acceso a Ideas."
        );
        assert.ok(
            contextText.includes("Usuario: Arturito Matus"), 
            "El contexto DEBE contener el nombre dinámico del usuario (Arturito Matus)."
        );
        assert.ok(
            contextText.includes('"Arturito Matus, no cuentas con acceso a la funcionalidad de Ideas, verifícalo con tu administrador para que te dé acceso."'), 
            "El contexto DEBE indicar exactamente la respuesta determinista esperada."
        );
        assert.strictEqual(
            contextText.includes("--- IDEAS DEL USUARIO ---"), 
            false, 
            "El contexto NO debe incluir listado de ideas para usuario sin permiso."
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
            lastMsg.textContent.includes("no cuentas con acceso a la funcionalidad de Ideas"), 
            false, 
            "Idealita NO debe mencionar espontáneamente falta de acceso a Ideas en pregunta general."
        );
        console.log("  ✓ Mensaje normal procesado exitosamente sin interrupción ni alertas falsas.");
        console.log("  ✓ Instrucción explícita de falta de acceso presente en contexto sin provocar mención espontánea.");

        // 4. Pregunta explícita por las Ideas del usuario
        console.log("\n--- TEST: Pregunta explícita por Ideas para usuario sin acceso ---");
        const beforeToolCallsCount = MockWebSocket.messagesSent.length;

        // Gemini evalúa la consulta o invoca la herramienta consultar_ideas_usuario
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

        // Verificar respuesta de la herramienta
        const newResponses = MockWebSocket.messagesSent.slice(beforeToolCallsCount);
        assert.ok(newResponses.length > 0, "Se debió enviar respuesta de la herramienta.");
        const toolResParsed = JSON.parse(newResponses[0]);
        assert.ok(toolResParsed.toolResponse, "La respuesta debe contener toolResponse.");
        
        const funcResp = toolResParsed.toolResponse.functionResponses[0];
        assert.strictEqual(funcResp.name, "consultar_ideas_usuario");
        assert.strictEqual(funcResp.response.sin_acceso, true, "La herramienta debe indicar sin_acceso: true");
        assert.strictEqual(
            funcResp.response.mensaje,
            "Arturito Matus, no cuentas con acceso a la funcionalidad de Ideas, verifícalo con tu administrador para que te dé acceso.",
            "La herramienta debe contener el mensaje determinista exacto."
        );

        // No debe haberse disparado el interceptor global con modal ni redirección
        assert.strictEqual(showModalCalls.length, 0, "No debe mostrarse modal de error durante consulta de herramienta.");
        assert.notStrictEqual(chatSection.style.display, 'none', "El chat debe permanecer abierto.");

        // Simular respuesta determinista de Idealita
        ws.onmessage({
            data: JSON.stringify({
                serverContent: {
                    outputTranscription: { text: "Arturito Matus, no cuentas con acceso a la funcionalidad de Ideas, verifícalo con tu administrador para que te dé acceso." },
                    turnComplete: true
                }
            })
        });

        const messagesAfterIdeasQuery = chatHistory.querySelectorAll('.idealita-message');
        const ideasReply = messagesAfterIdeasQuery[messagesAfterIdeasQuery.length - 1];
        assert.ok(
            ideasReply.textContent.includes("Arturito Matus, no cuentas con acceso a la funcionalidad de Ideas, verifícalo con tu administrador para que te dé acceso."),
            "Idealita debe responder exactamente la frase requerida con el nombre dinámico del usuario."
        );
        assert.strictEqual(
            ideasReply.textContent.includes("Mi idea innovadora"),
            false,
            "No debe mostrar ideas inventadas ni de otros usuarios."
        );
        console.log("  ✓ Al preguntar por ideas, responde deterministamente: '{nombre del usuario}, no cuentas con acceso a la funcionalidad de Ideas, verifícalo con tu administrador para que te dé acceso.'");

        // 5. Pregunta posterior no relacionada a Ideas (comportamiento conversacional continuo)
        console.log("\n--- TEST: Pregunta posterior no relacionada para usuario sin acceso ---");
        userInput.value = "¿Puedes darme un consejo para organizar mi día?";
        sendBtn.click();

        await new Promise(r => setTimeout(r, 60));

        ws.onmessage({
            data: JSON.stringify({
                serverContent: {
                    outputTranscription: { text: "¡Por supuesto, Arturito! Te sugiero priorizar tus 3 tareas más importantes al comenzar tu jornada." },
                    turnComplete: true
                }
            })
        });

        const messagesAfterSecondNormal = chatHistory.querySelectorAll('.idealita-message');
        const secondNormalReply = messagesAfterSecondNormal[messagesAfterSecondNormal.length - 1];
        assert.ok(
            secondNormalReply.textContent.includes("Te sugiero priorizar tus 3 tareas"),
            "Idealita debe continuar respondiendo normalmente a preguntas posteriores."
        );
        assert.strictEqual(
            secondNormalReply.textContent.includes("no cuentas con acceso a la funcionalidad de Ideas"),
            false,
            "La respuesta sobre falta de acceso NO debe repetirse en preguntas no relacionadas."
        );
        console.log("  ✓ El usuario puede seguir conversando normalmente con Idealita sobre otros temas tras la pregunta de Ideas.");

        // 6. TEST CASO A: Usuario CON acceso a Ideas
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
        assert.strictEqual(
            authContextText.includes("no cuentas con acceso a la funcionalidad de Ideas"),
            false,
            "Usuario con permiso NO debe tener leyenda de falta de acceso en contexto."
        );
        console.log("  ✓ Usuario con permiso recibe sus ideas en el contexto inicial normalmente sin leyenda de restricción.");

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

        // 7. TEST CASO C: Regresión Chat/Live
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
