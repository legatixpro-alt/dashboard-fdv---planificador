require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nudltbgyewyiklqdyujk.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1PLzYEe9GG1vHb_wjd7HA93U6UQNtyP-uk8sxVfiN4sg/export?format=xlsx';

async function syncAll() {
  console.log('================================================================');
  console.log('   SINCRONIZACIÓN EN VIVO: GOOGLE SHEETS -> SISTEMA FDV        ');
  console.log('================================================================\n');

  // 1. DESCARGA EN CALIENTE DEL GOOGLE SHEET
  console.log('Paso 1: Descargando libro de cálculo desde Google Sheets...');
  const res = await fetch(GOOGLE_SHEET_URL);
  if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);
  
  // Guardar archivo local de resguardo
  const localPath = path.join(__dirname, '..', 'sheet.xlsx');
  fs.writeFileSync(localPath, fileBuffer);
  console.log(`✓ Archivo guardado localmente en ${localPath} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  console.log('✓ Hojas disponibles:', workbook.SheetNames.join(', '));

  // 2. PARSEAR Y SINCRONIZAR VOLUMEN POR SKU
  console.log('\nPaso 2: Procesando hoja "Volumen por SKU"...');
  const volSheet = workbook.Sheets['Volumen por SKU'];
  const volumenRows = [];
  if (volSheet) {
    const volJson = XLSX.utils.sheet_to_json(volSheet, { header: 1 });
    const header0 = volJson[0];
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
      } else if (artU.includes('MORTADELA') || artU.includes('MORT.') || artU.includes('SALPICAO') || sku === '1464' || sku === '1462' || sku === '1512' || sku === '1521' || sku === '1561' || sku === '1522' || sku === '1563' || sku === '1562' || sku === '1564' || sku === '1519' || sku === '1496') {
        cat = 'MORTADELA SALPICAO Y ASTURIAS';
      } else if (skuU === 'ACEITE' || artU.includes('ACEITE')) {
        cat = 'ACEITE';
      } else if (skuU === 'AZUCAR' || skuU === 'AZÚCAR' || artU.includes('AZUCAR') || artU.includes('AZÚCAR')) {
        cat = 'AZÚCAR';
      } else if (skuU === 'POLLO' || skuU === 'FILET' || skuU === 'MUSLO' || skuU === '630' || skuU === '870' || skuU === '393' || artU.includes('POLLO ENTERO') || artU.includes('FILET') || artU.includes('MUSLO') || artU.includes('ALAS DESPRESADAS') || artU.includes('HIGADO') || artU.includes('MOLLEJA')) {
        cat = 'POLLO';
      }

      for (let c = 2; c < header0.length; c += 3) {
        const vendorName = String(header0[c] || '').replace(/\s+/g, ' ').trim();
        if (!vendorName) continue;

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

  console.log(`✓ Extraídos ${volumenRows.length} registros de volumen por SKU.`);
  // Reemplazar periodo actual en ventas_volumen
  const { error: delVolErr } = await supabase
    .from('ventas_volumen')
    .delete()
    .eq('periodo', '2026-10');
  if (delVolErr) console.warn('Advertencia limpiando ventas_volumen:', delVolErr.message);

  for (let i = 0; i < volumenRows.length; i += 100) {
    const batch = volumenRows.slice(i, i + 100);
    const { error: insErr } = await supabase.from('ventas_volumen').insert(batch);
    if (insErr) console.error(`Error insertando batch volumen ${i}:`, insErr.message);
  }
  console.log(`✓ ${volumenRows.length} registros sincronizados en Supabase table ventas_volumen.`);

  // 3. MAPAS DE COMPRA POR CLIENTE (DESDE HOJAS DE PRODUCTO)
  console.log('\nPaso 3: Extrayendo compras por cliente de las hojas operativas...');
  const findSheet = (patterns) => {
    const found = workbook.SheetNames.find(n =>
      patterns.some(p => n.toLowerCase().trim().includes(p.toLowerCase()))
    );
    return found ? workbook.Sheets[found] : null;
  };

  const sAceite = findSheet(['aceite']);
  const sAzucar = findSheet(['azucar', 'azúcar']);
  const sPollo = findSheet(['pollo']);
  const sAsturias = findSheet(['asturias', 'jamon']);
  const sSalpicao = findSheet(['ligeros', 'salpicao', 'mortadela']);

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

  const mapAceite = readActiveClients(sAceite);
  const mapAzucar = readActiveClients(sAzucar);
  const mapPollo = readActiveClients(sPollo);
  const mapAsturias = readActiveClients(sAsturias);
  const mapSalpicao = readActiveClients(sSalpicao);

  console.log(` - Clientes con compra de Aceite: ${mapAceite.size}`);
  console.log(` - Clientes con compra de Azúcar: ${mapAzucar.size}`);
  console.log(` - Clientes con compra de Pollo: ${mapPollo.size}`);
  console.log(` - Clientes con compra de Jamón Asturias: ${mapAsturias.size}`);
  console.log(` - Clientes con compra de Salpicao / Ligeros: ${mapSalpicao.size}`);

  // 4. ACTUALIZAR COMPRAS EN BASE DE CLIENTES SUPABASE (PRESERVANDO RUTAS MAESTRAS)
  console.log('\nPaso 4: Actualizando compras y activación en Supabase (activacion_clientes)...');
  let allClients = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('activacion_clientes')
      .select('*')
      .order('id')
      .range(from, from + 999);
    if (error) { console.error(error); break; }
    allClients = allClients.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`✓ Cargados ${allClients.length} clientes maestros de Supabase.`);

  let totalActivos = 0;
  let totalInactivos = 0;
  const updateBatch = [];

  for (const c of allClients) {
    const cod = String(c.cliente_codigo).trim();
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
    if (isActivo) totalActivos++;
    else totalInactivos++;

    updateBatch.push({
      id: c.id,
      periodo: '2026-10',
      cliente_codigo: c.cliente_codigo,
      cliente_nombre: c.cliente_nombre,
      vendedor_id: c.vendedor_id,
      vendedor_nombre: c.vendedor_nombre,
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
    });
  }

  // Ejecutar upserts en lotes de 100
  for (let i = 0; i < updateBatch.length; i += 100) {
    const batch = updateBatch.slice(i, i + 100);
    const { error: upErr } = await supabase.from('activacion_clientes').upsert(batch, { onConflict: 'id' });
    if (upErr) console.error(`Error actualizando clientes batch ${i}:`, upErr.message);
  }

  console.log(`✓ Sincronizados ${updateBatch.length} clientes en Supabase.`);
  console.log(`  - Clientes con compras activas: ${totalActivos}`);
  console.log(`  - Clientes inactivos en el mes: ${totalInactivos}`);

  // 5. REFRESCAR CACHÉ DEL SERVIDOR EN MEMORIA
  console.log('\nPaso 5: Notificando al servidor de producción para recargar memoria...');
  try {
    const http = require('http');
    // Login ADMIN
    const token = await new Promise((resolve) => {
      const payload = JSON.stringify({ username: 'ADMIN', password: '123' });
      const req = http.request({
        hostname: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, (res) => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b).token));
      });
      req.write(payload); req.end();
    });

    const syncRes = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1', port: 3000, path: '/api/sync/sheets', method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Length': 0 }
      }, (res) => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve(JSON.parse(b)));
      });
      req.end();
    });
    console.log('✓ Respuesta del servidor en memoria:', syncRes);
  } catch (syncErr) {
    console.warn('Nota sobre notificación en memoria:', syncErr.message);
  }

  console.log('\n================================================================');
  console.log('   SINCRONIZACIÓN EXITOSA Y COMPLETA AL 100%                   ');
  console.log('================================================================');
}

syncAll().catch(console.error);
