const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(/<LayoutList, FileText /g, '<LayoutList ');

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
