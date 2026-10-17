require('dotenv').config();
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

app.use('/api/login', authLimiter);
app.use('/api/recover', authLimiter);

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
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test Database Connection
pool.getConnection()
    .then(connection => {
        console.log("Connected to MySQL database.");
        connection.release();
    })
    .catch(err => {
        console.error("Error connecting to MySQL database:", err);
    });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const chat = ai.chats.create({
    model: 'gemini-3.6-flash',
    config: {
        systemInstruction: "Eres 'idealita', un asistente virtual. Siempre debes presentarte y responder como 'idealita'. Nunca menciones que eres Gemini, un modelo de lenguaje grande, o una IA de Google."
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

        // Enviar respuesta por partes conforme Gemini la genera
        const stream = await chat.sendMessageStream({
            message: message
        });

        for await (const chunk of stream) {
            if (chunk.text) {
                res.write(chunk.text);
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

        res.cookie('auth_token', token, {
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

// Initialize mail transporter once
function initMailTransporter() {
    const useOAuth2 = process.env.SMTP_CLIENT_ID || process.env.SMTP_CLIENT_SECRET || process.env.SMTP_REFRESH_TOKEN;

    if (useOAuth2) {
        if (!process.env.SMTP_USER || !process.env.SMTP_CLIENT_ID || !process.env.SMTP_CLIENT_SECRET || !process.env.SMTP_REFRESH_TOKEN) {
            console.error('SMTP OAuth2 Error: Incomplete configuration. SMTP_USER, SMTP_CLIENT_ID, SMTP_CLIENT_SECRET, and SMTP_REFRESH_TOKEN are all required for OAuth2.');
        } else {
            mailTransporter = nodemailer.createTransport({
                service: 'hotmail',
                auth: {
                    type: 'OAuth2',
                    user: process.env.SMTP_USER,
                    clientId: process.env.SMTP_CLIENT_ID,
                    clientSecret: process.env.SMTP_CLIENT_SECRET,
                    refreshToken: process.env.SMTP_REFRESH_TOKEN
                }
            });
            console.log('Idealandia recovery email configured to use OAuth2 (Outlook/Hotmail).');
        }
    } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        mailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        console.log('Idealandia recovery email configured to use Basic Auth.');
    } else {
        console.log('Idealandia recovery email not configured to send real emails (SMTP variables missing).');
    }
}
initMailTransporter();

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
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

        // Invalidate previous pending tokens for this user
        await pool.execute('UPDATE password_resets SET used = 1 WHERE usuario_id = ? AND used = 0', [user.id]);

        await pool.execute(
            'INSERT INTO password_resets (usuario_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [user.id, tokenHash, expiresAt]
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
                    text: `Has solicitado recuperar tu contraseña. Usa este enlace para restablecerla (válido por 30 minutos):\n\n${resetLink}\n\nSi no fuiste tú, ignora este correo.`,
                    html: `<p>Has solicitado recuperar tu contraseña. Usa este enlace para restablecerla (válido por 30 minutos):</p><p><a href="${resetLink}">${resetLink}</a></p><p>Si no fuiste tú, ignora este correo.</p>`
                });
            } catch (err) {
                console.error("Error al enviar el correo de recuperación:", err.message);
                // We still want to return a successful message to the user to prevent enumeration
            }
        } else {
            console.log('Idealandia recovery email successfully triggered. (Email content suppressed to protect secrets). Configured SMTP variables to send real emails.');
        }

        res.status(200).json({ message: genericMessage });

    } catch (error) {
        console.error('Error in /api/recover. Check server logs.');
        res.status(500).json({ error: 'Error interno del servidor durante la recuperación.' });
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
                SELECT fp.funcionalidad_id
                FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
                JOIN rol_permisos rp ON r.id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
                JOIN funcionalidad_permisos fp ON p.id = fp.permiso_id
                JOIN funcionalidades f ON fp.funcionalidad_id = f.id AND f.activo = TRUE
                WHERE ur.usuario_id = ?
            `;
            const [allowed] = await pool.execute(query, [userId]);
            allowed.forEach(row => allowedFunctionalityIds.add(row.funcionalidad_id));
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

                const filterEmptyContainers = (nodes) => {
            return nodes.filter(item => {
                if (item.hijos && item.hijos.length > 0) {
                    item.hijos = filterEmptyContainers(item.hijos);
                }

                const isContainer = containerIds.has(item.id);
                const hasVisibleChildren = item.hijos && item.hijos.length > 0;

                // If it's a container, it must have visible children, even if publico = 1
                if (isContainer) return hasVisibleChildren;

                if (item.publico === 1) return true;

                if (item.funcionalidad_id !== null) {
                    return allowedFunctionalityIds.has(item.funcionalidad_id);
                }

                return false;
            });
        };

        const finalMenuTree = filterEmptyContainers(menuTree);
        res.status(200).json(finalMenuTree);

    } catch (error) {
        console.error('Error in /api/menu:', error);
        res.status(500).json({ error: 'Error interno del servidor al obtener el menú.' });
    }
});

app.get('/api/me', async (req, res) => {
    try {
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
    res.cookie('auth_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(0) // Expire immediately
    });
    res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
});

const requireAdmin = async (req, res, next) => {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const decoded = await verifyToken(token, pool);
        const userId = decoded.id;

        // Verify if user has the admin.access permission
        const query = `
            SELECT p.nombre
            FROM usuario_roles ur
            JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
            JOIN rol_permisos rp ON r.id = rp.rol_id
            JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
            WHERE ur.usuario_id = ? AND p.codigo = 'admin.access'
        `;
        const [permissions] = await pool.execute(query, [userId]);

        if (permissions.length === 0) {
            return res.status(403).json({ error: 'Forbidden. No tienes permisos de administrador.' });
        }

        req.userId = userId;
        next();
    } catch (error) {
        console.error('Error in admin middleware:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado') {
             res.status(401).json({ error: 'Token inválido o expirado.' });
        } else {
             res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }
};

app.get('/api/admin/check', requireAdmin, async (req, res) => {
    res.status(200).json({ message: 'Acceso de administrador concedido.' });
});

// --- ADMIN ENDPOINTS ---

app.get('/api/admin/usuarios', requireAdmin, async (req, res) => {
    try {
        const [usuarios] = await pool.execute('SELECT id, usuario, nombre, telefono, email FROM usuarios');
        res.status(200).json(usuarios);
    } catch (error) {
        console.error('Error in GET /api/admin/usuarios:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/funcionalidad_permisos/:funcId', requireAdmin, async (req, res) => {
    try {
        const { funcId } = req.params;
        const [permisos] = await pool.execute('SELECT permiso_id FROM funcionalidad_permisos WHERE funcionalidad_id = ?', [funcId]);
        res.status(200).json(permisos.map(p => p.permiso_id));
    } catch (error) {
        console.error('Error in GET /api/admin/funcionalidad_permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/funcionalidad_permisos/:funcId', requireAdmin, async (req, res) => {
    try {
        const { funcId } = req.params;
        const { permisos } = req.body; // Array of permission IDs

        if (!Array.isArray(permisos)) {
            return res.status(400).json({ error: 'El campo permisos debe ser un arreglo válido.' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [funcCheck] = await connection.execute('SELECT id FROM funcionalidades WHERE id = ?', [funcId]);
            if (funcCheck.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'La funcionalidad proporcionada no existe.' });
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

app.post('/api/admin/usuarios', requireAdmin, async (req, res) => {
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

app.put('/api/admin/usuarios/:id', requireAdmin, async (req, res) => {
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

app.delete('/api/admin/usuarios/:id', requireAdmin, async (req, res) => {
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


app.get('/api/admin/roles', requireAdmin, async (req, res) => {
    try {
        const [roles] = await pool.execute('SELECT id, nombre, descripcion, activo FROM roles');
        res.status(200).json(roles);
    } catch (error) {
        console.error('Error in GET /api/admin/roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/roles', requireAdmin, async (req, res) => {
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

app.put('/api/admin/roles/:id', requireAdmin, async (req, res) => {
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

app.get('/api/admin/permisos', requireAdmin, async (req, res) => {
    try {
        const [permisos] = await pool.execute('SELECT id, codigo, nombre, descripcion, activo FROM permisos');
        res.status(200).json(permisos);
    } catch (error) {
        console.error('Error in GET /api/admin/permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/funcionalidades', requireAdmin, async (req, res) => {
    try {
        const [funcionalidades] = await pool.execute('SELECT id, codigo, nombre, descripcion, ruta, activo FROM funcionalidades');
        res.status(200).json(funcionalidades);
    } catch (error) {
        console.error('Error in GET /api/admin/funcionalidades:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/funcionalidades/:id', requireAdmin, async (req, res) => {
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

app.get('/api/admin/menus', requireAdmin, async (req, res) => {
    try {
        const [menus] = await pool.execute('SELECT id, nombre, funcionalidad_id, parent_id, orden, publico, activo FROM menu_items ORDER BY parent_id, orden');
        res.status(200).json(menus);
    } catch (error) {
        console.error('Error in GET /api/admin/menus:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.put('/api/admin/menus/:id', requireAdmin, async (req, res) => {
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

app.post('/api/admin/menus', requireAdmin, async (req, res) => {
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


app.get('/api/admin/usuario_roles/:userId', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const [roles] = await pool.execute('SELECT rol_id FROM usuario_roles WHERE usuario_id = ?', [userId]);
        res.status(200).json(roles.map(r => r.rol_id));
    } catch (error) {
        console.error('Error in GET /api/admin/usuario_roles:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/usuario_roles/:userId', requireAdmin, async (req, res) => {
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

app.get('/api/admin/rol_permisos/:rolId', requireAdmin, async (req, res) => {
    try {
        const { rolId } = req.params;
        const [permisos] = await pool.execute('SELECT permiso_id FROM rol_permisos WHERE rol_id = ?', [rolId]);
        res.status(200).json(permisos.map(p => p.permiso_id));
    } catch (error) {
        console.error('Error in GET /api/admin/rol_permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/rol_permisos/:rolId', requireAdmin, async (req, res) => {
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

app.get('/api/ideas', async (req, res) => {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const secret = process.env.AUTH_SECRET;
        const decoded = await verifyToken(token, pool);
        const usuario_id = decoded.id;

        const [ideas] = await pool.execute(
            'SELECT id, usuario_id, titulo, descripcion, estado, fecha FROM ideas WHERE usuario_id = ? ORDER BY fecha DESC',
            [usuario_id]
        );

        res.status(200).json({ ideas });
    } catch (error) {
        console.error('Error in /api/ideas (GET):', error);
        res.status(401).json({ error: 'Token inválido o error al obtener ideas.' });
    }
});

app.post('/api/ideas', async (req, res) => {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const secret = process.env.AUTH_SECRET;
        const decoded = await verifyToken(token, pool);
        const usuario_id = decoded.id;

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


app.delete('/api/ideas/:id', async (req, res) => {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const secret = process.env.AUTH_SECRET;
        const decoded = await verifyToken(token, pool);
        const usuario_id = decoded.id;
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

app.put('/api/ideas/:id/estado', async (req, res) => {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const secret = process.env.AUTH_SECRET;
        const decoded = await verifyToken(token, pool);
        const usuario_id = decoded.id;
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
