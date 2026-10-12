const fs = require('fs');
let code = fs.readFileSync('src/components/VolumenTab.tsx', 'utf8');

code = code.replace(
  "const scaleFactor = rawMeta < 10000 ? 5.5 : 1;",
  "const scaleFactor = 1;"
);

code = code.replace(
  "const displaySku = v.skuId.replace('SKU', 'GEN-');",
  "const displaySku = v.skuId;"
);

fs.writeFileSync('src/components/VolumenTab.tsx', code);
