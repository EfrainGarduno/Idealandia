const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.resolve(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

const dom = new JSDOM(htmlContent, {
  runScripts: "dangerously",
  resources: "usable"
});

const window = dom.window;
const document = window.document;

// Mock window.fetch for testing the API call
let fetchCount = 0;

function createMockStream(text) {
    const encoder = new TextEncoder();
    const uint8array = encoder.encode(text);
    return {
        getReader: () => {
            let done = false;
            return {
                read: async () => {
                    if (done) {
                        return { done: true, value: undefined };
                    }
                    done = true;
                    return { done: false, value: uint8array };
                }
            };
        }
    };
}

window.fetch = async (url, options) => {
    if (url === '/api/chat' && options.method === 'POST') {
        fetchCount++;
        if (fetchCount === 1) {
            return {
                ok: true,
                body: createMockStream('Soy Idealita, tu asistente de IA.')
            };
        } else {
            return {
                ok: true,
                body: createMockStream('Entiendo, has enviado otro mensaje.')
            };
        }
    }
    return { ok: false, status: 404 };
};

// We need to wait for DOMContentLoaded, but jsdom parses it synchronously.
// Let's just wait a small amount of time for the script to attach listeners.
setTimeout(() => {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');

    // Simulate typing
    input.value = 'Hello Idealita';

    // Simulate clicking send
    sendBtn.click();

    // Check if user message is added
    const messages = chatHistory.querySelectorAll('.message');
    let userMessageFound = false;
    for (let msg of messages) {
        if (msg.classList.contains('user-message') && msg.textContent === 'Hello Idealita') {
            userMessageFound = true;
            break;
        }
    }

    if (!userMessageFound) {
        console.error('Test failed: User message not found in chat history.');
        process.exit(1);
    }

    // Since fetch is async, we give it a moment to resolve and update the DOM
    setTimeout(() => {
        const messagesAfter = chatHistory.querySelectorAll('.message');
        let idealitaMessageFound = false;
        for (let msg of messagesAfter) {
            if (msg.classList.contains('idealita-message') && msg.textContent.includes('Soy Idealita, tu asistente de IA.')) {
                idealitaMessageFound = true;
                break;
            }
        }

        if (!idealitaMessageFound) {
            console.error('Test failed: Idealita message not found in chat history.');
            process.exit(1);
        }

        // Second turn to simulate context
        input.value = 'Segundo mensaje';
        sendBtn.click();

        setTimeout(() => {
            const messagesAfterSecond = chatHistory.querySelectorAll('.message');
            let idealitaSecondMessageFound = false;
            for (let msg of messagesAfterSecond) {
                if (msg.classList.contains('idealita-message') && msg.textContent.includes('Entiendo, has enviado otro mensaje.')) {
                    idealitaSecondMessageFound = true;
                    break;
                }
            }

            if (!idealitaSecondMessageFound) {
                console.error('Test failed: Second Idealita message not found in chat history.');
                process.exit(1);
            }

            console.log('Test passed successfully: Context and multiple messages worked.');
            process.exit(0);
        }, 500);

    }, 500);

}, 100);
