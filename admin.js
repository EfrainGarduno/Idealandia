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


document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.admin-table').forEach(makeAdminTableSortable);
    const adminSection = document.getElementById('admin');

    // Setup tabs
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    const tabContents = document.querySelectorAll('.admin-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');

            // Load data when tab is clicked
            if (targetId === 'admin-usuarios') loadUsuarios();
            if (targetId === 'admin-roles') loadRoles();
            if (targetId === 'admin-permisos') loadPermisos();
            if (targetId === 'admin-funcionalidades') loadFuncionalidades();
            if (targetId === 'admin-accesos') loadAccesos();
            if (targetId === 'admin-menus') loadMenus();
        });
    });

    // We need to load initial tab data when the admin section becomes visible
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (adminSection.style.display === 'flex' || adminSection.style.display === 'block') {
                    // Refresh currently active tab
                    const activeTabBtn = document.querySelector('.admin-tab-btn.active');
                    if (activeTabBtn) {
                        activeTabBtn.click();
                    }
                }
            }
        });
    });

    if (adminSection) {
        observer.observe(adminSection, { attributes: true });
    }
});

async function loadUsuarios() {
    try {
        const response = await fetch('/api/admin/usuarios');
        if (!response.ok) throw new Error('Error al cargar usuarios');
        const usuarios = await response.json();

        const tbody = document.getElementById('admin-usuarios-tbody');
        tbody.innerHTML = '';

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
                                window.showModal(`Error: ${data.error}`);
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
        if (window.showModal) window.showModal('Error al cargar usuarios.');
    }
}

async function loadRoles() {
    try {
        const response = await fetch('/api/admin/roles');
        if (!response.ok) throw new Error('Error al cargar roles');
        const roles = await response.json();

        const tbody = document.getElementById('admin-roles-tbody');
        tbody.innerHTML = '';

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
        if (window.showModal) window.showModal('Error al cargar roles.');
    }
}

async function loadPermisos() {
    try {
        const response = await fetch('/api/admin/permisos');
        if (!response.ok) throw new Error('Error al cargar permisos');
        const permisos = await response.json();

        const tbody = document.getElementById('admin-permisos-tbody');
        tbody.innerHTML = '';

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

        permisos.forEach(p => {
            const isChecked = selectedPermisoIds.includes(p.id) ? 'checked' : '';
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
    try {
        const response = await fetch('/api/admin/accesos');
        if (!response.ok) throw new Error('Error al cargar accesos');
        const accesos = await response.json();

        const tbody = document.getElementById('admin-accesos-tbody');
        tbody.innerHTML = '';

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
                window.showModal(`Error: ${data.error}`);
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
                if (window.showModal) window.showModal(`Error: ${data.error || 'No se pudo eliminar el acceso.'}`);
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
                    window.showModal(`Error: ${data.error}`);
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
    try {
        const response = await fetch('/api/admin/funcionalidades');
        if (!response.ok) throw new Error('Error al cargar funcionalidades');
        const funcionalidades = await response.json();

        const tbody = document.getElementById('admin-funcionalidades-tbody');
        tbody.innerHTML = '';

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
        if (window.showModal) window.showModal('Error al cargar funcionalidades.');
    }
}

async function loadMenus() {
    try {
        const response = await fetch('/api/admin/menus');
        if (!response.ok) throw new Error('Error al cargar menús');
        const menus = await response.json();

        const tbody = document.getElementById('admin-menus-tbody');
        tbody.innerHTML = '';

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
                            window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                    window.showModal(`Error: ${data.error}`);
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
                    window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                        window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                    window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
                window.showModal(`Error: ${data.error}`);
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
    if (Array.isArray(a.permisos)) {
        preselectedPermIds = a.permisos.map(p => typeof p === 'object' ? p.id : parseInt(p));
    } else {
        try {
            const pRes = await fetch(`/api/admin/accesos/${a.id}/permisos`);
            if (pRes.ok) {
                preselectedPermIds = await pRes.json();
            }
        } catch (e) {}
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
                window.showModal(`Error: ${data.error}`);
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
