const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Move the problem code below the variable declarations
const badBlock = `  const [activeVendedorId, setActiveVendedorId] = useState<string>('ADMIN');
  const [vendedoresList, setVendedoresList] = useState<string[]>([]);
  useEffect(() => {
    if (activacionData.length > 0) {
      const uniqueVendors = Array.from(new Set(activacionData.map(d => d.vendedorId))).filter(Boolean).sort();
      setVendedoresList(uniqueVendors as string[]);
      if (userRole !== 'ADMIN' && uniqueVendors.length > 0 && activeVendedorId === 'ADMIN') {
        setActiveVendedorId(uniqueVendors[0]);
      }
    }
  }, [activacionData, userRole]);`;

const dataDecls = `  const [volumenData, setVolumenData] = useState<VolumenData[]>([]);
  const [activacionData, setActivacionData] = useState<any[]>([]);
  const [metasActivacion, setMetasActivacion] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);`;

content = content.replace(badBlock, `  const [activeVendedorId, setActiveVendedorId] = useState<string>('ADMIN');\n  const [vendedoresList, setVendedoresList] = useState<string[]>([]);`);

content = content.replace(dataDecls, `${dataDecls}

  useEffect(() => {
    if (activacionData.length > 0) {
      const uniqueVendors = Array.from(new Set(activacionData.map(d => d.vendedorId))).filter(Boolean).sort();
      setVendedoresList(uniqueVendors as string[]);
      if (userRole !== 'ADMIN' && uniqueVendors.length > 0 && activeVendedorId === 'ADMIN') {
        setActiveVendedorId(uniqueVendors[0]);
      }
    }
  }, [activacionData, userRole, activeVendedorId]);
`);

fs.writeFileSync('src/App.tsx', content);
