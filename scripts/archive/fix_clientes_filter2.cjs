const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(
  /\.filter\(c => viewMode === 'personal' \? \(c\.rubrosComprados < 5 \|\| !c\.isActivo\) : true\)/,
  `.filter(c => viewMode === 'personal' ? c.cobertura < 5 : true)`
);

// We should also replace the `codigo` generation to use real client IDs if possible, but that's for later.
// Let's ensure the component doesn't crash
fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
