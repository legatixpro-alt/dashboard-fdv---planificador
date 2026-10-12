const fs = require('fs');

let file = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

file = file.replace(
  /\.filter\(c => \(c\.cliente \|\| ''\)\.toLowerCase\(\)\.includes\(\(searchTerm \|\| ''\)\.toLowerCase\(\)\) \|\| \(c\.codigo \|\| ''\)\.toLowerCase\(\)\.includes\(\(searchTerm \|\| ''\)\.toLowerCase\(\)\)\)/g,
  `.filter(c => (c.razonSocial || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || (c.codigo || '').toLowerCase().includes((searchTerm || '').toLowerCase()))`
);

// We need to fix the mobile/desktop visibility of Table and Cards based on viewMode.
// Table:
file = file.replace(
  /\{viewMode !== 'tarjetas' && \(\<div className="hidden md:block overflow-x-auto"\>/g,
  `{viewMode !== 'tarjetas' && (<div className="hidden md:block overflow-x-auto">` // it was already like this
);

// Cards:
file = file.replace(
  /\<div className="md:hidden flex flex-col p-3 gap-3 bg-neutral-950"\>/g,
  `<div className={\`flex flex-col p-3 gap-3 bg-neutral-950 \${viewMode !== 'tarjetas' ? 'md:hidden' : 'md:grid md:grid-cols-2 lg:grid-cols-3'}\`}>`
);

// Also we need to ensure the list of clients matches the correct logic for `viewMode === 'personal'`:
file = file.replace(
  /\.filter\(c => viewMode === 'personal' \? \(c\.rubrosComprados \< 5 \|\| !c\.isActivo\) \: true\)/g,
  `.filter(c => viewMode === 'personal' ? c.cobertura < 5 : true)`
);

fs.writeFileSync('src/components/ActivacionClientes.tsx', file);
