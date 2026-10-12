const fs = require('fs');

let content = fs.readFileSync('src/components/RecorridoMes.tsx', 'utf8');

const oldButton = `<button 
          onClick={onSync}
          disabled={loading}
          className="flex items-center justify-center gap-2 text-sm font-sans font-medium text-neutral-300 bg-neutral-900 border border-neutral-800 px-4 py-3 min-h-[44px] rounded-lg hover:bg-neutral-800 transition-colors w-full md:w-auto disabled:opacity-50"
        >
          <RefreshCw className={\`w-4 h-4 text-emerald-500 \${loading ? 'animate-spin' : ''}\`} /> Sincronizar Hoy
        </button>`;

const newButton = `<div className="flex items-center justify-center gap-2 text-sm font-sans font-medium text-emerald-500/80 bg-emerald-950/20 border border-emerald-900/30 px-4 py-3 min-h-[44px] rounded-lg w-full md:w-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Sincronización Automática
        </div>`;

content = content.replace(oldButton, newButton);
fs.writeFileSync('src/components/RecorridoMes.tsx', content);
