const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `              <div className="text-sm text-neutral-400 space-y-1">
                <p>Vendedor: {clienteEncontrado.vendedor}</p>
                <p>Dirección: {clienteEncontrado.direccion}</p>
                <p>RUC/RIF: {clienteEncontrado.ruc}</p>
              </div>`,
  `              <div className="text-sm text-neutral-400 space-y-1">
                <p><strong>RUC/RIF:</strong> {clienteEncontrado.ruc}</p>
                <p><strong>Dirección:</strong> {clienteEncontrado.direccion}</p>
                <p><strong>Vendedor:</strong> {clienteEncontrado.vendedor}</p>
              </div>`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
