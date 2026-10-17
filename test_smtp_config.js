process.env.AUTH_SECRET = 'test_secret';
process.env.SMTP_CLIENT_ID = 'integration-test'; // Force OAuth2 path
process.env.SMTP_CLIENT_SECRET = 'test';
process.env.SMTP_REFRESH_TOKEN = 'test';
process.env.SMTP_USER = 'test@hotmail.com';

// Intercept nodemailer
const nodemailer = require('nodemailer');
let emailSendCount = 0;
const originalCreateTransport = nodemailer.createTransport;
nodemailer.createTransport = function(options) {
    return {
        options: options,
        sendMail: async function(mailOptions) {
            emailSendCount++;
            return { messageId: 'mock-123' };
        }
    };
};

const mysql = require('mysql2/promise');
mysql.createPool = () => ({
    getConnection: () => Promise.resolve({ release: () => {}, beginTransaction: () => {}, execute: () => Promise.resolve([[], []]), commit: () => {}, rollback: () => {} }),
    execute: (query, args) => {
        if (query.includes('SELECT id, email FROM usuarios WHERE email')) {
            return Promise.resolve([[{ id: 999, email: 'test@mock.com' }]]);
        }
        return Promise.resolve([[], []]);
    }
});

const { app, initMailTransporter } = require('./server.js');
const http = require('http');

async function testConfigLogic() {
    let originalConsoleError = console.error;
    let originalConsoleLog = console.log;
    let loggedErrors = [];
    let loggedMessages = [];

    console.error = (msg) => loggedErrors.push(msg);
    console.log = (msg) => loggedMessages.push(msg);

    function testConfig(env) {
        loggedErrors = [];
        loggedMessages = [];
        const transporter = initMailTransporter(env);
        return {
            config: transporter ? transporter.options : null,
            errors: loggedErrors,
            messages: loggedMessages
        };
    }

    try {
        let res2 = testConfig({
            SMTP_USER: 'test@hotmail.com',
            SMTP_CLIENT_ID: 'cid',
            SMTP_CLIENT_SECRET: 'csec',
            SMTP_REFRESH_TOKEN: 'rtoken'
        });
        if (!res2.config || res2.config.auth.accessUrl !== 'https://login.microsoftonline.com/common/oauth2/v2.0/token') {
            throw new Error("OAuth2 setup failed to include Microsoft accessUrl");
        }

        let res3 = testConfig({ SMTP_USER: 'test@hotmail.com', SMTP_CLIENT_ID: 'cid', SMTP_HOST: 'smtp.mail.com', SMTP_PASS: 'secret' });
        if (res3.config !== null) throw new Error("Incomplete OAuth2 validation failed or fell back to basic auth unexpectedly");

        originalConsoleLog("All SMTP configuration mock tests passed.");
    } finally {
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
    }
}

async function testDuplicateEmails() {
    console.log("Testing /api/recover for duplicate emails via HTTP...");

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(3015, resolve));

    // reset counter
    emailSendCount = 0;

    const reqOptions = {
        hostname: 'localhost',
        port: 3015,
        path: '/api/recover',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '127.0.0.1' // bypass global test rate limits if any
        }
    };

    await new Promise((resolve, reject) => {
        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if(res.statusCode !== 200) reject(new Error("Endpoint returned " + res.statusCode));
                resolve(data);
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify({ email: 'test@mock.com' }));
        req.end();
    });

    server.close();

    if (emailSendCount !== 1) {
        throw new Error(`Integration test failed: Expected exactly 1 email to be sent, but sent ${emailSendCount}.`);
    } else {
        console.log(`Integration test passed: Exactly ${emailSendCount} email sent.`);
    }
}

async function runTests() {
    try {
        await testConfigLogic();
        await testDuplicateEmails();
    } catch(e) {
        console.error("Test failed: " + e.message);
        process.exitCode = 1;
    } finally {
        process.exit(0);
    }
}
runTests();
