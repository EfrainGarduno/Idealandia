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
function searchInManual(query, allowedMenus, userId) {
    try {
        const manual = fs.readFileSync(path.join(__dirname, 'docs', 'idealandia_manual.md'), 'utf-8');
        const sections = manual.split(/(?=^## )/m); // Split by h2

        // Normalize terms for better matching
        const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const keywords = normalizedQuery.split(' ').filter(w => w.length > 3 || w === 'lip' || w === 'sync');

        let bestMatch = null;

        for (const section of sections) {
            const normalizedSection = section.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Check relevance
            let isMatch = normalizedSection.includes(normalizedQuery);
            if (!isMatch && keywords.length > 0) {
                isMatch = keywords.some(kw => normalizedSection.includes(kw));
            }

            if (isMatch) {
                const isAuthSection = normalizedSection.includes('## 5. requisitos') || normalizedSection.includes('## 9. modelo');
                if (isAuthSection && !allowedMenus.has('administrador')) {
                    return "La funcionalidad existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.";
                }

                const isAdminSection = normalizedSection.includes('administrador') || normalizedSection.includes('roles') || normalizedSection.includes('permisos') || normalizedSection.includes('rbac');
                // Ensure we block if the section is primarily about admin
                if (isAdminSection && !normalizedSection.includes('## 1.') && !normalizedSection.includes('## 12.') && !normalizedSection.includes('## 10.') && !normalizedSection.includes('## 7.') && !normalizedSection.includes('## 4.')) {
                    if (!allowedMenus.has('administrador')) {
                        return "La funcionalidad existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.";
                    }
                }

                // Block if it's the specific part of section 4 that is admin
                if (normalizedSection.includes('## 4.') && normalizedSection.includes('panel administrador:') && normalizedQuery.includes('admin')) {
                    if (!allowedMenus.has('administrador')) {
                        return "La funcionalidad existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.";
                    }
                }

                // Extra block for role and permissions to be super safe
                if (normalizedSection.includes('roles y permisos') && !allowedMenus.has('administrador')) {
                    return "La funcionalidad existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.";
                }

                const isIdeasSection = normalizedSection.includes('ideas') &&
                    (normalizedSection.startsWith('## 4.') || normalizedSection.startsWith('## 8.'));
                if (isIdeasSection) {
                    if (!allowedMenus.has('ideas')) {
                        return "La funcionalidad de ideas existe, pero tu usuario no está autorizado (requiere iniciar sesión o permisos).";
                    }
                }

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
    const allowedMenus = await getUserMenuCapabilities(pool, userId);

    // Find in capabilities using better matching
    const matchedCap = capabilities.find(c => {
        const normNombre = c.nombre_visible.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const normDesc = c.descripcion.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const normQuery = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        return normNombre.includes(normQuery) ||
               normDesc.includes(normQuery) ||
               (c.ubicacion_menu && c.ubicacion_menu.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(normQuery));
    });

    if (matchedCap) {
        // Cross-reference with DB RBAC
        let isAllowed = false;

        // Match JSON requirements to DB active functionalities based on real roles, not just menu names
        if (matchedCap.requisitos_acceso.includes("Público")) {
             isAllowed = true;
        } else if (matchedCap.requisitos_acceso.includes("Requiere autenticación y Rol con permisos de Administrador")) {
             isAllowed = allowedMenus.has('administrador');
        } else if (matchedCap.requisitos_acceso.includes("Requiere autenticación")) {
             isAllowed = !!userId; // Simply logged in
        }

        if (!isAllowed) {
            return `[Fuente: Catálogo] La funcionalidad "${matchedCap.nombre_visible}" existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.`;
        }

        return `[Fuente: Catálogo, Sección Manual: ${matchedCap.referencia_manual}]\nFuncionalidad: ${matchedCap.nombre_visible}\nDescripción: ${matchedCap.descripcion}\nPasos: ${matchedCap.finalidad_pasos}`;
    }

    // Fallback to searching Markdown
    const manualSnippet = searchInManual(query, allowedMenus, userId);
    if (manualSnippet) {
        return `[Fuente: Manual de Usuario]\n${manualSnippet}`;
    }

    return "Lo siento, no tengo información sobre esa funcionalidad en la documentación actual.";
}

module.exports = {
    searchKnowledge
};
