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

const requireAdmin = async (req, res, next) => {
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
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
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

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('DELETE FROM funcionalidad_permisos WHERE funcionalidad_id = ?', [funcId]);
            if (permisos && permisos.length > 0) {
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
        await pool.execute(
            'UPDATE roles SET nombre = ?, descripcion = ?, activo = ? WHERE id = ?',
            [nombre, descripcion, activo ? 1 : 0, id]
        );
        res.status(200).json({ message: 'Rol actualizado exitosamente.' });
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
        await pool.execute(
            'UPDATE funcionalidades SET codigo = ?, nombre = ?, descripcion = ?, ruta = ?, activo = ? WHERE id = ?',
            [codigo, nombre, descripcion, ruta, activo ? 1 : 0, id]
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

        // Check if removing admin.access from self
        if (req.userId === parseInt(userId)) {
             // Let's verify if the new roles still grant admin.access via active permissions and active roles
             if (roles.length > 0) {
                 const placeholders = roles.map(() => '?').join(',');
                 const query = `
                     SELECT COUNT(*) as count
                     FROM rol_permisos rp
                     JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
                     JOIN roles r ON rp.rol_id = r.id AND r.activo = TRUE
                     WHERE rp.rol_id IN (${placeholders}) AND p.codigo = 'admin.access'
                 `;
                 const [result] = await pool.execute(query, roles);
                 if (parseInt(result[0].count) === 0) {
                     return res.status(400).json({ error: 'No puedes quitarte tus propios permisos de administrador.' });
                 }
             } else {
                 return res.status(400).json({ error: 'No puedes quitarte tus propios permisos de administrador.' });
             }
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('DELETE FROM usuario_roles WHERE usuario_id = ?', [userId]);
            if (roles && roles.length > 0) {
                const placeholders = roles.map(() => '(?, ?)').join(',');
                const values = roles.flatMap(roleId => [userId, roleId]);
                await connection.execute(`INSERT INTO usuario_roles (usuario_id, rol_id) VALUES ${placeholders}`, values);
            }
            await connection.commit();
            res.status(200).json({ message: 'Roles de usuario actualizados.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
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

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('DELETE FROM rol_permisos WHERE rol_id = ?', [rolId]);
            if (permisos && permisos.length > 0) {
                const placeholders = permisos.map(() => '(?, ?)').join(',');
                const values = permisos.flatMap(permisoId => [rolId, permisoId]);
                await connection.execute(`INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ${placeholders}`, values);
            }
            await connection.commit();
            res.status(200).json({ message: 'Permisos de rol actualizados.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in POST /api/admin/rol_permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
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
