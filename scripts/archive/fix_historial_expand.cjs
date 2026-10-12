const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

const historyHtml = `
        <div className="space-y-4">
          <h2 className="text-xl font-sans font-bold text-white uppercase tracking-wider mb-4">Relaciones Generadas</h2>
          {historialRelaciones.length === 0 ? (
            <div className="text-center py-10 text-neutral-500">
               No hay relaciones en el historial.
            </div>
          ) : (
            historialRelaciones.map(rel => (
               <div key={rel.id} className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div>
                   <h3 className="text-sm font-bold text-white mb-1">Emisión: {new Date(rel.fecha).toLocaleString('es-VE')}</h3>
                   <p className="text-xs text-neutral-400 uppercase tracking-wider">Vendedor: {rel.vendedor} • Pagos: {rel.cantidadPagos}</p>
                 </div>
                 <div className="flex items-center gap-4">
                   <div className="text-right">
                     <p className="text-xs text-neutral-500 uppercase tracking-wider">Total Monto</p>
                     <p className="text-lg font-bold text-emerald-400">{new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(rel.montoTotal)}</p>
                   </div>
                 </div>
               </div>
            ))
          )}
        </div>`;

const newHistoryHtml = `
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-sans font-bold text-white uppercase tracking-wider">Historial de Relaciones</h2>
            <span className="text-xs font-bold text-neutral-500 bg-neutral-900 px-3 py-1.5 rounded-full border border-neutral-800">{historialRelaciones.length} enviadas</span>
          </div>
          {historialRelaciones.length === 0 ? (
            <div className="text-center py-10 bg-neutral-900/30 border border-neutral-800 rounded-xl">
               <History className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
               <p className="text-neutral-500 text-sm font-sans">No hay relaciones en el historial.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {historialRelaciones.map(rel => (
                 <details key={rel.id} className="bg-neutral-950 border border-neutral-800 rounded-xl group overflow-hidden">
                   <summary className="p-4 bg-neutral-900/50 hover:bg-neutral-800/50 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors list-none">
                     <div className="flex items-center gap-3">
                       <div className="bg-emerald-950/30 border border-emerald-900/50 p-2 rounded-lg">
                         <CheckCircle className="w-5 h-5 text-emerald-500" />
                       </div>
                       <div>
                         <h3 className="text-sm font-bold text-white mb-0.5 tracking-wide">Relación {new Date(rel.fecha).toLocaleDateString('es-VE')}</h3>
                         <p className="text-[10px] md:text-xs text-neutral-400 font-mono">{new Date(rel.fecha).toLocaleTimeString('es-VE')}</p>
                       </div>
                     </div>
                     <div className="flex items-center justify-between md:justify-end gap-6 md:gap-8">
                       <div>
                         <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Pagos</p>
                         <p className="text-sm font-bold text-neutral-300">{rel.cantidadPagos}</p>
                       </div>
                       <div className="text-right">
                         <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Monto Total</p>
                         <p className="text-sm font-bold text-emerald-400">Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(rel.montoTotal)}</p>
                       </div>
                       <div className="text-neutral-500 group-open:rotate-180 transition-transform">
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                         </svg>
                       </div>
                     </div>
                   </summary>
                   <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                     <table className="w-full text-left border-collapse">
                       <thead>
                         <tr className="border-b border-neutral-800 text-[10px] font-sans text-neutral-500 uppercase tracking-wider">
                           <th className="pb-2 font-bold">Cliente</th>
                           <th className="pb-2 font-bold text-center">Banco</th>
                           <th className="pb-2 font-bold text-center">Ref</th>
                           <th className="pb-2 font-bold text-right">Monto</th>
                         </tr>
                       </thead>
                       <tbody className="text-xs font-mono text-neutral-300">
                         {rel.pagos.map((p, idx) => (
                           <tr key={idx} className="border-b border-neutral-800/50 last:border-0 hover:bg-neutral-900/30 transition-colors">
                             <td className="py-2.5 font-sans">
                                <div className="font-bold text-white">{p.codigo_cliente}</div>
                                <div className="text-[10px] text-neutral-500">{p.factura || 'Sin factura'}</div>
                             </td>
                             <td className="py-2.5 text-center text-neutral-400">{p.banco}</td>
                             <td className="py-2.5 text-center text-neutral-400">{p.referencia}</td>
                             <td className="py-2.5 text-right font-bold text-white">Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(p.monto)}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                 </details>
              ))}
            </div>
          )}
        </div>`;

content = content.replace(historyHtml, newHistoryHtml);
fs.writeFileSync('src/components/CobrosOCR.tsx', content);
