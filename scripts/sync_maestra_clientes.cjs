require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const CSV_PATH = 'C:/Users/JAVIER CASTELLANOS/.gemini/antigravity/brain/436de5ef-5c42-4d81-8277-a4a5132cc05d/.user_uploaded/media_1791916360912_63a19ce3.csv';

async function main() {
  console.log('=== SINCRONIZACIÓN Y SUSTITUCIÓN DE BASE DE DATOS DE CLIENTES ===');
  console.log('1. Leyendo archivo CSV maestro:', CSV_PATH);
  
  if (!fs.existsSync(CSV_PATH)) {
    console.error('ERROR: Archivo no encontrado en', CSV_PATH);
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = content.split('\n');

  const parsedClients = [];
  const vendorBreakdown = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('MAESTRA') || line.startsWith('﻿MAESTRA')) continue;
    if (line.startsWith('Vendedor;Id')) continue;

    const parts = line.split(';');
    const vendedor = (parts[0] || '').trim();
    const id = (parts[1] || '').trim();
    const razonSocial = (parts[2] || '').trim().replace(/^"|"$/g, '').trim();
    const rif = (parts[3] || '').trim();
    const tipoCliente = (parts[4] || '').trim();

    if (!vendedor || !id || vendedor === '#N/D' || id === '#N/D') continue;

    parsedClients.push({
      vendedor,
      id,
      razonSocial,
      rif,
      tipoCliente
    });

    vendorBreakdown[vendedor] = (vendorBreakdown[vendedor] || 0) + 1;
  }

  console.log(`✓ Total clientes válidos leídos del archivo: ${parsedClients.length}`);
  console.log(`✓ Total vendedores / rutas en el archivo: ${Object.keys(vendorBreakdown).length}`);

  // 2. Leer compras actuales de Octubre 2026 para preservar histórico de cajas activadas
  console.log('\n2. Recuperando compras de activación existentes en Octubre 2026...');
  let currentRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('activacion_clientes').select('*').range(from, from + 999);
    if (error) {
      console.error('Error leyendo activacion_clientes actual:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    currentRows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`✓ Clientes leídos de la tabla actual: ${currentRows.length}`);

  const purchaseMap = new Map();
  currentRows.forEach(r => {
    const codeClean = String(r.cliente_codigo || '').replace(/^0+/, '').trim();
    const isActivo = r.status === 'ACTIVO' || r.has_aceite || r.has_azucar || r.has_pollo || r.has_estandar_asturias || r.has_mortadela_salpicao;
    if (codeClean && (isActivo || !purchaseMap.has(codeClean))) {
      purchaseMap.set(codeClean, {
        status: isActivo ? 'ACTIVO' : 'INACTIVO',
        cajas_aceite: Number(r.cajas_aceite) || 0,
        cajas_azucar: Number(r.cajas_azucar) || 0,
        cajas_pollo: Number(r.cajas_pollo) || 0,
        cajas_estandar_asturias: Number(r.cajas_estandar_asturias) || 0,
        cajas_mortadela_salpicao: Number(r.cajas_mortadela_salpicao) || 0,
        has_aceite: Boolean(r.has_aceite),
        has_azucar: Boolean(r.has_azucar),
        has_pollo: Boolean(r.has_pollo),
        has_estandar_asturias: Boolean(r.has_estandar_asturias),
        has_mortadela_salpicao: Boolean(r.has_mortadela_salpicao)
      });
    }
  });
  console.log(`✓ Clientes con historial de compra mapeados: ${purchaseMap.size}`);

  // 3. Preparar los 2,723 registros exactos
  console.log('\n3. Construyendo los nuevos registros para Supabase...');
  let activeCount = 0;
  const recordsToInsert = parsedClients.map(c => {
    const codeClean = String(c.id).replace(/^0+/, '').trim();
    const hist = purchaseMap.get(codeClean);
    const isActivo = hist ? (hist.status === 'ACTIVO' || hist.has_aceite || hist.has_azucar || hist.has_pollo || hist.has_estandar_asturias || hist.has_mortadela_salpicao) : false;
    if (isActivo) activeCount++;

    return {
      periodo: '2026-10',
      cliente_codigo: c.id,
      cliente_nombre: c.razonSocial,
      vendedor_id: c.vendedor,
      vendedor_nombre: c.vendedor,
      status: isActivo ? 'ACTIVO' : 'INACTIVO',
      cajas_aceite: hist?.cajas_aceite || 0,
      cajas_azucar: hist?.cajas_azucar || 0,
      cajas_pollo: hist?.cajas_pollo || 0,
      cajas_estandar_asturias: hist?.cajas_estandar_asturias || 0,
      cajas_mortadela_salpicao: hist?.cajas_mortadela_salpicao || 0,
      has_aceite: hist?.has_aceite || false,
      has_azucar: hist?.has_azucar || false,
      has_pollo: hist?.has_pollo || false,
      has_estandar_asturias: hist?.has_estandar_asturias || false,
      has_mortadela_salpicao: hist?.has_mortadela_salpicao || false
    };
  });
  console.log(`✓ Registros preparados: ${recordsToInsert.length} (${activeCount} activos, ${recordsToInsert.length - activeCount} inactivos)`);

  // 4. Limpiar tabla previa en Supabase
  console.log('\n4. Sustituyendo cartera previa en Supabase (eliminando registros obsoletos)...');
  const { error: delErr } = await supabase.from('activacion_clientes').delete().neq('id', 0);
  if (delErr) {
    console.error('Error al limpiar activacion_clientes:', delErr.message);
    process.exit(1);
  }
  console.log('✓ Tabla previa limpiada exitosamente.');

  // 5. Inserción por lotes
  console.log('\n5. Insertando los nuevos clientes asignados por lotes...');
  const BATCH_SIZE = 200;
  for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
    const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
    const { error: insErr } = await supabase.from('activacion_clientes').insert(batch);
    if (insErr) {
      console.error(`Error insertando lote ${i} - ${i + batch.length}:`, insErr.message);
      process.exit(1);
    }
    process.stdout.write(`   Insertados ${Math.min(i + BATCH_SIZE, recordsToInsert.length)} / ${recordsToInsert.length} clientes...\r`);
  }
  console.log(`\n✓ Inserción completada: ${recordsToInsert.length} clientes cargados exitosamente.`);

  // 6. Validación final
  console.log('\n6. Validación de verificación en base de datos...');
  const { count: finalCount, error: countErr } = await supabase.from('activacion_clientes').select('*', { count: 'exact', head: true });
  if (countErr) {
    console.error('Error verificando conteo final:', countErr.message);
  } else {
    console.log(`✓ Total filas actuales en activacion_clientes: ${finalCount}`);
  }

  // Guardar copia local JSON como respaldo
  fs.writeFileSync('scripts/data_maestra_octubre_2026.json', JSON.stringify(parsedClients, null, 2), 'utf8');
  console.log('✓ Respaldo local guardado en scripts/data_maestra_octubre_2026.json');
  console.log('=== PROCESO FINALIZADO EXITOSAMENTE ===');
}

main().catch(err => {
  console.error('Error no controlado:', err);
  process.exit(1);
});
