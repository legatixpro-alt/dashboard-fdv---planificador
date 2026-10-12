const fs = require('fs');

let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

// Remove Google Token Client useEffect
const googleTokenRegex = /\/\/ Initialize Google Token Client[\s\S]*?\/\/ Load Auto-save/;
content = content.replace(googleTokenRegex, '// Load Auto-save');

content = content.replace(/const \[googleToken, setGoogleToken\] = useState<string \| null>\(null\);\n/, '');

// Remove MOCK logic
const mockLogicRegex = /\} else if \(CLIENTES_MOCK\[codigoCliente\]\) \{[\s\S]*?\} else \{/g;
content = content.replace(mockLogicRegex, '} else {');

const fallbackMockLogicRegex = /if \(CLIENTES_MOCK\[codigoCliente\]\) \{[\s\S]*?\} else \{/g;
// Just carefully replace the block inside the else statement of try/catch if any
fs.writeFileSync('src/components/CobrosOCR.tsx', content);
