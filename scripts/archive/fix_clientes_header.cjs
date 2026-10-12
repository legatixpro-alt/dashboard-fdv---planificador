const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

comp = comp.replace(/interface Props \{[\s\S]*?\}/, `interface Props {
  filteredVolumen: any[];
  filteredActivacion: any[];
  activeVendedorId: string;
}`);

comp = comp.replace(/export const ActivacionClientes: React\.FC<Props> = \(\{ filteredVolumen, filteredActivacion \}\) => \{/, 
`export const ActivacionClientes: React.FC<Props> = ({ filteredVolumen, filteredActivacion, activeVendedorId }) => {`);

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
