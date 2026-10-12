const fs = require('fs');
let code = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');
code = code.replace(
  "                      <p className=\"text-xs text-neutral-400\"><strong>RUC:</strong> {rucCliente}</p>",
  "                      <p className=\"text-xs text-neutral-400\"><strong>RUC/RIF:</strong> {rucCliente}</p>"
);
fs.writeFileSync('src/components/CobrosOCR.tsx', code);
