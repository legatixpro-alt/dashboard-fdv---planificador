const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

content = content.replace(/const CLIENTES_MOCK: Record<string, any> = \{[\s\S]*?\};\n/, '');

const regex = /if \(CLIENTES_MOCK\[codigoCliente\]\) \{[\s\S]*?\} else \{/g;
content = content.replace(regex, '{');

content = content.replace(/\} else \{\s*setNombreCliente\(''\);\s*setDireccionCliente\(''\);\s*setRucCliente\(''\);\s*\}/g, 'setNombreCliente(\'\');\n              setDireccionCliente(\'\');\n              setRucCliente(\'\');');


fs.writeFileSync('src/components/CobrosOCR.tsx', content);
