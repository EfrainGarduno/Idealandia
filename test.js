const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');

// Test that server requires AUTH_SECRET
try {
    execSync('node server.js', {
        env: { ...process.env, AUTH_SECRET: '' },
        stdio: 'pipe'
    });
    console.error('Test failed: server.js should fail without AUTH_SECRET.');
    process.exit(1);
} catch (error) {
    if (error.status !== 1) {
        console.error('Test failed: server.js failed with unexpected status code:', error.status);
        process.exit(1);
    }
    const stdout = error.stdout ? error.stdout.toString() : '';
    const stderr = error.stderr ? error.stderr.toString() : '';
    const output = stdout + stderr;
    if (!output.includes('FATAL ERROR: AUTH_SECRET environment variable not set.')) {
        console.error('Test failed: server.js did not print the expected error message.');
        console.error('Output was:', output);
        process.exit(1);
    }
    console.log('Test passed: Server correctly refuses to start without AUTH_SECRET.');
}

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
    } else if (url === '/api/register' && options.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.usuario === 'testuser' && body.password === 'testpass') {
             return {
                 ok: true,
                 json: async () => ({ message: 'Registro exitoso.' })
             };
        }
        return {
            ok: false,
            json: async () => ({ error: 'Error mock' })
        };
    } else if (url === '/api/login' && options.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.usuario === 'testuser' && body.password === 'testpass') {
            globalAuthState = true;
            return {
                ok: true,
                json: async () => ({ message: 'Login exitoso.', user: { id: 1, usuario: 'testuser', nombre: 'Test User' } })
            };
        }
        if (!body.usuario || !body.password) {
            return {
                ok: false,
                status: 400,
                json: async () => ({ error: 'Usuario y contraseña son requeridos.' })
            };
        }
        return {
            ok: false,
            status: 401,
            json: async () => ({ error: 'Credenciales inválidas.' })
        };
    } else if (url === '/api/me' && (!options || options.method === 'GET')) {
        if (globalAuthState) {
            return {
                ok: true,
                json: async () => ({ user: { id: 1, usuario: 'testuser', nombre: 'Test User' } })
            };
        } else {
            return {
                ok: false,
                status: 401,
                json: async () => ({ error: 'No autorizado.' })
            };
        }
    } else if (url === '/api/logout' && options.method === 'POST') {
        globalAuthState = false;
        return {
            ok: true,
            json: async () => ({ message: 'Sesión cerrada exitosamente.' })
        };
    } else if (url === '/api/ideas' && (!options || options.method === 'GET')) {
        if (globalAuthState) {
            return {
                ok: true,
                json: async () => ({ ideas: [{ id: 1, usuario_id: 1, titulo: 'Test Idea', descripcion: 'Desc', estado: 'pendiente', fecha: new Date().toISOString() }] })
            };
        } else {
             return {
                 ok: false,
                 status: 401,
                 json: async () => ({ error: 'No autorizado' })
             };
        }
    } else if (url === '/api/ideas' && options.method === 'POST') {
        if (globalAuthState) {
            return {
                ok: true,
                json: async () => ({ message: 'Idea creada exitosamente.', id: 2 })
            };
        } else {
             return {
                 ok: false,
                 status: 401,
                 json: async () => ({ error: 'No autorizado' })
             };
        }
    }
    return { ok: false, status: 404 };
};

let globalAuthState = false;
let alertMessage = null;
window.alert = (msg) => { alertMessage = msg; };

// Ensure fetch works globally for JSDOM scripts if needed, though window.fetch is mocked.
// Some jsdom configurations might require this or we just wait for the 'load' event.
window.addEventListener('load', () => {
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

            // Test Registration Form
            const btnRegisterNewUser = document.getElementById('btn-register');
            document.getElementById('reg-usuario').value = 'testuser';
            document.getElementById('reg-password').value = 'testpass';
            document.getElementById('reg-password-rep').value = 'testpass';
            document.getElementById('reg-nombre').value = 'Test User';
            document.getElementById('reg-correo').value = 'test@example.com';

            btnRegisterNewUser.click();

            setTimeout(() => {
                if (alertMessage !== 'Registro exitoso.') {
                    console.error('Test failed: Registration form did not mock success correctly.', alertMessage);
                    process.exit(1);
                }

                // Test Auth Flow
                const testAuthFlow = async () => {
                    alertMessage = null;

                    // Initial /me should be 401 (guest)
                    const resInitial = await window.fetch('/api/me');
                    if (resInitial.ok) {
                        console.error('Test failed: Initial /api/me should be 401.');
                        process.exit(1);
                    }

                    // Login Empty
                    document.getElementById('login-usuario').value = '';
                    document.getElementById('login-password').value = '';
                    document.getElementById('btn-login').click();

                    setTimeout(async () => {
                        if (alertMessage !== 'Por favor, ingresa tu usuario y contraseña.') {
                            console.error('Test failed: Login empty validation failed.', alertMessage);
                            process.exit(1);
                        }

                        // Login Invalid
                        document.getElementById('login-usuario').value = 'wrong';
                        document.getElementById('login-password').value = 'wrong';
                        document.getElementById('btn-login').click();

                        setTimeout(async () => {
                            if (alertMessage !== 'Error: Credenciales inválidas.') {
                                console.error('Test failed: Login invalid validation failed.', alertMessage);
                                process.exit(1);
                            }

                            // Login Valid
                            document.getElementById('login-usuario').value = 'testuser';
                            document.getElementById('login-password').value = 'testpass';
                            document.getElementById('btn-login').click();

                            setTimeout(async () => {
                                if (alertMessage !== 'Login exitoso.') {
                                    console.error('Test failed: Login valid failed.', alertMessage);
                                    process.exit(1);
                                }

                                // /me should now return ok (handled by mock globalAuthState)
                                const resAuth = await window.fetch('/api/me');
                                if (!resAuth.ok) {
                                    console.error('Test failed: /api/me after login should be 200.');
                                    process.exit(1);
                                }

                                // Test UI update via checkAuthStatus (called in login button click logic)
                                if (document.getElementById('auth-container-user').style.display === 'none') {
                                    console.error('Test failed: UI not updated after login.');
                                    process.exit(1);
                                }

                                // Logout
                                document.getElementById('btn-logout').click();

                                setTimeout(async () => {
                                    const resLoggedOut = await window.fetch('/api/me');
                                    if (resLoggedOut.ok) {
                                        console.error('Test failed: /api/me after logout should be 401.');
                                        process.exit(1);
                                    }

                                    console.log('Test passed successfully: Context, multiple messages, registration form, and auth flow worked.');
                                    process.exit(0);
                                }, 500);

                            }, 500);
                        }, 500);
                    }, 500);
                };

                testAuthFlow();
            }, 500);

        }, 500);

    }, 500);

});
