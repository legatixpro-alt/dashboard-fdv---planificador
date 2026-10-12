const fs = require('fs');
let code = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

const mockData = `
const CLIENTES_MOCK: Record<string, { razonSocial: string; parada: string; ruc: string; direccion: string }> = {
  '1001': { razonSocial: 'Supermercados Metro S.A.', parada: '#42', ruc: '20100070970', direccion: 'Av. Los Leones 123, Zona Centro' },
  '1002': { razonSocial: 'Plaza Vea - Supermercados Peruanos', parada: '#15', ruc: '20100080880', direccion: 'Av. La Marina 456, San Miguel' },
  '1003': { razonSocial: 'Bodega El Buen Vecino', parada: '#89', ruc: '10456789123', direccion: 'Ca. Los Pinos 789, Surco' },
};
`;

code = code.replace(
  "import React, { useState, useRef, useEffect } from 'react';",
  "import React, { useState, useRef, useEffect } from 'react';\n" + mockData
);

code = code.replace(
  "            if (data && data.nombre) {\n               setNombreCliente(data.nombre);\n               setDireccionCliente(data.direccion || 'No especificada');\n               setRucCliente(data.ruc || data.codigo || 'No especificado');\n               setAlertMsg({ type: 'success', text: `Cliente encontrado: ${data.nombre}` });\n               setTimeout(() => setAlertMsg(null), 3000);\n            } else {\n               setNombreCliente('');\n               setDireccionCliente('');\n               setRucCliente('');\n            }",
  "            if (data && data.nombre) {\n               setNombreCliente(data.nombre);\n               setDireccionCliente(data.direccion || 'No especificada');\n               setRucCliente(data.ruc || data.codigo || 'No especificado');\n               setAlertMsg({ type: 'success', text: `Cliente encontrado: ${data.nombre}` });\n               setTimeout(() => setAlertMsg(null), 3000);\n            } else if (CLIENTES_MOCK[codigoCliente]) {\n               setNombreCliente(CLIENTES_MOCK[codigoCliente].razonSocial);\n               setDireccionCliente(CLIENTES_MOCK[codigoCliente].direccion);\n               setRucCliente(CLIENTES_MOCK[codigoCliente].ruc);\n               setAlertMsg({ type: 'success', text: `Cliente encontrado: ${CLIENTES_MOCK[codigoCliente].razonSocial}` });\n               setTimeout(() => setAlertMsg(null), 3000);\n            } else {\n               setNombreCliente('');\n               setDireccionCliente('');\n               setRucCliente('');\n            }"
);

code = code.replace(
  "          } else {\n            setNombreCliente('');\n            setDireccionCliente('');\n            setRucCliente('');\n          }",
  "          } else {\n            if (CLIENTES_MOCK[codigoCliente]) {\n               setNombreCliente(CLIENTES_MOCK[codigoCliente].razonSocial);\n               setDireccionCliente(CLIENTES_MOCK[codigoCliente].direccion);\n               setRucCliente(CLIENTES_MOCK[codigoCliente].ruc);\n               setAlertMsg({ type: 'success', text: `Cliente encontrado: ${CLIENTES_MOCK[codigoCliente].razonSocial}` });\n               setTimeout(() => setAlertMsg(null), 3000);\n            } else {\n               setNombreCliente('');\n               setDireccionCliente('');\n               setRucCliente('');\n            }\n          }"
);

code = code.replace(
  "      setNombreCliente('');\n      setDireccionCliente('');\n      setRucCliente('');",
  "      setNombreCliente('');\n      setDireccionCliente('');\n      setRucCliente('');"
);

fs.writeFileSync('src/components/CobrosOCR.tsx', code);
