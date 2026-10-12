const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `              <div className="text-sm text-neutral-400 space-y-1">
                <p><strong>RUC/RIF:</strong> {clienteEncontrado.ruc}</p>
                <p><strong>Dirección:</strong> {clienteEncontrado.direccion}</p>
                <p><strong>Vendedor:</strong> {clienteEncontrado.vendedor}</p>
              </div>`,
  `              <div className="text-xs text-neutral-400 space-y-1 mt-2">
                <p><strong>RUC/RIF:</strong> {clienteEncontrado.ruc}</p>
                <p><strong>Dirección:</strong> {clienteEncontrado.direccion}</p>
                <p><strong>Vendedor:</strong> {clienteEncontrado.vendedor}</p>
              </div>`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
