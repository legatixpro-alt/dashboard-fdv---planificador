const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

const oldLogic = `    let mult = 1;
    if (baseTotal > 0 && baseTotal < 10) {
        mult = 14; 
        baseTotal = baseTotal * mult + 3; // ej. 5 * 14 + 3 = 73
        baseActivos = baseActivos * mult + 26; // ej. 2 * 14 + 26 = 54
    }`;

comp = comp.replace(oldLogic, `// Removed mock mult`);

// Also fix the totalMockCartera references
comp = comp.replace(/totalMockCartera/g, 'totalClientes');
comp = comp.replace(/const totalClientes = totalClientes < 10 \? 69 : totalClientes;/g, '');

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
