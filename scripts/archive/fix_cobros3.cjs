const fs = require('fs');
let code = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

// The mock needs to be above the component, not just dumped anywhere.
const regexMock = /const CLIENTES_MOCK: Record<string, \{ razonSocial: string; parada: string; ruc: string; direccion: string \}> = \{\s*'1001': \{ razonSocial: 'Supermercados Metro S\.A\.', parada: '#42', ruc: '20100070970', direccion: 'Av\. Los Leones 123, Zona Centro' \},\s*'1002': \{ razonSocial: 'Plaza Vea - Supermercados Peruanos', parada: '#15', ruc: '20100080880', direccion: 'Av\. La Marina 456, San Miguel' \},\s*'1003': \{ razonSocial: 'Bodega El Buen Vecino', parada: '#89', ruc: '10456789123', direccion: 'Ca\. Los Pinos 789, Surco' \},\s*\};\s*/;

if (code.match(regexMock)) {
   code = code.replace(regexMock, '');
}

code = code.replace(
  "import React, { useState, useRef, useEffect } from 'react';",
  `import React, { useState, useRef, useEffect } from 'react';\n\nconst CLIENTES_MOCK: Record<string, { razonSocial: string; parada: string; ruc: string; direccion: string }> = {
  '1001': { razonSocial: 'Supermercados Metro S.A.', parada: '#42', ruc: '20100070970', direccion: 'Av. Los Leones 123, Zona Centro' },
  '1002': { razonSocial: 'Plaza Vea - Supermercados Peruanos', parada: '#15', ruc: '20100080880', direccion: 'Av. La Marina 456, San Miguel' },
  '1003': { razonSocial: 'Bodega El Buen Vecino', parada: '#89', ruc: '10456789123', direccion: 'Ca. Los Pinos 789, Surco' },
};`
);

fs.writeFileSync('src/components/CobrosOCR.tsx', code);
