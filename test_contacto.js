const assert = require('assert');

global.__TESTING__ = true;

// Force env before require
process.env.SMTP_HOST = 'smtp.mock.com';
process.env.SMTP_USER = 'test@mock.com';
process.env.SMTP_PASS = 'pass';
process.env.AUTH_SECRET = 'secret';

const { app, initMailTransporter } = require('./server.js');
const request = require('supertest');

async function runTests() {
    console.log("Starting contacto tests...");
    let sentMails = [];
    let mockTransporter = {
        sendMail: async (mailOptions) => {
            sentMails.push(mailOptions);
            return { messageId: 'mock-id' };
        }
    };

    initMailTransporter(mockTransporter);

    sentMails = [];
    const res1 = await request(app)
        .post('/api/contacto')
        .send({ nombre: 'Test User', correo: 'test@example.com', mensaje: 'Hello World' });

    assert.strictEqual(res1.status, 200, `Expected status 200 but got ${res1.status}. Body: ${JSON.stringify(res1.body)}`);
    assert.strictEqual(sentMails.length, 2, "Should have sent exactly 2 emails");
    console.log("Test 1 passed: Successful submission sends 2 emails");

    sentMails = [];
    const res2 = await request(app)
        .post('/api/contacto')
        .send({ nombre: 'Test User', correo: 'invalid-email', mensaje: 'Hello World' });

    assert.strictEqual(res2.status, 400, "Should return 400 for invalid email format");
    assert.strictEqual(sentMails.length, 0, "Should not send any emails");
    console.log("Test 2 passed: Invalid email format rejected");

    const res3 = await request(app)
        .post('/api/contacto')
        .send({ nombre: 'Test User', correo: 'test@example.com' });

    assert.strictEqual(res3.status, 400, "Should return 400 for missing fields");
    console.log("Test 3 passed: Missing fields rejected");

    sentMails = [];
    let callCount = 0;
    const mockTransporterPartialFail = {
        sendMail: async (mailOptions) => {
            callCount++;
            sentMails.push(mailOptions);
            if (callCount === 2) {
                throw new Error("Mock SMTP Error");
            }
            return { messageId: 'mock-id' };
        }
    };
    initMailTransporter(mockTransporterPartialFail);

    const res4 = await request(app)
        .post('/api/contacto')
        .send({ nombre: 'Test User', correo: 'test@example.com', mensaje: 'Hello World' });

    assert.strictEqual(res4.status, 207, "Should return 207 for partial success");
    assert.strictEqual(sentMails.length, 2, "Should have attempted to send 2 emails");
    console.log("Test 4 passed: Partial failure handled correctly");

    console.log("All contacto tests passed successfully.");
    process.exit(0);
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
