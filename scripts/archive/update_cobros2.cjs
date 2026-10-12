const fs = require('fs');
let content = fs.readFileSync('src/components/CobrosOCR.tsx', 'utf8');

const oldLogic = `onClick={() => {
                     // Lógica para enviar a cuentas por cobrar
                     setAlertMsg({ type: 'success', text: 'Relación enviada a Cuentas por Cobrar con éxito.' });
                     setPagosConsolidados([]);
                  }}`;
                  
const newLogic = `onClick={() => {
                     const totalMonto = pagosConsolidados.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);
                     const nuevaRelacion = {
                        id: \`rel-\${Date.now()}\`,
                        fecha: new Date().toISOString(),
                        vendedor: currentVendedor,
                        cantidadPagos: pagosConsolidados.length,
                        montoTotal: totalMonto,
                        pagos: [...pagosConsolidados]
                     };
                     setHistorialRelaciones(prev => [nuevaRelacion, ...prev]);
                     setAlertMsg({ type: 'success', text: 'Relación enviada a Cuentas por Cobrar con éxito.' });
                     setPagosConsolidados([]);
                  }}`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('src/components/CobrosOCR.tsx', content);
