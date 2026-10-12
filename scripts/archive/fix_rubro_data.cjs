const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionRubro.tsx', 'utf8');

const oldLogic = `  const categoriaStats: CategoriaStats[] = useMemo(() => {
    const statsMap = new Map<string, CategoriaStats>();
    
    // Fallback/Demo data limits if not enough real data for testing the UI
    const defaultCategories = ['ACEITE', 'AZÚCAR', 'ARROZ', 'ENTERO', 'LIGEROS'];
    
    // Initialize map
    filteredVolumen.forEach(v => {
      const cat = v.categoria || 'OTROS';
      if (!statsMap.has(cat)) {
        statsMap.set(cat, {
          categoria: cat,
          meta: 0,
          activados: 0,
          faltante: 0,
          cumplimiento: 0,
          estCierre: 0
        });
      }
      
      // Simulate "activados" mapping logic (in a real app, this joins with activacionData more deeply)
      // For this view, we treat 'ejecutado' > 0 as an activation for that category for that client
      const stat = statsMap.get(cat)!;
      stat.meta += 10; // Dummy static meta to match screenshot scale (44, 35, etc.)
      stat.activados += v.ejecutado > 0 ? 1 : 0; 
    });

    // In a real app we'd compute this exactly. Let's force it to look like the screenshot 
    // if the real data is too sparse, for demonstration of the layout.
    if (statsMap.size < 5) {
        return [
          { categoria: 'ACEITE', meta: 44, activados: 45, faltante: 0, cumplimiento: 102.3, estCierre: 234 },
          { categoria: 'ARROZ', meta: 44, activados: 40, faltante: 4, cumplimiento: 90.9, estCierre: 208 },
          { categoria: 'AZÚCAR', meta: 44, activados: 49, faltante: 0, cumplimiento: 111.4, estCierre: 255 },
          { categoria: 'ENTERO', meta: 35, activados: 40, faltante: 0, cumplimiento: 114.3, estCierre: 208 },
          { categoria: 'LIGEROS', meta: 35, activados: 41, faltante: 0, cumplimiento: 117.1, estCierre: 213 }
        ];
    }

    return Array.from(statsMap.values()).map(stat => {
        stat.faltante = Math.max(0, stat.meta - stat.activados);
        stat.cumplimiento = stat.meta > 0 ? (stat.activados / stat.meta) * 100 : 0;
        stat.estCierre = Math.round((stat.activados / 5) * 26); // dummy projection
        return stat;
    });
  }, [filteredVolumen]);`;

const newLogic = `  const categoriaStats: CategoriaStats[] = useMemo(() => {
    const statsMap = new Map<string, CategoriaStats>();
    
    if (metasActivacion) {
      metasActivacion.forEach(m => {
        if (activeVendedorId !== 'ADMIN' && m.vendedorId !== activeVendedorId) return;
        
        const cat = m.categoria;
        if (!statsMap.has(cat)) {
          statsMap.set(cat, {
            categoria: cat,
            meta: 0,
            activados: 0,
            faltante: 0,
            cumplimiento: 0,
            estCierre: 0
          });
        }
        
        const stat = statsMap.get(cat)!;
        stat.meta += m.meta;
        stat.activados += m.activados;
      });
    }

    return Array.from(statsMap.values()).map(stat => {
        stat.faltante = Math.max(0, stat.meta - stat.activados);
        stat.cumplimiento = stat.meta > 0 ? (stat.activados / stat.meta) * 100 : 0;
        stat.estCierre = Math.round((stat.activados / 5) * 26); // daily progression dummy
        return stat;
    });
  }, [metasActivacion, activeVendedorId]);`;

comp = comp.replace(oldLogic, newLogic);
fs.writeFileSync('src/components/ActivacionRubro.tsx', comp);
