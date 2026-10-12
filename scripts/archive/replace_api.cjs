const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /app\.get\("\/api\/data\/volumen".*?app\.post\("\/api\/sync-supabase"/s;

const newCode = `app.get("/api/data/volumen", async (req, res) => {
    try {
      const XLSX = await import('xlsx');
      const fetchRes = await fetch('https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx');
      if (!fetchRes.ok) throw new Error("Failed to fetch XLSX");
      const buffer = await fetchRes.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      let volumenData: any[] = [];
      let idCounter = 1;

      const volSheet = workbook.Sheets['Volumen por SKU'];
      if (volSheet) {
        const volJson = XLSX.utils.sheet_to_json(volSheet, {header: 1});
        const header0 = volJson[0]; 
        
        for (let r = 2; r < volJson.length; r++) {
          const row = volJson[r];
          if (!row || !row[0]) continue;
          const sku = String(row[0]);
          const articulo = String(row[1]);
          
          let cat = 'OTROS';
          if (sku.includes('POLLO') || sku.includes('FILET') || sku.includes('MUSLO') || sku === '630') cat = 'ENTERO';
          else if (sku === 'ARROZ') cat = 'ARROZ';
          else if (sku === 'ACEITE') cat = 'ACEITE';
          else if (sku === 'AZUCAR') cat = 'AZÚCAR';
          else if (sku === 'LPV' || sku === 'QS') cat = 'LIGEROS';
          else cat = 'LIGEROS'; 

          for (let c = 2; c < header0.length; c += 3) {
            const vendorName = String(header0[c] || '').trim();
            if (!vendorName) continue;
            
            const metaKg = parseFloat(row[c]) || 0;
            const ejecutadoKg = parseFloat(row[c+1]) || 0;
            
            if (metaKg > 0 || ejecutadoKg > 0) {
              volumenData.push({
                id: String(idCounter++),
                vendedorId: vendorName,
                skuId: sku,
                cliente: vendorName,
                categoria: cat,
                meta: metaKg,
                ejecutado: ejecutadoKg,
                zona: "General",
                lat: -12.04318, 
                lng: -77.02824
              });
            }
          }
        }
      }
      res.json(volumenData);
    } catch (err: any) {
      console.error("Error parsing volume data:", err);
      res.status(500).json([]);
    }
  });

  app.get("/api/data/activacion", async (req, res) => {
    try {
      const XLSX = await import('xlsx');
      const fetchRes = await fetch('https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx');
      if (!fetchRes.ok) throw new Error("Failed to fetch XLSX");
      const buffer = await fetchRes.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      let activacionData: any[] = [];
      const clientSheet = workbook.Sheets['Activación por Cliente'];
      if (clientSheet) {
        const clientJson = XLSX.utils.sheet_to_json(clientSheet, {header: 1});
        for (let i = 1; i < clientJson.length; i++) {
          const row = clientJson[i];
          if (!row || row.length < 3 || !row[0]) continue;
          
          const codigo = row[0];
          const razonSocial = row[1];
          const vendedor = row[2];
          
          let isActivo = false;
          const cats = [row[3], row[4], row[5], row[6], row[7]];
          cats.forEach(val => {
            if (val && String(val).toUpperCase() === 'SI') isActivo = true;
          });
          
          activacionData.push({
            id: String(codigo),
            vendedorId: vendedor,
            cliente: razonSocial,
            status: isActivo ? 'ACTIVO' : 'INACTIVO',
            cats: {
              ACEITE: row[3] === 'SI' ? 1 : 0,
              AZUCAR: row[4] === 'SI' ? 1 : 0,
              ARROZ: row[5] === 'SI' ? 1 : 0,
              ENTERO: row[6] === 'SI' ? 1 : 0,
              LIGEROS: row[7] === 'SI' ? 1 : 0,
            }
          });
        }
      }
      res.json(activacionData);
    } catch (err: any) {
      console.error("Error parsing activacion data:", err);
      res.status(500).json([]);
    }
  });

  app.get("/api/data/metas-activacion", async (req, res) => {
    try {
      const XLSX = await import('xlsx');
      const fetchRes = await fetch('https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx');
      if (!fetchRes.ok) throw new Error("Failed to fetch XLSX");
      const buffer = await fetchRes.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      let metasData: any[] = [];
      const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
      if (gridSheet) {
        const gridJson = XLSX.utils.sheet_to_json(gridSheet, {header: 1});
        for (let i = 2; i < gridJson.length; i++) {
          const row = gridJson[i];
          if (!row || !row[0]) continue;
          const vName = row[0].split('-')[0].trim() || row[0];
          const cats = [
            { name: 'ACEITE', metaIdx: 2, actIdx: 3 },
            { name: 'ARROZ', metaIdx: 4, actIdx: 5 },
            { name: 'AZÚCAR', metaIdx: 6, actIdx: 7 },
            { name: 'ENTERO', metaIdx: 8, actIdx: 9 },
            { name: 'LIGEROS', metaIdx: 10, actIdx: 11 },
          ];
          cats.forEach(c => {
             metasData.push({
               vendedorId: vName,
               categoria: c.name,
               meta: parseInt(row[c.metaIdx]) || 0,
               activados: parseInt(row[c.actIdx]) || 0
             });
          });
        }
      }
      res.json(metasData);
    } catch(err: any) {
      res.status(500).json([]);
    }
  });

  app.post("/api/sync-supabase"`;

let finalCode = code.replace(regex, newCode);

// We need to also remove the old app.get("/api/data/activacion") because it's further down.
finalCode = finalCode.replace(/app\.get\("\/api\/data\/activacion",[\s\S]*?res\.json\(activacionData\);\n  \}\);/, '');

fs.writeFileSync('server.ts', finalCode);
