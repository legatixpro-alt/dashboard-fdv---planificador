const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

const replacement = `
            <div className="w-full overflow-x-auto pb-4">
              <div className="min-w-[1000px]">
                {/* Tabla Header */}
                <div className="grid grid-cols-12 gap-4 border-b border-neutral-800 pb-3 mb-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                  <div className="col-span-1">N° Correlativo</div>
                  <div className="col-span-1">Código</div>
                  <div className="col-span-2">Cliente</div>
                  <div className="col-span-1">Vendedor</div>
                  <div className="col-span-1">Fecha Pedido</div>
                  <div className="col-span-1">Fecha Carga</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-4">Estado Actual</div>
                </div>

                {/* Tabla Body */}
                <div className="space-y-3">
                  {HISTORIAL_MOCK.map((incidencia) => (
                    <div key={incidencia.id} className="grid grid-cols-12 gap-4 items-center bg-neutral-900/50 rounded-xl border border-neutral-800 p-4 hover:border-neutral-700 transition-colors">
                      <div className="col-span-1 font-bold text-white text-sm">{incidencia.id}</div>
                      <div className="col-span-1 font-mono text-neutral-400 text-xs">{incidencia.codigo}</div>
                      <div className="col-span-2 text-sm text-neutral-300 font-bold leading-tight uppercase">{incidencia.cliente}</div>
                      <div className="col-span-1 text-xs text-neutral-500 capitalize">{incidencia.vendedor}</div>
                      <div className="col-span-1 text-xs text-neutral-400">{incidencia.fechaPedido}</div>
                      <div className="col-span-1 text-xs text-neutral-400">{incidencia.fechaCarga}</div>
                      <div className="col-span-1 text-sm font-bold text-emerald-400">{incidencia.total}</div>
                      <div className="col-span-4 flex flex-col justify-center">
                        <div className="text-[10px] text-neutral-400 mb-1.5 font-medium uppercase tracking-wider">
                          Ubicación: <span className="text-white font-bold">{DEPARTAMENTOS[incidencia.pasoActual - 1]}</span>
                        </div>
                        <div className="flex items-center gap-1 w-full relative">
                          {DEPARTAMENTOS.map((dep, index) => {
                            const stepNumber = index + 1;
                            const isActive = stepNumber <= incidencia.pasoActual;
                            const isCurrent = stepNumber === incidencia.pasoActual;
                            
                            return (
                              <React.Fragment key={dep}>
                                <div className="flex flex-col items-center relative z-10 group cursor-help">
                                  <div className={\`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors \${isActive ? 'bg-cyan-600 text-white shadow-[0_0_8px_rgba(8,145,178,0.5)]' : 'bg-neutral-800 text-neutral-500'}\`}>
                                    {stepNumber}
                                  </div>
                                  <div className="absolute top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-neutral-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap pointer-events-none transition-opacity z-20">
                                    {dep}
                                  </div>
                                  <span className={\`text-[8px] font-bold uppercase mt-1 text-center leading-none max-w-[40px] truncate \${isActive ? 'text-cyan-400' : 'text-neutral-600'}\`}>
                                    {dep.split(' ')[0]}
                                  </span>
                                </div>
                                {index < DEPARTAMENTOS.length - 1 && (
                                  <div className={\`flex-1 h-0.5 \${isActive && index < incidencia.pasoActual - 1 ? 'bg-cyan-600' : 'bg-neutral-800'}\`} />
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>`;

code = code.replace(
  /<div className="space-y-4">[\s\S]*?<\/div>[\s\S]*?<div className="mt-8 text-center[\s\S]*?<\/div>/, 
  replacement
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
