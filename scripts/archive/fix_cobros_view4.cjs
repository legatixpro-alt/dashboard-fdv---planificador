const fs = require('fs');
let code = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

code = code.replace(
  `                  {nombreCliente && (
                    <div className="col-span-2 bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1 mt-2">
                      <p className="text-sm text-white font-bold mb-1">{nombreCliente}</p>
                      <p className="text-xs text-neutral-400"><strong>RUC/RIF:</strong> {rucCliente}</p>
                      <p className="text-xs text-neutral-400"><strong>Dirección:</strong> {direccionCliente}</p>
                    </div>
                  )}`,
  `                  {nombreCliente && (
                    <div className="col-span-2 bg-neutral-950 p-3 rounded-lg border border-neutral-800 space-y-1 mt-2">
                      <p className="text-sm text-white font-bold mb-1">{nombreCliente}</p>
                      <p className="text-xs text-neutral-400">RUC: {rucCliente}</p>
                      <p className="text-xs text-neutral-400">Dirección: {direccionCliente}</p>
                    </div>
                  )}`
);

fs.writeFileSync('src/components/CobrosOCR.tsx', code);
