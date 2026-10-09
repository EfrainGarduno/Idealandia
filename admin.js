
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

document.addEventListener('DOMContentLoaded', () => {
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
            rolesBtn.textContent = 'Ver/Editar Roles';
            rolesBtn.className = 'btn btn-secondary btn-sm';
            rolesBtn.onclick = () => showEditRolesModal(u.id, u.usuario);
            td.appendChild(rolesBtn);
            tr.appendChild(td);

            // Acciones
            td = document.createElement('td');

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Editar';

            editBtn.className = 'btn btn-primary btn-sm';
            editBtn.onclick = () => showEditUsuarioModal(u);
            td.appendChild(editBtn);
            tr.appendChild(td);

            tbody.appendChild(tr);
        }
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
            permBtn.textContent = 'Ver/Editar Permisos';
            permBtn.className = 'btn btn-secondary btn-sm';
            permBtn.onclick = () => showEditPermisosModal(r.id, r.nombre);
            td.appendChild(permBtn);
            tr.appendChild(td);

            // Acciones
            td = document.createElement('td');

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Editar';

            editBtn.className = 'btn btn-primary btn-sm';
            editBtn.onclick = () => showEditRolModal(r);
            td.appendChild(editBtn);
            tr.appendChild(td);

            tbody.appendChild(tr);
        }
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

            tbody.appendChild(tr);
        }
    } catch (error) {
        console.error(error);
        if (window.showModal) window.showModal('Error al cargar permisos.');
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
            const permBtn = document.createElement('button');
            permBtn.textContent = 'Permisos';
            permBtn.className = 'btn btn-secondary btn-sm';
            permBtn.style.marginRight = '5px';
            permBtn.onclick = () => showEditFuncPermisosModal(f.id, f.nombre);
            td.appendChild(permBtn);

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Editar';
            editBtn.className = 'btn btn-primary btn-sm';
            editBtn.onclick = () => showEditFuncionalidadModal(f);

            td.appendChild(editBtn);
            tr.appendChild(td);

            tbody.appendChild(tr);
        }
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
            td = document.createElement('td'); td.textContent = m.funcionalidad_id || 'NULL'; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.parent_id || 'NULL'; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.orden; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.publico ? 'Sí' : 'No'; tr.appendChild(td);
            td = document.createElement('td'); td.textContent = m.activo ? 'Sí' : 'No'; tr.appendChild(td);

            td = document.createElement('td');

            const editBtn = document.createElement('button');
            editBtn.textContent = 'Editar';

            editBtn.className = 'btn btn-primary btn-sm';
            editBtn.onclick = () => showEditMenuModal(m);
            td.appendChild(editBtn);
            tr.appendChild(td);

            tbody.appendChild(tr);
        }
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
            <div style="text-align: left; max-height: 300px; overflow-y: auto; margin-bottom: 10px;">
        `;

        allPerms.forEach(p => {
            const isChecked = rolPerms.includes(p.id) ? 'checked' : '';
            html += `
                <div>
                    <input type="checkbox" id="perm-cb-${p.id}" value="${escapeHTML(p.id)}" ${isChecked}>
                    <label for="perm-cb-${p.id}">${escapeHTML(p.nombre)} (${escapeHTML(p.codigo)})</label>
                </div>
            `;
        });

        html += `
            </div>
            <button id="btn-save-rol-perms" class="btn btn-primary" style="margin-top: 10px;">Guardar</button>
            <button id="btn-cancel-rol-perms" class="btn btn-secondary" style="margin-top: 10px;">Cancelar</button>
        `;

        const overlay = document.getElementById('custom-modal');
        const textElement = document.getElementById('custom-modal-message');
        const buttonsContainer = document.getElementById('custom-modal-buttons');

        textElement.innerHTML = `<h3>Permisos de Rol: ${escapeHTML(rolName)}</h3>` + html;
        buttonsContainer.innerHTML = '';
        overlay.classList.add('active');

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

document.addEventListener('DOMContentLoaded', () => {
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
    btnCreateUser.style.marginBottom = '1rem';

    // Add create user button and search input to Users tab
    const usersTab = document.getElementById('admin-usuarios');
    if (usersTab) {
        const header = usersTab.querySelector('h3');

        const controlsDiv = document.createElement('div');
        controlsDiv.style.display = 'flex';
        controlsDiv.style.gap = '10px';
        controlsDiv.style.marginBottom = '10px';

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
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.id = 'search-roles';
            searchInput.placeholder = 'Buscar roles...';
            searchInput.className = 'form-input';
            searchInput.style.marginLeft = '10px';
            btn.after(searchInput);

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
            fetch('/api/admin/permisos')
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
