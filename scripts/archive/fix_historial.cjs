const fs = require('fs');
let code = fs.readFileSync('src/components/Incidencias.tsx', 'utf8');

// replace HISTORIAL_MOCK
const newMock = `
const DEPARTAMENTOS = [
  'Almacén de Víveres',
  'Almacén de Congelados',
  'Logística y Control',
  'Facturación',
  'Gerencia'
];

const HISTORIAL_MOCK = [
  { 
    id: '03854',
    codigo: '7079',
    cliente: 'COSECHA SUPER MARKET, C.A',
    vendedor: 'carlos fuenmayor',
    fechaPedido: '2026-09-09',
    fechaCarga: '9/9/2026 16:40',
    total: '$845.00',
    pasoActual: 4, // Facturación
  },
  { 
    id: '03855',
    codigo: '1001',
    cliente: 'Supermercados Metro S.A.',
    vendedor: 'hernan paz',
    fechaPedido: '2026-09-08',
    fechaCarga: '8/9/2026 10:30',
    total: '$1,250.00',
    pasoActual: 2, // Almacén de Congelados
  },
  { 
    id: '03856',
    codigo: '1002',
    cliente: 'Plaza Vea - Supermercados Peruanos',
    vendedor: 'hernan paz',
    fechaPedido: '2026-09-07',
    fechaCarga: '7/9/2026 15:45',
    total: '$430.50',
    pasoActual: 5, // Gerencia
  }
];
`;

const oldMockRegex = /\/\/ Historial Mock\nconst HISTORIAL_MOCK = \[\n(?:.*\n)*?\];/;
code = code.replace(oldMockRegex, newMock);

fs.writeFileSync('src/components/Incidencias.tsx', code);
