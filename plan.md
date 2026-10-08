1. **Understand the Goal:** The user wants to cherry-pick the dynamic menu and RBAC tests from PR #41 into `test.js` in the `main` branch. The constraints are:
   - Use `test.js` from `main` as the base.
   - Do not replace `test.js` entirely.
   - Retain `globalPermissions` instead of reverting to `globalAuthRole`.
   - Add the `/api/menu` mock.
   - Add the dynamic menu tests, adapting them to use `globalPermissions`.
   - Ensure the mock is initialized before any code that calls `checkAuthStatus()` (which may fetch `/api/menu`).
   - Fix JSDOM initialization order: DOM first, fetch mocks before `checkAuthStatus`, global state before app init.
   - Fix asynchronous issues without skipping tests.
   - Ensure `npm test` passes, including new tests, RBAC, and delete logic.
   - Keep `server.js` (with `p.codigo`), `index.html`, and `plan.md` as they are in main.
   - Keep everything in PR #41 branch.

2. **Analysis of `test.js` (main):**
   - It defines `window.fetch` to mock responses.
   - It sets up `globalAuthState` and `globalPermissions`.
   - It triggers application logic inside `window.addEventListener('load')` by calling event dispatches.
   - It uses a nested `setTimeout` structure to run assertions sequentially.
   - We need to add the mock for `/api/menu` in the `window.fetch` implementation. It should use `globalPermissions` instead of `globalAuthRole`.
   - We need to append the dynamic menu tests at the end of `testAuthFlow` in `test.js`.

3. **Modifications to `test.js`:**
   - **Mocking `/api/menu`:**
     ```javascript
     } else if (url === '/api/menu' && (!options || options.method === 'GET' || !options.method)) {
         if (globalPermissions.includes('admin.access')) {
             return {
                 ok: true,
                 json: async () => ([
                     { id: 1, nombre: 'Inicio', orden: 1, ruta: '/', hijos: [] },
                     { id: 2, nombre: 'Ideas', orden: 2, ruta: '/ideas', hijos: [] },
                     { id: 3, nombre: 'Servicios', orden: 3, hijos: [ { id: 16, nombre: 'Asesorías Financieras', orden: 1, ruta: '/asesorias' } ] },
                     { id: 10, nombre: 'Administración', orden: 10, ruta: '/admin', hijos: [] }
                 ])
             };
         } else if (globalAuthState) {
              return {
                 ok: true,
                 json: async () => ([
                     { id: 1, nombre: 'Inicio', orden: 1, ruta: '/', hijos: [] },
                     { id: 2, nombre: 'Ideas', orden: 2, ruta: '/ideas', hijos: [] },
                     { id: 3, nombre: 'Servicios', orden: 3, hijos: [ { id: 16, nombre: 'Asesorías Financieras', orden: 1, ruta: '/asesorias' } ] }
                 ])
             };
         } else {
              return {
                 ok: true,
                 json: async () => ([
                     { id: 1, nombre: 'Inicio', orden: 1, ruta: '/', hijos: [] }
                 ])
             };
         }
     }
     ```
   - **Adding Tests:** Inside the `testAuthFlow` function's final `setTimeout` (after testing logout and unauthenticated DELETE), replace the existing `admin/check` tests with the unified dynamic menu and RBAC tests from PR #41, adapting `globalAuthRole` to `globalPermissions`.
     ```javascript
                                     // Start of dynamic menu testing
                                     console.log("Testing Dynamic Menu...");
                                     globalAuthState = false;
                                     globalPermissions = [];

                                     // Test 1: Unauthenticated
                                     const menuGuestRes = await window.fetch('/api/menu');
                                     const menuGuest = await menuGuestRes.json();
                                     if (menuGuest.some(i => i.nombre === 'Ideas' || i.nombre === 'Administración')) {
                                          console.error("Test failed: Unauthenticated user should only see public items.");
                                          process.exit(1);
                                     }

                                     // Test 2: Authenticated user
                                     globalAuthState = true;
                                     const menuUserRes = await window.fetch('/api/menu');
                                     const menuUser = await menuUserRes.json();
                                     if (menuUser.some(i => i.nombre === 'Administración')) {
                                          console.error("Test failed: Standard user should NOT see Administración.");
                                          process.exit(1);
                                     }
                                     if (!menuUser.some(i => i.nombre === 'Ideas')) {
                                          console.error("Test failed: Standard user should see Ideas.");
                                          process.exit(1);
                                     }
                                     // Test 5: Servicios conserves submenus
                                     const servicios = menuUser.find(i => i.nombre === 'Servicios');
                                     if (!servicios || servicios.hijos.length === 0) {
                                          console.error("Test failed: Servicios should conserve its submenus.");
                                          process.exit(1);
                                     }

                                     // Test 4: 403 on admin resource
                                     globalPermissions = [];
                                     const adminCheckFail = await window.fetch('/api/admin/check');
                                     if (adminCheckFail.status !== 403) {
                                          console.error("Test failed: User without admin.access should get 403 on admin resource.");
                                          process.exit(1);
                                     }

                                     // Test 3: Administrator
                                     globalPermissions = ['admin.access'];
                                     const menuAdminRes = await window.fetch('/api/menu');
                                     const menuAdmin = await menuAdminRes.json();
                                     if (!menuAdmin.some(i => i.nombre === 'Administración')) {
                                          console.error("Test failed: Administrator should see Administración.");
                                          process.exit(1);
                                     }

                                     const adminCheckSuccess = await window.fetch('/api/admin/check');
                                     if (adminCheckSuccess.status !== 200) {
                                          console.error("Test failed: User with admin.access should get 200 on admin resource.");
                                          process.exit(1);
                                     }

                                     // Test 6: Check order
                                     let isOrdered = true;
                                     for (let i = 0; i < menuAdmin.length - 1; i++) {
                                         if (menuAdmin[i].orden > menuAdmin[i+1].orden) isOrdered = false;
                                     }
                                     if (!isOrdered) {
                                          console.error("Test failed: Menu elements order is not respected.");
                                          process.exit(1);
                                     }

                                     console.log('Test passed successfully: Context, multiple messages, registration form, auth flow, and dynamic menu worked. Delete logic fully tested.');
                                     process.exit(0);
     ```
   - Make sure `globalPermissions` is properly declared, which it is (`let globalPermissions = [];`).
   - Re-evaluate JSDOM initialization order: In `test.js`, the setup is already working and fetch mock is added *before* `dom` events are dispatched via `window.dispatchEvent(new window.Event('load'));`. The user specifically asked to "Make sure the mock is initialized BEFORE checkAuthStatus() or any code that can trigger the asynchronous menu request."
   - The user also said: "For server.js, index.html, and plan.md, keep the conflict resolutions already made. Also, server.js should retain p.codigo as already resolved from main. Do not create a new PR. Keep all changes in PR #41."
   - Currently on branch `jules-16973758359270078334-3e2da6f8`. I need to ensure I commit to this branch, but the user says "Keep all changes in PR #41". I am not in PR #41 branch. Wait, I should make the changes in the current branch `main` and then user probably meant that PR #41 will just be updated by whatever I commit if this branch is PR #41, but I am in `jules-...` branch. I will just do the changes in my current branch and `submit` using `pr-41` or this branch if it's the intended one, wait. Let's just follow standard instructions: I will modify `test.js` in my current branch (`jules-16973758359270078334-3e2da6f8` which is identical to `main`) and submit it to `pr-41` or keep it on my branch. I'll ask for plan review.
