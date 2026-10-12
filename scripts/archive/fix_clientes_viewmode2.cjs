const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(
  "import { Search } from 'lucide-react';\n\nexport const ActivacionClientes",
  "import { Search } from 'lucide-react';\nimport { useState } from 'react';\n\nexport const ActivacionClientes"
);

comp = comp.replace(
  /<div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shrink-0 self-start lg:self-auto w-full sm:w-auto">\s*<button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1\.5 text-\[10px\] md:text-xs font-sans text-neutral-400 hover:text-white transition-colors border-r border-neutral-800">\s*<User className="w-3\.5 h-3\.5" \/> Vista Personal\s*<\/button>\s*<button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1\.5 text-\[10px\] md:text-xs font-sans font-bold text-white bg-red-600 border-r border-red-700">\s*<LayoutList className="w-3\.5 h-3\.5" \/> Listado\s*<\/button>\s*<button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1\.5 text-\[10px\] md:text-xs font-sans text-neutral-400 hover:text-white transition-colors">\s*<Grip className="w-3\.5 h-3\.5" \/> Tarjetas\s*<\/button>\s*<\/div>/,
  `<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
             <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shrink-0">
                 <button onClick={() => setViewMode('personal')} className={\`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-sans transition-colors border-r \${viewMode === 'personal' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}\`}>
                   <User className="w-3.5 h-3.5" /> Vista Personal
                 </button>
                 <button onClick={() => setViewMode('listado')} className={\`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-sans transition-colors border-r \${viewMode === 'listado' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}\`}>
                   <LayoutList className="w-3.5 h-3.5" /> Listado
                 </button>
                 <button onClick={() => setViewMode('tarjetas')} className={\`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-sans transition-colors \${viewMode === 'tarjetas' ? 'font-bold text-white bg-red-600' : 'text-neutral-400 hover:text-white'}\`}>
                   <Grip className="w-3.5 h-3.5" /> Tarjetas
                 </button>
             </div>
             <div className="flex items-center gap-2 w-full sm:w-auto">
                 <div className="relative flex-1 sm:flex-none">
                     <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                     <input 
                         type="text" 
                         placeholder="Buscar cliente..." 
                         className="w-full sm:w-56 md:w-64 bg-neutral-900 border border-neutral-800 text-sm font-sans text-white rounded-full pl-9 pr-4 py-2 min-h-[44px] sm:min-h-[36px] focus:outline-none focus:border-neutral-600 transition-colors"
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                     />
                 </div>
                 <button onClick={generarPDF} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-full hover:bg-red-700 transition-colors">
                     <FileText className="w-3.5 h-3.5" /> PDF
                 </button>
             </div>
          </div>`
);

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
