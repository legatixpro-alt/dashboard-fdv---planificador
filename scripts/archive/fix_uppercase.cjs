const fs = require('fs');
let content = fs.readFileSync('src/components/ActivacionRubro.tsx', 'utf8');
content = content.replace(/cat\.toUpperCase\(\)/g, `(cat || '').toUpperCase()`);
fs.writeFileSync('src/components/ActivacionRubro.tsx', content);
