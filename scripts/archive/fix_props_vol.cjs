const fs = require('fs');
let comp = fs.readFileSync('src/components/VolumenTab.tsx', 'utf8');

comp = comp.replace(/interface Props \{[\s\S]*?\}/, `interface Props {
  filteredVolumen: VolumenData[];
  activeVendedorId: string;
}`);

comp = comp.replace(/export const VolumenTab: React\.FC<Props> = \(\{ filteredVolumen \}\) => \{/, 
`export const VolumenTab: React.FC<Props> = ({ filteredVolumen, activeVendedorId }) => {`);

// Also fix the UI where it says user
comp = comp.replace(/\{filteredVolumen\.length > 0 && filteredVolumen\[0\]\.vendedorId \? filteredVolumen\[0\]\.vendedorId : 'TODOS LOS VENDEDORES'\}/g, 
`{activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId}`);

// Also fix PDF generation logic
comp = comp.replace(/const vendedorName = filteredVolumen.length > 0 && filteredVolumen\[0\]\.vendedorId \? filteredVolumen\[0\]\.vendedorId : 'TODOS LOS VENDEDORES';/,
`const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId;`);

fs.writeFileSync('src/components/VolumenTab.tsx', comp);
