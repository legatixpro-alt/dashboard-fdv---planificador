const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

const mockCode = `
const CLIENTES_MOCK: Record<string, any> = {
  '1001': { razonSocial: 'Supermercados Metro S.A.', ruc: '20100070970', direccion: 'Av. Canadá 1110, La Victoria' },
  '1002': { razonSocial: 'Plaza Vea - Supermercados Peruanos', ruc: '20100070971', direccion: 'Av. República de Panamá 3030' }
};
`;

content = content.replace("export const CobrosOCR: React.FC = () => {", mockCode + "\nexport const CobrosOCR: React.FC = () => {");
fs.writeFileSync('src/components/CobrosOCR.tsx', content);
