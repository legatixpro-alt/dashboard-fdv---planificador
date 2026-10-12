const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

const regex = /<div className="text-sm text-neutral-400 space-y-1">[\s\S]*?<\/div>/g;
const replacement = `<div className="text-sm text-neutral-400 space-y-1">
                <p>Vendedor: {clienteEncontrado.vendedor}</p>
                <p>Dirección: {clienteEncontrado.direccion}</p>
                <p>RUC/RIF: {clienteEncontrado.ruc}</p>
              </div>`;
code = code.replace(regex, replacement);

const regex2 = /setClienteEncontrado\({[\s\S]*?}\);/g;
const replacement2 = `setClienteEncontrado({
                razonSocial: data.nombre,
                vendedor: data.vendedor || 'No especificado',
                direccion: data.direccion || 'No especificada',
                ruc: data.ruc || 'No especificado'
              });`;
code = code.replace(regex2, replacement2);

fs.writeFileSync('src/components/Incidencias.tsx', code);
