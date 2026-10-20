require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nudltbgyewyiklqdyujk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const MAESTRA_XLSX_PATH = 'C:/Users/JAVIER CASTELLANOS/.gemini/antigravity/brain/436de5ef-5c42-4d81-8277-a4a5132cc05d/.user_uploaded/media_1792525962922_e8ff7148.xlsx';
const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';

// Columnas de resumen de supervisores al final de "Volumen por SKU" que NO son vendedores individuales
const SUPERVISOR_SUMMARY_COLS = new Set(['ALI PEREZ', 'NELSON FINOL', 'JOHNATAN SOTO']);

async function main() {
  console.log('=== 1. LEYENDO NUEVA MAESTRA DE CLIENTES OCTUBRE 2026 ===');
  const wbMaestra = XLSX.readFile(MAESTRA_XLSX_PATH);
  const dataRows = XLSX.utils.sheet_to_json(wbMaestra.Sheets['DATA'], { header: 1, defval: '' });

  const parsedClients = [];
  const vendorCounts = {};
  const clientToVendorMap = new Map();

  for (let r = 2; r < dataRows.length; r++) {
    const row = dataRows[r];
    if (!row) continue;
    const vid = String(row[0] ?? '').trim();
    const vendedor = String(row[1] ?? '').replace(/\s+/g, ' ').trim();
    const id = String(row[2] ?? '').trim();
    const razonSocial = String(row[3] ?? '').trim().replace(/^"|"$/g, '').trim();
    const rif = String(row[4] ?? '').trim();
    const tipoCliente = String(row[5] ?? '').trim();

    if (!vid || !vendedor || !id || vendedor === '#N/D' || id === '#N/D') continue;

    parsedClients.push({
      vendorIdNum: vid,
      vendedor,
      id,
      razonSocial,
      rif,
      tipoCliente
    });

    vendorCounts[vendedor] = (vendorCounts[vendedor] || 0) + 1;
    const cleanCid = id.replace(/^0+/, '') || id;
    clientToVendorMap.set(cleanCid, { vid: vid.padStart(3, '0'), vendedor });
  }

  console.log(`✓ Clientes válidos en nueva Maestra: ${parsedClients.length}`);
  console.log('✓ Desglose por vendedor:', vendorCounts);

  // Guardar copia de respaldo en scripts/data_maestra_octubre_2026.json
  fs.writeFileSync(
    path.join(__dirname, 'data_maestra_octubre_2026.json'),
    JSON.stringify(parsedClients, null, 2),
    'utf8'
  );
  console.log('✓ Guardado scripts/data_maestra_octubre_2026.json');

  console.log('\n=== 2. DESCARGANDO GOOGLE SHEET EN VIVO ===');
  const res = await fetch(GOOGLE_SHEET_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fileBuffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(__dirname, '..', 'sheet.xlsx'), fileBuffer);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  console.log('✓ Google Sheet descargado y respaldado en sheet.xlsx');

  const findSheet = (patterns) => {
    const found = workbook.SheetNames.find(n =>
      patterns.some(p => n.toLowerCase().trim().includes(p.toLowerCase()))
    );
    return found ? workbook.Sheets[found] : null;
  };

  const readActiveClients = (sheet) => {
    const clientMap = new Map();
    if (!sheet) return clientMap;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r && r[0] !== undefined && r[0] !== null && String(r[0]).trim() !== '') {
        const rawCode = String(r[0]).trim();
        const cleanCode = rawCode.replace(/^0+/, '') || rawCode;
        const cajas = parseFloat(r[2]) || 0;
        const addVal = cajas > 0 ? cajas : 1;
        clientMap.set(rawCode, (clientMap.get(rawCode) || 0) + addVal);
        if (cleanCode !== rawCode) {
          clientMap.set(cleanCode, (clientMap.get(cleanCode) || 0) + addVal);
        }
      }
    }
    return clientMap;
  };

  const mapAceite = readActiveClients(findSheet(['aceite']));
  const mapAzucar = readActiveClients(findSheet(['azucar', 'azúcar']));
  const mapPollo = readActiveClients(findSheet(['pollo']));
  const mapAsturias = readActiveClients(findSheet(['asturias', 'jamon']));
  const mapSalpicao = readActiveClients(findSheet(['ligeros', 'salpicao', 'mortadela']));

  console.log('\n=== 3. SINCRONIZANDO TABLA activacion_clientes EN SUPABASE ===');
  let activeCount = 0;
  const activacionRecords = parsedClients.map(c => {
    const cod = String(c.id).trim();
    const cleanCod = cod.replace(/^0+/, '') || cod;

    const cAceite = mapAceite.get(cod) || mapAceite.get(cleanCod) || 0;
    const cAzucar = mapAzucar.get(cod) || mapAzucar.get(cleanCod) || 0;
    const cPollo = mapPollo.get(cod) || mapPollo.get(cleanCod) || 0;
    const cAsturias = mapAsturias.get(cod) || mapAsturias.get(cleanCod) || 0;
    const cSalpicao = mapSalpicao.get(cod) || mapSalpicao.get(cleanCod) || 0;

    const hasAceite = cAceite > 0;
    const hasAzucar = cAzucar > 0;
    const hasPollo = cPollo > 0;
    const hasAsturias = cAsturias > 0;
    const hasSalpicao = cSalpicao > 0;
    const isActivo = hasAceite || hasAzucar || hasPollo || hasAsturias || hasSalpicao;
    if (isActivo) activeCount++;

    return {
      periodo: '2026-10',
      cliente_codigo: cod,
      cliente_nombre: c.razonSocial,
      vendedor_id: c.vendedor,
      vendedor_nombre: c.vendedor,
      status: isActivo ? 'ACTIVO' : 'INACTIVO',
      cajas_aceite: cAceite,
      cajas_azucar: cAzucar,
      cajas_pollo: cPollo,
      cajas_estandar_asturias: cAsturias,
      cajas_mortadela_salpicao: cSalpicao,
      has_aceite: hasAceite,
      has_azucar: hasAzucar,
      has_pollo: hasPollo,
      has_estandar_asturias: hasAsturias,
      has_mortadela_salpicao: hasSalpicao
    };
  });

  const { error: delActErr } = await supabase.from('activacion_clientes').delete().neq('id', 0);
  if (delActErr) throw new Error('Error limpiando activacion_clientes: ' + delActErr.message);

  for (let i = 0; i < activacionRecords.length; i += 200) {
    const batch = activacionRecords.slice(i, i + 200);
    const { error: insErr } = await supabase.from('activacion_clientes').insert(batch);
    if (insErr) throw new Error(`Error insertando activacion_clientes lote ${i}: ` + insErr.message);
  }
  console.log(`✓ Insertados ${activacionRecords.length} clientes en activacion_clientes (${activeCount} activos).`);

  console.log('\n=== 4. SINCRONIZANDO ventas_volumen (SIN COLUMNAS DE SUPERVISOR) ===');
  const volumenRows = [];
  const volSheet = workbook.Sheets['Volumen por SKU'];
  if (volSheet) {
    const volJson = XLSX.utils.sheet_to_json(volSheet, { header: 1 });
    const header0 = volJson[0] || [];
    for (let r = 2; r < volJson.length; r++) {
      const row = volJson[r];
      if (!row || !row[0]) continue;
      const sku = String(row[0]).trim();
      const articulo = String(row[1] || '').trim();

      let cat = 'OTROS';
      const artU = articulo.toUpperCase();
      const skuU = sku.toUpperCase();

      if (sku === '1461' || sku === '1463' || artU.includes('ESTANDAR ASTURIAS') || artU.includes('SUPERIOR ASTURIAS')) {
        cat = 'ESTANDAR Y SUPERIOR ASTURIAS';
      } else if (artU.includes('MORTADELA') || artU.includes('MORT.') || artU.includes('SALPICAO') || ['1464','1462','1512','1521','1561','1522','1563','1562','1564','1519','1496'].includes(sku)) {
        cat = 'MORTADELA SALPICAO Y ASTURIAS';
      } else if (skuU === 'ACEITE' || artU.includes('ACEITE')) {
        cat = 'ACEITE';
      } else if (skuU === 'AZUCAR' || skuU === 'AZÚCAR' || artU.includes('AZUCAR') || artU.includes('AZÚCAR')) {
        cat = 'AZÚCAR';
      } else if (skuU === 'POLLO' || skuU === 'FILET' || skuU === 'MUSLO' || ['630','870','393'].includes(sku) || artU.includes('POLLO ENTERO') || artU.includes('FILET') || artU.includes('MUSLO') || artU.includes('ALAS DESPRESADAS') || artU.includes('HIGADO') || artU.includes('MOLLEJA')) {
        cat = 'POLLO';
      }

      for (let c = 2; c < header0.length; c += 3) {
        const vendorName = String(header0[c] || '').replace(/\s+/g, ' ').trim();
        if (!vendorName) continue;
        // Omitir columnas de totales de supervisor al final de la hoja (cols >= 89 o nombres de supervisor)
        if (c >= 89 || SUPERVISOR_SUMMARY_COLS.has(vendorName.toUpperCase())) continue;

        const metaKg = parseFloat(row[c]) || 0;
        const ejecutadoKg = parseFloat(row[c + 1]) || 0;
        if (metaKg > 0 || ejecutadoKg > 0) {
          volumenRows.push({
            periodo: '2026-10',
            sku,
            articulo,
            categoria: cat,
            vendedor_id: vendorName,
            vendedor_nombre: vendorName,
            meta_kg: metaKg,
            ejecutado_kg: ejecutadoKg,
            zona: 'General'
          });
        }
      }
    }
  }

  await supabase.from('ventas_volumen').delete().eq('periodo', '2026-10');
  for (let i = 0; i < volumenRows.length; i += 100) {
    const batch = volumenRows.slice(i, i + 100);
    const { error } = await supabase.from('ventas_volumen').insert(batch);
    if (error) throw new Error('Error insertando ventas_volumen: ' + error.message);
  }
  console.log(`✓ Sincronizadas ${volumenRows.length} filas en ventas_volumen (excluyendo totales de supervisor).`);

  console.log('\n=== 5. SINCRONIZANDO metas_activacion ===');
  const metasRows = [];
  const gridVendorsSeen = new Set();
  const gridSheet = workbook.Sheets['Grid de Activación por Vendedor'];
  if (gridSheet) {
    const gridJson = XLSX.utils.sheet_to_json(gridSheet, { header: 1 });
    for (let i = 2; i < gridJson.length; i++) {
      const row = gridJson[i];
      if (!row || !row[0]) continue;
      const vName = String(row[0]).replace(/\s+/g, ' ').trim();
      if (SUPERVISOR_SUMMARY_COLS.has(vName.toUpperCase())) continue;
      gridVendorsSeen.add(vName.toUpperCase().replace(/\s*-\s*/g, ' - '));
      const cats = [
        { name: 'ACEITE', metaIdx: 2, actIdx: 3 },
        { name: 'AZÚCAR', metaIdx: 4, actIdx: 5 },
        { name: 'POLLO', metaIdx: 6, actIdx: 7 },
        { name: 'ESTANDAR Y SUPERIOR ASTURIAS', metaIdx: 8, actIdx: 9 },
        { name: 'MORTADELA SALPICAO Y ASTURIAS', metaIdx: 10, actIdx: 11 },
      ];
      cats.forEach(c => {
        metasRows.push({
          periodo: '2026-10',
          vendedor_id: vName,
          categoria: c.name,
          meta: parseInt(row[c.metaIdx]) || 0,
          activados: parseInt(row[c.actIdx]) || 0
        });
      });
    }
  }

  // Si ANGEL NAVARRO (u otro vendedor activo en la Maestra) aún no tiene fila en el Grid,
  // registrar sus activados reales desde activacionRecords con meta = 0 (sin inventar metas).
  if (!gridVendorsSeen.has('ANGEL NAVARRO')) {
    const angelClients = activacionRecords.filter(r => r.vendedor_id === 'ANGEL NAVARRO');
    const angelCats = [
      { name: 'ACEITE', count: angelClients.filter(c => c.has_aceite).length },
      { name: 'AZÚCAR', count: angelClients.filter(c => c.has_azucar).length },
      { name: 'POLLO', count: angelClients.filter(c => c.has_pollo).length },
      { name: 'ESTANDAR Y SUPERIOR ASTURIAS', count: angelClients.filter(c => c.has_estandar_asturias).length },
      { name: 'MORTADELA SALPICAO Y ASTURIAS', count: angelClients.filter(c => c.has_mortadela_salpicao).length },
    ];
    angelCats.forEach(c => {
      metasRows.push({
        periodo: '2026-10',
        vendedor_id: 'ANGEL NAVARRO',
        categoria: c.name,
        meta: 0,
        activados: c.count
      });
    });
  }

  await supabase.from('metas_activacion').delete().eq('periodo', '2026-10');
  for (let i = 0; i < metasRows.length; i += 100) {
    const batch = metasRows.slice(i, i + 100);
    const { error } = await supabase.from('metas_activacion').insert(batch);
    if (error) throw new Error('Error insertando metas_activacion: ' + error.message);
  }
  console.log(`✓ Sincronizadas ${metasRows.length} filas en metas_activacion.`);

  console.log('\n=== 6. ACTUALIZANDO USUARIOS EN SUPABASE (ALI PEREZ -> SUPERVISOR + 3 VENDEDORES NUEVOS) ===');
  // Actualizar ALI PEREZ a SUPERVISOR
  const { error: upAliErr } = await supabase
    .from('usuarios')
    .update({ role: 'SUPERVISOR', nombre_completo: 'ALI PEREZ (SUPERVISOR)' })
    .eq('username', 'ALI PEREZ');
  if (upAliErr) console.warn('Advertencia actualizando ALI PEREZ en usuarios:', upAliErr.message);

  const nuevosUsuarios = [
    { username: 'ANGEL NAVARRO', password_hash: '19117934', role: 'VENDEDOR', vendor_id: '29', nombre_completo: 'ANGEL NAVARRO', activo: true },
    { username: 'MARIANGEL GONZALEZ', password_hash: '20552780', role: 'VENDEDOR', vendor_id: '47', nombre_completo: 'MARIANGEL GONZALEZ', activo: true },
    { username: 'VICTOR CAMPOS', password_hash: '19944329', role: 'VENDEDOR', vendor_id: '48', nombre_completo: 'VICTOR CAMPOS', activo: true },
  ];
  for (const u of nuevosUsuarios) {
    const { data: existing } = await supabase.from('usuarios').select('id').eq('username', u.username).maybeSingle();
    if (existing) {
      await supabase.from('usuarios').update(u).eq('id', existing.id);
    } else {
      await supabase.from('usuarios').insert([u]);
    }
  }
  console.log('✓ Usuarios actualizados en Supabase (ALI PEREZ = SUPERVISOR; ANGEL NAVARRO, MARIANGEL GONZALEZ y VICTOR CAMPOS = VENDEDOR).');

  console.log('\n=== 7. REASIGNANDO HISTORIAL DE CLIENTES DE LA RUTA DE ALI PEREZ A LOS NUEVOS VENDEDORES EN ventas_historial ===');
  const newVendorsList = [
    { name: 'ANGEL NAVARRO', vid: '029' },
    { name: 'MARIANGEL GONZALEZ', vid: '047' },
    { name: 'VICTOR CAMPOS', vid: '048' },
    { name: 'LUIS GUANIPA', vid: '040' }
  ];

  for (const nv of newVendorsList) {
    const cids = [];
    for (const [cleanCid, info] of clientToVendorMap.entries()) {
      if (info.vendedor === nv.name) {
        cids.push(cleanCid, cleanCid.padStart(6, '0'));
      }
    }
    const uniqueCids = Array.from(new Set(cids));
    let updatedTotal = 0;
    for (let i = 0; i < uniqueCids.length; i += 100) {
      const chunk = uniqueCids.slice(i, i + 100);
      if (nv.name === 'LUIS GUANIPA') {
        // Para Luis Guanipa solo reasignar las que estaban bajo ALI PEREZ
        const { data: upd, error: uErr } = await supabase
          .from('ventas_historial')
          .update({ vendedor: nv.name, id_vendedor: nv.vid })
          .eq('vendedor', 'ALI PEREZ')
          .in('id_cliente', chunk)
          .select('id_cliente');
        if (uErr) console.warn(`Error actualizando historial de ${nv.name}:`, uErr.message);
        updatedTotal += (upd || []).length;
      } else {
        // Para los 3 nuevos vendedores (ANGEL NAVARRO, MARIANGEL GONZALEZ, VICTOR CAMPOS),
        // todos sus clientes actuales llevan su historial para el Dashboard 360°
        const { data: upd, error: uErr } = await supabase
          .from('ventas_historial')
          .update({ vendedor: nv.name, id_vendedor: nv.vid })
          .in('id_cliente', chunk)
          .select('id_cliente');
        if (uErr) console.warn(`Error actualizando historial de ${nv.name}:`, uErr.message);
        updatedTotal += (upd || []).length;
      }
    }
    console.log(`✓ ${nv.name}: ${updatedTotal} filas históricas asociadas en ventas_historial.`);
  }

  console.log('\n=== SINCRONIZACIÓN DE BASE DE DATOS COMPLETADA ===');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
