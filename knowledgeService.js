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
        } else if (userId) {
            // If the item has a functionality_id, check it against RBAC
            if (item.funcionalidad_id && allowedFunctionalityIds.has(item.funcionalidad_id)) {
                allowedMenuNames.add(item.nombre.toLowerCase());
            }
            // DO NOT blindly add items without functionality_id
        }
    }


    // Hardcode basic auth capabilities that are always public

    // Strict assignment based on real functionalities
    if (allowedFunctionalityIds.has(20)) { // Assuming 20 is the base admin functionality (Usuarios)
        allowedMenuNames.add('administrador');
    }
    if (allowedFunctionalityIds.has(10)) { // Assuming 10 is the base ideas functionality
        allowedMenuNames.add('ideas');
    }

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

        // We need to split the manual into very precise blocks to prevent a user
        // with "ideas" access from getting "admin" text just because they are in the same H2 section.
        // We'll split by newlines and create logical blocks.

        const lines = manual.split('\n');
        let blocks = [];
        let currentBlock = { header: '', content: '' };

        for (const line of lines) {
             if (line.startsWith('## ') || line.startsWith('- **') || line.startsWith('### ')) {
                  if (currentBlock.content.trim() !== '') {
                      blocks.push({...currentBlock});
                  }
                  currentBlock = { header: line, content: line + '\n' };
             } else {
                  currentBlock.content += line + '\n';
             }
        }
        if (currentBlock.content.trim() !== '') {
             blocks.push({...currentBlock});
        }

        // Normalize terms for better matching
        const normalizedQuery = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const keywords = normalizedQuery.split(' ').filter(w => w.length > 3 || w === 'lip' || w === 'sync');

        let bestMatch = null;

        // --- PRE-CHECK QUERY FOR SENSITIVE KEYWORDS ---
        // If the user's query itself is trying to fish for sensitive info, evaluate their permissions before even searching.
        const adminQueryKeywords = ['administrador', 'roles', 'permisos', 'rbac', 'admin_usuarios', 'funcionalidad_permisos', 'usuario_roles', 'gestionar usuarios', 'quiero ver los roles'];
        // Ensure "quiero ver los roles" is matched via "roles" if not explicitly listed
        const isQueryAdmin = adminQueryKeywords.some(kw => normalizedQuery.includes(kw)) || normalizedQuery.includes('roles') || normalizedQuery.includes('permisos') || normalizedQuery.includes('/api/admin');

        const ideaQueryKeywords = ['mis ideas', 'gestionar ideas', 'borrar idea', 'crear idea', 'editar idea'];
        const isQueryAuth = ideaQueryKeywords.some(kw => normalizedQuery.includes(kw));

        if (isQueryAdmin && !allowedMenus.has('administrador')) {
             return "La funcionalidad existe, pero tu usuario no tiene permisos o no está autorizado para acceder a ella.";
        }

        if (isQueryAuth && !allowedMenus.has('ideas')) {
             return "La funcionalidad de ideas existe, pero tu usuario no está autorizado (requiere iniciar sesión o permisos).";
        }

        // --- SEARCH PRECISE BLOCKS ---
        for (const block of blocks) {
            const normalizedContent = block.content.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Check relevance
            let isMatch = normalizedContent.includes(normalizedQuery);
            if (!isMatch && keywords.length > 0) {
                isMatch = keywords.some(kw => normalizedContent.includes(kw));
            }

            if (isMatch) {
                // Determine the authorization requirement based on EXACT block content
                let requiredMenu = null;

                // Admin explicit matching
                if (
                    normalizedContent.includes('## 5. requisitos') ||
                    normalizedContent.includes('## 9. modelo') ||
                    (normalizedContent.includes('- **administrador:**') || normalizedContent.includes('panel administrador:')) ||
                    (normalizedContent.includes('/api/admin/')) ||
                    adminQueryKeywords.some(kw => normalizedContent.includes(kw) && kw !== 'roles' && kw !== 'permisos') || // avoid FAQ false positive
                    normalizedContent.includes('rbac') || normalizedContent.includes('roles')
                ) {
                    requiredMenu = 'administrador';
                }

                // Auth explicit matching (Ideas)
                // Note: the general 'ideas' mention in introduction (## 1 or ## 3) is public.
                // But specific management instructions or API definitions are private.
                if (
                    (normalizedContent.includes('- **ideas:** crud') || normalizedContent.includes('mis ideas:')) ||
                    (normalizedContent.includes('/api/ideas')) ||
                    ideaQueryKeywords.some(kw => normalizedContent.includes(kw))
                ) {
                    if (requiredMenu !== 'administrador') { // Don't downgrade an admin block
                        requiredMenu = 'ideas';
                    }
                }

                // Apply the resolved policy
                if (requiredMenu === 'administrador' && !allowedMenus.has('administrador')) {
                    continue; // Skip blocks user is not allowed to see
                } else if (requiredMenu === 'ideas' && !allowedMenus.has('ideas')) {
                    continue; // Skip blocks user is not allowed to see
                }

                bestMatch = block.content.substring(0, 1000).trim();
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
