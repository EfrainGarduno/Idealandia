const assert = require('assert');
const { searchKnowledge } = require('./knowledgeService');

// Mock pool
const pool = {
    execute: async (query, args) => {
        if (query.includes('FROM menu_items')) {
            return [[
                { id: 1, nombre: 'Inicio', funcionalidad_id: null, publico: 1 },
                { id: 2, nombre: 'Ideas', funcionalidad_id: 10, publico: 0 },
                { id: 3, nombre: 'Administrador', funcionalidad_id: 20, publico: 0 }
            ]];
        }
        if (query.includes('FROM usuario_roles')) {
            const userId = args[0];
            if (userId === 999) {
                // Admin user gets access to func 20
                return [[{ funcionalidad_id: 20 }, { funcionalidad_id: 10 }]];
            } else if (userId === 100) {
                // Standard user gets access to func 10
                return [[{ funcionalidad_id: 10 }]];
            }
            return [[]];
        }
        return [[]];
    }
};

async function runTests() {
    try {
        console.log("Running knowledge service tests...");

        // 1. Guest user asking about public function
        let res = await searchKnowledge(pool, null, 'inicio');
        assert.ok(res.includes('Fuente: Catálogo'), "Guest should see public catalog for Inicio");

        // 2. Guest user asking about admin panel
        res = await searchKnowledge(pool, null, 'administrador');
        assert.ok(res.includes('tu usuario no tiene permisos o no está autorizado para acceder a ella'), "Guest should be denied admin info");

        // 2b. Guest user asking directly about sensitive manual sections (should be blocked)
        res = await searchKnowledge(pool, null, 'roles y permisos');
        assert.ok(res.includes('tu usuario no tiene permisos o no está autorizado para acceder a ella'), "Guest should be denied sensitive manual section");


        // 2e. Guest user asking about user management
        res = await searchKnowledge(pool, null, 'admin_usuarios');
        assert.ok(res.includes('tu usuario no tiene permisos o no está autorizado para acceder a ella'), "Guest should be denied admin_usuarios");

        // 2f. Guest user asking about RBAC
        res = await searchKnowledge(pool, null, 'rbac');
        assert.ok(res.includes('tu usuario no tiene permisos o no está autorizado para acceder a ella'), "Guest should be denied RBAC info");

        // 2g. Standard user asking about roles
        res = await searchKnowledge(pool, 100, 'quiero ver los roles');
        assert.ok(res.includes('tu usuario no tiene permisos o no está autorizado para acceder a ella'), "Standard user should be denied roles info");

        // 2h. Standard user asking about user management
        res = await searchKnowledge(pool, 100, 'gestionar usuarios');
        assert.ok(res.includes('tu usuario no tiene permisos o no está autorizado para acceder a ella'), "Standard user should be denied user management info");

        // 3. Authenticated standard user asking about ideas
        res = await searchKnowledge(pool, 100, 'ideas');
        assert.ok(res.includes('Gestión de Ideas') && res.includes('Fuente: Catálogo'), "User should see Ideas docs");

        // 4. Authenticated standard user asking about admin panel
        res = await searchKnowledge(pool, 100, 'administrador');
        assert.ok(res.includes('tu usuario no tiene permisos o no está autorizado para acceder a ella'), "User should be denied admin info");

        // 5. Admin user asking about admin panel
        res = await searchKnowledge(pool, 999, 'administrador');
        assert.ok(res.includes('Panel Administrador') && res.includes('Fuente: Catálogo'), "Admin should see Admin docs");

        // 6. Unknown query fallback to markdown
        res = await searchKnowledge(pool, 100, 'lip-sync');
        assert.ok(res.includes('Fuente: Manual de Usuario'), "Should fallback to manual Markdown content");

        // 7. Completely non-existent function
        res = await searchKnowledge(pool, 100, 'qwertyuiop');
        assert.equal(res, "Lo siento, no tengo información sobre esa funcionalidad en la documentación actual.");

        console.log("All knowledge service tests passed successfully.");
        process.exit(0);
    } catch (e) {
        console.error("Test failed:", e);
        process.exit(1);
    }
}

runTests();
