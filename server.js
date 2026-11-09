require('dotenv').config();
const { searchKnowledge } = require('./knowledgeService');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');


async function verifyToken(token, connectionPool) {
    const secret = process.env.AUTH_SECRET;
    const decoded = jwt.verify(token, secret);

    // Check DB for jwt_version to invalidate old tokens
    const [users] = await connectionPool.execute('SELECT jwt_version FROM usuarios WHERE id = ?', [decoded.id]);
    if (users.length === 0) {
        throw new Error('Usuario no encontrado');
    }

    const currentVersion = users[0].jwt_version || 1;
    const tokenVersion = decoded.jwt_version || 1;

    if (tokenVersion !== currentVersion) {
        throw new Error('Token revocado');
    }

    return decoded;
}

const app = express();
const port = process.env.PORT || 3000;
const rateLimit = require('express-rate-limit');

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// Trust proxy for secure rate limiting behind reverse proxies (like Nginx/Load Balancers)
// Only trust the explicitly provided proxy IPs or local loopback by default.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

// Rate Limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per `window` (here, per 15 minutes)
    message: { error: 'Demasiados intentos desde esta dirección IP. Por favor intenta de nuevo en 15 minutos.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const disableAuthRateLimit =
    process.env.NODE_ENV === 'development' &&
    process.env.DISABLE_AUTH_RATE_LIMIT === 'true';

if (disableAuthRateLimit) {
    console.warn('⚠️ Rate limit de autenticación desactivado en desarrollo local.');
} else {
    app.use('/api/login', authLimiter);
    app.use('/api/recover', authLimiter);
}

// Check if API key is provided
if (!process.env.GEMINI_API_KEY) {
    console.error("Warning: GEMINI_API_KEY environment variable not set.");
}

// Check if AUTH_SECRET is provided
if (!process.env.AUTH_SECRET) {
    console.error("FATAL ERROR: AUTH_SECRET environment variable not set.");
    process.exit(1);
}

// Database Connection Pool

const FUNCIONALIDAD_CODE_ALIASES = {
    'admin': 'administracion'
};

function normalizeFunctionalityCode(code) {
    if (!code) return code;
    const lower = String(code).toLowerCase().trim();
    return FUNCIONALIDAD_CODE_ALIASES[lower] || lower;
}

const ADMIN_PERMISOS = [
    'admin.access', 'usuarios.read', 'usuarios.create', 'usuarios.update', 'usuarios.delete',
    'roles.read', 'roles.create', 'roles.update', 'roles.delete',
    'permisos.read', 'permisos.create', 'permisos.update', 'permisos.delete',
    'funcionalidades.read', 'funcionalidades.create', 'funcionalidades.update', 'funcionalidades.delete',
    'menus.read', 'menus.create', 'menus.update', 'menus.delete'
];

const FUNCIONALIDAD_PERMISOS_MAPPING = {
    'administracion': ADMIN_PERMISOS,
    'admin': ADMIN_PERMISOS,
    'ideas': ['ideas.read', 'ideas.create', 'ideas.update', 'ideas.delete'],
    'creaciones': ['creaciones.read', 'creaciones.create', 'creaciones.update', 'creaciones.delete']
};



const DB_TIMEZONE = process.env.DB_TIMEZONE || '-06:00';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: DB_TIMEZONE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Configure session time_zone for all connections safely without altering global MySQL state
if (pool && typeof pool.on === 'function') {
    pool.on('connection', (connection) => {
        const safeTz = DB_TIMEZONE.replace(/[^0-9:+-]/g, '');
        if (typeof connection.query === 'function') {
            connection.query(`SET time_zone = '${safeTz}'`, (err) => {
                if (err) console.error('Error setting session time_zone:', err);
            });
        }
    });
}

// Test Database Connection
pool.getConnection()
    .then(async (connection) => {
        console.log("Connected to MySQL database.");
        try {
            if (connection && typeof connection.query === 'function') {
                const safeTz = DB_TIMEZONE.replace(/[^0-9:+-]/g, '');
                connection.query(`SET time_zone = '${safeTz}'`, () => {});
            }
        } catch (e) {}
        connection.release();
    })
    .catch(err => {
        console.error("Error connecting to MySQL database:", err);
    });

function formatMySqlDateTime(dateVal) {
    if (!dateVal) return null;
    if (typeof dateVal === 'string') {
        let s = dateVal.trim().replace('T', ' ');
        if (s.endsWith('Z')) s = s.slice(0, -1);
        if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(s)) {
            s += ':00';
        }
        if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(s)) {
            return s.slice(0, 19);
        }
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function checkUserFunctionalityAccess(connectionPool, userId, funcCode) {
    if (!userId) return false;
    const canonicalCode = normalizeFunctionalityCode(funcCode);
    const rawCode = String(funcCode || '').toLowerCase().trim();
    const query = `
        SELECT f.id, f.codigo, f.ruta
        FROM usuario_roles ur
        JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
        JOIN rol_permisos rp ON r.id = rp.rol_id
        JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
        JOIN funcionalidad_permisos fp ON p.id = fp.permiso_id
        JOIN funcionalidades f ON fp.funcionalidad_id = f.id AND f.activo = TRUE
        WHERE ur.usuario_id = ? AND (f.codigo = ? OR f.codigo = ?)
        UNION
        SELECT f.id, f.codigo, f.ruta
        FROM usuario_funcionalidades uf
        JOIN funcionalidades f ON uf.funcionalidad_id = f.id AND f.activo = TRUE
        WHERE uf.usuario_id = ? AND (f.codigo = ? OR f.codigo = ?)
          AND uf.estado = 'activo'
          AND (
              uf.tipo_acceso = 'permanente'
              OR (uf.tipo_acceso = 'temporal' AND uf.fecha_inicio <= NOW() AND uf.fecha_fin > NOW())
          )
    `;
    const [rows] = await connectionPool.execute(query, [
        userId, canonicalCode, rawCode,
        userId, canonicalCode, rawCode
    ]);
    return rows && rows.length > 0;
}

async function checkUserPermission(connectionPool, userId, permCode) {
    if (!userId) return false;
    const query = `
        SELECT p.id, p.codigo, p.nombre
        FROM usuario_roles ur
        JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
        JOIN rol_permisos rp ON r.id = rp.rol_id
        JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
        WHERE ur.usuario_id = ? AND p.codigo = ?
    `;
    const [rows] = await connectionPool.execute(query, [userId, permCode]);
    return rows && rows.length > 0;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Initialize tools dynamically for the chat
// Note: We use generateContent instead of chats.create to support tool calling with context more robustly per request

// Tool configuration
const idealandiaTools = [{
    functionDeclarations: [
        {
            name: "consultar_documentacion",
            description: "Busca en el manual y catálogo de funcionalidades de Idealandia. Úsalo cuando el usuario pregunte sobre qué puede hacer en la plataforma, qué opciones del menú existen, cómo utilizar una herramienta, o si tiene acceso a ciertas funciones.",
            parameters: {
                type: "OBJECT",
                properties: {
                    tema: {
                        type: "STRING",
                        description: "Palabra clave o tema a buscar en la documentación."
                    }
                },
                required: ["tema"]
            }
        }
    ]
}];

const chatSysInstr = "Eres 'idealita', un asistente virtual de Idealandia. Siempre debes presentarte y responder como 'idealita'. Nunca menciones que eres Gemini, un modelo de lenguaje grande, o una IA de Google. Eres Idealita. Responde estrictamente basado en los datos proporcionados por tus herramientas. Siempre menciona la fuente de la documentación si la utilizas. Si un usuario te pregunta por algo y la herramienta responde que no hay acceso o no existe, DEBES responder exactamente eso: 'Lo siento, no tienes acceso a esa función' o 'No tengo información sobre esa capacidad'. NO INVENTES pasos. NO UTILICES la herramienta para eludir restricciones del sistema.";

// Keep the old object for backward compatibility if needed, but we'll use ai.models.generateContentStream in the POST
const chat = ai.chats.create({
    model: 'gemini-3.6-flash',
    config: {
        systemInstruction: chatSysInstr,
        tools: idealandiaTools
    }
});


app.get('/api/live-token', async (req, res) => {
    try {
        const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
        const token = await ai.authTokens.create({
            config: {
                uses: 1,
                expireTime: expireTime,
                liveConnectConstraints: {
                    model: 'models/gemini-3.8-live',
                    config: {
                        responseModalities: ['AUDIO']
                    }
                }
            }
        });

        res.status(200).json({ token: token.name });
    } catch (error) {
        console.error('Error generating live token:', error);
        res.status(500).json({ error: 'Failed to generate live token' });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                error: 'Message is required'
            });
        }

        // Preparar respuesta para streaming
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');


        // Ensure we know who is asking
        const token = req.cookies.auth_token;
        let userId = null;
        if (token) {
            try {
                const decoded = await verifyToken(token, pool);
                userId = decoded.id;
            } catch (e) {}
        }

        let aiResponseStream = await ai.models.generateContentStream({
            model: 'gemini-3.6-flash',
            contents: [{ role: 'user', parts: [{ text: message }] }],
            config: {
                systemInstruction: chatSysInstr,
                tools: idealandiaTools
            }
        });

        // Collect function calls if they occur first
        let functionCall = null;
        let functionName = null;

        for await (const chunk of aiResponseStream) {
            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                functionCall = chunk.functionCalls[0];
                functionName = functionCall.name;
                break; // Model wants to call a tool, stop streaming this response
            } else if (chunk.text) {
                res.write(chunk.text);
            }
        }

        if (functionCall && functionName === 'consultar_documentacion') {
            const query = functionCall.args.tema || message;
            const docResult = await searchKnowledge(pool, userId, query);

            // Second turn: send tool result back
            const secondTurnStream = await ai.models.generateContentStream({
                model: 'gemini-3.6-flash',
                contents: [
                    { role: 'user', parts: [{ text: message }] },
                    { role: 'model', parts: [{ functionCall: functionCall }] },
                    {
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: functionName,
                                response: { result: docResult }
                            }
                        }]
                    }
                ],
                config: {
                    systemInstruction: chatSysInstr,
                    tools: idealandiaTools
                }
            });

            for await (const chunk of secondTurnStream) {
                if (chunk.text) {
                    res.write(chunk.text);
                }
            }
        }

        res.end();

    } catch (error) {
        console.error('Error in /api/chat:', error);

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Internal server error'
            });
        } else {
            res.end();
        }
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { usuario, password, 'password-rep': passwordRep, nombre, correo, telefono } = req.body;

        // Validar campos requeridos
        if (!usuario || !password || !passwordRep || !nombre || !correo) {
            return res.status(400).json({ error: 'Todos los campos obligatorios deben estar completos.' });
        }

        // Validar que las contraseñas coincidan
        if (password !== passwordRep) {
            return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
        }

        // Comprobar si el usuario o el correo ya existen
        const [existingUsers] = await pool.execute(
            'SELECT * FROM usuarios WHERE usuario = ? OR email = ?',
            [usuario, correo]
        );

        if (existingUsers.length > 0) {
            const isUser = existingUsers.some(user => user.usuario === usuario);
            const isEmail = existingUsers.some(user => user.email === correo);

            if (isUser && isEmail) {
                return res.status(400).json({ error: 'El usuario y el correo ya están registrados.' });
            } else if (isUser) {
                return res.status(400).json({ error: 'El nombre de usuario ya está registrado.' });
            } else {
                return res.status(400).json({ error: 'El correo electrónico ya está registrado.' });
            }
        }

        // Hashear la contraseña
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insertar el nuevo usuario en la base de datos
        await pool.execute(
            'INSERT INTO usuarios (usuario, password_hash, nombre, telefono, email) VALUES (?, ?, ?, ?, ?)',
            [usuario, passwordHash, nombre, telefono || null, correo]
        );

        res.status(201).json({ message: 'Registro exitoso.' });

    } catch (error) {
        console.error('Error in /api/register:', error);
        res.status(500).json({ error: 'Error interno del servidor durante el registro.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;

        if (!usuario || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        const [users] = await pool.execute(
            'SELECT id, usuario, password_hash, nombre, telefono, email, jwt_version FROM usuarios WHERE usuario = ? OR email = ?',
            [usuario, usuario]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const payload = {
            id: user.id,
            usuario: user.usuario,
            jwt_version: user.jwt_version || 1
        };

        const secret = process.env.AUTH_SECRET;
        const token = jwt.sign(payload, secret, { expiresIn: '24h' });

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.cookie('auth_token', token, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Return user data (excluding password_hash)
        const { password_hash, jwt_version, ...userData } = user;
        res.status(200).json({ user: userData, message: 'Login exitoso.' });

    } catch (error) {
        console.error('Error in /api/login:', error);
        res.status(500).json({ error: 'Error interno del servidor durante el inicio de sesión.' });
    }
});

const crypto = require('crypto');
const nodemailer = require('nodemailer');

let mailTransporter = null;

// Exportable for testing
function initMailTransporter(env = process.env) {
    if (env && env.sendMail) {
        mailTransporter = env;
        return;
    }
    let transporter = null;

    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
        console.error('SMTP Configuration Error: Incomplete configuration. SMTP_HOST, SMTP_USER, and SMTP_PASS are required to send emails.');
    } else {
        transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT || 587,
            secure: env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS
            }
        });
        console.log('Idealandia recovery email configured to use SMTP Auth.');
    }
    return transporter;
}
if (!global.__TESTING__) mailTransporter = initMailTransporter();

// Export for test_smtp_config.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { app, initMailTransporter };
}




// Definir control de IP muy básico en memoria para rate limiting
const contactoIPs = {};

// Endpoint de contacto
app.post('/api/contacto', async (req, res) => {
    const { nombre, correo, mensaje, telefono } = req.body;

    // Rate limiting básico (max 5 solicitudes por hora por IP)
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    if (contactoIPs[clientIP]) {
        contactoIPs[clientIP] = contactoIPs[clientIP].filter(time => now - time < 3600000);
        if (contactoIPs[clientIP].length >= 5) {
            return res.status(429).json({ message: "Has excedido el límite de envíos. Intenta más tarde." });
        }
    } else {
        contactoIPs[clientIP] = [];
    }
    contactoIPs[clientIP].push(now);

    if (!nombre || !correo || !mensaje) {
        return res.status(400).json({ message: "Todos los campos (nombre, correo y descripción) son obligatorios." });
    }

    // Limitación de tamaño de campos
    if (nombre.length > 100 || correo.length > 100 || mensaje.length > 2000 || (telefono && telefono.length > 20)) {
        return res.status(400).json({ message: "La longitud de alguno de los campos excede el límite permitido." });
    }


    if (telefono) {
        const telRegex = /^\+?[0-9\s\-()]{7,20}$/;
        if (!telRegex.test(telefono)) {
             return res.status(400).json({ message: "Formato de teléfono no válido." });
        }
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
         return res.status(400).json({ message: "Formato de correo no válido." });
    }

    if (!mailTransporter) {
        return res.status(500).json({ message: "Servicio de correo no configurado en el servidor." });
    }

    const safeName = nombre.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeEmail = correo.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeMessage = mensaje.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const safePhone = telefono ? telefono.replace(/</g, "&lt;").replace(/>/g, "&gt;") : 'No proporcionado';

    const mailOptionsIdealandia = {
        from: '"Idealandia Contacto" <' + process.env.SMTP_USER + '>',
        to: 'idealandia@outlook.com',
        subject: 'Nueva solicitud de contacto — Idealandia',
        text: `Se ha recibido una nueva solicitud de contacto.\n\nNombre: ${safeName}\nCorreo: ${safeEmail}\nTeléfono: ${safePhone}\nFecha: ${new Date().toLocaleString()}\n\nMensaje:\n${safeMessage}`
    };

    const mailOptionsUser = {
        from: '"Equipo Idealandia" <' + process.env.SMTP_USER + '>',
        to: correo,
        subject: 'Hemos recibido tu mensaje — Idealandia',
        text: `Hola, ${safeName}:\n\nGracias por ponerte en contacto con Idealandia.\n\nTe confirmamos que hemos recibido tu mensaje y que nuestro equipo revisará tu solicitud. Nos pondremos en contacto contigo a través del correo electrónico que nos proporcionaste.\n\nEste mensaje es una confirmación automática de recepción, no una respuesta personalizada a tu consulta.\n\nGracias por tu interés en Idealandia.\n\nAtentamente,\nEquipo de Idealandia\nidealandia.com.mx`
    };

    try {
        await mailTransporter.sendMail(mailOptionsIdealandia);

        try {
            await mailTransporter.sendMail(mailOptionsUser);
            res.status(200).json({ message: "Mensaje enviado y confirmación enviada a tu correo." });
        } catch (userMailError) {
            console.error("Error sending contact email to user:", userMailError);
            res.status(207).json({ message: "Mensaje enviado a Idealandia, pero falló el envío de confirmación a tu correo." });
        }
    } catch (idealandiaMailError) {
        console.error("Error sending contact email to Idealandia:", idealandiaMailError);
        res.status(500).json({ message: "Error interno: no se pudo enviar el mensaje a Idealandia." });
    }
});

app.post('/api/recover', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'El correo es requerido.' });
        }

        // We always return the same message to avoid enumeration
        const genericMessage = 'Si el correo está registrado, recibirás un enlace de recuperación pronto.';

        const [users] = await pool.execute('SELECT id, email FROM usuarios WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(200).json({ message: genericMessage });
        }

        const user = users[0];
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // Invalidate previous pending tokens for this user
        await pool.execute('UPDATE password_resets SET used = 1 WHERE usuario_id = ? AND used = 0', [user.id]);

        await pool.execute(
            'INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
            [user.id, tokenHash]
        );

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const resetLink = `${appUrl}/?token=${token}`;

        // Attempt to send email
        if (mailTransporter) {
            try {
                await mailTransporter.sendMail({
                    from: process.env.SMTP_FROM || '"Idealandia" <no-reply@idealandia.com.mx>',
                    to: user.email,
                    subject: "Recuperación de Contraseña - Idealandia",
                    text: `Has solicitado recuperar tu contraseña. Usa este enlace para restablecerla (válido por 10 minutos):\n\n${resetLink}\n\nSi no fuiste tú, ignora este correo.`,
                    html: `<p>Has solicitado recuperar tu contraseña. Usa este enlace para restablecerla (válido por 10 minutos):</p><p><a href="${resetLink}">${resetLink}</a></p><p>Si no fuiste tú, ignora este correo.</p>`
                });
            } catch (err) {
                console.error("Error al enviar el correo de recuperación:", err.message);
                // We still want to return a successful message to the user to prevent enumeration
            }
        } else {
            console.error('Mail transporter not initialized. Ensure SMTP_HOST, SMTP_USER, and SMTP_PASS are set.');
        }

        res.status(200).json({ message: genericMessage });

    } catch (error) {
        console.error('Error in /api/recover. Check server logs.');
        res.status(500).json({ error: 'Error interno del servidor durante la recuperación.' });
    }
});

app.get('/api/verify-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!token) {
            return res.status(400).json({ error: 'Falta el token de recuperación.' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const [resets] = await pool.execute(
            'SELECT used, expires_at, (expires_at > NOW()) as is_valid FROM password_resets WHERE token_hash = ?',
            [tokenHash]
        );

        if (resets.length === 0) {
            return res.status(404).json({ error: 'El enlace de recuperación es inválido.' });
        }

        const resetRecord = resets[0];

        if (resetRecord.used === 1) {
            return res.status(400).json({ error: 'El enlace de recuperación ya fue utilizado. Solicita uno nuevo.' });
        }

        if (!resetRecord.is_valid) {
            return res.status(400).json({ error: 'Este enlace de recuperación ha caducado. Solicita uno nuevo.' });
        }

        res.status(200).json({ valid: true });

    } catch (error) {
        console.error('Error in /api/verify-reset-token. Check server logs.', error);
        res.status(500).json({ error: 'Error interno del servidor durante la verificación.' });
    }
});

app.post('/api/reset', async (req, res) => {
    try {
        const { token, password, passwordConfirm } = req.body;

        if (!token || !password || !passwordConfirm) {
            return res.status(400).json({ error: 'Faltan campos.' });
        }

        if (password !== passwordConfirm) {
            return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(password, saltRounds);

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Use atomic UPDATE to prevent TOCTOU race condition
            const [updateResult] = await connection.execute(
                'UPDATE password_resets SET used = 1 WHERE token_hash = ? AND used = 0 AND expires_at > NOW()',
                [tokenHash]
            );

            if (updateResult.affectedRows === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'El token de recuperación es inválido, ha caducado o ya fue utilizado.' });
            }

            // Get the user id
            const [resets] = await connection.execute(
                'SELECT usuario_id FROM password_resets WHERE token_hash = ?',
                [tokenHash]
            );
            const userId = resets[0].usuario_id;

            await connection.execute('UPDATE usuarios SET password_hash = ?, jwt_version = COALESCE(jwt_version, 1) + 1 WHERE id = ?', [newPasswordHash, userId]);

            // Clear the auth_token cookie to force logout of the current session on this device
            res.cookie('auth_token', '', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                expires: new Date(0) // Expire immediately
            });

            await connection.commit();
            res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Error in /api/reset. Check server logs.');
        res.status(500).json({ error: 'Error interno del servidor al restablecer contraseña.' });
    }
});


app.get('/api/menu', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const token = req.cookies.auth_token;
        let userId = null;

        if (token) {
            try {
                const secret = process.env.AUTH_SECRET;
                const decoded = await verifyToken(token, pool);
                userId = decoded.id;
            } catch (err) {
                // Invalid or expired token: treat as unauthenticated
            }
        }

        const [menuItems] = await pool.execute(
            'SELECT id, nombre, funcionalidad_id, parent_id, publico, orden FROM menu_items WHERE activo = TRUE ORDER BY parent_id, orden'
        );

        let allowedFunctionalityIds = new Set();
        if (userId) {
            const query = `
                SELECT f.id, f.ruta
                FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
                JOIN rol_permisos rp ON r.id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
                JOIN funcionalidad_permisos fp ON p.id = fp.permiso_id
                JOIN funcionalidades f ON fp.funcionalidad_id = f.id AND f.activo = TRUE
                WHERE ur.usuario_id = ?
                UNION
                SELECT f.id, f.ruta
                FROM usuario_funcionalidades uf
                JOIN funcionalidades f ON uf.funcionalidad_id = f.id AND f.activo = TRUE
                WHERE uf.usuario_id = ?
                  AND uf.estado = 'activo'
                  AND (uf.tipo_acceso = 'permanente' OR (uf.fecha_inicio <= NOW() AND uf.fecha_fin > NOW()))
            `;
            const [allowed] = await pool.execute(query, [userId, userId]);
            allowed.forEach(row => allowedFunctionalityIds.add(row.id || row.funcionalidad_id));
        }

        const buildTree = (parentId = null) => {
            return menuItems
                .filter(item => item.parent_id === parentId)
                .map(item => ({
                    ...item,
                    hijos: buildTree(item.id)
                }));
        };
        const menuTree = buildTree();

        const containerIds = new Set(menuItems.filter(item => item.parent_id !== null).map(item => item.parent_id));
        const serviciosItem = menuItems.find(item => item.parent_id === null && item.nombre && item.nombre.toLowerCase().trim() === 'servicios');
        const serviciosId = serviciosItem ? serviciosItem.id : null;

        const filterEmptyContainers = (nodes) => {
            return nodes.filter(item => {
                if (item.hijos && item.hijos.length > 0) {
                    item.hijos = filterEmptyContainers(item.hijos);
                }

                const isContainer = containerIds.has(item.id);
                const hasVisibleChildren = item.hijos && item.hijos.length > 0;

                // If it's a container, it must have visible children, even if publico = 1
                if (isContainer) return hasVisibleChildren;

                // For items under Servicios: authenticated users can see all catalog items
                if (serviciosId && item.parent_id === serviciosId) {
                    if (userId) {
                        return true;
                    }
                    return item.publico === 1;
                }

                if (item.publico === 1) return true;

                if (item.funcionalidad_id !== null) {
                    return allowedFunctionalityIds.has(item.funcionalidad_id);
                }

                return false;
            });
        };

        const annotateAuthorization = (nodes) => {
            return nodes.map(item => {
                let isAuth = false;
                if (serviciosId && item.parent_id === serviciosId) {
                    if (item.funcionalidad_id !== null) {
                        isAuth = Boolean(userId && allowedFunctionalityIds.has(item.funcionalidad_id));
                    } else {
                        isAuth = true;
                    }
                } else if (item.publico === 1 && item.funcionalidad_id === null) {
                    isAuth = true;
                } else if (item.funcionalidad_id !== null) {
                    isAuth = Boolean(userId && allowedFunctionalityIds.has(item.funcionalidad_id));
                } else {
                    isAuth = true;
                }

                const hijos = (item.hijos && item.hijos.length > 0)
                    ? annotateAuthorization(item.hijos)
                    : [];

                return {
                    ...item,
                    autorizado: isAuth,
                    hijos
                };
            });
        };

        const filteredTree = filterEmptyContainers(menuTree);
        const finalMenuTree = annotateAuthorization(filteredTree);

        let proximo_vencimiento = null;
        let proxima_activacion = null;

        if (userId) {
            try {
                const [timingRows] = await pool.execute(`
                    SELECT 
                        MIN(CASE WHEN tipo_acceso = 'temporal' AND fecha_inicio <= NOW() AND fecha_fin > NOW() THEN fecha_fin END) AS proximo_vencimiento,
                        MIN(CASE WHEN tipo_acceso = 'temporal' AND fecha_inicio > NOW() THEN fecha_inicio END) AS proxima_activacion
                    FROM usuario_funcionalidades
                    WHERE usuario_id = ? AND estado = 'activo'
                `, [userId]);

                if (timingRows && timingRows.length > 0) {
                    if (timingRows[0].proximo_vencimiento) {
                        const d = new Date(timingRows[0].proximo_vencimiento);
                        if (!isNaN(d.getTime())) proximo_vencimiento = d.toISOString();
                    }
                    if (timingRows[0].proxima_activacion) {
                        const d = new Date(timingRows[0].proxima_activacion);
                        if (!isNaN(d.getTime())) proxima_activacion = d.toISOString();
                    }
                }
            } catch (timingErr) {
                // If timing calculation fails, log and continue returning menu
                console.warn('Could not calculate timing metadata in /api/menu:', timingErr.message);
            }
        }

        if (proximo_vencimiento) res.setHeader('X-Proximo-Vencimiento', proximo_vencimiento);
        if (proxima_activacion) res.setHeader('X-Proxima-Activacion', proxima_activacion);

        if (req.query.meta === 'true' || req.query.metadata === 'true') {
            return res.status(200).json({
                menu: finalMenuTree,
                proximo_vencimiento,
                proxima_activacion
            });
        }

        res.status(200).json(finalMenuTree);

    } catch (error) {
        console.error('Error in /api/menu:', error);
        res.status(500).json({ error: 'Error interno del servidor al obtener el menú.' });
    }
});

app.get('/api/me', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const token = req.cookies.auth_token;

        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const secret = process.env.AUTH_SECRET;
        const decoded = await verifyToken(token, pool);

        const [users] = await pool.execute(
            'SELECT id, usuario, nombre, telefono, email FROM usuarios WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
             return res.status(401).json({ error: 'Usuario no encontrado.' });
        }

        res.status(200).json({ user: users[0] });

    } catch (error) {
        console.error('Error in /api/me:', error);
        // Error mostly thrown by jwt.verify when invalid or expired
        res.status(401).json({ error: 'Token inválido o expirado.' });
    }
});

app.post('/api/logout', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.clearCookie('auth_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    });
    res.cookie('auth_token', '', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(0),
        maxAge: 0
    });
    res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
});

const requireFunctionality = (funcCode) => {
    const canonicalCode = normalizeFunctionalityCode(funcCode);
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                const token = req.cookies.auth_token;
                if (!token) {
                    return res.status(401).json({ error: 'No autorizado. Token no proporcionado.', code: 'AUTH_REQUIRED' });
                }
                const decoded = await verifyToken(token, pool);
                req.userId = decoded.id;
                req.user = decoded;
            }

            const hasAccess = await checkUserFunctionalityAccess(pool, req.userId, canonicalCode);
            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Acceso no autorizado o vencido para esta funcionalidad.',
                    code: 'RBAC_ACCESS_DENIED',
                    funcionalidad: canonicalCode
                });
            }

            next();
        } catch (error) {
            console.error(`Error in requireFunctionality (${canonicalCode}):`, error);
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado') {
                return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
            }
            return res.status(500).json({ error: 'Error interno del servidor al verificar acceso.' });
        }
    };
};

const requirePermission = (permCode) => {
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                const token = req.cookies.auth_token;
                if (!token) {
                    return res.status(401).json({ error: 'No autorizado. Token no proporcionado.', code: 'AUTH_REQUIRED' });
                }
                const decoded = await verifyToken(token, pool);
                req.userId = decoded.id;
                req.user = decoded;
            }

            const hasPermission = await checkUserPermission(pool, req.userId, permCode);
            if (!hasPermission) {
                return res.status(403).json({
                    error: `Permiso denegado: se requiere ${permCode}`,
                    code: 'RBAC_PERMISSION_DENIED',
                    permiso: permCode
                });
            }

            next();
        } catch (error) {
            console.error(`Error in requirePermission (${permCode}):`, error);
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado') {
                return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
            }
            return res.status(500).json({ error: 'Error interno del servidor al verificar permiso.' });
        }
    };
};

// requireAdmin: validates entry to the 'admin' functionality (Level 2)
const requireAdmin = requireFunctionality('administracion');

app.get('/api/admin/check', requireFunctionality('admin'), async (req, res) => {
    res.status(200).json({ message: 'Acceso de administrador concedido.' });
});

// --- ADMIN ENDPOINTS ---

app.get('/api/admin/usuarios', requireFunctionality('admin'), requirePermission('usuarios.read'), async (req, res) => {
    try {
        const [usuarios] = await pool.execute('SELECT id, usuario, nombre, telefono, email FROM usuarios');
        res.status(200).json(usuarios);
    } catch (error) {
        console.error('Error in GET /api/admin/usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


app.get('/api/admin/funcionalidades/:funcId/permisos_disponibles', requireFunctionality('admin'), requirePermission('funcionalidades.read'), async (req, res) => {
    try {
        const { funcId } = req.params;
        const [func] = await pool.execute('SELECT codigo FROM funcionalidades WHERE id = ?', [funcId]);
        if (func.length === 0) return res.status(404).json({ error: 'Funcionalidad no encontrada' });

        const rawCodigo = func[0].codigo.toLowerCase();
        const codigo = normalizeFunctionalityCode(rawCodigo);
        let permitidos = FUNCIONALIDAD_PERMISOS_MAPPING[codigo] || FUNCIONALIDAD_PERMISOS_MAPPING[rawCodigo] || [];
        if (!permitidos.length && !codigo.startsWith('admin') && !codigo.startsWith('administra')) {
             permitidos = [`${rawCodigo}.read`, `${rawCodigo}.create`, `${rawCodigo}.update`, `${rawCodigo}.delete`];
        }

        if (permitidos.length === 0) {
            return res.status(200).json([]);
        }

        const placeholders = permitidos.map(() => '?').join(',');
        const [permisos] = await pool.execute(`SELECT id, codigo, nombre FROM permisos WHERE codigo IN (${placeholders})`, permitidos);

        res.status(200).json(permisos);
    } catch (error) {
        console.error('Error in GET /api/admin/funcionalidades/:funcId/permisos_disponibles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/funcionalidad_permisos/:funcId', requireFunctionality('admin'), requirePermission('funcionalidades.read'), async (req, res) => {
    try {
        const { funcId } = req.params;
        const [permisos] = await pool.execute('SELECT permiso_id FROM funcionalidad_permisos WHERE funcionalidad_id = ?', [funcId]);
        res.status(200).json(permisos.map(p => p.permiso_id));
    } catch (error) {
        console.error('Error in GET /api/admin/funcionalidad_permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/funcionalidad_permisos/:funcId', requireFunctionality('admin'), requirePermission('funcionalidades.update'), async (req, res) => {
    try {
        const { funcId } = req.params;
        const { permisos } = req.body; // Array of permission IDs

        if (!Array.isArray(permisos)) {
            return res.status(400).json({ error: 'El campo permisos debe ser un arreglo válido.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();


            const [func] = await connection.execute('SELECT codigo FROM funcionalidades WHERE id = ?', [funcId]);
            if (func.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'La funcionalidad proporcionada no existe.' });
            }

            const rawCodigo = func[0].codigo.toLowerCase();
            const codigo = normalizeFunctionalityCode(rawCodigo);
            let permitidos = FUNCIONALIDAD_PERMISOS_MAPPING[codigo] || FUNCIONALIDAD_PERMISOS_MAPPING[rawCodigo] || [];
            if (!permitidos.length && !codigo.startsWith('admin') && !codigo.startsWith('administra')) {
                permitidos = [`${rawCodigo}.read`, `${rawCodigo}.create`, `${rawCodigo}.update`, `${rawCodigo}.delete`];
            }

            if (permisos.length > 0) {
                const placeholders = permisos.map(() => '?').join(',');
                const [permisosCheck] = await connection.execute(
                    `SELECT COUNT(*) as count, GROUP_CONCAT(codigo) as codes FROM permisos WHERE id IN (${placeholders})`,
                    permisos
                );

                if (parseInt(permisosCheck[0].count) !== permisos.length) {
                    await connection.rollback();
                    return res.status(400).json({ error: 'Uno o más permisos proporcionados no existen.' });
                }

                const codes = (permisosCheck[0].codes || '').split(',');
                const invalid = codes.filter(c => !permitidos.includes(c));
                if (invalid.length > 0) {
                    await connection.rollback();
                    return res.status(400).json({ error: 'Permisos no válidos para esta funcionalidad: ' + invalid.join(', ') });
                }
            }


            await connection.execute('DELETE FROM funcionalidad_permisos WHERE funcionalidad_id = ?', [funcId]);
            if (permisos.length > 0) {
                const placeholders = permisos.map(() => '(?, ?)').join(',');
                const values = permisos.flatMap(permisoId => [funcId, permisoId]);
                await connection.execute(`INSERT INTO funcionalidad_permisos (funcionalidad_id, permiso_id) VALUES ${placeholders}`, values);
            }
            await connection.commit();
            res.status(200).json({ message: 'Permisos de funcionalidad actualizados.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in POST /api/admin/funcionalidad_permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


app.get('/api/admin/accesos', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const [accesos] = await pool.execute(`
            SELECT uf.*, u.nombre as usuario_nombre, f.nombre as funcionalidad_nombre, u2.nombre as asignado_por_nombre
            FROM usuario_funcionalidades uf
            JOIN usuarios u ON uf.usuario_id = u.id
            JOIN funcionalidades f ON uf.funcionalidad_id = f.id
            LEFT JOIN usuarios u2 ON uf.asignado_por = u2.id
            ORDER BY uf.created_at DESC
        `);
        res.status(200).json(accesos);
    } catch (error) {
        console.error('Error in GET /api/admin/accesos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/accesos', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { usuarios, funcionalidad_id, tipo_acceso, fecha_inicio, fecha_fin } = req.body;

        if (!Array.isArray(usuarios) || usuarios.length === 0 || !funcionalidad_id || !tipo_acceso) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }

        if (tipo_acceso === 'temporal') {
             if (!fecha_inicio || !fecha_fin) {
                 return res.status(400).json({ error: 'Las fechas de inicio y fin son obligatorias para acceso temporal.' });
             }
             if (new Date(fecha_fin) <= new Date(fecha_inicio)) {
                 return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la fecha de inicio.' });
             }
        }

        const asignado_por = req.userId || null;
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            for (const usuario_id of usuarios) {
                // Check if an active grant already exists for this exact pair
                const [existing] = await connection.execute(
                    'SELECT id FROM usuario_funcionalidades WHERE usuario_id = ? AND funcionalidad_id = ? AND estado = "activo"',
                    [usuario_id, funcionalidad_id]
                );

                if (existing.length > 0) {
                   await connection.execute('UPDATE usuario_funcionalidades SET estado = "revocado" WHERE usuario_id = ? AND funcionalidad_id = ? AND estado = "activo"', [usuario_id, funcionalidad_id]);
                }

                const formattedInicio = tipo_acceso === 'temporal' ? formatMySqlDateTime(fecha_inicio) : null;
                const formattedFin = tipo_acceso === 'temporal' ? formatMySqlDateTime(fecha_fin) : null;

                await connection.execute(
                    'INSERT INTO usuario_funcionalidades (usuario_id, funcionalidad_id, tipo_acceso, fecha_inicio, fecha_fin, estado, asignado_por) VALUES (?, ?, ?, ?, ?, "activo", ?)',
                    [usuario_id, funcionalidad_id, tipo_acceso, formattedInicio, formattedFin, asignado_por]
                );
            }

            await connection.commit();
            res.status(201).json({ message: 'Accesos asignados exitosamente.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in POST /api/admin/accesos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


app.put('/api/admin/accesos/:id', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { id } = req.params;
        const { tipo_acceso, fecha_inicio, fecha_fin } = req.body;

        if (!tipo_acceso) {
            return res.status(400).json({ error: 'Falta tipo_acceso.' });
        }

        if (tipo_acceso === 'temporal') {
             if (!fecha_inicio || !fecha_fin) {
                 return res.status(400).json({ error: 'Las fechas de inicio y fin son obligatorias para acceso temporal.' });
             }
             if (new Date(fecha_fin) <= new Date(fecha_inicio)) {
                 return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la fecha de inicio.' });
             }
        }

        const [existing] = await pool.execute('SELECT id, estado FROM usuario_funcionalidades WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Acceso no encontrado.' });
        }

        if (existing[0].estado === 'revocado') {
            return res.status(400).json({ error: 'No se puede editar un acceso con estatus revocado.' });
        }

        const formattedInicio = tipo_acceso === 'temporal' ? formatMySqlDateTime(fecha_inicio) : null;
        const formattedFin = tipo_acceso === 'temporal' ? formatMySqlDateTime(fecha_fin) : null;

        await pool.execute(
            'UPDATE usuario_funcionalidades SET tipo_acceso = ?, fecha_inicio = ?, fecha_fin = ? WHERE id = ?',
            [tipo_acceso, formattedInicio, formattedFin, id]
        );
        res.status(200).json({ message: 'Acceso actualizado exitosamente.' });
    } catch (error) {
         console.error('Error in PUT /api/admin/accesos/:id:', error);
         res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/accesos/:id/revocar', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await pool.execute('UPDATE usuario_funcionalidades SET estado = "revocado" WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Acceso no encontrado.' });
        }
        res.status(200).json({ message: 'Acceso revocado exitosamente.' });
    } catch (error) {
         console.error('Error in PUT /api/admin/accesos/:id/revocar:', error);
         res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/admin/accesos/:id', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.execute(
            'SELECT id, estado, tipo_acceso, fecha_inicio, fecha_fin, (fecha_fin < NOW()) AS is_vencido FROM usuario_funcionalidades WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Acceso no encontrado.' });
        }

        const acceso = existing[0];
        const isRevocado = acceso.estado === 'revocado';
        const isVencido = acceso.tipo_acceso === 'temporal' && (
            Boolean(acceso.is_vencido) || (acceso.fecha_fin && new Date(acceso.fecha_fin).getTime() < Date.now())
        );

        if (!isRevocado && !isVencido) {
            return res.status(400).json({
                error: 'Solo se pueden eliminar accesos temporales con estatus vencido o revocado.'
            });
        }

        await pool.execute('DELETE FROM usuario_funcionalidades WHERE id = ?', [id]);
        res.status(200).json({ message: 'Acceso temporal eliminado exitosamente.' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/accesos/:id:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


app.post('/api/admin/usuarios', requireFunctionality('admin'), requirePermission('usuarios.create'), async (req, res) => {
    try {
        const { usuario, password, nombre, telefono, email } = req.body;
        if (!usuario || !password || !nombre || !email) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }
        const [existing] = await pool.execute('SELECT id FROM usuarios WHERE usuario = ? OR email = ?', [usuario, email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'El usuario o correo electrónico ya existe.' });
        }

        const bcrypt = require('bcrypt');
        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            'INSERT INTO usuarios (usuario, password_hash, nombre, telefono, email) VALUES (?, ?, ?, ?, ?)',
            [usuario, passwordHash, nombre, telefono || null, email]
        );
        res.status(201).json({ message: 'Usuario creado exitosamente.', id: result.insertId });
    } catch (error) {
        console.error('Error in POST /api/admin/usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/usuarios/:id', requireFunctionality('admin'), requirePermission('usuarios.update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, telefono, email } = req.body;

        if (!nombre || !email) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }

        const [userCheck] = await pool.execute('SELECT id FROM usuarios WHERE id = ?', [id]);
        if (userCheck.length === 0) {
            return res.status(404).json({ error: 'El usuario proporcionado no existe.' });
        }

        // Verificar si el email ya existe para otro usuario
        const [existing] = await pool.execute('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, id]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'El correo electrónico ya está en uso por otro usuario.' });
        }

        await pool.execute(
            'UPDATE usuarios SET nombre = ?, telefono = ?, email = ? WHERE id = ?',
            [nombre, telefono || null, email, id]
        );
        res.status(200).json({ message: 'Usuario actualizado exitosamente.' });
    } catch (error) {
        console.error('Error in PUT /api/admin/usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/admin/usuarios/:id', requireFunctionality('admin'), requirePermission('usuarios.delete'), async (req, res) => {
    try {
        const userIdToDelete = Number(req.params.id);
        const requestingUserId = req.userId;

        if (!Number.isSafeInteger(userIdToDelete) || userIdToDelete <= 0) {
            return res.status(400).json({ error: 'ID de usuario inválido.' });
        }

        if (requestingUserId === userIdToDelete) {
            return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
        }

        // Check for business content dependencies (ideas)
        const [ideasCheck] = await pool.execute('SELECT id FROM ideas WHERE usuario_id = ? LIMIT 1', [userIdToDelete]);
        if (ideasCheck.length > 0) {
            return res.status(400).json({ error: 'El usuario tiene ideas asociadas y no puede ser eliminado.' });
        }

        const connection = await pool.getConnection();
        let lockAcquired = false;
        try {
            // Serialize concurrent modifications to prevent race conditions on admin deletion
            const [lockResult] = await connection.execute("SELECT GET_LOCK('admin_auth_update', 10) AS acquired");
            if (!lockResult[0].acquired) {
                return res.status(503).json({ error: 'El sistema está procesando otra actualización. Intenta de nuevo.' });
            }
            lockAcquired = true;

            await connection.beginTransaction();

            // Delete user roles
            await connection.execute('DELETE FROM usuario_roles WHERE usuario_id = ?', [userIdToDelete]);

            // Delete user
            const [deleteResult] = await connection.execute('DELETE FROM usuarios WHERE id = ?', [userIdToDelete]);

            if (deleteResult.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Usuario no encontrado.' });
            }

            // Verify the system is not left without an admin
            const adminQuery = `
                SELECT COUNT(DISTINCT ur.usuario_id) as count
                FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
                JOIN rol_permisos rp ON r.id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
                WHERE p.codigo = 'admin.access'
            `;
            const [adminCheck] = await connection.execute(adminQuery);

            if (parseInt(adminCheck[0].count) === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Esta operación dejaría al sistema sin administradores activos.' });
            }

            await connection.commit();
            res.status(200).json({ message: 'Usuario eliminado exitosamente.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (lockAcquired) {
                try {
                    await connection.execute("SELECT RELEASE_LOCK('admin_auth_update')");
                } catch (e) {
                    console.error('Error releasing lock', e);
                }
            }
            connection.release();
        }

    } catch (error) {
        console.error('Error in DELETE /api/admin/usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


app.get('/api/admin/roles', requireFunctionality('admin'), requirePermission('roles.read'), async (req, res) => {
    try {
        const [roles] = await pool.execute('SELECT id, nombre, descripcion, activo FROM roles');
        res.status(200).json(roles);
    } catch (error) {
        console.error('Error in GET /api/admin/roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/roles', requireFunctionality('admin'), requirePermission('roles.create'), async (req, res) => {
    try {
        const { nombre, descripcion, activo } = req.body;
        if (!nombre || !descripcion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }
        const [result] = await pool.execute(
            'INSERT INTO roles (nombre, descripcion, activo) VALUES (?, ?, ?)',
            [nombre, descripcion, activo ? 1 : 0]
        );
        res.status(201).json({ message: 'Rol creado exitosamente.', id: result.insertId });
    } catch (error) {
        console.error('Error in POST /api/admin/roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/roles/:id', requireFunctionality('admin'), requirePermission('roles.update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, activo } = req.body;

        if (!nombre || !descripcion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }

        // Validate existence before attempting updates
        const [rolCheck] = await pool.execute('SELECT id FROM roles WHERE id = ?', [id]);
        if (rolCheck.length === 0) {
            return res.status(404).json({ error: 'El rol proporcionado no existe.' });
        }

        const connection = await pool.getConnection();
        let lockAcquired = false;
        try {
            // Serialize concurrent modifications using a user-level lock
            const [lockResult] = await connection.execute("SELECT GET_LOCK('admin_auth_update', 10) AS acquired");
            if (!lockResult[0].acquired) {
                return res.status(503).json({ error: 'El sistema está procesando otra actualización. Intenta de nuevo.' });
            }
            lockAcquired = true;

            await connection.beginTransaction();

            await connection.execute(
                'UPDATE roles SET nombre = ?, descripcion = ?, activo = ? WHERE id = ?',
                [nombre, descripcion, activo ? 1 : 0, id]
            );

            // Global minimum admin check. The GET_LOCK above ensures true serialization,
            // preventing the need for an invalid aggregate FOR UPDATE.
            const adminQuery = `
                SELECT COUNT(DISTINCT ur.usuario_id) as count
                FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
                JOIN rol_permisos rp ON r.id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
                WHERE p.codigo = 'admin.access'
            `;
            const [adminCheck] = await connection.execute(adminQuery);
            if (parseInt(adminCheck[0].count) === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Esta operación dejaría al sistema sin administradores activos.' });
            }

            await connection.commit();
            res.status(200).json({ message: 'Rol actualizado exitosamente.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (lockAcquired) {
                try {
                    await connection.execute("SELECT RELEASE_LOCK('admin_auth_update')");
                } catch (releaseErr) {
                    console.error('Error releasing lock admin_auth_update:', releaseErr);
                }
            }
            connection.release();
        }
    } catch (error) {
        console.error('Error in PUT /api/admin/roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/admin/roles/:id', requireFunctionality('admin'), requirePermission('roles.delete'), async (req, res) => {
    try {
        const { id } = req.params;

        const [rolCheck] = await pool.execute('SELECT id, nombre FROM roles WHERE id = ?', [id]);
        if (rolCheck.length === 0) {
            return res.status(404).json({ error: 'El rol proporcionado no existe.' });
        }

        // Prevent deletion of essential roles like admin
        if (rolCheck[0].nombre.toLowerCase() === 'admin' || rolCheck[0].nombre.toLowerCase() === 'administrador') {
             return res.status(400).json({ error: 'No se puede eliminar un rol protegido.' });
        }

        const [userCheck] = await pool.execute('SELECT usuario_id FROM usuario_roles WHERE rol_id = ? LIMIT 1', [id]);
        if (userCheck.length > 0) {
            return res.status(400).json({ error: 'El rol tiene usuarios asignados y no puede ser eliminado.' });
        }

        const connection = await pool.getConnection();
        let lockAcquired = false;

        try {
            const [lockResult] = await connection.execute("SELECT GET_LOCK('admin_roles_delete', 5) as L");
            if (lockResult[0].L !== 1) {
                return res.status(409).json({ error: 'El sistema está ocupado. Intenta nuevamente.' });
            }
            lockAcquired = true;

            await connection.beginTransaction();

            await connection.execute('DELETE FROM rol_permisos WHERE rol_id = ?', [id]);
            await connection.execute('DELETE FROM roles WHERE id = ?', [id]);

            await connection.commit();
            res.status(200).json({ message: 'Rol eliminado exitosamente.' });

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (lockAcquired) {
                await connection.execute("SELECT RELEASE_LOCK('admin_roles_delete')");
            }
            connection.release();
        }

    } catch (error) {
        console.error('Error in DELETE /api/admin/roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/permisos', requireFunctionality('admin'), requirePermission('permisos.read'), async (req, res) => {
    try {
        const [permisos] = await pool.execute('SELECT id, codigo, nombre, descripcion, activo FROM permisos');
        res.status(200).json(permisos);
    } catch (error) {
        console.error('Error in GET /api/admin/permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/permisos', requireFunctionality('admin'), requirePermission('permisos.create'), async (req, res) => {
    try {
        const { codigo, nombre, descripcion, activo } = req.body;
        if (!codigo || !nombre || !descripcion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }

        const [existing] = await pool.execute('SELECT id FROM permisos WHERE codigo = ?', [codigo]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'El código del permiso ya existe.' });
        }

        const [result] = await pool.execute(
            'INSERT INTO permisos (codigo, nombre, descripcion, activo) VALUES (?, ?, ?, ?)',
            [codigo, nombre, descripcion, activo ? 1 : 0]
        );
        res.status(201).json({ message: 'Permiso creado exitosamente.', id: result.insertId });
    } catch (error) {
        console.error('Error in POST /api/admin/permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/permisos/:id', requireFunctionality('admin'), requirePermission('permisos.update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { codigo, nombre, descripcion, activo } = req.body;

        if (!codigo || !nombre || !descripcion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }

        const [permisoCheck] = await pool.execute('SELECT id, codigo FROM permisos WHERE id = ?', [id]);
        if (permisoCheck.length === 0) {
            return res.status(404).json({ error: 'El permiso proporcionado no existe.' });
        }

        if (permisoCheck[0].codigo !== codigo) {
            const [existing] = await pool.execute('SELECT id FROM permisos WHERE codigo = ? AND id != ?', [codigo, id]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'El código del permiso ya existe en otro registro.' });
            }
        }

        await pool.execute(
            'UPDATE permisos SET codigo = ?, nombre = ?, descripcion = ?, activo = ? WHERE id = ?',
            [codigo, nombre, descripcion, activo ? 1 : 0, id]
        );
        res.status(200).json({ message: 'Permiso actualizado exitosamente.' });
    } catch (error) {
        console.error('Error in PUT /api/admin/permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/admin/permisos/:id', requireFunctionality('admin'), requirePermission('permisos.delete'), async (req, res) => {
    try {
        const { id } = req.params;

        const [permisoCheck] = await pool.execute('SELECT id FROM permisos WHERE id = ?', [id]);
        if (permisoCheck.length === 0) {
            return res.status(404).json({ error: 'El permiso proporcionado no existe.' });
        }

        const [rolCheck] = await pool.execute('SELECT rol_id FROM rol_permisos WHERE permiso_id = ? LIMIT 1', [id]);
        if (rolCheck.length > 0) {
            return res.status(400).json({ error: 'El permiso está asignado a roles y no puede ser eliminado.' });
        }

        const [funcCheck] = await pool.execute('SELECT funcionalidad_id FROM funcionalidad_permisos WHERE permiso_id = ? LIMIT 1', [id]);
        if (funcCheck.length > 0) {
            return res.status(400).json({ error: 'El permiso está asociado a funcionalidades y no puede ser eliminado.' });
        }

        await pool.execute('DELETE FROM permisos WHERE id = ?', [id]);
        res.status(200).json({ message: 'Permiso eliminado exitosamente.' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/funcionalidades', requireFunctionality('admin'), requirePermission('funcionalidades.read'), async (req, res) => {
    try {
        const [funcionalidades] = await pool.execute('SELECT id, codigo, nombre, descripcion, ruta, activo FROM funcionalidades');
        res.status(200).json(funcionalidades);
    } catch (error) {
        console.error('Error in GET /api/admin/funcionalidades:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/funcionalidades', requireFunctionality('admin'), requirePermission('funcionalidades.create'), async (req, res) => {
    try {
        const { codigo, nombre, descripcion, ruta, activo } = req.body;
        if (!codigo || !nombre || !descripcion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }

        const [existing] = await pool.execute('SELECT id FROM funcionalidades WHERE codigo = ?', [codigo]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'El código de la funcionalidad ya existe.' });
        }

        const [result] = await pool.execute(
            'INSERT INTO funcionalidades (codigo, nombre, descripcion, ruta, activo) VALUES (?, ?, ?, ?, ?)',
            [codigo, nombre, descripcion, ruta || null, activo ? 1 : 0]
        );
        res.status(201).json({ message: 'Funcionalidad creada exitosamente.', id: result.insertId });
    } catch (error) {
        console.error('Error in POST /api/admin/funcionalidades:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/funcionalidades/:id', requireFunctionality('admin'), requirePermission('funcionalidades.update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { codigo, nombre, descripcion, ruta, activo } = req.body;

        if (!codigo || !nombre || !descripcion) {
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
        }

        const [funcCheck] = await pool.execute('SELECT id FROM funcionalidades WHERE id = ?', [id]);
        if (funcCheck.length === 0) {
            return res.status(404).json({ error: 'La funcionalidad proporcionada no existe.' });
        }

        await pool.execute(
            'UPDATE funcionalidades SET codigo = ?, nombre = ?, descripcion = ?, ruta = ?, activo = ? WHERE id = ?',
            [codigo, nombre, descripcion, ruta || null, activo ? 1 : 0, id]
        );
        res.status(200).json({ message: 'Funcionalidad actualizada exitosamente.' });
    } catch (error) {
        console.error('Error in PUT /api/admin/funcionalidades:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/admin/funcionalidades/:id', requireFunctionality('admin'), requirePermission('funcionalidades.delete'), async (req, res) => {
    try {
        const { id } = req.params;

        const [funcCheck] = await pool.execute('SELECT id FROM funcionalidades WHERE id = ?', [id]);
        if (funcCheck.length === 0) {
            return res.status(404).json({ error: 'La funcionalidad proporcionada no existe.' });
        }

        const [menuCheck] = await pool.execute('SELECT id FROM menu_items WHERE funcionalidad_id = ? LIMIT 1', [id]);
        if (menuCheck.length > 0) {
            return res.status(400).json({ error: 'La funcionalidad está asignada a menús y no puede ser eliminada.' });
        }

        const [permCheck] = await pool.execute('SELECT permiso_id FROM funcionalidad_permisos WHERE funcionalidad_id = ? LIMIT 1', [id]);
        if (permCheck.length > 0) {
            return res.status(400).json({ error: 'La funcionalidad tiene permisos asociados y no puede ser eliminada.' });
        }

        await pool.execute('DELETE FROM funcionalidades WHERE id = ?', [id]);
        res.status(200).json({ message: 'Funcionalidad eliminada exitosamente.' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/funcionalidades:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/menus', requireFunctionality('admin'), requirePermission('menus.read'), async (req, res) => {
    try {
        const [menus] = await pool.execute('SELECT id, nombre, funcionalidad_id, parent_id, orden, publico, activo FROM menu_items ORDER BY parent_id, orden');
        res.status(200).json(menus);
    } catch (error) {
        console.error('Error in GET /api/admin/menus:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/menus/:id', requireFunctionality('admin'), requirePermission('menus.update'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, funcionalidad_id, parent_id, orden, publico, activo } = req.body;

        if (!nombre || orden === undefined || orden === null) {
            return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, orden).' });
        }

        const [menuCheck] = await pool.execute('SELECT id FROM menu_items WHERE id = ?', [id]);
        if (menuCheck.length === 0) {
            return res.status(404).json({ error: 'El menú proporcionado no existe.' });
        }

        if (funcionalidad_id) {
            const [funcCheck] = await pool.execute('SELECT id FROM funcionalidades WHERE id = ?', [funcionalidad_id]);
            if (funcCheck.length === 0) {
                return res.status(400).json({ error: 'La funcionalidad_id proporcionada no existe.' });
            }
        }

        if (parent_id) {
            const [parentCheck] = await pool.execute('SELECT id FROM menu_items WHERE id = ?', [parent_id]);
            if (parentCheck.length === 0) {
                return res.status(400).json({ error: 'El parent_id proporcionado no existe.' });
            }
        }

        await pool.execute(
            'UPDATE menu_items SET nombre = ?, funcionalidad_id = ?, parent_id = ?, orden = ?, publico = ?, activo = ? WHERE id = ?',
            [nombre, funcionalidad_id || null, parent_id || null, orden, publico ? 1 : 0, activo ? 1 : 0, id]
        );
        res.status(200).json({ message: 'Menú actualizado exitosamente.' });
    } catch (error) {
        console.error('Error in PUT /api/admin/menus:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/menus', requireFunctionality('admin'), requirePermission('menus.create'), async (req, res) => {
    try {
        const { nombre, funcionalidad_id, parent_id, orden, publico, activo } = req.body;

        if (!nombre || orden === undefined || orden === null) {
            return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, orden).' });
        }

        if (funcionalidad_id) {
            const [funcCheck] = await pool.execute('SELECT id FROM funcionalidades WHERE id = ?', [funcionalidad_id]);
            if (funcCheck.length === 0) {
                return res.status(400).json({ error: 'La funcionalidad_id proporcionada no existe.' });
            }
        }

        if (parent_id) {
            const [parentCheck] = await pool.execute('SELECT id FROM menu_items WHERE id = ?', [parent_id]);
            if (parentCheck.length === 0) {
                return res.status(400).json({ error: 'El parent_id proporcionado no existe.' });
            }
        }

        const [result] = await pool.execute(
            'INSERT INTO menu_items (nombre, funcionalidad_id, parent_id, orden, publico, activo) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, funcionalidad_id || null, parent_id || null, orden, publico ? 1 : 0, activo ? 1 : 0]
        );
        res.status(201).json({ message: 'Menú creado exitosamente.', id: result.insertId });
    } catch (error) {
        console.error('Error in POST /api/admin/menus:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.delete('/api/admin/menus/:id', requireFunctionality('admin'), requirePermission('menus.delete'), async (req, res) => {
    try {
        const { id } = req.params;

        const [menuCheck] = await pool.execute('SELECT id FROM menu_items WHERE id = ?', [id]);
        if (menuCheck.length === 0) {
            return res.status(404).json({ error: 'El menú proporcionado no existe.' });
        }

        const [childCheck] = await pool.execute('SELECT id FROM menu_items WHERE parent_id = ? LIMIT 1', [id]);
        if (childCheck.length > 0) {
            return res.status(400).json({ error: 'El menú tiene submenús hijos y no puede ser eliminado.' });
        }

        await pool.execute('DELETE FROM menu_items WHERE id = ?', [id]);
        res.status(200).json({ message: 'Menú eliminado exitosamente.' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/menus:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


app.get('/api/admin/usuario_roles/:userId', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { userId } = req.params;
        const [roles] = await pool.execute('SELECT rol_id FROM usuario_roles WHERE usuario_id = ?', [userId]);
        res.status(200).json(roles.map(r => r.rol_id));
    } catch (error) {
        console.error('Error in GET /api/admin/usuario_roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/usuario_roles/:userId', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { roles } = req.body; // Array of role IDs

        if (!Array.isArray(roles)) {
            return res.status(400).json({ error: 'El campo roles debe ser un arreglo válido.' });
        }

        const connection = await pool.getConnection();
        let lockAcquired = false;
        try {
            // Serialize concurrent modifications using a user-level lock
            const [lockResult] = await connection.execute("SELECT GET_LOCK('admin_auth_update', 10) AS acquired");
            if (!lockResult[0].acquired) {
                return res.status(503).json({ error: 'El sistema está procesando otra actualización. Intenta de nuevo.' });
            }
            lockAcquired = true;

            // Verify all provided roles exist and are active (inside lock to prevent concurrent invalidation)
            if (roles.length > 0) {
                const placeholders = roles.map(() => '?').join(',');
                const [rolesCheck] = await connection.execute(
                    `SELECT COUNT(*) as count FROM roles WHERE id IN (${placeholders}) AND activo = TRUE`,
                    roles
                );
                if (parseInt(rolesCheck[0].count) !== roles.length) {
                    return res.status(400).json({ error: 'Uno o más roles proporcionados no existen o están inactivos.' });
                }
            }

            await connection.beginTransaction();

            await connection.execute('DELETE FROM usuario_roles WHERE usuario_id = ?', [userId]);
            if (roles.length > 0) {
                const placeholders = roles.map(() => '(?, ?)').join(',');
                const values = roles.flatMap(roleId => [userId, roleId]);
                await connection.execute(`INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ${placeholders}`, values);
            }

            // Global minimum admin check. The GET_LOCK above ensures true serialization,
            // preventing the need for an invalid aggregate FOR UPDATE.
            const adminQuery = `
                SELECT COUNT(DISTINCT ur.usuario_id) as count
                FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
                JOIN rol_permisos rp ON r.id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
                WHERE p.codigo = 'admin.access'
            `;
            const [adminCheck] = await connection.execute(adminQuery);
            if (parseInt(adminCheck[0].count) === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Esta operación dejaría al sistema sin administradores activos.' });
            }

            await connection.commit();
            res.status(200).json({ message: 'Roles de usuario actualizados.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (lockAcquired) {
                try {
                    await connection.execute("SELECT RELEASE_LOCK('admin_auth_update')");
                } catch (releaseErr) {
                    console.error('Error releasing lock admin_auth_update:', releaseErr);
                }
            }
            connection.release();
        }
    } catch (error) {
        console.error('Error in POST /api/admin/usuario_roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/rol_permisos/:rolId', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { rolId } = req.params;
        const [permisos] = await pool.execute('SELECT permiso_id FROM rol_permisos WHERE rol_id = ?', [rolId]);
        res.status(200).json(permisos.map(p => p.permiso_id));
    } catch (error) {
        console.error('Error in GET /api/admin/rol_permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/rol_permisos/:rolId', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { rolId } = req.params;
        const { permisos } = req.body; // Array of permission IDs

        if (!Array.isArray(permisos)) {
            return res.status(400).json({ error: 'El campo permisos debe ser un arreglo válido.' });
        }

        const connection = await pool.getConnection();
        let lockAcquired = false;
        try {
            // Serialize concurrent modifications using a user-level lock
            const [lockResult] = await connection.execute("SELECT GET_LOCK('admin_auth_update', 10) AS acquired");
            if (!lockResult[0].acquired) {
                return res.status(503).json({ error: 'El sistema está procesando otra actualización. Intenta de nuevo.' });
            }
            lockAcquired = true;

            await connection.beginTransaction();

            const [rolCheck] = await connection.execute('SELECT id FROM roles WHERE id = ?', [rolId]);
            if (rolCheck.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'El rol proporcionado no existe.' });
            }

            if (permisos.length > 0) {
                const placeholders = permisos.map(() => '?').join(',');
                const [permisosCheck] = await connection.execute(
                    `SELECT COUNT(*) as count FROM permisos WHERE id IN (${placeholders})`,
                    permisos
                );
                if (parseInt(permisosCheck[0].count) !== permisos.length) {
                    await connection.rollback();
                    return res.status(400).json({ error: 'Uno o más permisos proporcionados no existen.' });
                }
            }

            await connection.execute('DELETE FROM rol_permisos WHERE rol_id = ?', [rolId]);
            if (permisos.length > 0) {
                const placeholders = permisos.map(() => '(?, ?)').join(',');
                const values = permisos.flatMap(permisoId => [rolId, permisoId]);
                await connection.execute(`INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ${placeholders}`, values);
            }

            // Global minimum admin check. The GET_LOCK above ensures true serialization,
            // preventing the need for an invalid aggregate FOR UPDATE.
            const adminQuery = `
                SELECT COUNT(DISTINCT ur.usuario_id) as count
                FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
                JOIN rol_permisos rp ON r.id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
                WHERE p.codigo = 'admin.access'
            `;
            const [adminCheck] = await connection.execute(adminQuery);
            if (parseInt(adminCheck[0].count) === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Esta operación dejaría al sistema sin administradores activos.' });
            }

            await connection.commit();
            res.status(200).json({ message: 'Permisos de rol actualizados.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            if (lockAcquired) {
                try {
                    await connection.execute("SELECT RELEASE_LOCK('admin_auth_update')");
                } catch (releaseErr) {
                    console.error('Error releasing lock admin_auth_update:', releaseErr);
                }
            }
            connection.release();
        }
    } catch (error) {
        console.error('Error in POST /api/admin/rol_permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

const fs = require("fs");
let visitCounter = 0;
let visitasWritePromise = Promise.resolve();
try {
    if (fs.existsSync("visitas.json")) {
        const data = fs.readFileSync("visitas.json", "utf8");
        visitCounter = JSON.parse(data).visitas || 0;
    }
} catch (err) {
    console.error("Error reading visitas.json:", err);
}

app.get("/api/visitas", (req, res) => {
    if (!req.cookies?.visited) {
        visitCounter++;
        const currentCounter = visitCounter;

        visitasWritePromise = visitasWritePromise.then(() => {
            return new Promise((resolve) => {
                const tmpFile = `visitas.json.tmp.${Date.now()}.${Math.random().toString(36).substring(2)}`;
                fs.writeFile(tmpFile, JSON.stringify({ visitas: currentCounter }), (err) => {
                    if (err) {
                        console.error("Error writing to temp visitas file:", err);
                        return resolve();
                    }
                    fs.rename(tmpFile, "visitas.json", (renameErr) => {
                        if (renameErr) {
                            console.error("Error renaming temp visitas file:", renameErr);
                            fs.unlink(tmpFile, () => {});
                        }
                        resolve();
                    });
                });
            });
        }).catch(err => {
            console.error("Promise queue error:", err);
        });

        res.cookie("visited", "true", { maxAge: 24 * 60 * 60 * 1000, httpOnly: true });
    }
    res.json({ visitas: visitCounter, version: require("./package.json").version });
});


app.get('/api/knowledge', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({ error: 'Falta el parámetro de búsqueda (query)' });
        }

        const token = req.cookies.auth_token;
        let userId = null;

        if (token) {
            try {
                const decoded = await verifyToken(token, pool);
                userId = decoded.id;
            } catch (err) {
                // Treated as Guest
            }
        }

        const result = await searchKnowledge(pool, userId, query);
        res.status(200).json({ result });
    } catch (error) {
        console.error('Error in /api/knowledge:', error);
        res.status(500).json({ error: 'Error interno del servidor al consultar la base de conocimiento.' });
    }
});

app.get('/api/ideas', requireFunctionality('ideas'), requirePermission('ideas.read'), async (req, res) => {
    try {
        const usuario_id = req.userId;

        const [ideas] = await pool.execute(
            'SELECT id, usuario_id, titulo, descripcion, estado, fecha FROM ideas WHERE usuario_id = ? ORDER BY fecha DESC',
            [usuario_id]
        );

        res.status(200).json({ ideas });
    } catch (error) {
        console.error('Error in /api/ideas (GET):', error);
        res.status(500).json({ error: 'Error al obtener ideas.' });
    }
});

app.post('/api/ideas', requireFunctionality('ideas'), requirePermission('ideas.create'), async (req, res) => {
    try {
        const usuario_id = req.userId;

        let { titulo, descripcion, estado } = req.body;

        if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
            return res.status(400).json({ error: 'El título es obligatorio y no puede estar vacío.' });
        }

        titulo = titulo.trim();
        if (titulo.length > 200) {
            return res.status(400).json({ error: 'El título no puede exceder los 200 caracteres.' });
        }

        if (descripcion !== undefined && descripcion !== null) {
            if (typeof descripcion !== 'string') {
                return res.status(400).json({ error: 'La descripción debe ser texto.' });
            }
            descripcion = descripcion.trim();
        } else {
            descripcion = null;
        }

        const validStates = ['pendiente', 'en progreso', 'completada', 'descartada'];
        if (!estado || typeof estado !== 'string' || estado.trim() === '') {
            estado = 'pendiente';
        } else {
            estado = estado.trim().toLowerCase();
            if (!validStates.includes(estado)) {
                return res.status(400).json({ error: 'Estado inválido.' });
            }
            if (estado.length > 50) {
                return res.status(400).json({ error: 'El estado no puede exceder los 50 caracteres.' });
            }
        }

        const [result] = await pool.execute(
            'INSERT INTO ideas (usuario_id, titulo, descripcion, estado) VALUES (?, ?, ?, ?)',
            [usuario_id, titulo, descripcion, estado]
        );

        res.status(201).json({ message: 'Idea creada exitosamente.', id: result.insertId });

    } catch (error) {
        console.error('Error in /api/ideas (POST):', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             res.status(401).json({ error: 'Token inválido o expirado.' });
        } else {
             res.status(500).json({ error: 'Error interno del servidor al crear la idea.' });
        }
    }
});


app.delete('/api/ideas/:id', requireFunctionality('ideas'), requirePermission('ideas.delete'), async (req, res) => {
    try {
        const usuario_id = req.userId;
        const idea_id = req.params.id;

        if (!idea_id || isNaN(idea_id)) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        const [result] = await pool.execute(
            'DELETE FROM ideas WHERE id = ? AND usuario_id = ? AND estado = ?',
            [idea_id, usuario_id, 'pendiente']
        );

        if (result.affectedRows === 0) {
            return res.status(403).json({ error: 'La idea no existe, no te pertenece o no está en estado pendiente.' });
        }

        res.status(200).json({ message: 'Idea eliminada correctamente.' });

    } catch (error) {
        console.error('Error in /api/ideas/:id (DELETE):', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             res.status(401).json({ error: 'Token inválido o expirado.' });
        } else {
             res.status(500).json({ error: 'Error interno del servidor al eliminar la idea.' });
        }
    }
});

app.put('/api/ideas/:id/estado', requireFunctionality('ideas'), requirePermission('ideas.update'), async (req, res) => {
    try {
        const usuario_id = req.userId;
        const idea_id = req.params.id;
        const { estado } = req.body;

        if (!idea_id || isNaN(idea_id)) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        const estadosValidos = ['pendiente', 'en progreso', 'completada', 'descartada'];
        if (!estadosValidos.includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido.' });
        }

        const [result] = await pool.execute(
            'UPDATE ideas SET estado = ? WHERE id = ? AND usuario_id = ?',
            [estado, idea_id, usuario_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        res.status(200).json({ message: 'Estado actualizado correctamente.' });
    } catch (error) {
        console.error('Error in /api/ideas/:id/estado (PUT):', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.listen(port, () => { console.log(`Server listening on port ${port}`); });

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        app,
        initMailTransporter,
        normalizeFunctionalityCode,
        checkUserFunctionalityAccess,
        checkUserPermission,
        requireFunctionality,
        FUNCIONALIDAD_CODE_ALIASES
    };
}

