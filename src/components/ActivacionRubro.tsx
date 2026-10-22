import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React, { useMemo, useRef, useState } from 'react';
import { Target, Search, FileText, CheckCircle2, Droplets, Flame, Drumstick, Package as PkgIcon, Sparkles, CheckSquare, Square, Activity } from 'lucide-react';
import { VolumenData, ActivacionData } from '../types';
import { getMesLaboralInfo } from '../utils/calendar';
import { RubroCodigo, RUBROS_ACTIVACION } from '../lib/rubros';
import { categoryToRubroCode } from '../services/historialService';
import { Rubro360Panel, RubroStatsActual } from './Rubro360Panel';

interface Props {
  filteredVolumen: VolumenData[];
  filteredActivacion: any[];
  metasActivacion?: any[];
  activeVendedorId: string;
  vendedorFilter?: string;
}

interface CategoriaStats {
  categoria: string;
  meta: number;
  activados: number;
  faltante: number;
  cumplimiento: number;
  estCierre: number;
}

export const ActivacionRubro: React.FC<Props> = ({ filteredVolumen, filteredActivacion, metasActivacion, activeVendedorId, vendedorFilter }) => {
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRubros, setSelectedRubros] = useState<RubroCodigo[]>([]);
  const dashboard360Ref = useRef<HTMLDivElement | null>(null);
  const mesInfo = useMemo(() => getMesLaboralInfo(), []);

  const handleToggleRubro = (catOrCode: string | RubroCodigo, scrollToPanel = false) => {
    const code = categoryToRubroCode(catOrCode);
    setSelectedRubros((prev) => {
      const yaEsta = prev.includes(code);
      const next = (yaEsta ? prev.filter((r) => r !== code) : [...prev, code]).sort(
        (a, b) => RUBROS_ACTIVACION.indexOf(a as any) - RUBROS_ACTIVACION.indexOf(b as any)
      );
      if (!yaEsta && scrollToPanel) {
        setTimeout(() => {
          dashboard360Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }
      return next;
    });
  };

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
    let manualMap: Record<string, any> = {};
    try {
      const raw = localStorage.getItem('fdv_manual_rubros_v1');
      if (raw) manualMap = JSON.parse(raw) || {};
    } catch {}

    const countClientActivations = (cat: string) => {
      if (!filteredActivacion || filteredActivacion.length === 0) return 0;
      const activeSet = new Set<string>();
      for (const a of filteredActivacion) {
        const key = a.id ? String(a.id).replace(/^[#\s]+/, '').trim() : String(a.cliente || '').trim();
        if (!key) continue;
        const ov = manualMap[key];
        let isActive = false;
        switch (cat) {
          case 'ACEITE':
            isActive = ov?.ACEITE !== undefined ? Boolean(ov.ACEITE) : Boolean(a.cats?.ACEITE || (Number(a.cajas?.ACEITE) || 0) > 0);
            break;
          case 'AZÚCAR':
            isActive = ov?.AZUCAR !== undefined ? Boolean(ov.AZUCAR) : Boolean(a.cats?.AZUCAR || a.cats?.AZÚCAR || (Number(a.cajas?.AZUCAR) || 0) > 0);
            break;
          case 'POLLO':
            isActive = ov?.POLLO !== undefined ? Boolean(ov.POLLO) : Boolean(a.cats?.POLLO || a.cats?.ARROZ || (Number(a.cajas?.POLLO) || 0) > 0);
            break;
          case 'ESTANDAR Y SUPERIOR ASTURIAS':
            isActive = ov?.ESTANDAR_ASTURIAS !== undefined ? Boolean(ov.ESTANDAR_ASTURIAS) : Boolean(a.cats?.ESTANDAR_ASTURIAS || a.cats?.ENTERO || (Number(a.cajas?.ESTANDAR_ASTURIAS) || 0) > 0);
            break;
          case 'MORTADELA SALPICAO Y ASTURIAS':
            isActive = ov?.MORTADELA_SALPICAO !== undefined ? Boolean(ov.MORTADELA_SALPICAO) : Boolean(a.cats?.MORTADELA_SALPICAO || a.cats?.LIGEROS || (Number(a.cajas?.MORTADELA_SALPICAO) || 0) > 0);
            break;
        }
        if (isActive) activeSet.add(key);
        else if (ov) activeSet.delete(key);
      }
      return activeSet.size;
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : (activeVendedorId || 'TODOS LOS VENDEDORES');
    const fechaEmision = new Date().toLocaleDateString('es-VE');
    const periodoLabel = `${mesInfo.monthName.toUpperCase()} ${mesInfo.year}`;
    const diasRestantesMes = Math.max(1, mesInfo.remainingWorkingDays);
    const totalEstCierreVal = categoriaStats.reduce((acc, curr) => acc + curr.estCierre, 0);

    // Header Banner
    doc.setFillColor(185, 0, 0);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('CODIZULCA C.A. - GESTIÓN DE FUERZA DE VENTAS', 14, 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`REPORTE DE ACTIVACIÓN POR RUBRO - PERÍODO ${periodoLabel}`, 14, 17);

    // Meta details
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Vendedor: ${vendedorName}`, 14, 29);
    doc.setFont('helvetica', 'normal');
    doc.text(`Avance Mes: ${mesInfo.elapsedWorkingDays} de ${mesInfo.totalWorkingDays} días hábiles (${mesInfo.percentage}%)`, 85, 29);
    doc.text(`Emisión: ${fechaEmision}`, 164, 29);

    // KPI Summary Box
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(14, 33, 182, 16, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(14, 33, 182, 16, 2, 2, 'S');

    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text('META TOTAL', 18, 38);
    doc.text('ACTIVADOS', 54, 38);
    doc.text('FALTANTE', 90, 38);
    doc.text('% CUMPLIMIENTO', 124, 38);
    doc.text('EST. CIERRE', 164, 38);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(`${totalMeta} cli`, 18, 45);
    doc.text(`${totalActivados} cli`, 54, 45);
    doc.text(`${totalFaltante} cli`, 90, 45);
    doc.text(`${totalCumplimiento.toFixed(1)}%`, 124, 45);
    doc.text(`${totalEstCierreVal} cli`, 164, 45);

    const tableData = filteredStats.map((stat, idx) => {
      const isSuccess = stat.cumplimiento >= 100;
      const ritmoStr = stat.faltante === 0 ? '0/d' : `${(stat.faltante / diasRestantesMes).toFixed(1)}/d`;
      const estadoStr = isSuccess ? 'Cumplido (>=100%)' : 'En Riesgo';
      return [
        (idx + 1).toString(),
        stat.categoria,
        stat.meta.toString(),
        stat.activados.toString(),
        stat.faltante === 0 ? '¡Meta! (0)' : stat.faltante.toString(),
        stat.cumplimiento.toFixed(1) + '%',
        ritmoStr,
        estadoStr,
        `${stat.estCierre} cli`
      ];
    });

    const filtMeta = filteredStats.reduce((acc, curr) => acc + curr.meta, 0);
    const filtActivados = filteredStats.reduce((acc, curr) => acc + curr.activados, 0);
    const filtFaltante = filteredStats.reduce((acc, curr) => acc + curr.faltante, 0);
    const filtCumplimiento = filtMeta > 0 ? (filtActivados / filtMeta) * 100 : 0;
    const filtEstCierre = filteredStats.reduce((acc, curr) => acc + curr.estCierre, 0);
    const filtRitmo = filtFaltante === 0 ? '0/d' : `${(filtFaltante / diasRestantesMes).toFixed(1)}/d`;

    if (searchTerm.trim() && filteredStats.length < categoriaStats.length) {
      tableData.push([
        '',
        `SUBTOTAL FILTRADO (${filteredStats.length} rubros)`,
        filtMeta.toString(),
        filtActivados.toString(),
        filtFaltante.toString(),
        filtCumplimiento.toFixed(1) + '%',
        filtRitmo,
        filtCumplimiento >= 100 ? 'Cumplido (>=100%)' : 'En Riesgo',
        `${filtEstCierre} cli`
      ]);
    }

    const totalRitmo = totalFaltante === 0 ? '0/d' : `${(totalFaltante / diasRestantesMes).toFixed(1)}/d`;
    tableData.push([
      'Σ',
      'TOTALES GENERALES',
      totalMeta.toString(),
      totalActivados.toString(),
      totalFaltante.toString(),
      totalCumplimiento.toFixed(1) + '%',
      totalRitmo,
      totalCumplimiento >= 100 ? 'Cumplido (>=100%)' : 'En Riesgo',
      `${totalEstCierreVal} cli`
    ]);

    autoTable(doc, {
      startY: 54,
      head: [['#', 'Categoría / Rubro', 'Meta', 'Activados', 'Faltante', '% Cumpl.', 'Ritmo Req.', 'Estado', 'Est. Cierre']],
      body: tableData,
      headStyles: { fillColor: [185, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2.5, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 18, halign: 'center' },
        7: { cellWidth: 28, halign: 'center' },
        8: { cellWidth: 20, halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index >= filteredStats.length) {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [20, 20, 20];
        }
      },
      theme: 'grid'
    });

    doc.save(`Reporte_Activacion_Rubro_${vendedorName.replace(/\s+/g, '_')}_${periodoLabel.replace(/\s+/g, '_')}.pdf`);
  };

  const totalEstCierre = categoriaStats.reduce((acc, curr) => acc + curr.estCierre, 0);

  const statsByRubro = useMemo(() => {
    const out: Partial<Record<RubroCodigo, RubroStatsActual>> = {};
    categoriaStats.forEach((c) => {
      out[categoryToRubroCode(c.categoria)] = c;
    });
    return out;
  }, [categoriaStats]);

  const todosTildados = RUBROS_ACTIVACION.every((r) => selectedRubros.includes(r));

  return (
    <div className="space-y-6">
      
      {/* SECTION 1: WIDGETS (CARDS) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-red-600" />
          <h2 className="text-sm font-sans font-bold text-white uppercase tracking-wider">
            Rubros en Activación — Avance & Necesidad
          </h2>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/30 border border-red-900/40 text-red-300 text-xs font-sans">
          <Activity className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>Tilda cualquier rubro para abrir su <strong>Dashboard 360° Histórico</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4 snap-x snap-mandatory overflow-x-auto scrollbar-hide pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        {categoriaStats.map((stat, i) => {
          const isSuccess = stat.cumplimiento >= 100;
          const rCode = categoryToRubroCode(stat.categoria);
          const isSelected = selectedRubros.includes(rCode);
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => handleToggleRubro(stat.categoria)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleRubro(stat.categoria);
                }
              }}
              className={`bg-neutral-950 rounded-xl p-4 md:p-5 flex flex-col min-w-[260px] sm:min-w-0 snap-start shrink-0 cursor-pointer transition-all select-none ${
                isSelected
                  ? 'border-2 border-red-500 ring-2 ring-red-500/20 bg-gradient-to-b from-red-950/20 to-neutral-950 shadow-lg shadow-red-950/30'
                  : 'border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900/40'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg border ${isSuccess ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-amber-900/50 bg-amber-950/20'}`}>
                    {getIconForCategory(stat.categoria)}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-sans font-bold border transition-colors ${
                      isSelected
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    {isSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                    {isSelected ? '360° Activo' : 'Tildar 360°'}
                  </span>
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

      {/* DASHBOARD 360° DEL RUBRO TILDADO */}
      {selectedRubros.length > 0 && (
        <div ref={dashboard360Ref} className="animate-in fade-in slide-in-from-top-2 duration-300">
          <Rubro360Panel
            rubrosSeleccionados={selectedRubros}
            onToggleRubro={(code) => handleToggleRubro(code)}
            onSetRubros={setSelectedRubros}
            vendedorFilter={vendedorFilter || activeVendedorId}
            vendedorDisplayName={activeVendedorId}
            statsByRubro={statsByRubro}
            filteredVolumen={filteredVolumen}
          />
        </div>
      )}

      {/* SECTION 2: DATA TABLE */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden mt-6 flex flex-col">
        
        {/* Table Header / Controls */}
        <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-red-600 p-1.5 rounded">
               <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-sans font-bold text-white uppercase tracking-wider">
                Activación por Categoría
              </h2>
              <p className="text-[11px] font-sans text-neutral-400">
                Tilda uno o varios rubros (selección múltiple) para desplegar su historial de ventas 360° y compararlos.
              </p>
            </div>
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
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-neutral-900/50 border-b border-neutral-800 text-[10px] md:text-xs font-sans text-neutral-400 uppercase tracking-wider">
                <th className="p-3 md:p-4 text-center w-14 border-r border-neutral-800">
                  <button
                    type="button"
                    title={todosTildados ? 'Quitar los 5 rubros' : 'Tildar los 5 rubros'}
                    onClick={() => setSelectedRubros(todosTildados ? [] : [...RUBROS_ACTIVACION])}
                    className="inline-flex items-center justify-center gap-1 text-neutral-400 hover:text-white"
                  >
                    {todosTildados ? <CheckSquare className="w-4 h-4 text-red-500" /> : <Square className="w-4 h-4" />}
                    <span>360°</span>
                  </button>
                </th>
                <th className="p-3 md:p-4 font-bold text-white border-r border-neutral-800">Categoría / Rubro</th>
                <th className="p-3 md:p-4 text-center border-r border-neutral-800">Meta</th>
                <th className="p-3 md:p-4 text-center text-emerald-400 border-r border-neutral-800">Activados</th>
                <th className="p-3 md:p-4 text-center text-red-400 border-r border-neutral-800">Faltante</th>
                <th className="p-3 md:p-4 text-center border-r border-neutral-800">% Cumpl.</th>
                <th className="p-3 md:p-4 border-r border-neutral-800">Estado</th>
                <th className="p-3 md:p-4 text-center text-amber-400 border-r border-neutral-800">Est. Cierre</th>
                <th className="p-3 md:p-4 text-center">Historial</th>
              </tr>
            </thead>
            <tbody className="text-xs md:text-sm font-mono text-neutral-300">
              {filteredStats.map((stat) => {
                 const isSuccess = stat.cumplimiento >= 100;
                 const rCode = categoryToRubroCode(stat.categoria);
                 const isSelected = selectedRubros.includes(rCode);
                 return (
                  <tr
                    key={stat.categoria}
                    onClick={() => handleToggleRubro(stat.categoria, true)}
                    className={`border-b border-neutral-800 cursor-pointer transition-colors ${
                      isSelected ? 'bg-red-950/20 hover:bg-red-950/30' : 'hover:bg-neutral-900/50'
                    }`}
                  >
                    <td className="p-3 md:p-4 text-center border-r border-neutral-800">
                      <div className="inline-flex items-center justify-center">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-red-500" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-500 hover:text-white" />
                        )}
                      </div>
                    </td>
                    <td className="p-3 md:p-4 font-sans font-bold text-white border-r border-neutral-800">
                      <div className="flex items-center gap-2">
                        {getIconForCategory(stat.categoria)}
                        <span>{stat.categoria}</span>
                      </div>
                    </td>
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
                    <td className="p-3 md:p-4 text-center font-bold text-amber-400 border-r border-neutral-800">
                      {stat.estCierre} cli
                    </td>
                    <td className="p-3 md:p-4 text-center font-sans">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-red-500 hover:text-red-300'
                        }`}
                      >
                        <Activity className="w-3 h-3" />
                        {isSelected ? 'Ocultar 360°' : 'Ver 360°'}
                      </span>
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
                <td className="p-3 md:p-4 text-center text-amber-400 border-r border-neutral-800">
                  {totalEstCierre} cli
                </td>
                <td className="p-3 md:p-4 text-center text-neutral-500 font-sans text-[10px]">
                  5 Rubros
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
