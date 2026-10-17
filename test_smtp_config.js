const fs = require('fs');

async function testSMTPLogic() {
    let originalConsoleError = console.error;
    let originalConsoleLog = console.log;

    let loggedErrors = [];
    let loggedMessages = [];

    console.error = (msg) => loggedErrors.push(msg);
    console.log = (msg) => loggedMessages.push(msg);

    // Read the server.js content to evaluate the initMailTransporter block
    const serverFile = fs.readFileSync('./server.js', 'utf8');

    // We will extract just the logic of `initMailTransporter` function into a callable string
    const match = serverFile.match(/function initMailTransporter\(\) \{([\s\S]*?)\n\}\ninitMailTransporter/);
    if (!match) throw new Error("Could not find initMailTransporter in server.js");

    const logicBody = match[1];

    function runMockedInit(env) {
        loggedErrors = [];
        loggedMessages = [];

        let transporterConfig = null;
        const nodemailer = {
            createTransport: (cfg) => { transporterConfig = cfg; return { sendMail: () => {} }; }
        };

        let mailTransporter = null; // Changed to let so eval can reassign it

        // Mock process.env
        const process = { env: env };

        // Eval the block
        eval(logicBody);

        return { config: transporterConfig, errors: loggedErrors, messages: loggedMessages };
    }

    try {
        // Test 1: Basic Auth
        let res1 = runMockedInit({
            SMTP_HOST: 'smtp.mail.com',
            SMTP_PORT: '587',
            SMTP_SECURE: 'false',
            SMTP_USER: 'test@mail.com',
            SMTP_PASS: 'secret'
        });
        if (!res1.config || res1.config.auth.pass !== 'secret' || !res1.messages.includes('Idealandia recovery email configured to use Basic Auth.')) {
            throw new Error("Basic Auth failed");
        }

        // Test 2: OAuth2 Setup
        let res2 = runMockedInit({
            SMTP_USER: 'test@hotmail.com',
            SMTP_CLIENT_ID: 'cid',
            SMTP_CLIENT_SECRET: 'csec',
            SMTP_REFRESH_TOKEN: 'rtoken'
        });
        if (!res2.config || res2.config.auth.type !== 'OAuth2' || res2.config.auth.clientId !== 'cid' || !res2.messages.includes('Idealandia recovery email configured to use OAuth2 (Outlook/Hotmail).')) {
            throw new Error("OAuth2 setup failed");
        }

        // Test 3: Incomplete OAuth2 Setup
        let res3 = runMockedInit({
            SMTP_USER: 'test@hotmail.com',
            SMTP_CLIENT_ID: 'cid'
            // Missing secret and refresh token
        });
        if (res3.config !== null || res3.errors.length === 0 || !res3.errors[0].includes('Incomplete configuration')) {
            throw new Error("Incomplete OAuth2 validation failed");
        }

        // Test 4: Missing everything
        let res4 = runMockedInit({});
        if (res4.config !== null || !res4.messages.includes('Idealandia recovery email not configured to send real emails (SMTP variables missing).')) {
            throw new Error("Missing config handling failed");
        }

        originalConsoleLog("All SMTP configuration mock tests passed.");
    } finally {
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
    }
}

testSMTPLogic().catch(e => {
    console.error("Test failed: " + e.message);
    process.exit(1);
});
