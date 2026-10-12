import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React, { useMemo, useState } from 'react';
import { Package, TrendingUp, Target, CalendarDays, Crosshair, LayoutGrid, Search, FileText, User } from 'lucide-react';
import { VolumenData } from '../types';
import { getMesLaboralInfo } from '../utils/calendar';

interface Props {
  filteredVolumen: VolumenData[];
  activeVendedorId: string;
}

interface SkuStats {
  skuId: string;
  articulo: string;
  meta: number;
  ejecutado: number;
  cumplimiento: number;
}

export const VolumenTab: React.FC<Props> = ({ filteredVolumen, activeVendedorId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'focus' | 'hoja' | 'tarjetas'>('hoja');

  // In a real scenario, meta could be higher, using static multiplier to match the design vibe 
  // since the mock data is too small to look like the 50k+ numbers in the screenshot.
  const rawMeta = filteredVolumen.reduce((acc, curr) => acc + curr.meta, 0);
  const rawEjecutado = filteredVolumen.reduce((acc, curr) => acc + curr.ejecutado, 0);
  
  // Scaling mock data to look like the screenshot if it's less than 10k
  const scaleFactor = 1; 
  
  const totalMeta = Math.round(rawMeta * scaleFactor);
  
  const generarPDF = () => {
    const doc = new jsPDF();
    const title = "Reporte de Volumen";
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId;
    doc.text(`Vendedor: ${vendedorName}`, 14, 22);
    
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

    doc.save(`Reporte_Volumen_${vendedorName.replace(/\s+/g, '_')}.pdf`);
  };

  const totalEjecutado = Math.round(rawEjecutado * scaleFactor);
  
  const cumplimiento = totalMeta > 0 ? (totalEjecutado / totalMeta) * 100 : 0;
  const faltante = Math.max(0, totalMeta - totalEjecutado);
  const mesInfo = useMemo(() => getMesLaboralInfo(), []);
  const diasRestantes = mesInfo.remainingWorkingDays;
  const diasTranscurridos = mesInfo.elapsedWorkingDays;
  const diasTotales = mesInfo.totalWorkingDays;
  const avanceTiempo = mesInfo.percentage;
  
  // Proyeccion cierre = (Ejecutado / dias transcurridos) * dias totales
  const proyeccion = diasTranscurridos > 0 ? Math.round((totalEjecutado / diasTranscurridos) * diasTotales) : totalEjecutado;
  const ritmoRequerido = diasRestantes > 0 ? Math.round(faltante / diasRestantes) : 0;

  const formatNumber = (num: number) => num.toLocaleString('en-US');

  // Aggregating SKU data
  const skuStats: SkuStats[] = useMemo(() => {
    const map = new Map<string, SkuStats>();
    
    // Helper to simulate article names since mock data only has IDs
    const getArticuloName = (sku: string) => {
       if (sku === 'SKU001') return 'JUGOS VARIOS';
       if (sku === 'SKU002') return 'LECHE EN POLVO VENCAMPO';
       if (sku === 'SKU003') return 'SALCHICHA VIENA ALIMEX 16 X 450 GRS';
       if (sku === 'SKU004') return 'MORTADELA ESP. CARACAS 10X900GRS';
       return `PRODUCTO GENÉRICO ${sku}`;
    };

    filteredVolumen.forEach(v => {
      // Mock some GEN- prefixes to match screenshot styling
      const displaySku = v.skuId;
      
      if (!map.has(displaySku)) {
        map.set(displaySku, {
          skuId: displaySku,
          articulo: v.articulo || getArticuloName(v.skuId),
          meta: 0,
          ejecutado: 0,
          cumplimiento: 0
        });
      }
      
      const stat = map.get(displaySku)!;
      stat.meta += v.meta;
      stat.ejecutado += v.ejecutado;
    });

    return Array.from(map.values()).map(s => {
      // Scale up to match screenshot numbers
      s.meta = Math.round(s.meta * scaleFactor);
      s.ejecutado = Math.round(s.ejecutado * scaleFactor);
      s.cumplimiento = s.meta > 0 ? (s.ejecutado / s.meta) * 100 : 0;
      return s;
    }).sort((a, b) => b.ejecutado - a.ejecutado); // Sort descending by executed
  }, [filteredVolumen]);

  // Apply search filter
  let filteredSkuStats = skuStats.filter(stat => 
    (stat.skuId || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
    (stat.articulo || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );
  if (viewMode === 'focus') {
    filteredSkuStats = filteredSkuStats.filter(stat => stat.cumplimiento < 100);
  }

  return (
    <div className="space-y-6">
      
      {/* 4-CARD WIDGET BLOCK - Responsive Scroll on Mobile */}
      <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 gap-3 md:gap-4 md:grid md:grid-cols-2 xl:grid-cols-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        
        {/* CARD 1: META TOTAL */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 flex flex-col min-w-[280px] sm:min-w-0 snap-start shrink-0">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider mt-1">Meta Total (KG)</h3>
            <div className="bg-red-950/30 border border-red-900/50 p-2 rounded-lg">
              <Package className="w-4 h-4 md:w-5 md:h-5 text-red-500" />
            </div>
          </div>
          
          <div className="mt-2 md:mt-4 mb-4">
            <div className="text-3xl md:text-4xl font-mono text-amber-400 font-bold tracking-tight">
              {formatNumber(totalMeta)} <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal">KG</span>
            </div>
          </div>

          <div className="mt-auto border-t border-neutral-800/60 pt-3 flex justify-between items-center">
            <span className="text-[10px] md:text-xs font-sans text-neutral-400">Objetivo mensual</span>
            <div className="bg-neutral-900 border border-neutral-800 px-2 py-1 rounded text-[10px] md:text-xs font-mono font-bold text-neutral-300">
              {diasTotales} días h.
            </div>
          </div>
        </div>

        {/* CARD 2: VOLUMEN EJECUTADO */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 flex flex-col min-w-[280px] sm:min-w-0 snap-start shrink-0">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider mt-1">Volumen Ejecutado (KG)</h3>
            <div className="bg-emerald-950/20 border border-emerald-900/30 p-2 rounded-lg">
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
            </div>
          </div>
          
          <div className="mt-2 md:mt-4 mb-4">
            <div className="text-3xl md:text-4xl font-mono text-white font-bold tracking-tight">
              {formatNumber(totalEjecutado)} <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal">KG</span>
            </div>
          </div>

          <div className="mt-auto">
            <div className="flex justify-between items-end mb-2">
              <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-mono font-bold px-2 py-1 rounded">
                {cumplimiento.toFixed(1)}%
              </div>
              <div className="text-[10px] md:text-xs font-sans text-neutral-400 font-bold">
                Falta: <span className="text-red-400">{formatNumber(faltante)} kg</span>
              </div>
            </div>
            <div className="w-full bg-neutral-900 rounded-full h-1.5 md:h-2 overflow-hidden border border-neutral-800">
              <div className="bg-red-500 h-full rounded-full" style={{ width: `${Math.min(100, cumplimiento)}%` }}></div>
            </div>
          </div>
        </div>

        {/* CARD 3: PROYECCIÓN CIERRE */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 flex flex-col min-w-[280px] sm:min-w-0 snap-start shrink-0">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xs md:text-sm font-sans font-bold text-white uppercase tracking-wider mt-1">Proyección Cierre</h3>
            <div className="bg-amber-950/20 border border-amber-900/30 p-2 rounded-lg">
              <Target className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
            </div>
          </div>
          
          <div className="mt-2 md:mt-4 mb-4">
            <div className="text-3xl md:text-4xl font-mono text-white font-bold tracking-tight">
              {formatNumber(proyeccion)} <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal">KG EST.</span>
            </div>
            <div className="text-[10px] md:text-xs font-sans font-bold text-amber-500 mt-1">
              Día {diasTranscurridos}/{diasTotales}
            </div>
          </div>

          <div className="mt-auto border-t border-neutral-800/60 pt-3 flex justify-between items-center">
            <span className="text-[10px] md:text-xs font-sans font-bold text-amber-500">Avance tiempo:</span>
            <span className="text-[10px] md:text-xs font-sans font-bold text-amber-500">Día {diasTranscurridos}/{diasTotales} ({avanceTiempo.toFixed(0)}%)</span>
          </div>
        </div>

        {/* CARD 4: META DIARIA REQUERIDA */}
        <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-xl p-4 md:p-5 flex flex-col min-w-[280px] sm:min-w-0 snap-start shrink-0 relative overflow-hidden">
          {/* Subtle background glow effect for emphasis */}
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-900/20 rounded-full blur-2xl"></div>
          
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-xs md:text-sm font-sans font-bold text-emerald-400 uppercase tracking-wider mt-1 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Meta Diaria<br/>Requerida
            </h3>
            <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 text-xs font-mono font-bold px-3 py-1 rounded-full">
              {diasRestantes}d rest.
            </div>
          </div>
          
          <div className="mt-2 md:mt-4 mb-4 relative z-10">
            <div className="text-3xl md:text-4xl font-mono text-emerald-400 font-bold tracking-tight">
              {formatNumber(ritmoRequerido)} <span className="text-xs md:text-sm text-white font-sans font-bold">KG/DÍA</span>
            </div>
            <div className="text-[10px] md:text-xs font-sans text-neutral-400 mt-1">
              Faltan <span className="text-amber-400 font-bold">{formatNumber(faltante)} kg</span> en {diasRestantes} días hábiles.
            </div>
          </div>

          <div className="mt-auto border-t border-emerald-900/30 pt-3 flex justify-between items-center relative z-10">
            <span className="text-[9px] md:text-[10px] font-sans text-neutral-400 max-w-[120px] leading-tight">
              Ritmo diario necesario para el 100% de la cuota
            </span>
            <div className="bg-emerald-950/50 border border-emerald-800/50 px-2 py-1 rounded-full flex items-center gap-1.5 shrink-0">
              <Crosshair className="w-3 h-3 text-rose-400" />
              <span className="text-[9px] md:text-[10px] font-sans font-bold text-emerald-400">Meta Requerida</span>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 2: VOLUMEN POR SKU (Hybrid Layout) */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden mt-6 flex flex-col">
        {/* Header / Controls */}
        <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="bg-red-600 p-1.5 rounded">
                <LayoutGrid className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-base font-sans font-bold text-white uppercase tracking-wider">
                Volumen por SKU
              </h2>
            </div>
            <p className="text-[10px] md:text-xs font-sans text-neutral-400">
              Vista individual por usuario. Columnas idénticas a Google Sheets: <strong className="text-neutral-300">Cod | Articulo | CUOTA | KG | %</strong>.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
             <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shrink-0">
                 <button onClick={() => setViewMode('focus')} className={`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors border-r ${viewMode === 'focus' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}`}>Modo Focus</button>
                 <button onClick={() => setViewMode('hoja')} className={`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors border-r ${viewMode === 'hoja' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}`}>Hoja Vendedor</button>
                 <button onClick={() => setViewMode('tarjetas')} className={`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors ${viewMode === 'tarjetas' ? 'font-bold text-white bg-red-600' : 'text-neutral-400 hover:text-white'}`}>Tarjetas</button>
             </div>
             
             <div className="flex items-center gap-2 w-full sm:w-auto">
                 <div className="relative flex-1 sm:flex-none">
                     <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                     <input 
                         type="text" 
                         placeholder="Filtrar SKU (ej: 1401)..." 
                         className="w-full sm:w-56 md:w-64 bg-neutral-900 border border-neutral-800 text-sm font-sans text-white rounded-full pl-9 pr-4 py-2 min-h-[44px] sm:min-h-[36px] focus:outline-none focus:border-neutral-600 transition-colors"
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                     />
                 </div>
                 <button onClick={generarPDF} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-full hover:bg-red-700 transition-colors">
                     <FileText className="w-3.5 h-3.5" /> PDF
                 </button>
             </div>
          </div>
        </div>

        {/* User Summary Bar */}
        <div className="bg-black border-y border-neutral-800 p-4 flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="border border-red-900/50 bg-red-950/20 p-1.5 rounded-full">
              <User className="w-4 h-4 text-red-500" />
            </div>
            <span className="text-xs font-sans font-bold text-neutral-500 uppercase tracking-widest hidden sm:inline">Usuario:</span>
            <div className="bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg text-sm font-sans font-bold text-white uppercase tracking-wide">
              {activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId}
            </div>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-6 divide-x divide-neutral-800">
            <div className="text-right">
              <div className="text-[9px] font-sans text-neutral-500 uppercase tracking-wider mb-1">Cuota Total</div>
              <div className="text-sm md:text-base font-mono font-bold text-neutral-300">{formatNumber(totalMeta)}</div>
            </div>
            <div className="text-right pl-4 sm:pl-6">
              <div className="text-[9px] font-sans text-neutral-500 uppercase tracking-wider mb-1">Ejecutado</div>
              <div className="text-sm md:text-base font-mono font-bold text-emerald-400">
                {formatNumber(totalEjecutado)} <span className="text-[10px] text-neutral-500 font-sans font-normal">KG</span>
              </div>
            </div>
            <div className="text-right pl-4 sm:pl-6">
              <div className="text-[9px] font-sans text-neutral-500 uppercase tracking-wider mb-1">Avance</div>
              <div className={`px-2 py-0.5 rounded border text-[10px] md:text-xs font-mono font-bold ${cumplimiento >= 100 ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-red-900/50 bg-red-950/40 text-red-400'}`}>
                {cumplimiento.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        {/* DESKTOP VIEW: Data Table (Hidden on small screens) */}
        {viewMode !== 'tarjetas' && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-red-700 border-b border-red-800 text-[10px] font-sans text-white uppercase tracking-wider">
                <th className="p-3 font-bold border-r border-red-800">Cod</th>
                <th className="p-3 font-bold border-r border-red-800">Articulo</th>
                <th className="p-3 font-bold text-right border-r border-red-800">Cuota</th>
                <th className="p-3 font-bold text-right border-r border-red-800">KG</th>
                <th className="p-3 font-bold text-right">%</th>
              </tr>
            </thead>
            <tbody className="text-xs font-mono text-neutral-300">
              {filteredSkuStats.map((stat, idx) => {
                const isSuccess = stat.cumplimiento >= 100;
                // Alternate row background slightly for readability
                const bgClass = idx % 2 === 0 ? 'bg-transparent' : 'bg-neutral-900/20';
                
                return (
                  <tr key={`${stat.skuId}-${idx}`} className={`${bgClass} border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors`}>
                    <td className="p-3 border-r border-neutral-800/50 text-red-500 font-bold">{stat.skuId}</td>
                    <td className="p-3 border-r border-neutral-800/50 font-sans font-bold text-white uppercase">{stat.articulo}</td>
                    <td className="p-3 border-r border-neutral-800/50 text-right text-neutral-400">{formatNumber(stat.meta)}</td>
                    <td className="p-3 border-r border-neutral-800/50 text-right text-white font-bold">{stat.ejecutado === 0 ? '-' : formatNumber(stat.ejecutado)}</td>
                    <td className="p-3 text-right">
                      <span className={`inline-block px-2 py-1 rounded border text-[10px] font-bold ${isSuccess ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-red-900/50 bg-red-950/40 text-red-400'}`}>
                        {stat.cumplimiento.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
              
              {/* TFOOT / TOTALS */}
              <tr className="border-t border-neutral-700 bg-neutral-900/30">
                <td className="p-3 border-r border-neutral-800/50 text-red-500 font-bold uppercase">Total</td>
                <td className="p-3 border-r border-neutral-800/50 font-sans font-bold text-white uppercase tracking-wider">Resumen Acumulado Vendedor</td>
                <td className="p-3 border-r border-neutral-800/50 text-right text-white font-bold">{formatNumber(totalMeta)}</td>
                <td className="p-3 border-r border-neutral-800/50 text-right text-emerald-400 font-bold">{formatNumber(totalEjecutado)}</td>
                <td className="p-3 text-right text-red-400 font-bold">{cumplimiento.toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
        {/* MOBILE VIEW: Vertical Cards (Visible only on small screens) */}
        <div className={`flex flex-col p-3 gap-3 bg-neutral-950 ${viewMode === 'tarjetas' ? 'block' : 'md:hidden'}`}>
           <div className="text-[10px] font-sans text-neutral-500 uppercase tracking-wider mb-1 px-1">Desglose de Artículos</div>
           
           {filteredSkuStats.length === 0 && (
              <div className="text-center py-6 text-neutral-500 text-sm font-sans">No se encontraron artículos.</div>
           )}

           {filteredSkuStats.map((stat, idx) => {
               const isSuccess = stat.cumplimiento >= 100;
               return (
                   <div key={`${stat.skuId}-${idx}`} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                       <div className="flex justify-between items-center mb-2">
                           <span className="text-red-500 font-mono text-xs font-bold">{stat.skuId}</span>
                           <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${isSuccess ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-red-900/50 bg-red-950/40 text-red-400'}`}>
                               {stat.cumplimiento.toFixed(2)}%
                           </span>
                       </div>
                       
                       <h4 className="text-white font-sans text-xs sm:text-sm font-bold mb-3 uppercase leading-tight">
                         {stat.articulo}
                       </h4>
                       
                       <div className="flex justify-between items-center border-t border-neutral-800 pt-2 mt-2">
                           <div>
                               <div className="text-[9px] text-neutral-500 uppercase tracking-wider">Cuota (KG)</div>
                               <div className="text-neutral-400 font-mono text-xs mt-0.5">{formatNumber(stat.meta)}</div>
                           </div>
                           <div className="text-right">
                               <div className="text-[9px] text-neutral-500 uppercase tracking-wider">Ejecutado</div>
                               <div className="text-white font-mono text-xs font-bold mt-0.5">{stat.ejecutado === 0 ? '-' : formatNumber(stat.ejecutado)}</div>
                           </div>
                       </div>
                   </div>
               );
           })}
        </div>

      </div>

    </div>
  );
};
