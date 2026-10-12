const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `          {clienteEncontrado ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 mb-4 mt-2 animate-in fade-in duration-300">
              <p className="text-sm text-white font-bold mb-1">{clienteEncontrado.razonSocial}</p>
              <div className="text-xs text-neutral-400 space-y-1 mt-2">
                <p><strong>RUC/RIF:</strong> {clienteEncontrado.ruc}</p>
                <p><strong>Dirección:</strong> {clienteEncontrado.direccion}</p>
                <p><strong>Vendedor:</strong> {clienteEncontrado.vendedor}</p>
              </div>
            </div>
          ) : (`,
  `          {clienteEncontrado && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 mb-4 mt-2 animate-in fade-in duration-300">
              <p className="text-sm text-white font-bold mb-1">{clienteEncontrado.razonSocial}</p>
              <div className="text-xs text-neutral-400 space-y-1 mt-2">
                <p><strong>RUC/RIF:</strong> {clienteEncontrado.ruc}</p>
                <p><strong>Dirección:</strong> {clienteEncontrado.direccion}</p>
                <p><strong>Vendedor:</strong> {clienteEncontrado.vendedor}</p>
              </div>
            </div>
          )}
          {!clienteEncontrado && codigoCliente.length >= 2 && (
             <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 mb-4 mt-2 animate-in fade-in duration-300 text-center">
                <p className="text-xs text-neutral-500">Buscando cliente...</p>
             </div>
          )}
          {!clienteEncontrado && codigoCliente.length < 2 ? (`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
