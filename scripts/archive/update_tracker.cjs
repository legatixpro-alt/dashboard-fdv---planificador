const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  "className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${isActive ? 'bg-cyan-600 text-white shadow-[0_0_8px_rgba(8,145,178,0.5)]' : 'bg-neutral-800 text-neutral-500'}`}",
  "className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${isActive ? 'bg-cyan-600 text-white shadow-[0_0_8px_rgba(8,145,178,0.5)]' : 'bg-neutral-800 text-neutral-500'} ${isCurrent ? 'ring-2 ring-cyan-200 ring-offset-2 ring-offset-neutral-900' : ''}`}"
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
