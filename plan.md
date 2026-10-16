1. **Fix Responsive Design (CSS)**
   - Remove rigid dimensions from `.chat-section-override` and `#chat-container` (e.g., remove `width: 90% !important`, `max-width: 900px !important`). Instead, use container queries or flexbox max-widths on the inner content area, leaving the chat container to be fluid. Let flex stretch take care of filling horizontal space nicely but max widths to prevent taking entire screen.
   - For Mobile view (`@media (max-width: 768px)`), modify `#chat-container` to stack vertically (`flex-direction: column`).
   - Fix `#content-area` overflow and centering issues.
   - Adjust `footer` styles (currently hardcoded inline style on index.html) to flex layout, wrap nicely on mobile, accommodating the social media icons which are currently `.floating-social` (maybe move them inside the footer or adjust `.floating-social` media queries so they don't break/overlap).
   - Important constraint: do not modify `applyIdealitaRestPose(vrm)` or VRM rendering code.

2. **Fix Delete User Error**
   - The backend query for `DELETE /api/admin/usuarios` checks if removing a user would leave the system without administrators:
     ```sql
     SELECT COUNT(DISTINCT ur.usuario_id) as count
     FROM usuario_roles ur
     ...
     ```
   - The bug is likely here or in the delete itself. Also, need to check if there are foreign keys on `ideas` table or others. Let's look at `/api/ideas/:id` where it deletes from ideas. The user might have ideas (`usuario_id`), which prevents deleting the user due to foreign key constraints.
   - The delete endpoint currently does:
     ```js
     await connection.execute('DELETE FROM usuario_roles WHERE usuario_id = ?', [userIdToDelete]);
     const [deleteResult] = await connection.execute('DELETE FROM usuarios WHERE id = ?', [userIdToDelete]);
     ```
   - If `ideas` table has `usuario_id` foreign key and it doesn't `ON DELETE CASCADE`, deleting `usuarios` will fail with "internal server error".
   - Need to modify the delete endpoint to:
     - Check if user has associated ideas. If they do, block deletion with a clear message: `No se puede eliminar el usuario porque tiene ideas asociadas.` (or gracefully delete the ideas if business logic permits, but prompt says "comprueba cómo deben tratarse los registros relacionados ... no elimines información relacionada indiscriminadamente. Si la eliminación está bloqueada por una restricción legítima, devuelve un mensaje comprensible y conserva la integridad de los datos"). So, check and block with a clean message.

3. **Fix and Validate Visit Counter**
   - In `server.js`:
     ```js
     let visitCounter = 0;
     app.get('/api/visitas', (req, res) => {
         visitCounter++;
         res.json({ visitas: visitCounter, version: require('./package.json').version });
     });
     ```
   - This increments on *every* request to `/api/visitas`, which happens on every page load (SPA init). It is not persistent (it's kept in memory `let visitCounter = 0`).
   - Create a simple persistence (e.g. read/write from a file `visitas.json` or create a simple table if DB is available - but constraint: "No modifiques la estructura de la base de datos existente o crees nuevas tablas directamente"). Wait, the prompt says "Utiliza el almacenamiento persistente apropiado para la arquitectura existente; no mantengas el total únicamente en una variable de JavaScript" and "Do not modify the existing database structure... If schema changes are strictly necessary, provide a separate, idempotent SQL script for review but do not execute it against production."
   - Given we have a file system (Node), perhaps a small `visitas.json` file is acceptable? Or we use `fs.readFileSync`/`fs.writeFileSync`.
   - Also, to prevent duplicate increments by the same user, use a cookie or session. When returning `/api/visitas`, check if `req.cookies.visited` is present. If not, increment, set cookie, save to persistent storage (e.g., `fs`).

4. **Testing**
   - Run `npm test`.
   - Add tests for new behaviors.
