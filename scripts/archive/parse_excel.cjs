const XLSX = require('xlsx');

async function parse() {
  const url = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, {type: 'array'});
  
  // 1. Grid de Activacion (Metas)
  const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
  const gridJson = XLSX.utils.sheet_to_json(gridSheet, {header: 1});
  
  const metas = {}; // { vendedorId: { ACEITE: 65, ARROZ: 65 } }
  for (let i = 2; i < gridJson.length; i++) {
    const row = gridJson[i];
    if (!row || !row[0]) continue;
    const vName = row[0].split('-')[0].trim() || row[0];
    metas[vName] = {
      'ACEITE': parseInt(row[2]) || 0,
      'ARROZ': parseInt(row[4]) || 0,
      'AZUCAR': parseInt(row[6]) || 0,
      'ENTERO': parseInt(row[8]) || 0,
      'LIGEROS': parseInt(row[10]) || 0,
    };
  }

  // 2. Activacion por Cliente
  const clientSheet = workbook.Sheets['Activación por Cliente'];
  const clientJson = XLSX.utils.sheet_to_json(clientSheet, {header: 1});
  
  let volumenData = [];
  let activacionData = [];
  let idC = 1;

  for (let i = 1; i < clientJson.length; i++) {
    const row = clientJson[i];
    if (!row || row.length < 3 || !row[0]) continue;
    
    const codigo = row[0];
    const razonSocial = row[1];
    const vendedor = row[2];
    
    let isActivo = false;
    
    const cats = [
      { name: 'ACEITE', val: row[3] },
      { name: 'AZUCAR', val: row[4] },
      { name: 'ARROZ', val: row[5] },
      { name: 'ENTERO', val: row[6] },
      { name: 'LIGEROS', val: row[7] }
    ];
    
    cats.forEach(c => {
      const ejecutado = (c.val && c.val.toString().toUpperCase() === 'SI') ? 1 : 0;
      if (ejecutado > 0) isActivo = true;
      
      // We push a row for EVERY category so the UI knows the rubrosComprados
      volumenData.push({
        id: String(idC++),
        vendedorId: vendedor,
        skuId: `SKU-${c.name}`,
        cliente: razonSocial,
        categoria: c.name,
        meta: 0, // We will assign meta to the first row later or fix the UI
        ejecutado: ejecutado,
        zona: "General",
        lat: -12.04318,
        lng: -77.02824
      });
    });
    
    activacionData.push({
      id: String(codigo),
      vendedorId: vendedor,
      cliente: razonSocial,
      status: isActivo ? 'ACTIVO' : 'INACTIVO'
    });
  }
  
  console.log("Parsed Clients:", activacionData.length);
  console.log("Parsed Volumen:", volumenData.length);
}

parse();
