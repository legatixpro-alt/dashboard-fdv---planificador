const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

code = code.replace(
  "              setClienteEncontrado({\n                razonSocial: data.nombre,\n                vendedor: data.vendedor || 'No especificado',\n                direccion: data.direccion || 'No especificada',\n                ruc: data.ruc || 'No especificado'\n              });",
  "              setClienteEncontrado({\n                razonSocial: data.nombre,\n                vendedor: data.vendedor || 'No especificado',\n                direccion: data.direccion || 'No especificada',\n                ruc: data.ruc || 'No especificado'\n              });\n            } else if (CLIENTES_MOCK[codigoCliente]) {\n              setClienteEncontrado({\n                 razonSocial: CLIENTES_MOCK[codigoCliente].razonSocial,\n                 vendedor: 'No especificado',\n                 direccion: CLIENTES_MOCK[codigoCliente].direccion,\n                 ruc: CLIENTES_MOCK[codigoCliente].ruc\n              });"
);

code = code.replace(
  "          } else {\n            setClienteEncontrado(null);\n          }",
  "          } else {\n            if (CLIENTES_MOCK[codigoCliente]) {\n              setClienteEncontrado({\n                 razonSocial: CLIENTES_MOCK[codigoCliente].razonSocial,\n                 vendedor: 'No especificado',\n                 direccion: CLIENTES_MOCK[codigoCliente].direccion,\n                 ruc: CLIENTES_MOCK[codigoCliente].ruc\n              });\n            } else {\n              setClienteEncontrado(null);\n            }\n          }"
);

fs.writeFileSync('src/components/Incidencias.tsx', code);
