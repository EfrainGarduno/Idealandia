// =============================================================================
// Test Suite Integral: Funcionalidad de Asociados en Idealandia
// Cobertura:
//  1. Verificación de catálogo de servicios (9 servicios físicos en MySQL)
//  2. Regresión 0: Registro de Usuario estándar (rol: usuario, activo: 1, sin solicitud)
//  3. Registro de Asociado con catálogo y con opción 999 'Otros' (rol: Asociado, activo: 0)
//  4. Bloqueo de inicio de sesión para Asociado inactivo (403)
//  5. Verificación de correo: token 10 min, de un solo uso, NO activa la cuenta
//  6. Protección RBAC en consola de administración
//  7. Acciones administrativas:
//     - Rechazar (con observaciones obligatorias)
//     - Solicitar más información (token 7 días) y actualización desde portal de candidato
//     - Autorizar (requiere correo validado -> activa cuenta -> login exitoso)
//  8. Validaciones de interfaz y UX en index.html con JSDOM
// =============================================================================

require('dotenv').config();
const PORT = 3099;
process.env.PORT = String(PORT);

const assert = require('assert');
const http = require('http');
const mysql = require('mysql2/promise');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// Reutilizamos el servidor Express de server.js (escucha en PORT 3099)
const serverExports = require('./server');
const app = serverExports.app;

let pool;
let adminToken = '';
let adminUserId = null;

const testPrefix = `test_asoc_${Date.now()}`;
const createdUserIds = [];

// Helper para hacer peticiones HTTP
function request(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        if (payload) {
            options.headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request(options, (res) => {
            let resData = '';
            res.on('data', chunk => { resData += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(resData);
                } catch (_) {
                    parsed = resData;
                }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: parsed
                });
            });
        });

        req.on('error', reject);

        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function runTests() {
    console.log('================================================================');
    console.log('🚀 INICIANDO PRUEBAS AUTOMATIZADAS DE LA FUNCIONALIDAD ASOCIADOS');
    console.log('================================================================\n');

    // 1. Conexión a Base de Datos
    pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia_dev',
        waitForConnections: true,
        connectionLimit: 5
    });

    // Pausa breve para arranque
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log(`✓ Servidor de pruebas iniciado en puerto ${PORT}`);

    try {
        // Obtener usuario administrador existente para pruebas de RBAC
        const [adminRows] = await pool.query(
            `SELECT u.id, u.usuario FROM usuarios u
             INNER JOIN usuario_roles ur ON u.id = ur.usuario_id
             INNER JOIN roles r ON ur.rol_id = r.id
             WHERE r.nombre = 'administrador' AND u.activo = 1 LIMIT 1`
        );
        assert(adminRows.length > 0, 'Debe existir al menos un usuario administrador activo en la BD');
        adminUserId = adminRows[0].id;
        const adminUsername = adminRows[0].usuario;

        // Generar token para admin usando jwt firmado con AUTH_SECRET
        adminToken = jwt.sign(
            { id: adminUserId, usuario: adminUsername, rol: 'administrador', jwt_version: 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );
        console.log(`✓ Contexto admin autenticado obtenido (ID: ${adminUserId}, Usuario: ${adminUsername})`);

        // ---------------------------------------------------------------------
        // TEST 1: Catálogo de Servicios
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 1: Catálogo de Servicios físicos en MySQL ---');
        const resServicios = await request('GET', '/api/servicios');
        assert.strictEqual(resServicios.status, 200);
        const serviciosList = Array.isArray(resServicios.body) ? resServicios.body : (resServicios.body && resServicios.body.servicios);
        assert(Array.isArray(serviciosList), 'Debe retornar un array de servicios');
        assert.strictEqual(serviciosList.length, 9, 'Debe haber exactamente 9 servicios en el catálogo');

        const servicioOtros = serviciosList.find(s => s.id === 999);
        assert(servicioOtros, 'El servicio con ID 999 debe existir en MySQL');
        assert.strictEqual(servicioOtros.nombre, 'Otros');
        console.log('✓ GET /api/servicios retorna los 9 servicios requeridos incluyendo ID 999 ("Otros").');

        // ---------------------------------------------------------------------
        // TEST 2: Regresión Cero - Registro de Usuario Normal
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 2: Regresión Cero - Registro de Usuario Regular ---');
        const normalUser = `${testPrefix}_usr`;
        const resRegNormal = await request('POST', '/api/register', {
            usuario: normalUser,
            password: 'Password1!',
            'password-rep': 'Password1!',
            nombre: 'Usuario Normal Prueba',
            correo: `${normalUser}@test.idealandia.com`,
            telefono: '+524421234567',
            tipo_registro: 'usuario'
        });

        assert.strictEqual(resRegNormal.status, 201, `Registro normal falló: ${JSON.stringify(resRegNormal.body)}`);
        
        // Verificar en BD que rol sea 'usuario' y activo = 1
        const [usrRows] = await pool.query(
            `SELECT u.id, u.usuario, u.activo, r.nombre AS rol_nombre
             FROM usuarios u
             LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
             LEFT JOIN roles r ON ur.rol_id = r.id
             WHERE u.usuario = ?`,
            [normalUser]
        );
        assert.strictEqual(usrRows.length, 1);
        createdUserIds.push(usrRows[0].id);
        assert.strictEqual(usrRows[0].activo, 1, 'Usuario regular debe estar activo inmediatamente');
        assert.strictEqual(usrRows[0].rol_nombre, 'usuario', 'Usuario regular debe tener rol "usuario"');

        // Verificar que NO existe solicitud de asociado
        const [solRowsNormal] = await pool.query('SELECT * FROM solicitudes_asociado WHERE usuario_id = ?', [usrRows[0].id]);
        assert.strictEqual(solRowsNormal.length, 0, 'Usuario regular no debe tener registro en solicitudes_asociado');

        // Verificar que puede iniciar sesión de inmediato
        const resLoginNormal = await request('POST', '/api/login', {
            usuario: normalUser,
            password: 'Password1!'
        });
        assert.strictEqual(resLoginNormal.status, 200, 'Usuario regular debe poder loguearse de inmediato');
        assert.strictEqual(resLoginNormal.body.message, 'Login exitoso.');
        assert(resLoginNormal.body.user, 'Debe devolver datos del usuario');
        const setCookieHeader = resLoginNormal.headers['set-cookie'] || [];
        const hasAuthCookie = Array.isArray(setCookieHeader) 
            ? setCookieHeader.some(c => c.includes('auth_token=')) 
            : typeof setCookieHeader === 'string' && setCookieHeader.includes('auth_token=');
        assert(hasAuthCookie, 'Debe establecer la cookie auth_token');
        console.log('✓ Registro normal opera con 0 regresión (rol "usuario", activo = 1, login inmediato exitoso).');

        // ---------------------------------------------------------------------
        // TEST 3: Registro de Asociado - Validaciones de Backend
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 3: Registro de Asociado - Validaciones en Backend ---');
        
        // 3.1 Falta servicio_id
        const resVal1 = await request('POST', '/api/register', {
            usuario: `${testPrefix}_inv1`,
            password: 'Password1!',
            'password-rep': 'Password1!',
            nombre: 'Asociado Invalido 1',
            correo: `${testPrefix}_inv1@test.com`,
            telefono: '+524421234567',
            tipo_registro: 'asociado',
            descripcion_servicio: 'Descripcion suficientemente larga para pasar'
        });
        assert.strictEqual(resVal1.status, 400);
        assert(resVal1.body.error.includes('servicio válido'));
        console.log('✓ Validación rechaza registro sin servicio_id.');

        // 3.2 Servicio 999 sin nombre personalizado (servicio_otro)
        const resVal2 = await request('POST', '/api/register', {
            usuario: `${testPrefix}_inv2`,
            password: 'Password1!',
            'password-rep': 'Password1!',
            nombre: 'Asociado Invalido 2',
            correo: `${testPrefix}_inv2@test.com`,
            telefono: '+524421234567',
            tipo_registro: 'asociado',
            servicio_id: 999,
            servicio_otro: '   ',
            descripcion_servicio: 'Descripcion suficientemente larga para pasar'
        });
        assert.strictEqual(resVal2.status, 400);
        assert(resVal2.body.error.includes('especificar el nombre'));
        console.log('✓ Validación rechaza servicio 999 ("Otros") con nombre vacío o solo espacios.');

        // 3.3 Falta descripción detallada o muy corta
        const resVal3 = await request('POST', '/api/register', {
            usuario: `${testPrefix}_inv3`,
            password: 'Password1!',
            'password-rep': 'Password1!',
            nombre: 'Asociado Invalido 3',
            correo: `${testPrefix}_inv3@test.com`,
            telefono: '+524421234567',
            tipo_registro: 'asociado',
            servicio_id: 1,
            descripcion_servicio: 'corta'
        });
        assert.strictEqual(resVal3.status, 400);
        assert(resVal3.body.error.includes('al menos 10 caracteres'));
        console.log('✓ Validación rechaza descripción de servicio menor a 10 caracteres.');

        // ---------------------------------------------------------------------
        // TEST 4: Registro Exitoso de Asociado (Catálogo y Opción 999)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 4: Registro Transaccional de Asociados ---');
        
        // 4.1 Asociado A (Servicio de catálogo #1)
        const asocUserA = `${testPrefix}_asoc_a`;
        const resRegAsocA = await request('POST', '/api/register', {
            usuario: asocUserA,
            password: 'Password1!',
            'password-rep': 'Password1!',
            nombre: 'Asociado Clases Ingles',
            correo: `${asocUserA}@test.idealandia.com`,
            telefono: '+524421234567',
            tipo_registro: 'asociado',
            servicio_id: 1,
            descripcion_servicio: 'Clases particulares de inglés de negocios y preparación TOEFL.'
        });
        assert.strictEqual(resRegAsocA.status, 201);
        
        // Verificar en BD que el usuario tenga rol 'Asociado' y activo = 0
        const [asocARows] = await pool.query(
            `SELECT u.id, u.usuario, u.activo, r.nombre AS rol_nombre
             FROM usuarios u
             LEFT JOIN usuario_roles ur ON u.id = ur.usuario_id
             LEFT JOIN roles r ON ur.rol_id = r.id
             WHERE u.usuario = ?`,
            [asocUserA]
        );
        assert.strictEqual(asocARows.length, 1);
        const asocAId = asocARows[0].id;
        createdUserIds.push(asocAId);
        assert.strictEqual(asocARows[0].activo, 0, 'Asociado recién registrado debe tener activo = 0');
        assert.strictEqual(asocARows[0].rol_nombre, 'Asociado', 'Debe tener rol "Asociado"');

        // Verificar solicitud
        const [solARows] = await pool.query('SELECT * FROM solicitudes_asociado WHERE usuario_id = ?', [asocAId]);
        assert.strictEqual(solARows.length, 1);
        const solA = solARows[0];
        assert.strictEqual(solA.estatus, 'por_aprobar');
        assert.strictEqual(solA.servicio_id, 1);
        assert.strictEqual(solA.nombre_servicio_otro, null);

        // Verificar historial
        const [histARows] = await pool.query('SELECT * FROM historial_solicitudes_asociado WHERE solicitud_id = ?', [solA.id]);
        assert.strictEqual(histARows.length, 1);
        assert.strictEqual(histARows[0].estatus_nuevo, 'por_aprobar');

        // Verificar token de verificación de correo
        const [verifARows] = await pool.query('SELECT * FROM verificaciones_correo WHERE usuario_id = ?', [asocAId]);
        assert.strictEqual(verifARows.length, 1);
        const verifRecordA = verifARows[0];
        assert.strictEqual(verifRecordA.usado, 0);
        // Expiración calculada en 10 minutos
        const diffMin = (new Date(verifRecordA.expira_en).getTime() - new Date(verifRecordA.creado_en).getTime()) / (60 * 1000);
        assert(Math.round(diffMin) >= 9 && Math.round(diffMin) <= 11, 'Token debe expirar en aprox 10 minutos');
        console.log('✓ Asociado A creado transaccionalmente (rol "Asociado", inactivo, solicitud "por_aprobar", token 10 min).');

        // 4.2 Asociado B (Servicio 999 "Otros")
        const asocUserB = `${testPrefix}_asoc_b`;
        const resRegAsocB = await request('POST', '/api/register', {
            usuario: asocUserB,
            password: 'Password1!',
            'password-rep': 'Password1!',
            nombre: 'Asociado Desarrollo Software',
            correo: `${asocUserB}@test.idealandia.com`,
            telefono: '+524429876543',
            tipo_registro: 'asociado',
            servicio_id: 999,
            servicio_otro: 'Desarrollo de Software a la Medida',
            descripcion_servicio: 'Creación de aplicaciones web, móviles y arquitecturas escalables.'
        });
        assert.strictEqual(resRegAsocB.status, 201);
        const [asocBRows] = await pool.query('SELECT id, activo FROM usuarios WHERE usuario = ?', [asocUserB]);
        const asocBId = asocBRows[0].id;
        createdUserIds.push(asocBId);

        const [solBRows] = await pool.query('SELECT * FROM solicitudes_asociado WHERE usuario_id = ?', [asocBId]);
        assert.strictEqual(solBRows[0].servicio_id, 999);
        assert.strictEqual(solBRows[0].nombre_servicio_otro, 'Desarrollo de Software a la Medida');
        console.log('✓ Asociado B con servicio 999 ("Otros") guarda correctamente nombre_servicio_otro.');

        // ---------------------------------------------------------------------
        // TEST 5: Bloqueo de Login para Asociado Inactivo
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 5: Bloqueo de Login para Asociado Inactivo ---');
        const resLoginInactivo = await request('POST', '/api/login', {
            usuario: asocUserA,
            password: 'Password1!'
        });
        console.log('Login Inactivo status:', resLoginInactivo.status, 'body:', resLoginInactivo.body);
        assert.strictEqual(resLoginInactivo.status, 403, 'Usuario inactivo debe recibir 403');
        assert(resLoginInactivo.body.error.toLowerCase().includes('inactiv') || resLoginInactivo.body.error.toLowerCase().includes('pendiente'), 'Mensaje debe indicar usuario inactivo');
        console.log('✓ Asociado inactivo no puede iniciar sesión (recibe HTTP 403 "Usuario inactivo").');

        // ---------------------------------------------------------------------
        // TEST 6: Flujo de Verificación de Correo (10 minutos, un solo uso)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 6: Validación de Correo Electrónico ---');
        
        // 6.1 Token inexistente o inválido
        const resVerifInvalido = await request('GET', '/api/asociados/verificar-correo?token=token_falso_123');
        assert(resVerifInvalido.status === 400 || resVerifInvalido.status === 404, 'Token inexistente debe retornar 400 o 404');
        assert(resVerifInvalido.body.error.includes('inválido') || resVerifInvalido.body.error.includes('no existe'));
        console.log('✓ Enlace con token inválido es rechazado.');

        // 6.2 Token expirado (simulamos expiración actualizando expira_en en BD)
        await pool.query(
            'UPDATE verificaciones_correo SET expira_en = DATE_SUB(NOW(), INTERVAL 5 MINUTE) WHERE id = ?',
            [verifRecordA.id]
        );
        const resVerifExpirado = await request('GET', `/api/asociados/verificar-correo?token=${verifRecordA.token_hash}`);
        assert.strictEqual(resVerifExpirado.status, 400);
        assert(resVerifExpirado.body.error.includes('expirado'));
        console.log('✓ Token expirado (>10 min) es rechazado.');

        // Restaurar token a fecha válida para probar validación exitosa
        await pool.query(
            'UPDATE verificaciones_correo SET expira_en = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?',
            [verifRecordA.id]
        );
        const resVerifExito = await request('GET', `/api/asociados/verificar-correo?token=${verifRecordA.token_hash}`);
        assert.strictEqual(resVerifExito.status, 200);
        assert.strictEqual(resVerifExito.body.success, true);
        assert(resVerifExito.body.message.includes('validado'));

        // REGLA CRÍTICA: Validar correo NO activa la cuenta
        const [asocAPostVerif] = await pool.query('SELECT activo FROM usuarios WHERE id = ?', [asocAId]);
        assert.strictEqual(asocAPostVerif[0].activo, 0, 'IMPORTANTE: Validar correo NO debe activar la cuenta de usuario');
        console.log('✓ Validación de correo exitosa. CRUCIAL: El usuario permanece con activo = 0.');

        // 6.3 Reutilización del token (no se permite)
        const resVerifReuso = await request('GET', `/api/asociados/verificar-correo?token=${verifRecordA.token_hash}`);
        assert.strictEqual(resVerifReuso.status, 400);
        assert(resVerifReuso.body.error.includes('ya no es válido') || resVerifReuso.body.error.includes('utilizado'));
        console.log('✓ Token ya utilizado no puede ser reutilizado.');

        // ---------------------------------------------------------------------
        // TEST 7: Consola de Administración y RBAC
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 7: Consola de Administración y Seguridad RBAC ---');
        
        // 7.1 Petición sin token -> 401
        const resSinToken = await request('GET', '/api/admin/asociados');
        assert.strictEqual(resSinToken.status, 401);

        // 7.2 Petición con token de usuario regular -> 403
        const userRegularToken = jwt.sign(
            { id: usrRows[0].id, usuario: normalUser, rol: 'usuario', jwt_version: 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );
        const resUsuarioRegular = await request('GET', '/api/admin/asociados', null, {
            'Authorization': `Bearer ${userRegularToken}`
        });
        assert.strictEqual(resUsuarioRegular.status, 403);
        console.log('✓ Endpoints /api/admin/asociados debidamente protegidos por RBAC (401 y 403).');

        // 7.3 Administrador consulta lista de asociados
        const resAdminList = await request('GET', '/api/admin/asociados', null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(resAdminList.status, 200);
        const solicitudesList = Array.isArray(resAdminList.body) ? resAdminList.body : (resAdminList.body && resAdminList.body.solicitudes);
        assert(Array.isArray(solicitudesList), 'Debe retornar array de solicitudes');
        assert(solicitudesList.some(s => s.id === solA.id));

        // 7.4 Detalle de solicitud
        const resAdminDetalle = await request('GET', `/api/admin/asociados/${solA.id}`, null, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(resAdminDetalle.status, 200);
        assert.strictEqual(resAdminDetalle.body.solicitud.usuario_id, asocAId);
        assert.strictEqual(resAdminDetalle.body.solicitud.correo_validado, 1);
        assert(Array.isArray(resAdminDetalle.body.historial));
        console.log('✓ Administrador visualiza lista y detalle de solicitudes con historial y estado de correo.');

        // ---------------------------------------------------------------------
        // TEST 8: Flujo Más Información, Envío de Correo y Portal del Candidato
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 8: Solicitud de Más Información, Envío de Correo y Portal del Candidato ---');
        
        // 8.1 Sin observaciones obligatorias -> 400
        const resMasInfoSinObs = await request('POST', `/api/admin/asociados/${solA.id}/mas-informacion`, {
            observaciones: '   '
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert.strictEqual(resMasInfoSinObs.status, 400);
        console.log('✓ Pedir más información exige observaciones obligatorias.');

        // Configurar mock mail transporter para verificar que se envía el correo
        const sentEmails = [];
        serverExports.initMailTransporter({
            sendMail: async (mailOptions) => {
                sentEmails.push(mailOptions);
                return { messageId: 'mock-mail-id-123' };
            }
        });

        // 8.2 Con observaciones y correo exitoso -> pasa a mas_informacion, genera token y envía correo
        const resMasInfoExito = await request('POST', `/api/admin/asociados/${solA.id}/mas-informacion`, {
            observaciones: 'Por favor adjunta tu experiencia docente previa en clases de inglés.'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert.strictEqual(resMasInfoExito.status, 200);
        assert.strictEqual(resMasInfoExito.body.emailSent, true, 'Debe indicar que el correo fue enviado exitosamente');
        assert(sentEmails.length > 0, 'Debe haber ejecutado sendMail');
        const lastEmail = sentEmails[sentEmails.length - 1];
        assert.strictEqual(lastEmail.to, `${asocUserA}@test.idealandia.com`);
        assert(lastEmail.subject.includes('información adicional'));
        console.log('✓ "Pedir más información" envía el correo al solicitante con las observaciones y token seguro.');

        // Obtener el token generado en tokens_solicitud_asociado
        const [tokenRows] = await pool.query(
            'SELECT * FROM tokens_solicitud_asociado WHERE solicitud_id = ? AND usado = 0 ORDER BY id DESC LIMIT 1',
            [solA.id]
        );
        assert.strictEqual(tokenRows.length, 1);
        const candidateToken = tokenRows[0].token_hash;

        // Candidato consulta su solicitud vía portal sin login
        const resPortalGet = await request('GET', `/api/asociados/solicitud/${candidateToken}`);
        assert.strictEqual(resPortalGet.status, 200);
        assert.strictEqual(resPortalGet.body.solicitud.estatus, 'mas_informacion');
        assert(resPortalGet.body.solicitud.observaciones.includes('experiencia docente'));

        // Candidato actualiza su información (Ciclo 1)
        const resPortalPost = await request('POST', '/api/asociados/solicitud/actualizar', {
            token: candidateToken,
            servicio_id: 1,
            descripcion_servicio: 'Clases particulares de inglés avanzado. Cuento con 5 años de experiencia y certificación C2.'
        });
        assert.strictEqual(resPortalPost.status, 200);

        // Verificar que la solicitud regresó a 'por_aprobar' y el token se consumió
        const [solAPostUpdate] = await pool.query('SELECT estatus, descripcion_servicio FROM solicitudes_asociado WHERE id = ?', [solA.id]);
        assert.strictEqual(solAPostUpdate[0].estatus, 'por_aprobar');
        assert(solAPostUpdate[0].descripcion_servicio.includes('certificación C2'));
        console.log('✓ Portal del candidato permite subsanar observaciones y reactiva solicitud a "por_aprobar".');

        // 8.3 Ciclo 2 de "Más Información" (iteración repetida sin romper el flujo)
        const resMasInfoCiclo2 = await request('POST', `/api/admin/asociados/${solA.id}/mas-informacion`, {
            observaciones: 'Por favor aclara si las clases son presenciales o en línea.'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert.strictEqual(resMasInfoCiclo2.status, 200);
        assert.strictEqual(resMasInfoCiclo2.body.emailSent, true);

        // Obtener nuevo token
        const [tokenRows2] = await pool.query(
            'SELECT * FROM tokens_solicitud_asociado WHERE solicitud_id = ? AND usado = 0 ORDER BY id DESC LIMIT 1',
            [solA.id]
        );
        assert.strictEqual(tokenRows2.length, 1);
        const candidateToken2 = tokenRows2[0].token_hash;

        // Candidato actualiza nuevamente
        const resPortalPost2 = await request('POST', '/api/asociados/solicitud/actualizar', {
            token: candidateToken2,
            servicio_id: 1,
            descripcion_servicio: 'Clases particulares de inglés avanzado tanto presenciales como en línea con horario flexible.'
        });
        assert.strictEqual(resPortalPost2.status, 200);
        console.log('✓ Ciclo múltiple de "Más información" completado satisfactoriamente.');

        // 8.4 Prueba de fallback cuando el servicio de correo falla: debe registrar warning y no crash
        serverExports.initMailTransporter({
            sendMail: async () => {
                throw new Error('Simulated SMTP transport timeout');
            }
        });
        const resMasInfoEmailFail = await request('POST', `/api/admin/asociados/${solA.id}/mas-informacion`, {
            observaciones: 'Prueba de tolerancia a fallo de correo'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert.strictEqual(resMasInfoEmailFail.status, 200);
        assert.strictEqual(resMasInfoEmailFail.body.emailSent, false);
        assert(resMasInfoEmailFail.body.warning.includes('no se pudo enviar el correo'));
        console.log('✓ Fallo de envío de correo se maneja limpiamente devolviendo warning sin romper el endpoint.');

        // Restaurar mock transporter operativo y regresar solicitud a por_aprobar para autorizar después
        serverExports.initMailTransporter({
            sendMail: async (mailOptions) => {
                sentEmails.push(mailOptions);
                return { messageId: 'mock-mail-id-restored' };
            }
        });
        const [tokenRowsFail] = await pool.query(
            'SELECT token_hash FROM tokens_solicitud_asociado WHERE solicitud_id = ? AND usado = 0 ORDER BY id DESC LIMIT 1',
            [solA.id]
        );
        if (tokenRowsFail.length > 0) {
            await request('POST', '/api/asociados/solicitud/actualizar', {
                token: tokenRowsFail[0].token_hash,
                servicio_id: 1,
                descripcion_servicio: 'Clases particulares completas de inglés.'
            });
        }

        // ---------------------------------------------------------------------
        // TEST 9: Flujo Rechazar Solicitud e Invalidez Inmediata de Token de Correo
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 9: Rechazo de Solicitud e Invalidación de Tokens ---');
        
        // Asociado B se registró pero NUNCA validó su correo
        const solBId = solBRows[0].id;
        const [verifBBefore] = await pool.query('SELECT id, token_hash, usado FROM verificaciones_correo WHERE usuario_id = ?', [asocBId]);
        assert.strictEqual(verifBBefore.length, 1);
        assert.strictEqual(verifBBefore[0].usado, 0, 'Token de correo de Asociado B estaba pendiente');
        const verifBToken = verifBBefore[0].token_hash;

        // Sin observaciones -> 400
        const resRechazoSinObs = await request('POST', `/api/admin/asociados/${solBId}/rechazar`, {
            observaciones: '  '
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert.strictEqual(resRechazoSinObs.status, 400);
        console.log('✓ Rechazar solicitud exige observaciones obligatorias.');

        // Con observaciones -> solicitud pasa a 'rechazado' y usuario permanece inactivo
        const resRechazoExito = await request('POST', `/api/admin/asociados/${solBId}/rechazar`, {
            observaciones: 'El perfil no se alinea actualmente con los objetivos del programa.'
        }, { 'Authorization': `Bearer ${adminToken}` });
        assert.strictEqual(resRechazoExito.status, 200);

        const [solBPostRechazo] = await pool.query('SELECT estatus, usuario_revisor_id FROM solicitudes_asociado WHERE id = ?', [solBId]);
        assert.strictEqual(solBPostRechazo[0].estatus, 'rechazado');
        assert.strictEqual(solBPostRechazo[0].usuario_revisor_id, adminUserId);

        const [usrBPostRechazo] = await pool.query('SELECT activo FROM usuarios WHERE id = ?', [asocBId]);
        assert.strictEqual(usrBPostRechazo[0].activo, 0, 'Usuario rechazado debe permanecer con activo = 0');

        // CRUCIAL (Problema 4): El token de validación de correo debe haber quedado invalidado (usado = 1)
        const [verifBAfter] = await pool.query('SELECT usado FROM verificaciones_correo WHERE id = ?', [verifBBefore[0].id]);
        assert.strictEqual(verifBAfter[0].usado, 1, 'Token de verificación de correo debe ser marcado como usado = 1 inmediatamente al rechazar');

        // Al intentar validar el correo con el enlace previo, debe ser rechazado con 400
        const resVerifBPostRechazo = await request('GET', `/api/asociados/verificar-correo?token=${verifBToken}`);
        assert.strictEqual(resVerifBPostRechazo.status, 400);
        assert.strictEqual(
            resVerifBPostRechazo.body.error,
            'Este enlace de validación ya no es válido. La solicitud asociada a este correo fue rechazada o el enlace fue invalidado.'
        );
        console.log('✓ Token de verificación de correo queda inmediatamente invalidado si el asociado es rechazado antes de validar.');

        // ---------------------------------------------------------------------
        // TEST 10: Flujo Autorizar Solicitud y Login Exitoso
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 10: Autorización de Solicitud y Activación de Cuenta ---');
        
        // 10.1 Intentar autorizar un asociado cuyo correo NO esté validado
        const asocUserC = `${testPrefix}_asoc_c`;
        await request('POST', '/api/register', {
            usuario: asocUserC,
            password: 'Password1!',
            'password-rep': 'Password1!',
            nombre: 'Asociado Sin Validar Correo',
            correo: `${asocUserC}@test.idealandia.com`,
            telefono: '+524425556677',
            tipo_registro: 'asociado',
            servicio_id: 2,
            descripcion_servicio: 'Consultoría estratégica empresarial'
        });
        const [asocCRows] = await pool.query('SELECT u.id, s.id AS solicitud_id FROM usuarios u JOIN solicitudes_asociado s ON u.id = s.usuario_id WHERE u.usuario = ?', [asocUserC]);
        createdUserIds.push(asocCRows[0].id);
        const solCId = asocCRows[0].solicitud_id;

        const resAutSinCorreo = await request('POST', `/api/admin/asociados/${solCId}/autorizar`, {}, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(resAutSinCorreo.status, 400);
        assert(resAutSinCorreo.body.error.includes('aún no ha sido validado') || resAutSinCorreo.body.error.includes('correo'));
        console.log('✓ Autorización rechazada si el candidato no ha validado su correo electrónico.');

        // 10.2 Autorizar Solicitud A (cuyo correo ya fue validado en TEST 6)
        const resAutExito = await request('POST', `/api/admin/asociados/${solA.id}/autorizar`, {}, {
            'Authorization': `Bearer ${adminToken}`
        });
        assert.strictEqual(resAutExito.status, 200);

        // Verificar que solicitud está autorizada y usuario activo = 1
        const [solAPostAut] = await pool.query('SELECT estatus, usuario_revisor_id FROM solicitudes_asociado WHERE id = ?', [solA.id]);
        assert.strictEqual(solAPostAut[0].estatus, 'autorizado');
        assert.strictEqual(solAPostAut[0].usuario_revisor_id, adminUserId);

        const [usrAPostAut] = await pool.query('SELECT activo FROM usuarios WHERE id = ?', [asocAId]);
        assert.strictEqual(usrAPostAut[0].activo, 1, 'Tras autorización del admin, el usuario pasa a activo = 1');

        // 10.3 Ahora el Asociado A SÍ puede hacer login exitoso
        const resLoginAsocAutorizado = await request('POST', '/api/login', {
            usuario: asocUserA,
            password: 'Password1!'
        });
        assert.strictEqual(resLoginAsocAutorizado.status, 200);
        assert.strictEqual(resLoginAsocAutorizado.body.message, 'Login exitoso.');
        const asocSetCookie = resLoginAsocAutorizado.headers['set-cookie'] || [];
        const asocHasAuthCookie = Array.isArray(asocSetCookie) 
            ? asocSetCookie.some(c => c.includes('auth_token=')) 
            : typeof asocSetCookie === 'string' && asocSetCookie.includes('auth_token=');
        assert(asocHasAuthCookie, 'Asociado autorizado debe recibir cookie auth_token');
        console.log('✓ Solicitud autorizada con éxito. Cuenta activada (activo = 1) y login completado correctamente.');

        // ---------------------------------------------------------------------
        // TEST 11: Validaciones de Frontend y DOM con JSDOM
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 11: Verificación de Interfaz y UX en index.html ---');
        const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const dom = new JSDOM(htmlContent);
        const doc = dom.window.document;

        // Comprobar presencia de radio buttons
        const radioUsuario = doc.getElementById('reg-tipo-usuario');
        const radioAsociado = doc.getElementById('reg-tipo-asociado');
        assert(radioUsuario, 'Debe existir radio button #reg-tipo-usuario');
        assert(radioAsociado, 'Debe existir radio button #reg-tipo-asociado');
        assert.strictEqual(radioUsuario.checked, true, 'Usuario debe ser la opción seleccionada por defecto');

        // Comprobar campos de Asociado
        const camposAsociado = doc.getElementById('campos-asociado');
        assert(camposAsociado, 'Debe existir contenedor #campos-asociado');
        assert.strictEqual(camposAsociado.style.display, 'none', '#campos-asociado debe iniciar oculto');

        const selectServicio = doc.getElementById('reg-servicio');
        const groupServicioOtro = doc.getElementById('group-servicio-otro');
        const inputServicioOtro = doc.getElementById('reg-servicio-otro');
        const textareaDescripcion = doc.getElementById('reg-descripcion');

        assert(selectServicio, 'Debe existir #reg-servicio');
        assert(groupServicioOtro, 'Debe existir #group-servicio-otro');
        assert(inputServicioOtro, 'Debe existir #reg-servicio-otro');
        assert(textareaDescripcion, 'Debe existir #reg-descripcion');

        // Comprobar sección de administración de Asociados
        const tabBtnAsociados = doc.querySelector('.admin-tab-btn[data-tab="admin-asociados"]');
        assert(tabBtnAsociados, 'Debe existir pestaña Asociados en la consola de administración');
        const tabContentAsociados = doc.getElementById('admin-asociados');
        assert(tabContentAsociados, 'Debe existir contenedor #admin-asociados');

        // Comprobar modal de detalle
        const modalDetalle = doc.getElementById('modal-asociado-detalle');
        assert(modalDetalle, 'Debe existir modal #modal-asociado-detalle');
        console.log('✓ Estructura DOM de registro, portal y administración validada correctamente.');

        // ---------------------------------------------------------------------
        // TEST 12: Corrección del Modal Común (#custom-modal) y showConfirm
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 12: Comportamiento del Modal Común (#custom-modal) y showConfirm ---');
        
        // Cargar entorno JSDOM con ejecución de scripts para verificar la lógica de window.showConfirm y modales
        const domScripts = new JSDOM(htmlContent, { runScripts: "dangerously" });
        const win = domScripts.window;

        // Extraer y evaluar las funciones de modal desde index.html para garantizar aislamiento en JSDOM
        const startModalIdx = htmlContent.indexOf('window.showModal = function');
        const endModalIdx = htmlContent.indexOf('async function loadFooterInfo');
        assert(startModalIdx !== -1 && endModalIdx !== -1, 'Debe encontrarse la definición de window.showModal y window.showConfirm en index.html');
        const modalFuncsCode = htmlContent.substring(startModalIdx, endModalIdx);
        win.eval(modalFuncsCode);

        const overlay = win.document.getElementById('custom-modal');
        assert(overlay, 'Debe existir #custom-modal en el DOM');

        // 12.1 Verificar que showConfirm sin opciones para acción destructiva usa "Eliminar"
        const confirmPromiseEliminar = win.showConfirm('¿Estás seguro de que deseas eliminar este registro?');
        const confirmBtnEliminar = win.document.getElementById('custom-modal-buttons').querySelector('button:last-child');
        const cancelBtnEliminar = win.document.getElementById('custom-modal-buttons').querySelector('button:first-child');
        assert(confirmBtnEliminar, 'Debe existir botón de confirmación');
        assert.strictEqual(confirmBtnEliminar.textContent, 'Eliminar', 'Acción destructiva debe mostrar "Eliminar"');
        assert.strictEqual(cancelBtnEliminar.textContent, 'Cancelar', 'Botón de cancelar debe mostrar "Cancelar"');
        assert(overlay.classList.contains('active'), 'Overlay debe tener clase active');
        assert.strictEqual(overlay.style.display, '', 'Overlay NO debe tener style="display: ..." inline');

        // Cancelar el diálogo
        cancelBtnEliminar.click();
        const resultadoEliminar = await confirmPromiseEliminar;
        assert.strictEqual(resultadoEliminar, false);
        assert(!overlay.classList.contains('active'), 'Overlay debe remover clase active al cerrar');
        assert.strictEqual(overlay.style.display, '', 'Al cerrar, overlay NO debe retener display: none');

        // 12.2 Verificar que showConfirm con opciones configurables usa "Confirmar" (Autorizar Asociado)
        const confirmPromiseAutorizar = win.showConfirm('¿Confirmas que deseas autorizar a este Asociado?', {
            confirmText: 'Confirmar',
            cancelText: 'Cancelar'
        });
        const confirmBtnAutorizar = win.document.getElementById('custom-modal-buttons').querySelector('button:last-child');
        assert.strictEqual(confirmBtnAutorizar.textContent, 'Confirmar', 'Autorizar debe mostrar "Confirmar" y no "Eliminar"');
        confirmBtnAutorizar.click();
        const resultadoAutorizar = await confirmPromiseAutorizar;
        assert.strictEqual(resultadoAutorizar, true);
        assert(!overlay.classList.contains('active'));
        assert.strictEqual(overlay.style.display, '', 'Al confirmar, overlay NO debe retener display: none');

        // 12.3 Simular que un estilo inline espurio existía y verificar que showModal / showConfirm lo eliminan
        overlay.style.display = 'none'; // Simular estado corrupto
        win.showModal('Mensaje de prueba');
        assert.strictEqual(overlay.style.display, '', 'showModal debe remover propiedad inline display');
        const modalOkBtn = win.document.getElementById('custom-modal-buttons').querySelector('button');
        modalOkBtn.click();
        assert.strictEqual(overlay.style.display, '', 'Al cerrar modal, overlay style.display permanece limpio');

        console.log('✓ showConfirm es configurable (muestra "Confirmar" para autorizar y "Eliminar" para bajas).');
        console.log('✓ #custom-modal no retiene style="display: none" inline en ninguna circunstancia.');

        console.log('\n================================================================');
        console.log('🎉 TODAS LAS PRUEBAS DE ASOCIADOS PASARON SATISFACTORIAMENTE');
        console.log('================================================================\n');

    } catch (err) {
        console.error('\n❌ ERROR EN PRUEBAS:', err);
        throw err;
    } finally {
        // Limpieza de datos de prueba en la base de datos
        if (pool && createdUserIds.length > 0) {
            console.log(`🧹 Limpiando ${createdUserIds.length} usuarios de prueba creados...`);
            try {
                // Eliminar tokens de solicitud
                await pool.query(
                    `DELETE t FROM tokens_solicitud_asociado t
                     JOIN solicitudes_asociado s ON t.solicitud_id = s.id
                     WHERE s.usuario_id IN (?)`,
                    [createdUserIds]
                );
                // Eliminar historial
                await pool.query(
                    `DELETE h FROM historial_solicitudes_asociado h
                     JOIN solicitudes_asociado s ON h.solicitud_id = s.id
                     WHERE s.usuario_id IN (?)`,
                    [createdUserIds]
                );
                // Eliminar solicitudes
                await pool.query('DELETE FROM solicitudes_asociado WHERE usuario_id IN (?)', [createdUserIds]);
                // Eliminar verificaciones de correo
                await pool.query('DELETE FROM verificaciones_correo WHERE usuario_id IN (?)', [createdUserIds]);
                // Eliminar roles y usuarios
                await pool.query('DELETE FROM usuario_roles WHERE usuario_id IN (?)', [createdUserIds]);
                await pool.query('DELETE FROM usuarios WHERE id IN (?)', [createdUserIds]);
                console.log('✓ Datos de prueba limpiados exitosamente de MySQL.');
            } catch (cleanupErr) {
                console.error('Error durante la limpieza de prueba:', cleanupErr);
            }
        }

        if (pool) {
            await pool.end();
        }
    }
}

runTests().then(() => {
    process.exit(0);
}).catch(() => {
    process.exit(1);
});
