require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(__dirname));

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
            'SELECT id, usuario, password_hash, nombre, telefono, email FROM usuarios WHERE usuario = ?',
            [usuario]
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
            usuario: user.usuario
        };

        const secret = process.env.AUTH_SECRET;
        const token = jwt.sign(payload, secret, { expiresIn: '24h' });

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: false, // Since it's HTTP port 3000
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Return user data (excluding password_hash)
        const { password_hash, ...userData } = user;
        res.status(200).json({ user: userData, message: 'Login exitoso.' });

    } catch (error) {
        console.error('Error in /api/login:', error);
        res.status(500).json({ error: 'Error interno del servidor durante el inicio de sesión.' });
    }
});

app.get('/api/menu', async (req, res) => {
    try {
        const token = req.cookies.auth_token;
        let userId = null;

        if (token) {
            try {
                const secret = process.env.AUTH_SECRET;
                const decoded = jwt.verify(token, secret);
                userId = decoded.id;
            } catch (err) {
                // Invalid or expired token: treat as unauthenticated
            }
        }

        // 1. Get all active menu items
        const [menuItems] = await pool.execute(
            'SELECT id, nombre, ruta, funcionalidad_id, parent_id, publico, orden, icono FROM menu_items WHERE activo = TRUE ORDER BY parent_id, orden'
        );

        let allowedFunctionalityIds = new Set();

        // 2. If authenticated, get allowed functionalities based on roles and permissions
        if (userId) {
            const query = `
                SELECT DISTINCT f.id
                FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id
                JOIN rol_permisos rp ON r.id = rp.rol_id
                JOIN permisos p ON rp.permiso_id = p.id
                JOIN funcionalidad_permisos fp ON p.id = fp.permiso_id
                JOIN funcionalidades f ON fp.funcionalidad_id = f.id
                WHERE ur.usuario_id = ?
            `;
            const [functionalities] = await pool.execute(query, [userId]);
            functionalities.forEach(f => allowedFunctionalityIds.add(f.id));
        }

        // 3. Filter items that user is authorized to see
        const visibleItemsMap = new Map();

        // First pass: mark explicitly allowed items
        menuItems.forEach(item => {
            const isPublic = Boolean(item.publico);
            const isAuthorizedProtected = !isPublic && item.funcionalidad_id && allowedFunctionalityIds.has(item.funcionalidad_id);
            const isContainer = item.funcionalidad_id === null;

            if (isPublic || isAuthorizedProtected || isContainer) {
                visibleItemsMap.set(item.id, { ...item, hijos: [] });
            }
        });

        // Second pass: build hierarchy and keep containers only if they have visible children
        const menuTree = [];

        // Ensure child items are added to parents
        menuItems.forEach(item => {
            if (visibleItemsMap.has(item.id)) {
                const node = visibleItemsMap.get(item.id);
                if (item.parent_id === null) {
                    menuTree.push(node);
                } else {
                    const parentNode = visibleItemsMap.get(item.parent_id);
                    if (parentNode) {
                        parentNode.hijos.push(node);
                    }
                }
            }
        });

        // Helper function to recursively filter empty containers
        const filterEmptyContainers = (items) => {
            return items.filter(item => {
                if (item.hijos && item.hijos.length > 0) {
                    item.hijos = filterEmptyContainers(item.hijos);
                }

                // Keep if it's explicitly public or allowed, OR if it's a container with visible children
                const isContainer = item.funcionalidad_id === null;
                const hasVisibleChildren = item.hijos && item.hijos.length > 0;

                // If it's a container, it must have children to be visible
                if (isContainer) {
                    return hasVisibleChildren;
                }

                return true; // Non-containers already passed the explicit check
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
        const decoded = jwt.verify(token, secret);

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
        secure: false,
        sameSite: 'lax',
        expires: new Date(0) // Expire immediately
    });
    res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
});

app.get('/api/admin/check', async (req, res) => {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const secret = process.env.AUTH_SECRET;
        const decoded = jwt.verify(token, secret);
        const userId = decoded.id;

        // Verify if user has the admin.access permission
        const query = `
            SELECT p.nombre
            FROM usuario_roles ur
            JOIN roles r ON ur.rol_id = r.id
            JOIN rol_permisos rp ON r.id = rp.rol_id
            JOIN permisos p ON rp.permiso_id = p.id
            WHERE ur.usuario_id = ? AND p.codigo = 'admin.access'
        `;
        const [permissions] = await pool.execute(query, [userId]);

        if (permissions.length === 0) {
            return res.status(403).json({ error: 'Forbidden. No tienes permisos de administrador.' });
        }

        res.status(200).json({ message: 'Acceso de administrador concedido.' });

    } catch (error) {
        console.error('Error in /api/admin/check:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             res.status(401).json({ error: 'Token inválido o expirado.' });
        } else {
             res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }
});

app.get('/api/ideas', async (req, res) => {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.' });
        }

        const secret = process.env.AUTH_SECRET;
        const decoded = jwt.verify(token, secret);
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
        const decoded = jwt.verify(token, secret);
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
        const decoded = jwt.verify(token, secret);
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
app.listen(port, () => { console.log(`Server listening on port ${port}`); });
