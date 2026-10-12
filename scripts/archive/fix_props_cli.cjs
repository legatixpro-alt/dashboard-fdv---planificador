const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(/interface Props \{[\s\S]*?\}/, `interface Props {
  filteredActivacion: any[];
  activeVendedorId: string;
}`);

comp = comp.replace(/export const ActivacionClientes: React\.FC<Props> = \(\{ filteredActivacion \}\) => \{/, 
`export const ActivacionClientes: React.FC<Props> = ({ filteredActivacion, activeVendedorId }) => {`);

comp = comp.replace(/const activeVendedorId = filteredActivacion\.length > 0 && filteredActivacion\.every\(a => a\.vendedorId === filteredActivacion\[0\]\.vendedorId\) \? filteredActivacion\[0\]\.vendedorId : 'ADMIN';/, '');

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
