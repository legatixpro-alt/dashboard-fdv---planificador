const fs = require('fs');
let comp = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

if (!comp.includes("import { Search } from 'lucide-react';")) {
  comp = comp.replace(
    /import { Users, CalendarDays, Target, ShieldAlert, XCircle, CheckCircle2, TriangleAlert, User, LayoutList, Grip, Zap } from 'lucide-react';/,
    "import { Users, CalendarDays, Target, ShieldAlert, XCircle, CheckCircle2, TriangleAlert, User, LayoutList, Grip, Zap, Search } from 'lucide-react';"
  );
}

if (!comp.includes("const [searchTerm, setSearchTerm]")) {
  comp = comp.replace(
    /export const ActivacionClientes: React\.FC<Props> = \(\{ filteredVolumen, filteredActivacion, activeVendedorId \}\) => \{/,
    "export const ActivacionClientes: React.FC<Props> = ({ filteredVolumen, filteredActivacion, activeVendedorId }) => {\n  const [searchTerm, setSearchTerm] = React.useState('');\n  const [viewMode, setViewMode] = React.useState<'personal' | 'listado' | 'tarjetas'>('listado');"
  );
}

fs.writeFileSync('src/components/ActivacionClientes.tsx', comp);
