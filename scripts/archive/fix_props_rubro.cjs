const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionRubro.tsx', 'utf8');

comp = comp.replace(/interface Props \{[\s\S]*?\}/, `interface Props {
  filteredVolumen: VolumenData[];
  filteredActivacion: any[];
  metasActivacion?: any[];
  activeVendedorId: string;
}`);

comp = comp.replace(/export const ActivacionRubro: React\.FC<Props> = \(\{ filteredVolumen, filteredActivacion, metasActivacion \}\) => \{/, 
`export const ActivacionRubro: React.FC<Props> = ({ filteredVolumen, filteredActivacion, metasActivacion, activeVendedorId }) => {`);

comp = comp.replace(/const activeVendedorId = filteredActivacion\.length > 0 \? filteredActivacion\[0\]\.vendedorId : null;\s*\/\/ Fallback to a valid vendor if needed/, '');

fs.writeFileSync('src/components/ActivacionRubro.tsx', comp);
