import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React, { useMemo, useState } from 'react';
import { Target, Search, FileText, CheckCircle2, Droplets, Flame, Drumstick, Package as PkgIcon, Sparkles } from 'lucide-react';
import { VolumenData, ActivacionData } from '../types';
import { getMesLaboralInfo } from '../utils/calendar';

interface Props {
  filteredVolumen: VolumenData[];
  filteredActivacion: any[];
  metasActivacion?: any[];
  activeVendedorId: string;
}

interface CategoriaStats {
  categoria: string;
  meta: number;
  activados: number;
  faltante: number;
  cumplimiento: number;
  estCierre: number;
}

export const ActivacionRubro: React.FC<Props> = ({ filteredVolumen, filteredActivacion, metasActivacion, activeVendedorId }) => {
  
  const [searchTerm, setSearchTerm] = useState('');
  const mesInfo = useMemo(() => getMesLaboralInfo(), []);

  // Mapping categories to icons based on the new activation products
  const getIconForCategory = (cat: string) => {
    const c = (cat || '').toUpperCase();
    if (c.includes('ACEITE')) return <Droplets className="w-4 h-4 text-amber-500" />;
    if (c.includes('AZÚCAR') || c.includes('AZUCAR')) return <Flame className="w-4 h-4 text-rose-500" />;
    if (c.includes('POLLO')) return <Drumstick className="w-4 h-4 text-orange-400" />;
    if (c.includes('ESTANDAR') || c.includes('SUPERIOR')) return <PkgIcon className="w-4 h-4 text-emerald-500" />;
    if (c.includes('MORTADELA') || c.includes('SALPICAO')) return <Sparkles className="w-4 h-4 text-cyan-400" />;
    return <Target className="w-4 h-4 text-neutral-400" />;
  };

  const TARGET_CATEGORIES = [
    'ACEITE',
    'AZÚCAR',
    'POLLO',
    'ESTANDAR Y SUPERIOR ASTURIAS',
    'MORTADELA SALPICAO Y ASTURIAS'
  ];

  const normalizeCat = (cat: string) => {
    const c = (cat || '').toUpperCase();
    if (c.includes('ACEITE')) return 'ACEITE';
    if (c.includes('AZUCAR') || c.includes('AZÚCAR')) return 'AZÚCAR';
    if (c.includes('POLLO')) return 'POLLO';
    if (c.includes('ESTANDAR') || c.includes('SUPERIOR')) return 'ESTANDAR Y SUPERIOR ASTURIAS';
    if (c.includes('MORTADELA') || c.includes('SALPICAO')) return 'MORTADELA SALPICAO Y ASTURIAS';
    return c;
  };

  const categoriaStats: CategoriaStats[] = useMemo(() => {
    const countClientActivations = (cat: string) => {
      if (!filteredActivacion || filteredActivacion.length === 0) return 0;
      switch (cat) {
        case 'ACEITE': return filteredActivacion.filter(a => a.cats?.ACEITE).length;
        case 'AZÚCAR': return filteredActivacion.filter(a => a.cats?.AZUCAR).length;
        case 'POLLO': return filteredActivacion.filter(a => a.cats?.POLLO).length;
        case 'ESTANDAR Y SUPERIOR ASTURIAS': return filteredActivacion.filter(a => a.cats?.ESTANDAR_ASTURIAS).length;
        case 'MORTADELA SALPICAO Y ASTURIAS': return filteredActivacion.filter(a => a.cats?.MORTADELA_SALPICAO).length;
        default: return 0;
      }
    };

    if (metasActivacion && metasActivacion.length > 0) {
      const statsMap = new Map<string, { meta: number, activados: number }>();
      TARGET_CATEGORIES.forEach(c => statsMap.set(c, { meta: 0, activados: 0 }));

      metasActivacion.forEach(m => {
        const norm = normalizeCat(m.categoria);
        if (statsMap.has(norm)) {
          const curr = statsMap.get(norm)!;
          curr.meta += Number(m.meta) || 0;
          curr.activados += Number(m.activados) || 0;
        }
      });

      return TARGET_CATEGORIES.map(cat => {
        const d = statsMap.get(cat) || { meta: 0, activados: 0 };
        const clientAct = countClientActivations(cat);
        const meta = d.meta;
        // Si el grid tiene activados usa el grid, si tiene 0 o guion '-' usa el conteo real de clientes
        const activados = d.activados > 0 ? d.activados : clientAct;
        const faltante = Math.max(0, meta - activados);
        const cumplimiento = meta > 0 ? (activados / meta) * 100 : 0;
        const estCierre = mesInfo.elapsedWorkingDays > 0
          ? Math.round((activados / mesInfo.elapsedWorkingDays) * mesInfo.totalWorkingDays)
          : activados;
        return {
          categoria: cat,
          meta,
          activados,
          faltante,
          cumplimiento,
          estCierre
        };
      });
    }

    // Cálculo real directo de clientes si aún no han cargado las metas
    return TARGET_CATEGORIES.map(cat => {
      const activados = countClientActivations(cat);
      const meta = 0;
      return {
        categoria: cat,
        meta,
        activados,
        faltante: 0,
        cumplimiento: 0,
        estCierre: mesInfo.elapsedWorkingDays > 0
          ? Math.round((activados / mesInfo.elapsedWorkingDays) * mesInfo.totalWorkingDays)
          : activados
      };
    });
  }, [metasActivacion, activeVendedorId, mesInfo, filteredActivacion]);

  const filteredStats = categoriaStats.filter(c => 
    (c.categoria || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const totalMeta = categoriaStats.reduce((acc, curr) => acc + curr.meta, 0);
  const totalActivados = categoriaStats.reduce((acc, curr) => acc + curr.activados, 0);
  const totalFaltante = categoriaStats.reduce((acc, curr) => acc + curr.faltante, 0);
  const totalCumplimiento = totalMeta > 0 ? (totalActivados / totalMeta) * 100 : 0;
  
  const generarPDF = () => {
    const doc = new jsPDF();
    const title = "Reporte de Activación por Rubro";
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : (activeVendedorId || 'TODOS LOS VENDEDORES');
    doc.text(`Vendedor: ${vendedorName}`, 14, 22);
    
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

    doc.save(`Reporte_Activacion_Rubro_${vendedorName.replace(/\s+/g, '_')}.pdf`);
  };

  const totalEstCierre = categoriaStats.reduce((acc, curr) => acc + curr.estCierre, 0);

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: WIDGETS (CARDS) */}
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="w-5 h-5 text-red-600" />
        <h2 className="text-sm font-sans font-bold text-white uppercase tracking-wider">
          Rubros en Activación — Avance & Necesidad
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4 snap-x snap-mandatory overflow-x-auto scrollbar-hide pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {categoriaStats.map((stat, i) => {
          const isSuccess = stat.cumplimiento >= 100;
          return (
            <div key={i} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 flex flex-col min-w-[260px] sm:min-w-0 snap-start shrink-0">
              
              <div className="flex justify-between items-start mb-3">
                <div className={`p-2 rounded-lg border ${isSuccess ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-amber-900/50 bg-amber-950/20'}`}>
                  {getIconForCategory(stat.categoria)}
                </div>
                <div className={`text-xs font-mono font-bold px-2 py-1 rounded border ${
                  isSuccess ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-amber-900/50 bg-amber-950/40 text-amber-400'
                }`}>
                  {stat.cumplimiento.toFixed(0)}%
                </div>
              </div>

              <h3 className="text-sm font-sans font-bold text-white uppercase tracking-wider mb-2">{stat.categoria}</h3>
              
              <div className="text-3xl md:text-4xl font-mono text-white font-bold tracking-tight mb-4">
                {stat.activados} <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal">/ {stat.meta} CLI</span>
              </div>

              <div className="w-full bg-neutral-900 rounded-full h-1.5 mb-4 overflow-hidden">
                <div 
                  className={`h-full rounded-full ${isSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                  style={{ width: `${Math.min(100, stat.cumplimiento)}%` }}
                ></div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-auto">
                <div className="bg-neutral-900/50 rounded-lg p-2 border border-neutral-800/50">
                   <div className="text-[9px] md:text-[10px] font-sans text-neutral-500 uppercase tracking-wider mb-1">Faltan</div>
                   <div className={`text-xs md:text-sm font-mono font-bold ${stat.faltante === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                     {stat.faltante === 0 ? '¡Meta!' : `${stat.faltante} cli`}
                   </div>
                </div>
                <div className="bg-neutral-900/50 rounded-lg p-2 border border-neutral-800/50">
                   <div className="text-[9px] md:text-[10px] font-sans text-neutral-500 uppercase tracking-wider mb-1">Ritmo Req.</div>
                   <div className="text-xs md:text-sm font-mono font-bold text-amber-400">
                     {stat.faltante === 0 ? '0/d' : `${(stat.faltante / Math.max(1, mesInfo.remainingWorkingDays)).toFixed(1)}/d`}
                   </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* SECTION 2: DATA TABLE */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden mt-6 flex flex-col">
        
        {/* Table Header / Controls */}
        <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-red-600 p-1.5 rounded">
               <FileText className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-sans font-bold text-white uppercase tracking-wider">
              Activación por Categoría
            </h2>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
             <div className="relative flex-1 sm:flex-none">
               <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
               <input 
                 type="text" 
                 placeholder="Buscar categoría..." 
                 className="w-full sm:w-64 bg-neutral-900 border border-neutral-800 text-sm font-sans text-white rounded-full pl-9 pr-4 py-2 min-h-[44px] sm:min-h-[36px] focus:outline-none focus:border-neutral-600 transition-colors"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
             <button onClick={generarPDF} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-full hover:bg-red-700 transition-colors">
               <FileText className="w-3.5 h-3.5" /> PDF
             </button>
          </div>
        </div>

        {/* Responsive Table Wrapper */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-neutral-900/50 border-b border-neutral-800 text-[10px] md:text-xs font-sans text-neutral-400 uppercase tracking-wider">
                <th className="p-3 md:p-4 text-center w-12 border-r border-neutral-800">#</th>
                <th className="p-3 md:p-4 font-bold text-white border-r border-neutral-800">Categoría</th>
                <th className="p-3 md:p-4 text-center border-r border-neutral-800">Meta</th>
                <th className="p-3 md:p-4 text-center text-emerald-400 border-r border-neutral-800">Activados</th>
                <th className="p-3 md:p-4 text-center text-red-400 border-r border-neutral-800">Faltante</th>
                <th className="p-3 md:p-4 text-center border-r border-neutral-800">% Cumpl.</th>
                <th className="p-3 md:p-4 border-r border-neutral-800">Estado</th>
                <th className="p-3 md:p-4 text-center text-amber-400">Est. Cierre</th>
              </tr>
            </thead>
            <tbody className="text-xs md:text-sm font-mono text-neutral-300">
              {filteredStats.map((stat, idx) => {
                 const isSuccess = stat.cumplimiento >= 100;
                 return (
                  <tr key={stat.categoria} className="border-b border-neutral-800 hover:bg-neutral-900/50 transition-colors">
                    <td className="p-3 md:p-4 text-center border-r border-neutral-800 text-neutral-500">{idx + 1}</td>
                    <td className="p-3 md:p-4 font-sans font-bold text-white border-r border-neutral-800">{stat.categoria}</td>
                    <td className="p-3 md:p-4 text-center border-r border-neutral-800">{stat.meta}</td>
                    <td className="p-3 md:p-4 text-center text-emerald-400 font-bold border-r border-neutral-800">{stat.activados}</td>
                    <td className="p-3 md:p-4 text-center border-r border-neutral-800">{stat.faltante}</td>
                    <td className="p-3 md:p-4 text-center border-r border-neutral-800">
                      <span className={`px-2 py-1 rounded border ${isSuccess ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-amber-900/50 bg-amber-950/40 text-amber-400'}`}>
                        {stat.cumplimiento.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 md:p-4 font-sans border-r border-neutral-800">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                        <span className={isSuccess ? 'text-emerald-400' : 'text-amber-400'}>
                          {isSuccess ? 'Cumplido (≥100%)' : 'En Riesgo (80%-99%)'}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 md:p-4 text-center font-bold text-amber-400">
                      {stat.estCierre} cli
                    </td>
                  </tr>
                 );
              })}

              {/* TFOOT / TOTALS ROW */}
              <tr className="bg-red-950/10 border-t-2 border-red-900/50 font-bold">
                <td className="p-3 md:p-4 text-center text-red-500 border-r border-neutral-800">Σ</td>
                <td className="p-3 md:p-4 font-sans text-red-400 border-r border-neutral-800">TOTALES GENERALES</td>
                <td className="p-3 md:p-4 text-center border-r border-neutral-800">{totalMeta}</td>
                <td className="p-3 md:p-4 text-center text-emerald-400 border-r border-neutral-800">{totalActivados}</td>
                <td className="p-3 md:p-4 text-center border-r border-neutral-800">{totalFaltante}</td>
                <td className="p-3 md:p-4 text-center border-r border-neutral-800">
                  <span className={`px-2 py-1 rounded border ${totalCumplimiento >= 100 ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-amber-900/50 bg-amber-950/40 text-amber-400'}`}>
                    {totalCumplimiento.toFixed(1)}%
                  </span>
                </td>
                <td className="p-3 md:p-4 font-sans border-r border-neutral-800">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${totalCumplimiento >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                    <span className={totalCumplimiento >= 100 ? 'text-emerald-400' : 'text-amber-400'}>
                      {totalCumplimiento >= 100 ? 'Cumplido (≥100%)' : 'En Riesgo'}
                    </span>
                  </div>
                </td>
                <td className="p-3 md:p-4 text-center text-amber-400">
                  {totalEstCierre} cli
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="bg-neutral-900/30 p-3 md:p-4 flex justify-between items-center text-[10px] md:text-xs font-sans text-neutral-500 border-t border-neutral-800">
           <div>Vendedor mostrado: <span className="text-white font-bold">{activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId}</span> <span className="ml-2 md:ml-4">Avance Mes: <strong className="text-white">{mesInfo.elapsedWorkingDays} de {mesInfo.totalWorkingDays} días hábiles</strong> ({mesInfo.percentage}%)</span></div>
           <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Grid de Datos Sincronizado
           </div>
        </div>

      </div>
    </div>
  );
};
