const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

// Read the HTML file
const html = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');

// Set up JSDOM
const dom = new JSDOM(html, {
    url: 'http://localhost',
    runScripts: 'dangerously',
    resources: 'usable'
});

const window = dom.window;
global.document = window.document;
global.window = window;
global.navigator = window.navigator;

// Mock Three.js gracefully for main testing loop
window.THREE = {
    Scene: class {},
    PerspectiveCamera: class { constructor() { this.position = {}; } },
    WebGLRenderer: class {
        constructor() { throw new Error("Mocked WebGL failure to trigger fallback"); }
    }
};
window.GLTFLoader = class {};
window.VRMLoaderPlugin = class {};

// Mock fetch for /api/live-token
dom.window.eval('window.currentUser = { id: 1, usuario: "testuser", nombre: "Test User" };');

global.fetchSpyArgs = [];
window.fetch = async (url) => {
    global.fetchSpyArgs.push(url);
    if (url.startsWith('/api/ideas')) {
        if (global.mockIdeasFail) {
            return { ok: false };
        }
        return {
            ok: true,
            json: async () => ({ ideas: [{ id: 1, titulo: 'Idea mock', estado: 'pendiente' }] })
        };
    }
    if (url === '/api/live-token') {
        return {
            ok: true,
            json: async () => ({ token: 'mock-token' })
        };
    }
    if (url === '/api/menu') {
        return {
            ok: true,
            json: async () => ([
                { id: 1, nombre: 'Inicio', orden: 1, ruta: '/', hijos: [] }
            ])
        };
    }
    if (url === '/api/me') {
        return { ok: false, status: 401 };
    }
    return { ok: false, status: 404 };
};

// Mock WebSocket
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = 1; // OPEN
        MockWebSocket.instances.push(this);

        // Trigger onopen asynchronously
        setTimeout(() => {
            if (this.onopen) this.onopen();
        }, 10);
    }

    send(data) {
        MockWebSocket.messagesSent.push(data);
    }

    close() {}
}
MockWebSocket.instances = [];
MockWebSocket.messagesSent = [];
window.WebSocket = MockWebSocket;

// Mock Web Audio API
window.AudioContext = class {
    constructor() {
        this.audioWorklet = {
            addModule: async () => {}
        };
        this.destination = {};
    }
    createBuffer() { return { getChannelData: () => ({ set: () => {} }), duration: 1 }; }
    createBufferSource() { return { connect: () => {}, start: () => {}, onended: null }; }
    createAnalyser() {
        return {
            fftSize: 256,
            frequencyBinCount: 128,
            connect: () => {},
            disconnect: () => {},
            getByteFrequencyData: () => {}
        };
    }
    createMediaStreamSource() {
        return {
            connect: () => {}
        };
    }
};

window.AudioWorkletNode = class {
    constructor() {
        this.port = {
            onmessage: null
        };
    }
    connect() {}
    disconnect() {}
};

// Mock window.matchMedia
window.matchMedia = window.matchMedia || function() {
    return {
        matches: false,
        addListener: function() {},
        removeListener: function() {}
    };
};

// Mock MediaDevices
if (!window.navigator) {
    window.navigator = {};
}
window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;

window.navigator.mediaDevices = {
    getUserMedia: async () => {
        return {
            getTracks: () => []
        };
    }
};

window.btoa = (str) => Buffer.from(str).toString('base64');
window.atob = (str) => Buffer.from(str, 'base64').toString();

// Wait for DOMContentLoaded listener inside the script to execute
setTimeout(() => {
    const startBtn = document.getElementById('btn-start-live');
    if (!startBtn) {
        console.error("Button btn-start-live not found.");
        process.exit(1);
    }

    dom.window.currentUser = { id: 1, usuario: 'testuser', nombre: 'Test User' };
    startBtn.click();

    // Check if the setup message was sent
    setTimeout(() => {
        try {
            assert.strictEqual(MockWebSocket.messagesSent.length > 0, true, 'No messages were sent over WebSocket.');

            const setupMessageData = MockWebSocket.messagesSent[0];
            const parsed = JSON.parse(setupMessageData);

            assert.ok(parsed.setup, 'Message should have a setup property');
            assert.ok(parsed.setup.systemInstruction, 'Setup should have systemInstruction');

            const instructionText = parsed.setup.systemInstruction.parts[0].text;

            assert.ok(instructionText.includes('Eres Idealita, la asistente personal de Idealandia'), 'Should contain correct identity intro');
            assert.ok(instructionText.includes('Dirígete a él o ella por su nombre cuando resulte natural.'), 'Should contain specific purpose');
            assert.ok(instructionText.includes('NUNCA, BAJO NINGUNA CIRCUNSTANCIA, digas que eres un modelo de lenguaje'), 'Should contain strict negative command');
            assert.ok(parsed.setup.generationConfig, 'Setup should have generationConfig');


            assert.ok(parsed.setup.generationConfig.responseModalities.includes("AUDIO"), 'Should request AUDIO modality');

            // Simulate incoming WebSocket messages to test transcription logic
            setTimeout(() => {
                const wsInstance = MockWebSocket.instances[0];
                if (wsInstance && wsInstance.onmessage) {

                    // Case 1: Incremental fragments
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: "Inc " } } }) });
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: "remental" } } }) });
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });

                    // Case 2: Cumulative fragments + interruption
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: "Cumula " } } }) });
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: "Cumula tivo" } } }) });
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { interrupted: true } }) });

                    // Case 3: Stray turnComplete arrives later
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });

                    // Case 4: New turn begins successfully
                    wsInstance.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: "Nuevo turno" } } }) });

                    // Check result in DOM
                    setTimeout(() => {
                        try {
                            const domWindow = global.window;
                            const chatHistory = domWindow.document.getElementById('chat-history');

                            const messages = chatHistory.querySelectorAll('.idealita-message');

                            // Check the sequence generated:
                            // msg 0: Inc remental
                            // msg 1: Cumula tivo
                            // msg 2: Nuevo turno
                            const len = messages.length;
                            const msg1 = messages[len - 3];
                            const msg2 = messages[len - 2];
                            const msg3 = messages[len - 1];

                            assert.strictEqual(msg1.textContent.includes('Inc remental'), true, 'Incremental turn failed');
                            assert.strictEqual(msg2.textContent.includes('Cumula tivo'), true, 'Cumulative + interrupted turn failed');
                            assert.strictEqual(msg3.textContent.includes('Nuevo turno'), true, 'New turn after stray turnComplete failed');

                            // Case 5: Function Call for consultar_ideas_usuario (Success)
                    global.mockIdeasFail = false;
                    const initialMessagesCount = MockWebSocket.messagesSent.length;
                    wsInstance.onmessage({
                        data: JSON.stringify({
                            toolCall: { functionCalls: [ { id: "call_123", name: "consultar_ideas_usuario", args: { tipo_consulta: "todas" } } ] }
                        })
                    });

                    setTimeout(() => {
                        try {
                            const newMessages = MockWebSocket.messagesSent.slice(initialMessagesCount);
                            assert.strictEqual(newMessages.length > 0, true, 'Function call response not sent');
                            const funcRes = JSON.parse(newMessages[0]);
                            assert.ok(funcRes.toolResponse, 'Should wrap inside toolResponse');
                            assert.strictEqual(funcRes.toolResponse.functionResponses[0].name, 'consultar_ideas_usuario');
                            assert.strictEqual(funcRes.toolResponse.functionResponses[0].response.result[0].titulo, 'Idea mock');

                            // Case 6: Function Call for consultar_ideas_usuario (Failure / Unauth)
                            global.mockIdeasFail = true;
                            const beforeFailCount = MockWebSocket.messagesSent.length;
                            wsInstance.onmessage({
                                data: JSON.stringify({
                                    toolCall: { functionCalls: [ { id: "call_456", name: "consultar_ideas_usuario", args: { tipo_consulta: "todas" } } ] }
                                })
                            });

                            setTimeout(() => {
                                try {
                                    const failMessages = MockWebSocket.messagesSent.slice(beforeFailCount);
                                    const failRes = JSON.parse(failMessages[0]);
                                    assert.ok(failRes.toolResponse.functionResponses[0].response.error);
                                    assert.ok(failRes.toolResponse.functionResponses[0].response.error.includes("no esté autenticado"));

                                    // Case 7: Function Call with query parameters for filtering
                                    global.mockIdeasFail = false;
                                    const beforeArgsCount = MockWebSocket.messagesSent.length;
                                    wsInstance.onmessage({
                                        data: JSON.stringify({
                                            toolCall: { functionCalls: [ { id: "call_789", name: "consultar_ideas_usuario", args: { tipo_consulta: "filtradas", estado: "pendiente", palabra_clave: "test" } } ] }
                                        })
                                    });

                                    setTimeout(() => {
                                        try {
                                            const argsMessages = MockWebSocket.messagesSent.slice(beforeArgsCount);
                                            assert.strictEqual(argsMessages.length > 0, true, 'Function call response not sent for args');

                                            // Validate fetchSpy tracking in global
                                            assert.ok(global.fetchSpyArgs.some(url => url && url.includes("estado=pendiente")), "Fetch URL missing state");
                                            assert.ok(global.fetchSpyArgs.some(url => url.includes('q=test')), "Fetch URL missing q");

                                            console.log('Voice identity, transcription deduplication, and Tool Function Call tests passed successfully.');
                                            process.exit(0);
                                        } catch (e) {
                                            console.error('Tool function test failed (args case):', e);
                                            process.exit(1);
                                        }
                                    }, 50);

                                } catch (e) {
                                    console.error('Tool function test failed (fail case):', e);
                                    process.exit(1);
                                }
                            }, 50);

                        } catch (e) {
                            console.error('Tool function test failed (success case):', e);
                            process.exit(1);
                        }
                    }, 50);
                        } catch (err) {
                            console.error('Transcription DOM Test failed:', err);
                            process.exit(1);
                        }
                    }, 50);

                } else {
                    console.error("Live WebSocket not initialized.");
                    process.exit(1);
                }
            }, 100);


        } catch (err) {
            console.error('Test failed:', err);
            process.exit(1);
        }
    }, 500);

}, 500);
