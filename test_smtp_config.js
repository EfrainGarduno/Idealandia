process.env.AUTH_SECRET = 'test_secret';
process.env.SMTP_HOST = 'smtp.gmail.com'; // Force SMTP Auth
process.env.SMTP_USER = 'test@gmail.com';
process.env.SMTP_PASS = 'mock_app_password';

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
        let res1 = testConfig({
            SMTP_HOST: 'smtp.gmail.com',
            SMTP_PORT: 587,
            SMTP_SECURE: 'false',
            SMTP_USER: 'test@gmail.com',
            SMTP_PASS: 'secret_password'
        });

        if (!res1.config || res1.config.auth.user !== 'test@gmail.com' || res1.config.auth.pass !== 'secret_password' || res1.config.host !== 'smtp.gmail.com') {
            throw new Error("SMTP setup failed to configure correctly with provided variables");
        }
        if (res1.errors.length > 0) {
            throw new Error("Unexpected error logged during valid SMTP setup: " + res1.errors.join(", "));
        }

        let res2 = testConfig({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'test@gmail.com' });
        if (res2.config !== null) {
            throw new Error("Incomplete SMTP validation failed; returned config when missing PASS");
        }
        if (res2.errors.length === 0 || !res2.errors[0].includes('Incomplete configuration')) {
            throw new Error("Failed to securely log an error when SMTP configuration is incomplete");
        }

        let credentialsExposed = res2.errors.some(err => err.includes('test@gmail.com') || err.includes('smtp.gmail.com') || err.includes('secret_password'));
        if (credentialsExposed) {
            throw new Error("Security Violation: Credentials or config details exposed in error logs.");
        }

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
        process.exit(process.exitCode || 0);
    }
}
runTests();
