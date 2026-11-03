const http = require('http');
const jwt = require('jsonwebtoken');

// Set environment variables for the test
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'idealandia';
process.env.PORT = '3002'; // Use a different port to avoid conflicts
process.env.AUTH_SECRET = 'test_secret_for_integration';

// We mock the mysql2 pool to simulate the DB responses
const mysql = require('mysql2/promise');

let mockNextAdminCount = 1;
let simulateGetLockFailure = false;
let mockRoleDeps = 0;

mysql.createPool = function(config) {
    return {
        getConnection: async () => ({
            execute: async (query, params) => {
                const q = query.trim().toUpperCase();
                if (q.startsWith("SELECT GET_LOCK")) {
                    if (simulateGetLockFailure) return [[{ L: 0 }]];
                    return [[{ L: 1 }]];
                }
                if (q.startsWith("SELECT RELEASE_LOCK")) {
                    return [[{ L: 1 }]];
                }
                if (q.includes("COUNT(DISTINCT UR.USUARIO_ID)")) {
                    return [[{ count: mockNextAdminCount }]];
                }
                return [[]];
            },
            beginTransaction: async () => {},
            commit: async () => {},
            rollback: async () => {},
            release: () => {}
        }),
        execute: async (query, params) => {
            const q = query.trim().toUpperCase();

            // verifyToken queries
            if (q.startsWith("SELECT JWT_VERSION FROM USUARIOS WHERE ID = ?")) {
                return [[{ jwt_version: 1 }]];
            }

            // Allow admin access in requireAdmin
            if (q.includes("P.CODIGO = 'ADMIN.ACCESS'")) {
                return [[{ nombre: 'admin.access' }]];
            }
            if (q.includes("SELECT P.NOMBRE")) {
                return [[{ nombre: 'admin.access' }]];
            }

            // DELETE ROLE endpoints checks
            // Make sure the mock responds appropriately. Server.js actually uses string comparison.
            if (q.startsWith("SELECT ID, NOMBRE FROM ROLES WHERE ID = ?")) {
                const id = parseInt(params[0]);
                if (id === 999) return [[]]; // Not found
                if (id === 1) return [[{ id: 1, nombre: 'Admin' }]]; // Protected
                return [[{ id: id, nombre: 'Test Role' }]];
            }
            if (q.startsWith("SELECT USUARIO_ID FROM USUARIO_ROLES WHERE ROL_ID = ?")) {
                if (mockRoleDeps > 0) return [[{ usuario_id: 1 }]];
                return [[]];
            }

            // PERMISO checks
            if (q.startsWith("SELECT ID FROM PERMISOS WHERE ID = ?")) {
                 if (params[0] === 999) return [[]]; // Not found
                 return [[{ id: params[0] }]];
            }
            if (q.startsWith("SELECT ROL_ID FROM ROL_PERMISOS")) {
                 if (mockRoleDeps > 0) return [[{ rol_id: 1 }]];
                 return [[]];
            }
            if (q.startsWith("SELECT FUNCIONALIDAD_ID FROM FUNCIONALIDAD_PERMISOS WHERE PERMISO_ID")) {
                return [[]];
            }
            if (q.startsWith("SELECT CODIGO FROM FUNCIONALIDADES WHERE ID = ?")) {
                if (params[0] === 999) return [[]];
                if (params[0] === 2) return [[{ codigo: 'ideas' }]];
                return [[{ codigo: 'admin' }]];
            }

            // FUNCIONALIDAD checks
            if (q.startsWith("SELECT ID FROM FUNCIONALIDADES WHERE ID = ?")) {
                 if (params[0] === 999) return [[]]; // Not found
                 return [[{ id: params[0] }]];
            }
            if (q.startsWith("SELECT ID FROM MENU_ITEMS WHERE FUNCIONALIDAD_ID")) {
                 if (mockRoleDeps > 0) return [[{ id: 1 }]];
                 return [[]];
            }
            if (q.startsWith("SELECT PERMISO_ID FROM FUNCIONALIDAD_PERMISOS WHERE FUNCIONALIDAD_ID")) {
                 return [[]];
            }

            if (q.startsWith("SELECT ID FROM FUNCIONALIDADES WHERE CODIGO = ?")) {
                if (params[0] === 'existente') return [[{id: 1}]];
                return [[]];
            }
            if (q.startsWith("INSERT INTO FUNCIONALIDADES")) return [[{insertId: 1}]];
            if (q.startsWith("UPDATE FUNCIONALIDADES")) return [[{affectedRows: 1}]];

            if (q.startsWith("INSERT INTO MENU_ITEMS")) return [[{insertId: 1}]];
            if (q.startsWith("UPDATE MENU_ITEMS")) return [[{affectedRows: 1}]];

            if (q.startsWith("SELECT ID FROM USUARIO_FUNCIONALIDADES WHERE USUARIO_ID = ? AND FUNCIONALIDAD_ID = ? AND ESTADO = \"ACTIVO\"")) return [[]];
            if (q.startsWith("UPDATE USUARIO_FUNCIONALIDADES")) {
                if (params && params[0] === 999) return [[{ affectedRows: 0 }]]; // Not found
                return [[{ affectedRows: 1 }]];
            }
            if (q.startsWith("INSERT INTO USUARIO_FUNCIONALIDADES")) return [[{insertId: 1}]];

            if (q.startsWith("SELECT ID FROM MENU_ITEMS WHERE PARENT_ID = ? LIMIT 1")) {
                 if (mockRoleDeps > 0) return [[{ id: 1 }]];
                 return [[]];
            }
            if (q.startsWith("SELECT ID FROM MENU_ITEMS WHERE ID = ?")) {
                 if (params[0] === 999) return [[]]; // Not found
                 return [[{ id: params[0] }]];
            }

            return [[]]; // Default empty array
        }
    };
};

const app = require('./server').app;

async function testRBACAdmin() {
    const token = jwt.sign({ id: 1, usuario: 'test', jwt_version: 1 }, process.env.AUTH_SECRET);

    try {
        const makeRequest = (method, path, body = null) => {
            return new Promise((resolve) => {
                const options = {
                    hostname: 'localhost',
                    port: process.env.PORT,
                    path: path,
                    method: method,
                    headers: {
                        'Cookie': `auth_token=${token}`,
                        'Content-Type': 'application/json'
                    }
                };

                const req = http.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
                });
                if (body) req.write(JSON.stringify(body));
                req.end();
            });
        };

        // Wait for server to boot up
        await new Promise(r => setTimeout(r, 1000));

        // DELETE ROLE - Protected role (Admin)
        let res = await makeRequest('DELETE', '/api/admin/roles/1');
        if (res.status !== 400 || res.data.error !== 'No se puede eliminar un rol protegido.') {
            throw new Error(`Expected 400 for protected role deletion, got ${res.status}`);
        }

        // DELETE ROLE - With dependencies
        mockRoleDeps = 1;
        res = await makeRequest('DELETE', '/api/admin/roles/2');
        if (res.status !== 400 || res.data.error !== 'El rol tiene usuarios asignados y no puede ser eliminado.') {
             throw new Error(`Expected 400 for role with users, got ${res.status}`);
        }
        mockRoleDeps = 0;

        // DELETE ROLE - Success
        res = await makeRequest('DELETE', '/api/admin/roles/2');
        if (res.status !== 200) {
             throw new Error(`Expected 200 for successful role deletion, got ${res.status}`);
        }

        // DELETE PERMISO - With dependencies
        mockRoleDeps = 1;
        res = await makeRequest('DELETE', '/api/admin/permisos/1');
        if (res.status !== 400 || res.data.error !== 'El permiso está asignado a roles y no puede ser eliminado.') {
             throw new Error(`Expected 400 for permiso with dependencies, got ${res.status}`);
        }
        mockRoleDeps = 0;

        // DELETE PERMISO - Success
        res = await makeRequest('DELETE', '/api/admin/permisos/1');
        if (res.status !== 200) {
             throw new Error(`Expected 200 for successful permiso deletion, got ${res.status}`);
        }

        // DELETE FUNCIONALIDAD - With dependencies
        mockRoleDeps = 1;
        res = await makeRequest('DELETE', '/api/admin/funcionalidades/1');
        if (res.status !== 400 || res.data.error !== 'La funcionalidad está asignada a menús y no puede ser eliminada.') {
             throw new Error(`Expected 400 for funcionalidad with dependencies, got ${res.status}`);
        }
        mockRoleDeps = 0;

        // DELETE FUNCIONALIDAD - Success
        res = await makeRequest('DELETE', '/api/admin/funcionalidades/1');
        if (res.status !== 200) {
             throw new Error(`Expected 200 for successful funcionalidad deletion, got ${res.status}`);
        }

        // DELETE MENU - With dependencies
        mockRoleDeps = 1;
        res = await makeRequest('DELETE', '/api/admin/menus/1');
        if (res.status !== 400 || res.data.error !== 'El menú tiene submenús hijos y no puede ser eliminado.') {
             throw new Error(`Expected 400 for menu with dependencies, got ${res.status}`);
        }
        mockRoleDeps = 0;

        // DELETE MENU - Success
        res = await makeRequest('DELETE', '/api/admin/menus/1');
        if (res.status !== 200) {
             throw new Error(`Expected 200 for successful menu deletion, got ${res.status}`);
        }



        // CREATE FUNCIONALIDAD
        res = await makeRequest('POST', '/api/admin/funcionalidades', {
            codigo: 'nueva_func',
            nombre: 'Nueva Funcionalidad',
            descripcion: 'Test desc'
        });
        if (res.status !== 201) {
            throw new Error(`Expected 201 for functionality creation, got ${res.status}`);
        }

        // UPDATE FUNCIONALIDAD
        res = await makeRequest('PUT', '/api/admin/funcionalidades/2', {
            codigo: 'updated_func',
            nombre: 'Updated Funcionalidad',
            descripcion: 'Updated desc'
        });
        if (res.status !== 200) {
            throw new Error(`Expected 200 for functionality update, got ${res.status}`);
        }

        // CREATE MENU
        res = await makeRequest('POST', '/api/admin/menus', {
            nombre: 'Nuevo Menu',
            orden: 10
        });
        if (res.status !== 201) {
            throw new Error(`Expected 201 for menu creation, got ${res.status}`);
        }

        // UPDATE MENU
        res = await makeRequest('PUT', '/api/admin/menus/2', {
            nombre: 'Updated Menu',
            orden: 20
        });
        if (res.status !== 200) {
            throw new Error(`Expected 200 for menu update, got ${res.status}`);
        }

        // TEST TEMPORARY ACCESS ASSIGNMENT
        res = await makeRequest('POST', '/api/admin/accesos', {
            usuarios: [1, 2],
            funcionalidad_id: 2,
            tipo_acceso: 'temporal',
            fecha_inicio: '2025-01-01 00:00:00',
            fecha_fin: '2025-12-31 23:59:59'
        });
        if (res.status !== 201) {
             throw new Error(`Expected 201 for temporary access assignment, got ${res.status}`);
        }

        // TEST TEMPORARY ACCESS REVOCATION
        res = await makeRequest('PUT', '/api/admin/accesos/1/revocar');
        if (res.status !== 200) {
             throw new Error(`Expected 200 for temporary access revocation, got ${res.status}`);
        }

        console.log("All Admin RBAC integration tests passed successfully.");
        process.exit(0);
    } catch (e) {
        console.error("Admin RBAC Integration Test failed: ", e.message);
        process.exit(1);
    }
}

testRBACAdmin();
