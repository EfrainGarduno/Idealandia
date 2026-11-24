require('dotenv').config();
if (!process.env.GEMINI_API_KEY) {
    const fs = require('fs');
    const fallbackEnv = 'D:\\Personales\\EstrategiaPersonal\\Mipagina\\Idealandia-local\\.env';
    if (fs.existsSync(fallbackEnv)) {
        require('dotenv').config({ path: fallbackEnv });
    }
}
const { searchKnowledge } = require('./knowledgeService');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const zlib = require('zlib');
const { 
    calculateAverageSalaryLast250Weeks, 
    extractPeriodsFromIMSSDocumentText, 
    validateAndCalculatePensionPeriods,
    calculatePensionProjection,
    calculateIMSSLey73Pension,
    extractBirthDateFromCurp,
    calcularEdadPensionaria,
    reconstructDeterministicPeriods,
    determinarUltimoPeriodoCronologico,
    validarSalarioProyectadoVsUltimoPeriodo,
    SALARIO_MINIMO_GENERAL_VIGENTE,
    SALARIOS_MINIMOS_GENERALES
} = require('./pension');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');
const { getEngine, listAvailableEngines } = require('./ideaEngines');
const MotorFinanciero = require('./public/js/motorFinanciero');


async function verifyToken(token, connectionPool) {
    const secret = process.env.AUTH_SECRET;
    const decoded = jwt.verify(token, secret);

    // Check DB for jwt_version to invalidate old tokens
    const [users] = await connectionPool.execute('SELECT jwt_version FROM usuarios WHERE id = ?', [decoded.id]);
    if (users.length === 0) {
        throw new Error('Usuario no encontrado');
    }

    // Verificar si el usuario está activo (en BD real)
    try {
        const [activoRows] = await connectionPool.execute('SELECT activo FROM usuarios WHERE id = ?', [decoded.id]);
        if (activoRows.length > 0 && (activoRows[0].activo === 0 || activoRows[0].activo === false)) {
            throw new Error('Usuario inactivo');
        }
    } catch (e) {
        if (e.message === 'Usuario inactivo') throw e;
        // Si el mock no implementa SELECT activo, continuar normalmente
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
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(__dirname));
app.use('/vendor/libphonenumber-js', express.static(path.join(__dirname, 'node_modules/libphonenumber-js/bundle')));

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
    'admin': 'administracion',
    'contexto': 'contexto_idealita'
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
    'menus.read', 'menus.create', 'menus.update', 'menus.delete',
    'asociados.read', 'asociados.autorizar', 'asociados.rechazar', 'asociados.pedir_informacion',
    'finanzas.read', 'finanzas.create', 'finanzas.update', 'finanzas.delete',
    'contexto.read', 'contexto.create', 'contexto.update', 'contexto.delete'
];

const FUNCIONALIDAD_PERMISOS_MAPPING = {
    'administracion': ADMIN_PERMISOS,
    'admin': ADMIN_PERMISOS,
    'contexto_idealita': [
        'contexto.read',
        'contexto.create',
        'contexto.update',
        'contexto.delete'
    ],
    'contexto': [
        'contexto.read',
        'contexto.create',
        'contexto.update',
        'contexto.delete'
    ],
    'ideas': [
        'ideas.read',
        'ideas.create',
        'ideas.update',
        'ideas.delete',
        'ideas.develop',
        'ideas.use_ai'
    ],
    'creaciones': ['creaciones.read', 'creaciones.create', 'creaciones.update', 'creaciones.delete'],
    'asesoria_pensiones': [
        'calculadora.basica',
        'calculadora.intermedia',
        'calculadora.avanzada',
        'asesoria_pensiones.read',
        'asesoria_pensiones.create',
        'asesoria_pensiones.update',
        'asesoria_pensiones.delete'
    ],
    'asesorias_financieras': [
        'asesorias_financieras.read',
        'asesorias_financieras.create',
        'asesorias_financieras.update',
        'asesorias_financieras.delete'
    ]
};

// =============================================================================
// MÓDULO IDEAS - CONSTANTES Y ADAPTADOR DE ESTADOS (FASE 4 / F4.1)
// =============================================================================
const IDEAS_ESTADOS_OFICIALES = Object.freeze([
    'semilla',
    'en_desarrollo',
    'en_validacion',
    'lista',
    'en_accion',
    'realizada',
    'archivada'
]);

const IDEAS_ESTADOS_LEGADOS_MAP = Object.freeze({
    'pendiente': 'semilla',
    'en progreso': 'en_desarrollo',
    'completada': 'realizada',
    'descartada': 'archivada'
});

const IDEAS_OFICIAL_A_LEGADO_MAP = Object.freeze({
    'semilla': 'pendiente',
    'en_desarrollo': 'en progreso',
    'en_validacion': 'en progreso',
    'lista': 'en progreso',
    'en_accion': 'en progreso',
    'realizada': 'completada',
    'archivada': 'descartada'
});

const IDEAS_TRANSICIONES_VALIDAS = Object.freeze({
    'semilla': Object.freeze(['en_desarrollo', 'archivada']),
    'en_desarrollo': Object.freeze(['en_validacion', 'archivada']),
    'en_validacion': Object.freeze(['en_desarrollo', 'lista', 'archivada']),
    'lista': Object.freeze(['en_accion', 'en_desarrollo', 'archivada']),
    'en_accion': Object.freeze(['realizada', 'en_desarrollo', 'archivada']),
    'realizada': Object.freeze(['archivada']),
    'archivada': Object.freeze(['en_desarrollo']) // reactivación al flujo de desarrollo
});

const IDEAS_PRIVACIDADES_CATALOGO = Object.freeze([
    Object.freeze({ clave: 'privada', nombre: 'Privada', descripcion: 'Visible únicamente por el autor.' }),
    Object.freeze({ clave: 'compartida', nombre: 'Compartida', descripcion: 'Visible para colaboradores o asociados.' }),
    Object.freeze({ clave: 'publica', nombre: 'Pública', descripcion: 'Visible para toda la comunidad.' })
]);

const IDEAS_MODALIDADES_CATALOGO = Object.freeze([
    Object.freeze({ clave: 'individual', nombre: 'Individual', descripcion: 'Desarrollo individual por el autor.' }),
    Object.freeze({ clave: 'colaborativa', nombre: 'Colaborativa', descripcion: 'Abierta al trabajo en equipo y co-creación.' }),
    Object.freeze({ clave: 'busco_inversion', nombre: 'Búsqueda de Inversión', descripcion: 'En búsqueda de inversión o financiamiento.' }),
    Object.freeze({ clave: 'busco_mentoria', nombre: 'Búsqueda de Mentoría', descripcion: 'En búsqueda de mentoría o asesoría estratégica.' }),
    Object.freeze({ clave: 'busco_apoyo', nombre: 'Búsqueda de Apoyo', descripcion: 'En búsqueda de apoyo, aliados o difusión.' })
]);

const IDEAS_ESTADOS_CATALOGO = Object.freeze([
    Object.freeze({ clave: 'semilla', nombre: 'Semilla', descripcion: 'Idea inicial registrada en la plataforma.' }),
    Object.freeze({ clave: 'en_desarrollo', nombre: 'En Desarrollo', descripcion: 'Idea en proceso activo de estructuración y maduración.' }),
    Object.freeze({ clave: 'en_validacion', nombre: 'En Validación', descripcion: 'Validación de hipótesis, viabilidad y mercado.' }),
    Object.freeze({ clave: 'lista', nombre: 'Lista', descripcion: 'Idea madura y lista para su ejecución o presentación.' }),
    Object.freeze({ clave: 'en_accion', nombre: 'En Acción', descripcion: 'Idea en fase operativa de implementación y lanzamiento.' }),
    Object.freeze({ clave: 'realizada', nombre: 'Realizada', descripcion: 'Idea consolidada y ejecutada exitosamente.' }),
    Object.freeze({ clave: 'archivada', nombre: 'Archivada', descripcion: 'Idea pausada, descartada o archivada para futura referencia.' })
]);

/**
 * Comprueba si una transición entre dos estados es permitida por la máquina de estados oficial.
 *
 * @param {string} estadoOrigen - Estado de partida (oficial o legado).
 * @param {string} estadoDestino - Estado de llegada (oficial o legado).
 * @returns {boolean}
 */
function isValidIdeaTransition(estadoOrigen, estadoDestino) {
    const origenOficial = normalizeIdeaEstado(estadoOrigen);
    const destinoOficial = normalizeIdeaEstado(estadoDestino);
    if (!origenOficial || !destinoOficial) return false;
    const permitidas = IDEAS_TRANSICIONES_VALIDAS[origenOficial] || [];
    return permitidas.includes(destinoOficial);
}

/**
 * Normaliza y adapta un estado de idea recibido (soporta oficial y legado).
 * Devuelve el estado oficial correspondiente o null si el estado no es reconocido.
 *
 * @param {string} rawEstado - Estado a normalizar.
 * @returns {string|null} - Estado oficial o null si es inválido.
 */
function normalizeIdeaEstado(rawEstado) {
    if (!rawEstado || typeof rawEstado !== 'string') return null;
    const clean = rawEstado.trim().toLowerCase();

    // 1. Estado oficial válido
    if (IDEAS_ESTADOS_OFICIALES.includes(clean)) {
        return clean;
    }

    // 2. Estado legado temporal mapeado a oficial
    if (IDEAS_ESTADOS_LEGADOS_MAP[clean]) {
        return IDEAS_ESTADOS_LEGADOS_MAP[clean];
    }

    return null;
}

/**
 * Comprueba si un estado (oficial o legado) es reconocido por el sistema.
 *
 * @param {string} rawEstado
 * @returns {boolean}
 */
function isValidIdeaEstado(rawEstado) {
    return normalizeIdeaEstado(rawEstado) !== null;
}

/**
 * Convierte un estado oficial al equivalente legado más cercano para compatibilidad temporal.
 *
 * @param {string} oficialEstado
 * @returns {string}
 */
function toLegacyIdeaEstado(oficialEstado) {
    if (!oficialEstado || typeof oficialEstado !== 'string') return '';
    const clean = oficialEstado.trim().toLowerCase();
    return IDEAS_OFICIAL_A_LEGADO_MAP[clean] || clean;
}



const DB_TIMEZONE = process.env.DB_TIMEZONE || '-06:00';

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: DB_TIMEZONE,
    dateStrings: true,
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
let accesoPermisosTableReady = false;
async function ensureAccesoPermisosTable(connOrPool) {
    if (accesoPermisosTableReady) return;
    const runner = connOrPool || pool;
    try {
        if (runner && typeof runner.query === 'function') {
            await runner.query(`
                CREATE TABLE IF NOT EXISTS acceso_permisos (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    acceso_id INT NOT NULL,
                    permiso_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_acceso_permiso (acceso_id, permiso_id),
                    KEY idx_acceso_permisos_permiso (permiso_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            accesoPermisosTableReady = true;
        }
    } catch (err) {
        console.warn('Note: acceso_permisos table check/creation:', err.message);
    }
}

let usuarioPeriodosImssTableReady = false;
async function ensureUsuarioPeriodosImssTable(connOrPool) {
    if (usuarioPeriodosImssTableReady) return;
    const runner = connOrPool || pool;
    try {
        if (runner && typeof runner.query === 'function') {
            await runner.query(`
                CREATE TABLE IF NOT EXISTS usuario_periodos_imss (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    usuario_id BIGINT UNSIGNED NOT NULL,
                    patron VARCHAR(255) NULL,
                    fecha_desde DATE NOT NULL,
                    fecha_hasta DATE NOT NULL,
                    salario DECIMAL(12, 2) NOT NULL,
                    dias INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    CONSTRAINT fk_usuario_periodos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                    INDEX idx_usuario_fechas (usuario_id, fecha_hasta DESC, fecha_desde DESC)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);
            usuarioPeriodosImssTableReady = true;
        }
    } catch (err) {
        console.warn('Note: usuario_periodos_imss table check/creation:', err.message);
    }
}

let institucionRestriccionesTableReady = false;
async function ensureInstitucionRestriccionesTable(connOrPool) {
    if (institucionRestriccionesTableReady) return;
    const runner = connOrPool || pool;
    try {
        if (runner && typeof runner.query === 'function') {
            await runner.query(`
                CREATE TABLE IF NOT EXISTS institucion_restricciones (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    institucion_id INT UNSIGNED NOT NULL,
                    descripcion TEXT NOT NULL,
                    activo TINYINT(1) NOT NULL DEFAULT 1,
                    orden INT NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    CONSTRAINT fk_restricciones_institucion FOREIGN KEY (institucion_id) 
                        REFERENCES instituciones_financieras(id) ON DELETE CASCADE,
                    INDEX idx_restricciones_inst_activo (institucion_id, activo, orden)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);
            institucionRestriccionesTableReady = true;
        }
    } catch (err) {
        console.warn('Note: institucion_restricciones table check/creation:', err.message);
    }
}

pool.getConnection()
    .then(async (connection) => {
        console.log("Connected to MySQL database.");
        try {
            if (connection && typeof connection.query === 'function') {
                const safeTz = DB_TIMEZONE.replace(/[^0-9:+-]/g, '');
                connection.query(`SET time_zone = '${safeTz}'`, () => {});
            }
            await ensureAccesoPermisosTable(connection);
            await ensureUsuarioPeriodosImssTable(connection);
            await ensureInstitucionRestriccionesTable(connection);
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
    const roleQuery = `
        SELECT p.id, p.codigo, p.nombre
        FROM usuario_roles ur
        JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
        JOIN rol_permisos rp ON r.id = rp.rol_id
        JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
        WHERE ur.usuario_id = ? AND p.codigo = ?
    `;
    try {
        const [roleRows] = await connectionPool.execute(roleQuery, [userId, permCode]);
        if (roleRows && roleRows.length > 0) return true;
    } catch (e) {}

    const accesoQuery = `
        SELECT p.id, p.codigo, p.nombre
        FROM usuario_funcionalidades uf
        JOIN acceso_permisos ap ON uf.id = ap.acceso_id
        JOIN permisos p ON ap.permiso_id = p.id AND p.activo = TRUE
        JOIN funcionalidades f ON uf.funcionalidad_id = f.id AND f.activo = TRUE
        WHERE uf.usuario_id = ? AND p.codigo = ?
          AND uf.estado = 'activo'
          AND (
              uf.tipo_acceso = 'permanente'
              OR (uf.tipo_acceso = 'temporal' AND uf.fecha_inicio <= NOW() AND uf.fecha_fin > NOW())
          )
    `;
    try {
        const [accesoRows] = await connectionPool.execute(accesoQuery, [userId, permCode]);
        return accesoRows && accesoRows.length > 0;
    } catch (err) {
        return false;
    }
}

async function getUserPermissions(connectionPool, userId) {
    if (!userId) return [];
    const permissions = new Set();
    const roleQuery = `
        SELECT DISTINCT p.codigo
        FROM usuario_roles ur
        JOIN roles r ON ur.rol_id = r.id AND r.activo = TRUE
        JOIN rol_permisos rp ON r.id = rp.rol_id
        JOIN permisos p ON rp.permiso_id = p.id AND p.activo = TRUE
        WHERE ur.usuario_id = ?
    `;
    try {
        const [roleRows] = await connectionPool.execute(roleQuery, [userId]);
        for (const row of roleRows) {
            if (row.codigo) permissions.add(row.codigo);
        }
    } catch (e) {
        console.error('Error fetching role permissions in getUserPermissions:', e);
    }

    const accesoQuery = `
        SELECT DISTINCT p.codigo
        FROM usuario_funcionalidades uf
        JOIN acceso_permisos ap ON uf.id = ap.acceso_id
        JOIN permisos p ON ap.permiso_id = p.id AND p.activo = TRUE
        JOIN funcionalidades f ON uf.funcionalidad_id = f.id AND f.activo = TRUE
        WHERE uf.usuario_id = ?
          AND uf.estado = 'activo'
          AND (
              uf.tipo_acceso = 'permanente'
              OR (uf.tipo_acceso = 'temporal' AND uf.fecha_inicio <= NOW() AND uf.fecha_fin > NOW())
          )
    `;
    try {
        const [accesoRows] = await connectionPool.execute(accesoQuery, [userId]);
        for (const row of accesoRows) {
            if (row.codigo) permissions.add(row.codigo);
        }
    } catch (err) {
        // Fallback if table not ready or temporary error
    }

    return Array.from(permissions);
}

const requireFunctionality = (funcCode) => {
    const canonicalCode = normalizeFunctionalityCode(funcCode);
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                const token = (req.cookies && req.cookies.auth_token) || (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
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
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado' || error.message === 'Usuario inactivo') {
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
                const token = (req.cookies && req.cookies.auth_token) || (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
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
                    error: 'Acceso no autorizado o vencido para esta funcionalidad.',
                    code: 'RBAC_PERMISSION_DENIED',
                    permiso: permCode
                });
            }

            next();
        } catch (error) {
            console.error(`Error in requirePermission (${permCode}):`, error);
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado' || error.message === 'Usuario inactivo') {
                return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
            }
            return res.status(500).json({ error: 'Error interno del servidor al verificar permiso.' });
        }
    };
};

const requireAnyPermission = (permCodes) => {
    const codes = Array.isArray(permCodes) ? permCodes : [permCodes];
    return async (req, res, next) => {
        try {
            if (!req.userId) {
                const token = (req.cookies && req.cookies.auth_token) || (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
                if (!token) {
                    return res.status(401).json({ error: 'No autorizado. Token no proporcionado.', code: 'AUTH_REQUIRED' });
                }
                const decoded = await verifyToken(token, pool);
                req.userId = decoded.id;
                req.user = decoded;
            }

            let hasAccess = false;
            for (const code of codes) {
                if (await checkUserPermission(pool, req.userId, code)) {
                    hasAccess = true;
                    break;
                }
            }

            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Acceso no autorizado o vencido para esta funcionalidad.',
                    code: 'RBAC_PERMISSION_DENIED'
                });
            }

            next();
        } catch (error) {
            console.error('Error in requireAnyPermission:', error);
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado' || error.message === 'Usuario inactivo') {
                return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
            }
            return res.status(500).json({ error: 'Error interno del servidor al verificar permiso.' });
        }
    };
};

const authMiddleware = async (req, res, next) => {
    try {
        if (!req.userId) {
            const token = (req.cookies && req.cookies.auth_token) || (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
            if (!token) {
                return res.status(401).json({ error: 'No autorizado. Token no proporcionado.', code: 'AUTH_REQUIRED' });
            }
            const decoded = await verifyToken(token, pool);
            req.userId = decoded.id;
            req.user = decoded;
        }
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado' || error.message === 'Usuario inactivo') {
            return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
        }
        return res.status(500).json({ error: 'Error interno del servidor al verificar autenticación.' });
    }
};

async function assignDefaultUserRole(connOrPool, userId) {
    if (!userId) {
        throw new Error('ID de usuario inválido para asignación de rol.');
    }
    const runner = connOrPool || pool;
    const [roleRows] = await runner.execute(
        "SELECT id, nombre, activo FROM roles WHERE LOWER(nombre) = 'usuario' LIMIT 1"
    );

    if (!roleRows || roleRows.length === 0) {
        const errMsg = 'Error de configuración RBAC: El rol "usuario" no existe en el sistema.';
        console.error(errMsg);
        const err = new Error(errMsg);
        err.statusCode = 500;
        err.code = 'ROLE_USUARIO_NOT_FOUND';
        throw err;
    }

    const role = roleRows[0];
    const roleId = role.id;

    if (!role.activo) {
        const errMsg = 'Error de configuración RBAC: El rol "usuario" se encuentra inactivo.';
        console.error(errMsg);
        const err = new Error(errMsg);
        err.statusCode = 500;
        err.code = 'ROLE_USUARIO_INACTIVE';
        throw err;
    }

    const [existing] = await runner.execute(
        'SELECT 1 FROM usuario_roles WHERE usuario_id = ? AND rol_id = ? LIMIT 1',
        [userId, roleId]
    );

    if (!existing || existing.length === 0) {
        await runner.execute(
            'INSERT IGNORE INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)',
            [userId, roleId]
        );
    }

    return roleId;
}

async function assignRoleByName(connOrPool, userId, roleName) {
    if (roleName && roleName.toLowerCase() === 'usuario') {
        const res = await assignDefaultUserRole(connOrPool, userId);
        return res.roleId;
    }
    if (!userId) {
        throw new Error('ID de usuario inválido para asignación de rol.');
    }
    const runner = connOrPool || pool;
    const [roleRows] = await runner.execute(
        "SELECT id, nombre, activo FROM roles WHERE LOWER(nombre) = LOWER(?) LIMIT 1",
        [roleName]
    );

    if (!roleRows || roleRows.length === 0) {
        const errMsg = `Error de configuración RBAC: El rol "${roleName}" no existe en el sistema.`;
        console.error(errMsg);
        const err = new Error(errMsg);
        err.statusCode = 500;
        err.code = `ROLE_${roleName.toUpperCase()}_NOT_FOUND`;
        throw err;
    }

    const role = roleRows[0];
    const roleId = role.id;

    const [existing] = await runner.execute(
        'SELECT 1 FROM usuario_roles WHERE usuario_id = ? AND rol_id = ? LIMIT 1',
        [userId, roleId]
    );

    if (!existing || existing.length === 0) {
        await runner.execute(
            'INSERT IGNORE INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)',
            [userId, roleId]
        );
    }

    return roleId;
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
    model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
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


function decodePdfString(str) {
    return str
        .replace(/\\([0-7]{1,3})/g, (m, oct) => String.fromCharCode(parseInt(oct, 8)))
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\b/g, '\b')
        .replace(/\\f/g, '\f')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
}

function extractTextFromPdfBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) return '';
    const str = buffer.toString('binary');
    let fullText = '';

    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRegex.exec(str)) !== null) {
        let streamBytes = Buffer.from(match[1], 'binary');
        try {
            streamBytes = zlib.inflateSync(streamBytes);
        } catch (e) {}

        const streamContent = streamBytes.toString('latin1');
        const tokenRegex = /\((?:[^()\\]|\\.)*\)\s*Tj|\[(?:[^\[\]\\]|\\.)*\]\s*TJ|T\*|(?:\-?\d+(?:\.\d+)?\s+){2}Td|(?:\-?\d+(?:\.\d+)?\s+){6}Tm/g;
        let token;
        while ((token = tokenRegex.exec(streamContent)) !== null) {
            const t = token[0];
            if (t.endsWith('Tj')) {
                const s = t.slice(1, t.lastIndexOf(')'));
                fullText += decodePdfString(s) + ' ';
            } else if (t.endsWith('TJ')) {
                const arrContent = t.slice(1, t.lastIndexOf(']'));
                const strRegex = /\(((?:[^()\\]|\\.)*)\)/g;
                let sm;
                while ((sm = strRegex.exec(arrContent)) !== null) {
                    fullText += decodePdfString(sm[1]);
                }
                fullText += ' ';
            } else if (t === 'T*' || t.endsWith('Td') || t.endsWith('Tm')) {
                fullText += '\n';
            }
        }
    }

    if (!fullText.trim()) {
        const rawStrings = [];
        const simpleParenRegex = /\(((?:[^()\\]|\\.)*)\)/g;
        let sm;
        while ((sm = simpleParenRegex.exec(str)) !== null) {
            const decoded = decodePdfString(sm[1]);
            if (decoded.trim().length > 1) rawStrings.push(decoded.trim());
        }
        if (rawStrings.length > 0) fullText = rawStrings.join(' ');
    }

    return fullText.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

function extractAseguradoInfo(extractedText) {
    if (!extractedText || typeof extractedText !== 'string') {
        return { nombreAsegurado: null, totalSemanasCotizadas: null };
    }

    let nombreAsegurado = null;
    let totalSemanasCotizadas = null;

    // 1. Extraer nombre del asegurado directamente de la primera página del PDF
    // Formato oficial IMSS: NSS:\n [NOMBRE] \n [NSS_DIGITOS]
    const nssNombreMatch = extractedText.match(/NSS\s*:\s*\r?\n\s*([^\r\n]{3,60})\s*\r?\n\s*\d{10,11}/i);
    if (nssNombreMatch && nssNombreMatch[1]) {
        const cleanName = nssNombreMatch[1].trim().replace(/\s+/g, ' ');
        if (cleanName.length >= 3 && !/^(total|semanas|constancia|imss|curp|instituto)/i.test(cleanName)) {
            nombreAsegurado = cleanName;
        }
    }
    // Formato alternativo con etiqueta explícita 'Nombre:' o 'Nombre del asegurado:'
    if (!nombreAsegurado) {
        const labelNombreMatch = extractedText.match(/(?:nombre(?:\s+del\s+asegurado)?)\s*:\s*([^\r\n:]{3,60})/i);
        if (labelNombreMatch && labelNombreMatch[1]) {
            const cleanName = labelNombreMatch[1].trim().replace(/\s+/g, ' ');
            if (cleanName.length >= 3 && !/^(total|semanas|constancia|imss|curp|instituto)/i.test(cleanName)) {
                nombreAsegurado = cleanName;
            }
        }
    }

    // 2. Extraer total de semanas cotizadas de la primera página / resumen
    // Formato explícito: 'Total de semanas cotizadas: 1573' o 'Total de semanas cotizadas:1573'
    const directTotalMatch = extractedText.match(/total\s+de\s+semanas\s+cotizadas\s*:\s*(\d{1,5})/i);
    if (directTotalMatch && directTotalMatch[1]) {
        totalSemanasCotizadas = parseInt(directTotalMatch[1], 10);
    }
    // Cadena digital oficial del IMSS: |Número total de semanas cotizadas:1615||
    if (!totalSemanasCotizadas) {
        const cadenaMatch = extractedText.match(/n[uú]mero\s+total\s+de\s+semanas\s+cotizadas\s*:\s*(\d{1,5})/i);
        if (cadenaMatch && cadenaMatch[1]) {
            totalSemanasCotizadas = parseInt(cadenaMatch[1], 10);
        }
    }
    // Encabezado / Resumen: bloque con número antes de NSS:
    if (!totalSemanasCotizadas) {
        const nssMatch = extractedText.match(/(\d{1,5})\s*\r?\n\s*NSS\s*:/i);
        if (nssMatch && nssMatch[1]) {
            totalSemanasCotizadas = parseInt(nssMatch[1], 10);
        }
    }
    // Bloque descriptivo 'Total de semanas cotizadas' seguido del número
    if (!totalSemanasCotizadas) {
        const totalGenMatch = extractedText.match(/total\s+de\s+semanas\s+cotizadas[^\d]{0,80}(\d{1,5})/i);
        if (totalGenMatch && totalGenMatch[1]) {
            totalSemanasCotizadas = parseInt(totalGenMatch[1], 10);
        }
    }
    if (!totalSemanasCotizadas) {
        const imssMatch = extractedText.match(/semanas\s+cotizadas\s+imss[^\d]{0,80}(\d{1,5})/i);
        if (imssMatch && imssMatch[1]) {
            totalSemanasCotizadas = parseInt(imssMatch[1], 10);
        }
    }

    // 3. Extraer CURP oficial del asegurado
    let curp = null;
    const curpMatch = extractedText.match(/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i);
    if (curpMatch) {
        curp = curpMatch[0].toUpperCase();
    }

    return { nombreAsegurado, totalSemanasCotizadas, curp };
}

function extractTotalSemanasFromIMSSDocument(extractedText) {
    return extractAseguradoInfo(extractedText).totalSemanasCotizadas;
}

async function parseIMSSWithGemini(pdfBuffer) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
    }

    const prompt = `Eres un actuario y analista experto en pensiones del IMSS bajo el régimen Ley 73.
Se te proporciona el documento oficial en PDF "Constancia de Semanas Cotizadas en el IMSS" / "Reporte de Semanas Cotizadas del Asegurado".

Tu objetivo es extraer de manera estructurada y fiel los periodos o tramos de cotización salarial que aparecen en la tabla de historia laboral del documento adjunto, en orden cronológico inverso (desde el movimiento más reciente hacia atrás en el tiempo), asegurando incluir los periodos suficientes para que el backend pueda cubrir las últimas 250 semanas cotizadas (al menos 1,750 días de cotización).

Reglas de extracción:
1. Revisa minuciosamente la tabla de historial laboral del documento en orden cronológico inverso (del movimiento más reciente hacia atrás).
2. Para la fecha de corte más reciente, toma la fecha de fin o baja del último movimiento registrado en el documento (o la fecha de emisión del reporte si está activo). No uses la fecha de hoy.
3. Para cada periodo o tramo salarial continuo registrado en el historial:
   - "patron": Nombre de la empresa, razón social o modalidad registrada (ej. "Continuación Voluntaria en el Régimen Obligatorio" o nombre del patrón).
   - "fechaInicio": Fecha de inicio o alta en que comenzó a pagarse ese salario específico (formato YYYY-MM-DD). REGLA CRÍTICA: En el IMSS, un mismo salario suele repetirse en múltiples renglones bimestrales de "MODIFICACION DE SALARIO". La fechaInicio DEBE ser la fecha del movimiento MÁS ANTIGUO en que comenzó a pagarse ese salario continuo, NO un movimiento bimestral intermedio.
   - "fechaFin": Fecha en que concluyó la vigencia de ese salario (el día anterior al cambio al siguiente salario, o la fecha de baja del movimiento si concluyó la relación laboral).
   - "dias": Días naturales cotizados en ese tramo.
   - "salarioDiario": Salario Base de Cotización (SBC) diario registrado en pesos (numérico decimal sin comas ni símbolos).
4. Extrae ÚNICAMENTE los datos reales presentes en el documento adjunto. No inventes periodos, empresas, fechas ni salarios que no aparezcan en el documento.
5. NO calcules ningún promedio ni suma total. Tu labor es únicamente la extracción estructurada y fiel de los periodos.

Responde ÚNICAMENTE un objeto JSON válido con la siguiente estructura:
{
  "tipoDocumento": "Constancia de Semanas Cotizadas",
  "periodos": [
    {
      "patron": "NOMBRE DEL PATRON O MODALIDAD",
      "fechaInicio": "YYYY-MM-DD",
      "fechaFin": "YYYY-MM-DD",
      "dias": 100,
      "salarioDiario": 500.00
    }
  ]
}
`;

    const cleanBase64 = pdfBuffer.toString('base64');
    // Priorizar modelos estables y probados; evitar gemini-3.8-flash que reporta 503 continuo
    const candidateModels = [
        process.env.GEMINI_MODEL,
        'gemini-3-flash-preview',
        'gemini-3.6-flash',
        'gemini-3.1-flash-lite',
        'gemini-3.8-flash'
    ].filter(Boolean);

    let lastError = null;
    const TIMEOUT_POR_INTENTO_MS = 150000; // 150 segundos (margen razonable dentro de 120-180s)

    for (const modelName of candidateModels) {
        try {
            const timeoutPromise = new Promise((_, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error(`TIMEOUT_EXCEEDED: Se excedió el límite de ${TIMEOUT_POR_INTENTO_MS / 1000}s en modelo ${modelName}`));
                }, TIMEOUT_POR_INTENTO_MS);
                if (timer.unref) timer.unref();
            });

            const generatePromise = ai.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'application/pdf',
                                    data: cleanBase64
                                }
                            },
                            { text: prompt }
                        ]
                    }
                ],
                config: {
                    temperature: 0.1,
                    responseMimeType: 'application/json'
                }
            });

            const response = await Promise.race([generatePromise, timeoutPromise]);
            const rawText = response.text || (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts[0].text);
            if (!rawText) continue;

            const fenceRegex = new RegExp('^' + String.fromCharCode(96, 96, 96) + '(?:json)?', 'i');
            const endFenceRegex = new RegExp(String.fromCharCode(96, 96, 96) + '$');
            const cleanedJson = rawText.trim().replace(fenceRegex, '').replace(endFenceRegex, '').trim();
            const parsed = JSON.parse(cleanedJson);
            if (parsed && Array.isArray(parsed.periodos) && parsed.periodos.length > 0) {
                return parsed;
            }
        } catch (err) {
            lastError = err;
            console.warn(`Aviso: Modelo ${modelName} no completó el análisis (${err.message}). Continuando con siguiente candidato...`);
            // Ante 503 (saturación) o timeout, no bloquear la ejecución repitiendo sobre el mismo modelo; continuar inmediatamente con el siguiente
            continue;
        }
    }

    if (lastError) {
        throw lastError;
    }
    return null;
}

app.post('/api/pension/calcular-salario-pdf', requireAnyPermission(['calculadora.intermedia', 'calculadora.avanzada']), async (req, res) => {
    try {
        const { pdfBase64, fileName } = req.body || {};
        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
            return res.status(400).json({
                error: 'INVALID_REQUEST',
                message: 'Se requiere un archivo PDF en formato base64.'
            });
        }

        const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
        const pdfBuffer = Buffer.from(cleanBase64, 'base64');

        if (pdfBuffer.length < 5 || pdfBuffer.toString('latin1', 0, 5) !== '%PDF-') {
            return res.status(400).json({
                error: 'INVALID_PDF',
                message: 'El archivo proporcionado no es un documento PDF válido.'
            });
        }

        // 1. Extraer texto base del buffer para análisis determinístico
        let extractedText = '';
        try {
            extractedText = extractTextFromPdfBuffer(pdfBuffer);
        } catch (e) {}

        let structuredData = null;

        // 2. Extracción determinística directa desde el documento digital oficial (Fuente de verdad primaria)
        // Procesa los movimientos directamente del PDF con exactitud absoluta, sin pérdida de fechas intermedias
        // ni atención probabilística de modelos de lenguaje.
        if (extractedText && extractedText.length > 50) {
            try {
                const deterministicPeriods = extractPeriodsFromIMSSDocumentText(extractedText);
                if (deterministicPeriods && deterministicPeriods.length > 0) {
                    structuredData = { tipoDocumento: 'Constancia de Semanas Cotizadas', periodos: deterministicPeriods };
                }
            } catch (detErr) {
                console.error('Error en extracción determinística de PDF:', detErr.message);
            }
        }

        // 3. Fallback multimodal (Gemini API) si el documento no tiene capa de texto estructurada (e.g. escaneo o imagen)
        if ((!structuredData || !Array.isArray(structuredData.periodos) || structuredData.periodos.length === 0) && process.env.GEMINI_API_KEY) {
            try {
                structuredData = await parseIMSSWithGemini(pdfBuffer);
            } catch (aiErr) {
                console.error('Advertencia al analizar documento con Gemini API:', aiErr.message);
            }
        }

        if (!structuredData || !Array.isArray(structuredData.periodos) || structuredData.periodos.length === 0) {
            return res.status(422).json({
                error: 'CANNOT_INTERPRET_PDF',
                message: 'No fue posible interpretar los periodos de cotización en el documento. Por favor verifica que sea un documento oficial del IMSS o ingresa el salario manualmente.'
            });
        }

        // 4. Determinación directa de metadatos del asegurado (semanas, nombre y CURP) desde el PDF
        const infoAsegurado = extractAseguradoInfo(extractedText);
        const totalSemanasExtraidas = infoAsegurado.totalSemanasCotizadas;
        const nombreAsegurado = infoAsegurado.nombreAsegurado;
        const curpAsegurado = infoAsegurado.curp;
        const fechaNacimientoAsegurado = curpAsegurado ? extractBirthDateFromCurp(curpAsegurado) : null;

        // 5. Validación matemática estricta y cálculo ponderado en el backend por días (1,750 días)
        const validation = validateAndCalculatePensionPeriods(structuredData);
        if (!validation.success) {
            return res.status(422).json({
                error: validation.error,
                message: validation.message,
                sumaDias: validation.sumaDias
            });
        }

        // Evaluar edad pensionaria actual si se cuenta con CURP y fecha de corte
        let edadPensionariaActual = null;
        const periodosFuente = (validation.periodosReconstruidos && validation.periodosReconstruidos.length > 0)
            ? validation.periodosReconstruidos
            : validation.periodos;

        if (fechaNacimientoAsegurado && periodosFuente && periodosFuente.length > 0) {
            const ultimaFechaCotizacion = periodosFuente[0].fechaHasta || periodosFuente[0].fechaFin;
            if (ultimaFechaCotizacion) {
                edadPensionariaActual = calcularEdadPensionaria(fechaNacimientoAsegurado, ultimaFechaCotizacion);
            }
        }

        // 6. Persistencia transaccional del historial estructurado en usuario_periodos_imss
        // Cada nueva carga del archivo reemplaza completamente el historial anterior del usuario
        let historialGuardado = false;
        let periodosGuardadosCount = 0;
        if (req.userId && periodosFuente && periodosFuente.length > 0) {
            let conn = null;
            try {
                conn = await pool.getConnection();
                await conn.beginTransaction();
                await conn.query("DELETE FROM usuario_periodos_imss WHERE usuario_id = ?", [req.userId]);

                for (const p of periodosFuente) {
                    const fDesde = p.fechaDesde || p.fechaInicio || p.fecha_desde || p.fecha_inicio;
                    const fHasta = p.fechaHasta || p.fechaFin || p.fecha_hasta || p.fecha_fin;
                    const sal = parseFloat(p.salario || p.salarioDiario || p.salario_diario);
                    const dias = parseInt(p.dias || p.diasUtilizados, 10) || 1;
                    const patron = String(p.patron || p.empresa || "PATRÓN REGISTRADO").substring(0, 255);

                    if (fDesde && fHasta && !isNaN(sal) && sal > 0) {
                        await conn.query(
                            "INSERT INTO usuario_periodos_imss (usuario_id, patron, fecha_desde, fecha_hasta, salario, dias) VALUES (?, ?, ?, ?, ?, ?)",
                            [req.userId, patron, fDesde, fHasta, sal, dias]
                        );
                        periodosGuardadosCount++;
                    }
                }

                await conn.commit();
                historialGuardado = true;
            } catch (dbErr) {
                if (conn) {
                    try { await conn.rollback(); } catch (rbErr) {}
                }
                console.error("Error al persistir historial IMSS del usuario:", dbErr.message);
            } finally {
                if (conn) conn.release();
            }
        }

        let esReporteResumen = false;
        try {
            const rawTextSample = extractedText ? extractedText.toLowerCase() : extractTextFromPdfBuffer(pdfBuffer).toLowerCase();
            const isImssDoc = rawTextSample.includes('semanas cotizadas') || rawTextSample.includes('seguro social');
            const hasDetailIndicators = rawTextSample.includes('historial de registros afiliatorios') ||
                                        rawTextSample.includes('tipo de movimiento') ||
                                        rawTextSample.includes('modificacion de salario');
            if (isImssDoc && !hasDetailIndicators) {
                esReporteResumen = true;
            }
        } catch (sampleErr) {}

        const formatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
        res.status(200).json({
            success: true,
            salarioDiarioPromedio: validation.salarioDiarioPromedio,
            salarioDiarioPromedioFormateado: formatter.format(validation.salarioDiarioPromedio),
            diasTotales: validation.diasTotales,
            semanasTotales: validation.semanasTotales,
            semanasAnalizadas: validation.semanasTotales,
            semanasConsideradas: validation.semanasTotales,
            totalSemanasCotizadas: totalSemanasExtraidas,
            totalSemanasDocumento: totalSemanasExtraidas || validation.semanasTotales,
            nombreAsegurado: nombreAsegurado || null,
            curp: curpAsegurado || null,
            fechaNacimiento: fechaNacimientoAsegurado || null,
            edadPensionaria: edadPensionariaActual,
            periodos: validation.periodos,
            periodosUtilizados: validation.periodos,
            periodosReconstruidos: periodosFuente,
            historialGuardado,
            periodosGuardados: periodosGuardadosCount,
            esReporteResumen,
            message: 'Se identificaron las últimas 250 semanas cotizadas con éxito mediante Gemini API.'
        });

    } catch (error) {
        console.error('Error in /api/pension/calcular-salario-pdf:', error.message);
        res.status(500).json({
            error: 'SERVER_ERROR',
            message: 'Ocurrió un error al procesar el documento. Por favor intenta de nuevo o ingresa el salario manualmente.'
        });
    }
});

app.get('/api/pension/historial-imss', requireAnyPermission(['calculadora.intermedia', 'calculadora.avanzada']), async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, patron, DATE_FORMAT(fecha_desde, '%Y-%m-%d') as fechaDesde, DATE_FORMAT(fecha_hasta, '%Y-%m-%d') as fechaHasta, salario, dias FROM usuario_periodos_imss WHERE usuario_id = ? ORDER BY fecha_hasta DESC, fecha_desde DESC",
            [req.userId]
        );
        const formattedRows = rows.map(r => ({
            ...r,
            salario: parseFloat(r.salario)
        }));
        const ultimoPeriodo = determinarUltimoPeriodoCronologico(formattedRows);
        res.status(200).json({
            success: true,
            count: formattedRows.length,
            tieneHistorial: formattedRows.length > 0,
            ultimoPeriodo: ultimoPeriodo,
            ultimoSalario: ultimoPeriodo ? ultimoPeriodo.salario : null,
            periodos: formattedRows
        });
    } catch (err) {
        console.error('Error in /api/pension/historial-imss:', err);
        res.status(500).json({ error: 'Error al consultar el historial IMSS del usuario.' });
    }
});

app.get('/api/pension/ultimo-salario-vigente', requireAnyPermission(['calculadora.intermedia', 'calculadora.avanzada']), async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT id, patron, DATE_FORMAT(fecha_desde, '%Y-%m-%d') as fechaDesde, DATE_FORMAT(fecha_hasta, '%Y-%m-%d') as fechaHasta, salario, dias FROM usuario_periodos_imss WHERE usuario_id = ? ORDER BY fecha_hasta DESC, fecha_desde DESC",
            [req.userId]
        );
        const formattedRows = rows.map(r => ({
            ...r,
            salario: parseFloat(r.salario)
        }));
        const ultimoPeriodo = determinarUltimoPeriodoCronologico(formattedRows);
        res.status(200).json({
            success: true,
            tieneHistorial: Boolean(ultimoPeriodo),
            ultimoPeriodo: ultimoPeriodo,
            ultimoSalario: ultimoPeriodo ? ultimoPeriodo.salario : null
        });
    } catch (err) {
        console.error('Error in /api/pension/ultimo-salario-vigente:', err);
        res.status(500).json({ error: 'Error al consultar el último salario vigente del usuario.' });
    }
});

app.get('/api/pension/salario-minimo-vigente', requireAnyPermission(['calculadora.intermedia', 'calculadora.avanzada']), async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.status(200).json({
            success: true,
            salarioMinimo: SALARIO_MINIMO_GENERAL_VIGENTE,
            anio: 2026,
            historico: SALARIOS_MINIMOS_GENERALES
        });
    } catch (err) {
        console.error('Error in /api/pension/salario-minimo-vigente:', err);
        res.status(500).json({ error: 'Error al consultar el salario mínimo vigente.' });
    }
});

app.post('/api/pension/calcular', requireAnyPermission(['calculadora.basica', 'calculadora.intermedia', 'calculadora.avanzada']), async (req, res) => {
    try {
        const {
            salarioMinimo,
            salarioDiarioPromedio,
            semanasCotizadas,
            edad,
            tieneEsposa,
            numeroHijos,
            tienePadresDependientes,
            estaEnSoledad,
            tieneIncapacidad
        } = req.body || {};

        const salMin = parseFloat(salarioMinimo);
        const salProm = parseFloat(salarioDiarioPromedio);
        const sem = parseInt(semanasCotizadas, 10);
        const ed = parseInt(edad, 10);

        if (isNaN(salMin) || isNaN(salProm) || isNaN(sem) || isNaN(ed)) {
            return res.status(400).json({
                error: 'INVALID_DATA',
                message: 'Por favor ingresa todos los campos numéricos de datos generales correctamente.'
            });
        }

        const data = {
            salarioMinimo: salMin,
            salarioDiarioPromedio: salProm,
            semanasCotizadas: sem,
            edad: ed,
            tieneEsposa: Boolean(tieneEsposa),
            numeroHijos: parseInt(numeroHijos, 10) || 0,
            tienePadresDependientes: Boolean(tienePadresDependientes),
            estaEnSoledad: Boolean(estaEnSoledad),
            tieneIncapacidad: Boolean(tieneIncapacidad)
        };

        const result = calculateIMSSLey73Pension(data);
        res.status(200).json({
            success: true,
            resultado: result
        });
    } catch (err) {
        console.error('Error in /api/pension/calcular:', err);
        res.status(500).json({ error: 'Error al calcular la pensión.' });
    }
});

app.post('/api/pension/proyectar', requireAnyPermission(['calculadora.avanzada']), async (req, res) => {
    try {
        let periodosHistoricos = null;
        let fechaNacimiento = req.body.fechaNacimiento || null;

        if (req.userId) {
            try {
                const [rows] = await pool.query(
                    "SELECT id, patron, DATE_FORMAT(fecha_desde, '%Y-%m-%d') as fechaDesde, DATE_FORMAT(fecha_hasta, '%Y-%m-%d') as fechaHasta, salario, dias FROM usuario_periodos_imss WHERE usuario_id = ? ORDER BY fecha_hasta DESC, fecha_desde DESC",
                    [req.userId]
                );
                if (rows && rows.length > 0) {
                    periodosHistoricos = rows;
                }
            } catch (queryErr) {
                console.warn('Advertencia al consultar historial para proyección:', queryErr.message);
            }

            if (!fechaNacimiento) {
                try {
                    const [userRows] = await pool.query(
                        "SELECT fecha_nacimiento FROM usuarios WHERE id = ?",
                        [req.userId]
                    );
                    if (userRows && userRows[0] && userRows[0].fecha_nacimiento) {
                        fechaNacimiento = userRows[0].fecha_nacimiento;
                    }
                } catch (uErr) {}
            }
        }

        const projectionResult = calculatePensionProjection({
            ...req.body,
            fechaNacimiento,
            periodosHistoricos
        });

        if (!projectionResult.success) {
            return res.status(400).json({
                error: projectionResult.error,
                message: projectionResult.message
            });
        }

        if (periodosHistoricos && periodosHistoricos.length > 0) {
            const ultimoPeriodo = determinarUltimoPeriodoCronologico(periodosHistoricos);
            if (ultimoPeriodo) {
                projectionResult.ultimoPeriodo = ultimoPeriodo;
                projectionResult.ultimoSalario = ultimoPeriodo.salario;
            }
        }

        res.status(200).json(projectionResult);
    } catch (err) {
        console.error('Error in /api/pension/proyectar:', err);
        res.status(500).json({ error: 'Error al procesar la proyección de pensión.' });
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

        const candidateChatModels = [
            process.env.GEMINI_MODEL,
            'gemini-3-flash-preview',
            'gemini-3.1-flash-lite',
            'gemini-3.6-flash'
        ].filter(Boolean);

        let aiResponseStream = null;
        let selectedModel = null;
        let lastStreamError = null;

        for (const modelCandidate of candidateChatModels) {
            try {
                aiResponseStream = await ai.models.generateContentStream({
                    model: modelCandidate,
                    contents: [{ role: 'user', parts: [{ text: message }] }],
                    config: {
                        systemInstruction: chatSysInstr,
                        tools: idealandiaTools
                    }
                });
                selectedModel = modelCandidate;
                break;
            } catch (err) {
                console.warn(`[API/CHAT] Reintentando con siguiente modelo tras error en ${modelCandidate}:`, err.message || err);
                lastStreamError = err;
            }
        }

        if (!aiResponseStream) {
            throw lastStreamError || new Error('No se pudo conectar con ningún modelo de Gemini disponible');
        }

        // Collect function calls if they occur first
        let functionCall = null;
        let functionName = null;
        let modelResponseParts = [];

        for await (const chunk of aiResponseStream) {
            if (chunk.candidates && chunk.candidates[0] && chunk.candidates[0].content && chunk.candidates[0].content.parts) {
                modelResponseParts.push(...chunk.candidates[0].content.parts);
            }
            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                functionCall = chunk.functionCalls[0];
                functionName = functionCall.name;
                break; // Model wants to call a tool, stop streaming this response
            } else if (chunk.text) {
                res.write(chunk.text);
            }
        }

        if (functionCall && functionName === 'consultar_documentacion') {
            const query = (functionCall.args && functionCall.args.tema) || message;
            const docResult = await searchKnowledge(pool, userId, query);

            // Second turn: send tool result back with graceful fallback against thought_signature errors
            try {
                const partsForModel = (modelResponseParts.length > 0)
                    ? modelResponseParts
                    : [{ functionCall: functionCall }];

                const secondTurnStream = await ai.models.generateContentStream({
                    model: selectedModel || 'gemini-3-flash-preview',
                    contents: [
                        { role: 'user', parts: [{ text: message }] },
                        { role: 'model', parts: partsForModel },
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
            } catch (toolTurnErr) {
                console.warn('[API/CHAT] Conmutando a síntesis directa de conocimiento tras fallo en turno de herramienta (thought_signature):', toolTurnErr.message || toolTurnErr);
                try {
                    const directResponse = await ai.models.generateContent({
                        model: selectedModel || 'gemini-3-flash-preview',
                        contents: [{
                            role: 'user',
                            parts: [{
                                text: `Pregunta del usuario: ${message}\n\nConocimiento interno disponible:\n${JSON.stringify(docResult)}\n\nPor favor responde amablemente a la pregunta del usuario como Idealita integrando este conocimiento.`
                            }]
                        }],
                        config: { systemInstruction: chatSysInstr }
                    });
                    const fallbackText = directResponse.text ? (typeof directResponse.text === 'function' ? directResponse.text() : directResponse.text) : '';
                    if (fallbackText) {
                        res.write(fallbackText);
                    }
                } catch (fallbackErr) {
                    console.error('[API/CHAT] Error en fallback de conocimiento:', fallbackErr);
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
    let connection = null;
    try {
        const {
            usuario,
            password,
            'password-rep': passwordRep,
            nombre,
            correo,
            telefono,
            codigo_pais,
            tipo_registro,
            servicio_id,
            servicio_otro,
            descripcion_servicio
        } = req.body;

        const tipoRegistro = (tipo_registro || 'usuario').toLowerCase().trim();
        if (tipoRegistro !== 'usuario' && tipoRegistro !== 'asociado') {
            return res.status(400).json({ error: 'Tipo de registro inválido.' });
        }

        // 1. Validar Usuario (mínimo 2 caracteres)
        if (!usuario || typeof usuario !== 'string' || usuario.trim().length < 2) {
            return res.status(400).json({ error: 'El usuario debe contener al menos 2 caracteres.' });
        }
        const cleanUsuario = usuario.trim();

        // 2. Validar Nombre y Apellidos (obligatorio)
        if (!nombre || typeof nombre !== 'string' || nombre.trim().length === 0) {
            return res.status(400).json({ error: 'El nombre y apellidos son obligatorios.' });
        }
        const cleanNombre = nombre.trim();

        // 3. Validar Correo Electrónico (formato real)
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!correo || typeof correo !== 'string' || !emailRegex.test(correo.trim())) {
            return res.status(400).json({ error: 'El formato del correo electrónico es inválido.' });
        }
        const cleanCorreo = correo.trim().toLowerCase();

        // 4. Validar Contraseña (mínimo 8 caracteres, 1 número, 1 mayúscula, 1 minúscula, 1 carácter especial)
        if (!password || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
        }
        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({ error: 'La contraseña debe contener al menos una letra mayúscula.' });
        }
        if (!/[a-z]/.test(password)) {
            return res.status(400).json({ error: 'La contraseña debe contener al menos una letra minúscula.' });
        }
        if (!/[0-9]/.test(password)) {
            return res.status(400).json({ error: 'La contraseña debe contener al menos un número.' });
        }
        if (!/[^A-Za-z0-9\s]/.test(password)) {
            return res.status(400).json({ error: 'La contraseña debe contener al menos un carácter especial (! @ # $ % & * ...).' });
        }
        if (password !== passwordRep) {
            return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
        }

        // 5. Validar Teléfono según país internacional
        if (!telefono || typeof telefono !== 'string' || telefono.trim().length === 0) {
            return res.status(400).json({ error: 'El teléfono es obligatorio.' });
        }
        const country = (codigo_pais || 'MX').toUpperCase();
        const rawTel = telefono.trim();
        let validPhone = false;
        let formattedTelefono = null;

        try {
            if (rawTel.startsWith('+')) {
                validPhone = isValidPhoneNumber(rawTel);
                if (validPhone) {
                    formattedTelefono = parsePhoneNumber(rawTel).number;
                }
            } else {
                validPhone = isValidPhoneNumber(rawTel, country);
                if (validPhone) {
                    formattedTelefono = parsePhoneNumber(rawTel, country).number;
                }
            }
        } catch (_) {
            validPhone = false;
        }

        if (!validPhone) {
            return res.status(400).json({ error: 'El número de teléfono no es válido para el país seleccionado.' });
        }

        // Validaciones específicas para Asociado
        let parsedServicioId = null;
        let cleanServicioOtro = null;
        let cleanDescripcion = null;

        if (tipoRegistro === 'asociado') {
            parsedServicioId = parseInt(servicio_id, 10);
            if (!parsedServicioId || isNaN(parsedServicioId)) {
                return res.status(400).json({ error: 'Debes seleccionar un servicio válido.' });
            }

            const [servicioRows] = await pool.execute(
                'SELECT id, nombre, activo FROM servicios WHERE id = ?',
                [parsedServicioId]
            );

            if (servicioRows.length === 0 || !servicioRows[0].activo) {
                return res.status(400).json({ error: 'El servicio seleccionado no existe o no está activo.' });
            }

            if (parsedServicioId === 999) {
                if (!servicio_otro || typeof servicio_otro !== 'string' || servicio_otro.trim().length === 0) {
                    return res.status(400).json({ error: 'Debes especificar el nombre de tu servicio cuando seleccionas "Otros".' });
                }
                cleanServicioOtro = servicio_otro.trim();
                if (cleanServicioOtro.length < 3 || cleanServicioOtro.length > 150) {
                    return res.status(400).json({ error: 'El nombre del servicio personalizado debe contener entre 3 y 150 caracteres.' });
                }
            }

            if (!descripcion_servicio || typeof descripcion_servicio !== 'string' || descripcion_servicio.trim().length === 0) {
                return res.status(400).json({ error: 'La descripción del servicio es obligatoria.' });
            }
            cleanDescripcion = descripcion_servicio.trim();
            if (cleanDescripcion.length < 10) {
                return res.status(400).json({ error: 'La descripción del servicio debe contener al menos 10 caracteres.' });
            }
            if (cleanDescripcion.length > 3000) {
                return res.status(400).json({ error: 'La descripción del servicio no puede exceder 3000 caracteres.' });
            }
        }

        // Comprobar si el usuario o el correo ya existen
        const [existingUsers] = await pool.execute(
            'SELECT * FROM usuarios WHERE usuario = ? OR email = ?',
            [cleanUsuario, cleanCorreo]
        );

        if (existingUsers.length > 0) {
            const isUser = existingUsers.some(user => user.usuario === cleanUsuario);
            const isEmail = existingUsers.some(user => user.email === cleanCorreo);

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

        // Obtener conexión para inserción y asignación atómica
        connection = (typeof pool.getConnection === 'function') ? await pool.getConnection() : pool;
        const hasTx = connection && typeof connection.beginTransaction === 'function';
        if (hasTx) await connection.beginTransaction();

        if (tipoRegistro === 'asociado') {
            // Insertar usuario inactivo (activo = 0)
            const [result] = await connection.execute(
                'INSERT INTO usuarios (usuario, password_hash, nombre, telefono, email, activo) VALUES (?, ?, ?, ?, ?, 0)',
                [cleanUsuario, passwordHash, cleanNombre, formattedTelefono, cleanCorreo]
            );
            const newUserId = result.insertId;

            // Asignar rol Asociado
            await assignRoleByName(connection, newUserId, 'Asociado');

            // Crear solicitud de asociado con estatus por_aprobar
            const [solResult] = await connection.execute(
                'INSERT INTO solicitudes_asociado (usuario_id, servicio_id, descripcion_servicio, nombre_servicio_otro, estatus) VALUES (?, ?, ?, ?, "por_aprobar")',
                [newUserId, parsedServicioId, cleanDescripcion, cleanServicioOtro]
            );
            const newSolId = solResult.insertId;

            // Registrar historial inicial
            await connection.execute(
                'INSERT INTO historial_solicitudes_asociado (solicitud_id, estatus_anterior, estatus_nuevo, usuario_id, observaciones) VALUES (?, NULL, "por_aprobar", ?, "Registro inicial como Asociado")',
                [newSolId, newUserId]
            );

            // Generar token seguro para verificación de correo (vigencia 10 minutos)
            const emailToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(emailToken).digest('hex');
            await connection.execute(
                'INSERT INTO verificaciones_correo (usuario_id, token_hash, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))',
                [newUserId, tokenHash]
            );

            if (hasTx) await connection.commit();

            // Enviar correo de verificación (asíncrono y protegido contra errores SMTP)
            sendAsociadoEmailVerificacion(cleanCorreo, cleanNombre, emailToken).catch(err => {
                console.error('Error enviando correo de verificación de asociado:', err.message);
            });

            return res.status(201).json({
                message: 'Registro exitoso como Asociado. Te hemos enviado un correo para validar tu dirección. El enlace de validación tiene una vigencia de 10 minutos.',
                tipo: 'asociado'
            });

        } else {
            // Insertar el nuevo usuario normal en la base de datos (activo = 1)
            const [result] = await connection.execute(
                'INSERT INTO usuarios (usuario, password_hash, nombre, telefono, email, activo) VALUES (?, ?, ?, ?, ?, 1)',
                [cleanUsuario, passwordHash, cleanNombre, formattedTelefono, cleanCorreo]
            );
            const newUserId = result.insertId;

            // Asignar automáticamente el rol 'usuario' por defecto
            await assignDefaultUserRole(connection, newUserId);

            if (hasTx) await connection.commit();
            return res.status(201).json({ message: 'Registro exitoso.', tipo: 'usuario' });
        }

    } catch (error) {
        if (connection && typeof connection.rollback === 'function') {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in /api/register:', error);
        if (error.code === 'ROLE_USUARIO_NOT_FOUND') {
            return res.status(500).json({ error: 'No se pudo completar el registro: el rol "usuario" no se encuentra configurado en el sistema.' });
        }
        if (error.code === 'ROLE_ASOCIADO_NOT_FOUND') {
            return res.status(500).json({ error: 'No se pudo completar el registro: el rol "Asociado" no se encuentra configurado en el sistema.' });
        }
        res.status(500).json({ error: 'Error interno del servidor durante el registro.' });
    } finally {
        if (connection && typeof connection.release === 'function') {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.get('/api/servicios', async (req, res) => {
    try {
        const [servicios] = await pool.execute(
            'SELECT id, nombre, descripcion, activo FROM servicios WHERE activo = 1 ORDER BY (CASE WHEN id = 999 THEN 1 ELSE 0 END), id ASC'
        );
        res.status(200).json(servicios);
    } catch (error) {
        console.error('Error in /api/servicios:', error);
        res.status(500).json({ error: 'Error al consultar catálogo de servicios.' });
    }
});

// Endpoint de verificación de correo de Asociado (admite GET y POST)
const handleVerificarCorreoAsociado = async (req, res) => {
    try {
        const token = (req.params && req.params.token) || (req.body && req.body.token) || (req.query && req.query.token);
        if (!token) {
            return res.status(400).json({ error: 'Token de validación requerido.' });
        }
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const [rows] = await pool.execute(
            'SELECT id, usuario_id, expira_en, usado, (expira_en > NOW()) as is_valid FROM verificaciones_correo WHERE token_hash = ? OR token_hash = ?',
            [tokenHash, token]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'El enlace de validación es inválido o no existe.' });
        }

        const record = rows[0];

        // Comprobar el estatus actual de la solicitud del usuario
        const [solicitudRows] = await pool.execute(
            'SELECT id, estatus FROM solicitudes_asociado WHERE usuario_id = ? ORDER BY id DESC LIMIT 1',
            [record.usuario_id]
        );
        if (solicitudRows.length > 0 && solicitudRows[0].estatus === 'rechazado') {
            return res.status(400).json({
                error: 'Este enlace de validación ya no es válido. La solicitud asociada a este correo fue rechazada o el enlace fue invalidado.'
            });
        }

        if (record.usado === 1) {
            return res.status(400).json({
                error: 'Este enlace de validación ya no es válido. La solicitud asociada a este correo fue rechazada o el enlace fue invalidado.'
            });
        }

        if (!record.is_valid) {
            return res.status(400).json({ error: 'El enlace de validación ha expirado. Su vigencia es de 10 minutos.' });
        }

        // Marcar token como utilizado
        await pool.execute('UPDATE verificaciones_correo SET usado = 1 WHERE id = ?', [record.id]);

        // Registrar en historial de la solicitud si existe
        const [solicitudes] = await pool.execute('SELECT id FROM solicitudes_asociado WHERE usuario_id = ? ORDER BY id DESC LIMIT 1', [record.usuario_id]);
        if (solicitudes.length > 0) {
            await pool.execute(
                'INSERT INTO historial_solicitudes_asociado (solicitud_id, estatus_anterior, estatus_nuevo, usuario_id, observaciones) VALUES (?, "por_aprobar", "por_aprobar", ?, "Correo electrónico validado exitosamente por el candidato")',
                [solicitudes[0].id, record.usuario_id]
            );
        }

        // IMPORTANTE: Validar correo NO activa la cuenta de usuario (usuarios.activo permanece en 0)
        res.status(200).json({
            success: true,
            validado: true,
            message: 'Correo validado correctamente. Tu solicitud como Asociado ha sido recibida y está pendiente de revisión por parte de Idealandia.'
        });

    } catch (error) {
        console.error('Error in verificar-correo:', error);
        res.status(500).json({ error: 'Error interno del servidor durante la validación de correo.' });
    }
};

app.get('/api/asociados/verificar-correo', handleVerificarCorreoAsociado);
app.get('/api/asociados/verificar-correo/:token', handleVerificarCorreoAsociado);
app.post('/api/asociados/verificar-correo', handleVerificarCorreoAsociado);

// Endpoint público para portal de "Más Información" (consulta por token seguro)
app.get('/api/asociados/solicitud/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!token) return res.status(400).json({ error: 'Token requerido.' });

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [tokenRows] = await pool.execute(
            'SELECT id, solicitud_id, expira_en, usado, (expira_en > NOW()) as is_valid FROM tokens_solicitud_asociado WHERE token_hash = ? OR token_hash = ?',
            [tokenHash, token]
        );

        if (tokenRows.length === 0) {
            return res.status(404).json({ error: 'El enlace de acceso a la solicitud es inválido.' });
        }

        const tRecord = tokenRows[0];
        if (tRecord.usado === 1) {
            return res.status(400).json({ error: 'Este enlace ya fue utilizado para actualizar la solicitud.' });
        }

        if (!tRecord.is_valid) {
            return res.status(400).json({ error: 'El enlace de acceso ha expirado. Contacta a administración para solicitar un nuevo enlace.' });
        }

        const [solRows] = await pool.execute(`
            SELECT s.id, s.servicio_id, s.descripcion_servicio, s.nombre_servicio_otro, s.estatus, s.observaciones, s.fecha_solicitud,
                   u.nombre as usuario_nombre, u.email as usuario_email, sv.nombre as servicio_nombre
            FROM solicitudes_asociado s
            JOIN usuarios u ON s.usuario_id = u.id
            JOIN servicios sv ON s.servicio_id = sv.id
            WHERE s.id = ?
        `, [tRecord.solicitud_id]);

        if (solRows.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const sol = solRows[0];
        if (sol.estatus === 'autorizado') {
            return res.status(400).json({ error: 'Esta solicitud ya ha sido autorizada previamente y no requiere modificaciones.' });
        }
        if (sol.estatus === 'rechazado') {
            return res.status(400).json({ error: 'Esta solicitud fue rechazada y no se encuentra disponible para edición.' });
        }
        if (sol.estatus !== 'mas_informacion') {
            return res.status(400).json({ error: 'Esta solicitud se encuentra en revisión y no está disponible para edición en este momento.' });
        }

        res.status(200).json({ solicitud: sol });
    } catch (error) {
        console.error('Error fetching solicitud by token:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Endpoint público para que el candidato actualice su solicitud vía token seguro
app.post('/api/asociados/solicitud/actualizar', async (req, res) => {
    let connection = null;
    try {
        const { token, servicio_id, servicio_otro, descripcion_servicio } = req.body;
        if (!token) return res.status(400).json({ error: 'Token requerido.' });

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [tokenRows] = await pool.execute(
            'SELECT id, solicitud_id, expira_en, usado, (expira_en > NOW()) as is_valid FROM tokens_solicitud_asociado WHERE token_hash = ? OR token_hash = ?',
            [tokenHash, token]
        );

        if (tokenRows.length === 0) {
            return res.status(404).json({ error: 'El enlace de acceso a la solicitud es inválido.' });
        }

        const tRecord = tokenRows[0];
        if (tRecord.usado === 1) {
            return res.status(400).json({ error: 'Este enlace ya fue utilizado.' });
        }

        if (!tRecord.is_valid) {
            return res.status(400).json({ error: 'El enlace de acceso ha expirado.' });
        }

        const [solCheck] = await pool.execute('SELECT id, estatus FROM solicitudes_asociado WHERE id = ?', [tRecord.solicitud_id]);
        if (solCheck.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }
        if (solCheck[0].estatus === 'autorizado') {
            return res.status(400).json({ error: 'Esta solicitud ya ha sido autorizada previamente y no puede ser modificada.' });
        }
        if (solCheck[0].estatus === 'rechazado') {
            return res.status(400).json({ error: 'Esta solicitud fue rechazada y no puede ser modificada.' });
        }
        if (solCheck[0].estatus !== 'mas_informacion') {
            return res.status(400).json({ error: 'Esta solicitud no se encuentra disponible para edición.' });
        }

        const parsedServicioId = parseInt(servicio_id, 10);
        if (!parsedServicioId || isNaN(parsedServicioId)) {
            return res.status(400).json({ error: 'Debes seleccionar un servicio válido.' });
        }
        const [servRows] = await pool.execute('SELECT id, activo FROM servicios WHERE id = ?', [parsedServicioId]);
        if (servRows.length === 0 || !servRows[0].activo) {
            return res.status(400).json({ error: 'El servicio seleccionado no existe o no está activo.' });
        }

        let cleanServicioOtro = null;
        if (parsedServicioId === 999) {
            if (!servicio_otro || typeof servicio_otro !== 'string' || servicio_otro.trim().length === 0) {
                return res.status(400).json({ error: 'Debes especificar el nombre de tu servicio cuando seleccionas "Otros".' });
            }
            cleanServicioOtro = servicio_otro.trim();
            if (cleanServicioOtro.length < 3 || cleanServicioOtro.length > 150) {
                return res.status(400).json({ error: 'El nombre del servicio personalizado debe contener entre 3 y 150 caracteres.' });
            }
        }

        if (!descripcion_servicio || typeof descripcion_servicio !== 'string' || descripcion_servicio.trim().length === 0) {
            return res.status(400).json({ error: 'La descripción del servicio es obligatoria.' });
        }
        const cleanDesc = descripcion_servicio.trim();
        if (cleanDesc.length < 10 || cleanDesc.length > 3000) {
            return res.status(400).json({ error: 'La descripción debe tener entre 10 y 3000 caracteres.' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Actualizar solicitud: vuelve a por_aprobar y usuario permanece inactivo
        await connection.execute(`
            UPDATE solicitudes_asociado
            SET servicio_id = ?,
                nombre_servicio_otro = ?,
                descripcion_servicio = ?,
                estatus = 'por_aprobar',
                fecha_actualizacion = NOW()
            WHERE id = ?
        `, [parsedServicioId, cleanServicioOtro, cleanDesc, tRecord.solicitud_id]);

        // Invalidar token usado
        await connection.execute('UPDATE tokens_solicitud_asociado SET usado = 1 WHERE id = ?', [tRecord.id]);

        // Registrar en historial
        await connection.execute(`
            INSERT INTO historial_solicitudes_asociado (solicitud_id, estatus_anterior, estatus_nuevo, observaciones)
            VALUES (?, 'mas_informacion', 'por_aprobar', 'El candidato actualizó la información requerida')
        `, [tRecord.solicitud_id]);

        await connection.commit();
        res.status(200).json({ message: 'Solicitud actualizada exitosamente. Tu información ha sido enviada a revisión nuevamente.' });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error updating solicitud by token:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;

        if (!usuario || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        const [users] = await pool.execute(
            'SELECT id, usuario, password_hash, nombre, telefono, email, jwt_version, activo FROM usuarios WHERE usuario = ? OR email = ?',
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

        if (user.activo === 0 || user.activo === false) {
            return res.status(403).json({ error: 'Tu cuenta se encuentra inactiva o pendiente de autorización.' });
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

function escapeHTML(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function sendAsociadoEmailVerificacion(email, nombre, token) {
    if (!mailTransporter) {
        throw new Error('Servicio de correo no disponible (mailTransporter no configurado).');
    }
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const link = `${appUrl}/?verificar_correo=${token}`;
    const subject = 'Valida tu correo electrónico para tu solicitud como Asociado — Idealandia';
    const text = `Hola ${nombre}:\n\nTu correo electrónico debe ser validado para continuar con tu solicitud como Asociado de Idealandia.\n\nPor favor haz clic en el siguiente enlace para validar tu correo (el enlace de validación tiene una vigencia de 10 minutos):\n${link}\n\nSi tú no realizaste este registro, por favor ignora este mensaje.\n\nAtentamente,\nEquipo Idealandia`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2c3e50;">Bienvenido a Idealandia</h2>
            <p>Hola <strong>${escapeHTML(nombre)}</strong>,</p>
            <p>Tu correo electrónico debe ser validado para continuar con tu solicitud como <strong>Asociado</strong> de Idealandia.</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Validar mi correo</a>
            </p>
            <p style="color: #666; font-size: 13px;">El enlace de validación tiene una vigencia de exactamente <strong>10 minutos</strong>.</p>
            <p style="color: #666; font-size: 13px;">Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:<br><a href="${link}">${link}</a></p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Equipo de Idealandia</p>
        </div>
    `;
    return await mailTransporter.sendMail({
        from: process.env.SMTP_FROM || '"Idealandia" <no-reply@idealandia.com.mx>',
        to: email,
        subject,
        text,
        html
    });
}

async function sendAsociadoEmailAutorizado(email, nombre) {
    if (!mailTransporter) {
        throw new Error('Servicio de correo no disponible (mailTransporter no configurado).');
    }
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const loginLink = `${appUrl}/?seccion=login`;
    const subject = '¡Tu solicitud como Asociado ha sido autorizada! — Idealandia';
    const text = `¡Hola ${nombre}!\n\n¡Tu solicitud para formar parte de Idealandia como Asociado ha sido autorizada!\n\nYa puedes acceder a Idealandia iniciando sesión con tu cuenta:\n${loginLink}\n\n¡Bienvenido al equipo de Asociados de Idealandia!\n\nAtentamente,\nEquipo Idealandia`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #28a745;">¡Felicitaciones!</h2>
            <p>Hola <strong>${escapeHTML(nombre)}</strong>,</p>
            <p><strong>¡Tu solicitud para formar parte de Idealandia como Asociado ha sido autorizada!</strong></p>
            <p>A partir de este momento tu cuenta se encuentra activa y ya puedes iniciar sesión normalmente en la plataforma.</p>
            <p style="text-align: center; margin: 30px 0;">
                <a href="${loginLink}" style="background-color: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Acceder a Idealandia</a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Equipo de Idealandia</p>
        </div>
    `;
    return await mailTransporter.sendMail({
        from: process.env.SMTP_FROM || '"Idealandia" <no-reply@idealandia.com.mx>',
        to: email,
        subject,
        text,
        html
    });
}

async function sendAsociadoEmailRechazado(email, nombre, observaciones) {
    if (!mailTransporter) {
        throw new Error('Servicio de correo no disponible (mailTransporter no configurado).');
    }
    const subject = 'Actualización sobre tu solicitud como Asociado — Idealandia';
    const text = `Hola ${nombre}:\n\nTu solicitud para formar parte de Idealandia como Asociado no fue aprobada en esta ocasión.\n\nMotivo / observaciones:\n${observaciones}\n\nGracias por tu interés en Idealandia.\n\nAtentamente,\nEquipo Idealandia`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #dc3545;">Solicitud de Asociado</h2>
            <p>Hola <strong>${escapeHTML(nombre)}</strong>,</p>
            <p>Tu solicitud para formar parte de Idealandia como Asociado no fue aprobada en esta ocasión.</p>
            <div style="background-color: #f8f9fa; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold; color: #333;">Observaciones:</p>
                <p style="margin: 10px 0 0 0; color: #555;">${escapeHTML(observaciones).replace(/\n/g, '<br>')}</p>
            </div>
            <p>Agradecemos sinceramente tu interés en colaborar con Idealandia.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Equipo de Idealandia</p>
        </div>
    `;
    return await mailTransporter.sendMail({
        from: process.env.SMTP_FROM || '"Idealandia" <no-reply@idealandia.com.mx>',
        to: email,
        subject,
        text,
        html
    });
}

async function sendAsociadoEmailMasInformacion(email, nombre, observaciones, token) {
    if (!mailTransporter) {
        throw new Error('Servicio de correo no disponible (mailTransporter no configurado).');
    }
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const link = `${appUrl}/?asociado_token=${token}`;
    const subject = 'Tu solicitud como Asociado requiere información adicional — Idealandia';
    const text = `Hola ${nombre}:\n\nTu solicitud como Asociado de Idealandia requiere información adicional para poder ser procesada.\n\nObservaciones del equipo revisor:\n${observaciones}\n\nPor favor continúa con tu solicitud en el siguiente enlace:\n${link}\n\nAtentamente,\nEquipo Idealandia`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #ffc107;">Información adicional requerida</h2>
            <p>Hola <strong>${escapeHTML(nombre)}</strong>,</p>
            <p>Tu solicitud como Asociado de Idealandia requiere información adicional para continuar con el proceso de revisión.</p>
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; color: #856404;">
                <p style="margin: 0; font-weight: bold;">Observaciones de Idealandia:</p>
                <p style="margin: 10px 0 0 0;">${escapeHTML(observaciones).replace(/\n/g, '<br>')}</p>
            </div>
            <p style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="background-color: #17a2b8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Continuar con mi solicitud</a>
            </p>
            <p style="color: #666; font-size: 13px;">Si el botón no funciona, copia y pega el siguiente enlace:<br><a href="${link}">${link}</a></p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">Equipo de Idealandia</p>
        </div>
    `;
    return await mailTransporter.sendMail({
        from: process.env.SMTP_FROM || '"Idealandia" <no-reply@idealandia.com.mx>',
        to: email,
        subject,
        text,
        html
    });
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

// requireAdmin: validates entry to the 'admin' functionality (Level 2)
const requireAdmin = requireFunctionality('administracion');

const requireAdminOrSubmodule = async (req, res, next) => {
    try {
        if (!req.userId) {
            const token = (req.cookies && req.cookies.auth_token) || (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
            if (!token) {
                return res.status(401).json({ error: 'No autorizado. Token no proporcionado.', code: 'AUTH_REQUIRED' });
            }
            const decoded = await verifyToken(token, pool);
            req.userId = decoded.id;
            req.user = decoded;
        }
        const hasAdminAccess = await checkUserFunctionalityAccess(pool, req.userId, 'administracion');
        const hasContextoAccess = await checkUserFunctionalityAccess(pool, req.userId, 'contexto_idealita');
        if (!hasAdminAccess && !hasContextoAccess) {
            return res.status(403).json({
                error: 'Acceso no autorizado o vencido para esta funcionalidad.',
                code: 'RBAC_ACCESS_DENIED'
            });
        }
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado' || error.message === 'Usuario inactivo') {
            return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
        }
        return res.status(500).json({ error: 'Error interno del servidor al verificar acceso.' });
    }
};

app.get('/api/admin/check', requireFunctionality('admin'), async (req, res) => {
    res.status(200).json({ message: 'Acceso de administrador concedido.' });
});

app.get('/api/admin/mis-permisos', requireAdminOrSubmodule, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        const permisos = await getUserPermissions(pool, req.userId);
        res.status(200).json({ permisos });
    } catch (error) {
        console.error('Error in /api/admin/mis-permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor al consultar permisos.' });
    }
});

app.get('/api/me/permisos', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        const token = (req.cookies && req.cookies.auth_token) || (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
        if (!token) {
            return res.status(401).json({ error: 'No autorizado. Token no proporcionado.', code: 'AUTH_REQUIRED' });
        }
        const decoded = await verifyToken(token, pool);
        const permisos = await getUserPermissions(pool, decoded.id);
        res.status(200).json({ permisos });
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
    }
});

// --- ADMIN ENDPOINTS ---

app.get('/api/admin/usuarios', requireFunctionality('admin'), requirePermission('usuarios.read'), async (req, res) => {
    try {
        const [usuarios] = await pool.execute(`
            SELECT u.id, u.usuario, u.nombre, u.telefono, u.email, u.activo,
                   EXISTS(
                       SELECT 1 FROM usuario_roles ur
                       JOIN roles r ON ur.rol_id = r.id
                       WHERE ur.usuario_id = u.id AND LOWER(r.nombre) = 'asociado'
                   ) as es_asociado,
                   (
                       SELECT s.estatus FROM solicitudes_asociado s
                       WHERE s.usuario_id = u.id
                       ORDER BY s.id DESC LIMIT 1
                   ) as solicitud_asociado_estatus
            FROM usuarios u
            ORDER BY u.id ASC
        `);
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


app.get('/api/admin/funcionalidades/:funcId/permisos', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { funcId } = req.params;
        let [permisos] = await pool.execute(`
            SELECT p.id, p.codigo, p.nombre, p.descripcion
            FROM permisos p
            JOIN funcionalidad_permisos fp ON p.id = fp.permiso_id
            WHERE fp.funcionalidad_id = ? AND p.activo = TRUE
            ORDER BY p.codigo
        `, [funcId]);

        if (!permisos || permisos.length === 0) {
            const [func] = await pool.execute('SELECT codigo FROM funcionalidades WHERE id = ?', [funcId]);
            if (func.length > 0) {
                const rawCodigo = func[0].codigo.toLowerCase();
                const codigo = normalizeFunctionalityCode(rawCodigo);
                let permitidos = FUNCIONALIDAD_PERMISOS_MAPPING[codigo] || FUNCIONALIDAD_PERMISOS_MAPPING[rawCodigo] || [];
                if (!permitidos.length && !codigo.startsWith('admin') && !codigo.startsWith('administra')) {
                    permitidos = [`${rawCodigo}.read`, `${rawCodigo}.create`, `${rawCodigo}.update`, `${rawCodigo}.delete`];
                }
                if (permitidos.length > 0) {
                    const placeholders = permitidos.map(() => '?').join(',');
                    const [availPerms] = await pool.execute(
                        `SELECT id, codigo, nombre, descripcion FROM permisos WHERE codigo IN (${placeholders}) AND activo = TRUE ORDER BY codigo`,
                        permitidos
                    );
                    permisos = availPerms;
                }
            }
        }

        res.status(200).json(permisos || []);
    } catch (error) {
        console.error('Error in GET /api/admin/funcionalidades/:funcId/permisos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/api/admin/accesos/:id/permisos', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { id } = req.params;
        await ensureAccesoPermisosTable(pool);
        const [rows] = await pool.query('SELECT permiso_id FROM acceso_permisos WHERE acceso_id = ? ORDER BY permiso_id', [id]);
        res.status(200).json(rows.map(r => r.permiso_id));
    } catch (error) {
        console.error('Error in GET /api/admin/accesos/:id/permisos:', error);
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

        if (accesos.length > 0) {
            try {
                await ensureAccesoPermisosTable(pool);
                const accesoIds = accesos.map(a => a.id);
                const placeholders = accesoIds.map(() => '?').join(',');
                const [permisosRows] = await pool.query(`
                    SELECT ap.acceso_id, p.id, p.codigo, p.nombre
                    FROM acceso_permisos ap
                    JOIN permisos p ON ap.permiso_id = p.id
                    WHERE ap.acceso_id IN (${placeholders}) AND p.activo = TRUE
                    ORDER BY p.codigo
                `, accesoIds);

                const permsByAcceso = {};
                for (const row of permisosRows) {
                    if (!permsByAcceso[row.acceso_id]) permsByAcceso[row.acceso_id] = [];
                    permsByAcceso[row.acceso_id].push({
                        id: row.id,
                        codigo: row.codigo,
                        nombre: row.nombre
                    });
                }

                for (const a of accesos) {
                    a.permisos = permsByAcceso[a.id] || [];
                }
            } catch (permErr) {
                accesos.forEach(a => { a.permisos = a.permisos || []; });
            }
        }

        res.status(200).json(accesos);
    } catch (error) {
        console.error('Error in GET /api/admin/accesos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.post('/api/admin/accesos', requireFunctionality('admin'), requirePermission('admin.access'), async (req, res) => {
    try {
        const { usuarios, funcionalidad_id, tipo_acceso, fecha_inicio, fecha_fin, permisos } = req.body;

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

                const [insertResult] = await connection.execute(
                    'INSERT INTO usuario_funcionalidades (usuario_id, funcionalidad_id, tipo_acceso, fecha_inicio, fecha_fin, estado, asignado_por) VALUES (?, ?, ?, ?, ?, "activo", ?)',
                    [usuario_id, funcionalidad_id, tipo_acceso, formattedInicio, formattedFin, asignado_por]
                );

                const newAccesoId = insertResult.insertId;

                if (Array.isArray(permisos) && permisos.length > 0 && newAccesoId) {
                    await ensureAccesoPermisosTable(connection);
                    const validPermIds = permisos
                        .map(p => typeof p === 'object' ? parseInt(p.id) : parseInt(p))
                        .filter(p => !isNaN(p) && p > 0);

                    for (const pId of validPermIds) {
                        await connection.query(
                            'INSERT IGNORE INTO acceso_permisos (acceso_id, permiso_id) VALUES (?, ?)',
                            [newAccesoId, pId]
                        );
                    }
                }
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
        const { tipo_acceso, fecha_inicio, fecha_fin, permisos } = req.body;

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

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.execute(
                'UPDATE usuario_funcionalidades SET tipo_acceso = ?, fecha_inicio = ?, fecha_fin = ? WHERE id = ?',
                [tipo_acceso, formattedInicio, formattedFin, id]
            );

            if (Array.isArray(permisos)) {
                await ensureAccesoPermisosTable(connection);
                await connection.query('DELETE FROM acceso_permisos WHERE acceso_id = ?', [id]);
                const validPermIds = permisos
                    .map(p => typeof p === 'object' ? parseInt(p.id) : parseInt(p))
                    .filter(p => !isNaN(p) && p > 0);

                for (const pId of validPermIds) {
                    await connection.query(
                        'INSERT IGNORE INTO acceso_permisos (acceso_id, permiso_id) VALUES (?, ?)',
                        [id, pId]
                    );
                }
            }

            await connection.commit();
            res.status(200).json({ message: 'Acceso actualizado exitosamente.' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
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

        try {
            await pool.execute('DELETE FROM acceso_permisos WHERE acceso_id = ?', [id]);
        } catch (pErr) {}
        await pool.execute('DELETE FROM usuario_funcionalidades WHERE id = ?', [id]);
        res.status(200).json({ message: 'Acceso temporal eliminado exitosamente.' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/accesos/:id:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


app.post('/api/admin/usuarios', requireFunctionality('admin'), requirePermission('usuarios.create'), async (req, res) => {
    let connection = null;
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

        connection = (typeof pool.getConnection === 'function') ? await pool.getConnection() : pool;
        const hasTx = connection && typeof connection.beginTransaction === 'function';
        if (hasTx) await connection.beginTransaction();

        const [result] = await connection.execute(
            'INSERT INTO usuarios (usuario, password_hash, nombre, telefono, email) VALUES (?, ?, ?, ?, ?)',
            [usuario, passwordHash, nombre, telefono || null, email]
        );
        const newUserId = result.insertId;

        // Asignar automáticamente el rol 'usuario' por defecto
        await assignDefaultUserRole(connection, newUserId);

        if (hasTx) await connection.commit();
        res.status(201).json({ message: 'Usuario creado exitosamente.', id: newUserId });
    } catch (error) {
        if (connection && typeof connection.rollback === 'function') {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in POST /api/admin/usuarios:', error);
        if (error.code === 'ROLE_USUARIO_NOT_FOUND') {
            return res.status(500).json({ error: 'No se pudo crear el usuario: el rol "usuario" no se encuentra configurado en el sistema.' });
        }
        res.status(500).json({ error: 'Error interno del servidor.' });
    } finally {
        if (connection && typeof connection.release === 'function') {
            try { connection.release(); } catch (_) {}
        }
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

// =============================================================================
// ADMINISTRACIÓN DE ASOCIADOS
// =============================================================================

app.get('/api/admin/asociados', requireFunctionality('admin'), requirePermission('asociados.read'), async (req, res) => {
    try {
        const { estatus } = req.query;
        let query = `
            SELECT s.id, s.usuario_id, s.servicio_id, s.descripcion_servicio, s.nombre_servicio_otro,
                   s.estatus, s.observaciones, s.fecha_solicitud, s.fecha_actualizacion, s.usuario_revisor_id,
                   u.usuario, u.nombre, u.email, u.telefono, u.activo as usuario_activo,
                   sv.nombre as servicio_nombre,
                   EXISTS(SELECT 1 FROM verificaciones_correo vc WHERE vc.usuario_id = u.id AND vc.usado = 1) as correo_validado
            FROM solicitudes_asociado s
            JOIN usuarios u ON s.usuario_id = u.id
            JOIN servicios sv ON s.servicio_id = sv.id
        `;
        const params = [];
        if (estatus && ['por_aprobar', 'mas_informacion', 'autorizado', 'rechazado'].includes(estatus)) {
            query += ' WHERE s.estatus = ?';
            params.push(estatus);
        }
        query += ' ORDER BY s.fecha_solicitud DESC';

        const [rows] = await pool.execute(query, params);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error in GET /api/admin/asociados:', error);
        res.status(500).json({ error: 'Error interno al consultar asociados.' });
    }
});

app.get('/api/admin/asociados/:id', requireFunctionality('admin'), requirePermission('asociados.read'), async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.execute(`
            SELECT s.id, s.usuario_id, s.servicio_id, s.descripcion_servicio, s.nombre_servicio_otro,
                   s.estatus, s.observaciones, s.fecha_solicitud, s.fecha_actualizacion, s.usuario_revisor_id,
                   u.usuario, u.nombre, u.email, u.telefono, u.activo as usuario_activo,
                   sv.nombre as servicio_nombre,
                   ur.nombre as revisor_nombre,
                   EXISTS(SELECT 1 FROM verificaciones_correo vc WHERE vc.usuario_id = u.id AND vc.usado = 1) as correo_validado
            FROM solicitudes_asociado s
            JOIN usuarios u ON s.usuario_id = u.id
            JOIN servicios sv ON s.servicio_id = sv.id
            LEFT JOIN usuarios ur ON s.usuario_revisor_id = ur.id
            WHERE s.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const [historial] = await pool.execute(`
            SELECT h.id, h.estatus_anterior, h.estatus_nuevo, h.observaciones, h.fecha,
                   u.usuario as usuario_nombre
            FROM historial_solicitudes_asociado h
            LEFT JOIN usuarios u ON h.usuario_id = u.id
            WHERE h.solicitud_id = ?
            ORDER BY h.fecha ASC
        `, [id]);

        res.status(200).json({ solicitud: rows[0], historial });
    } catch (error) {
        console.error('Error in GET /api/admin/asociados/:id:', error);
        res.status(500).json({ error: 'Error interno al consultar detalle de solicitud.' });
    }
});

app.post('/api/admin/asociados/:id/autorizar', requireFunctionality('admin'), requirePermission('asociados.autorizar'), async (req, res) => {
    let connection = null;
    try {
        const { id } = req.params;
        const adminId = req.userId;

        const [solRows] = await pool.execute(`
            SELECT s.id, s.usuario_id, s.estatus, u.nombre, u.email, u.activo,
                   EXISTS(SELECT 1 FROM verificaciones_correo vc WHERE vc.usuario_id = u.id AND vc.usado = 1) as correo_validado,
                   EXISTS(SELECT 1 FROM usuario_roles ur JOIN roles r ON ur.rol_id = r.id WHERE ur.usuario_id = u.id AND LOWER(r.nombre) = 'asociado') as tiene_rol_asociado
            FROM solicitudes_asociado s
            JOIN usuarios u ON s.usuario_id = u.id
            WHERE s.id = ?
        `, [id]);

        if (solRows.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const sol = solRows[0];

        if (!sol.tiene_rol_asociado) {
            return res.status(400).json({ error: 'El usuario no cuenta con el rol de Asociado.' });
        }

        if (!sol.correo_validado) {
            return res.status(400).json({ error: 'No se puede autorizar la solicitud: el correo electrónico del candidato aún no ha sido validado.' });
        }

        if (sol.estatus === 'autorizado') {
            return res.status(400).json({ error: 'La solicitud ya ha sido autorizada previamente.' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Activar usuario
        await connection.execute('UPDATE usuarios SET activo = 1 WHERE id = ?', [sol.usuario_id]);

        // 2. Actualizar solicitud
        await connection.execute(`
            UPDATE solicitudes_asociado
            SET estatus = 'autorizado',
                usuario_revisor_id = ?,
                fecha_actualizacion = NOW()
            WHERE id = ?
        `, [adminId, id]);

        // 3. Registrar en historial
        await connection.execute(`
            INSERT INTO historial_solicitudes_asociado (solicitud_id, estatus_anterior, estatus_nuevo, usuario_id, observaciones)
            VALUES (?, ?, 'autorizado', ?, 'Solicitud autorizada por el administrador')
        `, [id, sol.estatus, adminId]);

        await connection.commit();

        // 4. Enviar correo de autorización
        let emailSent = false;
        let emailWarning = null;
        try {
            await sendAsociadoEmailAutorizado(sol.email, sol.nombre);
            emailSent = true;
        } catch (err) {
            console.error('Error enviando correo de autorización para solicitud ID ' + id + ':', err.message);
            emailWarning = 'La solicitud fue autorizada y la cuenta activada, pero no se pudo enviar el correo de notificación al asociado.';
        }

        if (emailSent) {
            res.status(200).json({ success: true, emailSent: true, message: 'Solicitud autorizada exitosamente. La cuenta del asociado ha sido activada.' });
        } else {
            res.status(200).json({ success: true, emailSent: false, warning: emailWarning, message: 'Solicitud autorizada exitosamente.' });
        }

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in POST /api/admin/asociados/:id/autorizar:', error);
        res.status(500).json({ error: 'Error interno al autorizar la solicitud.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.post('/api/admin/asociados/:id/rechazar', requireFunctionality('admin'), requirePermission('asociados.rechazar'), async (req, res) => {
    let connection = null;
    try {
        const { id } = req.params;
        const { observaciones } = req.body;
        const adminId = req.userId;

        if (!observaciones || typeof observaciones !== 'string' || observaciones.trim().length === 0) {
            return res.status(400).json({ error: 'El motivo / observaciones del rechazo son obligatorios.' });
        }
        const cleanObs = observaciones.trim();

        const [solRows] = await pool.execute(`
            SELECT s.id, s.usuario_id, s.estatus, u.nombre, u.email
            FROM solicitudes_asociado s
            JOIN usuarios u ON s.usuario_id = u.id
            WHERE s.id = ?
        `, [id]);

        if (solRows.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const sol = solRows[0];

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Asegurar usuario inactivo
        await connection.execute('UPDATE usuarios SET activo = 0 WHERE id = ?', [sol.usuario_id]);

        // 2. Invalidar tokens pendientes de verificación de correo para ese usuario
        await connection.execute('UPDATE verificaciones_correo SET usado = 1 WHERE usuario_id = ? AND usado = 0', [sol.usuario_id]);

        // 3. Invalidar tokens pendientes de más información para esta solicitud
        await connection.execute('UPDATE tokens_solicitud_asociado SET usado = 1 WHERE solicitud_id = ? AND usado = 0', [id]);

        // 4. Actualizar solicitud
        await connection.execute(`
            UPDATE solicitudes_asociado
            SET estatus = 'rechazado',
                observaciones = ?,
                usuario_revisor_id = ?,
                fecha_actualizacion = NOW()
            WHERE id = ?
        `, [cleanObs, adminId, id]);

        // 5. Registrar en historial
        await connection.execute(`
            INSERT INTO historial_solicitudes_asociado (solicitud_id, estatus_anterior, estatus_nuevo, usuario_id, observaciones)
            VALUES (?, ?, 'rechazado', ?, ?)
        `, [id, sol.estatus, adminId, cleanObs]);

        await connection.commit();

        // 6. Enviar correo de rechazo
        let emailSent = false;
        let emailWarning = null;
        try {
            await sendAsociadoEmailRechazado(sol.email, sol.nombre, cleanObs);
            emailSent = true;
        } catch (err) {
            console.error('Error enviando correo de rechazo para solicitud ID ' + id + ':', err.message);
            emailWarning = 'La solicitud fue rechazada, pero no se pudo enviar el correo de notificación al solicitante.';
        }

        if (emailSent) {
            res.status(200).json({ success: true, emailSent: true, message: 'Solicitud rechazada correctamente.' });
        } else {
            res.status(200).json({ success: true, emailSent: false, warning: emailWarning, message: 'Solicitud rechazada correctamente.' });
        }

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in POST /api/admin/asociados/:id/rechazar:', error);
        res.status(500).json({ error: 'Error interno al rechazar la solicitud.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.post('/api/admin/asociados/:id/mas-informacion', requireFunctionality('admin'), requirePermission('asociados.pedir_informacion'), async (req, res) => {
    let connection = null;
    try {
        const { id } = req.params;
        const { observaciones } = req.body;
        const adminId = req.userId;

        if (!observaciones || typeof observaciones !== 'string' || observaciones.trim().length === 0) {
            return res.status(400).json({ error: 'Debes especificar qué información adicional se requiere.' });
        }
        const cleanObs = observaciones.trim();

        const [solRows] = await pool.execute(`
            SELECT s.id, s.usuario_id, s.estatus, u.nombre, u.email
            FROM solicitudes_asociado s
            JOIN usuarios u ON s.usuario_id = u.id
            WHERE s.id = ?
        `, [id]);

        if (solRows.length === 0) {
            return res.status(404).json({ error: 'Solicitud no encontrada.' });
        }

        const sol = solRows[0];

        // Token criptográfico único temporal (7 días) para el portal
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Actualizar solicitud a mas_informacion
        await connection.execute(`
            UPDATE solicitudes_asociado
            SET estatus = 'mas_informacion',
                observaciones = ?,
                usuario_revisor_id = ?,
                fecha_actualizacion = NOW()
            WHERE id = ?
        `, [cleanObs, adminId, id]);

        // 2. Invalidar tokens anteriores de esta solicitud
        await connection.execute('UPDATE tokens_solicitud_asociado SET usado = 1 WHERE solicitud_id = ? AND usado = 0', [id]);

        // 3. Crear nuevo token
        await connection.execute(`
            INSERT INTO tokens_solicitud_asociado (solicitud_id, token_hash, expira_en)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))
        `, [id, tokenHash]);

        // 4. Registrar en historial
        await connection.execute(`
            INSERT INTO historial_solicitudes_asociado (solicitud_id, estatus_anterior, estatus_nuevo, usuario_id, observaciones)
            VALUES (?, ?, 'mas_informacion', ?, ?)
        `, [id, sol.estatus, adminId, cleanObs]);

        await connection.commit();

        // 5. Enviar correo de solicitud de más información
        let emailSent = false;
        let emailWarning = null;
        try {
            await sendAsociadoEmailMasInformacion(sol.email, sol.nombre, cleanObs, token);
            emailSent = true;
        } catch (err) {
            console.error('Error enviando correo de más información para solicitud ID ' + id + ':', err.message);
            emailWarning = 'La solicitud se actualizó a "Más información", pero no se pudo enviar el correo de notificación al solicitante. Por favor verifica la configuración del servidor de correo.';
        }

        if (emailSent) {
            res.status(200).json({ success: true, emailSent: true, message: 'Solicitud de información enviada correctamente al candidato.' });
        } else {
            res.status(200).json({ success: true, emailSent: false, warning: emailWarning, message: 'Solicitud actualizada a más información.' });
        }

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in POST /api/admin/asociados/:id/mas-informacion:', error);
        res.status(500).json({ error: 'Error interno al solicitar más información.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

// =============================================================================
// MÓDULO ASESORÍAS FINANCIERAS - SIMULADOR DE INVERSIONES & CONSOLA FINANZAS
// =============================================================================

// 1. API Pública del Simulador (Usuario autenticado)
app.get('/api/finanzas/simulador', authMiddleware, async (req, res) => {
    try {
        let fecha = req.query.fecha;
        if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            fecha = new Date().toISOString().slice(0, 10);
        }

        // Consultar instituciones activas
        const [instituciones] = await pool.query(
            `SELECT id, nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo
             FROM instituciones_financieras
             WHERE activo = 1
             ORDER BY orden_visual ASC, nombre ASC`
        );

        const resultado = [];

        for (const inst of instituciones) {
            // Consultar esquema vigente para la fecha dada
            const [esquemas] = await pool.query(
                `SELECT id, institucion_id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo
                 FROM institucion_esquemas_tasas
                 WHERE institucion_id = ?
                   AND activo = 1
                   AND fecha_inicio_vigencia <= ?
                   AND (fecha_fin_vigencia IS NULL OR fecha_fin_vigencia >= ?)
                 ORDER BY fecha_inicio_vigencia DESC
                 LIMIT 1`,
                [inst.id, fecha, fecha]
            );

            let esquema = null;
            let autoResumen = null;
            if (esquemas.length > 0) {
                const esq = esquemas[0];
                const [tramos] = await pool.query(
                    `SELECT id, esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo
                     FROM institucion_tramos_tasas
                     WHERE esquema_id = ?
                     ORDER BY numero_tramo ASC`,
                    [esq.id]
                );
                const tramosMapeados = tramos.map(t => ({
                    id: t.id,
                    numero_tramo: t.numero_tramo,
                    limite_inferior: parseFloat(t.limite_inferior),
                    limite_superior: t.limite_superior !== null ? parseFloat(t.limite_superior) : null,
                    tasa_anual: parseFloat(t.tasa_anual),
                    descripcion_tramo: t.descripcion_tramo
                }));
                autoResumen = MotorFinanciero.generarResumenCondiciones(tramosMapeados);
                esquema = {
                    id: esq.id,
                    nombre_esquema: esq.nombre_esquema,
                    fecha_inicio_vigencia: esq.fecha_inicio_vigencia,
                    fecha_fin_vigencia: esq.fecha_fin_vigencia,
                    tramos: tramosMapeados
                };
            }

            // Consultar restricciones activas de la institución para el simulador
            const [restricciones] = await pool.query(
                `SELECT id, institucion_id, descripcion, orden, activo
                 FROM institucion_restricciones
                 WHERE institucion_id = ? AND activo = 1
                 ORDER BY orden ASC, id ASC`,
                [inst.id]
            );

            resultado.push({
                id: inst.id,
                nombre: inst.nombre,
                tipo: inst.tipo,
                descripcion: inst.descripcion,
                condiciones_resumen: autoResumen || inst.condiciones_resumen,
                orden_visual: inst.orden_visual,
                esquema: esquema,
                restricciones: restricciones
            });
        }

        // Consultar estrategias configuradas en BD
        let estrategias = [];
        try {
            const [rowsEstrategias] = await pool.query(
                `SELECT codigo, nombre, color, icono, 
                        CAST(max_concentracion_inst AS DOUBLE) AS max_concentracion_inst,
                        min_instituciones,
                        CAST(max_concentracion_tipo AS DOUBLE) AS max_concentracion_tipo,
                        diversificar_tipos,
                        CAST(asignacion_minima_viable AS DOUBLE) AS asignacion_minima_viable,
                        descripcion_criterio,
                        orden_visual
                 FROM finanzas_estrategias_config
                 WHERE activo = 1
                 ORDER BY orden_visual ASC`
            );
            estrategias = rowsEstrategias;
        } catch (errEst) {
            console.warn('Advertencia al consultar finanzas_estrategias_config:', errEst.message);
        }

        res.json({
            success: true,
            fecha: fecha,
            instituciones: resultado,
            estrategias: estrategias
        });
    } catch (error) {
        console.error('Error in GET /api/finanzas/simulador:', error);
        res.status(500).json({ error: 'Error al consultar el simulador de inversiones.' });
    }
});

// 2. APIs Administrativas (Protegidas por RBAC)
// Listar instituciones completas con todos sus esquemas, tramos y restricciones
app.get('/api/admin/finanzas/instituciones', requireFunctionality('admin'), requirePermission('finanzas.read'), async (req, res) => {
    try {
        const [instituciones] = await pool.query(
            `SELECT id, nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo, created_at, updated_at
             FROM instituciones_financieras
             ORDER BY orden_visual ASC, nombre ASC`
        );

        const resultado = [];
        const hoy = new Date().toISOString().slice(0, 10);
        for (const inst of instituciones) {
            const [esquemas] = await pool.query(
                `SELECT id, institucion_id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo, created_at, updated_at
                 FROM institucion_esquemas_tasas
                 WHERE institucion_id = ?
                 ORDER BY fecha_inicio_vigencia DESC`,
                [inst.id]
            );

            const esquemasConTramos = [];
            for (const esq of esquemas) {
                const [tramos] = await pool.query(
                    `SELECT id, esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo
                     FROM institucion_tramos_tasas
                     WHERE esquema_id = ?
                     ORDER BY numero_tramo ASC`,
                    [esq.id]
                );
                esquemasConTramos.push({
                    ...esq,
                    tramos: tramos.map(t => ({
                        ...t,
                        limite_inferior: parseFloat(t.limite_inferior),
                        limite_superior: t.limite_superior !== null ? parseFloat(t.limite_superior) : null,
                        tasa_anual: parseFloat(t.tasa_anual)
                    }))
                });
            }

            const esqActivo = esquemasConTramos.find(e => e.activo === 1 && (!e.fecha_fin_vigencia || e.fecha_fin_vigencia >= hoy));
            const autoResumen = (esqActivo && esqActivo.tramos && esqActivo.tramos.length > 0)
                ? MotorFinanciero.generarResumenCondiciones(esqActivo.tramos)
                : null;

            // Consultar restricciones de la institución para la administración
            const [restricciones] = await pool.query(
                `SELECT id, institucion_id, descripcion, orden, activo, created_at, updated_at
                 FROM institucion_restricciones
                 WHERE institucion_id = ?
                 ORDER BY orden ASC, id ASC`,
                [inst.id]
            );

            resultado.push({
                ...inst,
                condiciones_resumen: autoResumen || inst.condiciones_resumen,
                esquemas: esquemasConTramos,
                restricciones: restricciones
            });
        }

        res.json({ success: true, instituciones: resultado });
    } catch (error) {
        console.error('Error in GET /api/admin/finanzas/instituciones:', error);
        res.status(500).json({ error: 'Error interno al consultar instituciones financieras.' });
    }
});

// Crear institución financiera (con soporte opcional de esquema y tramos iniciales)
app.post('/api/admin/finanzas/instituciones', requireFunctionality('admin'), requirePermission('finanzas.create'), async (req, res) => {
    let connection;
    try {
        const { nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo, esquema } = req.body;
        if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
            return res.status(400).json({ error: 'El nombre de la institución es obligatorio.' });
        }
        const tipoValido = ['B', 'S', 'F', 'O'].includes(tipo) ? tipo : 'B';
        const orden = parseInt(orden_visual, 10) || 0;
        const estatus = activo === 0 || activo === false ? 0 : 1;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        let resumenFinal = condiciones_resumen || null;
        if (esquema && Array.isArray(esquema.tramos) && esquema.tramos.length > 0) {
            const val = MotorFinanciero.validarTramos(esquema.tramos);
            if (!val.valido) {
                await connection.rollback();
                return res.status(400).json({ error: val.error });
            }
            resumenFinal = MotorFinanciero.generarResumenCondiciones(esquema.tramos);
        }

        const [result] = await connection.query(
            `INSERT INTO instituciones_financieras (nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [nombre.trim(), tipoValido, descripcion || null, resumenFinal, orden, estatus]
        );
        const nuevaInstId = result.insertId;

        if (esquema && Array.isArray(esquema.tramos) && esquema.tramos.length > 0) {
            const fechaInicio = esquema.fecha_inicio_vigencia || new Date().toISOString().slice(0, 10);
            const fechaFin = esquema.fecha_fin_vigencia || null;
            const esqActivo = esquema.activo !== undefined ? (esquema.activo ? 1 : 0) : 1;
            const [resEsq] = await connection.query(
                `INSERT INTO institucion_esquemas_tasas (institucion_id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo)
                 VALUES (?, ?, ?, ?, ?)`,
                [nuevaInstId, (esquema.nombre_esquema || 'General').trim(), fechaInicio, fechaFin, esqActivo]
            );
            const nuevoEsqId = resEsq.insertId;

            for (let i = 0; i < esquema.tramos.length; i++) {
                const t = esquema.tramos[i];
                const inf = parseFloat(t.limite_inferior) || 0;
                const sup = (t.limite_superior !== null && t.limite_superior !== undefined && t.limite_superior !== '')
                    ? parseFloat(t.limite_superior)
                    : null;
                const tasa = parseFloat(t.tasa_anual) || 0;
                await connection.query(
                    `INSERT INTO institucion_tramos_tasas (esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [nuevoEsqId, i + 1, inf, sup, tasa, t.descripcion_tramo || null]
                );
            }
        }

        // Restricciones iniciales si fueron enviadas
        if (Array.isArray(req.body.restricciones)) {
            for (const r of req.body.restricciones) {
                if (r && r.descripcion && typeof r.descripcion === 'string' && r.descripcion.trim()) {
                    await connection.query(
                        `INSERT INTO institucion_restricciones (institucion_id, descripcion, orden, activo)
                         VALUES (?, ?, ?, ?)`,
                        [nuevaInstId, r.descripcion.trim(), parseInt(r.orden, 10) || 1, (r.activo === 0 || r.activo === false) ? 0 : 1]
                    );
                }
            }
        }

        await connection.commit();
        res.status(201).json({
            success: true,
            id: nuevaInstId,
            message: 'Institución financiera creada exitosamente.'
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in POST /api/admin/finanzas/instituciones:', error);
        res.status(500).json({ error: 'Error al registrar la institución financiera.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

// Actualizar institución financiera (con soporte para mantener tasas, esquemas y tramos)
app.put('/api/admin/finanzas/instituciones/:id', requireFunctionality('admin'), requirePermission('finanzas.update'), async (req, res) => {
    let connection;
    try {
        const id = parseInt(req.params.id, 10);
        const { nombre, tipo, descripcion, condiciones_resumen, orden_visual, activo, esquema } = req.body;

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de institución inválido.' });
        }
        if (nombre !== undefined && (!nombre || typeof nombre !== 'string' || !nombre.trim())) {
            return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existente] = await connection.query('SELECT * FROM instituciones_financieras WHERE id = ?', [id]);
        if (existente.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Institución financiera no encontrada.' });
        }

        const current = existente[0];
        let autoResumen = null;

        // Si se envió esquema con tramos
        if (esquema && Array.isArray(esquema.tramos) && esquema.tramos.length > 0) {
            const valTramos = MotorFinanciero.validarTramos(esquema.tramos);
            if (!valTramos.valido) {
                await connection.rollback();
                return res.status(400).json({ error: valTramos.error });
            }

            autoResumen = MotorFinanciero.generarResumenCondiciones(esquema.tramos);
            const fechaInicio = esquema.fecha_inicio_vigencia || new Date().toISOString().slice(0, 10);
            const fechaFin = esquema.fecha_fin_vigencia || null;
            const esqActivo = esquema.activo !== undefined ? (esquema.activo ? 1 : 0) : 1;
            const nombreEsq = (esquema.nombre_esquema || 'General').trim();

            if (esquema.nueva_vigencia || !esquema.id) {
                // Modo nueva vigencia histórica: cerrar esquema previo si procede y crear nuevo
                if (esquema.cerrar_anterior !== false) {
                    const [fechaAnteriorRows] = await connection.query(
                        'SELECT DATE_SUB(?, INTERVAL 1 DAY) as dia_anterior',
                        [fechaInicio]
                    );
                    const diaAnterior = fechaAnteriorRows[0].dia_anterior;
                    await connection.query(
                        `UPDATE institucion_esquemas_tasas
                         SET fecha_fin_vigencia = ?
                         WHERE institucion_id = ?
                           AND fecha_fin_vigencia IS NULL
                           AND fecha_inicio_vigencia < ?
                           AND activo = 1`,
                        [diaAnterior, id, fechaInicio]
                    );
                }

                const [resEsq] = await connection.query(
                    `INSERT INTO institucion_esquemas_tasas (institucion_id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo)
                     VALUES (?, ?, ?, ?, ?)`,
                    [id, nombreEsq, fechaInicio, fechaFin, esqActivo]
                );
                const nuevoEsqId = resEsq.insertId;

                for (let i = 0; i < esquema.tramos.length; i++) {
                    const t = esquema.tramos[i];
                    const inf = parseFloat(t.limite_inferior) || 0;
                    const sup = (t.limite_superior !== null && t.limite_superior !== undefined && t.limite_superior !== '')
                        ? parseFloat(t.limite_superior)
                        : null;
                    const tasa = parseFloat(t.tasa_anual) || 0;
                    await connection.query(
                        `INSERT INTO institucion_tramos_tasas (esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [nuevoEsqId, i + 1, inf, sup, tasa, t.descripcion_tramo || null]
                    );
                }
            } else {
                // Modificar esquema existente
                const esqId = parseInt(esquema.id, 10);
                await connection.query(
                    `UPDATE institucion_esquemas_tasas
                     SET nombre_esquema = ?, fecha_inicio_vigencia = ?, fecha_fin_vigencia = ?, activo = ?
                     WHERE id = ? AND institucion_id = ?`,
                    [nombreEsq, fechaInicio, fechaFin, esqActivo, esqId, id]
                );

                await connection.query('DELETE FROM institucion_tramos_tasas WHERE esquema_id = ?', [esqId]);
                for (let i = 0; i < esquema.tramos.length; i++) {
                    const t = esquema.tramos[i];
                    const inf = parseFloat(t.limite_inferior) || 0;
                    const sup = (t.limite_superior !== null && t.limite_superior !== undefined && t.limite_superior !== '')
                        ? parseFloat(t.limite_superior)
                        : null;
                    const tasa = parseFloat(t.tasa_anual) || 0;
                    await connection.query(
                        `INSERT INTO institucion_tramos_tasas (esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [esqId, i + 1, inf, sup, tasa, t.descripcion_tramo || null]
                    );
                }
            }
        }

        const updateNombre = nombre !== undefined ? nombre.trim() : current.nombre;
        const updateTipo = (tipo && ['B', 'S', 'F', 'O'].includes(tipo)) ? tipo : current.tipo;
        const updateDesc = descripcion !== undefined ? descripcion : current.descripcion;
        const updateCond = autoResumen || (condiciones_resumen !== undefined ? condiciones_resumen : current.condiciones_resumen);
        const updateOrden = orden_visual !== undefined ? parseInt(orden_visual, 10) : current.orden_visual;
        const updateActivo = activo !== undefined ? (activo ? 1 : 0) : current.activo;

        await connection.query(
            `UPDATE instituciones_financieras
             SET nombre = ?, tipo = ?, descripcion = ?, condiciones_resumen = ?, orden_visual = ?, activo = ?
             WHERE id = ?`,
            [updateNombre, updateTipo, updateDesc, updateCond, updateOrden, updateActivo, id]
        );

        // Sincronización de restricciones asociadas si fueron enviadas
        if (Array.isArray(req.body.restricciones)) {
            for (const r of req.body.restricciones) {
                if (r._deleted && r.id) {
                    await connection.query('DELETE FROM institucion_restricciones WHERE id = ? AND institucion_id = ?', [r.id, id]);
                } else if (r.id) {
                    const desc = typeof r.descripcion === 'string' ? r.descripcion.trim() : '';
                    if (desc) {
                        await connection.query(
                            `UPDATE institucion_restricciones 
                             SET descripcion = ?, orden = ?, activo = ? 
                             WHERE id = ? AND institucion_id = ?`,
                            [desc, parseInt(r.orden, 10) || 1, (r.activo === 0 || r.activo === false) ? 0 : 1, r.id, id]
                        );
                    }
                } else if (r.descripcion && typeof r.descripcion === 'string' && r.descripcion.trim()) {
                    await connection.query(
                        `INSERT INTO institucion_restricciones (institucion_id, descripcion, orden, activo) 
                         VALUES (?, ?, ?, ?)`,
                        [id, r.descripcion.trim(), parseInt(r.orden, 10) || 1, (r.activo === 0 || r.activo === false) ? 0 : 1]
                    );
                }
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'Institución, tasas y restricciones actualizadas correctamente.' });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in PUT /api/admin/finanzas/instituciones/:id:', error);
        res.status(500).json({ error: 'Error al actualizar la institución financiera.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

// Desactivar institución financiera (Soft delete seguro)
app.delete('/api/admin/finanzas/instituciones/:id', requireFunctionality('admin'), requirePermission('finanzas.delete'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de institución inválido.' });
        }

        await pool.query('UPDATE instituciones_financieras SET activo = 0 WHERE id = ?', [id]);
        res.json({ success: true, message: 'Institución desactivada exitosamente.' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/finanzas/instituciones/:id:', error);
        res.status(500).json({ error: 'Error al desactivar la institución financiera.' });
    }
});

// ==========================================
// ENDPOINTS REST DEDICADOS PARA RESTRICCIONES
// ==========================================

// Listar restricciones de una institución
app.get('/api/admin/finanzas/instituciones/:id/restricciones', requireFunctionality('admin'), requirePermission('finanzas.read'), async (req, res) => {
    try {
        const instId = parseInt(req.params.id, 10);
        if (isNaN(instId) || instId <= 0) {
            return res.status(400).json({ error: 'ID de institución inválido.' });
        }
        const [rows] = await pool.query(
            `SELECT id, institucion_id, descripcion, activo, orden, created_at, updated_at
             FROM institucion_restricciones
             WHERE institucion_id = ?
             ORDER BY orden ASC, id ASC`,
            [instId]
        );
        res.json({ success: true, restricciones: rows });
    } catch (err) {
        console.error('Error in GET /api/admin/finanzas/instituciones/:id/restricciones:', err);
        res.status(500).json({ error: 'Error al consultar las restricciones.' });
    }
});

// Crear restricción para una institución
app.post('/api/admin/finanzas/instituciones/:id/restricciones', requireFunctionality('admin'), requirePermission('finanzas.create'), async (req, res) => {
    try {
        const instId = parseInt(req.params.id, 10);
        const { descripcion, orden, activo } = req.body;
        if (isNaN(instId) || instId <= 0) {
            return res.status(400).json({ error: 'ID de institución inválido.' });
        }
        if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
            return res.status(400).json({ error: 'La descripción de la restricción es obligatoria.' });
        }

        const ord = parseInt(orden, 10) || 1;
        const act = (activo === 0 || activo === false) ? 0 : 1;

        const [result] = await pool.query(
            `INSERT INTO institucion_restricciones (institucion_id, descripcion, activo, orden)
             VALUES (?, ?, ?, ?)`,
            [instId, descripcion.trim(), act, ord]
        );

        res.status(201).json({
            success: true,
            id: result.insertId,
            message: 'Restricción creada exitosamente.'
        });
    } catch (err) {
        console.error('Error in POST /api/admin/finanzas/instituciones/:id/restricciones:', err);
        res.status(500).json({ error: 'Error al registrar la restricción.' });
    }
});

// Actualizar restricción
app.put('/api/admin/finanzas/restricciones/:id', requireFunctionality('admin'), requirePermission('finanzas.update'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de restricción inválido.' });
        }
        const { descripcion, orden, activo } = req.body;

        const [existing] = await pool.query('SELECT * FROM institucion_restricciones WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Restricción no encontrada.' });
        }
        const cur = existing[0];

        const newDesc = descripcion !== undefined ? descripcion.trim() : cur.descripcion;
        if (!newDesc) {
            return res.status(400).json({ error: 'La descripción no puede estar vacía.' });
        }
        const newOrd = orden !== undefined ? (parseInt(orden, 10) || 1) : cur.orden;
        const newAct = activo !== undefined ? (activo ? 1 : 0) : cur.activo;

        await pool.query(
            `UPDATE institucion_restricciones
             SET descripcion = ?, orden = ?, activo = ?
             WHERE id = ?`,
            [newDesc, newOrd, newAct, id]
        );

        res.json({ success: true, message: 'Restricción actualizada exitosamente.' });
    } catch (err) {
        console.error('Error in PUT /api/admin/finanzas/restricciones/:id:', err);
        res.status(500).json({ error: 'Error al actualizar la restricción.' });
    }
});

// Eliminar / Desactivar restricción
app.delete('/api/admin/finanzas/restricciones/:id', requireFunctionality('admin'), requirePermission('finanzas.delete'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de restricción inválido.' });
        }
        const hard = req.query.hard === 'true';
        if (hard) {
            await pool.query('DELETE FROM institucion_restricciones WHERE id = ?', [id]);
        } else {
            await pool.query('UPDATE institucion_restricciones SET activo = 0 WHERE id = ?', [id]);
        }
        res.json({ success: true, message: 'Restricción eliminada/desactivada exitosamente.' });
    } catch (err) {
        console.error('Error in DELETE /api/admin/finanzas/restricciones/:id:', err);
        res.status(500).json({ error: 'Error al eliminar la restricción.' });
    }
});

// Crear nuevo esquema de tasas y condiciones (con nueva vigencia y tramos)
app.post('/api/admin/finanzas/esquemas', requireFunctionality('admin'), requirePermission('finanzas.create'), async (req, res) => {
    let connection;
    try {
        const { institucion_id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo, cerrar_anterior, tramos } = req.body;

        const instId = parseInt(institucion_id, 10);
        if (isNaN(instId) || instId <= 0) {
            return res.status(400).json({ error: 'Institución financiera requerida.' });
        }

        if (!fecha_inicio_vigencia || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_inicio_vigencia)) {
            return res.status(400).json({ error: 'La fecha inicial de vigencia debe tener formato YYYY-MM-DD.' });
        }

        let fechaFin = null;
        if (fecha_fin_vigencia) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_fin_vigencia)) {
                return res.status(400).json({ error: 'La fecha final de vigencia debe tener formato YYYY-MM-DD.' });
            }
            if (fecha_fin_vigencia < fecha_inicio_vigencia) {
                return res.status(400).json({ error: 'La fecha final no puede ser anterior a la fecha inicial.' });
            }
            fechaFin = fecha_fin_vigencia;
        }

        // Validar coherencia matemática de tramos
        const validacionTramos = MotorFinanciero.validarTramos(tramos);
        if (!validacionTramos.valido) {
            return res.status(400).json({ error: validacionTramos.error });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Si se solicita cerrar el esquema anterior abierto
        if (cerrar_anterior) {
            // Calcular fecha día anterior (usando strings calendario sin timezone)
            const [fechaAnteriorRows] = await connection.query(
                'SELECT DATE_SUB(?, INTERVAL 1 DAY) as dia_anterior',
                [fecha_inicio_vigencia]
            );
            const diaAnterior = fechaAnteriorRows[0].dia_anterior;

            await connection.query(
                `UPDATE institucion_esquemas_tasas
                 SET fecha_fin_vigencia = ?
                 WHERE institucion_id = ?
                   AND fecha_fin_vigencia IS NULL
                   AND fecha_inicio_vigencia < ?
                   AND activo = 1`,
                [diaAnterior, instId, fecha_inicio_vigencia]
            );
        }

        // 2. Verificar que no exista traslape con otro esquema activo
        const [traslapes] = await connection.query(
            `SELECT id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia
             FROM institucion_esquemas_tasas
             WHERE institucion_id = ?
               AND activo = 1
               AND fecha_inicio_vigencia <= ?
               AND (fecha_fin_vigencia IS NULL OR fecha_fin_vigencia >= ?)`,
            [instId, fechaFin || '9999-12-31', fecha_inicio_vigencia]
        );

        if (traslapes.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                error: `Existe otro esquema activo ('${traslapes[0].nombre_esquema}', vigencia: ${traslapes[0].fecha_inicio_vigencia} a ${traslapes[0].fecha_fin_vigencia || 'indefinida'}) con fechas que se traslapan. Cierre el esquema anterior o ajuste las fechas.`
            });
        }

        // 3. Insertar el nuevo esquema
        const estatus = activo === 0 || activo === false ? 0 : 1;
        const [resEsq] = await connection.query(
            `INSERT INTO institucion_esquemas_tasas (institucion_id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo)
             VALUES (?, ?, ?, ?, ?)`,
            [instId, (nombre_esquema || 'General').trim(), fecha_inicio_vigencia, fechaFin, estatus]
        );
        const nuevoEsquemaId = resEsq.insertId;

        // 4. Insertar los tramos
        for (let i = 0; i < tramos.length; i++) {
            const t = tramos[i];
            const inf = parseFloat(t.limite_inferior) || 0;
            const sup = t.limite_superior !== null && t.limite_superior !== undefined && t.limite_superior !== ''
                ? parseFloat(t.limite_superior)
                : null;
            const tasa = parseFloat(t.tasa_anual) || 0;

            await connection.query(
                `INSERT INTO institucion_tramos_tasas (esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nuevoEsquemaId, i + 1, inf, sup, tasa, t.descripcion_tramo || null]
            );
        }

        const resumenAuto = MotorFinanciero.generarResumenCondiciones(tramos);
        await connection.query('UPDATE instituciones_financieras SET condiciones_resumen = ? WHERE id = ?', [resumenAuto, instId]);

        await connection.commit();
        res.status(201).json({
            success: true,
            id: nuevoEsquemaId,
            message: 'Nuevo esquema de inversión y vigencia registrado correctamente.'
        });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in POST /api/admin/finanzas/esquemas:', error);
        res.status(500).json({ error: 'Error al registrar el nuevo esquema de inversión.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

// Modificar esquema y/o actualizar sus tramos
app.put('/api/admin/finanzas/esquemas/:id', requireFunctionality('admin'), requirePermission('finanzas.update'), async (req, res) => {
    let connection;
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de esquema inválido.' });
        }

        const { nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo, tramos } = req.body;

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [existente] = await connection.query('SELECT * FROM institucion_esquemas_tasas WHERE id = ?', [id]);
        if (existente.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Esquema no encontrado.' });
        }

        const current = existente[0];
        const updateNombre = nombre_esquema !== undefined ? nombre_esquema.trim() : current.nombre_esquema;
        const updateInicio = fecha_inicio_vigencia !== undefined ? fecha_inicio_vigencia : current.fecha_inicio_vigencia;
        let updateFin = fecha_fin_vigencia !== undefined ? (fecha_fin_vigencia || null) : current.fecha_fin_vigencia;
        const updateActivo = activo !== undefined ? (activo ? 1 : 0) : current.activo;

        if (updateFin && updateFin < updateInicio) {
            await connection.rollback();
            return res.status(400).json({ error: 'La fecha final no puede ser anterior a la inicial.' });
        }

        // Si se pasan tramos para reemplazar, validarlos
        if (Array.isArray(tramos) && tramos.length > 0) {
            const val = MotorFinanciero.validarTramos(tramos);
            if (!val.valido) {
                await connection.rollback();
                return res.status(400).json({ error: val.error });
            }

            // Eliminar tramos anteriores e insertar los nuevos
            await connection.query('DELETE FROM institucion_tramos_tasas WHERE esquema_id = ?', [id]);
            for (let i = 0; i < tramos.length; i++) {
                const t = tramos[i];
                const inf = parseFloat(t.limite_inferior) || 0;
                const sup = t.limite_superior !== null && t.limite_superior !== undefined && t.limite_superior !== ''
                    ? parseFloat(t.limite_superior)
                    : null;
                const tasa = parseFloat(t.tasa_anual) || 0;

                await connection.query(
                    `INSERT INTO institucion_tramos_tasas (esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, i + 1, inf, sup, tasa, t.descripcion_tramo || null]
                );
            }
        }

        await connection.query(
            `UPDATE institucion_esquemas_tasas
             SET nombre_esquema = ?, fecha_inicio_vigencia = ?, fecha_fin_vigencia = ?, activo = ?
             WHERE id = ?`,
            [updateNombre, updateInicio, updateFin, updateActivo, id]
        );

        if (Array.isArray(tramos) && tramos.length > 0) {
            const resumenAuto = MotorFinanciero.generarResumenCondiciones(tramos);
            await connection.query('UPDATE instituciones_financieras SET condiciones_resumen = ? WHERE id = ?', [resumenAuto, current.institucion_id]);
        }

        await connection.commit();
        res.json({ success: true, message: 'Esquema actualizado correctamente.' });
    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in PUT /api/admin/finanzas/esquemas/:id:', error);
        res.status(500).json({ error: 'Error al actualizar el esquema de inversión.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

// Desactivar esquema (Soft delete)
app.delete('/api/admin/finanzas/esquemas/:id', requireFunctionality('admin'), requirePermission('finanzas.delete'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de esquema inválido.' });
        }

        await pool.query('UPDATE institucion_esquemas_tasas SET activo = 0 WHERE id = ?', [id]);
        res.json({ success: true, message: 'Esquema desactivado correctamente.' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/finanzas/esquemas/:id:', error);
        res.status(500).json({ error: 'Error al desactivar el esquema.' });
    }
});

// 3. APIs Administrativas para Estrategias de Inversión Diversificada
app.get('/api/admin/finanzas/estrategias', requireFunctionality('admin'), requirePermission('finanzas.read'), async (req, res) => {
    try {
        const [estrategias] = await pool.query(
            `SELECT id, codigo, nombre, color, icono, max_concentracion_inst, min_instituciones,
                    max_concentracion_tipo, diversificar_tipos, asignacion_minima_viable,
                    descripcion_criterio, orden_visual, activo, created_at, updated_at
             FROM finanzas_estrategias_config
             ORDER BY orden_visual ASC, id ASC`
        );
        res.json({ estrategias });
    } catch (error) {
        console.error('Error in GET /api/admin/finanzas/estrategias:', error);
        res.status(500).json({ error: 'Error al consultar estrategias de inversión.' });
    }
});

app.put('/api/admin/finanzas/estrategias/:id', requireFunctionality('admin'), requirePermission('finanzas.update'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de estrategia inválido.' });
        }

        const {
            nombre,
            max_concentracion_inst,
            min_instituciones,
            max_concentracion_tipo,
            diversificar_tipos,
            asignacion_minima_viable,
            descripcion_criterio,
            color,
            icono,
            activo
        } = req.body;

        const maxInst = parseFloat(max_concentracion_inst);
        if (isNaN(maxInst) || maxInst <= 0 || maxInst > 100) {
            return res.status(400).json({ error: 'La concentración máxima por institución debe ser un valor entre 1 y 100%.' });
        }

        const minInst = parseInt(min_instituciones, 10);
        if (isNaN(minInst) || minInst < 1) {
            return res.status(400).json({ error: 'El mínimo de instituciones debe ser al menos 1.' });
        }

        const maxTipo = (max_concentracion_tipo !== null && max_concentracion_tipo !== undefined && max_concentracion_tipo !== '')
            ? parseFloat(max_concentracion_tipo)
            : null;

        const asigMin = parseFloat(asignacion_minima_viable) || 1000;
        const divTipos = diversificar_tipos ? 1 : 0;
        const act = (activo === undefined || activo === null || activo == 1) ? 1 : 0;

        await pool.query(
            `UPDATE finanzas_estrategias_config
             SET nombre = COALESCE(?, nombre),
                 max_concentracion_inst = ?,
                 min_instituciones = ?,
                 max_concentracion_tipo = ?,
                 diversificar_tipos = ?,
                 asignacion_minima_viable = ?,
                 descripcion_criterio = COALESCE(?, descripcion_criterio),
                 color = COALESCE(?, color),
                 icono = COALESCE(?, icono),
                 activo = ?,
                 updated_at = NOW()
             WHERE id = ?`,
            [
                nombre ? String(nombre).trim() : null,
                maxInst,
                minInst,
                maxTipo,
                divTipos,
                asigMin,
                descripcion_criterio ? String(descripcion_criterio).trim() : null,
                color ? String(color).trim() : null,
                icono ? String(icono).trim() : null,
                act,
                id
            ]
        );

        res.json({ success: true, message: 'Estrategia de inversión actualizada exitosamente.' });
    } catch (error) {
        console.error('Error in PUT /api/admin/finanzas/estrategias/:id:', error);
        res.status(500).json({ error: 'Error al actualizar la estrategia de inversión.' });
    }
});

// =========================================================================
// 4. APIs Administrativas para Contexto de Idealita (ai_contexto - FASE 1)
// =========================================================================

const requireContextoFunctionality = async (req, res, next) => {
    try {
        if (!req.userId) {
            const token = (req.cookies && req.cookies.auth_token) || (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
            if (!token) {
                return res.status(401).json({ error: 'No autorizado. Token no proporcionado.', code: 'AUTH_REQUIRED' });
            }
            const decoded = await verifyToken(token, pool);
            req.userId = decoded.id;
            req.user = decoded;
        }

        const hasContexto = await checkUserFunctionalityAccess(pool, req.userId, 'contexto_idealita');
        const hasAdmin = await checkUserFunctionalityAccess(pool, req.userId, 'administracion');
        if (!hasContexto && !hasAdmin) {
            return res.status(403).json({
                error: 'Acceso no autorizado o vencido para esta funcionalidad.',
                code: 'RBAC_ACCESS_DENIED',
                funcionalidad: 'contexto_idealita'
            });
        }
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.message === 'Token revocado' || error.message === 'Usuario no encontrado' || error.message === 'Usuario inactivo') {
            return res.status(401).json({ error: 'Token inválido o expirado.', code: 'AUTH_REQUIRED' });
        }
        return res.status(500).json({ error: 'Error interno del servidor al verificar acceso.' });
    }
};

// Listar contextos con filtros y búsqueda
app.get('/api/admin/contexto', requireContextoFunctionality, requirePermission('contexto.read'), async (req, res) => {
    try {
        const { categoria, activo, busqueda } = req.query;
        let query = 'SELECT id, categoria, titulo, contenido, prioridad, activo, version, created_at, updated_at FROM ai_contexto WHERE 1=1';
        const params = [];

        if (activo !== undefined && activo !== '' && activo !== 'todos') {
            query += ' AND activo = ?';
            params.push(activo === '1' || activo === 1 || activo === 'true' ? 1 : 0);
        }

        if (categoria && categoria.trim() !== '' && categoria !== 'todas') {
            query += ' AND categoria = ?';
            params.push(categoria.trim());
        }

        if (busqueda && busqueda.trim() !== '') {
            query += ' AND (titulo LIKE ? OR contenido LIKE ? OR categoria LIKE ?)';
            const wildcard = `%${busqueda.trim()}%`;
            params.push(wildcard, wildcard, wildcard);
        }

        query += ' ORDER BY prioridad DESC, updated_at DESC';

        const [contextos] = await pool.query(query, params);

        // Consultar categorías distintas para poblar filtros/selectores
        const [catRows] = await pool.query('SELECT DISTINCT categoria FROM ai_contexto WHERE categoria IS NOT NULL AND categoria != "" ORDER BY categoria ASC');
        const dbCategories = catRows.map(r => r.categoria);
        const defaultCategories = ['General', 'Idealandia', 'Idealita', 'Reglas', 'Ideas', 'Finanzas', 'Pensiones', 'Asociados', 'Servicios', 'Administración'];
        const allCategories = Array.from(new Set([...defaultCategories, ...dbCategories]));

        res.json({ success: true, contextos, categorias: allCategories });
    } catch (error) {
        console.error('Error in GET /api/admin/contexto:', error);
        res.status(500).json({ error: 'Error al consultar el contexto de Idealita.' });
    }
});

// Obtener categorías disponibles
app.get('/api/admin/contexto/categorias', requireContextoFunctionality, requirePermission('contexto.read'), async (req, res) => {
    try {
        const [catRows] = await pool.query('SELECT DISTINCT categoria FROM ai_contexto WHERE categoria IS NOT NULL AND categoria != "" ORDER BY categoria ASC');
        const dbCategories = catRows.map(r => r.categoria);
        const defaultCategories = ['General', 'Idealandia', 'Idealita', 'Reglas', 'Ideas', 'Finanzas', 'Pensiones', 'Asociados', 'Servicios', 'Administración'];
        const allCategories = Array.from(new Set([...defaultCategories, ...dbCategories]));
        res.json({ success: true, categorias: allCategories });
    } catch (error) {
        console.error('Error in GET /api/admin/contexto/categorias:', error);
        res.status(500).json({ error: 'Error al consultar categorías.' });
    }
});

// Obtener un contexto por ID
app.get('/api/admin/contexto/:id', requireContextoFunctionality, requirePermission('contexto.read'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

        const [rows] = await pool.query('SELECT id, categoria, titulo, contenido, prioridad, activo, version, created_at, updated_at FROM ai_contexto WHERE id = ?', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Registro de contexto no encontrado.' });

        res.json({ success: true, contexto: rows[0] });
    } catch (error) {
        console.error('Error in GET /api/admin/contexto/:id:', error);
        res.status(500).json({ error: 'Error al obtener el registro de contexto.' });
    }
});

// Crear nuevo contexto
app.post('/api/admin/contexto', requireContextoFunctionality, requirePermission('contexto.create'), async (req, res) => {
    try {
        const { categoria, titulo, contenido, prioridad, activo } = req.body;

        if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
            return res.status(400).json({ error: 'El título es obligatorio.' });
        }
        if (!contenido || typeof contenido !== 'string' || contenido.trim() === '') {
            return res.status(400).json({ error: 'El contenido es obligatorio.' });
        }

        const catLimpia = (categoria && typeof categoria === 'string' && categoria.trim() !== '') ? categoria.trim() : 'General';
        const titLimpio = titulo.trim();
        const prio = Number.isInteger(parseInt(prioridad, 10)) ? parseInt(prioridad, 10) : 100;
        const act = (activo === 0 || activo === false || activo === '0') ? 0 : 1;

        const [result] = await pool.query(
            `INSERT INTO ai_contexto (categoria, titulo, contenido, prioridad, activo, version)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [catLimpia, titLimpio, contenido, prio, act]
        );

        const newId = result.insertId;
        const [rows] = await pool.query('SELECT id, categoria, titulo, contenido, prioridad, activo, version, created_at, updated_at FROM ai_contexto WHERE id = ?', [newId]);

        res.status(201).json({ success: true, message: 'Contexto creado exitosamente.', contexto: rows[0] });
    } catch (error) {
        console.error('Error in POST /api/admin/contexto:', error);
        res.status(500).json({ error: 'Error al crear el registro de contexto.' });
    }
});

// Editar contexto existente
app.put('/api/admin/contexto/:id', requireContextoFunctionality, requirePermission('contexto.update'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

        const { categoria, titulo, contenido, prioridad, activo } = req.body;

        if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
            return res.status(400).json({ error: 'El título es obligatorio.' });
        }
        if (!contenido || typeof contenido !== 'string' || contenido.trim() === '') {
            return res.status(400).json({ error: 'El contenido es obligatorio.' });
        }

        // Consultar registro actual para verificar si hubo cambio de contenido e incrementar versión
        const [current] = await pool.query('SELECT id, contenido, version FROM ai_contexto WHERE id = ?', [id]);
        if (current.length === 0) return res.status(404).json({ error: 'Registro de contexto no encontrado.' });

        const catLimpia = (categoria && typeof categoria === 'string' && categoria.trim() !== '') ? categoria.trim() : 'General';
        const titLimpio = titulo.trim();
        const prio = Number.isInteger(parseInt(prioridad, 10)) ? parseInt(prioridad, 10) : 100;
        const act = (activo === 0 || activo === false || activo === '0') ? 0 : 1;

        // Si el contenido fue modificado, incrementar la versión automáticamente
        const contenidoModificado = current[0].contenido !== contenido;
        const nuevaVersion = contenidoModificado ? (current[0].version + 1) : current[0].version;

        await pool.query(
            `UPDATE ai_contexto 
             SET categoria = ?, titulo = ?, contenido = ?, prioridad = ?, activo = ?, version = ?
             WHERE id = ?`,
            [catLimpia, titLimpio, contenido, prio, act, nuevaVersion, id]
        );

        const [rows] = await pool.query('SELECT id, categoria, titulo, contenido, prioridad, activo, version, created_at, updated_at FROM ai_contexto WHERE id = ?', [id]);

        res.json({ success: true, message: 'Contexto actualizado exitosamente.', contexto: rows[0], versionIncrementada: contenidoModificado });
    } catch (error) {
        console.error('Error in PUT /api/admin/contexto/:id:', error);
        res.status(500).json({ error: 'Error al actualizar el registro de contexto.' });
    }
});

// Alternar estatus activo/inactivo
app.patch('/api/admin/contexto/:id/toggle', requireContextoFunctionality, requirePermission('contexto.update'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

        const [current] = await pool.query('SELECT id, activo FROM ai_contexto WHERE id = ?', [id]);
        if (current.length === 0) return res.status(404).json({ error: 'Registro de contexto no encontrado.' });

        let nuevoActivo;
        if (req.body && req.body.activo !== undefined) {
            nuevoActivo = (req.body.activo === 1 || req.body.activo === true || req.body.activo === '1') ? 1 : 0;
        } else {
            nuevoActivo = current[0].activo === 1 ? 0 : 1;
        }

        await pool.query('UPDATE ai_contexto SET activo = ? WHERE id = ?', [nuevoActivo, id]);

        res.json({ success: true, message: `Contexto ${nuevoActivo === 1 ? 'activado' : 'desactivado'} exitosamente.`, activo: nuevoActivo });
    } catch (error) {
        console.error('Error in PATCH /api/admin/contexto/:id/toggle:', error);
        res.status(500).json({ error: 'Error al cambiar estatus del contexto.' });
    }
});

// Eliminar contexto
app.delete('/api/admin/contexto/:id', requireContextoFunctionality, requirePermission('contexto.delete'), async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

        const [current] = await pool.query('SELECT id, titulo FROM ai_contexto WHERE id = ?', [id]);
        if (current.length === 0) return res.status(404).json({ error: 'Registro de contexto no encontrado.' });

        await pool.query('DELETE FROM ai_contexto WHERE id = ?', [id]);

        res.json({ success: true, message: `Contexto "${current[0].titulo}" eliminado exitosamente.` });
    } catch (error) {
        console.error('Error in DELETE /api/admin/contexto/:id:', error);
        res.status(500).json({ error: 'Error al eliminar el registro de contexto.' });
    }
});

app.get('/api/ideas', requireFunctionality('ideas'), requirePermission('ideas.read'), async (req, res) => {
    try {
        const usuario_id = req.userId;

        let query = 'SELECT id, usuario_id, titulo, descripcion, estado, fecha, privacidad, modalidad, version_actual, fecha_actualizacion FROM ideas WHERE usuario_id = ?';
        const params = [usuario_id];

        // Filtro opcional por estado con adaptador de compatibilidad
        if (req.query.estado && typeof req.query.estado === 'string') {
            const normalizedState = normalizeIdeaEstado(req.query.estado);
            if (normalizedState) {
                const legacyState = toLegacyIdeaEstado(normalizedState);
                if (legacyState !== normalizedState) {
                    query += ' AND (estado = ? OR estado = ?)';
                    params.push(normalizedState, legacyState);
                } else {
                    query += ' AND estado = ?';
                    params.push(normalizedState);
                }
            }
        }

        // Filtro opcional por búsqueda de texto
        if (req.query.q && typeof req.query.q === 'string' && req.query.q.trim() !== '') {
            const searchTerm = `%${req.query.q.trim()}%`;
            query += ' AND (titulo LIKE ? OR descripcion LIKE ?)';
            params.push(searchTerm, searchTerm);
        }

        query += ' ORDER BY fecha DESC';

        const [ideas] = await pool.execute(query, params);

        res.status(200).json({ ideas });
    } catch (error) {
        console.error('Error in /api/ideas (GET):', error);
        res.status(500).json({ error: 'Error al obtener ideas.' });
    }
});

app.post('/api/ideas', requireFunctionality('ideas'), requirePermission('ideas.create'), async (req, res) => {
    let connection;
    try {
        const usuario_id = req.userId;

        let { titulo, descripcion, estado, privacidad, modalidad } = req.body;

        // 1. Validación estricta de título
        if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
            return res.status(400).json({ error: 'El título es obligatorio y no puede estar vacío.' });
        }

        titulo = titulo.trim();
        if (titulo.length > 200) {
            return res.status(400).json({ error: 'El título no puede exceder los 200 caracteres.' });
        }

        // 2. Validación de descripción
        if (descripcion !== undefined && descripcion !== null) {
            if (typeof descripcion !== 'string') {
                return res.status(400).json({ error: 'La descripción debe ser texto.' });
            }
            descripcion = descripcion.trim();
        } else {
            descripcion = null;
        }

        // 3. Validación estricta de estado al crear (F4.2)
        // La Idea siempre nace como 'semilla'. Solo se acepta 'semilla' o el alias temporal 'pendiente'.
        if (estado !== undefined && estado !== null && String(estado).trim() !== '') {
            const cleanEstado = String(estado).trim().toLowerCase();
            if (cleanEstado === 'semilla' || cleanEstado === 'pendiente') {
                estado = 'semilla';
            } else {
                return res.status(400).json({ error: 'Toda nueva idea debe iniciar en estado semilla.' });
            }
        } else {
            estado = 'semilla';
        }

        // 4. Validación de privacidad (catálogo cerrado)
        const validPrivacidad = ['privada', 'compartida', 'publica'];
        if (privacidad !== undefined && privacidad !== null && String(privacidad).trim() !== '') {
            const cleanPriv = String(privacidad).trim().toLowerCase();
            if (!validPrivacidad.includes(cleanPriv)) {
                return res.status(400).json({ error: 'Valor de privacidad inválido.' });
            }
            privacidad = cleanPriv;
        } else {
            privacidad = 'privada';
        }

        // 5. Validación de modalidad (catálogo cerrado)
        const validModalidad = ['individual', 'colaborativa', 'busco_inversion', 'busco_mentoria', 'busco_apoyo'];
        if (modalidad !== undefined && modalidad !== null && String(modalidad).trim() !== '') {
            const cleanMod = String(modalidad).trim().toLowerCase();
            if (!validModalidad.includes(cleanMod)) {
                return res.status(400).json({ error: 'Valor de modalidad inválido.' });
            }
            modalidad = cleanMod;
        } else {
            modalidad = 'individual';
        }

        // 6. Transacción atómica de creación: ideas + idea_desarrollo + idea_historial
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.execute(
            'INSERT INTO ideas (usuario_id, titulo, descripcion, estado, privacidad, modalidad, version_actual) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [usuario_id, titulo, descripcion, 'semilla', privacidad, modalidad, 0]
        );
        const ideaId = result.insertId;

        // Fila 1:1 en idea_desarrollo
        await connection.execute(
            'INSERT INTO idea_desarrollo (idea_id, moneda) VALUES (?, ?)',
            [ideaId, 'MXN']
        );

        // Registro de auditoría inicial en idea_historial
        const datosHistorial = JSON.stringify({
            origen: 'api_post',
            privacidad,
            modalidad
        });
        await connection.execute(
            'INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos) VALUES (?, ?, ?, ?, ?)',
            [ideaId, usuario_id, 'creacion', 'Idea creada en estado semilla', datosHistorial]
        );

        await connection.commit();

        res.status(201).json({
            message: 'Idea creada exitosamente.',
            id: ideaId,
            estado: 'semilla',
            privacidad,
            modalidad,
            version_actual: 0
        });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in /api/ideas (POST):', error);
        res.status(500).json({ error: 'Error interno del servidor al crear la idea.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.get('/api/ideas/catalogos', requireFunctionality('ideas'), requirePermission('ideas.read'), async (req, res) => {
    try {
        const [propositos] = await pool.execute(
            'SELECT id, clave, nombre, descripcion, icono, orden, activo FROM idea_propositos WHERE activo = ? ORDER BY orden ASC, id ASC',
            [1]
        );

        const [categorias] = await pool.execute(
            'SELECT id, clave, nombre, descripcion, icono, orden, activo FROM categorias_idea WHERE activo = ? ORDER BY orden ASC, id ASC',
            [1]
        );

        res.status(200).json({
            categorias,
            propositos,
            privacidad: IDEAS_PRIVACIDADES_CATALOGO,
            modalidades: IDEAS_MODALIDADES_CATALOGO,
            estados: IDEAS_ESTADOS_CATALOGO
        });
    } catch (error) {
        console.error('Error in /api/ideas/catalogos (GET):', error);
        res.status(500).json({ error: 'Error al obtener catálogos de ideas.' });
    }
});

/**
 * Obtiene de forma centralizada y segura el contexto autorizado de una Idea.
 * Valida formato numérico estricto de ID, existencia de la Idea, pertenencia (ownership) y reglas de privacidad (anti-IDOR).
 * Carga 1:1 el desarrollo (Canvas), los propósitos y las categorías asociadas.
 *
 * @param {Object} connectionPool - Pool de conexiones MySQL
 * @param {number} ideaId - Identificador numérico de la Idea
 * @param {number} userId - Identificador del usuario autenticado que solicita
 * @returns {Promise<{ authorized: boolean, status?: number, message?: string, context?: Object }>}
 */
async function getAuthorizedIdeaContext(connectionPool, ideaId, userId) {
    if (!Number.isSafeInteger(ideaId) || ideaId <= 0) {
        return {
            authorized: false,
            status: 400,
            message: 'ID de idea inválido.'
        };
    }

    const [ideaRows] = await connectionPool.execute(
        `SELECT id, usuario_id, titulo, descripcion, estado, fecha, privacidad, modalidad, version_actual, fecha_actualizacion
         FROM ideas
         WHERE id = ?`,
        [ideaId]
    );

    if (ideaRows.length === 0) {
        return {
            authorized: false,
            status: 404,
            message: 'Idea no encontrada o no autorizada.'
        };
    }

    const idea = ideaRows[0];

    const isOwner = (idea.usuario_id === userId);
    if (!isOwner && idea.privacidad !== 'publica') {
        return {
            authorized: false,
            status: 404,
            message: 'Idea no encontrada o no autorizada.'
        };
    }

    const [desRows] = await connectionPool.execute(
        `SELECT problema, solucion, beneficiarios, recursos, inversion_estimada, moneda, complejidad, potencial, riesgos, notas, fecha_actualizacion
         FROM idea_desarrollo
         WHERE idea_id = ?`,
        [ideaId]
    );
    const desarrollo = desRows.length > 0 ? desRows[0] : null;

    const [propositos] = await connectionPool.execute(
        `SELECT p.id, p.clave, p.nombre, p.descripcion, p.icono, p.orden, p.activo
         FROM idea_propositos p
         JOIN idea_proposito_rel r ON p.id = r.proposito_id
         WHERE r.idea_id = ?
         ORDER BY p.orden ASC, p.id ASC`,
        [ideaId]
    );

    const [categorias] = await connectionPool.execute(
        `SELECT c.id, c.clave, c.nombre, c.descripcion, c.icono, c.orden, c.activo
         FROM categorias_idea c
         JOIN idea_categorias ic ON c.id = ic.categoria_id
         WHERE ic.idea_id = ?
         ORDER BY c.orden ASC, c.id ASC`,
        [ideaId]
    );

    return {
        authorized: true,
        context: {
            idea: {
                id: idea.id,
                usuario_id: idea.usuario_id,
                titulo: idea.titulo,
                descripcion: idea.descripcion,
                estado: normalizeIdeaEstado(idea.estado),
                privacidad: idea.privacidad,
                modalidad: idea.modalidad,
                version_actual: idea.version_actual,
                fecha: idea.fecha,
                fecha_actualizacion: idea.fecha_actualizacion
            },
            desarrollo,
            categorias,
            propositos,
            isOwner
        }
    };
}

app.get('/api/ideas/:id', requireFunctionality('ideas'), requirePermission('ideas.read'), async (req, res) => {
    try {
        const usuario_id = req.userId;
        const id = Number(req.params.id);

        const authResult = await getAuthorizedIdeaContext(pool, id, usuario_id);
        if (!authResult.authorized) {
            return res.status(authResult.status).json({ error: authResult.message });
        }

        const { idea, desarrollo, categorias, propositos } = authResult.context;

        res.status(200).json({
            idea,
            desarrollo,
            categorias,
            propositos
        });

    } catch (error) {
        console.error('Error in /api/ideas/:id (GET):', error);
        res.status(500).json({ error: 'Error interno del servidor al obtener la idea.' });
    }
});

app.delete('/api/ideas/:id', requireFunctionality('ideas'), requirePermission('ideas.delete'), async (req, res) => {
    try {
        const usuario_id = req.userId;
        const id = Number(req.params.id);

        // 1. Validación numérica estricta de ID (rechaza abc, 1abc, 1.5, 0, -1, etc.)
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        // 2. Consultar existencia y ownership de la idea (mitigación anti-IDOR)
        const [rows] = await pool.execute(
            'SELECT id, usuario_id, estado FROM ideas WHERE id = ?',
            [id]
        );

        if (rows.length === 0 || rows[0].usuario_id !== usuario_id) {
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        const idea = rows[0];

        // 3. Regla fundamental F4.3: solo se permite eliminación física si estado es 'semilla' (o alias legacy 'pendiente')
        if (idea.estado !== 'semilla' && idea.estado !== 'pendiente') {
            return res.status(400).json({ error: 'Solo las ideas en estado semilla pueden eliminarse.' });
        }

        // 4. Eliminación física (cascada automática hacia satélites por FK ON DELETE CASCADE)
        await pool.execute('DELETE FROM ideas WHERE id = ?', [id]);

        res.status(200).json({ message: 'Idea eliminada correctamente.' });

    } catch (error) {
        console.error('Error in /api/ideas/:id (DELETE):', error);
        res.status(500).json({ error: 'Error interno del servidor al eliminar la idea.' });
    }
});

app.put('/api/ideas/:id/estado', requireFunctionality('ideas'), requirePermission('ideas.update'), async (req, res) => {
    let connection;
    try {
        const usuario_id = req.userId;
        const id = Number(req.params.id);

        // 1. Validación numérica estricta de ID
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        // 2. Validación de entrada del estado solicitado
        let { estado, motivo_cambio } = req.body;
        if (!estado || typeof estado !== 'string' || estado.trim() === '') {
            return res.status(400).json({ error: 'El estado destino es obligatorio.' });
        }

        const destinoOficial = normalizeIdeaEstado(estado);
        if (!destinoOficial) {
            return res.status(400).json({ error: 'Estado inválido.' });
        }

        if (motivo_cambio !== undefined && motivo_cambio !== null) {
            if (typeof motivo_cambio !== 'string') {
                return res.status(400).json({ error: 'El motivo de cambio debe ser texto.' });
            }
            motivo_cambio = motivo_cambio.trim().substring(0, 255);
        } else {
            motivo_cambio = null;
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 3. Consultar la idea con lock FOR UPDATE para evitar colisiones concurrentes
        const [rows] = await connection.execute(
            'SELECT id, usuario_id, titulo, descripcion, estado, version_actual FROM ideas WHERE id = ? FOR UPDATE',
            [id]
        );

        if (rows.length === 0 || rows[0].usuario_id !== usuario_id) {
            await connection.rollback();
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        const idea = rows[0];
        const estadoActual = normalizeIdeaEstado(idea.estado);

        // Si ya se encuentra en el estado solicitado, responder sin cambios (idempotencia)
        if (estadoActual === destinoOficial) {
            await connection.rollback();
            return res.status(200).json({
                message: 'La idea ya se encuentra en el estado solicitado.',
                estado: destinoOficial,
                version_actual: idea.version_actual
            });
        }

        // 4. Validar transición contra la máquina de estados oficial
        const transicionesPermitidas = IDEAS_TRANSICIONES_VALIDAS[estadoActual] || [];
        if (!transicionesPermitidas.includes(destinoOficial)) {
            await connection.rollback();
            return res.status(400).json({
                error: `Transición no permitida: no se puede pasar de '${estadoActual}' a '${destinoOficial}'.`
            });
        }

        let nuevaVersionActual = idea.version_actual;

        // 5. TRANSICIÓN ESPECIAL: semilla -> en_desarrollo (Generación de Versión 1)
        if (estadoActual === 'semilla' && destinoOficial === 'en_desarrollo') {
            // Protección contra doble creación: solo crear versión 1 si version_actual === 0 y no existe versión 1
            if (idea.version_actual === 0) {
                const [existVer1] = await connection.execute(
                    'SELECT id FROM idea_versiones WHERE idea_id = ? AND numero_version = 1',
                    [id]
                );

                if (existVer1.length === 0) {
                    // Obtener datos actuales de idea_desarrollo
                    const [desRows] = await connection.execute(
                        'SELECT problema, solucion FROM idea_desarrollo WHERE idea_id = ?',
                        [id]
                    );
                    const problema = desRows.length > 0 ? desRows[0].problema : null;
                    const solucion = desRows.length > 0 ? desRows[0].solucion : null;

                    // A. Insertar snapshot formal en idea_versiones (Versión 1)
                    await connection.execute(
                        `INSERT INTO idea_versiones (
                            idea_id, numero_version, titulo, descripcion, problema, solucion, usuario_id, motivo_cambio, fecha_creacion
                        ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, NOW())`,
                        [
                            id,
                            idea.titulo,
                            idea.descripcion,
                            problema,
                            solucion,
                            usuario_id,
                            motivo_cambio || 'Consolidación inicial: transición automática a desarrollo'
                        ]
                    );

                    // Registrar evento de nueva versión en idea_historial
                    await connection.execute(
                        `INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos)
                        VALUES (?, ?, 'nueva_version', 'Versión 1 consolidada automáticamente al iniciar desarrollo', ?)`,
                        [
                            id,
                            usuario_id,
                            JSON.stringify({ version: 1, origen: 'transicion_semilla_a_en_desarrollo' })
                        ]
                    );
                }

                nuevaVersionActual = 1;
            }

            // B. Actualizar estado y version_actual en ideas
            await connection.execute(
                'UPDATE ideas SET estado = ?, version_actual = ? WHERE id = ?',
                [destinoOficial, nuevaVersionActual, id]
            );

            // C. Registrar evento de cambio de estado en idea_historial
            await connection.execute(
                `INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos)
                VALUES (?, ?, 'cambio_estado', 'Cambio de estado de semilla a en_desarrollo', ?)`,
                [
                    id,
                    usuario_id,
                    JSON.stringify({
                        estado_anterior: estadoActual,
                        estado_nuevo: destinoOficial,
                        motivo: motivo_cambio || null,
                        version_generada: nuevaVersionActual
                    })
                ]
            );

        } else {
            // 6. OTRAS TRANSICIONES: actualizan estado e historial, SIN alterar version_actual ni crear versiones
            await connection.execute(
                'UPDATE ideas SET estado = ? WHERE id = ?',
                [destinoOficial, id]
            );

            const descEvento = destinoOficial === 'archivada'
                ? `Idea archivada desde ${estadoActual}`
                : `Cambio de estado de ${estadoActual} a ${destinoOficial}`;

            await connection.execute(
                `INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos)
                VALUES (?, ?, 'cambio_estado', ?, ?)`,
                [
                    id,
                    usuario_id,
                    descEvento,
                    JSON.stringify({
                        estado_anterior: estadoActual,
                        estado_nuevo: destinoOficial,
                        motivo: motivo_cambio || null
                    })
                ]
            );
        }

        await connection.commit();

        res.status(200).json({
            message: 'Estado actualizado correctamente.',
            estado_anterior: estadoActual,
            nuevo_estado: destinoOficial,
            version_actual: nuevaVersionActual
        });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in /api/ideas/:id/estado (PUT):', error);
        res.status(500).json({ error: 'Error interno del servidor al actualizar el estado.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.put('/api/ideas/:id/desarrollo', requireFunctionality('ideas'), requirePermission('ideas.update'), async (req, res) => {
    let connection;
    try {
        const usuario_id = req.userId;
        const id = Number(req.params.id);

        // 1. Validación numérica estricta de ID
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        // 2. Validación de cuerpo de solicitud
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(400).json({ error: 'El cuerpo de la solicitud debe ser un objeto.' });
        }

        // 3. Campos permitidos del canvas y validación de tipos
        const allowedTextFields = ['problema', 'solucion', 'beneficiarios', 'recursos', 'riesgos', 'notas'];
        const cleanedValues = {};
        const camposModificados = [];

        // Validar campos de texto largos
        for (const field of allowedTextFields) {
            if (field in req.body) {
                const val = req.body[field];
                if (val === null) {
                    cleanedValues[field] = null;
                } else if (typeof val === 'string') {
                    const trimmed = val.trim();
                    if (trimmed.length > 65535) {
                        return res.status(400).json({ error: `El campo ${field} excede la longitud máxima permitida.` });
                    }
                    cleanedValues[field] = trimmed;
                } else {
                    return res.status(400).json({ error: `El campo ${field} debe ser texto o null.` });
                }
                camposModificados.push(field);
            }
        }

        // Validar complejidad (varchar 20)
        if ('complejidad' in req.body) {
            const val = req.body.complejidad;
            if (val === null) {
                cleanedValues.complejidad = null;
            } else if (typeof val === 'string') {
                const trimmed = val.trim();
                if (trimmed.length > 20) {
                    return res.status(400).json({ error: 'El campo complejidad no puede exceder 20 caracteres.' });
                }
                cleanedValues.complejidad = trimmed;
            } else {
                return res.status(400).json({ error: 'El campo complejidad debe ser texto o null.' });
            }
            camposModificados.push('complejidad');
        }

        // Validar potencial (varchar 20)
        if ('potencial' in req.body) {
            const val = req.body.potencial;
            if (val === null) {
                cleanedValues.potencial = null;
            } else if (typeof val === 'string') {
                const trimmed = val.trim();
                if (trimmed.length > 20) {
                    return res.status(400).json({ error: 'El campo potencial no puede exceder 20 caracteres.' });
                }
                cleanedValues.potencial = trimmed;
            } else {
                return res.status(400).json({ error: 'El campo potencial debe ser texto o null.' });
            }
            camposModificados.push('potencial');
        }

        // Validar inversion_estimada (decimal 12,2 o null)
        if ('inversion_estimada' in req.body) {
            const val = req.body.inversion_estimada;
            if (val === null) {
                cleanedValues.inversion_estimada = null;
            } else {
                if (typeof val === 'boolean' || typeof val === 'object' || Array.isArray(val)) {
                    return res.status(400).json({ error: 'El campo inversion_estimada debe ser numérico o null.' });
                }
                const num = Number(val);
                if (isNaN(num) || !Number.isFinite(num) || num < 0 || num > 9999999999.99) {
                    return res.status(400).json({ error: 'El campo inversion_estimada debe ser un número positivo válido (máximo 12 dígitos).' });
                }
                cleanedValues.inversion_estimada = Math.round(num * 100) / 100;
            }
            camposModificados.push('inversion_estimada');
        }

        // Validar moneda (varchar 3, exactamente 3 letras ISO)
        if ('moneda' in req.body) {
            const val = req.body.moneda;
            if (typeof val !== 'string') {
                return res.status(400).json({ error: 'El campo moneda debe ser texto de 3 caracteres.' });
            }
            const cleanMoneda = val.trim().toUpperCase();
            if (!/^[A-Z]{3}$/.test(cleanMoneda)) {
                return res.status(400).json({ error: 'El campo moneda debe contener exactamente 3 letras (ej. MXN, USD).' });
            }
            cleanedValues.moneda = cleanMoneda;
            camposModificados.push('moneda');
        }

        // Comprobar que al menos un campo editable fue enviado
        if (camposModificados.length === 0) {
            return res.status(400).json({ error: 'No se enviaron campos válidos para actualizar el canvas.' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 4. Consultar existencia y propiedad de la idea (mitigación anti-IDOR)
        const [ideaRows] = await connection.execute(
            'SELECT id, usuario_id, estado, version_actual FROM ideas WHERE id = ?',
            [id]
        );

        if (ideaRows.length === 0 || ideaRows[0].usuario_id !== usuario_id) {
            await connection.rollback();
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        const idea = ideaRows[0];

        // 5. Verificar existencia del registro 1:1 en idea_desarrollo
        const [desCheck] = await connection.execute(
            'SELECT idea_id FROM idea_desarrollo WHERE idea_id = ?',
            [id]
        );

        if (desCheck.length === 0) {
            await connection.rollback();
            return res.status(500).json({ error: 'Registro de desarrollo no encontrado para la idea.' });
        }

        // 6. Construir dinámicamente la actualización parcial segura
        const updateClauses = [];
        const updateParams = [];

        for (const field of camposModificados) {
            updateClauses.push(`${field} = ?`);
            updateParams.push(cleanedValues[field]);
        }

        updateClauses.push('fecha_actualizacion = NOW()');
        updateParams.push(id);

        await connection.execute(
            `UPDATE idea_desarrollo SET ${updateClauses.join(', ')} WHERE idea_id = ?`,
            updateParams
        );

        // 7. Registro de auditoría ligero en idea_historial (sin duplicar contenido completo)
        const datosHistorial = JSON.stringify({
            campos_modificados: camposModificados
        });

        await connection.execute(
            `INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos)
             VALUES (?, ?, 'actualizacion', 'Actualización del canvas de desarrollo', ?)`,
            [id, usuario_id, datosHistorial]
        );

        // 8. Consultar canvas actualizado para responder al cliente
        const [desRows] = await connection.execute(
            `SELECT problema, solucion, beneficiarios, recursos, inversion_estimada, moneda, complejidad, potencial, riesgos, notas, fecha_actualizacion
             FROM idea_desarrollo
             WHERE idea_id = ?`,
            [id]
        );

        await connection.commit();

        res.status(200).json({
            message: 'Canvas de desarrollo actualizado correctamente.',
            idea: {
                id: idea.id,
                estado: normalizeIdeaEstado(idea.estado),
                version_actual: idea.version_actual
            },
            desarrollo: desRows[0]
        });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in /api/ideas/:id/desarrollo (PUT):', error);
        res.status(500).json({ error: 'Error interno del servidor al actualizar el canvas de desarrollo.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.post('/api/ideas/:id/versiones', requireFunctionality('ideas'), requirePermission('ideas.update'), async (req, res) => {
    let connection;
    try {
        const usuario_id = req.userId;
        const id = Number(req.params.id);

        // 1. Validación numérica estricta de ID
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        // 2. Validación del motivo de cambio
        let { motivo_cambio } = req.body || {};
        if (motivo_cambio !== undefined && motivo_cambio !== null) {
            if (typeof motivo_cambio !== 'string') {
                return res.status(400).json({ error: 'El motivo de cambio debe ser texto.' });
            }
            motivo_cambio = motivo_cambio.trim().substring(0, 255);
            if (motivo_cambio.length === 0) {
                motivo_cambio = null;
            }
        } else {
            motivo_cambio = null;
        }
        const finalMotivo = motivo_cambio || 'Consolidación formal de versión';

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 3. Obtener idea con lock pesimista FOR UPDATE
        const [ideaRows] = await connection.execute(
            'SELECT id, usuario_id, titulo, descripcion, estado, version_actual FROM ideas WHERE id = ? FOR UPDATE',
            [id]
        );

        if (ideaRows.length === 0 || ideaRows[0].usuario_id !== usuario_id) {
            await connection.rollback();
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        const idea = ideaRows[0];
        const estadoActual = normalizeIdeaEstado(idea.estado);

        // 4. Estados permitidos: en_desarrollo, en_validacion, lista, en_accion (rechaza semilla, realizada, archivada)
        const estadosPermitidos = ['en_desarrollo', 'en_validacion', 'lista', 'en_accion'];
        if (!estadosPermitidos.includes(estadoActual)) {
            await connection.rollback();
            return res.status(400).json({
                error: `No se pueden crear versiones formales en estado '${estadoActual}'. Solo se permite en: ${estadosPermitidos.join(', ')}.`
            });
        }

        // 5. Determinar siguiente número de versión con lock de concurrencia
        const [maxVerRows] = await connection.execute(
            'SELECT COALESCE(MAX(numero_version), 0) AS max_version FROM idea_versiones WHERE idea_id = ? FOR UPDATE',
            [id]
        );
        const siguienteVersion = maxVerRows[0].max_version + 1;

        // 6. Obtener datos actuales de idea_desarrollo para el snapshot formal
        const [desRows] = await connection.execute(
            'SELECT problema, solucion FROM idea_desarrollo WHERE idea_id = ?',
            [id]
        );
        const problema = desRows.length > 0 ? desRows[0].problema : null;
        const solucion = desRows.length > 0 ? desRows[0].solucion : null;

        // 7. Insertar snapshot inmutable en idea_versiones
        const [insertVer] = await connection.execute(
            `INSERT INTO idea_versiones (
                idea_id, numero_version, titulo, descripcion, problema, solucion, usuario_id, motivo_cambio, fecha_creacion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                id,
                siguienteVersion,
                idea.titulo,
                idea.descripcion,
                problema,
                solucion,
                usuario_id,
                finalMotivo
            ]
        );
        const versionId = insertVer.insertId;

        // 8. Actualizar version_actual en ideas
        await connection.execute(
            'UPDATE ideas SET version_actual = ?, fecha_actualizacion = NOW() WHERE id = ?',
            [siguienteVersion, id]
        );

        // 9. Registrar auditoría ligera en idea_historial
        await connection.execute(
            `INSERT INTO idea_historial (idea_id, usuario_id, tipo_evento, descripcion, datos)
             VALUES (?, ?, 'nueva_version', ?, ?)`,
            [
                id,
                usuario_id,
                `Versión ${siguienteVersion} consolidada formalmente`,
                JSON.stringify({
                    version: siguienteVersion,
                    motivo: finalMotivo
                })
            ]
        );

        await connection.commit();

        res.status(201).json({
            message: 'Versión formal creada exitosamente.',
            version: {
                id: versionId,
                idea_id: id,
                numero_version: siguienteVersion,
                titulo: idea.titulo,
                descripcion: idea.descripcion,
                problema,
                solucion,
                usuario_id,
                motivo_cambio: finalMotivo
            },
            idea: {
                id,
                version_actual: siguienteVersion
            }
        });

    } catch (error) {
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
        }
        console.error('Error in /api/ideas/:id/versiones (POST):', error);
        res.status(500).json({ error: 'Error interno del servidor al crear la versión.' });
    } finally {
        if (connection) {
            try { connection.release(); } catch (_) {}
        }
    }
});

app.get('/api/ideas/:id/versiones', requireFunctionality('ideas'), requirePermission('ideas.read'), async (req, res) => {
    try {
        const usuario_id = req.userId;
        const id = Number(req.params.id);

        // 1. Validación numérica estricta de ID
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        // 2. Comprobar existencia, propiedad y privacidad
        const [ideaRows] = await pool.execute(
            'SELECT id, usuario_id, privacidad, version_actual FROM ideas WHERE id = ?',
            [id]
        );

        if (ideaRows.length === 0) {
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        const idea = ideaRows[0];
        const isOwner = (idea.usuario_id === usuario_id);

        if (!isOwner && idea.privacidad !== 'publica') {
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        // 3. Consultar versiones históricas ordenadas ascendentemente por número de versión
        const [versiones] = await pool.execute(
            `SELECT id, idea_id, numero_version, titulo, descripcion, problema, solucion, usuario_id, motivo_cambio, fecha_creacion
             FROM idea_versiones
             WHERE idea_id = ?
             ORDER BY numero_version ASC`,
            [id]
        );

        res.status(200).json({
            idea_id: id,
            version_actual: idea.version_actual,
            total_versiones: versiones.length,
            versiones
        });

    } catch (error) {
        console.error('Error in /api/ideas/:id/versiones (GET):', error);
        res.status(500).json({ error: 'Error interno del servidor al obtener las versiones.' });
    }
});

app.get('/api/ideas/:id/historial', requireFunctionality('ideas'), requirePermission('ideas.read'), async (req, res) => {
    try {
        const usuario_id = req.userId;
        const id = Number(req.params.id);

        // 1. Validación numérica estricta de ID
        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        // 2. Comprobar existencia, propiedad y privacidad de la idea
        const [ideaRows] = await pool.execute(
            'SELECT id, usuario_id, privacidad FROM ideas WHERE id = ?',
            [id]
        );

        if (ideaRows.length === 0) {
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        const idea = ideaRows[0];
        const isOwner = (idea.usuario_id === usuario_id);

        // Reglas de privacidad idénticas a F4.6 y F4.8:
        // - 'privada': Solo propietario (terceros reciben 404 anti-IDOR).
        // - 'compartida': Solo propietario en esta fase (terceros reciben 404).
        // - 'publica': Cualquier usuario autenticado con permiso 'ideas.read'.
        if (!isOwner && idea.privacidad !== 'publica') {
            return res.status(404).json({ error: 'Idea no encontrada o no autorizada.' });
        }

        // 3. Consultar eventos del historial en orden cronológico consistente
        const [eventos] = await pool.execute(
            `SELECT id, idea_id, usuario_id, tipo_evento, descripcion, datos, fecha
             FROM idea_historial
             WHERE idea_id = ?
             ORDER BY fecha ASC, id ASC`,
            [id]
        );

        // Formatear datos JSON de manera segura y estructurada
        const historialFormateado = eventos.map(e => ({
            id: e.id,
            idea_id: e.idea_id,
            usuario_id: e.usuario_id,
            tipo_evento: e.tipo_evento,
            descripcion: e.descripcion,
            datos: typeof e.datos === 'string' ? JSON.parse(e.datos) : (e.datos || null),
            fecha: e.fecha
        }));

        res.status(200).json({
            idea_id: id,
            total_eventos: historialFormateado.length,
            historial: historialFormateado
        });

    } catch (error) {
        console.error('Error in /api/ideas/:id/historial (GET):', error);
        res.status(500).json({ error: 'Error interno del servidor al obtener el historial de la idea.' });
    }
});

app.post('/api/ideas/:id/motores/:motor', requireFunctionality('ideas'), requirePermission('ideas.use_ai'), async (req, res) => {
    try {
        const userId = req.userId;
        const ideaId = Number(req.params.id);
        const motorKey = String(req.params.motor || '').toLowerCase().trim();

        // 1. Validación estricta del ID
        if (!Number.isSafeInteger(ideaId) || ideaId <= 0) {
            return res.status(400).json({ error: 'ID de idea inválido.' });
        }

        // 2. Validar que el motor solicitado exista en el registro
        const engine = getEngine(motorKey);
        if (!engine) {
            return res.status(404).json({
                error: `El motor '${motorKey}' no está disponible o no existe.`,
                disponibles: listAvailableEngines().map(e => e.type)
            });
        }

        // 3. Obtener contexto autorizado (respetando ownership, privacidad y anti-IDOR)
        const authResult = await getAuthorizedIdeaContext(pool, ideaId, userId);
        if (!authResult.authorized) {
            return res.status(authResult.status).json({ error: authResult.message });
        }

        const { idea, desarrollo, propositos, categorias } = authResult.context;

        // 4. Ejecutar el motor con IA (recibe contexto autorizado sin mutar datos de la idea)
        const engineResult = await engine.run({
            pool,
            ai,
            idea,
            canvas: desarrollo,
            propositos,
            categorias,
            inputs: req.body?.inputs || {},
            userId,
            versionIdea: idea.version_actual || 0
        });

        // 5. Respuesta estructurada
        res.status(200).json({
            success: true,
            motor: engine.type,
            motor_nombre: engine.displayName,
            idea_id: idea.id,
            version_idea: engineResult.versionIdea,
            analisis_id: engineResult.analisisId,
            resumen: engineResult.resumen,
            resultado: engineResult.output,
            fecha: engineResult.fecha
        });

    } catch (error) {
        console.error('Error in /api/ideas/:id/motores/:motor (POST):', error);
        res.status(500).json({
            error: error.message || 'Error interno al procesar el análisis con el motor de ideas.'
        });
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
        assignDefaultUserRole,
        assignRoleByName,
        sendAsociadoEmailVerificacion,
        sendAsociadoEmailAutorizado,
        sendAsociadoEmailRechazado,
        sendAsociadoEmailMasInformacion,
        extractTextFromPdfBuffer,
        extractAseguradoInfo,
        extractTotalSemanasFromIMSSDocument,
        parseIMSSWithGemini,
        requireFunctionality,
        FUNCIONALIDAD_CODE_ALIASES,
        IDEAS_ESTADOS_OFICIALES,
        IDEAS_ESTADOS_LEGADOS_MAP,
        IDEAS_OFICIAL_A_LEGADO_MAP,
        normalizeIdeaEstado,
        isValidIdeaEstado,
        toLegacyIdeaEstado,
        IDEAS_TRANSICIONES_VALIDAS,
        isValidIdeaTransition,
        IDEAS_PRIVACIDADES_CATALOGO,
        IDEAS_MODALIDADES_CATALOGO,
        IDEAS_ESTADOS_CATALOGO,
        getAuthorizedIdeaContext
    };
}

