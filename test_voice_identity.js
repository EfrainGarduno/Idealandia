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

// Mock fetch for /api/live-token
window.fetch = async (url) => {
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

// Mock MediaDevices
if (!window.navigator) {
    window.navigator = {};
}
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

            assert.ok(instructionText.includes('Idealita, la asistente virtual de Idealandia'), 'Should contain correct identity intro');
            assert.ok(instructionText.includes('acompañarlos dentro de Idealandia'), 'Should contain specific purpose');
            assert.ok(instructionText.includes('NUNCA, BAJO NINGUNA CIRCUNSTANCIA, digas que eres un modelo de lenguaje'), 'Should contain strict negative command');
            assert.ok(parsed.setup.generationConfig, 'Setup should have generationConfig');
            assert.ok(parsed.setup.generationConfig.responseModalities.includes("TEXT"), 'Should request TEXT modality');

            console.log('Voice identity test passed successfully.');
            process.exit(0);
        } catch (err) {
            console.error('Test failed:', err);
            process.exit(1);
        }
    }, 100);

}, 100);
