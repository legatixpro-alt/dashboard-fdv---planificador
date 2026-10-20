/**
 * Carga 2026.csv -> Supabase (tabla ventas_historial)
 *
 *   node scripts/load_ventas_historial.cjs "<ruta al csv>" --dry-run   (solo valida y resume)
 *   node scripts/load_ventas_historial.cjs "<ruta al csv>"             (carga real)
 *
 * - Agrega 207k líneas de factura/devolución en filas únicas por (año, mes, cliente, vendedor, artículo).
 * - Facturas (FA) suman, devoluciones (DV) ya vienen en negativo en el CSV -> el neto es la suma.
 * - Es idempotente: se puede ejecutar de nuevo, hace upsert por la llave primaria.
 * - Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env (nunca en el código).
 */
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FILE = args.find(a => a !== '--dry-run');
if (!FILE || !fs.existsSync(FILE)) { 
  console.error('Indica la ruta del CSV. Archivo no encontrado o no especificado:', FILE); 
  process.exit(1); 
}

const MESES = { ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12 };

// Misma regla que src/lib/rubros.ts (y que syncWorkbookToSupabase en server.ts)
const SKUS_MORT = new Set(['1464', '1462', '1512', '1521', '1561', '1522', '1563', '1562', '1564', '1519', '1496']);
const SKUS_POLLO = new Set(['630', '870', '393']);
function rubro(sku, nombre) {
  const n = nombre.toUpperCase();
  if (sku === '1461' || sku === '1463' || n.includes('ESTANDAR ASTURIAS') || n.includes('SUPERIOR ASTURIAS')) return 'ESTANDAR_ASTURIAS';
  if (n.includes('MORTADELA') || n.includes('MORT.') || n.includes('SALPICAO') || SKUS_MORT.has(sku)) return 'MORTADELA_SALPICAO';
  if (n.includes('ACEITE')) return 'ACEITE';
  if (n.includes('AZUCAR') || n.includes('AZÚCAR')) return 'AZUCAR';
  if (SKUS_POLLO.has(sku) || n.includes('POLLO ENTERO') || n.includes('FILET') || n.includes('MUSLO') || n.includes('ALAS DESPRESADAS') || n.includes('HIGADO') || n.includes('MOLLEJA')) return 'POLLO';
  return 'OTROS';
}

function splitCSV(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else { if (c === '"') q = true; else if (c === ';') { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur);
  return out;
}

// El CSV usa coma de miles y punto decimal ("-18,000.00"). " - " significa 0.
function num(s) {
  const t = String(s).trim().replace(/,/g, '');
  if (t === '' || t === '-') return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error('Número inválido: ' + JSON.stringify(s));
  return n;
}
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

// El CSV exportado es UTF-8: se decodifica como UTF-8 y solo si no es válido se usa windows-1252.
// (Decodificar siempre como windows-1252 dejaba nombres como "PIÃ‘A" / "BRICEÃ‘O" en la base.)
const buf = fs.readFileSync(FILE);
let text;
try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
catch { text = new TextDecoder('windows-1252').decode(buf); }
text = text.replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/);
const agg = new Map();
const tot = { lineas: 0, kgs: 0, monto: 0, cajas: 0 };
const errores = [];

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const f = splitCSV(lines[i]);
  if (f.length !== 15) { errores.push('línea ' + (i + 1) + ': columnas=' + f.length); continue; }
  const mes = MESES[clean(f[1]).toUpperCase()];
  if (!mes) { errores.push('línea ' + (i + 1) + ': mes desconocido ' + f[1]); continue; }
  let cajas, unidades, kgs, monto;
  try { cajas = num(f[11]); unidades = num(f[12]); kgs = num(f[13]); monto = num(f[14]); }
  catch (e) { errores.push('línea ' + (i + 1) + ': ' + e.message); continue; }

  const ano = parseInt(f[0], 10);
  const idCliente = clean(f[5]); const idVend = clean(f[7]); const sku = clean(f[9]);
  const key = [ano, mes, idCliente, idVend, sku].join('|');
  let r = agg.get(key);
  if (!r) {
    const nombre = clean(f[10]);
    r = { ano, mes, id_cliente: idCliente, cliente: clean(f[6]), id_vendedor: idVend, vendedor: clean(f[8]),
          id_articulo: sku, articulo: nombre,
          // El CSV trae el código con ceros ("001464"); las reglas por SKU usan el código sin ceros ("1464").
          rubro: rubro(sku.replace(/^0+(?=\d)/, ''), nombre), cajas: 0, unidades: 0, kgs: 0, monto: 0 };
    agg.set(key, r);
  }
  r.cajas += cajas; r.unidades += unidades; r.kgs += kgs; r.monto += monto;
  tot.lineas++; tot.cajas += cajas; tot.kgs += kgs; tot.monto += monto;
}

const rows = [...agg.values()].map(r => ({
  ...r,
  cajas: +r.cajas.toFixed(2), unidades: +r.unidades.toFixed(2), kgs: +r.kgs.toFixed(2), monto: +r.monto.toFixed(2)
}));
const sum = (k) => +rows.reduce((a, r) => a + r[k], 0).toFixed(2);

console.log('Líneas leídas       :', tot.lineas, '| con error:', errores.length);
errores.slice(0, 5).forEach(e => console.log('  ', e));
console.log('Filas agregadas     :', rows.length);
console.log('CONTROL  (CSV)      : kgs', +tot.kgs.toFixed(2), '| monto', +tot.monto.toFixed(2), '| cajas', +tot.cajas.toFixed(2));
console.log('CONTROL  (a cargar) : kgs', sum('kgs'), '| monto', sum('monto'), '| cajas', sum('cajas'));
const porMes = {}; rows.forEach(r => { porMes[r.mes] = (porMes[r.mes] || 0) + r.kgs; });
console.log('Kg por mes          :', Object.fromEntries(Object.entries(porMes).map(([m, v]) => [m, Math.round(v)])));
const vend = [...new Set(rows.map(r => r.vendedor))];
console.log('Vendedores          :', vend.length, '| ej:', vend.filter(v => /PI.A|BRICE|CHAC/.test(v)).join(' / '));

if (errores.length) { console.error('\nHay líneas con error: NO se carga nada hasta corregirlas.'); process.exit(1); }
if (DRY) { console.log('\n[dry-run] No se escribió nada en Supabase.'); process.exit(0); }

(async () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env'); process.exit(1); }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const probe = await sb.from('ventas_historial').select('ano', { head: true, count: 'exact' });
  if (probe.error) {
    console.error('\nLa tabla ventas_historial no existe todavía (' + probe.error.message + ').');
    console.error('Ejecuta primero scripts/sql/ventas_historial.sql en Supabase > SQL Editor y vuelve a correr este script.');
    process.exit(2);
  }

  const B = 1000; let done = 0;
  for (let i = 0; i < rows.length; i += B) {
    const batch = rows.slice(i, i + B);
    let lastErr = null;
    for (let t = 1; t <= 3; t++) {
      const { error } = await sb.from('ventas_historial').upsert(batch, { onConflict: 'ano,mes,id_cliente,id_vendedor,id_articulo' });
      if (!error) { lastErr = null; break; }
      lastErr = error; await new Promise(r => setTimeout(r, 800 * t));
    }
    if (lastErr) { console.error('\nFalló el lote en fila', i, '->', lastErr.message); process.exit(1); }
    done += batch.length;
    process.stdout.write('\rCargadas ' + done + ' / ' + rows.length);
  }
  console.log('\n');

  // Verificación contra el CSV
  let kg = 0, monto = 0, n = 0, from = 0;
  for (;;) {
    const { data, error } = await sb.from('ventas_historial').select('kgs,monto').eq('ano', 2026).range(from, from + 999);
    if (error) { console.error('Verificación falló:', error.message); process.exit(1); }
    data.forEach(r => { kg += Number(r.kgs); monto += Number(r.monto); n++; });
    if (data.length < 1000) break; from += 1000;
  }
  console.log('VERIFICACIÓN en Supabase: filas', n, '| kgs', +kg.toFixed(2), '| monto', +monto.toFixed(2));
  const ok = n === rows.length && Math.abs(kg - sum('kgs')) < 1 && Math.abs(monto - sum('monto')) < 1;
  console.log(ok ? 'OK: coincide exactamente con el CSV.' : 'ATENCIÓN: NO coincide con el CSV, revisar.');
  process.exit(ok ? 0 : 1);
})();
