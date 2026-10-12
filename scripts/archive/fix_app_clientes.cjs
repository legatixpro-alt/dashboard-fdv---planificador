const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

app = app.replace(/<ActivacionClientes\s+filteredVolumen=\{filteredVolumen\}\s+filteredActivacion=\{filteredActivacion\}\s*\/>/, 
`<ActivacionClientes 
              filteredVolumen={filteredVolumen} 
              filteredActivacion={filteredActivacion} 
              activeVendedorId={activeVendedorId}
            />`);

fs.writeFileSync('src/App.tsx', app);
