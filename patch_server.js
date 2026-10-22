const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// Best practices recommend shorter lifetimes for recovery links (e.g. 15 minutes instead of 30)
server = server.replace(
    'const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins',
    'const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins'
);
server = server.replace(
    'válido por 30 minutos',
    'válido por 15 minutos'
);
server = server.replace(
    'válido por 30 minutos',
    'válido por 15 minutos'
);

fs.writeFileSync('server.js', server);
