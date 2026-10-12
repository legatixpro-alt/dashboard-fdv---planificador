const fs = require('fs');
let code = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

code = code.replace(
  `                  <div className="col-span-2">
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Razón Social *</label>
                      <input type="text" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} placeholder="Nombre del cliente" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-neutral-300 text-sm focus:border-neutral-600 focus:outline-none transition-colors" />
                  </div>`,
  `                  <div className="col-span-2 hidden">
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Razón Social *</label>
                      <input type="text" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} placeholder="Nombre del cliente" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-neutral-300 text-sm focus:border-neutral-600 focus:outline-none transition-colors" />
                  </div>`
);

fs.writeFileSync('src/components/CobrosOCR.tsx', code);
