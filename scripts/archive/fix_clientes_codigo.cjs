const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(
  /const clientMap = new Map<string, \{ isActivo: boolean, rubrosComprados: Set<string> \}>\(\);/,
  "const clientMap = new Map<string, { id: string, isActivo: boolean, rubrosComprados: Set<string> }>();"
);

comp = comp.replace(
  /clientMap\.set\(a\.cliente, \{ isActivo: a\.status === 'ACTIVO', rubrosComprados: rubros \}\);/,
  "clientMap.set(a.cliente, { id: a.id, isActivo: a.status === 'ACTIVO', rubrosComprados: rubros });"
);

comp = comp.replace(
  /return \{\s*codigo: \`\#\$\{\(idx \* 13 \+ 31\)\}\`,\s*razonSocial: name,/,
  "return {\n          codigo: data.id || `#${idx}`,\n          razonSocial: name,"
);

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
