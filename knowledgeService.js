const fs = require('fs');
const path = require('path');

// Extract user menu logic from server.js to filter knowledge
async function getUserMenuCapabilities(pool, userId) {
    const [menuItems] = await pool.execute(
        'SELECT id, nombre, funcionalidad_id, parent_id, publico, orden FROM menu_items WHERE activo = TRUE'
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

    const allowedMenuNames = new Set();

    // Evaluate which menus the user can actually see
    for (const item of menuItems) {
        if (item.publico) {
            allowedMenuNames.add(item.nombre.toLowerCase());
        } else if (userId && (!item.funcionalidad_id || allowedFunctionalityIds.has(item.funcionalidad_id))) {
            allowedMenuNames.add(item.nombre.toLowerCase());
        }
    }

    // Hardcode basic auth capabilities that are always public
    allowedMenuNames.add("login");
    allowedMenuNames.add("register");
    allowedMenuNames.add("auth");

    return allowedMenuNames;
}

// Loads capabilities from JSON
function loadCapabilitiesJson() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, 'docs', 'idealandia_capabilities.json'), 'utf-8');
        return JSON.parse(raw);
    } catch (e) {
        console.error("Error loading idealandia_capabilities.json:", e);
        return [];
    }
}

// Search in Markdown
function searchInManual(query) {
    try {
        const manual = fs.readFileSync(path.join(__dirname, 'docs', 'idealandia_manual.md'), 'utf-8');
        const sections = manual.split(/(?=^## )/m); // Split by h2

        const q = query.toLowerCase();
        let bestMatch = null;

        for (const section of sections) {
            if (section.toLowerCase().includes(q)) {
                // Return a snippet of the section (first 500 chars to avoid token bloat)
                bestMatch = section.substring(0, 1000).trim();
                break;
            }
        }
        return bestMatch;
    } catch (e) {
        console.error("Error loading idealandia_manual.md:", e);
        return null;
    }
}

async function searchKnowledge(pool, userId, query) {
    const q = query.toLowerCase();
    const capabilities = loadCapabilitiesJson();

    // Find in capabilities
    const matchedCap = capabilities.find(c =>
        c.nombre_visible.toLowerCase().includes(q) ||
        c.descripcion.toLowerCase().includes(q) ||
        (c.ubicacion_menu && c.ubicacion_menu.toLowerCase().includes(q))
    );

    if (matchedCap) {
        // Cross-reference with DB RBAC
        const allowedMenus = await getUserMenuCapabilities(pool, userId);

        let isAllowed = false;

        // Very basic mapping for demo purposes. In real-world, mapping ID to menu would be stricter.
        if (matchedCap.id === 'cap_inicio' && allowedMenus.has('inicio')) isAllowed = true;
        else if (matchedCap.id === 'cap_ideas' && allowedMenus.has('ideas')) isAllowed = true;
        else if (matchedCap.id === 'cap_pensiones' && allowedMenus.has('servicios')) isAllowed = true;
        else if (matchedCap.id === 'cap_chat') isAllowed = !!userId; // Requires auth
        else if (matchedCap.id === 'cap_admin' && allowedMenus.has('administrador')) isAllowed = true;
        else if (matchedCap.id === 'cap_auth') isAllowed = true; // Always public

        if (!isAllowed) {
            return `[Fuente: Catálogo] La funcionalidad "${matchedCap.nombre_visible}" existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.`;
        }

        return `[Fuente: Catálogo, Sección Manual: ${matchedCap.referencia_manual}]\nFuncionalidad: ${matchedCap.nombre_visible}\nDescripción: ${matchedCap.descripcion}\nPasos: ${matchedCap.finalidad_pasos}`;
    }

    // Fallback to searching Markdown
    const manualSnippet = searchInManual(query);
    if (manualSnippet) {
        return `[Fuente: Manual de Usuario]\n${manualSnippet}`;
    }

    return "Lo siento, no tengo información sobre esa funcionalidad en la documentación actual.";
}

module.exports = {
    searchKnowledge
};
