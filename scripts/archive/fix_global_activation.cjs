const fs = require('fs');

let serverTs = fs.readFileSync('server.ts', 'utf8');
serverTs = serverTs.replace(
  /let isActivo = false;\s*const cats = \[row\[3\], row\[4\], row\[5\], row\[6\], row\[7\]\];\s*cats\.forEach\(val => \{\s*if \(val && String\(val\)\.toUpperCase\(\) === 'SI'\) isActivo = true;\s*\}\);/g,
  `let isActivo = false;
          // Buscar columna "ACTIVO" o "GLOBAL" en los headers (index > 7)
          const headers = clientJson[0] as string[];
          let globalActivoIdx = -1;
          for (let col = 8; col < headers.length; col++) {
             if (headers[col] && (headers[col].toUpperCase().includes('ACTIVO') || headers[col].toUpperCase().includes('GLOBAL') || headers[col].toUpperCase().includes('ESTATUS'))) {
                globalActivoIdx = col;
                break;
             }
          }
          
          if (globalActivoIdx !== -1) {
             const val = row[globalActivoIdx];
             if (val && String(val).toUpperCase() === 'SI') isActivo = true;
          } else {
             // Fallback a los 5 rubros
             const cats = [row[3], row[4], row[5], row[6], row[7]];
             cats.forEach(val => {
               if (val && String(val).toUpperCase() === 'SI') isActivo = true;
             });
          }`
);
fs.writeFileSync('server.ts', serverTs);
