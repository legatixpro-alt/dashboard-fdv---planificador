const fs = require('fs');
let serverTs = fs.readFileSync('server.ts', 'utf8');
serverTs = serverTs.replace(/const row = clientJson\[i\];/g, 'const row = clientJson[i] as any[];');
fs.writeFileSync('server.ts', serverTs);
