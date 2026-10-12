const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

const endBlock = `        </div>
      </div>
    </div>
  );
};`;

if (content.includes(endBlock)) {
  console.log("Matched exactly");
} else {
  console.log("Did not match exactly");
  // Let's replace using regex
  content = content.replace(
    /<\/div>\s*<\/div>\s*<\/div>\s*\);\s*\};\s*$/,
    `        </div>
      </div>
      ) : (
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
        </div>
      )}
    </div>
  );
};`
  );
  fs.writeFileSync('src/components/CobrosOCR.tsx', content);
}

