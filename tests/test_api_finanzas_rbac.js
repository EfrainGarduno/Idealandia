const assert = require('assert');
const request = require('supertest');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server.js');

describe('Finanzas & Simulador API Tests', function () {
    this.timeout(15000);

    let conn;
    let adminToken;
    let normalUserToken;
    let adminUserId;
    let normalUserId;

    before(async function () {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            dateStrings: true
        });

        // 1. Obtener un usuario administrador
        const [adminRows] = await conn.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id
            WHERE r.nombre = 'administrador' AND u.activo = 1
            LIMIT 1
        `);
        assert(adminRows.length > 0, 'Debe existir un usuario administrador');
        adminUserId = adminRows[0].id;
        adminToken = jwt.sign(
            { id: adminRows[0].id, usuario: adminRows[0].usuario, jwt_version: adminRows[0].jwt_version || 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // 2. Obtener o crear un usuario normal sin permisos de finanzas
        const [userRows] = await conn.query(`
            SELECT u.id, u.usuario, u.jwt_version
            FROM usuarios u
            WHERE u.id NOT IN (
                SELECT ur.usuario_id FROM usuario_roles ur
                JOIN roles r ON ur.rol_id = r.id
                WHERE r.nombre = 'administrador'
            ) AND u.activo = 1
            LIMIT 1
        `);

        if (userRows.length > 0) {
            normalUserId = userRows[0].id;
            normalUserToken = jwt.sign(
                { id: userRows[0].id, usuario: userRows[0].usuario, jwt_version: userRows[0].jwt_version || 1 },
                process.env.AUTH_SECRET,
                { expiresIn: '1h' }
            );
        }
    });

    after(async function () {
        if (conn) await conn.end();
    });

    it('Caso Simulador: GET /api/finanzas/simulador devuelve instituciones activas y esquemas vigentes', async function () {
        const res = await request(app)
            .get('/api/finanzas/simulador')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert(Array.isArray(res.body.instituciones));
        assert(res.body.instituciones.length >= 8);

        // Verificar NU
        const nu = res.body.instituciones.find(i => i.nombre === 'NU');
        assert(nu, 'NU debe existir en la respuesta');
        assert.strictEqual(nu.tipo, 'S');
        assert(nu.esquema, 'NU debe tener un esquema vigente');
        assert.strictEqual(nu.esquema.tramos.length, 2);
        assert.strictEqual(nu.esquema.tramos[0].limite_superior, 25000);
        assert.strictEqual(nu.esquema.tramos[0].tasa_anual, 13);
        assert.strictEqual(nu.esquema.tramos[1].tasa_anual, 6.5);

        // Verificar Openbank
        const ob = res.body.instituciones.find(i => i.nombre === 'Openbank');
        assert(ob, 'Openbank debe existir');
        assert.strictEqual(ob.esquema.tramos.length, 3);
        assert.strictEqual(ob.esquema.tramos[0].limite_superior, 30000);
        assert.strictEqual(ob.esquema.tramos[1].limite_superior, 100000);
        assert.strictEqual(ob.esquema.tramos[2].limite_superior, null);
    });

    it('Caso Vigencias: Fecha previa al inicio de vigencia no debe retornar esquema activo', async function () {
        const res = await request(app)
            .get('/api/finanzas/simulador?fecha=2024-01-01')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(res.status, 200);
        const nu = res.body.instituciones.find(i => i.nombre === 'NU');
        assert.strictEqual(nu.esquema, null, 'En 2024 no debe haber esquema vigente si inició en 2026');
    });

    it('Caso RBAC: Usuario sin permisos recibe 403 en endpoints administrativos de finanzas', async function () {
        if (!normalUserToken) this.skip();

        const res = await request(app)
            .get('/api/admin/finanzas/instituciones')
            .set('Authorization', `Bearer ${normalUserToken}`);

        assert.strictEqual(res.status, 403);
        assert(['RBAC_PERMISSION_DENIED', 'RBAC_ACCESS_DENIED'].includes(res.body.code));
    });

    it('Caso RBAC: Administrador puede consultar GET /api/admin/finanzas/instituciones', async function () {
        const res = await request(app)
            .get('/api/admin/finanzas/instituciones')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert(Array.isArray(res.body.instituciones));
        assert(res.body.instituciones.length >= 8);
    });

    it('Caso Integridad: Rechaza esquema con traslape activo sin cerrar anterior', async function () {
        const [nuRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre = 'NU'");
        const nuId = nuRows[0].id;

        // Intentar registrar esquema que se traslapa con fecha de vigencia abierta
        const res = await request(app)
            .post('/api/admin/finanzas/esquemas')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                institucion_id: nuId,
                nombre_esquema: 'Esquema Conflicto',
                fecha_inicio_vigencia: '2026-06-01',
                fecha_fin_vigencia: null,
                cerrar_anterior: false,
                tramos: [
                    { limite_inferior: 0, limite_superior: null, tasa_anual: 12.0 }
                ]
            });

        assert.strictEqual(res.status, 400);
        assert(res.body.error.includes('traslapan') || res.body.error.includes('activo'));
    });

    it('Caso Nueva Vigencia Histórica: Registro con cerrar_anterior preserva historial sin sobreescritura', async function () {
        // Creamos una institución de prueba para no alterar el catálogo inicial
        const [testInstRes] = await conn.query(`
            INSERT INTO instituciones_financieras (nombre, tipo, descripcion, activo)
            VALUES ('Banco Test Vigencias', 'B', 'Banco para pruebas de historial', 1)
        `);
        const testInstId = testInstRes.insertId;

        try {
            // 1. Crear esquema 1 (01/01/2026 -> NULL)
            const res1 = await request(app)
                .post('/api/admin/finanzas/esquemas')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    institucion_id: testInstId,
                    nombre_esquema: 'Vigencia Enero',
                    fecha_inicio_vigencia: '2026-01-01',
                    fecha_fin_vigencia: null,
                    cerrar_anterior: false,
                    tramos: [
                        { limite_inferior: 0, limite_superior: null, tasa_anual: 10.0 }
                    ]
                });
            assert.strictEqual(res1.status, 201);
            const esquema1Id = res1.body.id;

            // 2. Crear esquema 2 a partir de 01/12/2026 con cerrar_anterior = true
            const res2 = await request(app)
                .post('/api/admin/finanzas/esquemas')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    institucion_id: testInstId,
                    nombre_esquema: 'Vigencia Diciembre',
                    fecha_inicio_vigencia: '2026-12-01',
                    fecha_fin_vigencia: null,
                    cerrar_anterior: true,
                    tramos: [
                        { limite_inferior: 0, limite_superior: null, tasa_anual: 12.0 }
                    ]
                });
            assert.strictEqual(res2.status, 201);
            const esquema2Id = res2.body.id;

            // 3. Comprobar en BD que el esquema 1 quedó cerrado al 2026-11-30 y el esquema 2 tiene 2026-12-01 -> NULL
            const [esquemas] = await conn.query(
                'SELECT id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia FROM institucion_esquemas_tasas WHERE institucion_id = ? ORDER BY fecha_inicio_vigencia ASC',
                [testInstId]
            );

            assert.strictEqual(esquemas.length, 2);
            assert.strictEqual(esquemas[0].id, esquema1Id);
            assert.strictEqual(esquemas[0].fecha_inicio_vigencia, '2026-01-01');
            assert.strictEqual(esquemas[0].fecha_fin_vigencia, '2026-11-30'); // ¡Cerrado el día anterior!

            assert.strictEqual(esquemas[1].id, esquema2Id);
            assert.strictEqual(esquemas[1].fecha_inicio_vigencia, '2026-12-01');
            assert.strictEqual(esquemas[1].fecha_fin_vigencia, null); // Abierto

            // 4. Probar consulta histórica:
            // En Noviembre 2026 debe aplicar Esquema 1 (10%)
            const simNov = await request(app)
                .get('/api/finanzas/simulador?fecha=2026-11-15')
                .set('Authorization', `Bearer ${adminToken}`);
            const instNov = simNov.body.instituciones.find(i => i.id === testInstId);
            assert.strictEqual(instNov.esquema.id, esquema1Id);
            assert.strictEqual(instNov.esquema.tramos[0].tasa_anual, 10);

            // En Diciembre 2026 debe aplicar Esquema 2 (12%)
            const simDic = await request(app)
                .get('/api/finanzas/simulador?fecha=2026-12-05')
                .set('Authorization', `Bearer ${adminToken}`);
            const instDic = simDic.body.instituciones.find(i => i.id === testInstId);
            assert.strictEqual(instDic.esquema.id, esquema2Id);
            assert.strictEqual(instDic.esquema.tramos[0].tasa_anual, 12);

        } finally {
            // Limpieza
            await conn.query('DELETE FROM instituciones_financieras WHERE id = ?', [testInstId]);
        }
    });
});
