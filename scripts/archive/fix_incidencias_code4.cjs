const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `              <div className="text-xs text-neutral-400 space-y-1 mt-2">
                <p>RUC: {clienteEncontrado.ruc}</p>
                <p>Dirección: {clienteEncontrado.direccion}</p>
              </div>`,
  `              <div className="text-xs text-neutral-400 space-y-1 mt-2">
                <p><strong>RUC/RIF:</strong> {clienteEncontrado.ruc}</p>
                <p><strong>Dirección:</strong> {clienteEncontrado.direccion}</p>
              </div>`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
