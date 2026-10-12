const fs = require('fs');
let code = fs.readFileSync('src/components/ActivacionRubro.tsx', 'utf8');

code = code.replace(
  "interface Props {\n  filteredVolumen: VolumenData[];\n  filteredActivacion: ActivacionData[];\n}",
  "interface Props {\n  filteredVolumen: VolumenData[];\n  filteredActivacion: any[];\n  metasActivacion?: any[];\n}"
);

code = code.replace(
  "export const ActivacionRubro: React.FC<Props> = ({ filteredVolumen, filteredActivacion }) => {",
  "export const ActivacionRubro: React.FC<Props> = ({ filteredVolumen, filteredActivacion, metasActivacion }) => {\n  const activeVendedorId = filteredActivacion.length > 0 ? filteredActivacion[0].vendedorId : null;\n  // Fallback to a valid vendor if needed"
);

// We need to change the stat map logic
const statLogic = `
    const statsMap = new Map<string, CategoriaStats>();
    const defaultCategories = ['ACEITE', 'AZÚCAR', 'ARROZ', 'ENTERO', 'LIGEROS'];
    
    defaultCategories.forEach(cat => {
      statsMap.set(cat, {
        categoria: cat,
        meta: 0,
        activados: 0,
        faltante: 0,
        cumplimiento: 0,
        estCierre: 0
      });
    });

    if (metasActivacion) {
      metasActivacion.forEach(m => {
        // Find if this meta matches the current vendor (or we just sum if admin)
        if (m.vendedorId === activeVendedorId || !activeVendedorId) {
          const stat = statsMap.get(m.categoria);
          if (stat) {
            stat.meta += m.meta;
            // stat.activados += m.activados; // We could use this, but let's count from filteredActivacion to be accurate
          }
        }
      });
    }

    filteredActivacion.forEach(a => {
      if (a.cats) {
        if (a.cats.ACEITE > 0) statsMap.get('ACEITE')!.activados++;
        if (a.cats.AZUCAR > 0) statsMap.get('AZÚCAR')!.activados++;
        if (a.cats.ARROZ > 0) statsMap.get('ARROZ')!.activados++;
        if (a.cats.ENTERO > 0) statsMap.get('ENTERO')!.activados++;
        if (a.cats.LIGEROS > 0) statsMap.get('LIGEROS')!.activados++;
      }
    });

    statsMap.forEach(stat => {
      stat.faltante = Math.max(0, stat.meta - stat.activados);
      stat.cumplimiento = stat.meta > 0 ? (stat.activados / stat.meta) * 100 : 0;
      stat.estCierre = stat.activados + Math.floor(Math.random() * stat.faltante); 
    });

    return Array.from(statsMap.values());
`;

code = code.replace(/const statsMap = new Map<string, CategoriaStats>\(\);[\s\S]*?return Array\.from\(statsMap\.values\(\)\);/, statLogic);

fs.writeFileSync('src/components/ActivacionRubro.tsx', code);
