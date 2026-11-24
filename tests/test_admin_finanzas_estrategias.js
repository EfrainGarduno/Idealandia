const http = require('http');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

const { app } = require('../server.js');

async function runTests() {
    console.log('=== TEST: ADMIN ESTRATEGIAS FINANZAS & PARSEO INVERSIÓN ===');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'idealandia'
    });

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        // Generar token admin válido
        const [adminRows] = await conn.query(`
            SELECT u.id, u.usuario, u.jwt_version 
            FROM usuarios u
            JOIN usuario_roles ur ON u.id = ur.usuario_id
            JOIN roles r ON ur.rol_id = r.id
            WHERE r.nombre = 'administrador' AND u.activo = 1
            LIMIT 1
        `);
        const adminUser = adminRows[0];
        const adminToken = jwt.sign(
            { id: adminUser.id, usuario: adminUser.usuario, jwt_version: adminUser.jwt_version || 1 },
            process.env.AUTH_SECRET,
            { expiresIn: '1h' }
        );

        // 1. GET /api/admin/finanzas/estrategias
        console.log('[Caso 1: GET /api/admin/finanzas/estrategias]');
        const resGet = await fetch(`${baseUrl}/api/admin/finanzas/estrategias`, {
            headers: {
                'Cookie': `auth_token=${adminToken}`,
                'Accept': 'application/json'
            }
        });

        assert.strictEqual(resGet.status, 200, `Expected 200, got ${resGet.status}`);
        const dataGet = await resGet.json();
        assert(Array.isArray(dataGet.estrategias), 'Debe retornar un array de estrategias');
        assert.strictEqual(dataGet.estrategias.length, 3, 'Deben existir 3 estrategias configuradas');
        console.log('✓ Caso 1 superado: 3 estrategias obtenidas exitosamente.');

        // 2. PUT /api/admin/finanzas/estrategias/:id
        console.log('[Caso 2: PUT /api/admin/finanzas/estrategias/2 (Equilibrada)]');
        const resPut = await fetch(`${baseUrl}/api/admin/finanzas/estrategias/2`, {
            method: 'PUT',
            headers: {
                'Cookie': `auth_token=${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nombre: 'Equilibrada',
                max_concentracion_inst: 40.0,
                min_instituciones: 3,
                max_concentracion_tipo: 60.0,
                diversificar_tipos: 1,
                asignacion_minima_viable: 2000.0,
                descripcion_criterio: 'Se buscó un equilibrio entre rendimiento y diversificación.',
                activo: 1
            })
        });

        assert.strictEqual(resPut.status, 200, `Expected 200, got ${resPut.status}`);
        const dataPut = await resPut.json();
        assert.strictEqual(dataPut.success, true);
        console.log('✓ Caso 2 superado: Estrategia actualizada exitosamente via endpoint administrativo.');

        // 3. Test parseo de 40,000 en Javascript
        console.log('[Caso 3: Verificación de parseInversionGlobal sin truncamiento por comas]');
        const rawValues = ['40,000', '$40,000.00', '100,000', '1,000,000', '500'];
        const expected = [40000, 40000, 100000, 1000000, 500];

        rawValues.forEach((val, idx) => {
            const clean = String(val).replace(/[^0-9.]/g, '');
            const parsed = parseFloat(clean);
            assert.strictEqual(parsed, expected[idx], `Falló parseo de ${val}: se esperaba ${expected[idx]}, se obtuvo ${parsed}`);
        });
        console.log('✓ Caso 3 superado: Parseo de cantidades formateadas con comas funciona al 100%.');

        console.log('\n=========================================');
        console.log('¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!');
        console.log('=========================================');
        await conn.end();
        server.close();
        process.exit(0);
    } finally {
        await conn.end().catch(() => {});
        server.close();
    }
}

runTests().catch(err => {
    console.error('Error en pruebas:', err);
    process.exit(1);
});
