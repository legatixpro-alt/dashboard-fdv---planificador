const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `              <p className="text-sm text-white font-bold mb-1">{clienteEncontrado.razonSocial}</p>`,
  `              <p className="text-sm text-white font-bold mb-1">{clienteEncontrado.razonSocial}</p>`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
