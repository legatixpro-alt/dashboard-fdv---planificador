const fs = require('fs');
let code = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

code = code.replace(
  `                  <div>
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">C.C (Cód Cliente) *</label>
                      <input type="text" value={codigoCliente} onChange={e => setCodigoCliente(e.target.value)} placeholder="Ej: 1001" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white text-sm focus:border-neutral-600 focus:outline-none transition-colors" />
                  </div>`,
  `                  <div className="col-span-2">
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">C.C (Cód Cliente) *</label>
                      <div className="relative">
                        <input type="text" value={codigoCliente} onChange={e => setCodigoCliente(e.target.value)} placeholder="Ej: 1001" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 pr-10 text-white text-sm focus:border-neutral-600 focus:outline-none transition-colors" />
                        <Search className="w-4 h-4 text-neutral-500 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>
                  </div>`
);

// We need to hide the normal "Cliente" input when we have a valid client, but it seems there's no way to type it manually if it fails
// So we keep it but it should probably take 2 columns
code = code.replace(
  `                  <div>
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Cliente *</label>
                      <input type="text" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} placeholder="Nombre del cliente" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-neutral-300 text-sm focus:border-neutral-600 focus:outline-none transition-colors" />
                  </div>`,
  `                  <div className="col-span-2">
                      <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">Razón Social *</label>
                      <input type="text" value={nombreCliente} onChange={e => setNombreCliente(e.target.value)} placeholder="Nombre del cliente" className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-neutral-300 text-sm focus:border-neutral-600 focus:outline-none transition-colors" />
                  </div>`
);

fs.writeFileSync('src/components/CobrosOCR.tsx', code);
