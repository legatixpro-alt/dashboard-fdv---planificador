const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "        .select('razon_social')",
  "        .select('*')"
);

code = code.replace(
  "      return res.json({ nombre: data.razon_social });",
  "      return res.json({ nombre: data.razon_social, vendedor: data.vendedor_nombre });"
);

fs.writeFileSync('server.ts', code);
