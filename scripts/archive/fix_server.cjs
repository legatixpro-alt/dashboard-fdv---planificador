const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "return res.json({ nombre: data.razon_social, vendedor: data.vendedor_nombre });",
  "return res.json({ nombre: data.razon_social, vendedor: data.vendedor_nombre, direccion: data.direccion, ruc: data.codigo });"
);

fs.writeFileSync('server.ts', code);
