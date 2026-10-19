const fs = require('fs');

const FILE = process.argv[2];
const buf = fs.readFileSync(FILE);
const text = new TextDecoder('windows-1252').decode(buf);
const lines = text.split(/\r?\n/);

function splitCSV(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ';') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Misma lógica de rubros que server.ts (syncWorkbookToSupabase)
function categoria(sku, nombre) {
  const artU = nombre.toUpperCase();
  if (sku === '1461' || sku === '1463' || artU.includes('ESTANDAR ASTURIAS') || artU.includes('SUPERIOR ASTURIAS')) return 'ESTANDAR Y SUPERIOR ASTURIAS';
  if (artU.includes('MORTADELA') || artU.includes('MORT.') || artU.includes('SALPICAO') || ['1464','1462','1512','1521','1561','1522','1563','1562','1564','1519','1496'].includes(sku)) return 'MORTADELA SALPICAO Y ASTURIAS';
  if (artU.includes('ACEITE')) return 'ACEITE';
  if (artU.includes('AZUCAR') || artU.includes('AZÚCAR')) return 'AZÚCAR';
  if (['630','870','393'].includes(sku) || artU.includes('POLLO ENTERO') || artU.includes('FILET') || artU.includes('MUSLO') || artU.includes('ALAS DESPRESADAS') || artU.includes('HIGADO') || artU.includes('MOLLEJA')) return 'POLLO';
  return 'OTROS';
}

const num = (s) => { const t = String(s).trim().replace(/,/g, ''); const n = parseFloat(t); return isNaN(n) ? NaN : n; };

const arts = {};   // sku -> {nombre, cat, rows, kg, nombres:Set}
const keys = new Set();
const clientes = {}; // id -> Set(nombres)
let badNum = 0, badNumSamples = [], cajas0kgPos = 0, cajasPosKg0 = 0, rows = 0;
let eurFormat = 0;
const cats = {};

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const f = splitCSV(lines[i]);
  rows++;
  const sku = f[9].trim(); const nombre = f[10].trim();
  const cat = categoria(sku, nombre);
  const cajas = num(f[11]), unid = num(f[12]), kg = num(f[13]), monto = num(f[14]);
  if ([cajas, unid, kg, monto].some(isNaN)) { badNum++; if (badNumSamples.length < 5) badNumSamples.push(lines[i].slice(0, 220)); continue; }
  if (/\d\.\d{3},\d/.test(f[11] + f[12] + f[13] + f[14])) eurFormat++;
  if (cajas === 0 && kg > 0) cajas0kgPos++;
  if (cajas > 0 && kg === 0) cajasPosKg0++;
  const a = arts[sku] || (arts[sku] = { cat, rows: 0, kg: 0, nombres: new Set() });
  a.rows++; a.kg += kg; a.nombres.add(nombre);
  keys.add([f[0], f[1], f[5], f[7], sku].join('|'));
  const cid = f[5].trim();
  (clientes[cid] || (clientes[cid] = new Set())).add(f[6].trim());
  cats[cat] = (cats[cat] || 0) + kg;
}

console.log('filas', rows, 'numeros invalidos', badNum, badNumSamples);
console.log('formato europeo sospechoso', eurFormat);
console.log('cajas=0 & kg>0:', cajas0kgPos, '| cajas>0 & kg=0:', cajasPosKg0);
console.log('claves agregadas (ano,mes,cliente,vendedor,articulo):', keys.size);
console.log('clientes distintos:', Object.keys(clientes).length, '| con >1 nombre:', Object.values(clientes).filter(s => s.size > 1).length);
console.log('articulos con >1 nombre por sku:', Object.values(arts).filter(a => a.nombres.size > 1).length);
console.log('kg por categoria', cats);
for (const c of ['ESTANDAR Y SUPERIOR ASTURIAS', 'MORTADELA SALPICAO Y ASTURIAS', 'ACEITE', 'AZÚCAR', 'POLLO']) {
  console.log('\n=== ' + c);
  Object.entries(arts).filter(([, a]) => a.cat === c).sort((a, b) => b[1].kg - a[1].kg)
    .forEach(([sku, a]) => console.log(sku.padEnd(6), [...a.nombres][0].padEnd(60), 'filas', String(a.rows).padStart(6), 'kg', a.kg.toFixed(0)));
}
console.log('\n=== OTROS (top 40 por kg, para detectar mal clasificados)');
Object.entries(arts).filter(([, a]) => a.cat === 'OTROS').sort((a, b) => b[1].kg - a[1].kg).slice(0, 40)
  .forEach(([sku, a]) => console.log(sku.padEnd(6), [...a.nombres][0].padEnd(60), 'kg', a.kg.toFixed(0)));
