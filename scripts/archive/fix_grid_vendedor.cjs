const fs = require('fs');
let server = fs.readFileSync('server.ts', 'utf8');

server = server.replace(
  /const vName = row\[0\]\.split\('-'\)\[0\]\.trim\(\) \|\| row\[0\];/g,
  "const parts = String(row[0]).split('-');\n          const vName = (parts.length > 1 ? parts.slice(1).join('-') : parts[0]).trim();"
);

fs.writeFileSync('server.ts', server);
