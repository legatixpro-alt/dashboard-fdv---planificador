const fs = require('fs');

let content = fs.readFileSync('src/components/ActivacionRubro.tsx', 'utf8');

if (!content.includes("import jsPDF")) {
    content = content.replace("import React", "import jsPDF from 'jspdf';\nimport autoTable from 'jspdf-autotable';\nimport React");
}

const functionStr = `
  const generarPDF = () => {
    const doc = new jsPDF();
    const title = "Reporte de Activación por Rubro";
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : (activeVendedorId || 'TODOS LOS VENDEDORES');
    doc.text(\`Vendedor: \${vendedorName}\`, 14, 22);
    
    const tableData = filteredStats.map((stat, idx) => [
      (idx + 1).toString(),
      stat.categoria,
      stat.meta.toString(),
      stat.activados.toString(),
      stat.faltante.toString(),
      stat.cumplimiento.toFixed(2) + '%',
      stat.estCierre.toString()
    ]);
    
    tableData.push([
      '',
      'TOTAL',
      totalMeta.toString(),
      totalActivados.toString(),
      totalFaltante.toString(),
      totalCumplimiento.toFixed(2) + '%',
      totalEstCierre.toString()
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['#', 'Categoría', 'Meta', 'Activados', 'Faltante', '% Cumpl.', 'Est. Cierre']],
      body: tableData,
      headStyles: { fillColor: [211, 47, 47] },
      theme: 'grid'
    });

    doc.save(\`Reporte_Activacion_Rubro_\${vendedorName.replace(/\\s+/g, '_')}.pdf\`);
  };
`;

if (!content.includes('const generarPDF = () => {')) {
    content = content.replace(/const totalEstCierre = /g, functionStr + "\n  const totalEstCierre = ");
}

content = content.replace(/<button className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-\[44px\] sm:min-h-\[36px\] rounded-full hover:bg-red-700 transition-colors">/g, `<button onClick={generarPDF} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-full hover:bg-red-700 transition-colors">`);

// Also fix hardcoded HERNAN PAZ in Footer
content = content.replace(/Vendedor mostrado: <span className="text-white font-bold">HERNAN PAZ<\/span>/g, `Vendedor mostrado: <span className="text-white font-bold">{activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId}</span>`);


fs.writeFileSync('src/components/ActivacionRubro.tsx', content);
