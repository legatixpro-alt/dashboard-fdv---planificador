const fs = require('fs');

function replaceFile(path, replacer) {
  let content = fs.readFileSync(path, 'utf8');
  content = replacer(content);
  fs.writeFileSync(path, content);
}

replaceFile('src/components/ActivacionClientes.tsx', (c) => c.replace(
  /c\.cliente\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\) \|\| c\.codigo\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)/g,
  `(c.cliente || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || (c.codigo || '').toLowerCase().includes((searchTerm || '').toLowerCase())`
));

replaceFile('src/components/ActivacionRubro.tsx', (c) => c.replace(
  /c\.categoria\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)/g,
  `(c.categoria || '').toLowerCase().includes((searchTerm || '').toLowerCase())`
));

replaceFile('src/components/VolumenTab.tsx', (c) => c.replace(
  /stat\.skuId\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\) \|\| \n\s*stat\.articulo\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)/g,
  `(stat.skuId || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || \n    (stat.articulo || '').toLowerCase().includes((searchTerm || '').toLowerCase())`
));

replaceFile('src/App.tsx', (c) => c.replace(
  /authEmail\.toLowerCase\(\)/g,
  `(authEmail || '').toLowerCase()`
));

