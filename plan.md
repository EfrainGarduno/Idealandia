1. **Analyze the Requirements and Database Structure**:
    - Based on the user's requirements, the goal is to build a dynamic menu for the "Idealandia" application by utilizing the existing database tables (`usuarios`, `roles`, `usuario_roles`, `permisos`, `rol_permisos`, `funcionalidades`, `funcionalidad_permisos`, `menu_items`).
    - The authorization rule specifies that `usuarios.rol` should not be used. Instead, the permissions must be evaluated by joining `usuarios` -> `usuario_roles` -> `roles` -> `rol_permisos` -> `permisos`.
    - Menu items are linked to functionalities via `menu_items.funcionalidad_id`. A functionality is permitted if the user holds the corresponding permission (`funcionalidades` -> `funcionalidad_permisos` -> `permisos`).
    - The backend must provide a new endpoint (e.g., `GET /api/menu`) that calculates and returns the authorized hierarchical menu tree for the current user.
    - If the user is unauthenticated, they only get `publico = TRUE` and `activo = TRUE` menu items.
    - If authenticated, they also get protected items they have access to.

2. **Implement Backend Logic in `server.js`**:
    - **Add a `GET /api/menu` endpoint**:
        - Verify authentication using the existing `auth_token` cookie.
        - If unauthenticated, fetch public, active menu items (`SELECT * FROM menu_items WHERE activo = 1 AND publico = 1 ORDER BY parent_id, orden`).
        - If authenticated, verify their token using `jwt.verify(token, process.env.AUTH_SECRET)`.
        - Get the user's allowed permissions using a SQL query joining `usuario_roles`, `rol_permisos`, and `permisos`.
        - Get the menu items:
            - A menu item is shown if it's public (`publico = 1`).
            - Or if it's protected (`publico = 0`) AND it has a `funcionalidad_id` that is allowed for the user's permissions.
            - Or if it's a container (`funcionalidad_id IS NULL`) and has at least one visible child.
        - Build a hierarchical JSON structure (`hijos` arrays) respecting `parent_id` and `orden`.
    - **Add Backend Security for existing endpoints**:
        - If there are endpoints that need to be protected by roles (e.g., `administracion`), update or create a middleware to check permissions instead of just token presence.
        - The user mentioned: "Si Administración requiere admin.access y el usuario no tiene ese permiso... Si intenta acceder directamente a /admin o al endpoint correspondiente, devolver 403 Forbidden." However, there's no `/admin` or `/api/admin` endpoint yet, and we are told not to implement the admin screen yet. But I will ensure the API logic checks the permission before serving protected info if requested. *Wait, actually, I don't need to add new endpoints. I just need to make sure the backend endpoint returning the menu is correct and the logic is secure.*

3. **Implement Frontend Logic in `index.html`**:
    - Update `index.html` to fetch the menu from `/api/menu` on load and when the auth status changes (e.g., inside `checkAuthStatus`).
    - **Dynamically construct `#main-menu > ul`**:
        - Remove the hardcoded `<li>` items except maybe the chat link at the bottom if it's not in the DB, but wait, the prompt says "NO agregues todavía iconos a la base de datos... Si actualmente los iconos están definidos en frontend, puedes conservarlos por ahora." So I'll need a mapping of menu names/ids to their corresponding FontAwesome icons.
        - Recursively build the menu DOM based on the JSON response from `/api/menu`.
        - Make sure "Servicios" container logic works (expand/collapse submenu).
        - Ensure responsive and mobile menus still work perfectly.

4. **Add Tests**:
    - Add tests in `test.js` or create a new test file `test_menu.js` (and add it to `npm test` script in `package.json` if needed).
    - Mock the database or API responses. Since `test.js` mocks `window.fetch`, I'll update the `window.fetch` mock to handle `/api/menu` for unauthenticated, user, and admin roles.
    - Test Case 1: Unauthenticated -> only public items.
    - Test Case 2: Authenticated user -> public + permitted items.
    - Test Case 3: Admin -> sees Administration.
    - Test Case 4: 403 when trying to access admin endpoint (I'll implement a dummy `/api/admin` endpoint that checks `admin.access` to satisfy this test, or just test the security of the menu endpoint itself).
    - Test Case 5: Container visibility if it has children.
    - Test Case 6: Order is respected.
    - Test Case 7: `activo = FALSE` is not shown.

5. **Pre-commit Instructions**:
    - Ensure proper testing, verification, review, and reflection are done by calling the pre-commit instructions tool.

6. **Submit**:
    - Commit and submit.
