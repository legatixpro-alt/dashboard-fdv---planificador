const fs = require('fs');
let code = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

code = code.replace(
  "interface Props {\n  filteredVolumen: VolumenData[];\n  filteredActivacion: ActivacionData[];\n}",
  "interface Props {\n  filteredVolumen: any[];\n  filteredActivacion: any[];\n}"
);

const newLogic = `
    const clientMap = new Map<string, { isActivo: boolean, rubrosComprados: Set<string> }>();
    
    filteredActivacion.forEach(a => {
      const rubros = new Set<string>();
      if (a.cats) {
        if (a.cats.ACEITE) rubros.add('ACEITE');
        if (a.cats.AZUCAR) rubros.add('AZÚCAR');
        if (a.cats.ARROZ) rubros.add('ARROZ');
        if (a.cats.ENTERO) rubros.add('ENTERO');
        if (a.cats.LIGEROS) rubros.add('LIGEROS');
      }
      clientMap.set(a.cliente, { isActivo: a.status === 'ACTIVO', rubrosComprados: rubros });
    });

    let baseTotal = clientMap.size;
    let baseActivos = Array.from(clientMap.values()).filter(c => c.isActivo).length;

    let mult = 1;
`;

code = code.replace(/const clientMap = new Map<string, \{ isActivo: boolean, rubrosComprados: Set<string> \}>\(\);[\s\S]*?let mult = 1;/, newLogic);

fs.writeFileSync('src/components/ActivacionClientes.tsx', code);
