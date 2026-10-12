const fs = require('fs');

let content = fs.readFileSync('src/components/VolumenTab.tsx', 'utf8');

if (!content.includes("import jsPDF")) {
    content = content.replace("import React", "import jsPDF from 'jspdf';\nimport autoTable from 'jspdf-autotable';\nimport React");
}

const functionStr = `
  const generarPDF = () => {
    const doc = new jsPDF();
    const title = "Reporte de Volumen";
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    const vendedorName = filteredVolumen.length > 0 && filteredVolumen[0].vendedorId ? filteredVolumen[0].vendedorId : 'TODOS LOS VENDEDORES';
    doc.text(\`Vendedor: \${vendedorName}\`, 14, 22);
    
    const tableData = filteredSkuStats.map(stat => [
      stat.skuId,
      stat.articulo,
      formatNumber(stat.meta),
      formatNumber(stat.ejecutado),
      stat.cumplimiento.toFixed(2) + '%'
    ]);
    
    tableData.push([
      'TOTAL',
      '',
      formatNumber(totalMeta),
      formatNumber(totalEjecutado),
      cumplimiento.toFixed(2) + '%'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Cod', 'Articulo', 'Cuota (KG)', 'Ejecutado (KG)', '%']],
      body: tableData,
      headStyles: { fillColor: [211, 47, 47] },
      theme: 'grid'
    });

    doc.save(\`Reporte_Volumen_\${vendedorName.replace(/\\s+/g, '_')}.pdf\`);
  };
`;

content = content.replace(/const totalEjecutado = \[.*?\];/s, (match) => match); // just finding anchor

// Better anchor:
if (!content.includes('const generarPDF = () => {')) {
    content = content.replace(/const totalEjecutado = /g, functionStr + "\n  const totalEjecutado = ");
}

content = content.replace(/<button className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-\[44px\] sm:min-h-\[36px\] rounded-full hover:bg-red-700 transition-colors">/g, `<button onClick={generarPDF} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-full hover:bg-red-700 transition-colors">`);

fs.writeFileSync('src/components/VolumenTab.tsx', content);
