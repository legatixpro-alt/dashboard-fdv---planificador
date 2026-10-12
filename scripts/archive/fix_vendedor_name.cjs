const fs = require('fs');

let file = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');
file = file.replace(
  /Vendedor: <span className="text-red-400">HERNAN PAZ<\/span>/g,
  `{activeVendedorId === 'ADMIN' ? 'REPORTE: ' : 'VENDEDOR: '} <span className="text-red-400">{activeVendedorId === 'ADMIN' ? 'GLOBAL (TODOS)' : activeVendedorId}<\/span>`
);
fs.writeFileSync('src/components/ActivacionClientes.tsx', file);
