const fs = require('fs');

let content = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

const startStr = '{/* 3. Tipo de Incidencia */}';
const endStr = '        {/* 4. Productos Afectados */}';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  const newContent = `{/* 3. Tipo y Nivel de Incidencia */}
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 mb-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-white font-bold font-sans">Tipo de Incidencia</h2>
              <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Obligatorio</span>
            </div>
            <div className="relative">
              <select
                value={tipoIncidencia}
                onChange={(e) => setTipoIncidencia(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 text-white min-h-[44px] rounded-lg px-4 pr-10 text-sm font-bold focus:outline-none focus:border-neutral-600 transition-colors appearance-none"
              >
                <option value="" disabled>Seleccione un tipo...</option>
                {tipos.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
                ))}
              </select>
              <ChevronDown className="w-5 h-5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold font-sans mb-2">Nivel de Impacto</h3>
            <div className="relative">
              <select
                value={nivelImpacto}
                onChange={(e) => setNivelImpacto(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 text-white min-h-[44px] rounded-lg px-4 pr-10 text-sm font-bold focus:outline-none focus:border-neutral-600 transition-colors appearance-none"
              >
                {impactos.map((impacto) => (
                  <option key={impacto} value={impacto}>{impacto}</option>
                ))}
              </select>
              <ChevronDown className="w-5 h-5 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

`;
  
  const updated = content.substring(0, startIndex) + newContent + content.substring(endIndex);
  fs.writeFileSync('src/components/Incidencias.tsx', updated);
  console.log("Updated successfully");
} else {
  console.log("Could not find boundaries");
}
