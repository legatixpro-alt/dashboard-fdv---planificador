const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(/LayoutList/g, 'LayoutList, FileText'); // This will duplicate if already there, let's just do a proper replace

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp.replace('LayoutList, FileText, FileText', 'LayoutList, FileText'));
