const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `              <p className="text-sm text-neutral-400 space-y-1">`,
  `<div className="text-sm text-neutral-400 space-y-1 mt-2">`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
