const fs = require('fs');
let server = fs.readFileSync('server.ts', 'utf8');

server = server.replace(
  /skuId: sku,\s*cliente: vendorName,/g,
  "skuId: sku,\n                articulo: articulo,\n                cliente: vendorName,"
);

fs.writeFileSync('server.ts', server);

let types = fs.readFileSync('src/types.ts', 'utf8');
if (!types.includes("articulo?: string;")) {
  types = types.replace(
    /skuId: string;/g,
    "skuId: string;\n  articulo?: string;"
  );
  fs.writeFileSync('src/types.ts', types);
}

let volTab = fs.readFileSync('src/components/VolumenTab.tsx', 'utf8');
volTab = volTab.replace(
  /articulo: getArticuloName\(v\.skuId\),/g,
  "articulo: v.articulo || getArticuloName(v.skuId),"
);
fs.writeFileSync('src/components/VolumenTab.tsx', volTab);
