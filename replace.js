const fs = require('fs');
let content = fs.readFileSync('test_voice_identity.js', 'utf8');

content = content.replace(/serverContent:\s*\{\s*modelTurn:\s*\{\s*parts:\s*\[\s*\{\s*functionCall:\s*\{\s*id:\s*"call_123",\s*name:\s*"consultar_ideas_usuario"\s*\}\s*\}\s*\]\s*\}\s*\}/g, 'toolCall: { functionCalls: [ { id: "call_123", name: "consultar_ideas_usuario" } ] }');

content = content.replace(/serverContent:\s*\{\s*modelTurn:\s*\{\s*parts:\s*\[\s*\{\s*functionCall:\s*\{\s*id:\s*"call_456",\s*name:\s*"consultar_ideas_usuario"\s*\}\s*\}\s*\]\s*\}\s*\}/g, 'toolCall: { functionCalls: [ { id: "call_456", name: "consultar_ideas_usuario" } ] }');

fs.writeFileSync('test_voice_identity.js', content);
