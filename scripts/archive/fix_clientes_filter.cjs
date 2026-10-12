const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

// Filter clients based on search term
comp = comp.replace(
  /\{clientList\.map\(\(client, idx\) => \{/g,
  `{clientList
    .filter(c => c.cliente.toLowerCase().includes(searchTerm.toLowerCase()) || c.codigo.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(c => viewMode === 'personal' ? (c.rubrosComprados < 5 || !c.isActivo) : true)
    .map((client, idx) => {`
);

// Toggle views
comp = comp.replace(
  /<div className="hidden md:block overflow-x-auto">/,
  `{viewMode !== 'tarjetas' && (<div className="hidden md:block overflow-x-auto">`
);

comp = comp.replace(
  /<\/table>\s*<\/div>\s*\{\/\* Mobile View: Cards \*\/\}/,
  `</table>\n         </div>)}\n         {/* Mobile View: Cards */}`
);

comp = comp.replace(
  /<div className="md:hidden flex flex-col p-3 gap-3">/,
  `<div className={\`flex flex-col p-3 gap-3 \${viewMode === 'tarjetas' ? 'block' : 'md:hidden'}\`}>`
);

// Remove the redundant PDF button at line 439 (I can just replace it with empty string, checking context)
comp = comp.replace(
  /<button onClick=\{generarPDF\} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-\[44px\] sm:min-h-\[36px\] rounded-full hover:bg-red-700 transition-colors">\s*<FileText className="w-3\.5 h-3\.5" \/> PDF\s*<\/button>/g,
  function(match, offset, string) {
    if (offset > 20000) { // rough offset check to remove only the second one, wait maybe we want to keep one? 
      // Actually it's easier to just remove it
      return '';
    }
    return match;
  }
);


fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
