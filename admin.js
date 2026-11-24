function broadcastRbacUpdate() {
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('idealandia_rbac');
            bc.postMessage({ type: 'RBAC_UPDATE', timestamp: Date.now() });
            bc.close();
        }
    } catch (e) {
        console.error('Error broadcasting RBAC update:', e);
    }
}


function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

/**
 * Crea un botón de acción homogéneo y accesible para las tablas administrativas.
 * @param {Object} options
 * @param {string} options.type - Tipo de acción (edit, delete, revoke, toggle-active, toggle-inactive, perms, default)
 * @param {string} options.icon - Clase de FontAwesome
 * @param {string} options.title - Texto descriptivo para tooltip y aria-label
 * @param {string} [options.srText] - Texto para lectores de pantalla y pruebas
 * @param {boolean} [options.disabled=false] - Si el botón debe estar deshabilitado
 * @param {string} [options.disabledTitle] - Tooltip alternativo para cuando está deshabilitado
 * @param {Function} [options.onClick] - Manejador de clic
 * @param {string} [options.className] - Clases adicionales
 * @returns {HTMLButtonElement}
 */
function createAdminActionButton({
    type = "default",
    icon,
    title,
    srText,
    disabled = false,
    disabledTitle,
    onClick,
    className = ""
}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `admin-action-btn admin-action-btn--${type} ${className}`.trim();

    const finalTitle = disabled && disabledTitle ? disabledTitle : title;
    btn.title = finalTitle;
    btn.setAttribute("aria-label", finalTitle);

    const screenReaderLabel = srText || title;
    btn.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span class="sr-only">${escapeHTML(screenReaderLabel)}</span>`;

    if (disabled) {
        btn.disabled = true;
        btn.classList.add("disabled");
        btn.style.cursor = "not-allowed";
    } else if (typeof onClick === "function") {
        btn.onclick = onClick;
    }

    return btn;
}

/**
 * Crea un contenedor agrupador para la barra compacta de acciones.
 * @returns {HTMLDivElement}
 */
function createAdminActionsGroup() {
    const group = document.createElement("div");
    group.className = "admin-actions-group";
    return group;
}

/**
 * Configura ordenamiento por columnas para una tabla administrativa.
 * Clic 1: Ascendente (↑)
 * Clic 2: Descendente (↓)
 * Clic 3: Restaura orden original
 * Excluye la columna "Acciones".
 */
function makeAdminTableSortable(table) {
    if (!table) return;
    if (table.classList.contains('simulador-table') || table.id === 'simulador-main-table' || table.closest('#servicios-financieras-view')) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    // Snapshot current rows as original order if not already set or changed
    tbody._originalRows = Array.from(tbody.querySelectorAll('tr'));

    const ths = thead.querySelectorAll('th');
    ths.forEach((th, colIndex) => {
        const headerText = th.textContent.replace(/[⇅▲▼↑↓]/g, '').trim().toLowerCase();
        if (headerText === 'acciones' || th.dataset.noSort === 'true') {
            th.classList.remove('sortable-th');
            return;
        }

        th.classList.add('sortable-th');
        th.setAttribute('tabindex', '0');
        th.setAttribute('role', 'button');
        th.setAttribute('aria-label', `Ordenar por ${th.textContent.trim()}`);

        let indicator = th.querySelector('.sort-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.innerHTML = ' <i class="fas fa-sort" aria-hidden="true"></i>';
            th.appendChild(indicator);
        }

        th.onclick = () => handleAdminTableSort(table, colIndex, th);
        th.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAdminTableSort(table, colIndex, th);
            }
        };
    });
}

function handleAdminTableSort(table, colIndex, activeTh) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const currentRows = Array.from(tbody.querySelectorAll('tr'));
    if (!tbody._originalRows || tbody._originalRows.length !== currentRows.length) {
        tbody._originalRows = [...currentRows];
    }

    const currentDir = activeTh.dataset.sortDir || 'none';
    let newDir = 'asc';
    if (currentDir === 'asc') {
        newDir = 'desc';
    } else if (currentDir === 'desc') {
        newDir = 'none';
    }

    // Reset all headers in this table
    const allThs = table.querySelectorAll('thead th');
    allThs.forEach(th => {
        if (th !== activeTh) {
            delete th.dataset.sortDir;
            th.classList.remove('sort-asc', 'sort-desc');
            const ind = th.querySelector('.sort-indicator');
            if (ind) {
                ind.innerHTML = ' <i class="fas fa-sort" aria-hidden="true"></i>';
            }
        }
    });

    if (newDir === 'none') {
        delete activeTh.dataset.sortDir;
        activeTh.classList.remove('sort-asc', 'sort-desc');
        const ind = activeTh.querySelector('.sort-indicator');
        if (ind) {
            ind.innerHTML = ' <i class="fas fa-sort" aria-hidden="true"></i>';
        }

        // Restore original rows
        tbody.innerHTML = '';
        tbody._originalRows.forEach(row => tbody.appendChild(row));
        return;
    }

    activeTh.dataset.sortDir = newDir;
    activeTh.classList.remove('sort-asc', 'sort-desc');
    activeTh.classList.add(newDir === 'asc' ? 'sort-asc' : 'sort-desc');
    const ind = activeTh.querySelector('.sort-indicator');
    if (ind) {
        ind.innerHTML = newDir === 'asc' 
            ? ' <i class="fas fa-sort-up" aria-hidden="true"></i>' 
            : ' <i class="fas fa-sort-down" aria-hidden="true"></i>';
    }

    // Sort rows
    const sorted = [...currentRows];
    sorted.sort((rowA, rowB) => {
        const cellA = rowA.children[colIndex];
        const cellB = rowB.children[colIndex];
        const textA = (cellA ? cellA.textContent : '').trim();
        const textB = (cellB ? cellB.textContent : '').trim();

        // 1. Numeric compare
        const numA = Number(textA);
        const numB = Number(textB);
        if (!isNaN(numA) && !isNaN(numB) && textA !== '' && textB !== '') {
            return newDir === 'asc' ? numA - numB : numB - numA;
        }

        // 2. Date compare (e.g. 2026-11-05...)
        const datePattern = /^\d{4}-\d{2}-\d{2}/;
        if (datePattern.test(textA) && datePattern.test(textB)) {
            const timeA = new Date(textA).getTime();
            const timeB = new Date(textB).getTime();
            if (!isNaN(timeA) && !isNaN(timeB)) {
                return newDir === 'asc' ? timeA - timeB : timeB - timeA;
            }
        }

        // 3. String compare
        const comp = textA.localeCompare(textB, 'es', { numeric: true, sensitivity: 'base' });
        return newDir === 'asc' ? comp : -comp;
    });

    tbody.innerHTML = '';
    sorted.forEach(row => tbody.appendChild(row));
}

if (typeof window !== 'undefined') {
    window.makeAdminTableSortable = makeAdminTableSortable;
    window.handleAdminTableSort = handleAdminTableSort;
}


const STANDARD_UNAUTHORIZED_MESSAGE = 'Acceso no autorizado o vencido para esta funcionalidad.';

const ADMIN_TAB_PERMISSIONS = {
    'admin-usuarios': 'usuarios.read',
    'admin-roles': 'roles.read',
    'admin-permisos': 'permisos.read',
    'admin-funcionalidades': 'funcionalidades.read',
    'admin-menus': 'menus.read',
    'admin-accesos': 'admin.access',
    'admin-asociados': 'asociados.read',
    'admin-contexto': 'contexto.read',
    'admin-finanzas-instituciones': 'finanzas.read',
    'admin-finanzas-tasas': 'finanzas.read',
    'admin-finanzas-estrategias': 'finanzas.read'
};

const ADMIN_TAB_CONFIG = [
    { tabId: 'admin-usuarios', perm: 'usuarios.read', loadFn: () => loadUsuarios() },
    { tabId: 'admin-roles', perm: 'roles.read', loadFn: () => loadRoles() },
    { tabId: 'admin-permisos', perm: 'permisos.read', loadFn: () => loadPermisos() },
    { tabId: 'admin-funcionalidades', perm: 'funcionalidades.read', loadFn: () => loadFuncionalidades() },
    { tabId: 'admin-menus', perm: 'menus.read', loadFn: () => loadMenus() },
    { tabId: 'admin-accesos', perm: 'admin.access', loadFn: () => loadAccesos() },
    { tabId: 'admin-asociados', perm: 'asociados.read', loadFn: () => loadAsociados() },
    { tabId: 'admin-contexto', perm: 'contexto.read', loadFn: () => loadAiContexto() },
    { tabId: 'admin-finanzas-instituciones', perm: 'finanzas.read', loadFn: () => loadFinanzasInstituciones() },
    { tabId: 'admin-finanzas-tasas', perm: 'finanzas.read', loadFn: () => loadFinanzasTasas() },
    { tabId: 'admin-finanzas-estrategias', perm: 'finanzas.read', loadFn: () => loadFinanzasEstrategias() }
];

function isUnauthorizedResponse(res, data) {
    if (!res) return false;
    if (res.status === 401 || res.status === 403) return true;
    if (data && (data.code === 'RBAC_PERMISSION_DENIED' || data.code === 'RBAC_ACCESS_DENIED' || data.code === 'AUTH_REQUIRED')) return true;
    if (data && typeof data.error === 'string' && (data.error.includes('Permiso denegado') || data.error.includes('Acceso no autorizado') || data.error.includes('se requiere '))) return true;
    return false;
}

function handleAdminError(res, data, defaultMsg = 'Error al procesar la solicitud.') {
    if (isUnauthorizedResponse(res, data)) {
        if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
        else alert(STANDARD_UNAUTHORIZED_MESSAGE);
        return;
    }
    const msg = (data && data.error) ? `Error: ${data.error}` : defaultMsg;
    if (window.showModal) window.showModal(msg);
    else alert(msg);
}

function clearAllAdminTables() {
    const tableIds = [
        'admin-usuarios-tbody', 'admin-roles-tbody', 'admin-permisos-tbody',
        'admin-funcionalidades-tbody', 'admin-menus-tbody', 'admin-accesos-tbody',
        'admin-asociados-tbody', 'admin-contexto-tbody', 'admin-finanzas-instituciones-tbody',
        'admin-finanzas-estrategias-tbody'
    ];
    tableIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

let isSyncingAdminTabs = false;
async function syncAdminTabsAndPermissions() {
    if (isSyncingAdminTabs) return;
    isSyncingAdminTabs = true;
    try {
        clearAllAdminTables();

        let perms = [];
        try {
            const res = await fetch('/api/admin/mis-permisos', { cache: 'no-store' });
            if (!res.ok) {
                window.userAdminPermissions = new Set();
                const adminSection = document.getElementById('admin');
                if (adminSection) adminSection.style.display = 'none';
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
                const inicioLink = document.querySelector('a[data-section="inicio"]');
                if (inicioLink) inicioLink.click();
                return;
            }
            const data = await res.json();
            perms = Array.isArray(data.permisos) ? data.permisos : [];
        } catch (fetchErr) {
            console.error('Error fetching mis-permisos:', fetchErr);
            window.userAdminPermissions = new Set();
            return;
        }

        window.userAdminPermissions = new Set(perms);

        const tabBtns = document.querySelectorAll('.admin-tab-btn');
        const tabContents = document.querySelectorAll('.admin-tab-content');

        let firstAuthorizedItem = null;

        ADMIN_TAB_CONFIG.forEach(item => {
            const btn = document.querySelector(`.admin-tab-btn[data-tab="${item.tabId}"]`);
            const content = document.getElementById(item.tabId);
            const isAuth = window.userAdminPermissions.has(item.perm);

            if (isAuth && !firstAuthorizedItem) {
                firstAuthorizedItem = item;
            }

            if (btn) {
                if (isAuth) {
                    btn.style.display = '';
                    btn.removeAttribute('disabled');
                } else {
                    btn.style.display = 'none';
                    btn.setAttribute('disabled', 'true');
                    btn.classList.remove('active');
                }
            }
            if (content) {
                if (!isAuth) {
                    content.classList.remove('active');
                    content.style.display = 'none';
                }
            }
        });

        if (!firstAuthorizedItem) {
            const adminSection = document.getElementById('admin');
            if (adminSection) adminSection.style.display = 'none';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            const inicioLink = document.querySelector('a[data-section="inicio"]');
            if (inicioLink) inicioLink.click();
            return;
        }

        const currentActiveBtn = document.querySelector('.admin-tab-btn.active');
        const currentTabId = currentActiveBtn ? currentActiveBtn.getAttribute('data-tab') : null;
        let selectedItem = null;
        if (currentTabId && window.userAdminPermissions.has(ADMIN_TAB_PERMISSIONS[currentTabId])) {
            selectedItem = ADMIN_TAB_CONFIG.find(item => item.tabId === currentTabId);
        }

        if (!selectedItem) {
            selectedItem = firstAuthorizedItem;
        }

        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => {
            c.classList.remove('active');
            c.style.display = 'none';
        });

        const activeBtn = document.querySelector(`.admin-tab-btn[data-tab="${selectedItem.tabId}"]`);
        const activeContent = document.getElementById(selectedItem.tabId);
        if (activeBtn) activeBtn.classList.add('active');
        if (activeContent) {
            activeContent.classList.add('active');
            activeContent.style.display = '';
        }

        await selectedItem.loadFn();

    } finally {
        isSyncingAdminTabs = false;
    }
}

if (typeof window !== 'undefined') {
    window.STANDARD_UNAUTHORIZED_MESSAGE = STANDARD_UNAUTHORIZED_MESSAGE;
    window.ADMIN_TAB_PERMISSIONS = ADMIN_TAB_PERMISSIONS;
    window.clearAllAdminTables = clearAllAdminTables;
    window.syncAdminTabsAndPermissions = syncAdminTabsAndPermissions;
    window.handleAdminError = handleAdminError;
    window.isUnauthorizedResponse = isUnauthorizedResponse;
    window.initAdminTabs = initAdminTabs;
}

function initAdminTabs() {
    document.querySelectorAll('.admin-table').forEach(makeAdminTableSortable);
    if (typeof initAdminBlocks === 'function') initAdminBlocks();
    const adminSection = document.getElementById('admin');

    // Setup tabs
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    const tabContents = document.querySelectorAll('.admin-tab-content');

    tabBtns.forEach(btn => {
        if (btn.dataset.configured) return;
        btn.dataset.configured = 'true';
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-tab');
            const requiredPerm = ADMIN_TAB_PERMISSIONS[targetId];

            if (window.userAdminPermissions && !window.userAdminPermissions.has(requiredPerm)) {
                e.preventDefault();
                e.stopPropagation();
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
                else if (typeof showModal === 'function') showModal(STANDARD_UNAUTHORIZED_MESSAGE);
                return;
            }

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => {
                c.classList.remove('active');
                c.style.display = 'none';
            });

            btn.classList.add('active');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.style.display = '';
            }

            // Load data when tab is clicked
            if (targetId === 'admin-usuarios') loadUsuarios();
            if (targetId === 'admin-roles') loadRoles();
            if (targetId === 'admin-permisos') loadPermisos();
            if (targetId === 'admin-funcionalidades') loadFuncionalidades();
            if (targetId === 'admin-accesos') loadAccesos();
            if (targetId === 'admin-menus') loadMenus();
            if (targetId === 'admin-asociados') loadAsociados();
            if (targetId === 'admin-contexto') loadAiContexto();
            if (targetId === 'admin-finanzas-instituciones') loadFinanzasInstituciones();
            if (targetId === 'admin-finanzas-tasas') loadFinanzasTasas();
        });
    });

    // We need to load initial tab data when the admin section becomes visible
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (adminSection.style.display === 'flex' || adminSection.style.display === 'block') {
                    syncAdminTabsAndPermissions();
                } else if (adminSection.style.display === 'none') {
                    clearAllAdminTables();
                }
            }
        });
    });

    if (adminSection && !adminSection.dataset.observed) {
        adminSection.dataset.observed = 'true';
        observer.observe(adminSection, { attributes: true });
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminTabs);
    } else {
        initAdminTabs();
    }
}

async function loadUsuarios() {
    const tbody = document.getElementById('admin-usuarios-tbody');
    if (tbody) tbody.innerHTML = '';

    if (window.userAdminPermissions && !window.userAdminPermissions.has('usuarios.read')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/usuarios');
        if (response.status === 401 || response.status === 403) {
            if (tbody) tbody.innerHTML = '';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            return;
        }
        if (!response.ok) {
            if (tbody) tbody.innerHTML = '';
            const errData = await response.json().catch(() => ({}));
            if (isUnauthorizedResponse(response, errData)) {
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            } else {
                if (window.showModal) window.showModal('Error al cargar usuarios.');
            }
            return;
        }
        const usuarios = await response.json();
        if (tbody) tbody.innerHTML = '';

        for (const u of usuarios) {
            const tr = document.createElement('tr');

            // id
            let td = document.createElement('td'); td.textContent = u.id; tr.appendChild(td);
            // usuario
            td = document.createElement('td'); td.textContent = u.usuario; tr.appendChild(td);
            // nombre
            td = document.createElement('td'); td.textContent = u.nombre; tr.appendChild(td);
            // telefono
            td = document.createElement('td'); td.textContent = u.telefono || ''; tr.appendChild(td);
            // email
            td = document.createElement('td'); td.textContent = u.email; tr.appendChild(td);

            // Roles (fetch explicitly)
            td = document.createElement('td');
            const rolesBtn = document.createElement('button');
            rolesBtn.type = 'button';
            rolesBtn.className = 'admin-pill-btn';
            rolesBtn.title = `Gestionar roles de ${escapeHTML(u.usuario)}`;
            rolesBtn.innerHTML = `<i class="fas fa-user-shield" aria-hidden="true"></i><span>Roles</span>`;
            rolesBtn.onclick = () => showEditRolesModal(u.id, u.usuario);
            td.appendChild(rolesBtn);
            tr.appendChild(td);

            // Estatus
            td = document.createElement('td');
            let statusHtml = '';
            if (u.es_asociado) {
                if (u.activo) {
                    statusHtml = '<span class="user-status-badge badge-asoc-activo"><i class="fas fa-user-check"></i> Asociado autorizado</span>';
                } else if (u.solicitud_asociado_estatus === 'rechazado') {
                    statusHtml = '<span class="user-status-badge badge-asoc-rechazado"><i class="fas fa-times-circle"></i> Asociado inactivo</span>';
                } else {
                    statusHtml = '<span class="user-status-badge badge-asoc-inactivo"><i class="fas fa-user-clock"></i> Asociado inactivo</span>';
                }
            } else {
                if (u.activo) {
                    statusHtml = '<span class="user-status-badge badge-user-activo"><i class="fas fa-check-circle"></i> Usuario activo</span>';
                } else {
                    statusHtml = '<span class="user-status-badge badge-user-inactivo"><i class="fas fa-ban"></i> Usuario inactivo</span>';
                }
            }
            td.innerHTML = statusHtml;
            tr.appendChild(td);

            // Acciones
            td = document.createElement('td');
            td.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const editBtn = createAdminActionButton({
                type: 'edit',
                icon: 'fas fa-pen',
                title: 'Editar usuario',
                srText: 'Editar',
                onClick: () => showEditUsuarioModal(u)
            });
            actionsGroup.appendChild(editBtn);

            const deleteBtn = createAdminActionButton({
                type: 'delete',
                icon: 'fas fa-trash-can',
                title: 'Eliminar usuario',
                srText: 'Eliminar',
                onClick: async () => {
                    const confirmed = await window.showConfirm(`¿Estás seguro de que deseas eliminar al usuario ${u.usuario}?`);
                    if (confirmed) {
                        try {
                            const res = await fetch(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' });
                            const data = await res.json();
                            if (res.ok) {
                                window.showModal('Usuario eliminado exitosamente.');
                                loadUsuarios();
                            } else {
                                handleAdminError(res, data, 'Error al eliminar usuario.');
                            }
                        } catch (e) {
                            console.error(e);
                            window.showModal('Error al eliminar usuario.');
                        }
                    }
                }
            });
            actionsGroup.appendChild(deleteBtn);
            td.appendChild(actionsGroup);

            tr.appendChild(td);

            tbody.appendChild(tr);
        }
        makeAdminTableSortable(tbody.closest('table'));
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '';
        if (window.showModal) window.showModal('Error al cargar usuarios.');
    }
}

async function loadRoles() {
    const tbody = document.getElementById('admin-roles-tbody');
    if (tbody) tbody.innerHTML = '';

    if (window.userAdminPermissions && !window.userAdminPermissions.has('roles.read')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/roles');
        if (response.status === 401 || response.status === 403) {
            if (tbody) tbody.innerHTML = '';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            return;
        }
        if (!response.ok) {
            if (tbody) tbody.innerHTML = '';
            const errData = await response.json().catch(() => ({}));
            if (isUnauthorizedResponse(response, errData)) {
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            } else {
                if (window.showModal) window.showModal('Error al cargar roles.');
            }
            return;
        }
        const roles = await response.json();
        if (tbody) tbody.innerHTML = '';

        for (const r of roles) {
            const tr = document.createElement('tr');

            // id
            let td = document.createElement('td'); td.textContent = r.id; tr.appendChild(td);
            // nombre
            td = document.createElement('td'); td.textContent = r.nombre; tr.appendChild(td);
            // descripcion
            td = document.createElement('td'); td.textContent = r.descripcion; tr.appendChild(td);
            // activo
            td = document.createElement('td'); td.textContent = r.activo ? 'Sí' : 'No'; tr.appendChild(td);

            // Permisos (fetch explicitly)
            td = document.createElement('td');
            const permBtn = document.createElement('button');
            permBtn.type = 'button';
            permBtn.className = 'admin-pill-btn';
            permBtn.title = `Gestionar permisos del rol ${escapeHTML(r.nombre)}`;
            permBtn.innerHTML = `<i class="fas fa-shield-alt" aria-hidden="true"></i><span>Permisos</span>`;
            permBtn.onclick = () => showEditPermisosModal(r.id, r.nombre);
            td.appendChild(permBtn);
            tr.appendChild(td);

            // Acciones
            td = document.createElement('td');
            td.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const editBtn = createAdminActionButton({
                type: 'edit',
                icon: 'fas fa-pen',
                title: 'Editar rol',
                srText: 'Editar',
                onClick: () => showEditRolModal(r)
            });
            actionsGroup.appendChild(editBtn);

            const deleteBtn = createAdminActionButton({
                type: 'delete',
                icon: 'fas fa-trash-can',
                title: 'Eliminar rol',
                srText: 'Eliminar',
                onClick: () => showDeleteRolModal(r)
            });
            actionsGroup.appendChild(deleteBtn);
            td.appendChild(actionsGroup);

            tr.appendChild(td);

            tbody.appendChild(tr);
        }
        makeAdminTableSortable(tbody.closest('table'));
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '';
        if (window.showModal) window.showModal('Error al cargar roles.');
    }
}

async function loadPermisos() {
    const tbody = document.getElementById('admin-permisos-tbody');
    if (tbody) tbody.innerHTML = '';

    if (window.userAdminPermissions && !window.userAdminPermissions.has('permisos.read')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/permisos');
        if (response.status === 401 || response.status === 403) {
            if (tbody) tbody.innerHTML = '';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            return;
        }
        if (!response.ok) {
            if (tbody) tbody.innerHTML = '';
            const errData = await response.json().catch(() => ({}));
            if (isUnauthorizedResponse(response, errData)) {
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            } else {
                if (window.showModal) window.showModal('Error al cargar permisos.');
            }
            return;
        }
        const permisos = await response.json();
        if (tbody) tbody.innerHTML = '';

        for (const p of permisos) {
            const tr = document.createElement('tr');

            let td = document.createElement('td'); td.textContent = p.id; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = p.codigo; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = p.nombre; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = p.descripcion; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = p.activo ? 'Sí' : 'No'; tr.appendChild(td);

            td = document.createElement('td');
            td.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const editBtn = createAdminActionButton({
                type: 'edit',
                icon: 'fas fa-pen',
                title: 'Editar permiso',
                srText: 'Editar',
                onClick: () => showEditPermisoModal(p)
            });
            actionsGroup.appendChild(editBtn);

            const deleteBtn = createAdminActionButton({
                type: 'delete',
                icon: 'fas fa-trash-can',
                title: 'Eliminar permiso',
                srText: 'Eliminar',
                onClick: () => showDeletePermisoModal(p)
            });
            actionsGroup.appendChild(deleteBtn);
            td.appendChild(actionsGroup);

            tr.appendChild(td);

            tbody.appendChild(tr);
        }
        makeAdminTableSortable(tbody.closest('table'));
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '';
        if (window.showModal) window.showModal('Error al cargar permisos.');
    }
}



let currentAccesoPermisosList = [];

async function renderFunctionalityPermissionsSection(container, funcId, selectedPermisoIds = []) {
    if (!container) return;
    if (!funcId) {
        container.innerHTML = '';
        container.style.display = 'none';
        currentAccesoPermisosList = [];
        return;
    }

    container.style.display = 'block';
    container.innerHTML = '<div style="padding: 10px; color: #666; font-size: 0.9em;"><i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i>Cargando permisos de la funcionalidad...</div>';

    try {
        const res = await fetch(`/api/admin/funcionalidades/${funcId}/permisos`);
        if (!res.ok) throw new Error('Error al cargar permisos');
        const permisos = await res.json();
        currentAccesoPermisosList = permisos;

        if (!permisos || permisos.length === 0) {
            container.innerHTML = `
                <div style="margin-top: 10px; margin-bottom: 12px;">
                    <label style="font-weight: 600; font-size: 0.9em; display: block; margin-bottom: 4px;">Permisos de la funcionalidad:</label>
                    <div class="acceso-perms-empty-msg" style="padding: 10px 12px; border: 1px dashed #d0d7de; border-radius: 6px; background: #fafafa; color: #666; font-style: italic; font-size: 0.88em;">
                        Esta funcionalidad no tiene permisos específicos configurados.
                    </div>
                </div>
            `;
            return;
        }

        let html = `
            <div style="margin-top: 10px; margin-bottom: 12px;">
                <label style="font-weight: 600; font-size: 0.9em; display: block; margin-bottom: 6px;">Permisos de la funcionalidad:</label>
                <div style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                    <div style="position: relative; flex-grow: 1;">
                        <input type="text" id="filter-acceso-perms" class="form-input" placeholder="Filtrar permisos..." style="width: 100%; box-sizing: border-box; padding-right: 25px; margin-bottom: 0;">
                        <span id="clear-filter-acceso-perms" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #888; display: none; font-size: 16px;">&times;</span>
                    </div>
                    <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; font-weight: 600; padding: 6px 10px; border-radius: 4px; background: #eef2f7; border: 1px solid #d0d7de; font-size: 0.9em;">
                        <input type="checkbox" id="cb-select-all-acceso-perms">
                        <span>Todo</span>
                    </label>
                </div>
                <div id="acceso-perms-list-container" style="max-height: 180px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; background: #fafafa;">
        `;

        const selectedSet = new Set(
            (selectedPermisoIds || []).map(id => typeof id === 'object' ? Number(id.id) : Number(id)).filter(n => !isNaN(n))
        );

        permisos.forEach(p => {
            const isChecked = selectedSet.has(Number(p.id)) ? 'checked' : '';
            html += `
                <div class="acceso-perm-item-row" data-perm-id="${p.id}" data-perm-nombre="${escapeHTML(p.nombre).toLowerCase()}" data-perm-codigo="${escapeHTML(p.codigo).toLowerCase()}" style="padding: 4px 6px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f0f0f0;">
                    <input type="checkbox" class="acceso-perm-checkbox" id="acceso-perm-cb-${p.id}" value="${p.id}" ${isChecked} style="cursor: pointer;">
                    <label for="acceso-perm-cb-${p.id}" style="cursor: pointer; font-size: 0.9em; display: flex; flex-direction: column; margin: 0;">
                        <span style="font-weight: 500;">${escapeHTML(p.nombre)} <code style="font-size: 0.85em; color: #57606a;">(${escapeHTML(p.codigo)})</code></span>
                        ${p.descripcion ? `<span style="font-size: 0.78em; color: #6e7781;">${escapeHTML(p.descripcion)}</span>` : ''}
                    </label>
                </div>
            `;
        });

        html += `
                    <div id="acceso-perms-filter-empty" style="display: none; padding: 8px; color: #888; font-style: italic; text-align: center; font-size: 0.85em;">
                        No se encontraron permisos coincidentes.
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Tri-state and filter logic
        const filterInput = container.querySelector('#filter-acceso-perms');
        const clearFilterBtn = container.querySelector('#clear-filter-acceso-perms');
        const selectAllCb = container.querySelector('#cb-select-all-acceso-perms');
        const listContainer = container.querySelector('#acceso-perms-list-container');
        const filterEmpty = container.querySelector('#acceso-perms-filter-empty');
        const rows = Array.from(listContainer.querySelectorAll('.acceso-perm-item-row'));

        function updateSelectAllState() {
            const visibleRows = rows.filter(r => r.style.display !== 'none');
            if (visibleRows.length === 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
                if (filterEmpty) filterEmpty.style.display = 'block';
                return;
            }
            if (filterEmpty) filterEmpty.style.display = 'none';

            const visibleCheckboxes = visibleRows.map(r => r.querySelector('.acceso-perm-checkbox'));
            const checkedCount = visibleCheckboxes.filter(cb => cb && cb.checked).length;

            if (checkedCount === 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            } else if (checkedCount === visibleCheckboxes.length) {
                selectAllCb.checked = true;
                selectAllCb.indeterminate = false;
            } else {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = true;
            }
        }

        selectAllCb.onclick = () => {
            const targetState = selectAllCb.checked;
            const visibleRows = rows.filter(r => r.style.display !== 'none');
            visibleRows.forEach(r => {
                const cb = r.querySelector('.acceso-perm-checkbox');
                if (cb) cb.checked = targetState;
            });
            selectAllCb.indeterminate = false;
            updateSelectAllState();
        };

        rows.forEach(r => {
            const cb = r.querySelector('.acceso-perm-checkbox');
            if (cb) cb.addEventListener('change', updateSelectAllState);
        });

        function applyFilter() {
            const term = filterInput.value.trim().toLowerCase();
            clearFilterBtn.style.display = term ? 'block' : 'none';
            rows.forEach(r => {
                const nombre = r.getAttribute('data-perm-nombre') || '';
                const codigo = r.getAttribute('data-perm-codigo') || '';
                const match = !term || nombre.includes(term) || codigo.includes(term);
                r.style.display = match ? 'flex' : 'none';
            });
            updateSelectAllState();
        }

        filterInput.addEventListener('input', applyFilter);
        clearFilterBtn.onclick = () => {
            filterInput.value = '';
            applyFilter();
            filterInput.focus();
        };

        updateSelectAllState();
    } catch (err) {
        console.error('Error rendering functionality permissions:', err);
        container.innerHTML = '<div style="color: #c00; font-size: 0.85em; padding: 6px;">Error al cargar los permisos de la funcionalidad.</div>';
    }
}

async function loadAccesos() {
    const tbody = document.getElementById('admin-accesos-tbody');
    if (tbody) tbody.innerHTML = '';

    if (window.userAdminPermissions && !window.userAdminPermissions.has('admin.access')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/accesos');
        if (response.status === 401 || response.status === 403) {
            if (tbody) tbody.innerHTML = '';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            return;
        }
        if (!response.ok) {
            if (tbody) tbody.innerHTML = '';
            const errData = await response.json().catch(() => ({}));
            if (isUnauthorizedResponse(response, errData)) {
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            } else {
                if (window.showModal) window.showModal('Error al cargar accesos.');
            }
            return;
        }
        const accesos = await response.json();
        if (tbody) tbody.innerHTML = '';

        if (accesos.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 10;
            td.textContent = 'No hay accesos temporales asignados o encontrados.';
            td.style.textAlign = 'center';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }

        for (const a of accesos) {
            const tr = document.createElement('tr');

            let td = document.createElement('td'); td.textContent = a.id; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = a.usuario_nombre; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = a.funcionalidad_nombre; tr.appendChild(td);

            // Permisos asignados
            td = document.createElement('td');
            if (Array.isArray(a.permisos) && a.permisos.length > 0) {
                const badgesDiv = document.createElement('div');
                badgesDiv.style.display = 'flex';
                badgesDiv.style.flexWrap = 'wrap';
                badgesDiv.style.gap = '4px';
                a.permisos.forEach(p => {
                    const span = document.createElement('span');
                    span.className = 'admin-pill-badge';
                    span.textContent = p.codigo || p.nombre || p;
                    span.title = p.nombre || p.descripcion || '';
                    badgesDiv.appendChild(span);
                });
                td.appendChild(badgesDiv);
            } else {
                const emptySpan = document.createElement('span');
                emptySpan.style.color = '#888';
                emptySpan.style.fontSize = '0.85em';
                emptySpan.textContent = 'Sin permisos específicos';
                td.appendChild(emptySpan);
            }
            tr.appendChild(td);

            td = document.createElement('td'); td.textContent = a.tipo_acceso; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = a.fecha_inicio ? new Date(a.fecha_inicio).toLocaleString() : 'N/A'; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = a.fecha_fin ? new Date(a.fecha_fin).toLocaleString() : 'N/A'; tr.appendChild(td);

            let computedEstado = a.estado;
            if (computedEstado === 'activo' && a.tipo_acceso === 'temporal') {
                const now = new Date();
                if (a.fecha_inicio && new Date(a.fecha_inicio) > now) {
                    computedEstado = 'programado';
                } else if (a.fecha_fin && new Date(a.fecha_fin) < now) {
                    computedEstado = 'expirado';
                }
            }
            td = document.createElement('td');
            td.textContent = computedEstado;

            // Highlight specific statuses for better UX
            if (computedEstado === 'programado') td.style.color = '#FFA500';
            if (computedEstado === 'expirado') td.style.color = '#808080';
            if (computedEstado === 'revocado') td.style.color = '#FF0000';

            tr.appendChild(td);

            td = document.createElement('td'); td.textContent = a.asignado_por_nombre || 'N/A'; tr.appendChild(td);

            td = document.createElement('td');
            td.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const isRevocado = a.estado === 'revocado';
            const editBtn = createAdminActionButton({
                type: 'edit',
                icon: 'fas fa-pen',
                title: 'Editar acceso temporal',
                srText: 'Editar',
                disabled: isRevocado,
                disabledTitle: 'No se puede editar un acceso revocado',
                onClick: () => showEditAccesoModal(a)
            });
            actionsGroup.appendChild(editBtn);

            if (a.estado === 'activo') {
                const revokeBtn = createAdminActionButton({
                    type: 'revoke',
                    icon: 'fas fa-ban',
                    title: 'Revocar acceso',
                    srText: 'Revocar',
                    onClick: () => showRevokeAccesoModal(a)
                });
                actionsGroup.appendChild(revokeBtn);
            }

            // Botón Eliminar: SOLO se muestra en las filas cuyo estado permita eliminar (Vencido o Revocado)
            const canDelete = isRevocado || (computedEstado === 'expirado');
            if (canDelete) {
                const deleteBtn = createAdminActionButton({
                    type: 'delete',
                    icon: 'fas fa-trash-can',
                    title: 'Eliminar acceso temporal',
                    srText: 'Eliminar',
                    onClick: () => showDeleteAccesoModal(a)
                });
                actionsGroup.appendChild(deleteBtn);
            }
            td.appendChild(actionsGroup);
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        makeAdminTableSortable(tbody.closest('table'));
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '';
        if (window.showModal) window.showModal('Error al cargar accesos.');
    }
}

function showRevokeAccesoModal(a) {
    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Revocar Acceso</h3><p>¿Estás seguro de que deseas revocar este acceso para el usuario ${escapeHTML(a.usuario_nombre)} a la funcionalidad ${escapeHTML(a.funcionalidad_nombre)}?</p>`;

    buttonsContainer.innerHTML = `
        <button id="btn-confirm-revoke-acceso" class="btn btn-danger">Revocar</button>
        <button id="btn-cancel-revoke-acceso" class="btn btn-secondary">Cancelar</button>
    `;

    overlay.classList.add('active');

    document.getElementById('btn-cancel-revoke-acceso').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-confirm-revoke-acceso').onclick = async () => {
        try {
            const res = await fetch(`/api/admin/accesos/${a.id}/revocar`, {
                method: 'PUT'
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Acceso revocado.');
                broadcastRbacUpdate();
                loadAccesos();
            } else {
                handleAdminError(res, data, 'Error al revocar acceso.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al revocar acceso.');
        }
    };
}

function showDeleteAccesoModal(a) {
    const isRevocado = a.estado === 'revocado';
    let computedEstado = a.estado;
    if (computedEstado === 'activo' && a.tipo_acceso === 'temporal' && a.fecha_fin && new Date(a.fecha_fin) < new Date()) {
        computedEstado = 'expirado';
    }

    if (!isRevocado && computedEstado !== 'expirado') {
        if (window.showModal) window.showModal('Solo se pueden eliminar accesos temporales vencidos o revocados.');
        return;
    }

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Eliminar Acceso Temporal</h3><p>¿Estás seguro de que deseas eliminar permanentemente este registro de acceso de <strong>${escapeHTML(a.usuario_nombre)}</strong> a la funcionalidad <strong>${escapeHTML(a.funcionalidad_nombre)}</strong>?</p>`;

    buttonsContainer.innerHTML = `
        <button id="btn-confirm-delete-acceso" class="btn btn-danger">Eliminar</button>
        <button id="btn-cancel-delete-acceso" class="btn btn-secondary">Cancelar</button>
    `;

    overlay.classList.add('active');

    document.getElementById('btn-cancel-delete-acceso').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-confirm-delete-acceso').onclick = async () => {
        try {
            const res = await fetch(`/api/admin/accesos/${a.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                if (window.showModal) window.showModal('Acceso temporal eliminado exitosamente.');
                if (typeof broadcastRbacUpdate === 'function') broadcastRbacUpdate();
                loadAccesos();
            } else {
                handleAdminError(res, data, 'No se pudo eliminar el acceso.');
            }
        } catch (e) {
            console.error(e);
            if (window.showModal) window.showModal('Error al eliminar acceso temporal.');
        }
    };
}

async function showCreateAccesoModal() {
    try {
        const [funcRes, userRes] = await Promise.all([
            fetch('/api/admin/funcionalidades'),
            fetch('/api/admin/usuarios')
        ]);
        if (!funcRes.ok || !userRes.ok) throw new Error('Error al cargar datos necesarios');

        const funcionalidades = await funcRes.json();
        const usuarios = await userRes.json();

        let userOptions = usuarios.map(u => `
            <div>
                <input type="checkbox" id="user-cb-${u.id}" value="${escapeHTML(u.id)}">
                <label for="user-cb-${u.id}">${escapeHTML(u.nombre)} (${escapeHTML(u.usuario)})</label>
            </div>
        `).join('');

        let funcOptions = '<option value="">-- Seleccionar --</option>' + funcionalidades.map(f => `<option value="${escapeHTML(f.id)}">${escapeHTML(f.nombre)}</option>`).join('');

        const html = `
            <div style="text-align: left; max-height: 400px; overflow-y: auto;">
                <label>Usuarios (Selecciona uno o más):</label>
                <div style="max-height: 100px; overflow-y: auto; border: 1px solid #ccc; padding: 5px; margin-bottom: 10px;">
                    ${userOptions}
                </div>

                <label>Funcionalidad:</label>
                <select id="create-acceso-func" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    ${funcOptions}
                </select>

                <div id="create-acceso-perms-container" style="display: none;"></div>

                <label>Tipo de Acceso:</label>
                <select id="create-acceso-tipo" class="form-input" style="width: 100%; margin-bottom: 10px;" onchange="toggleAccesoDates()">
                    <option value="temporal">Temporal</option>
                    <option value="permanente">Permanente</option>
                </select>

                <div id="create-acceso-fechas">
                    <label>Fecha y Hora de Inicio:</label>
                    <input type="datetime-local" id="create-acceso-inicio" class="form-input" style="width: 100%; margin-bottom: 10px;">

                    <label>Fecha y Hora de Fin:</label>
                    <input type="datetime-local" id="create-acceso-fin" class="form-input" style="width: 100%; margin-bottom: 10px;">
                </div>
            </div>
        `;

        const overlay = document.getElementById('custom-modal');
        const textElement = document.getElementById('custom-modal-message');
        const buttonsContainer = document.getElementById('custom-modal-buttons');

        textElement.innerHTML = `<h3>Otorgar Acceso a Funcionalidad</h3>` + html;

        buttonsContainer.innerHTML = `
            <button id="btn-save-acceso" class="btn btn-primary">Asignar</button>
            <button id="btn-cancel-acceso" class="btn btn-secondary">Cancelar</button>
        `;

        overlay.classList.add('active');

        const funcSelect = document.getElementById('create-acceso-func');
        const permsContainer = document.getElementById('create-acceso-perms-container');
        if (funcSelect && permsContainer) {
            funcSelect.addEventListener('change', () => {
                const funcId = funcSelect.value;
                renderFunctionalityPermissionsSection(permsContainer, funcId, []);
            });
        }

        window.toggleAccesoDates = () => {
             const tipo = document.getElementById('create-acceso-tipo').value;
             document.getElementById('create-acceso-fechas').style.display = tipo === 'temporal' ? 'block' : 'none';
        };

        document.getElementById('btn-cancel-acceso').onclick = () => overlay.classList.remove('active');
        document.getElementById('btn-save-acceso').onclick = async () => {
            const selectedUsers = Array.from(document.querySelectorAll('input[id^="user-cb-"]:checked')).map(cb => parseInt(cb.value));
            const funcionalidad_id = parseInt(document.getElementById('create-acceso-func').value);
            const tipo_acceso = document.getElementById('create-acceso-tipo').value;
            const fecha_inicio = document.getElementById('create-acceso-inicio').value;
            const fecha_fin = document.getElementById('create-acceso-fin').value;

            if (selectedUsers.length === 0 || !funcionalidad_id) {
                window.showModal('Selecciona al menos un usuario y una funcionalidad.');
                return;
            }

            const selectedPermisos = Array.from(document.querySelectorAll('#create-acceso-perms-container .acceso-perm-checkbox:checked')).map(cb => parseInt(cb.value));
            try {
                const res = await fetch('/api/admin/accesos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        usuarios: selectedUsers,
                        funcionalidad_id,
                        tipo_acceso,
                        fecha_inicio: fecha_inicio ? fecha_inicio.replace('T', ' ') + ':00' : null,
                        fecha_fin: fecha_fin ? fecha_fin.replace('T', ' ') + ':00' : null,
                        permisos: selectedPermisos
                    })
                });
                const data = await res.json();
                overlay.classList.remove('active');
                if (res.ok) {
                    window.showModal('Accesos otorgados exitosamente.');
                    broadcastRbacUpdate();
                    loadAccesos();
                } else {
                    handleAdminError(res, data, 'Error al otorgar accesos.');
                }
            } catch (e) {
                console.error(e);
                window.showModal('Error al otorgar accesos.');
            }
        };
    } catch (e) {
        console.error(e);
        window.showModal('Error al preparar el formulario de accesos.');
    }
}

async function loadFuncionalidades() {
    const tbody = document.getElementById('admin-funcionalidades-tbody');
    if (tbody) tbody.innerHTML = '';

    if (window.userAdminPermissions && !window.userAdminPermissions.has('funcionalidades.read')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/funcionalidades');
        if (response.status === 401 || response.status === 403) {
            if (tbody) tbody.innerHTML = '';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            return;
        }
        if (!response.ok) {
            if (tbody) tbody.innerHTML = '';
            const errData = await response.json().catch(() => ({}));
            if (isUnauthorizedResponse(response, errData)) {
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            } else {
                if (window.showModal) window.showModal('Error al cargar funcionalidades.');
            }
            return;
        }
        const funcionalidades = await response.json();
        if (tbody) tbody.innerHTML = '';

        for (const f of funcionalidades) {
            const tr = document.createElement('tr');

            let td = document.createElement('td'); td.textContent = f.id; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = f.codigo; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = f.nombre; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = f.descripcion; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = f.ruta || ''; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = f.activo ? 'Sí' : 'No'; tr.appendChild(td);


            td = document.createElement('td');
            td.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const editBtn = createAdminActionButton({
                type: 'edit',
                icon: 'fas fa-pen',
                title: 'Editar funcionalidad',
                srText: 'Editar',
                onClick: () => showEditFuncionalidadModal(f)
            });
            actionsGroup.appendChild(editBtn);

            const permBtn = createAdminActionButton({
                type: 'perms',
                icon: 'fas fa-shield-alt',
                title: 'Gestionar permisos asociados',
                srText: 'Permisos',
                onClick: () => showEditFuncPermisosModal(f.id, f.nombre)
            });
            actionsGroup.appendChild(permBtn);

            const deleteBtn = createAdminActionButton({
                type: 'delete',
                icon: 'fas fa-trash-can',
                title: 'Eliminar funcionalidad',
                srText: 'Eliminar',
                onClick: () => showDeleteFuncionalidadModal(f)
            });
            actionsGroup.appendChild(deleteBtn);
            td.appendChild(actionsGroup);

            tr.appendChild(td);

            tbody.appendChild(tr);
        }
        makeAdminTableSortable(tbody.closest('table'));
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '';
        if (window.showModal) window.showModal('Error al cargar funcionalidades.');
    }
}

async function loadMenus() {
    const tbody = document.getElementById('admin-menus-tbody');
    if (tbody) tbody.innerHTML = '';

    if (window.userAdminPermissions && !window.userAdminPermissions.has('menus.read')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/menus');
        if (response.status === 401 || response.status === 403) {
            if (tbody) tbody.innerHTML = '';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            return;
        }
        if (!response.ok) {
            if (tbody) tbody.innerHTML = '';
            const errData = await response.json().catch(() => ({}));
            if (isUnauthorizedResponse(response, errData)) {
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            } else {
                if (window.showModal) window.showModal('Error al cargar menús.');
            }
            return;
        }
        const menus = await response.json();
        if (tbody) tbody.innerHTML = '';

        for (const m of menus) {
            const tr = document.createElement('tr');

            let td = document.createElement('td'); td.textContent = m.id; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.nombre; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.funcionalidad_id !== null ? m.funcionalidad_id : 'NULL'; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.parent_id !== null ? m.parent_id : 'NULL'; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.orden; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.publico ? 'Sí' : 'No'; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.activo ? 'Sí' : 'No'; tr.appendChild(td);

            td = document.createElement('td');
            td.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const editBtn = createAdminActionButton({
                type: 'edit',
                icon: 'fas fa-pen',
                title: 'Editar menú',
                srText: 'Editar',
                onClick: () => showEditMenuModal(m)
            });
            actionsGroup.appendChild(editBtn);

            const toggleBtn = createAdminActionButton({
                type: m.activo ? 'toggle-active' : 'toggle-inactive',
                icon: m.activo ? 'fas fa-toggle-on' : 'fas fa-toggle-off',
                title: m.activo ? 'Desactivar menú' : 'Activar menú',
                srText: m.activo ? 'Desactivar' : 'Activar',
                onClick: async () => {
                    try {
                        const res = await fetch(`/api/admin/menus/${m.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...m, activo: !m.activo })
                        });
                        if (res.ok) {
                            window.showModal(`Menú ${m.activo ? 'desactivado' : 'activado'}.`);
                            loadMenus();
                        } else {
                            const data = await res.json();
                            handleAdminError(res, data, 'Error al cambiar estado del menú.');
                        }
                    } catch (e) {
                        console.error(e);
                        window.showModal('Error al cambiar estado del menú.');
                    }
                }
            });
            actionsGroup.appendChild(toggleBtn);

            const deleteBtn = createAdminActionButton({
                type: 'delete',
                icon: 'fas fa-trash-can',
                title: 'Eliminar menú',
                srText: 'Eliminar',
                onClick: () => showDeleteMenuModal(m)
            });
            actionsGroup.appendChild(deleteBtn);
            td.appendChild(actionsGroup);

            tr.appendChild(td);
            tbody.appendChild(tr);
        }
        makeAdminTableSortable(tbody.closest('table'));
    } catch (error) {
        console.error(error);
        if (tbody) tbody.innerHTML = '';
        if (window.showModal) window.showModal('Error al cargar menús.');
    }
}

// --- MODALS FOR EDITING ---

async function showEditUsuarioModal(u) {
    const html = `
        <div style="text-align: left;">
            <label>Nombre:</label>
            <input type="text" id="edit-user-nombre" value="${escapeHTML(u.nombre)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Teléfono:</label>
            <input type="text" id="edit-user-telefono" value="${escapeHTML(u.telefono || '')}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Email:</label>
            <input type="email" id="edit-user-email" value="${escapeHTML(u.email)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <button id="btn-save-user" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-user" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Editar Usuario: ${escapeHTML(u.usuario)}</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-user').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-user').onclick = async () => {
        const nombre = document.getElementById('edit-user-nombre').value;
        const telefono = document.getElementById('edit-user-telefono').value;
        const email = document.getElementById('edit-user-email').value;

        try {
            const res = await fetch(`/api/admin/usuarios/${u.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, telefono, email })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Usuario actualizado.');
                loadUsuarios();
            } else {
                handleAdminError(res, data, 'Error al actualizar usuario.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al actualizar usuario.');
        }
    };
}

async function showEditRolesModal(userId, username) {
    try {
        const [userRolesRes, allRolesRes] = await Promise.all([
            fetch(`/api/admin/usuario_roles/${userId}`),
            fetch('/api/admin/roles')
        ]);

        if (!userRolesRes.ok || !allRolesRes.ok) throw new Error('Error al obtener datos');

        const userRoles = await userRolesRes.json();
        const allRoles = await allRolesRes.json();

        let html = `
            <div style="text-align: left; max-height: 300px; overflow-y: auto; margin-bottom: 10px;">
        `;

        allRoles.forEach(r => {
            const isChecked = userRoles.includes(r.id) ? 'checked' : '';
            html += `
                <div>
                    <input type="checkbox" id="role-cb-${r.id}" value="${escapeHTML(r.id)}" ${isChecked}>
                    <label for="role-cb-${r.id}">${escapeHTML(r.nombre)} (${escapeHTML(r.descripcion)})</label>
                </div>
            `;
        });

        html += `
            </div>
            <button id="btn-save-user-roles" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-user-roles" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        `;

        const overlay = document.getElementById('custom-modal');
        const textElement = document.getElementById('custom-modal-message');
        const buttonsContainer = document.getElementById('custom-modal-buttons');

        textElement.innerHTML = `<h3>Roles de: ${escapeHTML(username)}</h3>` + html;
        buttonsContainer.innerHTML = '';
        overlay.classList.add('active');

        document.getElementById('btn-cancel-user-roles').onclick = () => overlay.classList.remove('active');
        document.getElementById('btn-save-user-roles').onclick = async () => {
            const selectedRoles = Array.from(document.querySelectorAll('input[id^="role-cb-"]:checked')).map(cb => parseInt(cb.value));
            try {
                const res = await fetch(`/api/admin/usuario_roles/${userId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roles: selectedRoles })
                });
                const data = await res.json();
                overlay.classList.remove('active');
                if (res.ok) {
                    window.showModal('Roles actualizados.');
                    broadcastRbacUpdate();
                    loadUsuarios();
                } else {
                    handleAdminError(res, data, 'Error al actualizar roles.');
                }
            } catch (e) {
                console.error(e);
                window.showModal('Error al actualizar roles.');
            }
        };

    } catch (error) {
        console.error(error);
        window.showModal('Error al cargar roles del usuario.');
    }
}

async function showEditPermisosModal(rolId, rolName) {
    try {
        const [rolPermsRes, allPermsRes] = await Promise.all([
            fetch(`/api/admin/rol_permisos/${rolId}`),
            fetch('/api/admin/permisos')
        ]);

        if (!rolPermsRes.ok || !allPermsRes.ok) throw new Error('Error al obtener datos');

        const rolPerms = await rolPermsRes.json();
        const allPerms = await allPermsRes.json();

        let html = `
            <div class="rol-perms-modal-wrapper" style="text-align: left;">
                <div class="rol-perms-toolbar" style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
                    <div style="position: relative; flex: 1; min-width: 200px;">
                        <input type="text" id="filter-rol-perms" class="form-input" placeholder="Buscar permisos (código, nombre)..." style="width: 100%; box-sizing: border-box; padding-right: 28px;">
                        <span id="clear-filter-rol-perms" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #888; display: none; font-size: 16px;">&times;</span>
                    </div>
                    <label style="display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; font-weight: 600; padding: 6px 10px; border-radius: 4px; background: #eef2f7; border: 1px solid #d0d7de;">
                        <input type="checkbox" id="cb-select-all-rol-perms">
                        <span>Todo</span>
                    </label>
                </div>
                <div id="rol-perms-list-container" style="max-height: 320px; overflow-y: auto; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; margin-bottom: 12px; background: #fafafa;">
        `;

        allPerms.forEach(p => {
            const isChecked = rolPerms.includes(p.id) ? 'checked' : '';
            html += `
                <div class="perm-item-row" data-perm-id="${p.id}" data-perm-nombre="${escapeHTML(p.nombre).toLowerCase()}" data-perm-codigo="${escapeHTML(p.codigo).toLowerCase()}" style="padding: 5px 4px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #f0f0f0;">
                    <input type="checkbox" class="perm-checkbox" id="perm-cb-${p.id}" value="${escapeHTML(p.id)}" ${isChecked}>
                    <label for="perm-cb-${p.id}" style="cursor: pointer; margin: 0; line-height: 1.3; flex: 1;">
                        <strong>${escapeHTML(p.nombre)}</strong> <span style="color: #666; font-size: 0.9em;">(${escapeHTML(p.codigo)})</span>
                    </label>
                </div>
            `;
        });

        html += `
                </div>
                <div id="rol-perms-empty-msg" style="display: none; padding: 12px; color: #888; text-align: center; font-style: italic;">
                    No se encontraron permisos que coincidan con la búsqueda.
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
                    <button id="btn-cancel-rol-perms" class="btn btn-secondary">Cancelar</button>
                    <button id="btn-save-rol-perms" class="btn btn-primary">Guardar</button>
                </div>
            </div>
        `;

        const overlay = document.getElementById('custom-modal');
        const textElement = document.getElementById('custom-modal-message');
        const buttonsContainer = document.getElementById('custom-modal-buttons');

        textElement.innerHTML = `<h3>Permisos de Rol: ${escapeHTML(rolName)}</h3>` + html;
        buttonsContainer.innerHTML = '';
        overlay.classList.add('active');

        // Logic for Filter, "Todo" Tri-state, and Individual Checkboxes
        const filterInput = document.getElementById('filter-rol-perms');
        const clearFilterBtn = document.getElementById('clear-filter-rol-perms');
        const selectAllCb = document.getElementById('cb-select-all-rol-perms');
        const listContainer = document.getElementById('rol-perms-list-container');
        const emptyMsg = document.getElementById('rol-perms-empty-msg');
        const rows = Array.from(listContainer.querySelectorAll('.perm-item-row'));

        function updateSelectAllState() {
            const visibleRows = rows.filter(r => r.style.display !== 'none');
            if (visibleRows.length === 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
                if (emptyMsg) emptyMsg.style.display = 'block';
                return;
            }
            if (emptyMsg) emptyMsg.style.display = 'none';

            const visibleCheckboxes = visibleRows.map(r => r.querySelector('.perm-checkbox'));
            const checkedCount = visibleCheckboxes.filter(cb => cb && cb.checked).length;

            if (checkedCount === 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            } else if (checkedCount === visibleCheckboxes.length) {
                selectAllCb.checked = true;
                selectAllCb.indeterminate = false;
            } else {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = true;
            }
        }

        // Handle "Todo" checkbox click
        selectAllCb.onclick = () => {
            const targetState = selectAllCb.checked;
            const visibleRows = rows.filter(r => r.style.display !== 'none');
            visibleRows.forEach(r => {
                const cb = r.querySelector('.perm-checkbox');
                if (cb) {
                    cb.checked = targetState;
                }
            });
            selectAllCb.indeterminate = false;
            updateSelectAllState();
        };

        // Handle individual checkbox changes
        rows.forEach(r => {
            const cb = r.querySelector('.perm-checkbox');
            if (cb) {
                cb.addEventListener('change', updateSelectAllState);
            }
        });

        // Handle search filter
        function applyFilter() {
            const term = (filterInput.value || '').toLowerCase().trim();
            if (clearFilterBtn) {
                clearFilterBtn.style.display = term ? 'inline' : 'none';
            }
            rows.forEach(r => {
                const nombre = r.dataset.permNombre || '';
                const codigo = r.dataset.permCodigo || '';
                const fullText = r.textContent.toLowerCase();
                const matches = !term || fullText.includes(term) || nombre.includes(term) || codigo.includes(term);
                r.style.display = matches ? 'flex' : 'none';
            });
            updateSelectAllState();
        }

        filterInput.addEventListener('input', applyFilter);
        if (clearFilterBtn) {
            clearFilterBtn.onclick = () => {
                filterInput.value = '';
                applyFilter();
                filterInput.focus();
            };
        }

        // Initialize "Todo" state based on currently loaded role permissions
        updateSelectAllState();

        document.getElementById('btn-cancel-rol-perms').onclick = () => overlay.classList.remove('active');
        document.getElementById('btn-save-rol-perms').onclick = async () => {
            const selectedPerms = Array.from(document.querySelectorAll('input[id^="perm-cb-"]:checked')).map(cb => parseInt(cb.value));
            try {
                const res = await fetch(`/api/admin/rol_permisos/${rolId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ permisos: selectedPerms })
                });
                const data = await res.json();
                overlay.classList.remove('active');
                if (res.ok) {
                    window.showModal('Permisos actualizados.');
                    broadcastRbacUpdate();
                    loadRoles();
                } else {
                    handleAdminError(res, data, 'Error al actualizar permisos.');
                }
            } catch (e) {
                console.error(e);
                window.showModal('Error al actualizar permisos.');
            }
        };

    } catch (error) {
        console.error(error);
        window.showModal('Error al cargar permisos del rol.');
    }
}

function showCreatePermisoModal() {
    const html = `
        <div style="text-align: left;">
            <label>Código:</label>
            <input type="text" id="create-permiso-codigo" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Nombre:</label>
            <input type="text" id="create-permiso-nombre" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Descripción:</label>
            <input type="text" id="create-permiso-desc" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>
                <input type="checkbox" id="create-permiso-activo" checked> Activo
            </label>
            <br>
            <button id="btn-save-new-permiso" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-new-permiso" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Crear Nuevo Permiso</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-new-permiso').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-new-permiso').onclick = async () => {
        const codigo = document.getElementById('create-permiso-codigo').value;
        const nombre = document.getElementById('create-permiso-nombre').value;
        const descripcion = document.getElementById('create-permiso-desc').value;
        const activo = document.getElementById('create-permiso-activo').checked;

        try {
            const res = await fetch('/api/admin/permisos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo, nombre, descripcion, activo })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Permiso creado.');
                loadPermisos();
            } else {
                handleAdminError(res, data, 'Error al crear permiso.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al crear permiso.');
        }
    };
}

function showEditPermisoModal(p) {
    const html = `
        <div style="text-align: left;">
            <label>Código:</label>
            <input type="text" id="edit-permiso-codigo" value="${escapeHTML(p.codigo)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Nombre:</label>
            <input type="text" id="edit-permiso-nombre" value="${escapeHTML(p.nombre)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Descripción:</label>
            <input type="text" id="edit-permiso-desc" value="${escapeHTML(p.descripcion)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>
                <input type="checkbox" id="edit-permiso-activo" ${p.activo ? 'checked' : ''}> Activo
            </label>
            <br>
            <button id="btn-save-edit-permiso" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-edit-permiso" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Editar Permiso (ID: ${p.id})</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-edit-permiso').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-edit-permiso').onclick = async () => {
        const codigo = document.getElementById('edit-permiso-codigo').value;
        const nombre = document.getElementById('edit-permiso-nombre').value;
        const descripcion = document.getElementById('edit-permiso-desc').value;
        const activo = document.getElementById('edit-permiso-activo').checked;

        try {
            const res = await fetch(`/api/admin/permisos/${p.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo, nombre, descripcion, activo })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Permiso actualizado.');
                loadPermisos();
            } else {
                handleAdminError(res, data, 'Error al actualizar permiso.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al actualizar permiso.');
        }
    };
}

function showDeletePermisoModal(p) {
    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Eliminar Permiso</h3><p>¿Estás seguro de que deseas eliminar el permiso "${escapeHTML(p.codigo)}"?</p>`;

    buttonsContainer.innerHTML = `
        <button id="btn-confirm-delete-permiso" class="btn btn-danger">Eliminar</button>
        <button id="btn-cancel-delete-permiso" class="btn btn-secondary">Cancelar</button>
    `;

    overlay.classList.add('active');

    document.getElementById('btn-cancel-delete-permiso').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-confirm-delete-permiso').onclick = async () => {
        try {
            const res = await fetch(`/api/admin/permisos/${p.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Permiso eliminado.');
                loadPermisos();
            } else {
                handleAdminError(res, data, 'Error al eliminar permiso.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al eliminar permiso.');
        }
    };
}

function showCreateFuncionalidadModal() {
    const html = `
        <div style="text-align: left;">
            <label>Código:</label>
            <input type="text" id="create-func-codigo" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Nombre:</label>
            <input type="text" id="create-func-nombre" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Descripción:</label>
            <input type="text" id="create-func-desc" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Ruta (Opcional):</label>
            <input type="text" id="create-func-ruta" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>
                <input type="checkbox" id="create-func-activo" checked> Activo
            </label>
            <br>
            <button id="btn-save-new-func" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-new-func" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Crear Nueva Funcionalidad</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-new-func').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-new-func').onclick = async () => {
        const codigo = document.getElementById('create-func-codigo').value;
        const nombre = document.getElementById('create-func-nombre').value;
        const descripcion = document.getElementById('create-func-desc').value;
        const ruta = document.getElementById('create-func-ruta').value;
        const activo = document.getElementById('create-func-activo').checked;

        try {
            const res = await fetch('/api/admin/funcionalidades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo, nombre, descripcion, ruta, activo })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Funcionalidad creada.');
                loadFuncionalidades();
            } else {
                handleAdminError(res, data, 'Error al crear funcionalidad.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al crear funcionalidad.');
        }
    };
}

function showDeleteFuncionalidadModal(f) {
    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Eliminar Funcionalidad</h3><p>¿Estás seguro de que deseas eliminar la funcionalidad "${escapeHTML(f.codigo)}"?</p>`;

    buttonsContainer.innerHTML = `
        <button id="btn-confirm-delete-func" class="btn btn-danger">Eliminar</button>
        <button id="btn-cancel-delete-func" class="btn btn-secondary">Cancelar</button>
    `;

    overlay.classList.add('active');

    document.getElementById('btn-cancel-delete-func').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-confirm-delete-func').onclick = async () => {
        try {
            const res = await fetch(`/api/admin/funcionalidades/${f.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Funcionalidad eliminada.');
                loadFuncionalidades();
            } else {
                handleAdminError(res, data, 'Error al eliminar funcionalidad.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al eliminar funcionalidad.');
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const permisosTab = document.getElementById('admin-permisos');
    if (permisosTab) {
        const btn = document.getElementById('admin-btn-create-permiso');
        if (btn) {
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.gap = '10px';
            controlsDiv.style.marginBottom = '10px';
            controlsDiv.style.flexWrap = 'wrap';

            btn.parentNode.insertBefore(controlsDiv, btn);
            controlsDiv.appendChild(btn);

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'search-permisos';
            searchInput.placeholder = 'Buscar permisos...';
            searchInput.className = 'form-input';

            controlsDiv.appendChild(searchInput);

            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const rows = document.querySelectorAll('#admin-permisos-tbody tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(term) ? '' : 'none';
                });
            });
        }
    }

    const funcionalidadesTab = document.getElementById('admin-funcionalidades');
    if (funcionalidadesTab) {
        const btn = document.getElementById('admin-btn-create-funcionalidad');
        if (btn) {
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.gap = '10px';
            controlsDiv.style.marginBottom = '10px';
            controlsDiv.style.flexWrap = 'wrap';

            btn.parentNode.insertBefore(controlsDiv, btn);
            controlsDiv.appendChild(btn);

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'search-funcionalidades';
            searchInput.placeholder = 'Buscar funcionalidades...';
            searchInput.className = 'form-input';

            controlsDiv.appendChild(searchInput);

            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const rows = document.querySelectorAll('#admin-funcionalidades-tbody tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(term) ? '' : 'none';
                });
            });
        }
    }

    const btnCreateFuncionalidad = document.getElementById('admin-btn-create-funcionalidad');
    if (btnCreateFuncionalidad) {
        btnCreateFuncionalidad.addEventListener('click', showCreateFuncionalidadModal);
    }

    const btnCreateAcceso = document.getElementById('admin-btn-create-acceso');
    if (btnCreateAcceso) {
        btnCreateAcceso.addEventListener('click', showCreateAccesoModal);
    }
    const btnCreatePermiso = document.getElementById('admin-btn-create-permiso');
    if (btnCreatePermiso) {
        btnCreatePermiso.addEventListener('click', showCreatePermisoModal);
    }

    const btnCreateRol = document.getElementById('admin-btn-create-rol');
    if (btnCreateRol) {
        btnCreateRol.addEventListener('click', () => {
            const html = `
                <div style="text-align: left;">
                    <label>Nombre:</label>
                    <input type="text" id="create-rol-nombre" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    <label>Descripción:</label>
                    <input type="text" id="create-rol-desc" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    <label>
                        <input type="checkbox" id="create-rol-activo" checked> Activo
                    </label>
                    <br>
                    <button id="btn-save-new-rol" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
                    <button id="btn-cancel-new-rol" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
                </div>
            `;

            const overlay = document.getElementById('custom-modal');
            const textElement = document.getElementById('custom-modal-message');
            const buttonsContainer = document.getElementById('custom-modal-buttons');

            textElement.innerHTML = `<h3>Crear Nuevo Rol</h3>` + html;
            buttonsContainer.innerHTML = '';
            overlay.classList.add('active');

            document.getElementById('btn-cancel-new-rol').onclick = () => overlay.classList.remove('active');
            document.getElementById('btn-save-new-rol').onclick = async () => {
                const nombre = document.getElementById('create-rol-nombre').value;
                const descripcion = document.getElementById('create-rol-desc').value;
                const activo = document.getElementById('create-rol-activo').checked;

                try {
                    const res = await fetch('/api/admin/roles', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nombre, descripcion, activo })
                    });
                    const data = await res.json();
                    overlay.classList.remove('active');
                    if (res.ok) {
                        window.showModal('Rol creado.');
                        loadRoles();
                    } else {
                        handleAdminError(res, data, 'Error al crear rol.');
                    }
                } catch (e) {
                    console.error(e);
                    window.showModal('Error al crear rol.');
                }
            };
        });
    }
});

function showDeleteRolModal(r) {
    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Eliminar Rol</h3><p>¿Estás seguro de que deseas eliminar el rol "${escapeHTML(r.nombre)}"?</p>`;

    buttonsContainer.innerHTML = `
        <button id="btn-confirm-delete-rol" class="btn btn-danger">Eliminar</button>
        <button id="btn-cancel-delete-rol" class="btn btn-secondary">Cancelar</button>
    `;

    overlay.classList.add('active');

    document.getElementById('btn-cancel-delete-rol').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-confirm-delete-rol').onclick = async () => {
        try {
            const res = await fetch(`/api/admin/roles/${r.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Rol eliminado.');
                loadRoles();
            } else {
                handleAdminError(res, data, 'Error al eliminar rol.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al eliminar rol.');
        }
    };
}

function showEditRolModal(r) {
    const html = `
        <div style="text-align: left;">
            <label>Nombre:</label>
            <input type="text" id="edit-rol-nombre" value="${escapeHTML(r.nombre)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Descripción:</label>
            <input type="text" id="edit-rol-desc" value="${escapeHTML(r.descripcion)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>
                <input type="checkbox" id="edit-rol-activo" ${r.activo ? 'checked' : ''}> Activo
            </label>
            <br>
            <button id="btn-save-rol" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-rol" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Editar Rol: ${escapeHTML(r.nombre)}</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-rol').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-rol').onclick = async () => {
        const nombre = document.getElementById('edit-rol-nombre').value;
        const descripcion = document.getElementById('edit-rol-desc').value;
        const activo = document.getElementById('edit-rol-activo').checked;

        try {
            const res = await fetch(`/api/admin/roles/${r.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, descripcion, activo })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Rol actualizado.');
                loadRoles();
            } else {
                handleAdminError(res, data, 'Error al actualizar rol.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al actualizar rol.');
        }
    };
}

function showEditFuncionalidadModal(f) {
    const html = `
        <div style="text-align: left;">
            <label>Código:</label>
            <input type="text" id="edit-func-codigo" value="${escapeHTML(f.codigo)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Nombre:</label>
            <input type="text" id="edit-func-nombre" value="${escapeHTML(f.nombre)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Descripción:</label>
            <input type="text" id="edit-func-desc" value="${escapeHTML(f.descripcion)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Ruta:</label>
            <input type="text" id="edit-func-ruta" value="${escapeHTML(f.ruta || '')}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>
                <input type="checkbox" id="edit-func-activo" ${f.activo ? 'checked' : ''}> Activo
            </label>
            <br>
            <button id="btn-save-func" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-func" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Editar Funcionalidad: ${escapeHTML(f.nombre)}</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-func').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-func').onclick = async () => {
        const codigo = document.getElementById('edit-func-codigo').value;
        const nombre = document.getElementById('edit-func-nombre').value;
        const descripcion = document.getElementById('edit-func-desc').value;
        const ruta = document.getElementById('edit-func-ruta').value;
        const activo = document.getElementById('edit-func-activo').checked;

        try {
            const res = await fetch(`/api/admin/funcionalidades/${f.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo, nombre, descripcion, ruta, activo })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Funcionalidad actualizada.');
                loadFuncionalidades();
            } else {
                handleAdminError(res, data, 'Error al actualizar funcionalidad.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al actualizar funcionalidad.');
        }
    };
}

function showEditMenuModal(m) {
    const html = `
        <div style="text-align: left;">
            <label>Nombre:</label>
            <input type="text" id="edit-menu-nombre" value="${escapeHTML(m.nombre)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Funcionalidad ID (Dejar en blanco para NULL):</label>
            <input type="number" id="edit-menu-func" value="${escapeHTML(m.funcionalidad_id || '')}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Parent ID (Dejar en blanco para NULL):</label>
            <input type="number" id="edit-menu-parent" value="${escapeHTML(m.parent_id || '')}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Orden:</label>
            <input type="number" id="edit-menu-orden" value="${escapeHTML(m.orden)}" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>
                <input type="checkbox" id="edit-menu-publico" ${m.publico ? 'checked' : ''}> Público
            </label>
            <label style="margin-left: 10px;">
                <input type="checkbox" id="edit-menu-activo" ${m.activo ? 'checked' : ''}> Activo
            </label>
            <br>
            <button id="btn-save-menu" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-menu" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Editar Menú: ${escapeHTML(m.nombre)}</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-menu').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-menu').onclick = async () => {
        const nombre = document.getElementById('edit-menu-nombre').value;
        const func_val = document.getElementById('edit-menu-func').value;
        const parent_val = document.getElementById('edit-menu-parent').value;
        const orden = parseInt(document.getElementById('edit-menu-orden').value) || 0;
        const publico = document.getElementById('edit-menu-publico').checked;
        const activo = document.getElementById('edit-menu-activo').checked;

        const funcionalidad_id = func_val === '' ? null : parseInt(func_val);
        const parent_id = parent_val === '' ? null : parseInt(parent_val);

        try {
            const res = await fetch(`/api/admin/menus/${m.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, funcionalidad_id, parent_id, orden, publico, activo })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Menú actualizado.');
                loadMenus();
            } else {
                handleAdminError(res, data, 'Error al actualizar menú.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al actualizar menú.');
        }
    };
}


document.addEventListener('DOMContentLoaded', () => {
    const btnCreateUser = document.createElement('button');
    btnCreateUser.textContent = 'Crear Usuario';
    btnCreateUser.className = 'btn btn-primary';


    const btnCreateMenu = document.createElement('button');
    btnCreateMenu.textContent = 'Crear Menú';
    btnCreateMenu.className = 'btn btn-primary';
    btnCreateMenu.style.marginBottom = '15px';
    btnCreateMenu.onclick = showCreateMenuModal;

    const menusTab = document.getElementById('admin-menus');
    if (menusTab) {
        const controlsDiv = document.createElement('div');
        controlsDiv.style.display = 'flex';
        controlsDiv.style.gap = '10px';
        controlsDiv.style.marginBottom = '10px';
        controlsDiv.style.flexWrap = 'wrap';

        menusTab.insertBefore(controlsDiv, menusTab.querySelector('h3').nextSibling);
        controlsDiv.appendChild(btnCreateMenu);

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'search-menus';
        searchInput.placeholder = 'Buscar menús...';
        searchInput.className = 'form-input';

        controlsDiv.appendChild(searchInput);

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#admin-menus-tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

// Add create user button and search input to Users tab
    const usersTab = document.getElementById('admin-usuarios');
    if (usersTab) {
        const header = usersTab.querySelector('h3');

        const controlsDiv = document.createElement('div');
        controlsDiv.style.display = 'flex';
        controlsDiv.style.gap = '10px';
        controlsDiv.style.marginBottom = '10px';
        controlsDiv.style.flexWrap = 'wrap';

        controlsDiv.appendChild(btnCreateUser);

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'search-usuarios';
        searchInput.placeholder = 'Buscar usuarios...';
        searchInput.className = 'form-input';
        controlsDiv.appendChild(searchInput);

        header.after(controlsDiv);

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#admin-usuarios-tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });

        btnCreateUser.addEventListener('click', () => {
            const html = `
                <div style="text-align: left;">
                    <label>Usuario:</label>
                    <input type="text" id="create-user-usuario" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    <label>Contraseña:</label>
                    <input type="password" id="create-user-password" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    <label>Nombre:</label>
                    <input type="text" id="create-user-nombre" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    <label>Teléfono:</label>
                    <input type="text" id="create-user-telefono" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    <label>Email:</label>
                    <input type="email" id="create-user-email" class="form-input" style="width: 100%; margin-bottom: 10px;">
                    <button id="btn-save-new-user" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
                    <button id="btn-cancel-new-user" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
                </div>
            `;

            const overlay = document.getElementById('custom-modal');
            const textElement = document.getElementById('custom-modal-message');
            const buttonsContainer = document.getElementById('custom-modal-buttons');

            textElement.innerHTML = `<h3>Crear Nuevo Usuario</h3>` + html;
            buttonsContainer.innerHTML = '';
            overlay.classList.add('active');

            document.getElementById('btn-cancel-new-user').onclick = () => overlay.classList.remove('active');
            document.getElementById('btn-save-new-user').onclick = async () => {
                const usuario = document.getElementById('create-user-usuario').value;
                const password = document.getElementById('create-user-password').value;
                const nombre = document.getElementById('create-user-nombre').value;
                const telefono = document.getElementById('create-user-telefono').value;
                const email = document.getElementById('create-user-email').value;

                try {
                    const res = await fetch('/api/admin/usuarios', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ usuario, password, nombre, telefono, email })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        overlay.classList.remove('active');
                        window.showModal('Usuario creado.');
                        loadUsuarios();
                    } else {
                        // Display error but don't close modal so user can correct it
                        alert(`Error: ${data.error}`);
                    }
                } catch (e) {
                    console.error(e);
                    alert('Error al crear usuario.');
                }
            };
        });
    }
});


document.addEventListener('DOMContentLoaded', () => {
    const rolesTab = document.getElementById('admin-roles');
    if (rolesTab) {
        const btn = document.getElementById('admin-btn-create-rol');
        if (btn) {
            const controlsDiv = document.createElement('div');
            controlsDiv.style.display = 'flex';
            controlsDiv.style.gap = '10px';
            controlsDiv.style.marginBottom = '10px';
            controlsDiv.style.flexWrap = 'wrap';

            btn.parentNode.insertBefore(controlsDiv, btn);
            controlsDiv.appendChild(btn);

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'search-roles';
            searchInput.placeholder = 'Buscar roles...';
            searchInput.className = 'form-input';

            controlsDiv.appendChild(searchInput);

            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const rows = document.querySelectorAll('#admin-roles-tbody tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(term) ? '' : 'none';
                });
            });
        }
    }
});


async function showEditFuncPermisosModal(funcId, funcName) {
    try {
        const [funcPermsRes, allPermsRes] = await Promise.all([
            fetch(`/api/admin/funcionalidad_permisos/${funcId}`),
            fetch(`/api/admin/funcionalidades/${funcId}/permisos_disponibles`)
        ]);

        if (!funcPermsRes.ok || !allPermsRes.ok) throw new Error('Error al obtener datos');

        const funcPerms = await funcPermsRes.json();
        const allPerms = await allPermsRes.json();

        let html = `
            <div style="text-align: left; max-height: 300px; overflow-y: auto; margin-bottom: 10px;">
        `;

        allPerms.forEach(p => {
            const isChecked = funcPerms.includes(p.id) ? 'checked' : '';
            html += `
                <div>
                    <input type="checkbox" id="func-perm-cb-${p.id}" value="${escapeHTML(p.id)}" ${isChecked}>
                    <label for="func-perm-cb-${p.id}">${escapeHTML(p.nombre)} (${escapeHTML(p.codigo)})</label>
                </div>
            `;
        });

        html += `
            </div>
            <button id="btn-save-func-perms" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-func-perms" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        `;

        const overlay = document.getElementById('custom-modal');
        const textElement = document.getElementById('custom-modal-message');
        const buttonsContainer = document.getElementById('custom-modal-buttons');

        textElement.innerHTML = `<h3>Permisos de Funcionalidad: ${escapeHTML(funcName)}</h3>` + html;
        buttonsContainer.innerHTML = '';
        overlay.classList.add('active');

        document.getElementById('btn-cancel-func-perms').onclick = () => overlay.classList.remove('active');
        document.getElementById('btn-save-func-perms').onclick = async () => {
            const selectedPerms = Array.from(document.querySelectorAll('input[id^="func-perm-cb-"]:checked')).map(cb => parseInt(cb.value));
            try {
                const res = await fetch(`/api/admin/funcionalidad_permisos/${funcId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ permisos: selectedPerms })
                });
                const data = await res.json();
                overlay.classList.remove('active');
                if (res.ok) {
                    window.showModal('Permisos de funcionalidad actualizados.');
                    loadFuncionalidades();
                } else {
                    handleAdminError(res, data, 'Error al actualizar permisos de funcionalidad.');
                }
            } catch (e) {
                console.error(e);
                window.showModal('Error al actualizar permisos de funcionalidad.');
            }
        };

    } catch (error) {
        console.error(error);
        window.showModal('Error al cargar permisos de la funcionalidad.');
    }
}


function showDeleteMenuModal(m) {
    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Eliminar Menú</h3><p>¿Estás seguro de que deseas eliminar el menú "${escapeHTML(m.nombre)}"?</p>`;

    buttonsContainer.innerHTML = `
        <button id="btn-confirm-delete-menu" class="btn btn-danger">Eliminar</button>
        <button id="btn-cancel-delete-menu" class="btn btn-secondary">Cancelar</button>
    `;

    overlay.classList.add('active');

    document.getElementById('btn-cancel-delete-menu').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-confirm-delete-menu').onclick = async () => {
        try {
            const res = await fetch(`/api/admin/menus/${m.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Menú eliminado.');
                loadMenus();
            } else {
                handleAdminError(res, data, 'Error al eliminar menú.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al eliminar menú.');
        }
    };
}

function showCreateMenuModal() {
    const html = `
        <div style="text-align: left;">
            <label>Nombre:</label>
            <input type="text" id="create-menu-nombre" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Funcionalidad ID (Dejar en blanco para NULL):</label>
            <input type="number" id="create-menu-func" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Parent ID (Dejar en blanco para NULL):</label>
            <input type="number" id="create-menu-parent" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>Orden:</label>
            <input type="number" id="create-menu-orden" value="0" class="form-input" style="width: 100%; margin-bottom: 10px;">
            <label>
                <input type="checkbox" id="create-menu-publico"> Público
            </label>
            <label style="margin-left: 10px;">
                <input type="checkbox" id="create-menu-activo" checked> Activo
            </label>
            <br>
            <button id="btn-save-new-menu" class="btn btn-primary" style="margin-top: 10px;">Crear</button>
            <button id="btn-cancel-new-menu" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Crear Nuevo Menú</h3>` + html;
    buttonsContainer.innerHTML = '';
    overlay.classList.add('active');

    document.getElementById('btn-cancel-new-menu').onclick = () => {
        overlay.classList.remove('active');
    };

    document.getElementById('btn-save-new-menu').onclick = async () => {
        const nombre = document.getElementById('create-menu-nombre').value;
        const func_val = document.getElementById('create-menu-func').value;
        const parent_val = document.getElementById('create-menu-parent').value;
        const orden = parseInt(document.getElementById('create-menu-orden').value) || 0;
        const publico = document.getElementById('create-menu-publico').checked;
        const activo = document.getElementById('create-menu-activo').checked;

        const funcionalidad_id = func_val === '' ? null : parseInt(func_val);
        const parent_id = parent_val === '' ? null : parseInt(parent_val);

        try {
            const res = await fetch('/api/admin/menus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, funcionalidad_id, parent_id, orden, publico, activo })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Menú creado.');
                loadMenus();
            } else {
                handleAdminError(res, data, 'Error al crear menú.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al crear menú.');
        }
    };
}

async function showEditAccesoModal(a) {
    if (a.estado === 'revocado') {
        if (window.showModal) window.showModal('No se puede editar un acceso con estatus revocado.');
        return;
    }

    let preselectedPermIds = [];
    try {
        const pRes = await fetch(`/api/admin/accesos/${a.id}/permisos`);
        if (pRes.ok) {
            preselectedPermIds = await pRes.json();
        }
    } catch (e) {
        console.warn('Error fetching permisos for acceso:', e);
    }

    if ((!preselectedPermIds || preselectedPermIds.length === 0) && Array.isArray(a.permisos) && a.permisos.length > 0) {
        preselectedPermIds = a.permisos.map(p => typeof p === 'object' ? p.id : parseInt(p));
    }

    const html = `
        <div style="text-align: left; max-height: 480px; overflow-y: auto;">
            <label>Tipo de Acceso:</label>
            <select id="edit-acceso-tipo" class="form-input" style="width: 100%; margin-bottom: 10px;" onchange="toggleEditAccesoDates()">
                <option value="temporal" ${a.tipo_acceso === 'temporal' ? 'selected' : ''}>Temporal</option>
                <option value="permanente" ${a.tipo_acceso === 'permanente' ? 'selected' : ''}>Permanente</option>
            </select>

            <div id="edit-acceso-fechas" style="display: ${a.tipo_acceso === 'temporal' ? 'block' : 'none'};">
                <label>Fecha y Hora de Inicio:</label>
                <input type="datetime-local" id="edit-acceso-inicio" class="form-input" style="width: 100%; margin-bottom: 10px;" value="${a.fecha_inicio ? new Date(new Date(a.fecha_inicio).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}">

                <label>Fecha y Hora de Fin:</label>
                <input type="datetime-local" id="edit-acceso-fin" class="form-input" style="width: 100%; margin-bottom: 10px;" value="${a.fecha_fin ? new Date(new Date(a.fecha_fin).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}">
            </div>

            <div id="edit-acceso-perms-container"></div>
        </div>
    `;

    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');

    textElement.innerHTML = `<h3>Editar Acceso de ${escapeHTML(a.usuario_nombre)} a ${escapeHTML(a.funcionalidad_nombre)}</h3>` + html;

    buttonsContainer.innerHTML = `
        <button id="btn-save-edit-acceso" class="btn btn-primary">Guardar</button>
        <button id="btn-cancel-edit-acceso" class="btn btn-secondary">Cancelar</button>
    `;

    overlay.classList.add('active');

    const editPermsContainer = document.getElementById('edit-acceso-perms-container');
    if (editPermsContainer) {
        await renderFunctionalityPermissionsSection(editPermsContainer, a.funcionalidad_id, preselectedPermIds);
    }

    window.toggleEditAccesoDates = () => {
         const tipo = document.getElementById('edit-acceso-tipo').value;
         document.getElementById('edit-acceso-fechas').style.display = tipo === 'temporal' ? 'block' : 'none';
    };

    document.getElementById('btn-cancel-edit-acceso').onclick = () => overlay.classList.remove('active');
    document.getElementById('btn-save-edit-acceso').onclick = async () => {
        const tipo_acceso = document.getElementById('edit-acceso-tipo').value;
        const fecha_inicio = document.getElementById('edit-acceso-inicio').value;
        const fecha_fin = document.getElementById('edit-acceso-fin').value;
        const selectedPermisos = Array.from(document.querySelectorAll('#edit-acceso-perms-container .acceso-perm-checkbox:checked')).map(cb => parseInt(cb.value));

        try {
            const res = await fetch(`/api/admin/accesos/${a.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo_acceso,
                    fecha_inicio: fecha_inicio ? fecha_inicio.replace('T', ' ') + ':00' : null,
                    fecha_fin: fecha_fin ? fecha_fin.replace('T', ' ') + ':00' : null,
                    permisos: selectedPermisos
                })
            });
            const data = await res.json();
            overlay.classList.remove('active');
            if (res.ok) {
                window.showModal('Acceso actualizado exitosamente.');
                broadcastRbacUpdate();
                loadAccesos();
            } else {
                handleAdminError(res, data, 'Error al actualizar el acceso.');
            }
        } catch (e) {
            console.error(e);
            window.showModal('Error al actualizar el acceso.');
        }
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // Search for Accesos
    const accesosTabContent = document.getElementById('admin-accesos');
    if (accesosTabContent) {
        const header = accesosTabContent.querySelector('.admin-header');
        if (header) {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'admin-controls';
            controlsDiv.style.marginBottom = '15px';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'search-accesos';
            searchInput.placeholder = 'Buscar accesos...';
            searchInput.className = 'form-input';

            controlsDiv.appendChild(searchInput);
            header.after(controlsDiv);

            searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const rows = document.querySelectorAll('#admin-accesos-tbody tr');
                rows.forEach(row => {
                    if (row.children.length === 1 && row.children[0].colSpan > 1) return; // skip empty state
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(term) ? '' : 'none';
                });
            });
        }
    }
});

// =============================================================================
// GESTIÓN DE ASOCIADOS EN PANEL ADMINISTRATIVO
// =============================================================================

let currentAsociadosFilter = '';

async function loadAsociados(statusFilter = currentAsociadosFilter) {
    currentAsociadosFilter = statusFilter || '';
    const tbody = document.getElementById('admin-asociados-tbody');
    if (tbody) tbody.innerHTML = '';

    if (window.userAdminPermissions && !window.userAdminPermissions.has('asociados.read')) {
        return;
    }

    try {
        const url = `/api/admin/asociados${currentAsociadosFilter ? '?estatus=' + encodeURIComponent(currentAsociadosFilter) : ''}`;
        const response = await fetch(url);
        if (response.status === 401 || response.status === 403) {
            if (tbody) tbody.innerHTML = '';
            if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            return;
        }
        if (!response.ok) {
            if (tbody) tbody.innerHTML = '';
            const errData = await response.json().catch(() => ({}));
            if (isUnauthorizedResponse(response, errData)) {
                if (window.showModal) window.showModal(STANDARD_UNAUTHORIZED_MESSAGE);
            } else {
                if (window.showModal) window.showModal('Error al cargar asociados.');
            }
            return;
        }

        const data = await response.json();
        if (tbody) tbody.innerHTML = '';

        if (!data || data.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="10" style="text-align: center; color: #777; padding: 25px;">No se encontraron solicitudes de asociados.</td>`;
            tbody.appendChild(tr);
            return;
        }

        data.forEach(s => {
            const tr = document.createElement('tr');

            // 1. ID
            const tdId = document.createElement('td');
            tdId.textContent = s.id;
            tr.appendChild(tdId);

            // 2. Candidato (Nombre)
            const tdNombre = document.createElement('td');
            tdNombre.textContent = s.nombre;
            tr.appendChild(tdNombre);

            // 3. Usuario
            const tdUsuario = document.createElement('td');
            tdUsuario.textContent = s.usuario;
            tr.appendChild(tdUsuario);

            // 4. Correo
            const tdEmail = document.createElement('td');
            tdEmail.textContent = s.email;
            tr.appendChild(tdEmail);

            // 5. Teléfono
            const tdTel = document.createElement('td');
            tdTel.textContent = s.telefono || '—';
            tr.appendChild(tdTel);

            // 6. Servicio
            const tdServ = document.createElement('td');
            if (s.servicio_id === 999 && s.nombre_servicio_otro) {
                tdServ.textContent = `Otros (${s.nombre_servicio_otro})`;
            } else {
                tdServ.textContent = s.servicio_nombre || '—';
            }
            tr.appendChild(tdServ);

            // 7. Estado
            const tdStatus = document.createElement('td');
            let badgeClass = 'badge-por-aprobar';
            let labelStatus = 'Por aprobar';
            if (s.estatus === 'mas_informacion') { badgeClass = 'badge-mas-informacion'; labelStatus = 'Más información'; }
            if (s.estatus === 'autorizado') { badgeClass = 'badge-autorizado'; labelStatus = 'Autorizado'; }
            if (s.estatus === 'rechazado') { badgeClass = 'badge-rechazado'; labelStatus = 'Rechazado'; }
            tdStatus.innerHTML = `<span class="asociado-badge ${badgeClass}">${labelStatus}</span>`;
            tr.appendChild(tdStatus);

            // 8. Correo Validado
            const tdEmailVal = document.createElement('td');
            if (s.correo_validado) {
                tdEmailVal.innerHTML = `<span class="badge-correo-ok"><i class="fas fa-check"></i> Validado</span>`;
            } else {
                tdEmailVal.innerHTML = `<span class="badge-correo-pending"><i class="fas fa-clock"></i> Pendiente</span>`;
            }
            tr.appendChild(tdEmailVal);

            // 9. Fecha Solicitud
            const tdFecha = document.createElement('td');
            tdFecha.textContent = s.fecha_solicitud ? new Date(s.fecha_solicitud).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
            tr.appendChild(tdFecha);

            // 10. Acciones
            const tdActions = document.createElement('td');
            tdActions.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const viewBtn = createAdminActionButton({
                type: 'view',
                icon: 'fas fa-eye',
                title: 'Ver detalle de la solicitud',
                srText: 'Detalle',
                onClick: () => showAsociadoDetalle(s.id)
            });
            actionsGroup.appendChild(viewBtn);
            tdActions.appendChild(actionsGroup);
            tr.appendChild(tdActions);

            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error al cargar asociados:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: #dc3545; padding: 20px;">Error al cargar asociados.</td></tr>`;
        }
    }
}

// Inicializar listeners de filtros de Asociados y modal
document.addEventListener('DOMContentLoaded', () => {
    const filterBtns = document.querySelectorAll('.btn-filter-asociado');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const status = btn.getAttribute('data-status');
            loadAsociados(status);
        });
    });

    const btnCerrarModal = document.getElementById('btn-cerrar-modal-asociado');
    const modalAsociado = document.getElementById('modal-asociado-detalle');
    if (btnCerrarModal && modalAsociado) {
        btnCerrarModal.addEventListener('click', () => {
            modalAsociado.style.display = 'none';
        });
        modalAsociado.addEventListener('click', (e) => {
            if (e.target === modalAsociado) modalAsociado.style.display = 'none';
        });
    }
});

async function showAsociadoDetalle(id) {
    const modal = document.getElementById('modal-asociado-detalle');
    const body = document.getElementById('modal-asociado-detalle-body');
    if (!modal || !body) return;

    body.innerHTML = '<div style="text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Cargando información...</p></div>';
    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/admin/asociados/${id}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (isUnauthorizedResponse(res, err)) {
                body.innerHTML = `<div style="color: #dc3545; padding: 20px; text-align: center;"><p>${STANDARD_UNAUTHORIZED_MESSAGE}</p><button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-asociado-detalle').style.display='none'">Cerrar</button></div>`;
                return;
            }
            throw new Error(err.error || 'No se pudo obtener la solicitud.');
        }

        const data = await res.json();
        const s = data.solicitud;
        const historial = data.historial || [];

        let statusBadge = 'badge-por-aprobar';
        let statusLabel = 'Por aprobar';
        if (s.estatus === 'mas_informacion') { statusBadge = 'badge-mas-informacion'; statusLabel = 'Más información'; }
        if (s.estatus === 'autorizado') { statusBadge = 'badge-autorizado'; statusLabel = 'Autorizado'; }
        if (s.estatus === 'rechazado') { statusBadge = 'badge-rechazado'; statusLabel = 'Rechazado'; }

        const correoValidadoHtml = s.correo_validado
            ? `<span class="badge-correo-ok"><i class="fas fa-check"></i> Validado</span>`
            : `<span class="badge-correo-pending"><i class="fas fa-clock"></i> Pendiente de validación</span>`;

        const userActivoHtml = s.usuario_activo
            ? `<span style="color: #28a745; font-weight: bold;">Activo</span>`
            : `<span style="color: #6c757d; font-weight: bold;">Inactivo</span>`;

        let historialHtml = '';
        if (historial.length > 0) {
            historialHtml = `
                <div class="detalle-section">
                    <div class="detalle-title">Historial de Revisiones</div>
                    <ul style="padding-left: 20px; margin: 0; font-size: 13px; color: #555;">
                        ${historial.map(h => `
                            <li style="margin-bottom: 6px;">
                                <strong>${new Date(h.fecha).toLocaleString('es-MX')}:</strong>
                                ${escapeHTML(h.estatus_anterior || 'Inicio')} &rarr; <strong>${escapeHTML(h.estatus_nuevo)}</strong>
                                ${h.observaciones ? ` — <em>${escapeHTML(h.observaciones)}</em>` : ''}
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        const actionsHtml = s.estatus !== 'autorizado' ? `
            <div class="detalle-actions-bar">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-asociado-detalle').style.display='none'">Cerrar</button>
                <button type="button" class="btn btn-warning" id="btn-asoc-mas-info" style="background-color: #ffc107; color: #212529; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-question-circle"></i> Pedir más información
                </button>
                <button type="button" class="btn btn-danger" id="btn-asoc-rechazar" style="background-color: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-ban"></i> Rechazar
                </button>
                <button type="button" class="btn btn-success" id="btn-asoc-autorizar" style="background-color: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-check-circle"></i> Autorizar
                </button>
            </div>
        ` : `
            <div class="detalle-actions-bar">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-asociado-detalle').style.display='none'">Cerrar</button>
            </div>
        `;

        body.innerHTML = `
            <div class="detalle-section">
                <div class="detalle-title">Datos del Candidato</div>
                <div class="detalle-grid">
                    <div class="detalle-item"><strong>Nombre:</strong> ${escapeHTML(s.nombre)}</div>
                    <div class="detalle-item"><strong>Usuario:</strong> ${escapeHTML(s.usuario)}</div>
                    <div class="detalle-item"><strong>Correo:</strong> ${escapeHTML(s.email)}</div>
                    <div class="detalle-item"><strong>Teléfono:</strong> ${escapeHTML(s.telefono || 'No proporcionado')}</div>
                    <div class="detalle-item"><strong>Estado del Usuario:</strong> ${userActivoHtml}</div>
                </div>
            </div>

            <div class="detalle-section">
                <div class="detalle-title">Validación de Correo</div>
                <div class="detalle-item">${correoValidadoHtml}</div>
            </div>

            <div class="detalle-section">
                <div class="detalle-title">Servicio Ofrecido</div>
                <div class="detalle-item" style="margin-bottom: 8px;">
                    <strong>Servicio:</strong> ${escapeHTML(s.servicio_id === 999 && s.nombre_servicio_otro ? `Otros — ${s.nombre_servicio_otro}` : s.servicio_nombre)}
                </div>
                <div class="detalle-title" style="margin-top: 10px;">Descripción detallada:</div>
                <div class="detalle-desc-box">${escapeHTML(s.descripcion_servicio)}</div>
            </div>

            <div class="detalle-section">
                <div class="detalle-title">Estado de la Solicitud</div>
                <div class="detalle-grid">
                    <div class="detalle-item"><strong>Estado actual:</strong> <span class="asociado-badge ${statusBadge}">${statusLabel}</span></div>
                    <div class="detalle-item"><strong>Fecha solicitud:</strong> ${new Date(s.fecha_solicitud).toLocaleString('es-MX')}</div>
                    ${s.revisor_nombre ? `<div class="detalle-item"><strong>Revisado por:</strong> ${escapeHTML(s.revisor_nombre)}</div>` : ''}
                </div>
                ${s.observaciones ? `
                    <div style="margin-top: 10px;">
                        <strong>Observaciones vigentes:</strong>
                        <div class="detalle-desc-box" style="margin-top: 5px; background: #fff8e1; border-color: #ffe082;">${escapeHTML(s.observaciones)}</div>
                    </div>
                ` : ''}
            </div>

            ${historialHtml}
            ${actionsHtml}
        `;

        // Vincular acciones (asignación directa de onclick para evitar acumulación de listeners)
        const btnAutorizar = document.getElementById('btn-asoc-autorizar');
        if (btnAutorizar) {
            btnAutorizar.onclick = () => autorizarAsociado(s);
        }

        const btnRechazar = document.getElementById('btn-asoc-rechazar');
        if (btnRechazar) {
            btnRechazar.onclick = () => pedirObservacionesRechazo(s);
        }

        const btnMasInfo = document.getElementById('btn-asoc-mas-info');
        if (btnMasInfo) {
            btnMasInfo.onclick = () => pedirObservacionesMasInfo(s);
        }

    } catch (err) {
        console.error('Error in showAsociadoDetalle:', err);
        body.innerHTML = `<div style="color: #dc3545; padding: 20px; text-align: center;"><p>Error al cargar el detalle: ${escapeHTML(err.message)}</p><button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-asociado-detalle').style.display='none'">Cerrar</button></div>`;
    }
}

function closeCustomModal() {
    const overlay = document.getElementById('custom-modal');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.removeProperty('display');
        const btns = document.getElementById('custom-modal-buttons');
        if (btns) btns.innerHTML = '';
        const msg = document.getElementById('custom-modal-message');
        if (msg) msg.innerHTML = '';
    }
}

async function autorizarAsociado(s) {
    if (!s.correo_validado) {
        window.showModal('No se puede autorizar la solicitud: el correo electrónico del candidato aún no ha sido validado.');
        return;
    }

    const confirmed = await window.showConfirm(
        `¿Confirmas que deseas autorizar a ${s.nombre} como Asociado de Idealandia y activar su cuenta?`,
        { confirmText: 'Confirmar', cancelText: 'Cancelar' }
    );
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/admin/asociados/${s.id}/autorizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok) {
            window.showModal(data.message || 'Solicitud autorizada exitosamente.');
            document.getElementById('modal-asociado-detalle').style.display = 'none';
            loadAsociados();
        } else {
            handleAdminError(res, data, 'Error al autorizar la solicitud.');
        }
    } catch (error) {
        console.error('Error al autorizar:', error);
        window.showModal('Error interno al autorizar la solicitud.');
    }
}

function pedirObservacionesRechazo(s) {
    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');
    if (!overlay || !textElement || !buttonsContainer) return;

    overlay.style.removeProperty('display');

    textElement.innerHTML = `
        <div style="text-align: left;">
            <h4 style="margin: 0 0 10px 0; color: #dc3545;">Rechazar Solicitud de Asociado</h4>
            <p style="margin-bottom: 10px; font-size: 14px;">Indica obligatoriamente el motivo / observaciones del rechazo para informar a <strong>${escapeHTML(s.nombre)}</strong>:</p>
            <textarea id="modal-input-rechazo" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: inherit; font-size: 14px; box-sizing: border-box;" placeholder="Escribe aquí las observaciones obligatorias..."></textarea>
            <span id="error-input-rechazo" style="color: #dc3545; font-size: 12px; display: none; margin-top: 4px;"></span>
        </div>
    `;

    buttonsContainer.innerHTML = '';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-modal-btn secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = () => { closeCustomModal(); };

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'custom-modal-btn primary';
    confirmBtn.style.backgroundColor = '#dc3545';
    confirmBtn.textContent = 'Rechazar solicitud';
    confirmBtn.onclick = async () => {
        const textarea = document.getElementById('modal-input-rechazo');
        const errSpan = document.getElementById('error-input-rechazo');
        const observaciones = textarea ? textarea.value.trim() : '';

        if (!observaciones) {
            if (errSpan) {
                errSpan.textContent = 'Las observaciones son obligatorias para rechazar la solicitud.';
                errSpan.style.display = 'block';
            }
            if (textarea) textarea.focus();
            return;
        }

        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Rechazando...';
            const res = await fetch(`/api/admin/asociados/${s.id}/rechazar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ observaciones })
            });
            const data = await res.json();
            closeCustomModal();

            if (res.ok) {
                window.showModal(data.message || 'Solicitud rechazada correctamente.');
                document.getElementById('modal-asociado-detalle').style.display = 'none';
                loadAsociados();
            } else {
                handleAdminError(res, data, 'Error al rechazar la solicitud.');
            }
        } catch (err) {
            console.error('Error al rechazar:', err);
            closeCustomModal();
            window.showModal('Error interno al rechazar la solicitud.');
        }
    };

    buttonsContainer.appendChild(cancelBtn);
    buttonsContainer.appendChild(confirmBtn);
    overlay.classList.add('active');
    setTimeout(() => {
        const t = document.getElementById('modal-input-rechazo');
        if (t) t.focus();
    }, 100);
}

function pedirObservacionesMasInfo(s) {
    const overlay = document.getElementById('custom-modal');
    const textElement = document.getElementById('custom-modal-message');
    const buttonsContainer = document.getElementById('custom-modal-buttons');
    if (!overlay || !textElement || !buttonsContainer) return;

    overlay.style.removeProperty('display');

    textElement.innerHTML = `
        <div style="text-align: left;">
            <h4 style="margin: 0 0 10px 0; color: #d39e00;">Solicitar Información Adicional</h4>
            <p style="margin-bottom: 10px; font-size: 14px;">¿Qué información necesita proporcionar <strong>${escapeHTML(s.nombre)}</strong> para continuar su solicitud?</p>
            <textarea id="modal-input-mas-info" rows="4" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-family: inherit; font-size: 14px; box-sizing: border-box;" placeholder="Ejemplo: Por favor especifica qué incluye el servicio y qué experiencia tienes..."></textarea>
            <span id="error-input-mas-info" style="color: #dc3545; font-size: 12px; display: none; margin-top: 4px;"></span>
        </div>
    `;

    buttonsContainer.innerHTML = '';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-modal-btn secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = () => { closeCustomModal(); };

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'custom-modal-btn primary';
    confirmBtn.style.backgroundColor = '#17a2b8';
    confirmBtn.textContent = 'Solicitar información';
    confirmBtn.onclick = async () => {
        const textarea = document.getElementById('modal-input-mas-info');
        const errSpan = document.getElementById('error-input-mas-info');
        const observaciones = textarea ? textarea.value.trim() : '';

        if (!observaciones) {
            if (errSpan) {
                errSpan.textContent = 'Debes especificar qué información adicional se requiere.';
                errSpan.style.display = 'block';
            }
            if (textarea) textarea.focus();
            return;
        }

        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Enviando...';
            const res = await fetch(`/api/admin/asociados/${s.id}/mas-informacion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ observaciones })
            });
            const data = await res.json();
            closeCustomModal();

            if (res.ok) {
                if (data.warning) {
                    window.showModal(data.warning);
                } else {
                    window.showModal(data.message || 'Solicitud de información enviada correctamente al candidato.');
                }
                document.getElementById('modal-asociado-detalle').style.display = 'none';
                loadAsociados();
            } else {
                handleAdminError(res, data, 'Error al solicitar más información.');
            }
        } catch (err) {
            console.error('Error al pedir más información:', err);
            closeCustomModal();
            window.showModal('Error interno al solicitar más información.');
        }
    };

    buttonsContainer.appendChild(cancelBtn);
    buttonsContainer.appendChild(confirmBtn);
    overlay.classList.add('active');
    setTimeout(() => {
        const t = document.getElementById('modal-input-mas-info');
        if (t) t.focus();
    }, 100);
}

window.loadAsociados = loadAsociados;
window.showAsociadoDetalle = showAsociadoDetalle;


// =============================================================================
// ADMINISTRACIÓN - MÓDULO FINANZAS (INSTITUCIONES, ESQUEMAS Y TRAMOS)
// =============================================================================

let finanzasInstitucionesCache = [];

function initAdminBlocks() {
    const blockBtns = document.querySelectorAll('.admin-nav-block-btn');
    const blocks = document.querySelectorAll('.admin-main-block');

    blockBtns.forEach(btn => {
        if (btn.dataset.configured) return;
        btn.dataset.configured = 'true';
        btn.addEventListener('click', () => {
            const blockId = btn.getAttribute('data-block');
            blockBtns.forEach(b => {
                b.classList.remove('active');
                b.style.background = '#f8fafc';
                b.style.color = '#475569';
                b.style.border = '1px solid #cbd5e1';
            });
            blocks.forEach(bl => bl.style.display = 'none');

            btn.classList.add('active');
            btn.style.background = '#2563eb';
            btn.style.color = '#ffffff';
            btn.style.border = 'none';

            const activeBlock = document.getElementById(blockId);
            if (activeBlock) {
                activeBlock.style.display = 'block';
            }

            if (blockId === 'admin-block-finanzas') {
                const subtabActiva = document.querySelector('.admin-finanzas-subtab-btn.active');
                const targetSubtab = subtabActiva ? subtabActiva.getAttribute('data-finanzastab') : 'admin-finanzas-instituciones';
                if (targetSubtab === 'admin-finanzas-instituciones') loadFinanzasInstituciones();
                else if (targetSubtab === 'admin-finanzas-tasas') loadFinanzasTasas();
                else if (targetSubtab === 'admin-finanzas-estrategias') loadFinanzasEstrategias();
            }
        });
    });

    // Subtabs de Finanzas
    const finanzasSubtabBtns = document.querySelectorAll('.admin-finanzas-subtab-btn');
    finanzasSubtabBtns.forEach(btn => {
        if (btn.dataset.configured) return;
        btn.dataset.configured = 'true';
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-finanzastab');
            finanzasSubtabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.admin-finanzas-content').forEach(c => c.style.display = 'none');
            const targetContent = document.getElementById(target);
            if (targetContent) targetContent.style.display = 'block';

            if (target === 'admin-finanzas-instituciones') loadFinanzasInstituciones();
            else if (target === 'admin-finanzas-tasas') loadFinanzasTasas();
            else if (target === 'admin-finanzas-estrategias') loadFinanzasEstrategias();
        });
    });

    // Filtro por institución en pestaña de tasas
    const filtroInstSelect = document.getElementById('admin-finanzas-filtro-inst');
    if (filtroInstSelect && !filtroInstSelect.dataset.configured) {
        filtroInstSelect.dataset.configured = 'true';
        filtroInstSelect.addEventListener('change', () => {
            renderizarEsquemasContainer(filtroInstSelect.value);
        });
    }

    // Botones de alta
    const btnNuevaInst = document.getElementById('admin-btn-nueva-institucion');
    if (btnNuevaInst && !btnNuevaInst.dataset.configured) {
        btnNuevaInst.dataset.configured = 'true';
        btnNuevaInst.addEventListener('click', () => abrirModalNuevaInstitucion());
    }

    const btnNuevoEsq = document.getElementById('admin-btn-nuevo-esquema');
    if (btnNuevoEsq && !btnNuevoEsq.dataset.configured) {
        btnNuevoEsq.dataset.configured = 'true';
        btnNuevoEsq.addEventListener('click', () => abrirModalNuevoEsquema());
    }

    // Modal eventos - Institución
    const modalInst = document.getElementById('modal-finanzas-institucion');
    const btnCerrarModalInst = document.getElementById('btn-cerrar-modal-finanzas-inst');
    const btnCancelarModalInst = document.getElementById('btn-cancelar-modal-finanzas-inst');
    const btnInstAgregarTramo = document.getElementById('btn-inst-agregar-tramo');
    const formInst = document.getElementById('form-finanzas-institucion');

    const cerrarModalInst = () => {
        if (modalInst) modalInst.style.display = 'none';
    };
    if (btnCerrarModalInst) btnCerrarModalInst.onclick = cerrarModalInst;
    if (btnCancelarModalInst) btnCancelarModalInst.onclick = cerrarModalInst;

    if (btnInstAgregarTramo && !btnInstAgregarTramo.dataset.configured) {
        btnInstAgregarTramo.dataset.configured = 'true';
        btnInstAgregarTramo.addEventListener('click', () => agregarFilaTramoInstForm());
    }

    const btnInstAgregarRestriccion = document.getElementById('btn-inst-agregar-restriccion');
    if (btnInstAgregarRestriccion && !btnInstAgregarRestriccion.dataset.configured) {
        btnInstAgregarRestriccion.dataset.configured = 'true';
        btnInstAgregarRestriccion.addEventListener('click', () => agregarFilaRestriccionInstForm());
    }

    if (formInst && !formInst.dataset.configured) {
        formInst.dataset.configured = 'true';
        formInst.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarInstitucionForm();
        });
    }

    // Modal eventos - Esquema
    const modalEsq = document.getElementById('modal-finanzas-esquema');
    const btnCerrarModalEsq = document.getElementById('btn-cerrar-modal-finanzas-esq');
    const btnCancelarModalEsq = document.getElementById('btn-cancelar-modal-finanzas-esq');
    const btnAgregarTramo = document.getElementById('btn-agregar-tramo-form');
    const formEsq = document.getElementById('form-finanzas-esquema');

    const cerrarModalEsq = () => {
        if (modalEsq) modalEsq.style.display = 'none';
    };
    if (btnCerrarModalEsq) btnCerrarModalEsq.onclick = cerrarModalEsq;
    if (btnCancelarModalEsq) btnCancelarModalEsq.onclick = cerrarModalEsq;

    if (btnAgregarTramo && !btnAgregarTramo.dataset.configured) {
        btnAgregarTramo.dataset.configured = 'true';
        btnAgregarTramo.addEventListener('click', () => agregarFilaTramoForm());
    }

    if (formEsq && !formEsq.dataset.configured) {
        formEsq.dataset.configured = 'true';
        formEsq.addEventListener('submit', async (e) => {
            e.preventDefault();
            await guardarEsquemaForm();
        });
    }
}

async function loadFinanzasInstituciones() {
    const tbody = document.getElementById('admin-finanzas-instituciones-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Cargando instituciones...</td></tr>';

    try {
        const res = await fetch('/api/admin/finanzas/instituciones');
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            handleAdminError(res, data, 'Error al cargar instituciones financieras.');
            return;
        }

        const data = await res.json();
        finanzasInstitucionesCache = Array.isArray(data.instituciones) ? data.instituciones : [];

        tbody.innerHTML = '';
        if (finanzasInstitucionesCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">No hay instituciones registradas.</td></tr>';
            return;
        }

        const tipoMap = {
            'B': { label: 'Banco', color: '#1d4ed8', bg: '#dbeafe' },
            'S': { label: 'Sofipo', color: '#047857', bg: '#d1fae5' },
            'F': { label: 'Fintech', color: '#7c3aed', bg: '#ede9fe' },
            'O': { label: 'Otro', color: '#b45309', bg: '#fef3c7' }
        };

        finanzasInstitucionesCache.forEach(inst => {
            const tr = document.createElement('tr');
            const tInfo = tipoMap[inst.tipo] || { label: inst.tipo || 'O', color: '#475569', bg: '#f1f5f9' };

            // Determinar vigencia actual
            const esquemas = inst.esquemas || [];
            const esqActivo = esquemas.find(e => e.activo === 1 && (!e.fecha_fin_vigencia || e.fecha_fin_vigencia >= new Date().toISOString().slice(0, 10)));
            const vigenciaTexto = esqActivo 
                ? `<span style="color: #166534; font-weight: 600;">Desde ${esqActivo.fecha_inicio_vigencia} (${esqActivo.fecha_fin_vigencia || 'Abierta'})</span>`
                : `<span style="color: #991b1b; font-style: italic;">Sin vigencia activa</span>`;

            // Columna 1: Institución
            let td = document.createElement('td');
            td.innerHTML = `<strong>${escapeHTML(inst.nombre)}</strong>`;
            tr.appendChild(td);

            // Columna 2: Tipo
            td = document.createElement('td');
            td.style.textAlign = 'center';
            td.innerHTML = `<span style="font-weight: 700; padding: 2px 8px; border-radius: 4px; background: ${tInfo.bg}; color: ${tInfo.color}; font-size: 0.82rem;">${tInfo.label}</span>`;
            tr.appendChild(td);

            // Columna 3: Condición Resumen
            td = document.createElement('td');
            td.style.fontSize = '0.85rem';
            td.style.color = '#475569';
            td.textContent = inst.condiciones_resumen || '—';
            tr.appendChild(td);

            // Columna 4: Orden
            td = document.createElement('td');
            td.style.textAlign = 'center';
            td.textContent = inst.orden_visual;
            tr.appendChild(td);

            // Columna 5: Vigencia Actual
            td = document.createElement('td');
            td.style.fontSize = '0.85rem';
            td.innerHTML = vigenciaTexto;
            tr.appendChild(td);

            // Columna 6: Acciones (Patrón homogéneo de Gestión de Menús: Editar + Toggle Activo/Inactivo)
            td = document.createElement('td');
            td.className = 'admin-actions-cell';
            const actionsGroup = createAdminActionsGroup();

            const editBtn = createAdminActionButton({
                type: 'edit',
                icon: 'fas fa-pen',
                title: 'Editar institución',
                srText: 'Editar',
                className: 'btn-edit-inst',
                onClick: () => abrirModalEditarInstitucion(inst)
            });
            actionsGroup.appendChild(editBtn);

            const toggleBtn = createAdminActionButton({
                type: inst.activo ? 'toggle-active' : 'toggle-inactive',
                icon: inst.activo ? 'fas fa-toggle-on' : 'fas fa-toggle-off',
                title: inst.activo ? 'Desactivar institución' : 'Activar institución',
                srText: inst.activo ? 'Desactivar' : 'Activar',
                className: 'btn-toggle-inst',
                onClick: async () => {
                    await toggleEstatusInstitucion(inst.id, inst.activo ? 0 : 1);
                }
            });
            actionsGroup.appendChild(toggleBtn);
            td.appendChild(actionsGroup);
            tr.appendChild(td);

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error('Error in loadFinanzasInstituciones:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #991b1b; padding: 20px;">Error interno al cargar instituciones.</td></tr>';
    }
}

async function loadFinanzasTasas() {
    const container = document.getElementById('admin-finanzas-esquemas-container');
    const selectFiltro = document.getElementById('admin-finanzas-filtro-inst');
    if (!container) return;

    container.innerHTML = '<div style="text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin"></i> Cargando tasas y condiciones...</div>';

    try {
        const res = await fetch('/api/admin/finanzas/instituciones');
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            handleAdminError(res, data, 'Error al consultar esquemas de tasas.');
            return;
        }

        const data = await res.json();
        finanzasInstitucionesCache = Array.isArray(data.instituciones) ? data.instituciones : [];

        // Llenar select filtro
        if (selectFiltro) {
            const valorActual = selectFiltro.value;
            selectFiltro.innerHTML = '<option value="todas">-- Todas las instituciones --</option>';
            finanzasInstitucionesCache.forEach(inst => {
                const opt = document.createElement('option');
                opt.value = inst.id;
                opt.textContent = `${inst.nombre} (${inst.tipo})`;
                selectFiltro.appendChild(opt);
            });
            if (valorActual && selectFiltro.querySelector(`option[value="${valorActual}"]`)) {
                selectFiltro.value = valorActual;
            }
        }

        renderizarEsquemasContainer(selectFiltro ? selectFiltro.value : 'todas');

    } catch (err) {
        console.error('Error in loadFinanzasTasas:', err);
        container.innerHTML = '<div style="color: #991b1b; padding: 20px; text-align: center;">Error al cargar tasas y condiciones.</div>';
    }
}

function renderizarEsquemasContainer(filtroId = 'todas') {
    const container = document.getElementById('admin-finanzas-esquemas-container');
    if (!container) return;

    container.innerHTML = '';

    const institucionesAFiltrar = filtroId === 'todas'
        ? finanzasInstitucionesCache
        : finanzasInstitucionesCache.filter(i => i.id == filtroId);

    if (institucionesAFiltrar.length === 0) {
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: #64748b;">No hay instituciones o esquemas que coincidan con la selección.</div>';
        return;
    }

    const hoy = new Date().toISOString().slice(0, 10);

    institucionesAFiltrar.forEach(inst => {
        const card = document.createElement('div');
        card.style.background = '#ffffff';
        card.style.border = '1px solid #e2e8f0';
        card.style.borderRadius = '10px';
        card.style.padding = '20px';
        card.style.marginBottom = '20px';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.02)';

        const esquemas = inst.esquemas || [];

        let esquemasHtml = '';
        if (esquemas.length === 0) {
            esquemasHtml = '<p style="color: #64748b; font-style: italic; margin: 10px 0;">No tiene políticas o esquemas de tasas registrados.</p>';
        } else {
            esquemasHtml = esquemas.map(esq => {
                const esVigenteActual = esq.activo === 1 && esq.fecha_inicio_vigencia <= hoy && (!esq.fecha_fin_vigencia || esq.fecha_fin_vigencia >= hoy);
                const esHistorico = esq.fecha_fin_vigencia && esq.fecha_fin_vigencia < hoy;
                const esFuturo = esq.fecha_inicio_vigencia > hoy;

                let badgeVigencia = '';
                if (!esq.activo) {
                    badgeVigencia = '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">Inactivo</span>';
                } else if (esVigenteActual) {
                    badgeVigencia = '<span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-check-circle"></i> VIGENTE</span>';
                } else if (esHistorico) {
                    badgeVigencia = '<span style="background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">Histórico</span>';
                } else if (esFuturo) {
                    badgeVigencia = '<span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">Futuro</span>';
                }

                const tramos = esq.tramos || [];
                const tramosHtml = tramos.length === 0
                    ? '<tr><td colspan="4" style="text-align: center; color: #94a3b8;">Sin tramos configurados</td></tr>'
                    : tramos.map(t => `
                        <tr>
                            <td style="font-weight: 600;">Tramo ${t.numero_tramo}</td>
                            <td>$${Number(t.limite_inferior).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${t.limite_superior !== null ? `a $${Number(t.limite_superior).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : 'a Sin tope (+∞)'}</td>
                            <td style="font-weight: 700; color: #2563eb; text-align: right;">${Number(t.tasa_anual).toFixed(2)}%</td>
                            <td style="color: #64748b; font-size: 0.82rem;">${escapeHTML(t.descripcion_tramo || '—')}</td>
                        </tr>
                    `).join('');

                return `
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-top: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <strong>${escapeHTML(esq.nombre_esquema)}</strong>
                                ${badgeVigencia}
                                <span style="font-size: 0.85rem; color: #475569;">
                                    <i class="far fa-calendar-alt"></i> Vigencia: <strong>${esq.fecha_inicio_vigencia}</strong> al <strong>${esq.fecha_fin_vigencia || 'Indefinida'}</strong>
                                </span>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button type="button" class="btn btn-secondary btn-sm btn-edit-esq" data-esq-id="${esq.id}" data-inst-id="${inst.id}" style="font-size: 0.78rem; padding: 3px 8px;">
                                    <i class="fas fa-edit"></i> Editar Tramos
                                </button>
                                <button type="button" class="btn btn-sm btn-toggle-esq" data-esq-id="${esq.id}" data-activo="${esq.activo}" style="font-size: 0.78rem; padding: 3px 8px; font-weight: 600; background: ${esq.activo ? '#fee2e2' : '#dcfce7'}; color: ${esq.activo ? '#991b1b' : '#166534'}; border: 1px solid ${esq.activo ? '#fca5a5' : '#86efac'}; border-radius: 4px; cursor: pointer;">
                                    <i class="fas ${esq.activo ? 'fa-ban' : 'fa-check'}"></i> ${esq.activo ? 'Desactivar' : 'Activar'}
                                </button>
                            </div>
                        </div>

                        <!-- Tabla de tramos -->
                        <div class="table-responsive">
                            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px;">
                                <thead>
                                    <tr style="background: #edf2f7; text-align: left; color: #475569;">
                                        <th style="padding: 5px 8px; width: 80px;">Tramo</th>
                                        <th style="padding: 5px 8px;">Rango de Saldo</th>
                                        <th style="padding: 5px 8px; text-align: right; width: 110px;">Tasa Nominal</th>
                                        <th style="padding: 5px 8px;">Condición / Descripción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tramosHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }).join('');
        }

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <h4 style="margin: 0; color: #0f172a; font-size: 1.15rem;">${escapeHTML(inst.nombre)}</h4>
                    <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #e0e7ff; color: #3730a3;">Tipo ${inst.tipo}</span>
                    <span style="font-size: 0.85rem; color: #64748b;">${escapeHTML(inst.condiciones_resumen || '')}</span>
                </div>
                <button type="button" class="btn btn-primary btn-sm btn-nueva-vigencia-inst" data-inst-id="${inst.id}" style="font-size: 0.82rem; padding: 5px 12px;">
                    <i class="fas fa-calendar-plus"></i> + Nueva Vigencia
                </button>
            </div>
            <div>${esquemasHtml}</div>
        `;

        container.appendChild(card);
    });

    // Listeners
    container.querySelectorAll('.btn-nueva-vigencia-inst').forEach(btn => {
        btn.addEventListener('click', () => {
            const instId = parseInt(btn.dataset.instId, 10);
            abrirModalNuevoEsquema(instId);
        });
    });

    container.querySelectorAll('.btn-edit-esq').forEach(btn => {
        btn.addEventListener('click', () => {
            const esqId = parseInt(btn.dataset.esqId, 10);
            const instId = parseInt(btn.dataset.instId, 10);
            const inst = finanzasInstitucionesCache.find(i => i.id === instId);
            if (inst) {
                const esq = (inst.esquemas || []).find(e => e.id === esqId);
                if (esq) abrirModalEditarEsquema(esq, inst);
            }
        });
    });

    container.querySelectorAll('.btn-toggle-esq').forEach(btn => {
        btn.addEventListener('click', async () => {
            const esqId = parseInt(btn.dataset.esqId, 10);
            const activoActual = parseInt(btn.dataset.activo, 10);
            await toggleEstatusEsquema(esqId, activoActual === 1 ? 0 : 1);
        });
    });
}

let restriccionesBorradasCache = [];

function abrirModalNuevaInstitucion() {
    const modal = document.getElementById('modal-finanzas-institucion');
    const form = document.getElementById('form-finanzas-institucion');
    const titulo = document.getElementById('modal-finanzas-inst-titulo');
    const tbody = document.getElementById('finanzas-inst-tramos-tbody');
    const wrapperNuevaVigencia = document.getElementById('finanzas-inst-nueva-vigencia-wrapper');

    if (!modal || !form) return;

    form.reset();
    restriccionesBorradasCache = [];
    document.getElementById('finanzas-inst-id').value = '';
    document.getElementById('finanzas-inst-esquema-id').value = '';
    document.getElementById('finanzas-inst-activo').checked = true;
    document.getElementById('finanzas-inst-esq-activo').checked = true;
    document.getElementById('finanzas-inst-esq-nombre').value = 'Vigente 2026';
    document.getElementById('finanzas-inst-esq-fecha-inicio').value = new Date().toISOString().slice(0, 10);
    document.getElementById('finanzas-inst-esq-fecha-fin').value = '';

    if (wrapperNuevaVigencia) wrapperNuevaVigencia.style.display = 'none';
    if (titulo) titulo.textContent = 'Nueva Institución Financiera y Condiciones';

    if (tbody) {
        tbody.innerHTML = '';
        agregarFilaTramoInstForm({ numero_tramo: 1, limite_inferior: 0.00, limite_superior: null, tasa_anual: 10.0, descripcion_tramo: 'Saldo total' });
    }

    const tbodyRest = document.getElementById('finanzas-inst-restricciones-tbody');
    if (tbodyRest) tbodyRest.innerHTML = '';

    recalcularResumenCondicionesInstModal();
    modal.style.display = 'flex';
}

function abrirModalEditarInstitucion(inst) {
    const modal = document.getElementById('modal-finanzas-institucion');
    const form = document.getElementById('form-finanzas-institucion');
    const titulo = document.getElementById('modal-finanzas-inst-titulo');
    const tbody = document.getElementById('finanzas-inst-tramos-tbody');
    const chkNuevaVigencia = document.getElementById('finanzas-inst-nueva-vigencia-chk');
    const wrapperNuevaVigencia = document.getElementById('finanzas-inst-nueva-vigencia-wrapper');

    if (!modal || !form || !inst) return;

    form.reset();
    restriccionesBorradasCache = [];
    document.getElementById('finanzas-inst-id').value = inst.id;
    document.getElementById('finanzas-inst-nombre').value = inst.nombre || '';
    document.getElementById('finanzas-inst-tipo').value = inst.tipo || 'B';
    document.getElementById('finanzas-inst-desc').value = inst.descripcion || '';
    document.getElementById('finanzas-inst-orden').value = inst.orden_visual || 0;
    document.getElementById('finanzas-inst-activo').checked = inst.activo == 1;

    if (titulo) titulo.textContent = `Editar Institución: ${inst.nombre}`;

    // Buscar esquema activo o más reciente
    const hoy = new Date().toISOString().slice(0, 10);
    const esquemas = inst.esquemas || [];
    const esqActivo = esquemas.find(e => e.activo === 1 && (!e.fecha_fin_vigencia || e.fecha_fin_vigencia >= hoy)) || esquemas[0];

    if (esqActivo) {
        document.getElementById('finanzas-inst-esquema-id').value = esqActivo.id;
        document.getElementById('finanzas-inst-esq-nombre').value = esqActivo.nombre_esquema || 'Vigente 2026';
        document.getElementById('finanzas-inst-esq-fecha-inicio').value = esqActivo.fecha_inicio_vigencia || '';
        document.getElementById('finanzas-inst-esq-fecha-fin').value = esqActivo.fecha_fin_vigencia || '';
        document.getElementById('finanzas-inst-esq-activo').checked = esqActivo.activo == 1;

        if (chkNuevaVigencia) chkNuevaVigencia.checked = false;
        if (wrapperNuevaVigencia) wrapperNuevaVigencia.style.display = 'block';

        if (tbody) {
            tbody.innerHTML = '';
            const tramos = esqActivo.tramos || [];
            if (tramos.length === 0) {
                agregarFilaTramoInstForm({ numero_tramo: 1, limite_inferior: 0.00, limite_superior: null, tasa_anual: 10.0, descripcion_tramo: '' });
            } else {
                tramos.forEach(t => agregarFilaTramoInstForm(t));
            }
        }
    } else {
        document.getElementById('finanzas-inst-esquema-id').value = '';
        document.getElementById('finanzas-inst-esq-nombre').value = 'Vigente 2026';
        document.getElementById('finanzas-inst-esq-fecha-inicio').value = hoy;
        document.getElementById('finanzas-inst-esq-fecha-fin').value = '';
        document.getElementById('finanzas-inst-esq-activo').checked = true;

        if (chkNuevaVigencia) chkNuevaVigencia.checked = false;
        if (wrapperNuevaVigencia) wrapperNuevaVigencia.style.display = 'none';

        if (tbody) {
            tbody.innerHTML = '';
            agregarFilaTramoInstForm({ numero_tramo: 1, limite_inferior: 0.00, limite_superior: null, tasa_anual: 10.0, descripcion_tramo: 'Saldo total' });
        }
    }

    // Cargar restricciones en el modal
    const tbodyRest = document.getElementById('finanzas-inst-restricciones-tbody');
    if (tbodyRest) {
        tbodyRest.innerHTML = '';
        const restricciones = inst.restricciones || [];
        restricciones.forEach(r => agregarFilaRestriccionInstForm(r));
    }

    recalcularResumenCondicionesInstModal();
    modal.style.display = 'flex';
}

function agregarFilaRestriccionInstForm(restData = null) {
    const tbody = document.getElementById('finanzas-inst-restricciones-tbody');
    if (!tbody) return;

    const filasActuales = tbody.querySelectorAll('tr.restriccion-row-inst-form').length;
    const numOrden = restData && restData.orden ? restData.orden : (filasActuales + 1);
    const desc = restData ? (restData.descripcion || '') : '';
    const activo = restData ? (restData.activo == 1) : true;
    const restId = restData ? restData.id : '';

    const tr = document.createElement('tr');
    tr.className = 'restriccion-row-inst-form';
    if (restId) tr.dataset.restriccionId = restId;

    tr.innerHTML = `
        <td style="text-align: center;">
            <input type="number" class="form-control restriccion-orden-input" value="${numOrden}" min="1" style="padding: 4px 6px; font-size: 0.85rem; width: 45px; text-align: center;">
        </td>
        <td>
            <input type="text" class="form-control restriccion-desc-input" value="${escapeHTML(desc)}" placeholder="Ej. Requiere al menos una compra al mes..." required style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td style="text-align: center;">
            <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.85rem; margin: 0;">
                <input type="checkbox" class="restriccion-activo-input" ${activo ? 'checked' : ''} style="width: 16px; height: 16px;">
                <span>${activo ? 'Activa' : 'Inactiva'}</span>
            </label>
        </td>
        <td style="text-align: center;">
            <button type="button" class="btn btn-secondary btn-sm btn-delete-restriccion-row" style="padding: 2px 6px; font-size: 0.75rem; color: #ef4444;" title="Quitar restricción">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;

    tbody.appendChild(tr);

    const chkActivo = tr.querySelector('.restriccion-activo-input');
    const spanEstado = tr.querySelector('td:nth-child(3) span');
    if (chkActivo && spanEstado) {
        chkActivo.addEventListener('change', (e) => {
            spanEstado.textContent = e.target.checked ? 'Activa' : 'Inactiva';
        });
    }

    tr.querySelector('.btn-delete-restriccion-row').addEventListener('click', () => {
        if (restId) {
            restriccionesBorradasCache.push(restId);
        }
        tr.remove();
        tbody.querySelectorAll('tr.restriccion-row-inst-form').forEach((row, idx) => {
            const ordInput = row.querySelector('.restriccion-orden-input');
            if (ordInput) ordInput.value = idx + 1;
        });
    });
}

function agregarFilaTramoInstForm(tramoData = null) {
    const tbody = document.getElementById('finanzas-inst-tramos-tbody');
    if (!tbody) return;

    const filasActuales = tbody.querySelectorAll('tr').length;
    const numTramo = filasActuales + 1;

    let infSugerido = 0;
    if (filasActuales > 0 && !tramoData) {
        const ultimaFila = tbody.querySelectorAll('tr')[filasActuales - 1];
        const supAnteriorInput = ultimaFila.querySelector('.tramo-sup-input');
        if (supAnteriorInput && supAnteriorInput.value) {
            infSugerido = parseFloat(supAnteriorInput.value) || 0;
        }
    }

    const inf = tramoData ? tramoData.limite_inferior : infSugerido;
    const sup = tramoData && tramoData.limite_superior !== null && tramoData.limite_superior !== undefined ? tramoData.limite_superior : '';
    const tasa = tramoData ? tramoData.tasa_anual : 10.00;
    const desc = tramoData ? (tramoData.descripcion_tramo || '') : '';

    const tr = document.createElement('tr');
    tr.className = 'tramo-row-inst-form';
    tr.innerHTML = `
        <td style="font-weight: 700; text-align: center;" class="tramo-num-col">${numTramo}</td>
        <td>
            <input type="number" step="0.01" class="form-control tramo-inf-input" value="${inf}" required style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td>
            <input type="number" step="0.01" class="form-control tramo-sup-input" value="${sup}" placeholder="Sin tope (+∞)" style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td>
            <input type="number" step="0.01" min="0" max="100" class="form-control tramo-tasa-input" value="${tasa}" required style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td>
            <input type="text" class="form-control tramo-desc-input" value="${escapeHTML(desc)}" placeholder="Descripción opcional..." style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td style="text-align: center;">
            <button type="button" class="btn btn-secondary btn-sm btn-delete-tramo-inst-row" style="padding: 2px 6px; font-size: 0.75rem; color: #ef4444;" title="Quitar tramo">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;

    tbody.appendChild(tr);

    // Eventos input para actualizar en vivo el resumen de condiciones
    tr.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => recalcularResumenCondicionesInstModal());
    });

    // Quitar tramo
    tr.querySelector('.btn-delete-tramo-inst-row').addEventListener('click', () => {
        if (tbody.querySelectorAll('tr').length <= 1) {
            if (window.showModal) window.showModal('Debe existir al menos un tramo de tasa.');
            return;
        }
        tr.remove();
        tbody.querySelectorAll('tr').forEach((row, idx) => {
            const numCol = row.querySelector('.tramo-num-col');
            if (numCol) numCol.textContent = idx + 1;
        });
        recalcularResumenCondicionesInstModal();
    });

    recalcularResumenCondicionesInstModal();
}

function recalcularResumenCondicionesInstModal() {
    const tbody = document.getElementById('finanzas-inst-tramos-tbody');
    const previewDiv = document.getElementById('finanzas-inst-condiciones-preview');
    const hiddenInput = document.getElementById('finanzas-inst-condiciones');
    if (!tbody || !previewDiv) return;

    const filas = tbody.querySelectorAll('tr');
    const tramos = [];
    filas.forEach((row, idx) => {
        const inf = parseFloat(row.querySelector('.tramo-inf-input').value) || 0;
        const supVal = row.querySelector('.tramo-sup-input').value;
        const sup = (supVal !== '' && supVal !== null && !isNaN(parseFloat(supVal))) ? parseFloat(supVal) : null;
        const tasa = parseFloat(row.querySelector('.tramo-tasa-input').value) || 0;
        const desc = row.querySelector('.tramo-desc-input').value.trim();
        tramos.push({
            numero_tramo: idx + 1,
            limite_inferior: inf,
            limite_superior: sup,
            tasa_anual: tasa,
            descripcion_tramo: desc
        });
    });

    const resumen = (window.MotorFinanciero && typeof window.MotorFinanciero.generarResumenCondiciones === 'function')
        ? window.MotorFinanciero.generarResumenCondiciones(tramos)
        : (tramos.length > 0 ? `Tasa anual ${tramos[0].tasa_anual}%` : 'Sin condiciones');

    previewDiv.textContent = resumen;
    if (hiddenInput) hiddenInput.value = resumen;
}

async function guardarInstitucionForm() {
    const id = document.getElementById('finanzas-inst-id').value;
    const nombre = document.getElementById('finanzas-inst-nombre').value.trim();
    const tipo = document.getElementById('finanzas-inst-tipo').value;
    const descripcion = document.getElementById('finanzas-inst-desc').value.trim();
    const orden_visual = parseInt(document.getElementById('finanzas-inst-orden').value, 10) || 0;
    const activo = document.getElementById('finanzas-inst-activo').checked ? 1 : 0;

    // Datos del esquema
    const esquemaId = document.getElementById('finanzas-inst-esquema-id').value;
    const nombre_esquema = document.getElementById('finanzas-inst-esq-nombre').value.trim() || 'Vigente 2026';
    const fecha_inicio_vigencia = document.getElementById('finanzas-inst-esq-fecha-inicio').value;
    const fecha_fin_vigencia = document.getElementById('finanzas-inst-esq-fecha-fin').value || null;
    const esqActivo = document.getElementById('finanzas-inst-esq-activo').checked ? 1 : 0;
    const chkNuevaVigencia = document.getElementById('finanzas-inst-nueva-vigencia-chk');
    const nueva_vigencia = chkNuevaVigencia ? chkNuevaVigencia.checked : false;

    // Extraer tramos
    const tbody = document.getElementById('finanzas-inst-tramos-tbody');
    const filas = tbody ? tbody.querySelectorAll('tr') : [];
    const tramos = [];

    filas.forEach((row, idx) => {
        const inf = parseFloat(row.querySelector('.tramo-inf-input').value);
        const supRaw = row.querySelector('.tramo-sup-input').value;
        const sup = (supRaw !== '' && supRaw !== null && !isNaN(parseFloat(supRaw))) ? parseFloat(supRaw) : null;
        const tasa = parseFloat(row.querySelector('.tramo-tasa-input').value);
        const desc = row.querySelector('.tramo-desc-input').value.trim();

        tramos.push({
            numero_tramo: idx + 1,
            limite_inferior: inf,
            limite_superior: sup,
            tasa_anual: tasa,
            descripcion_tramo: desc
        });
    });

    // Validar tramos con el motor
    const val = window.MotorFinanciero.validarTramos(tramos);
    if (!val.valido) {
        if (window.showModal) window.showModal(val.error);
        else alert(val.error);
        return;
    }

    const condiciones_resumen = window.MotorFinanciero.generarResumenCondiciones(tramos);

    // Extraer restricciones dinámicas
    const tbodyRest = document.getElementById('finanzas-inst-restricciones-tbody');
    const filasRest = tbodyRest ? tbodyRest.querySelectorAll('tr.restriccion-row-inst-form') : [];
    const restricciones = [];

    filasRest.forEach((row, idx) => {
        const restId = row.dataset.restriccionId ? parseInt(row.dataset.restriccionId, 10) : null;
        const descInput = row.querySelector('.restriccion-desc-input');
        const desc = descInput ? descInput.value.trim() : '';
        const ordInput = row.querySelector('.restriccion-orden-input');
        const orden = ordInput ? (parseInt(ordInput.value, 10) || (idx + 1)) : (idx + 1);
        const actInput = row.querySelector('.restriccion-activo-input');
        const activoRest = actInput ? (actInput.checked ? 1 : 0) : 1;

        if (desc) {
            restricciones.push({
                id: restId,
                descripcion: desc,
                orden: orden,
                activo: activoRest
            });
        }
    });

    if (Array.isArray(restriccionesBorradasCache)) {
        restriccionesBorradasCache.forEach(delId => {
            restricciones.push({ id: delId, _deleted: true });
        });
    }

    const payload = {
        nombre,
        tipo,
        descripcion,
        condiciones_resumen,
        orden_visual,
        activo,
        restricciones,
        esquema: {
            id: esquemaId ? parseInt(esquemaId, 10) : null,
            nombre_esquema,
            fecha_inicio_vigencia,
            fecha_fin_vigencia,
            activo: esqActivo,
            nueva_vigencia,
            cerrar_anterior: true,
            tramos
        }
    };

    const url = id ? `/api/admin/finanzas/instituciones/${id}` : '/api/admin/finanzas/instituciones';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            document.getElementById('modal-finanzas-institucion').style.display = 'none';
            if (window.showModal) window.showModal(data.message || 'Institución y condiciones guardadas correctamente.');
            await loadFinanzasInstituciones();
            if (window.SimuladorFinanciero && typeof window.SimuladorFinanciero.cargarDatosSimulador === 'function') {
                window.SimuladorFinanciero.cargarDatosSimulador();
            }
        } else {
            handleAdminError(res, data, 'Error al guardar la institución.');
        }
    } catch (err) {
        console.error('Error guardando institución:', err);
        if (window.showModal) window.showModal('Error de red al guardar la institución.');
    }
}

async function toggleEstatusInstitucion(id, nuevoEstatus) {
    try {
        const res = await fetch(`/api/admin/finanzas/instituciones/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: nuevoEstatus })
        });
        const data = await res.json();
        if (res.ok) {
            const inst = finanzasInstitucionesCache.find(i => i.id === id);
            if (inst) inst.activo = nuevoEstatus;
            await loadFinanzasInstituciones();
            if (window.SimuladorFinanciero && typeof window.SimuladorFinanciero.cargarDatosSimulador === 'function') {
                window.SimuladorFinanciero.cargarDatosSimulador();
            }
        } else {
            handleAdminError(res, data, 'Error al cambiar estatus de la institución.');
        }
    } catch (err) {
        console.error('Error in toggleEstatusInstitucion:', err);
    }
}

function abrirModalNuevoEsquema(instIdPredeterminado = null) {
    const modal = document.getElementById('modal-finanzas-esquema');
    const form = document.getElementById('form-finanzas-esquema');
    const titulo = document.getElementById('modal-finanzas-esq-titulo');
    const selectInst = document.getElementById('finanzas-esq-inst');
    const tramosTbody = document.getElementById('finanzas-tramos-tbody');
    const wrapperCerrarAnterior = document.getElementById('finanzas-esq-cerrar-anterior-wrapper');

    if (!modal || !form) return;

    form.reset();
    document.getElementById('finanzas-esq-id').value = '';
    if (titulo) titulo.textContent = 'Nueva Vigencia y Tramos de Inversión';
    if (wrapperCerrarAnterior) wrapperCerrarAnterior.style.display = 'block';

    // Llenar selector de instituciones
    if (selectInst) {
        selectInst.innerHTML = '';
        selectInst.removeAttribute('disabled');
        finanzasInstitucionesCache.forEach(inst => {
            const opt = document.createElement('option');
            opt.value = inst.id;
            opt.textContent = `${inst.nombre} (${inst.tipo})`;
            selectInst.appendChild(opt);
        });
        if (instIdPredeterminado) {
            selectInst.value = instIdPredeterminado;
        }
    }

    // Default fecha inicio: hoy
    document.getElementById('finanzas-esq-fecha-inicio').value = new Date().toISOString().slice(0, 10);
    document.getElementById('finanzas-esq-fecha-fin').value = '';

    // Cargar 1 tramo inicial por defecto
    if (tramosTbody) {
        tramosTbody.innerHTML = '';
        agregarFilaTramoForm({ numero_tramo: 1, limite_inferior: 0.00, limite_superior: null, tasa_anual: 10.0, descripcion_tramo: 'Saldo total' });
    }

    modal.style.display = 'flex';
}

function abrirModalEditarEsquema(esq, inst) {
    const modal = document.getElementById('modal-finanzas-esquema');
    const form = document.getElementById('form-finanzas-esquema');
    const titulo = document.getElementById('modal-finanzas-esq-titulo');
    const selectInst = document.getElementById('finanzas-esq-inst');
    const tramosTbody = document.getElementById('finanzas-tramos-tbody');
    const wrapperCerrarAnterior = document.getElementById('finanzas-esq-cerrar-anterior-wrapper');

    if (!modal || !form || !esq) return;

    document.getElementById('finanzas-esq-id').value = esq.id;
    if (titulo) titulo.textContent = `Editar Esquema: ${inst.nombre} — ${esq.nombre_esquema}`;
    if (wrapperCerrarAnterior) wrapperCerrarAnterior.style.display = 'none';

    if (selectInst) {
        selectInst.innerHTML = `<option value="${inst.id}">${inst.nombre} (${inst.tipo})</option>`;
        selectInst.setAttribute('disabled', 'true');
    }

    document.getElementById('finanzas-esq-nombre').value = esq.nombre_esquema || 'General';
    document.getElementById('finanzas-esq-fecha-inicio').value = esq.fecha_inicio_vigencia || '';
    document.getElementById('finanzas-esq-fecha-fin').value = esq.fecha_fin_vigencia || '';

    // Cargar tramos existentes
    if (tramosTbody) {
        tramosTbody.innerHTML = '';
        const tramos = esq.tramos || [];
        if (tramos.length === 0) {
            agregarFilaTramoForm({ numero_tramo: 1, limite_inferior: 0.00, limite_superior: null, tasa_anual: 0.00, descripcion_tramo: '' });
        } else {
            tramos.forEach(t => agregarFilaTramoForm(t));
        }
    }

    modal.style.display = 'flex';
}

function agregarFilaTramoForm(tramoData = null) {
    const tbody = document.getElementById('finanzas-tramos-tbody');
    if (!tbody) return;

    const filasActuales = tbody.querySelectorAll('tr').length;
    const numTramo = filasActuales + 1;

    let infSugerido = 0;
    if (filasActuales > 0 && !tramoData) {
        const ultimaFila = tbody.querySelectorAll('tr')[filasActuales - 1];
        const supAnteriorInput = ultimaFila.querySelector('.tramo-sup-input');
        if (supAnteriorInput && supAnteriorInput.value) {
            infSugerido = parseFloat(supAnteriorInput.value) || 0;
        }
    }

    const inf = tramoData ? tramoData.limite_inferior : infSugerido;
    const sup = tramoData && tramoData.limite_superior !== null && tramoData.limite_superior !== undefined ? tramoData.limite_superior : '';
    const tasa = tramoData ? tramoData.tasa_anual : 10.00;
    const desc = tramoData ? (tramoData.descripcion_tramo || '') : '';

    const tr = document.createElement('tr');
    tr.className = 'tramo-row-form';
    tr.innerHTML = `
        <td style="font-weight: 700; text-align: center;" class="tramo-num-col">${numTramo}</td>
        <td>
            <input type="number" step="0.01" class="form-control tramo-inf-input" value="${inf}" required style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td>
            <input type="number" step="0.01" class="form-control tramo-sup-input" value="${sup}" placeholder="Sin tope (+∞)" style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td>
            <input type="number" step="0.01" min="0" max="100" class="form-control tramo-tasa-input" value="${tasa}" required style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td>
            <input type="text" class="form-control tramo-desc-input" value="${escapeHTML(desc)}" placeholder="Descripción opcional..." style="padding: 4px 6px; font-size: 0.85rem; width: 100%;">
        </td>
        <td style="text-align: center;">
            <button type="button" class="btn btn-secondary btn-sm btn-delete-tramo-row" style="padding: 2px 6px; font-size: 0.75rem; color: #ef4444;" title="Quitar tramo">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;

    tbody.appendChild(tr);

    // Listener para quitar tramo
    tr.querySelector('.btn-delete-tramo-row').addEventListener('click', () => {
        if (tbody.querySelectorAll('tr').length <= 1) {
            if (window.showModal) window.showModal('Debe existir al menos un tramo de tasa.');
            return;
        }
        tr.remove();
        // Renumerar
        tbody.querySelectorAll('tr').forEach((row, idx) => {
            const numCol = row.querySelector('.tramo-num-col');
            if (numCol) numCol.textContent = idx + 1;
        });
    });
}

async function guardarEsquemaForm() {
    const id = document.getElementById('finanzas-esq-id').value;
    const selectInst = document.getElementById('finanzas-esq-inst');
    const institucion_id = selectInst ? selectInst.value : null;
    const nombre_esquema = document.getElementById('finanzas-esq-nombre').value.trim();
    const fecha_inicio_vigencia = document.getElementById('finanzas-esq-fecha-inicio').value;
    const fecha_fin_vigencia = document.getElementById('finanzas-esq-fecha-fin').value || null;
    const chkCerrar = document.getElementById('finanzas-esq-cerrar-anterior');
    const cerrar_anterior = chkCerrar ? chkCerrar.checked : false;

    // Extraer tramos de la tabla
    const tbody = document.getElementById('finanzas-tramos-tbody');
    const filas = tbody ? tbody.querySelectorAll('tr') : [];
    const tramos = [];

    filas.forEach((row, idx) => {
        const inf = parseFloat(row.querySelector('.tramo-inf-input').value);
        const supRaw = row.querySelector('.tramo-sup-input').value;
        const sup = (supRaw !== '' && supRaw !== null && !isNaN(parseFloat(supRaw))) ? parseFloat(supRaw) : null;
        const tasa = parseFloat(row.querySelector('.tramo-tasa-input').value);
        const desc = row.querySelector('.tramo-desc-input').value.trim();

        tramos.push({
            numero_tramo: idx + 1,
            limite_inferior: inf,
            limite_superior: sup,
            tasa_anual: tasa,
            descripcion_tramo: desc
        });
    });

    // Validar con el motor matemático en cliente antes de enviar
    const val = window.MotorFinanciero.validarTramos(tramos);
    if (!val.valido) {
        if (window.showModal) window.showModal(val.error);
        else alert(val.error);
        return;
    }

    const payload = {
        institucion_id,
        nombre_esquema,
        fecha_inicio_vigencia,
        fecha_fin_vigencia,
        cerrar_anterior,
        tramos
    };

    const url = id ? `/api/admin/finanzas/esquemas/${id}` : '/api/admin/finanzas/esquemas';
    const method = id ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            document.getElementById('modal-finanzas-esquema').style.display = 'none';
            if (window.showModal) window.showModal(data.message || 'Esquema y tramos guardados exitosamente.');
            await loadFinanzasTasas();
        } else {
            handleAdminError(res, data, 'Error al registrar el esquema.');
        }
    } catch (err) {
        console.error('Error guardando esquema:', err);
        if (window.showModal) window.showModal('Error de red al guardar el esquema.');
    }
}

async function toggleEstatusEsquema(id, nuevoEstatus) {
    try {
        const res = await fetch(`/api/admin/finanzas/esquemas/${id}`, {
            method: nuevoEstatus === 0 ? 'DELETE' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: nuevoEstatus })
        });
        const data = await res.json();
        if (res.ok) {
            await loadFinanzasTasas();
        } else {
            handleAdminError(res, data, 'Error al cambiar estatus del esquema.');
        }
    } catch (err) {
        console.error('Error in toggleEstatusEsquema:', err);
    }
}

let catalogoEstrategiasAdmin = [];

async function loadFinanzasEstrategias() {
    const tbody = document.getElementById('admin-finanzas-estrategias-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Cargando estrategias de inversión...</td></tr>';

    try {
        const res = await fetch('/api/admin/finanzas/estrategias', {
            headers: { 'Accept': 'application/json' }
        });

        if (res.status === 401 || res.status === 403) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444; padding: 20px;">${STANDARD_UNAUTHORIZED_MESSAGE}</td></tr>`;
            return;
        }

        const data = await res.json();
        catalogoEstrategiasAdmin = Array.isArray(data.estrategias) ? data.estrategias : [];

        if (catalogoEstrategiasAdmin.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">No hay estrategias de inversión configuradas.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        catalogoEstrategiasAdmin.forEach(est => {
            const tr = document.createElement('tr');
            const maxInstStr = `${parseFloat(est.max_concentracion_inst || 0).toFixed(1)}%`;
            const maxTipoStr = est.max_concentracion_tipo !== null && est.max_concentracion_tipo !== undefined
                ? `${parseFloat(est.max_concentracion_tipo).toFixed(1)}%`
                : '<span style="color: #94a3b8;">Sin límite</span>';
            const asigMinStr = `$${parseFloat(est.asignacion_minima_viable || 1000).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            const activoBadge = est.activo == 1
                ? '<span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">Activo</span>'
                : '<span style="background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">Inactivo</span>';
            const divBadge = est.diversificar_tipos == 1
                ? '<span style="background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;"><i class="fas fa-check"></i> Sí</span>'
                : '<span style="background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">No</span>';

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${est.color || '#2563eb'};"></span>
                        <i class="${est.icono || 'fas fa-chart-line'}" style="color: ${est.color || '#2563eb'};"></i>
                        <span>${est.nombre}</span>
                    </div>
                    <small style="color: #64748b; font-size: 0.75rem; display: block; margin-top: 2px;">${est.descripcion_criterio || ''}</small>
                </td>
                <td style="text-align: right; font-weight: 700; color: #047857;">${maxInstStr}</td>
                <td style="text-align: center; font-weight: 600;">${est.min_instituciones || 1}</td>
                <td style="text-align: right; font-weight: 600;">${maxTipoStr}</td>
                <td style="text-align: center;">${divBadge}</td>
                <td style="text-align: right; font-weight: 600;">${asigMinStr}</td>
                <td style="text-align: center;">${activoBadge}</td>
                <td style="text-align: center;">
                    <button type="button" class="btn btn-secondary btn-sm btn-editar-estrategia" data-id="${est.id}" style="padding: 4px 10px; font-size: 0.82rem;" title="Editar Parámetros">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Configurar botones de editar
        tbody.querySelectorAll('.btn-editar-estrategia').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'), 10);
                abrirModalEditarEstrategia(id);
            });
        });

        configurarModalFinanzasEstrategia();
    } catch (err) {
        console.error('Error cargando estrategias de inversión:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #ef4444; padding: 20px;">Error de red al consultar estrategias.</td></tr>';
    }
}

function abrirModalEditarEstrategia(id) {
    const est = catalogoEstrategiasAdmin.find(e => e.id === id);
    if (!est) return;

    const modal = document.getElementById('modal-finanzas-estrategia');
    if (!modal) return;

    document.getElementById('finanzas-estrategia-id').value = est.id;
    document.getElementById('finanzas-estrategia-nombre').value = est.nombre || '';
    document.getElementById('finanzas-estrategia-max-inst').value = parseFloat(est.max_concentracion_inst || 100);
    document.getElementById('finanzas-estrategia-min-inst').value = parseInt(est.min_instituciones || 1, 10);
    document.getElementById('finanzas-estrategia-max-tipo').value = est.max_concentracion_tipo !== null && est.max_concentracion_tipo !== undefined ? parseFloat(est.max_concentracion_tipo) : '';
    document.getElementById('finanzas-estrategia-asig-min').value = parseFloat(est.asignacion_minima_viable || 1000);
    document.getElementById('finanzas-estrategia-div-tipos').value = est.diversificar_tipos == 1 ? '1' : '0';
    document.getElementById('finanzas-estrategia-activo').value = est.activo == 1 ? '1' : '0';
    document.getElementById('finanzas-estrategia-descripcion').value = est.descripcion_criterio || '';

    const tit = document.getElementById('modal-finanzas-estrategia-titulo');
    if (tit) tit.textContent = `Editar Estrategia: ${est.nombre}`;

    modal.style.display = 'block';
}

function configurarModalFinanzasEstrategia() {
    const modal = document.getElementById('modal-finanzas-estrategia');
    const form = document.getElementById('form-finanzas-estrategia');
    const btnCerrar = document.getElementById('btn-cerrar-modal-finanzas-estrategia');
    const btnCancelar = document.getElementById('btn-cancelar-modal-finanzas-estrategia');

    if (!modal || !form || form.dataset.configured) return;
    form.dataset.configured = 'true';

    const cerrar = () => { modal.style.display = 'none'; };
    if (btnCerrar) btnCerrar.addEventListener('click', cerrar);
    if (btnCancelar) btnCancelar.addEventListener('click', cerrar);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('finanzas-estrategia-id').value;
        const nombre = document.getElementById('finanzas-estrategia-nombre').value;
        const maxInst = document.getElementById('finanzas-estrategia-max-inst').value;
        const minInst = document.getElementById('finanzas-estrategia-min-inst').value;
        const maxTipo = document.getElementById('finanzas-estrategia-max-tipo').value;
        const asigMin = document.getElementById('finanzas-estrategia-asig-min').value;
        const divTipos = document.getElementById('finanzas-estrategia-div-tipos').value;
        const activo = document.getElementById('finanzas-estrategia-activo').value;
        const descripcion = document.getElementById('finanzas-estrategia-descripcion').value;

        try {
            const res = await fetch(`/api/admin/finanzas/estrategias/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre,
                    max_concentracion_inst: parseFloat(maxInst),
                    min_instituciones: parseInt(minInst, 10),
                    max_concentracion_tipo: maxTipo ? parseFloat(maxTipo) : null,
                    diversificar_tipos: parseInt(divTipos, 10),
                    asignacion_minima_viable: parseFloat(asigMin) || 1000,
                    descripcion_criterio: descripcion,
                    activo: parseInt(activo, 10)
                })
            });

            const data = await res.json();
            if (res.ok) {
                modal.style.display = 'none';
                if (window.showModal) window.showModal(data.message || 'Estrategia actualizada exitosamente.');
                await loadFinanzasEstrategias();
            } else {
                handleAdminError(res, data, 'Error al actualizar la estrategia.');
            }
        } catch (err) {
            console.error('Error guardando estrategia:', err);
            if (window.showModal) window.showModal('Error de red al actualizar la estrategia.');
        }
    });
}

window.loadFinanzasInstituciones = loadFinanzasInstituciones;
window.loadFinanzasTasas = loadFinanzasTasas;
window.loadFinanzasEstrategias = loadFinanzasEstrategias;
window.initAdminBlocks = initAdminBlocks;

// =========================================================================
// MÓDULO: CONTEXTO DE IDEALITA (ai_contexto - FASE 1)
// =========================================================================

let aiContextoCache = [];
let aiContextoCategoriasCache = [];
let aiContextoListenersConfigurados = false;

/**
 * Devuelve el estilo HTML de la insignia de categoría según su nombre.
 */
function getCategoriaBadgeHtml(categoria) {
    const cat = String(categoria || 'General').toLowerCase().trim();
    const map = {
        'idealandia': { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
        'idealita': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
        'finanzas': { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
        'pensiones': { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
        'reglas': { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
        'ideas': { bg: '#fdf4ff', color: '#a21caf', border: '#f5d0fe' },
        'asociados': { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
        'servicios': { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
        'administración': { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
        'administracion': { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' }
    };

    const style = map[cat] || { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
    return `<span style="font-weight: 700; padding: 2px 8px; border-radius: 4px; background: ${style.bg}; color: ${style.color}; border: 1px solid ${style.border}; font-size: 0.8rem; display: inline-block;">${escapeHTML(categoria || 'General')}</span>`;
}

/**
 * Carga los registros de ai_contexto desde la API administrativa.
 */
async function loadAiContexto() {
    const tbody = document.getElementById('admin-contexto-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Cargando contexto de Idealita...</td></tr>';

    try {
        const res = await fetch('/api/admin/contexto');
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            handleAdminError(res, data, 'Error al cargar el contexto de Idealita.');
            return;
        }

        const data = await res.json();
        aiContextoCache = Array.isArray(data.contextos) ? data.contextos : [];
        aiContextoCategoriasCache = Array.isArray(data.categorias) ? data.categorias : [];

        actualizarSelectCategoriasContexto();
        configurarEventosAiContexto();
        filtrarYRenderizarAiContexto();
    } catch (err) {
        console.error('Error in loadAiContexto:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #dc2626;">Error de red al cargar el contexto.</td></tr>';
    }
}

/**
 * Actualiza el select de categorías y el datalist del formulario.
 */
function actualizarSelectCategoriasContexto() {
    const select = document.getElementById('admin-contexto-filtro-categoria');
    const datalist = document.getElementById('lista-categorias-contexto');

    // Categorías combinadas
    const defaults = ['General', 'Idealandia', 'Idealita', 'Reglas', 'Ideas', 'Finanzas', 'Pensiones', 'Asociados', 'Servicios', 'Administración'];
    const categoriasFromCache = aiContextoCache.map(c => c.categoria).filter(Boolean);
    const todas = Array.from(new Set([...defaults, ...aiContextoCategoriasCache, ...categoriasFromCache])).sort();

    if (select) {
        const currentVal = select.value;
        select.innerHTML = '<option value="todas">Todas las categorías</option>';
        todas.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
        if (currentVal && (currentVal === 'todas' || todas.includes(currentVal))) {
            select.value = currentVal;
        }
    }

    if (datalist) {
        datalist.innerHTML = '';
        todas.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            datalist.appendChild(opt);
        });
    }
}

/**
 * Aplica los filtros de búsqueda, categoría y estado sobre el caché y dibuja las filas.
 */
function filtrarYRenderizarAiContexto() {
    const tbody = document.getElementById('admin-contexto-tbody');
    const counter = document.getElementById('admin-contexto-counter');
    const searchInput = document.getElementById('admin-contexto-search');
    const catSelect = document.getElementById('admin-contexto-filtro-categoria');
    const statusSelect = document.getElementById('admin-contexto-filtro-estatus');

    if (!tbody) return;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const categoria = catSelect ? catSelect.value : 'todas';
    const estatus = statusSelect ? statusSelect.value : 'todos';

    const filtrados = aiContextoCache.filter(item => {
        // Filtro por estatus
        if (estatus !== 'todos') {
            const esperado = estatus === '1' ? 1 : 0;
            if (item.activo !== esperado) return false;
        }

        // Filtro por categoría
        if (categoria !== 'todas') {
            if (String(item.categoria || '').toLowerCase() !== categoria.toLowerCase()) return false;
        }

        // Filtro por texto
        if (query) {
            const matchTitulo = String(item.titulo || '').toLowerCase().includes(query);
            const matchContenido = String(item.contenido || '').toLowerCase().includes(query);
            const matchCat = String(item.categoria || '').toLowerCase().includes(query);
            if (!matchTitulo && !matchContenido && !matchCat) return false;
        }

        return true;
    });

    if (counter) {
        counter.textContent = `${filtrados.length} de ${aiContextoCache.length} registros`;
    }

    tbody.innerHTML = '';

    if (filtrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 32px 20px; color: #64748b;">
                    <i class="fas fa-search" style="font-size: 1.3rem; margin-bottom: 8px; display: block; color: #cbd5e1;"></i>
                    No se encontraron registros de contexto con los filtros aplicados.
                </td>
            </tr>
        `;
        return;
    }

    filtrados.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.contextoId = item.id;

        // 1. Categoría
        const tdCat = document.createElement('td');
        tdCat.innerHTML = getCategoriaBadgeHtml(item.categoria);
        tr.appendChild(tdCat);

        // 2. Título
        const tdTitulo = document.createElement('td');
        tdTitulo.innerHTML = `<strong>${escapeHTML(item.titulo)}</strong>`;
        tr.appendChild(tdTitulo);

        // 3. Contenido (preview con visualización de texto largo)
        const tdContenido = document.createElement('td');
        tdContenido.style.fontSize = '0.86rem';
        tdContenido.style.color = '#334155';
        tdContenido.style.lineHeight = '1.45';

        const contenidoStr = String(item.contenido || '');
        if (contenidoStr.length > 130) {
            const textoCorto = escapeHTML(contenidoStr.slice(0, 120));
            tdContenido.innerHTML = `
                <span>${textoCorto}...</span>
                <button type="button" class="btn-ver-mas-contexto" style="background: none; border: none; color: #7c3aed; font-weight: 700; cursor: pointer; padding: 0 4px; font-size: 0.8rem;" title="Hacer clic para ver el contenido completo">
                    [Ver más]
                </button>
            `;
            const btnMas = tdContenido.querySelector('.btn-ver-mas-contexto');
            if (btnMas) btnMas.onclick = () => abrirModalEditarContexto(item);
        } else {
            tdContenido.textContent = contenidoStr;
        }
        tr.appendChild(tdContenido);

        // 4. Prioridad
        const tdPrio = document.createElement('td');
        tdPrio.style.textAlign = 'center';
        tdPrio.innerHTML = `<span style="font-weight: 700; color: #1e293b; background: #f8fafc; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">${item.prioridad}</span>`;
        tr.appendChild(tdPrio);

        // 5. Versión
        const tdVersion = document.createElement('td');
        tdVersion.style.textAlign = 'center';
        tdVersion.innerHTML = `<span style="font-weight: 600; color: #475569; font-size: 0.82rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">v${item.version}</span>`;
        tr.appendChild(tdVersion);

        // 6. Estatus
        const tdStatus = document.createElement('td');
        tdStatus.style.textAlign = 'center';
        if (item.activo === 1) {
            tdStatus.innerHTML = '<span style="font-weight: 700; color: #166534; background: #dcfce7; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem;"><i class="fas fa-check-circle"></i> Activo</span>';
        } else {
            tdStatus.innerHTML = '<span style="font-weight: 700; color: #64748b; background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem;"><i class="fas fa-ban"></i> Inactivo</span>';
        }
        tr.appendChild(tdStatus);

        // 7. Actualizado
        const tdFecha = document.createElement('td');
        tdFecha.style.textAlign = 'center';
        tdFecha.style.fontSize = '0.8rem';
        tdFecha.style.color = '#64748b';
        tdFecha.textContent = item.updated_at ? item.updated_at.replace('T', ' ').slice(0, 16) : '—';
        tr.appendChild(tdFecha);

        // 8. Acciones
        const tdAcciones = document.createElement('td');
        tdAcciones.className = 'admin-actions-cell';
        const actionsGroup = createAdminActionsGroup();

        // Botón Editar
        const editBtn = createAdminActionButton({
            type: 'edit',
            icon: 'fas fa-pen',
            title: 'Editar contexto',
            srText: 'Editar',
            onClick: () => abrirModalEditarContexto(item)
        });
        actionsGroup.appendChild(editBtn);

        // Botón Activar / Desactivar
        const toggleBtn = createAdminActionButton({
            type: item.activo ? 'toggle-active' : 'toggle-inactive',
            icon: item.activo ? 'fas fa-toggle-on' : 'fas fa-toggle-off',
            title: item.activo ? 'Desactivar contexto' : 'Activar contexto',
            srText: item.activo ? 'Desactivar' : 'Activar',
            onClick: async () => {
                await toggleEstatusContexto(item.id, item.activo ? 0 : 1);
            }
        });
        actionsGroup.appendChild(toggleBtn);

        // Botón Eliminar
        const deleteBtn = createAdminActionButton({
            type: 'delete',
            icon: 'fas fa-trash',
            title: 'Eliminar contexto',
            srText: 'Eliminar',
            onClick: async () => {
                await confirmarEliminarContexto(item);
            }
        });
        actionsGroup.appendChild(deleteBtn);

        tdAcciones.appendChild(actionsGroup);
        tr.appendChild(tdAcciones);

        tbody.appendChild(tr);
    });

    const table = document.getElementById('admin-contexto-table');
    if (table) makeAdminTableSortable(table);
}

/**
 * Abre el modal para crear un nuevo registro de contexto.
 */
function abrirModalCrearContexto() {
    const modal = document.getElementById('modal-ai-contexto');
    const form = document.getElementById('form-ai-contexto');
    const titulo = document.getElementById('modal-ai-contexto-titulo');
    const versionBadge = document.getElementById('ai-contexto-version-badge');

    if (!modal || !form) return;

    form.reset();
    document.getElementById('ai-contexto-id').value = '';
    document.getElementById('ai-contexto-categoria').value = 'General';
    document.getElementById('ai-contexto-prioridad').value = '100';
    document.getElementById('ai-contexto-activo').checked = true;

    if (titulo) {
        titulo.innerHTML = '<i class="fas fa-brain" style="color: #8b5cf6;"></i> <span>Nuevo Contexto de Idealita</span>';
    }
    if (versionBadge) {
        versionBadge.style.display = 'none';
    }

    modal.style.display = 'flex';
}

/**
 * Abre el modal para editar un contexto existente.
 */
function abrirModalEditarContexto(item) {
    const modal = document.getElementById('modal-ai-contexto');
    const form = document.getElementById('form-ai-contexto');
    const titulo = document.getElementById('modal-ai-contexto-titulo');
    const versionBadge = document.getElementById('ai-contexto-version-badge');
    const versionVal = document.getElementById('ai-contexto-version-val');

    if (!modal || !form || !item) return;

    form.reset();
    document.getElementById('ai-contexto-id').value = item.id;
    document.getElementById('ai-contexto-categoria').value = item.categoria || 'General';
    document.getElementById('ai-contexto-titulo').value = item.titulo || '';
    document.getElementById('ai-contexto-contenido').value = item.contenido || '';
    document.getElementById('ai-contexto-prioridad').value = item.prioridad || 100;
    document.getElementById('ai-contexto-activo').checked = item.activo === 1;

    if (titulo) {
        titulo.innerHTML = `<i class="fas fa-pen-fancy" style="color: #8b5cf6;"></i> <span>Editar Contexto: ${escapeHTML(item.titulo)}</span>`;
    }
    if (versionVal) {
        versionVal.textContent = item.version || 1;
    }
    if (versionBadge) {
        versionBadge.style.display = 'inline-block';
    }

    modal.style.display = 'flex';
}

/**
 * Cierra el modal de contexto.
 */
function cerrarModalAiContexto() {
    const modal = document.getElementById('modal-ai-contexto');
    if (modal) modal.style.display = 'none';
}

/**
 * Alterna el estatus activo/inactivo de un contexto.
 */
async function toggleEstatusContexto(id, nuevoActivo) {
    try {
        const res = await fetch(`/api/admin/contexto/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: nuevoActivo })
        });

        const data = await res.json();
        if (res.ok) {
            if (window.showModal) window.showModal(data.message || 'Estatus actualizado.');
            await loadAiContexto();
        } else {
            handleAdminError(res, data, 'Error al cambiar estatus del contexto.');
        }
    } catch (err) {
        console.error('Error toggling contexto:', err);
        if (window.showModal) window.showModal('Error de red al actualizar estatus.');
    }
}

/**
 * Solicita confirmación y elimina un registro de contexto.
 */
async function confirmarEliminarContexto(item) {
    const confirmacion = window.confirm(`¿Estás seguro de que deseas eliminar el contexto "${item.titulo}"?\n\nEsta acción eliminará el conocimiento de la base de datos.`);
    if (!confirmacion) return;

    try {
        const res = await fetch(`/api/admin/contexto/${item.id}`, {
            method: 'DELETE'
        });

        const data = await res.json();
        if (res.ok) {
            if (window.showModal) window.showModal(data.message || 'Contexto eliminado.');
            await loadAiContexto();
        } else {
            handleAdminError(res, data, 'Error al eliminar contexto.');
        }
    } catch (err) {
        console.error('Error deleting contexto:', err);
        if (window.showModal) window.showModal('Error de red al eliminar contexto.');
    }
}

/**
 * Configura los eventos e interacciones del módulo de contexto.
 */
function configurarEventosAiContexto() {
    if (aiContextoListenersConfigurados) return;
    aiContextoListenersConfigurados = true;

    // Botón abrir modal nuevo
    const btnNuevo = document.getElementById('btn-nuevo-contexto');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', () => abrirModalCrearContexto());
    }

    // Botones cerrar modal
    const btnCerrar = document.getElementById('btn-cerrar-modal-ai-contexto');
    const btnCancelar = document.getElementById('btn-cancelar-modal-ai-contexto');
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarModalAiContexto);
    if (btnCancelar) btnCancelar.addEventListener('click', cerrarModalAiContexto);

    // Filtros interactivos
    const searchInput = document.getElementById('admin-contexto-search');
    const catSelect = document.getElementById('admin-contexto-filtro-categoria');
    const statusSelect = document.getElementById('admin-contexto-filtro-estatus');

    if (searchInput) searchInput.addEventListener('input', () => filtrarYRenderizarAiContexto());
    if (catSelect) catSelect.addEventListener('change', () => filtrarYRenderizarAiContexto());
    if (statusSelect) statusSelect.addEventListener('change', () => filtrarYRenderizarAiContexto());

    // Submit del formulario (crear / editar)
    const form = document.getElementById('form-ai-contexto');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('ai-contexto-id').value;
            const categoria = document.getElementById('ai-contexto-categoria').value.trim();
            const titulo = document.getElementById('ai-contexto-titulo').value.trim();
            const contenido = document.getElementById('ai-contexto-contenido').value.trim();
            const prioridad = parseInt(document.getElementById('ai-contexto-prioridad').value, 10) || 100;
            const activo = document.getElementById('ai-contexto-activo').checked ? 1 : 0;

            if (!titulo || !contenido) {
                if (window.showModal) window.showModal('El título y contenido son obligatorios.');
                else alert('El título y contenido son obligatorios.');
                return;
            }

            const isEdit = !!id;
            const url = isEdit ? `/api/admin/contexto/${id}` : '/api/admin/contexto';
            const method = isEdit ? 'PUT' : 'POST';

            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categoria: categoria || 'General',
                        titulo,
                        contenido,
                        prioridad,
                        activo
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    cerrarModalAiContexto();
                    if (window.showModal) window.showModal(data.message || 'Contexto guardado exitosamente.');
                    await loadAiContexto();
                } else {
                    handleAdminError(res, data, 'Error al guardar contexto.');
                }
            } catch (err) {
                console.error('Error saving contexto:', err);
                if (window.showModal) window.showModal('Error de red al guardar contexto.');
            }
        });
    }
}

window.loadAiContexto = loadAiContexto;
window.abrirModalCrearContexto = abrirModalCrearContexto;
window.abrirModalEditarContexto = abrirModalEditarContexto;
window.toggleEstatusContexto = toggleEstatusContexto;
window.confirmarEliminarContexto = confirmarEliminarContexto;
