const fs = require('fs');

// 1. Update googleSheetsService.ts
let serviceContent = fs.readFileSync('src/services/googleSheetsService.ts', 'utf8');
serviceContent = serviceContent.replace(/fetchVolumenData = async \(\)/g, 'fetchVolumenData = async (force: boolean = false)');
serviceContent = serviceContent.replace(/fetch\('\/api\/data\/volumen'\)/g, "fetch(`/api/data/volumen?force=${force}`)");

serviceContent = serviceContent.replace(/fetchActivacionData = async \(\)/g, 'fetchActivacionData = async (force: boolean = false)');
serviceContent = serviceContent.replace(/fetch\('\/api\/data\/activacion'\)/g, "fetch(`/api/data/activacion?force=${force}`)");

serviceContent = serviceContent.replace(/fetchMetasActivacion = async \(\)/g, 'fetchMetasActivacion = async (force: boolean = false)');
serviceContent = serviceContent.replace(/fetch\('\/api\/data\/metas-activacion'\)/g, "fetch(`/api/data/metas-activacion?force=${force}`)");

fs.writeFileSync('src/services/googleSheetsService.ts', serviceContent);


// 2. Update App.tsx
let appContent = fs.readFileSync('src/App.tsx', 'utf8');

const loadDataBlock = `
    async function loadData(force = false) {
      setLoading(true);
      const [vol, act, metas] = await Promise.all([
        fetchVolumenData(force),
        fetchActivacionData(force),
        fetchMetasActivacion(force)
      ]);
      setVolumenData(vol);
      setActivacionData(act);
      setMetasActivacion(metas);
      setLoading(false);
    }

    // Expose loadData to be callable manually
    (window as any).refreshData = () => loadData(true);
`;

appContent = appContent.replace(/async function loadData\(\) \{[\s\S]*?setLoading\(false\);\n    \}/, loadDataBlock);

appContent = appContent.replace(
  /<RecorridoMes \/>/g, 
  `<RecorridoMes onSync={() => (window as any).refreshData()} loading={loading} />`
);

fs.writeFileSync('src/App.tsx', appContent);
