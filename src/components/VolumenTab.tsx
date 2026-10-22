import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package, TrendingUp, Target, CalendarDays, Crosshair, LayoutGrid, Search, FileText, User, CheckSquare, Square, X, Filter } from 'lucide-react';
import { VolumenData } from '../types';
import { getMesLaboralInfo } from '../utils/calendar';
import { MESES_CORTO, RUBROS_CLAVE, RUBRO_LABEL, RubroCodigo, clasificarRubro } from '../lib/rubros';
import { HistVolumenRow, fetchHistVolumen } from '../services/historialService';
import { SerieVolumen, construirSerie, sumarSerie } from '../lib/volumenHistorial';
import { MonthFilter, PeriodoMes, mesKey, resolverSeleccionMeses } from './MonthFilter';
import { VolumenDashboard360 } from './VolumenDashboard360';

const normSearch = (val: string) =>
  String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normSkuCode = (val: string) =>
  normSearch(val).replace(/^[#0\s]+/, '');

interface Props {
  filteredVolumen: VolumenData[];
  activeVendedorId: string;
  /** Ruta/vendedor tal como lo maneja App; el servidor valida el alcance real con el JWT. */
  vendedorFilter?: string;
}

interface SkuStats {
  skuId: string;
  articulo: string;
  categoria?: string;
  meta: number;
  ejecutado: number;
  cumplimiento: number;
  /** true cuando se muestra un mes histórico: no existe cuota guardada de meses anteriores. */
  sinCuota?: boolean;
  /** true cuando la fila del Sheet no tiene un criterio confiable para cruzarla con el historial. */
  sinHist?: boolean;
}

export const VolumenTab: React.FC<Props> = ({ filteredVolumen, activeVendedorId, vendedorFilter }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'focus' | 'hoja' | 'tarjetas'>('hoja');
  const [rubroFilter, setRubroFilter] = useState<'TODOS' | RubroCodigo>('TODOS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'FALTANTES' | 'CUMPLIDOS' | 'CON_VENTA' | 'SIN_VENTA'>('TODOS');

  // Scaling mock data to look like the screenshot if it's less than 10k
  const scaleFactor = 1; 

  // Aggregating SKU data first so that totalMeta and totalEjecutado match the exact sum of the SKU rows
  const skuStats: SkuStats[] = useMemo(() => {
    const map = new Map<string, SkuStats>();
    
    const getArticuloName = (sku: string) => {
       if (sku === 'SKU001') return 'JUGOS VARIOS';
       if (sku === 'SKU002') return 'LECHE EN POLVO VENCAMPO';
       if (sku === 'SKU003') return 'SALCHICHA VIENA ALIMEX 16 X 450 GRS';
       if (sku === 'SKU004') return 'MORTADELA ESP. CARACAS 10X900GRS';
       return `PRODUCTO GENÉRICO ${sku}`;
    };

    filteredVolumen.forEach(v => {
      const displaySku = v.skuId || (v as any).sku || 'GENERICO';
      const m = Number(v.meta ?? (v as any).metaKg);
      const e = Number(v.ejecutado ?? (v as any).ejecutadoKg);
      const validMeta = isNaN(m) ? 0 : m;
      const validEjecutado = isNaN(e) ? 0 : e;
      
      if (!map.has(displaySku)) {
        map.set(displaySku, {
          skuId: displaySku,
          articulo: v.articulo || getArticuloName(displaySku),
          categoria: String((v as any).categoria || ''),
          meta: 0,
          ejecutado: 0,
          cumplimiento: 0
        });
      }
      
      const stat = map.get(displaySku)!;
      stat.meta += validMeta;
      stat.ejecutado += validEjecutado;
    });

    return Array.from(map.values()).map(s => {
      s.meta = Math.round((Number(s.meta) || 0) * scaleFactor);
      s.ejecutado = Math.round((Number(s.ejecutado) || 0) * scaleFactor);
      s.cumplimiento = s.meta > 0 ? (s.ejecutado / s.meta) * 100 : 0;
      return s;
    }).sort((a, b) => b.ejecutado - a.ejecutado); // Sort descending by executed
  }, [filteredVolumen]);

  const totalMeta = useMemo(() => skuStats.reduce((acc, s) => acc + s.meta, 0), [skuStats]);
  const totalEjecutado = useMemo(() => skuStats.reduce((acc, s) => acc + s.ejecutado, 0), [skuStats]);
  
  const cumplimiento = totalMeta > 0 ? (totalEjecutado / totalMeta) * 100 : 0;
  const faltante = Math.max(0, totalMeta - totalEjecutado);
  const mesInfo = useMemo(() => getMesLaboralInfo(), []);
  const diasRestantes = Math.max(1, mesInfo.remainingWorkingDays || 1);
  const diasTranscurridos = Math.max(0, mesInfo.elapsedWorkingDays || 0);
  const diasTotales = Math.max(1, mesInfo.totalWorkingDays || 22);
  const avanceTiempo = mesInfo.percentage || 0;
  
  // Proyeccion cierre = (Ejecutado / dias transcurridos) * dias totales
  const proyeccion = diasTranscurridos > 0 ? Math.round((totalEjecutado / diasTranscurridos) * diasTotales) : totalEjecutado;
  const ritmoRequerido = diasRestantes > 0 ? Math.round(faltante / diasRestantes) : 0;

  const formatNumber = (num: number | undefined | null) => {
    if (num === null || num === undefined || isNaN(Number(num))) return '0';
    return Number(num).toLocaleString('en-US');
  };

  // ── Historial real (ventas_historial) + filtro de fechas + selección múltiple 360° ──
  const vendedorHist = vendedorFilter || activeVendedorId;
  const [histRows, setHistRows] = useState<HistVolumenRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [histError, setHistError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setHistLoading(true);
    setHistError(null);
    fetchHistVolumen(vendedorHist)
      .then((r) => {
        if (alive) {
          setHistRows(r.rows || []);
          setHistLoading(false);
        }
      })
      .catch((e: any) => {
        if (alive) {
          setHistError(e?.message || 'No se pudo consultar el historial de ventas');
          setHistLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [vendedorHist]);

  const periodosHist = useMemo<PeriodoMes[]>(() => {
    const m = new Map<string, PeriodoMes>();
    histRows.forEach((r) => m.set(`${r.ano}-${r.mes}`, { ano: r.ano, mes: r.mes }));
    return [...m.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [histRows]);

  const [mesesSel, setMesesSel] = useState<string[]>([]);
  const { showActual, mesesHist } = resolverSeleccionMeses(mesesSel);
  const useHist = mesesHist.length > 0;
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  const seriesMap = useMemo(() => {
    const m = new Map<string, SerieVolumen>();
    skuStats.forEach((st) => m.set(st.skuId, construirSerie(st.skuId, st.articulo, histRows)));
    return m;
  }, [skuStats, histRows]);

  // Vista de la tabla: mes actual (con cuota) o suma real de los meses históricos elegidos (sin cuota)
  const viewStats = useMemo<SkuStats[]>(() => {
    if (!useHist) return skuStats;
    return skuStats
      .map((st) => {
        const serie = seriesMap.get(st.skuId);
        const sinHist = !serie || serie.criterio === 'NINGUNO';
        const kg = (sinHist ? 0 : sumarSerie(serie!, mesesHist, 'kgs')) + (showActual ? st.ejecutado : 0);
        return { ...st, meta: 0, ejecutado: Math.round(kg), cumplimiento: 0, sinCuota: true, sinHist };
      })
      .sort((a, b) => b.ejecutado - a.ejecutado);
  }, [skuStats, seriesMap, useHist, mesesHist, showActual]);

  const totalMostrado = viewStats.reduce((a, st) => a + (st.sinHist ? 0 : st.ejecutado), 0);
  const etiquetaMeses = periodosHist
    .filter((p) => mesesHist.includes(mesKey(p)))
    .map((p) => `${MESES_CORTO[p.mes]} ${String(p.ano).slice(-2)}`)
    .join(', ');

  // Al tocar un producto del cuadro detallado se agrega/quita del Dashboard 360°.
  // Solo se desplaza hacia el dashboard al abrirlo (primer producto), para no interrumpir la selección múltiple.
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const toggleCode = (code: string) =>
    setSelectedCodes((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length === 0) {
        setTimeout(() => dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
      return [...prev, code];
    });
  const itemsSel = selectedCodes
    .map((code) => skuStats.find((st) => st.skuId === code))
    .filter((st): st is SkuStats => !!st)
    .map((st) => ({
      codigo: st.skuId,
      articulo: st.articulo,
      cuota: st.meta,
      ejecutado: st.ejecutado,
      serie: seriesMap.get(st.skuId) || construirSerie(st.skuId, st.articulo, histRows)
    }));

  // Conteo de SKUs por rubro para las píldoras de filtro
  const rubroOptions = useMemo<{ codigo: RubroCodigo; etiqueta: string }[]>(
    () => [...RUBROS_CLAVE.map((r) => ({ codigo: r.codigo, etiqueta: r.label })), { codigo: 'OTROS', etiqueta: 'Otros' }],
    []
  );

  const rubroCounts = useMemo(() => {
    const counts: Record<string, number> = { TODOS: viewStats.length, OTROS: 0 };
    RUBROS_CLAVE.forEach((r) => {
      counts[r.codigo] = 0;
    });
    viewStats.forEach((stat) => {
      const rCode = clasificarRubro(stat.skuId, stat.articulo);
      counts[rCode] = (counts[rCode] || 0) + 1;
    });
    return counts;
  }, [viewStats]);

  // Apply search, rubro and status filters
  const filteredSkuStats = useMemo(() => {
    const q = normSearch(searchTerm);
    const qCode = normSkuCode(searchTerm);

    return viewStats.filter((stat) => {
      const statRubro = clasificarRubro(stat.skuId, stat.articulo);
      if (rubroFilter !== 'TODOS' && statRubro !== rubroFilter) {
        return false;
      }

      if (q) {
        const skuNorm = normSearch(stat.skuId);
        const skuCodeNorm = normSkuCode(stat.skuId);
        const artNorm = normSearch(stat.articulo);
        const catNorm = normSearch(stat.categoria || '');
        const rubroLabelNorm = normSearch(RUBRO_LABEL[statRubro] || '');
        const matchText =
          skuNorm.includes(q) ||
          (qCode.length > 0 && skuCodeNorm.includes(qCode)) ||
          artNorm.includes(q) ||
          catNorm.includes(q) ||
          rubroLabelNorm.includes(q);
        if (!matchText) return false;
      }

      const effectiveStatus = viewMode === 'focus' && statusFilter === 'TODOS' ? 'FALTANTES' : statusFilter;
      if (effectiveStatus === 'FALTANTES') {
        return useHist ? stat.ejecutado <= 0 : stat.cumplimiento < 100;
      }
      if (effectiveStatus === 'CUMPLIDOS') {
        return !stat.sinCuota && stat.cumplimiento >= 100;
      }
      if (effectiveStatus === 'CON_VENTA') {
        return stat.ejecutado > 0;
      }
      if (effectiveStatus === 'SIN_VENTA') {
        return stat.ejecutado <= 0;
      }
      return true;
    });
  }, [viewStats, searchTerm, rubroFilter, statusFilter, viewMode, useHist]);

  const isTableFiltered =
    Boolean(searchTerm.trim()) ||
    rubroFilter !== 'TODOS' ||
    statusFilter !== 'TODOS' ||
    viewMode === 'focus';

  const filteredMetaTotal = useMemo(
    () => filteredSkuStats.reduce((acc, s) => acc + (s.sinCuota ? 0 : s.meta), 0),
    [filteredSkuStats]
  );
  const filteredEjecutadoTotal = useMemo(
    () => filteredSkuStats.reduce((acc, s) => acc + (s.sinHist ? 0 : s.ejecutado), 0),
    [filteredSkuStats]
  );
  const filteredCumplimiento =
    filteredMetaTotal > 0 ? (filteredEjecutadoTotal / filteredMetaTotal) * 100 : 0;

  const allFilteredSelected =
    filteredSkuStats.length > 0 && filteredSkuStats.every((st) => selectedCodes.includes(st.skuId));

  const toggleAllFilteredCodes = () => {
    const visibleCodes = filteredSkuStats.map((st) => st.skuId);
    if (visibleCodes.length === 0) return;
    setSelectedCodes((prev) => {
      const allIn = visibleCodes.every((c) => prev.includes(c));
      if (allIn) {
        return prev.filter((c) => !visibleCodes.includes(c));
      }
      const next = Array.from(new Set([...prev, ...visibleCodes]));
      if (prev.length === 0 && next.length > 0) {
        setTimeout(() => dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      }
      return next;
    });
  };

  const generarPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId;
    const fechaEmision = new Date().toLocaleDateString('es-VE');
    const periodoLabel = useHist
      ? `${etiquetaMeses}${showActual ? ' + MES ACTUAL' : ''}`
      : `${mesInfo.monthName.toUpperCase()} ${mesInfo.year}`;

    // Header Banner
    doc.setFillColor(185, 0, 0);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('CODIZULCA C.A. - GESTIÓN DE FUERZA DE VENTAS', 14, 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`REPORTE DE VOLUMEN POR SKU - PERÍODO: ${periodoLabel}`, 14, 17);

    // Meta details
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Vendedor: ${vendedorName}`, 14, 29);
    doc.setFont('helvetica', 'normal');
    doc.text(`Avance Mes: Día ${diasTranscurridos}/${diasTotales} (${(isNaN(avanceTiempo) ? 0 : avanceTiempo).toFixed(0)}%)`, 90, 29);
    doc.text(`Emisión: ${fechaEmision}`, 160, 29);

    // KPI Summary Box (Exact same metrics displayed in the 4 UI widgets)
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(14, 33, 182, 16, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(14, 33, 182, 16, 2, 2, 'S');

    doc.setFontSize(7.5);
    doc.setTextColor(100, 100, 100);
    doc.text('CUOTA TOTAL (KG)', 18, 38);
    doc.text(useHist ? 'EJECUTADO HISTÓRICO' : 'EJECUTADO (KG)', 56, 38);
    doc.text('% CUMPL. / FALTA', 98, 38);
    doc.text('PROY. CIERRE', 138, 38);
    doc.text('RITMO DIARIO REQ.', 166, 38);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(useHist ? '—' : `${formatNumber(totalMeta)} KG`, 18, 45);
    doc.text(`${formatNumber(useHist ? totalMostrado : totalEjecutado)} KG`, 56, 45);
    doc.text(
      useHist ? '—' : `${(isNaN(cumplimiento) ? 0 : cumplimiento).toFixed(1)}% (${formatNumber(faltante)} kg)`,
      98,
      45
    );
    doc.text(useHist ? '—' : `${formatNumber(proyeccion)} KG`, 138, 45);
    doc.text(useHist ? '—' : `${formatNumber(ritmoRequerido)} KG/d`, 166, 45);

    const tableData = filteredSkuStats.map(stat => [
      stat.skuId,
      stat.articulo,
      stat.sinCuota ? '—' : formatNumber(stat.meta),
      stat.sinHist ? '—' : stat.ejecutado === 0 ? '-' : formatNumber(stat.ejecutado),
      stat.sinCuota ? '—' : (isNaN(stat.cumplimiento) ? 0 : stat.cumplimiento).toFixed(2) + '%'
    ]);

    const filtMeta = filteredSkuStats.reduce((acc, s) => acc + (s.sinCuota ? 0 : s.meta), 0);
    const filtEjec = filteredSkuStats.reduce((acc, s) => acc + (s.sinHist ? 0 : s.ejecutado), 0);
    const filtCumpl = filtMeta > 0 ? (filtEjec / filtMeta) * 100 : 0;

    const isSubsetFiltered = filteredSkuStats.length < viewStats.length;
    if (isSubsetFiltered) {
      tableData.push([
        'SUBTOTAL',
        `SUBTOTAL FILTRADO (${filteredSkuStats.length} SKUs)`,
        useHist ? '—' : formatNumber(filtMeta),
        formatNumber(filtEjec),
        useHist ? '—' : `${filtCumpl.toFixed(2)}%`
      ]);
    }

    tableData.push([
      'TOTAL',
      'RESUMEN ACUMULADO VENDEDOR',
      useHist ? '—' : formatNumber(totalMeta),
      formatNumber(useHist ? totalMostrado : totalEjecutado),
      useHist ? '—' : `${(isNaN(cumplimiento) ? 0 : cumplimiento).toFixed(2)}%`
    ]);

    autoTable(doc, {
      startY: 54,
      head: [['Cod', 'Artículo', 'Cuota (KG)', useHist ? 'Ejecutado (Filtro KG)' : 'Ejecutado (KG)', '% Cumpl.']],
      body: tableData,
      headStyles: { fillColor: [185, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index >= filteredSkuStats.length) {
          data.cell.styles.fillColor = [240, 240, 240];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [20, 20, 20];
        }
      },
      theme: 'grid'
    });

    doc.save(`Reporte_Volumen_${vendedorName.replace(/\s+/g, '_')}_${periodoLabel.replace(/[\s,+]+/g, '_')}.pdf`);
  };

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
                {(isNaN(cumplimiento) ? 0 : cumplimiento).toFixed(1)}%
              </div>
              <div className="text-[10px] md:text-xs font-sans text-neutral-400 font-bold">
                Falta: <span className="text-red-400">{formatNumber(faltante)} kg</span>
              </div>
            </div>
            <div className="w-full bg-neutral-900 rounded-full h-1.5 md:h-2 overflow-hidden border border-neutral-800">
              <div className="bg-red-500 h-full rounded-full" style={{ width: `${Math.min(100, isNaN(cumplimiento) ? 0 : cumplimiento)}%` }}></div>
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
            <span className="text-[10px] md:text-xs font-sans font-bold text-amber-500">Día {diasTranscurridos}/{diasTotales} ({(isNaN(avanceTiempo) ? 0 : avanceTiempo).toFixed(0)}%)</span>
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

      {/* FILTRO DE FECHAS */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-3">
        <MonthFilter periodos={periodosHist} selected={mesesSel} onChange={setMesesSel} incluirActual />
        <p className="text-[10px] font-sans text-neutral-500">
          Toca uno o varios productos en el cuadro detallado para abrir su Dashboard 360° con el volumen real de meses anteriores.
          {histLoading && ' Cargando historial de ventas…'}
          {histError && <span className="text-amber-400"> {histError}</span>}
        </p>
      </div>

      {selectedCodes.length > 0 && (
        <div ref={dashboardRef} className="scroll-mt-4">
          <VolumenDashboard360
            items={itemsSel}
            periodos={periodosHist}
            mesesSel={mesesSel}
            loading={histLoading}
            error={histError}
            vendedorDisplayName={activeVendedorId}
            onToggle={toggleCode}
            onClear={() => setSelectedCodes([])}
          />
        </div>
      )}

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
                 <button
                   type="button"
                   onClick={() => {
                     setViewMode('focus');
                     setStatusFilter('FALTANTES');
                   }}
                   className={`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors border-r cursor-pointer ${viewMode === 'focus' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}`}
                 >
                   Modo Focus
                 </button>
                 <button
                   type="button"
                   onClick={() => {
                     setViewMode('hoja');
                     if (statusFilter === 'FALTANTES') setStatusFilter('TODOS');
                   }}
                   className={`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors border-r cursor-pointer ${viewMode === 'hoja' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}`}
                 >
                   Hoja Vendedor
                 </button>
                 <button
                   type="button"
                   onClick={() => setViewMode('tarjetas')}
                   className={`flex-1 sm:flex-none px-3 md:px-4 py-2 md:py-1.5 text-xs font-sans transition-colors cursor-pointer ${viewMode === 'tarjetas' ? 'font-bold text-white bg-red-600' : 'text-neutral-400 hover:text-white'}`}
                 >
                   Tarjetas
                 </button>
             </div>
             
             <div className="flex items-center gap-2 w-full sm:w-auto">
                 <div className="relative flex-1 sm:flex-none">
                     <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                     <input 
                         type="text" 
                         placeholder="Filtrar SKU, artículo o rubro..." 
                         className="w-full sm:w-56 md:w-64 bg-neutral-900 border border-neutral-800 text-sm font-sans text-white rounded-full pl-9 pr-8 py-2 min-h-[44px] sm:min-h-[36px] focus:outline-none focus:border-neutral-600 transition-colors"
                         value={searchTerm}
                         onChange={(e) => setSearchTerm(e.target.value)}
                     />
                     {searchTerm && (
                       <button
                         type="button"
                         onClick={() => setSearchTerm('')}
                         title="Limpiar búsqueda"
                         className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors cursor-pointer"
                       >
                         <X className="w-3.5 h-3.5" />
                       </button>
                     )}
                 </div>
                 <button onClick={generarPDF} className="flex shrink-0 items-center justify-center gap-2 text-xs font-sans font-bold text-white bg-red-600 px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-full hover:bg-red-700 transition-colors cursor-pointer">
                     <FileText className="w-3.5 h-3.5" /> PDF
                 </button>
             </div>
          </div>
        </div>

        {/* Interactive Rubro & Status Filters Bar */}
        <div className="px-4 py-3 bg-neutral-900/40 border-b border-neutral-800 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-sans font-bold text-neutral-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-red-500" /> Rubro:
              </span>
              <button
                type="button"
                onClick={() => setRubroFilter('TODOS')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                  rubroFilter === 'TODOS'
                    ? 'bg-red-600 text-white border-red-500'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-700'
                }`}
              >
                Todos ({rubroCounts.TODOS || 0})
              </button>
              {rubroOptions.map((r) => {
                const count = rubroCounts[r.codigo] || 0;
                if (count === 0 && rubroFilter !== r.codigo) return null;
                const active = rubroFilter === r.codigo;
                return (
                  <button
                    key={r.codigo}
                    type="button"
                    onClick={() => setRubroFilter(active ? 'TODOS' : r.codigo)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:text-white hover:border-neutral-700'
                    }`}
                  >
                    {r.etiqueta} ({count})
                  </button>
                );
              })}
            </div>

            {isTableFiltered && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setRubroFilter('TODOS');
                  setStatusFilter('TODOS');
                  if (viewMode === 'focus') setViewMode('hoja');
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-sans font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Limpiar filtros ({filteredSkuStats.length}/{viewStats.length})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-sans font-bold text-neutral-500 uppercase tracking-wider mr-1">
              Estado SKU:
            </span>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('TODOS');
                if (viewMode === 'focus') setViewMode('hoja');
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'TODOS' && viewMode !== 'focus'
                  ? 'bg-neutral-200 text-black border-white'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => {
                const next = statusFilter === 'FALTANTES' ? 'TODOS' : 'FALTANTES';
                setStatusFilter(next);
                if (next === 'TODOS' && viewMode === 'focus') setViewMode('hoja');
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'FALTANTES' || viewMode === 'focus'
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-neutral-900 text-amber-400/90 border-neutral-800 hover:border-amber-700/60'
              }`}
            >
              {useHist ? 'Sin Venta en Mes(es)' : 'Por Cumplir (<100%)'}
            </button>
            {!useHist && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(statusFilter === 'CUMPLIDOS' ? 'TODOS' : 'CUMPLIDOS');
                  if (viewMode === 'focus') setViewMode('hoja');
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                  statusFilter === 'CUMPLIDOS'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-neutral-900 text-emerald-400/90 border-neutral-800 hover:border-emerald-700/60'
                }`}
              >
                Cumplidos (≥100%)
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'CON_VENTA' ? 'TODOS' : 'CON_VENTA');
                if (viewMode === 'focus') setViewMode('hoja');
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'CON_VENTA'
                  ? 'bg-sky-600 text-white border-sky-500'
                  : 'bg-neutral-900 text-sky-400/90 border-neutral-800 hover:border-sky-700/60'
              }`}
            >
              Con Venta (&gt;0 KG)
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'SIN_VENTA' ? 'TODOS' : 'SIN_VENTA');
                if (viewMode === 'focus') setViewMode('hoja');
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-bold border transition-colors cursor-pointer ${
                statusFilter === 'SIN_VENTA'
                  ? 'bg-rose-700 text-white border-rose-500'
                  : 'bg-neutral-900 text-rose-400/90 border-neutral-800 hover:border-rose-700/60'
              }`}
            >
              Sin Venta (0 KG)
            </button>
          </div>
        </div>

        {useHist && (
          <div className="px-4 py-2 bg-sky-950/20 border-b border-sky-900/40 text-[11px] font-sans text-sky-200">
            Mostrando el volumen <strong>real vendido</strong> de: {etiquetaMeses}
            {showActual ? ' + mes actual' : ''}. No hay cuota guardada de meses anteriores, por eso Cuota y % no aplican. Las filas con “—” no tienen un criterio
            confiable para cruzarlas con el historial.
          </div>
        )}

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
              <div className="text-sm md:text-base font-mono font-bold text-neutral-300">{useHist ? '—' : formatNumber(totalMeta)}</div>
            </div>
            <div className="text-right pl-4 sm:pl-6">
              <div className="text-[9px] font-sans text-neutral-500 uppercase tracking-wider mb-1">Ejecutado</div>
              <div className="text-sm md:text-base font-mono font-bold text-emerald-400">
                {formatNumber(useHist ? totalMostrado : totalEjecutado)} <span className="text-[10px] text-neutral-500 font-sans font-normal">KG</span>
              </div>
            </div>
            <div className="text-right pl-4 sm:pl-6">
              <div className="text-[9px] font-sans text-neutral-500 uppercase tracking-wider mb-1">Avance</div>
              {useHist ? (
                <div className="px-2 py-0.5 text-[10px] md:text-xs font-mono font-bold text-neutral-500" title="No hay cuota guardada de meses anteriores">—</div>
              ) : (
              <div className={`px-2 py-0.5 rounded border text-[10px] md:text-xs font-mono font-bold ${cumplimiento >= 100 ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-red-900/50 bg-red-950/40 text-red-400'}`}>
                {(isNaN(cumplimiento) ? 0 : cumplimiento).toFixed(1)}%
              </div>
              )}
            </div>
          </div>
        </div>

        {/* DESKTOP VIEW: Data Table (Hidden on small screens) */}
        {viewMode !== 'tarjetas' && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-red-700 border-b border-red-800 text-[10px] font-sans text-white uppercase tracking-wider">
                <th
                  onClick={toggleAllFilteredCodes}
                  className="p-3 font-bold border-r border-red-800 w-14 text-center cursor-pointer hover:bg-red-800/80 transition-colors select-none"
                  title="Clic para tildar o destildar todos los SKUs filtrados en el Dashboard 360°"
                >
                  <span className="inline-flex items-center justify-center gap-1">
                    {allFilteredSelected ? <CheckSquare className="w-3.5 h-3.5 text-white" /> : <Square className="w-3.5 h-3.5 text-white/80" />}
                    <span>360°</span>
                  </span>
                </th>
                <th className="p-3 font-bold border-r border-red-800">Cod</th>
                <th className="p-3 font-bold border-r border-red-800">Articulo</th>
                <th className="p-3 font-bold text-right border-r border-red-800">Cuota</th>
                <th className="p-3 font-bold text-right border-r border-red-800">{useHist ? 'KG (filtro)' : 'KG'}</th>
                <th className="p-3 font-bold text-right">%</th>
              </tr>
            </thead>
            <tbody className="text-xs font-mono text-neutral-300">
              {filteredSkuStats.map((stat, idx) => {
                const isSuccess = stat.cumplimiento >= 100;
                // Alternate row background slightly for readability
                const bgClass = idx % 2 === 0 ? 'bg-transparent' : 'bg-neutral-900/20';
                const isSelected = selectedCodes.includes(stat.skuId);
                
                return (
                  <tr
                    key={`${stat.skuId}-${idx}`}
                    onClick={() => toggleCode(stat.skuId)}
                    title={isSelected ? 'Quitar del Dashboard 360°' : 'Ver Dashboard 360° de volumen'}
                    className={`${isSelected ? 'bg-red-950/30 hover:bg-red-950/40' : `${bgClass} hover:bg-neutral-900/50`} border-b border-neutral-800/50 transition-colors cursor-pointer`}
                  >
                    <td className="p-3 border-r border-neutral-800/50 text-center">
                      <span className="inline-flex items-center justify-center text-neutral-500">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-red-500" /> : <Square className="w-4 h-4" />}
                      </span>
                    </td>
                    <td className="p-3 border-r border-neutral-800/50 text-red-500 font-bold">{stat.skuId}</td>
                    <td className="p-3 border-r border-neutral-800/50 font-sans font-bold text-white uppercase">{stat.articulo}</td>
                    <td className="p-3 border-r border-neutral-800/50 text-right text-neutral-400">{stat.sinCuota ? '—' : formatNumber(stat.meta)}</td>
                    <td className="p-3 border-r border-neutral-800/50 text-right text-white font-bold">{stat.sinHist ? '—' : stat.ejecutado === 0 ? '-' : formatNumber(stat.ejecutado)}</td>
                    <td className="p-3 text-right">
                      {stat.sinCuota ? (
                        <span className="text-neutral-600">—</span>
                      ) : (
                        <span className={`inline-block px-2 py-1 rounded border text-[10px] font-bold ${isSuccess ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-red-900/50 bg-red-950/40 text-red-400'}`}>
                          {(isNaN(stat.cumplimiento) ? 0 : stat.cumplimiento).toFixed(2)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              
              {filteredSkuStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-neutral-500 font-sans text-xs">
                    No se encontraron SKUs con los filtros actuales.
                  </td>
                </tr>
              )}
              {isTableFiltered && filteredSkuStats.length < viewStats.length && (
                <tr className="border-t border-amber-800/50 bg-amber-950/20">
                  <td className="p-3 border-r border-neutral-800/50"></td>
                  <td className="p-3 border-r border-neutral-800/50 text-amber-400 font-bold uppercase">Subtotal</td>
                  <td className="p-3 border-r border-neutral-800/50 font-sans font-bold text-amber-200 uppercase tracking-wider">
                    Filtro Activo ({filteredSkuStats.length} de {viewStats.length} SKUs)
                  </td>
                  <td className="p-3 border-r border-neutral-800/50 text-right text-amber-200 font-bold">
                    {useHist ? '—' : formatNumber(filteredMetaTotal)}
                  </td>
                  <td className="p-3 border-r border-neutral-800/50 text-right text-amber-300 font-bold">
                    {formatNumber(filteredEjecutadoTotal)}
                  </td>
                  <td className="p-3 text-right text-amber-300 font-bold">
                    {useHist ? '—' : `${(isNaN(filteredCumplimiento) ? 0 : filteredCumplimiento).toFixed(2)}%`}
                  </td>
                </tr>
              )}
              {/* TFOOT / TOTALS */}
              <tr className="border-t border-neutral-700 bg-neutral-900/30">
                <td className="p-3 border-r border-neutral-800/50"></td>
                <td className="p-3 border-r border-neutral-800/50 text-red-500 font-bold uppercase">Total</td>
                <td className="p-3 border-r border-neutral-800/50 font-sans font-bold text-white uppercase tracking-wider">Resumen Acumulado Vendedor</td>
                <td className="p-3 border-r border-neutral-800/50 text-right text-white font-bold">{useHist ? '—' : formatNumber(totalMeta)}</td>
                <td className="p-3 border-r border-neutral-800/50 text-right text-emerald-400 font-bold">{formatNumber(useHist ? totalMostrado : totalEjecutado)}</td>
                <td className="p-3 text-right text-red-400 font-bold">{useHist ? '—' : `${(isNaN(cumplimiento) ? 0 : cumplimiento).toFixed(2)}%`}</td>
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
                   <div
                       key={`${stat.skuId}-${idx}`}
                       onClick={() => toggleCode(stat.skuId)}
                       className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                         selectedCodes.includes(stat.skuId) ? 'bg-red-950/30 border-red-700/60' : 'bg-neutral-900 border-neutral-800 hover:border-neutral-600'
                       }`}
                   >
                       <div className="flex justify-between items-center mb-2">
                            <span className="flex items-center gap-2">
                              <span className="text-neutral-500">
                                {selectedCodes.includes(stat.skuId) ? <CheckSquare className="w-4 h-4 text-red-500" /> : <Square className="w-4 h-4" />}
                              </span>
                              <span className="text-red-500 font-mono text-xs font-bold">{stat.skuId}</span>
                            </span>
                            {stat.sinCuota ? (
                              <span className="text-neutral-600 text-[10px]">sin cuota</span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${isSuccess ? 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400' : 'border-red-900/50 bg-red-950/40 text-red-400'}`}>
                                {(isNaN(stat.cumplimiento) ? 0 : stat.cumplimiento).toFixed(2)}%
                              </span>
                            )}
                       </div>
                       
                       <h4 className="text-white font-sans text-xs sm:text-sm font-bold mb-3 uppercase leading-tight">
                         {stat.articulo}
                       </h4>
                       
                       <div className="flex justify-between items-center border-t border-neutral-800 pt-2 mt-2">
                           <div>
                               <div className="text-[9px] text-neutral-500 uppercase tracking-wider">Cuota (KG)</div>
                               <div className="text-neutral-400 font-mono text-xs mt-0.5">{stat.sinCuota ? '—' : formatNumber(stat.meta)}</div>
                           </div>
                           <div className="text-right">
                               <div className="text-[9px] text-neutral-500 uppercase tracking-wider">Ejecutado</div>
                               <div className="text-white font-mono text-xs font-bold mt-0.5">{stat.sinHist ? '—' : stat.ejecutado === 0 ? '-' : formatNumber(stat.ejecutado)}</div>
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
