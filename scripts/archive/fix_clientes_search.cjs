const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(
  /import \{ Users, /g,
  "import { Search, Users, "
);

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
