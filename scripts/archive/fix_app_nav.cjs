const fs = require('fs');
let file = fs.readFileSync('src/App.tsx', 'utf8');

file = file.replace(
  /\<SalesAssistant \n         session=\{session\}\n         activeTab=\{activeTab\}\n         vendedorName=\{activeVendedorId === 'V1' \? 'HERNAN PAZ' : activeVendedorId === 'V2' \? 'CARLOS RUIZ' : 'Vendedor'\}\n      \/\>/g,
  `<SalesAssistant 
         session={session}
         activeTab={activeTab}
         vendedorName={activeVendedorId}
         onNavigate={(tab) => {
            if (['ACTIVACION_RUBRO', 'VOLUMEN', 'ACTIVACION_CLIENTES', 'COBROS_OCR'].includes(tab)) {
               setActiveTab(tab as any);
            }
         }}
      />`
);
fs.writeFileSync('src/App.tsx', file);
