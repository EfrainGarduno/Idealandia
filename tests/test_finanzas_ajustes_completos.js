const assert = require('assert');
const request = require('supertest');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { app } = require('../server.js');
const MotorFinanciero = require('../public/js/motorFinanciero.js');

describe('Pruebas de Aceptación: Ajustes de Finanzas y Simulador', function () {
    this.timeout(20000);

    let conn;
    let adminToken;
    let nuId;

    before(async function () {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT,
            dateStrings: true
        });

        // 1. Obtener usuario administrador
        const [adminRows] = await conn.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id
            WHERE r.nombre = 'administrador' AND u.activo = 1
            LIMIT 1
        `);
        assert(adminRows.length > 0, 'Debe existir un usuario administrador');
        adminToken = jwt.sign(
            { id: adminRows[0].id, usuario: adminRows[0].usuario, jwt_version: adminRows[0].jwt_version || 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // 2. Asegurar instituciones base activas
        await conn.query('UPDATE instituciones_financieras SET activo = 1 WHERE id IN (1, 2, 3, 4, 5, 6, 7, 8)');

        // Obtener ID de NU
        const [nuRows] = await conn.query("SELECT id FROM instituciones_financieras WHERE nombre = 'NU' LIMIT 1");
        assert(nuRows.length > 0, 'Debe existir la institución NU');
        nuId = nuRows[0].id;
    });

    after(async function () {
        // Limpiar esquemas 2027 creados por las pruebas
        await conn.query("DELETE FROM institucion_tramos_tasas WHERE esquema_id IN (SELECT id FROM institucion_esquemas_tasas WHERE institucion_id = ? AND (fecha_inicio_vigencia > '2026-01-01' OR nombre_esquema LIKE '%Futura%'))", [nuId]);
        await conn.query("DELETE FROM institucion_esquemas_tasas WHERE institucion_id = ? AND (fecha_inicio_vigencia > '2026-01-01' OR nombre_esquema LIKE '%Futura%')", [nuId]);

        // Restaurar esquema 1 de NU a sus valores base aprobados
        const [esqNU] = await conn.query(
            "SELECT id FROM institucion_esquemas_tasas WHERE institucion_id = ? AND fecha_inicio_vigencia = '2026-01-01' LIMIT 1",
            [nuId]
        );
        if (esqNU.length > 0) {
            await conn.query("UPDATE institucion_esquemas_tasas SET fecha_fin_vigencia = NULL, nombre_esquema = 'Vigente 2026', activo = 1 WHERE id = ?", [esqNU[0].id]);
            await conn.query("DELETE FROM institucion_tramos_tasas WHERE esquema_id = ?", [esqNU[0].id]);
            await conn.query(
                `INSERT INTO institucion_tramos_tasas (esquema_id, numero_tramo, limite_inferior, limite_superior, tasa_anual, descripcion_tramo) VALUES
                 (?, 1, 0.00, 25000.00, 13.0000, 'Saldo hasta $25,000'),
                 (?, 2, 25000.00, NULL, 6.5000, 'Excedente a partir de $25,000')`,
                [esqNU[0].id, esqNU[0].id]
            );
            await conn.query(
                "UPDATE instituciones_financieras SET condiciones_resumen = 'Hasta $25,000 al 13%, excedente al 6.5%', activo = 1 WHERE id = ?",
                [nuId]
            );
        }
        if (conn) await conn.end();
    });

    it('1, 2 y 3: Consulta de NU en Administración devuelve sus esquemas y sus dos tramos', async function () {
        const res = await request(app)
            .get('/api/admin/finanzas/instituciones')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(res.status, 200);
        const nu = res.body.instituciones.find(i => i.id === nuId);
        assert(nu, 'NU debe existir en la lista');
        assert(Array.isArray(nu.esquemas) && nu.esquemas.length > 0, 'NU debe tener esquemas');

        const esqActivo = nu.esquemas.find(e => e.activo === 1);
        assert(esqActivo, 'NU debe tener esquema activo');
        assert.strictEqual(esqActivo.tramos.length, 2, 'NU debe tener exactamente 2 tramos');

        // Tramo 1: 0 a 25000 @ 13%
        assert.strictEqual(esqActivo.tramos[0].limite_inferior, 0);
        assert.strictEqual(esqActivo.tramos[0].limite_superior, 25000);
        assert.strictEqual(esqActivo.tramos[0].tasa_anual, 13);

        // Tramo 2: 25000 a null @ 6.5%
        assert.strictEqual(esqActivo.tramos[1].limite_inferior, 25000);
        assert.strictEqual(esqActivo.tramos[1].limite_superior, null);
        assert.strictEqual(esqActivo.tramos[1].tasa_anual, 6.5);
    });

    it('4, 5, 6 y 7: Modificar la tasa del tramo 1, límite superior, y tasa del tramo 2 de NU vía PUT institución', async function () {
        // Consultar esquema actual de NU
        const [esqRows] = await conn.query(
            "SELECT id, nombre_esquema, fecha_inicio_vigencia, fecha_fin_vigencia, activo FROM institucion_esquemas_tasas WHERE institucion_id = ? AND activo = 1 LIMIT 1",
            [nuId]
        );
        assert(esqRows.length > 0);
        const esqActual = esqRows[0];

        // Modificamos:
        // Tramo 1: $0 -> $30,000 @ 14% (antes $25,000 @ 13%)
        // Tramo 2: $30,000 -> Sin tope @ 8% (antes >$25k @ 6.5%)
        const nuevosTramos = [
            { numero_tramo: 1, limite_inferior: 0, limite_superior: 30000, tasa_anual: 14.0, descripcion_tramo: 'Hasta $30k al 14%' },
            { numero_tramo: 2, limite_inferior: 30000, limite_superior: null, tasa_anual: 8.0, descripcion_tramo: 'Excedente al 8%' }
        ];

        const payload = {
            nombre: 'NU',
            tipo: 'S',
            descripcion: 'Nu México Financiera S.A. de C.V. S.F.P.',
            orden_visual: 1,
            activo: 1,
            esquema: {
                id: esqActual.id,
                nombre_esquema: 'Vigente 2026 Modificado',
                fecha_inicio_vigencia: esqActual.fecha_inicio_vigencia,
                fecha_fin_vigencia: null,
                activo: 1,
                nueva_vigencia: false,
                tramos: nuevosTramos
            }
        };

        const resPut = await request(app)
            .put(`/api/admin/finanzas/instituciones/${nuId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        assert.strictEqual(resPut.status, 200);
        assert.strictEqual(resPut.body.success, true);

        // Verificar en BD que se guardó
        const [tramosBD] = await conn.query(
            "SELECT * FROM institucion_tramos_tasas WHERE esquema_id = ? ORDER BY numero_tramo ASC",
            [esqActual.id]
        );
        assert.strictEqual(tramosBD.length, 2);
        assert.strictEqual(parseFloat(tramosBD[0].limite_superior), 30000);
        assert.strictEqual(parseFloat(tramosBD[0].tasa_anual), 14);
        assert.strictEqual(parseFloat(tramosBD[1].limite_inferior), 30000);
        assert.strictEqual(parseFloat(tramosBD[1].tasa_anual), 8);

        // Verificar que la columna condiciones_resumen se actualizó automáticamente
        const [instBD] = await conn.query("SELECT condiciones_resumen FROM instituciones_financieras WHERE id = ?", [nuId]);
        assert.strictEqual(instBD[0].condiciones_resumen, 'Hasta $30,000 al 14%, excedente al 8%');
    });

    it('8: El simulador utiliza inmediatamente la nueva condición vigente de NU', async function () {
        const resSim = await request(app)
            .get('/api/finanzas/simulador')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.strictEqual(resSim.status, 200);
        const nu = resSim.body.instituciones.find(i => i.id === nuId);
        assert(nu, 'NU debe estar en la respuesta');
        assert(nu.esquema, 'NU debe tener esquema vigente');
        assert.strictEqual(nu.condiciones_resumen, 'Hasta $30,000 al 14%, excedente al 8%');

        // Probar cálculo matemático con $40,000 a 1 mes:
        // Tramo 1: $30,000 al 14% -> Rend1 = 30000 * 0.14 / 12 = $350.00
        // Tramo 2: $10,000 al 8%  -> Rend2 = 10000 * 0.08 / 12 = $66.67
        // Total mensual: $416.67
        const sim = MotorFinanciero.simularInversion(40000, 1, nu.esquema.tramos);
        assert.strictEqual(sim.inversion_base, 30000);
        assert.strictEqual(sim.inversion_2, 10000);
        assert.strictEqual(sim.rend1.toFixed(2), '350.00');
        assert.strictEqual(sim.rend2.toFixed(2), '66.67');
        assert.strictEqual(sim.total_mensual.toFixed(2), '416.67');
    });

    it('9, 10 y 11: Activar / Desactivar institución con acción opuesta al estado actual', async function () {
        // Desactivar NU (activo = 0)
        const resDesactivar = await request(app)
            .put(`/api/admin/finanzas/instituciones/${nuId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ activo: 0 });

        assert.strictEqual(resDesactivar.status, 200);

        // Verificar en BD que está inactiva
        const [rowInactiva] = await conn.query("SELECT activo FROM instituciones_financieras WHERE id = ?", [nuId]);
        assert.strictEqual(rowInactiva[0].activo, 0);

        // En el simulador, instituciones inactivas NO deben aparecer
        const resSimInactiva = await request(app)
            .get('/api/finanzas/simulador')
            .set('Authorization', `Bearer ${adminToken}`);
        const nuInactiva = resSimInactiva.body.instituciones.find(i => i.id === nuId);
        assert.strictEqual(nuInactiva, undefined, 'Institución inactiva no debe aparecer en el simulador');

        // Ahora reactivar NU (activo = 1)
        const resActivar = await request(app)
            .put(`/api/admin/finanzas/instituciones/${nuId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ activo: 1 });

        assert.strictEqual(resActivar.status, 200);

        // Verificar en BD que está activa
        const [rowActiva] = await conn.query("SELECT activo FROM instituciones_financieras WHERE id = ?", [nuId]);
        assert.strictEqual(rowActiva[0].activo, 1);
    });

    it('Conservación del historial: Guardar como nueva vigencia histórica no destruye esquema previo', async function () {
        // Obtenemos esquemas actuales de NU
        const [esqsAntes] = await conn.query("SELECT id FROM institucion_esquemas_tasas WHERE institucion_id = ?", [nuId]);
        const cantidadAntes = esqsAntes.length;

        // Crear una nueva vigencia a partir de 2027-01-01
        const payloadNuevaVigencia = {
            nombre: 'NU',
            tipo: 'S',
            activo: 1,
            esquema: {
                id: null,
                nombre_esquema: 'Vigencia Futura 2027',
                fecha_inicio_vigencia: '2027-01-01',
                fecha_fin_vigencia: null,
                activo: 1,
                nueva_vigencia: true,
                cerrar_anterior: true,
                tramos: [
                    { numero_tramo: 1, limite_inferior: 0, limite_superior: 20000, tasa_anual: 15.0 },
                    { numero_tramo: 2, limite_inferior: 20000, limite_superior: null, tasa_anual: 9.0 }
                ]
            }
        };

        const resNueva = await request(app)
            .put(`/api/admin/finanzas/instituciones/${nuId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payloadNuevaVigencia);

        assert.strictEqual(resNueva.status, 200);

        // Verificar que ahora hay 1 esquema adicional (historial conservado!)
        const [esqsDespues] = await conn.query(
            "SELECT id, fecha_inicio_vigencia, fecha_fin_vigencia, activo FROM institucion_esquemas_tasas WHERE institucion_id = ? ORDER BY fecha_inicio_vigencia ASC",
            [nuId]
        );
        assert.strictEqual(esqsDespues.length, cantidadAntes + 1);

        // El esquema anterior debe haberse cerrado al día previo: 2026-12-31
        const esqPrevio = esqsDespues.find(e => e.fecha_inicio_vigencia < '2027-01-01');
        assert.strictEqual(esqPrevio.fecha_fin_vigencia, '2026-12-31');

        // El nuevo esquema inicia en 2027-01-01 y está abierto (null)
        const esqNuevo = esqsDespues.find(e => e.fecha_inicio_vigencia === '2027-01-01');
        assert(esqNuevo);
        assert.strictEqual(esqNuevo.fecha_fin_vigencia, null);
    });
});
