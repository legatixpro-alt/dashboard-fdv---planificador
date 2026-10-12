const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

// Add imports if needed
if(!content.includes('History')) {
  content = content.replace("FileJson, LogOut, CheckCircle, AlertTriangle, Search, Loader2, Download }", "FileJson, LogOut, CheckCircle, AlertTriangle, Search, Loader2, Download, History, Plus }");
}

const newState = `
  const [activeSubTab, setActiveSubTab] = useState<'nuevo' | 'historial'>('nuevo');
  const [historialRelaciones, setHistorialRelaciones] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ocr_historial_relaciones');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ocr_historial_relaciones', JSON.stringify(historialRelaciones));
    } catch (e) {
      console.error(e);
    }
  }, [historialRelaciones]);
`;

content = content.replace(
  "  const [pagosConsolidados, setPagosConsolidados] = useState<any[]>(() => {",
  newState + "\n  const [pagosConsolidados, setPagosConsolidados] = useState<any[]>(() => {"
);

fs.writeFileSync('src/components/CobrosOCR.tsx', content);
