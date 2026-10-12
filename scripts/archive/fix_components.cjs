const fs = require('fs');

// 1. Fix VolumenTab.tsx to show real username
let vol = fs.readFileSync('src/components/VolumenTab.tsx', 'utf8');
vol = vol.replace(/<div className="bg-neutral-900 border border-neutral-800 px-3 py-1\.5 rounded-lg text-sm font-sans font-bold text-white uppercase tracking-wide">\s*#004 — HERNAN PAZ\s*<\/div>/, `<div className="bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg text-sm font-sans font-bold text-white uppercase tracking-wide">\n              {filteredVolumen.length > 0 && filteredVolumen[0].vendedorId ? filteredVolumen[0].vendedorId : 'TODOS LOS VENDEDORES'}\n            </div>`);
fs.writeFileSync('src/components/VolumenTab.tsx', vol);

// 2. Fix ActivacionClientes.tsx to show real username and calculate real required rythm instead of 1040
let cli = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

cli = cli.replace(/<div className="bg-neutral-900 border border-neutral-800 px-3 py-1\.5 rounded-lg text-sm font-sans font-bold text-white uppercase tracking-wide">\s*#004 — HERNAN PAZ\s*<\/div>/, `<div className="bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg text-sm font-sans font-bold text-white uppercase tracking-wide">\n              {activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId}\n            </div>`);

// In ActivacionClientes, activeVendedorId is derived from filteredActivacion.
cli = cli.replace(/const activeVendedorId = filteredActivacion\.length > 0 \? filteredActivacion\[0\]\.vendedorId : null;/, `const activeVendedorId = filteredActivacion.length > 0 && filteredActivacion.every(a => a.vendedorId === filteredActivacion[0].vendedorId) ? filteredActivacion[0].vendedorId : 'ADMIN';`);

// Fix 1040 hardcoded string if it exists in the html
cli = cli.replace(/\/ 1040 CLI/g, `/ {stat.meta} CLI`);

fs.writeFileSync('src/components/ActivacionClientes.tsx', cli);

