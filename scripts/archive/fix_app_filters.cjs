const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

app = app.replace(
  /const filteredVolumen = useMemo\(\(\) => \{\s+if \(userRole === 'ADMIN'\) return volumenData;/s,
  `const filteredVolumen = useMemo(() => {\n    if (activeVendedorId === 'ADMIN') return volumenData;`
);

app = app.replace(
  /const filteredActivacion = useMemo\(\(\) => \{\s+if \(userRole === 'ADMIN'\) return activacionData;/s,
  `const filteredActivacion = useMemo(() => {\n    if (activeVendedorId === 'ADMIN') return activacionData;`
);

fs.writeFileSync('src/App.tsx', app);
