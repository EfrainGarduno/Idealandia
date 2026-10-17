const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

// 1. Add centralized verifyToken function
const verifyTokenFunction = `
async function verifyToken(token, connectionPool) {
    const secret = process.env.AUTH_SECRET;
    const decoded = jwt.verify(token, secret);

    // Check DB for jwt_version to invalidate old tokens
    const [users] = await connectionPool.execute('SELECT jwt_version FROM usuarios WHERE id = ?', [decoded.id]);
    if (users.length === 0) {
        throw new Error('Usuario no encontrado');
    }

    const currentVersion = users[0].jwt_version || 1;
    const tokenVersion = decoded.jwt_version || 1;

    if (tokenVersion !== currentVersion) {
        throw new Error('Token revocado');
    }

    return decoded;
}
`;

serverCode = serverCode.replace(
    /const app = express\(\);/,
    `${verifyTokenFunction}\nconst app = express();`
);

// 2. Update /api/login to include jwt_version
serverCode = serverCode.replace(
    /SELECT id, usuario, password_hash, nombre, telefono, email FROM usuarios WHERE usuario = \? OR email = \?/,
    'SELECT id, usuario, password_hash, nombre, telefono, email, jwt_version FROM usuarios WHERE usuario = ? OR email = ?'
);
serverCode = serverCode.replace(
    /const payload = {\n\s+id: user\.id,\n\s+usuario: user\.usuario\n\s+};/,
    'const payload = {\n            id: user.id,\n            usuario: user.usuario,\n            jwt_version: user.jwt_version || 1\n        };'
);
// Also remove jwt_version from userData being returned to client
serverCode = serverCode.replace(
    /const { password_hash, \.\.\.userData } = user;/,
    'const { password_hash, jwt_version, ...userData } = user;'
);

// 3. Update /api/reset to increment jwt_version
serverCode = serverCode.replace(
    /await connection\.execute\('UPDATE usuarios SET password_hash = \? WHERE id = \?', \[newPasswordHash, userId\]\);/,
    'await connection.execute(\'UPDATE usuarios SET password_hash = ?, jwt_version = COALESCE(jwt_version, 1) + 1 WHERE id = ?\', [newPasswordHash, userId]);'
);

// 4. Update /api/me to use verifyToken
serverCode = serverCode.replace(
    /const decoded = jwt\.verify\(token, secret\);/,
    'const decoded = await verifyToken(token, pool);'
);

// 5. Update /api/menu to use verifyToken
serverCode = serverCode.replace(
    /const decoded = jwt\.verify\(token, secret\);/,
    'const decoded = await verifyToken(token, pool);'
);

// 6. Update requireAdmin to use verifyToken
serverCode = serverCode.replace(
    /const decoded = jwt\.verify\(token, secret\);/,
    'const decoded = await verifyToken(token, pool);'
);

// 7. Update /api/ideas (GET) to use verifyToken
serverCode = serverCode.replace(
    /const decoded = jwt\.verify\(token, secret\);\n\s+const usuario_id = decoded\.id;/g,
    'const decoded = await verifyToken(token, pool);\n        const usuario_id = decoded.id;'
);

fs.writeFileSync('server.js', serverCode);
console.log("JWT Patch applied");
