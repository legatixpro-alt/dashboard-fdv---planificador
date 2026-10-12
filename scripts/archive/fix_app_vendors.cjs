const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// The dropdown currently hardcodes "V1", "V2". Let's change this to use dynamic vendors.
const regexHeader = /<header className="max-w-7xl mx-auto flex flex-col xl:flex-row xl:items-center justify-between gap-4 md:gap-6 mb-6 md:mb-8">[\s\S]*?<\/header>/;

content = content.replace(/const \[activeVendedorId, setActiveVendedorId\] = useState<string>\('V1'\);/, `const [activeVendedorId, setActiveVendedorId] = useState<string>('ADMIN');\n  const [vendedoresList, setVendedoresList] = useState<string[]>([]);\n  useEffect(() => {\n    if (activacionData.length > 0) {\n      const uniqueVendors = Array.from(new Set(activacionData.map(d => d.vendedorId))).filter(Boolean).sort();\n      setVendedoresList(uniqueVendors as string[]);\n      if (userRole !== 'ADMIN' && uniqueVendors.length > 0 && activeVendedorId === 'ADMIN') {\n        setActiveVendedorId(uniqueVendors[0]);\n      }\n    }\n  }, [activacionData, userRole]);\n`);

fs.writeFileSync('src/App.tsx', content);
