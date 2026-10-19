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

        const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const keywords = normalizedQuery.split(' ').filter(w => w.length > 3 || w === 'lip' || w === 'sync');

        let bestMatch = null;

        // --- EXPLICIT SECTION POLICIES ---
        // Maps section numbers/names to required capabilities.
        // If a section is not mapped here, it's considered PUBLIC (or denied by default if sensitive keywords are present).
        const sectionPolicies = [
            { id: '1', name: 'presentacion y proposito', requireMenu: null },
            { id: '2', name: 'arquitectura general', requireMenu: null },
            { id: '3', name: 'menu principal', requireMenu: null },
            { id: '4', name: 'descripcion funcional', subPolicies: [
                { keyword: 'mis ideas:', requireMenu: 'ideas' },
                { keyword: 'panel administrador:', requireMenu: 'administrador' }
            ]},
            { id: '5', name: 'requisitos de acceso', requireMenu: 'administrador' },
            { id: '6', name: 'guias paso a paso', subPolicies: [
                { keyword: 'como gestionar tus ideas', requireMenu: 'ideas' }
            ]},
            { id: '7', name: 'idealita chat', requireMenu: null }, // Chat details are public docs, using it requires auth
            { id: '8', name: 'api y servicios', subPolicies: [
                { keyword: '/api/ideas', requireMenu: 'ideas' },
                { keyword: 'requireadmin', requireMenu: 'administrador' }
            ]},
            { id: '9', name: 'modelo de datos', requireMenu: 'administrador' },
            { id: '10', name: 'preguntas frecuentes', requireMenu: null },
            { id: '11', name: 'limitaciones', requireMenu: null },
            { id: '12', name: 'glosario', requireMenu: null }
        ];

        // --- PRE-CHECK QUERY FOR SENSITIVE KEYWORDS ---
        // If the user's query itself is trying to fish for sensitive info, evaluate their permissions before even searching.
        const adminQueryKeywords = ['administrador', 'roles', 'permisos', 'rbac', 'admin_usuarios', 'funcionalidad_permisos', 'usuario_roles', 'gestionar usuarios'];
        const isQueryAdmin = adminQueryKeywords.some(kw => normalizedQuery.includes(kw));

        const ideaQueryKeywords = ['mis ideas', 'gestionar ideas', 'borrar idea', 'crear idea', 'editar idea'];
        const isQueryAuth = ideaQueryKeywords.some(kw => normalizedQuery.includes(kw));

        if (isQueryAdmin && !allowedMenus.has('administrador')) {
             return "La funcionalidad existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.";
        }

        if (isQueryAuth && !allowedMenus.has('ideas')) {
             return "La funcionalidad de ideas existe, pero tu usuario no está autorizado (requiere iniciar sesión o permisos).";
        }

        // --- SEARCH SECTIONS ---
        for (const section of sections) {
            const normalizedSection = section.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Check relevance
            let isMatch = normalizedSection.includes(normalizedQuery);
            if (!isMatch && keywords.length > 0) {
                isMatch = keywords.some(kw => normalizedSection.includes(kw));
            }

            if (isMatch) {
                // Determine the authorization requirement based on explicit policy mapping
                let requiredMenu = null;

                for (const policy of sectionPolicies) {
                    if (normalizedSection.startsWith(`## ${policy.id}.`) || normalizedSection.includes(policy.name)) {
                        requiredMenu = policy.requireMenu; // Inherit section base policy

                        // Check sub-policies (e.g., specific parts of section 4 or 6)
                        if (policy.subPolicies) {
                             for (const subPolicy of policy.subPolicies) {
                                 if (normalizedSection.includes(subPolicy.keyword)) {
                                     requiredMenu = subPolicy.requireMenu;
                                     break; // Found specific sub-policy match
                                 }
                             }
                        }
                        break; // Found main policy match
                    }
                }

                // If no policy could be strictly matched but it contains admin/auth keywords, deny by default (fail-safe)
                if (requiredMenu === null) {
                    if (adminQueryKeywords.some(kw => normalizedSection.includes(kw) && kw !== 'roles' && kw !== 'permisos')) {
                        requiredMenu = 'administrador';
                    } else if (ideaQueryKeywords.some(kw => normalizedSection.includes(kw))) {
                        requiredMenu = 'ideas';
                    }
                }

                // Apply the resolved policy
                if (requiredMenu === 'administrador' && !allowedMenus.has('administrador')) {
                    return "La funcionalidad existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.";
                } else if (requiredMenu === 'ideas' && !allowedMenus.has('ideas')) {
                    return "La funcionalidad de ideas existe, pero tu usuario no está autorizado (requiere iniciar sesión o permisos).";
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
        // Cross-reference with DB RBAC using the dynamically generated allowedMenus map
        let isAllowed = false;

        // We check the explicit capabilities based on real roles and effective functional permissions
        if (matchedCap.requisitos_acceso.includes("Público")) {
             isAllowed = true;
        } else if (matchedCap.requisitos_acceso.includes("Requiere autenticación y Rol con permisos de Administrador")) {
             isAllowed = allowedMenus.has('administrador');
        } else if (matchedCap.requisitos_acceso.includes("Requiere autenticación")) {
             // Simply being logged in isn't enough if the capability explicitly requires a specific functional menu access
             if (matchedCap.id === 'cap_ideas') {
                 isAllowed = allowedMenus.has('ideas');
             } else if (matchedCap.id === 'cap_chat') {
                 isAllowed = !!userId; // Any authenticated user can use the chat UI
             } else {
                 isAllowed = !!userId;
             }
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
