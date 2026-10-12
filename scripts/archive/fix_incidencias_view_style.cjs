const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `              <p className="text-white font-bold mb-1">{clienteEncontrado.razonSocial}</p>`,
  `              <p className="text-sm text-white font-bold mb-1">{clienteEncontrado.razonSocial}</p>`
);

code = code.replace(
  `          {clienteEncontrado ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 mb-4 animate-in fade-in duration-300">`,
  `          {clienteEncontrado ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 mb-4 mt-2 animate-in fade-in duration-300">`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
