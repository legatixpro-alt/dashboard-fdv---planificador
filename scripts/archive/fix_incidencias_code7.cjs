const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  `          {!clienteEncontrado && codigoCliente.length < 2 ? (
            <div className="bg-neutral-950 border border-neutral-800 border-dashed rounded-lg p-4 mb-4 flex items-center justify-center">
              <p className="text-neutral-500 text-sm font-medium">Ingrese un código válido para autocompletar.</p>
            </div>
          )}`,
  `          {!clienteEncontrado && codigoCliente.length < 2 && (
            <div className="bg-neutral-950 border border-neutral-800 border-dashed rounded-lg p-4 mb-4 mt-2 flex items-center justify-center">
              <p className="text-neutral-500 text-sm font-medium">Ingrese un código válido para autocompletar.</p>
            </div>
          )}`
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
