const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

console.log('======================================================================');
console.log('INICIANDO PRUEBAS DE UX: INTEGRACIÓN Y ESTADO DE VOZ Y CHAT (PR #98)');
console.log('======================================================================');

const html = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');

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
    parse: (text) => `<p>${text}</p>`
};
window.DOMPurify = {
    sanitize: (html) => html
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

// Mock fetch
window.fetch = async (url) => {
    if (url === '/api/live-token') {
        return {
            ok: true,
            json: async () => ({ token: 'mock-token-xyz' })
        };
    }
    if (url.startsWith('/api/ideas')) {
        return {
            ok: true,
            json: async () => ({ ideas: [] })
        };
    }
    if (url === '/docs/idealandia_manual.md') {
        return {
            ok: true,
            text: async () => "# Manual Idealandia"
        };
    }
    if (url === '/api/menu') {
        return {
            ok: true,
            json: async () => [{ id: 1, nombre: 'Inicio', ruta: '/', hijos: [] }]
        };
    }
    if (url === '/api/me') {
        return { ok: false, status: 401 };
    }
    return { ok: false, status: 404 };
};

// Mock Web Audio API
window.AudioContext = class {
    constructor() {
        this.audioWorklet = { addModule: async () => {} };
        this.destination = {};
        this.currentTime = 0;
    }
    createBuffer() { return { getChannelData: () => ({ set: () => {} }), duration: 1 }; }
    createBufferSource() { return { connect: () => {}, start: () => {}, onended: null }; }
    createAnalyser() {
        return {
            fftSize: 256,
            frequencyBinCount: 128,
            connect: () => {},
            disconnect: () => {},
            getByteFrequencyData: () => {},
            getByteTimeDomainData: () => {}
        };
    }
    createMediaStreamSource() { return { connect: () => {} }; }
    close() { return Promise.resolve(); }
};

window.AudioWorkletNode = class {
    constructor() { this.port = { onmessage: null }; }
    connect() {}
    disconnect() {}
};

window.matchMedia = window.matchMedia || function() {
    return { matches: false, addListener: () => {}, removeListener: () => {} };
};

window.navigator.mediaDevices = {
    getUserMedia: async () => ({
        getTracks: () => [{ stop: () => {} }]
    })
};

window.btoa = (str) => Buffer.from(str).toString('base64');
window.atob = (str) => Buffer.from(str, 'base64').toString();
window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock WebSocket class
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = 0; // CONNECTING
        MockWebSocket.latestInstance = this;
        MockWebSocket.instances.push(this);

        setTimeout(() => {
            if (this.shouldFailOpen) {
                if (this.onerror) this.onerror(new Error("Connection failed"));
                return;
            }
            this.readyState = 1; // OPEN
            if (this.onopen) this.onopen();

            // Simulate Gemini setupComplete
            setTimeout(() => {
                if (this.onmessage && this.readyState === 1) {
                    this.onmessage({
                        data: JSON.stringify({ setupComplete: true })
                    });
                }
            }, 10);
        }, 20);
    }

    send(data) {
        MockWebSocket.messagesSent.push(data);
        const parsed = JSON.parse(data);

        // If client content sent via text chat, mock response
        if (parsed.clientContent) {
            setTimeout(() => {
                if (this.onmessage) {
                    this.onmessage({
                        data: JSON.stringify({
                            serverContent: {
                                modelTurn: {
                                    parts: [{ text: "¡Hola! Respuesta simulada de Idealita." }]
                                }
                            }
                        })
                    });
                }
            }, 10);
        }
    }

    close() {
        this.readyState = 3; // CLOSED
        if (this.onclose) this.onclose();
    }
}
MockWebSocket.instances = [];
MockWebSocket.messagesSent = [];
MockWebSocket.latestInstance = null;
window.WebSocket = MockWebSocket;

async function waitForReady(timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (typeof window.isVoiceActive === 'function' && document.getElementById('btn-start-live')) {
            return;
        }
        await new Promise(r => setTimeout(r, 20));
    }
    throw new Error("Timed out waiting for index.html scripts to initialize");
}

(async () => {
    try {
        await waitForReady();

        const btnStartLive = document.getElementById('btn-start-live');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const chatHistory = document.getElementById('chat-history');

        assert.ok(btnStartLive, 'El botón btn-start-live debe existir en el DOM');
        assert.ok(userInput, 'El input user-input debe existir en el DOM');
        assert.ok(sendBtn, 'El botón send-btn debe existir en el DOM');

        // ---------------------------------------------------------------------
        // 1. Chat normal -> botón dice "Iniciar con Voz" y controles habilitados
        // ---------------------------------------------------------------------
        console.log('\n--- 1. Estado Inicial de Chat Normal ---');
        assert.strictEqual(
            btnStartLive.textContent.trim(),
            'Iniciar con Voz',
            '1.1 El texto del botón debe ser exactamente "Iniciar con Voz" en reposo'
        );
        assert.strictEqual(
            userInput.disabled,
            false,
            '1.2 El input de texto debe estar habilitado en reposo'
        );
        assert.strictEqual(
            sendBtn.disabled,
            false,
            '1.3 El botón Enviar debe estar habilitado en reposo'
        );
        assert.strictEqual(
            window.isVoiceActive(),
            false,
            '1.4 isVoiceActive() debe reportar false en reposo'
        );
        console.log('  ✓ 1. Chat normal: Botón muestra "Iniciar con Voz" y controles de texto habilitados.');

        // ---------------------------------------------------------------------
        // 2 & 3 & 4. Iniciar voz -> botón "Terminar con Voz" y controles deshabilitados
        // ---------------------------------------------------------------------
        console.log('\n--- 2, 3 y 4. Inicio de Voz y Conexión Activa ---');
        btnStartLive.click();

        // Esperar a que MockWebSocket conecte y reciba setupComplete
        await new Promise(r => setTimeout(r, 60));

        assert.strictEqual(
            window.isVoiceActive(),
            true,
            '2.1 isVoiceActive() debe ser true una vez establecida la conexión de voz'
        );
        assert.strictEqual(
            btnStartLive.textContent.trim(),
            'Terminar con Voz',
            '2.2 El botón debe cambiar su texto a "Terminar con Voz"'
        );
        assert.strictEqual(
            userInput.disabled,
            true,
            '3.1 El campo de texto de chat debe estar deshabilitado con voz activa'
        );
        assert.strictEqual(
            sendBtn.disabled,
            true,
            '4.1 El botón Enviar debe estar deshabilitado con voz activa'
        );
        console.log('  ✓ 2. Se inicia voz: Botón cambia a "Terminar con Voz".');
        console.log('  ✓ 3. Voz activa: Campo de texto deshabilitado (disabled = true).');
        console.log('  ✓ 4. Voz activa: Botón Enviar deshabilitado (disabled = true).');

        // ---------------------------------------------------------------------
        // 5. Pulsar "Terminar con Voz" -> conexión termina y controles se habilitan
        // ---------------------------------------------------------------------
        console.log('\n--- 5. Pulsar "Terminar con Voz" ---');
        btnStartLive.click(); // Al hacer clic mientras está activa la voz, finaliza la conexión
        await new Promise(r => setTimeout(r, 40));

        assert.strictEqual(
            window.isVoiceActive(),
            false,
            '5.1 isVoiceActive() debe ser false tras pulsar Terminar con Voz'
        );
        assert.strictEqual(
            btnStartLive.textContent.trim(),
            'Iniciar con Voz',
            '5.2 El botón debe volver a mostrar "Iniciar con Voz"'
        );
        assert.strictEqual(
            userInput.disabled,
            false,
            '5.3 El campo de texto debe rehabilitarse tras terminar voz'
        );
        assert.strictEqual(
            sendBtn.disabled,
            false,
            '5.4 El botón Enviar debe rehabilitarse tras terminar voz'
        );
        console.log('  ✓ 5. Pulsar "Terminar con Voz": Conexión finaliza y ambos controles de texto vuelven a habilitarse.');

        // ---------------------------------------------------------------------
        // 6. Iniciar voz nuevamente -> controles vuelven a deshabilitarse
        // ---------------------------------------------------------------------
        console.log('\n--- 6. Reinicio de Voz ---');
        btnStartLive.click();
        await new Promise(r => setTimeout(r, 60));

        assert.strictEqual(
            window.isVoiceActive(),
            true,
            '6.1 isVoiceActive() debe volver a ser true'
        );
        assert.strictEqual(
            btnStartLive.textContent.trim(),
            'Terminar con Voz',
            '6.2 El botón debe volver a decir "Terminar con Voz"'
        );
        assert.strictEqual(
            userInput.disabled,
            true,
            '6.3 El campo de texto debe deshabilitarse nuevamente'
        );
        assert.strictEqual(
            sendBtn.disabled,
            true,
            '6.4 El botón Enviar debe deshabilitarse nuevamente'
        );
        console.log('  ✓ 6. Se inicia voz nuevamente: Controles de texto vuelven a deshabilitarse y botón cambia a "Terminar con Voz".');

        // ---------------------------------------------------------------------
        // 7 & 8. Pérdida inesperada de la conexión -> controles se rehabilitan y botón "Iniciar con Voz"
        // ---------------------------------------------------------------------
        console.log('\n--- 7 y 8. Pérdida Inesperada de la Conexión WebSocket ---');
        const activeWs = MockWebSocket.latestInstance;
        assert.ok(activeWs, 'Debe existir una instancia activa de WebSocket');

        // Simular cierre abrupto de WebSocket (pérdida de red o servidor caído)
        activeWs.close();
        await new Promise(r => setTimeout(r, 40));

        assert.strictEqual(
            window.isVoiceActive(),
            false,
            '7.1 isVoiceActive() debe ser false tras caída de conexión'
        );
        assert.strictEqual(
            userInput.disabled,
            false,
            '7.2 Campo de texto debe rehabilitarse automáticamente tras pérdida de conexión'
        );
        assert.strictEqual(
            sendBtn.disabled,
            false,
            '7.3 Botón Enviar debe rehabilitarse automáticamente tras pérdida de conexión'
        );
        assert.strictEqual(
            btnStartLive.textContent.trim(),
            'Iniciar con Voz',
            '8.1 El botón debe volver a mostrar "Iniciar con Voz" tras caída de conexión'
        );
        console.log('  ✓ 7. Detección de pérdida inesperada de conexión: Controles se rehabilitan automáticamente.');
        console.log('  ✓ 8. Tras pérdida de conexión: Botón vuelve a mostrar "Iniciar con Voz".');

        // ---------------------------------------------------------------------
        // 9. Chat escrito continúa funcionando normalmente después de terminar voz
        // ---------------------------------------------------------------------
        console.log('\n--- 9. Funcionamiento Normal del Chat Escrito Tras Voz ---');
        userInput.value = 'Hola Idealita por texto después de voz';
        sendBtn.click();

        // Verificar mensaje de usuario en historial
        const userMsgs = chatHistory.querySelectorAll('.user-message');
        const found = Array.from(userMsgs).some(m => m.textContent === 'Hola Idealita por texto después de voz');
        assert.strictEqual(found, true, '9.1 El mensaje escrito por el usuario debe agregarse al historial');

        // Esperar respuesta simulada de Gemini Live para texto
        await new Promise(r => setTimeout(r, 60));

        assert.strictEqual(
            userInput.disabled,
            false,
            '9.2 Input de texto debe estar habilitado tras recibir respuesta'
        );
        assert.strictEqual(
            sendBtn.disabled,
            false,
            '9.3 Botón Enviar debe estar habilitado tras recibir respuesta'
        );
        assert.strictEqual(
            btnStartLive.textContent.trim(),
            'Iniciar con Voz',
            '9.4 El botón de voz debe mantenerse como "Iniciar con Voz" durante y tras chat escrito'
        );
        assert.strictEqual(
            window.isVoiceActive(),
            false,
            '9.5 El modo texto no debe activar falsamente isVoiceActive()'
        );
        console.log('  ✓ 9. Chat escrito continúa funcionando normalmente después de terminar voz.');

        console.log('\n======================================================================');
        console.log('✅ TODAS LAS PRUEBAS DE UX DE VOZ Y CHAT PASARON EXITOSAMENTE (100% OK)');
        console.log('======================================================================\n');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ ERROR EN PRUEBAS DE UX DE VOZ:', err);
        process.exit(1);
    }
})();
