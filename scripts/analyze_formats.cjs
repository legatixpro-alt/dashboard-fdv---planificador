const fs = require('fs');
const FILE = process.argv[2];
const text = new TextDecoder('windows-1252').decode(fs.readFileSync(FILE));
const lines = text.split(/\r?\n/);

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

const shapes = { cajas: {}, unidades: {}, kgs: {}, monto: {} };
const names = ['cajas', 'unidades', 'kgs', 'monto'];
const shapeOf = (s) => String(s).trim().replace(/\d/g, '9').replace(/9+/g, '9');
const invalid = [];
const invalidByField = {};

for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const f = splitCSV(lines[i]);
  [11, 12, 13, 14].forEach((idx, k) => {
    const sh = shapeOf(f[idx]);
    shapes[names[k]][sh] = (shapes[names[k]][sh] || 0) + 1;
    const t = String(f[idx]).trim().replace(/,/g, '');
    if (isNaN(parseFloat(t)) || !/^-?\d+(\.\d+)?$/.test(t)) {
      invalidByField[names[k]] = (invalidByField[names[k]] || 0) + 1;
      if (invalid.length < 6) invalid.push({ line: i, campo: names[k], valor: JSON.stringify(f[idx]), cliente: f[6].trim(), articulo: f[10].trim(), mes: f[1], doc: f[3] + f[4] });
    }
  });
}
console.log('FORMAS por campo (9 = digitos):');
for (const n of names) console.log(n, shapes[n]);
console.log('\nINVALIDOS por campo', invalidByField);
console.log(invalid);
