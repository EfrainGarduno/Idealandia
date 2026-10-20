const fs = require('fs');

let testJs = fs.readFileSync('test.js', 'utf8');

const oldBeforeParse = `                                            beforeParse(win) {
                                                win.WebSocket = class {
                                                    constructor() { this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify({ setupComplete: true }) }); }, 10); }, 10); }
                                                    send(data) { if(data && data.includes('clientContent')) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ text: "Esta es una respuesta simulada por Live." }] }, turnComplete: true } }) }); }, 20); } }
                                                    close() {}
                                                };
                                            }
                                        });`;

const newBeforeParse = `                                            beforeParse(win) {
                                                win.WebSocket = class {
                                                    constructor() { this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify({ setupComplete: true }) }); }, 10); }, 10); }
                                                    send(data) { if(data && data.includes('clientContent')) { setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify({ serverContent: { modelTurn: { parts: [{ text: "Esta es una respuesta simulada por Live." }] }, turnComplete: true } }) }); }, 20); } }
                                                    close() {}
                                                };
                                                win.fetch = async (url, options) => {
                                                    if (url === '/api/me') {
                                                        if (!authState) {
                                                            return { ok: false, status: 401 };
                                                        } else {
                                                            return { ok: true, json: async () => ({
                                                                user: { id: 1, name: 'Test User', email: 'test@example.com' },
                                                                permissions: permissions
                                                            })};
                                                        }
                                                    }
                                                    if (url === '/api/visitas') {
                                                        return { ok: true, json: async () => ({ visitas: 12345 }) };
                                                    }
                                                    return { ok: true, json: async () => ({}) };
                                                };
                                            }
                                        });`;

if (testJs.includes(oldBeforeParse)) {
    testJs = testJs.replace(oldBeforeParse, newBeforeParse);
    fs.writeFileSync('test.js', testJs);
    console.log("Patched test.js JSDOM fetch mock for dynamic menu");
} else {
    console.log("oldBeforeParse not found");
}
