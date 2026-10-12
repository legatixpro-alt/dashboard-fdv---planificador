const fs = require('fs');

let content = fs.readFileSync('src/components/ActivacionClientes.tsx', 'utf8');

if (!content.includes("import jsPDF")) {
    content = content.replace("import React", "import jsPDF from 'jspdf';\nimport autoTable from 'jspdf-autotable';\nimport React");
}

const functionStr = `
  const generarPDF = () => {
    const doc = new jsPDF();
    const title = "Reporte de Activación por Cliente";
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId;
    doc.text(\`Vendedor: \${vendedorName}\`, 14, 22);
    
    const tableData = clientList.map((client) => [
      client.codigo,
      client.razonSocial,
      client.hasAceite ? 'SI' : '-',
      client.hasAzucar ? 'SI' : '-',
      client.hasArroz ? 'SI' : '-',
      client.hasEntero ? 'SI' : '-',
      client.hasLigeros ? 'SI' : '-',
      \`\${client.cobertura}/5 (\${client.cobertura * 20}%)\`
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Codigo', 'Razon Social', 'Aceite', 'Azucar', 'Arroz', 'Enteros KG', 'Ligeros', 'Cobertura']],
      body: tableData,
      headStyles: { fillColor: [211, 47, 47] },
      theme: 'grid'
    });

    doc.save(\`Reporte_Clientes_\${vendedorName.replace(/\\s+/g, '_')}.pdf\`);
  };
`;

if (!content.includes('const generarPDF = () => {')) {
    content = content.replace(/const totalMockCartera = /g, functionStr + "\n  const totalMockCartera = ");
}

const oldHeader = `<div className="p-4 md:p-5 border-b border-neutral-800 flex items-center gap-2">
           <LayoutList className="w-4 h-4 text-white bg-red-600 p-1 box-content rounded" />
           <h2 className="text-base font-sans font-bold text-white uppercase tracking-wider">
             Detalle de Cobertura por Cliente
           </h2>
         </div>`;

const newHeader = `<div className="p-4 md:p-5 border-b border-neutral-800 flex items-center justify-between gap-4">
           <div className="flex items-center gap-2">
             <LayoutList className="w-4 h-4 text-white bg-red-600 p-1 box-content rounded" />
             <h2 className="text-base font-sans font-bold text-white uppercase tracking-wider">
               Detalle de Cobertura por Cliente
             </h2>
           </div>
           <button onClick={generarPDF} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-full hover:bg-red-700 transition-colors">
             <FileText className="w-3.5 h-3.5" /> PDF
           </button>
         </div>`;

content = content.replace(oldHeader, newHeader);

// In case the FileText import is missing, add it to lucide-react if necessary.
if (!content.includes("FileText")) {
    content = content.replace("CheckCircle2, AlertTriangle, LayoutList", "CheckCircle2, AlertTriangle, LayoutList, FileText");
}

fs.writeFileSync('src/components/ActivacionClientes.tsx', content);
