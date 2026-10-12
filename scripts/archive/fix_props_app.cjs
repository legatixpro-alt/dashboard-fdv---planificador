const fs = require('fs');

let app = fs.readFileSync('src/App.tsx', 'utf8');

app = app.replace(/<ActivacionRubro\s+filteredVolumen=\{filteredVolumen\}\s+filteredActivacion=\{filteredActivacion\}\s+metasActivacion=\{metasActivacion\}\s*\/>/, 
`<ActivacionRubro 
              filteredVolumen={filteredVolumen} 
              filteredActivacion={filteredActivacion} 
              metasActivacion={metasActivacion}
              activeVendedorId={activeVendedorId}
            />`);

app = app.replace(/<VolumenTab\s+filteredVolumen=\{filteredVolumen\}\s*\/>/, 
`<VolumenTab 
              filteredVolumen={filteredVolumen} 
              activeVendedorId={activeVendedorId}
            />`);

app = app.replace(/<ActivacionClientes\s+filteredActivacion=\{filteredActivacion\}\s*\/>/, 
`<ActivacionClientes 
              filteredActivacion={filteredActivacion} 
              activeVendedorId={activeVendedorId}
            />`);
            
fs.writeFileSync('src/App.tsx', app);
