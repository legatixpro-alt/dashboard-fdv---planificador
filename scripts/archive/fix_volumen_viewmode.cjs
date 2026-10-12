const fs = require('fs');
let comp = fs.readFileSync('src/components/VolumenTab.tsx', 'utf8');

// Add state
comp = comp.replace(
  "const [searchTerm, setSearchTerm] = useState('');",
  "const [searchTerm, setSearchTerm] = useState('');\n  const [viewMode, setViewMode] = useState<'focus' | 'hoja' | 'tarjetas'>('hoja');"
);

// Apply filter logic for Focus
comp = comp.replace(
  /const filteredSkuStats = skuStats\.filter\(stat => \n    stat\.skuId\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\) \|\| \n    stat\.articulo\.toLowerCase\(\)\.includes\(searchTerm\.toLowerCase\(\)\)\n  \);/,
  `let filteredSkuStats = skuStats.filter(stat => 
    stat.skuId.toLowerCase().includes(searchTerm.toLowerCase()) || 
    stat.articulo.toLowerCase().includes(searchTerm.toLowerCase())
  );
  if (viewMode === 'focus') {
    filteredSkuStats = filteredSkuStats.filter(stat => stat.cumplimiento < 100);
  }`
);

// Update buttons UI
comp = comp.replace(
  /<button className="flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1\.5 text-xs font-sans text-neutral-400 hover:text-white transition-colors border-r border-neutral-800">Modo Focus<\/button>\s*<button className="flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1\.5 text-xs font-sans font-bold text-white bg-red-600 border-r border-red-700">Hoja Vendedor<\/button>\s*<button className="flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1\.5 text-xs font-sans text-neutral-400 hover:text-white transition-colors">Tarjetas<\/button>/,
  `<button onClick={() => setViewMode('focus')} className={\`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors border-r \${viewMode === 'focus' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}\`}>Modo Focus</button>
                 <button onClick={() => setViewMode('hoja')} className={\`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors border-r \${viewMode === 'hoja' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}\`}>Hoja Vendedor</button>
                 <button onClick={() => setViewMode('tarjetas')} className={\`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors \${viewMode === 'tarjetas' ? 'font-bold text-white bg-red-600' : 'text-neutral-400 hover:text-white'}\`}>Tarjetas</button>`
);

// Update Desktop View / Mobile View visibility based on viewMode
comp = comp.replace(
  /<div className="hidden md:block overflow-x-auto">/,
  `{viewMode !== 'tarjetas' && (
        <div className="hidden md:block overflow-x-auto">`
);

comp = comp.replace(
  /<\/table>\s*<\/div>\s*\{\/\* MOBILE VIEW:/,
  `</table>
        </div>
        )}
        {/* MOBILE VIEW:`
);

comp = comp.replace(
  /<div className="md:hidden flex flex-col p-3 gap-3 bg-neutral-950">/,
  `<div className={\`flex flex-col p-3 gap-3 bg-neutral-950 \${viewMode === 'tarjetas' ? 'block' : 'md:hidden'}\`}>`
);

fs.writeFileSync('src/components/VolumenTab.tsx', comp);
