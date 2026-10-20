import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React, { useMemo, useRef, useState } from 'react';
import { VolumenData, ActivacionData } from '../types';
import { getMesLaboralInfo } from '../utils/calendar';
import { Search, Users, CalendarDays, Target, ShieldAlert, XCircle, CheckCircle2, TriangleAlert, User, LayoutList, FileText, Grip, Zap, Activity, CheckSquare, Square } from 'lucide-react';
import { RUBROS_ACTIVACION, RUBRO_LABEL, RubroCodigo } from '../lib/rubros';
import { RubroDashboard360, getRubroTheme } from './RubroDashboard360';

interface Props {
  filteredVolumen: any[];
  filteredActivacion: any[];
  activeVendedorId: string;
  vendedorFilter?: string;
}

export const ActivacionClientes: React.FC<Props> = ({ filteredVolumen, filteredActivacion, activeVendedorId, vendedorFilter }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [viewMode, setViewMode] = React.useState<'personal' | 'listado' | 'tarjetas'>('listado');
  const [selectedRubro, setSelectedRubro] = useState<RubroCodigo | null>(null);
  const dashboard360Ref = useRef<HTMLDivElement | null>(null);

  const toggleRubro360 = (rubro: RubroCodigo, scrollTo = false) => {
    setSelectedRubro((prev) => {
      const next = prev === rubro ? null : rubro;
      if (next && scrollTo) {
        setTimeout(() => {
          dashboard360Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }
      return next;
    });
  };
  
  // Cálculos dinámicos basados en clientes únicos y sus rubros
  const { 
    totalClientes, activos, faltan, porcentaje, ritmoRequerido, proyeccionCierre, ritmoActual,
    diasTotales, diasTranscurridos, diasRestantes,
    faltantesPorActivar, sinNingunRubro, cienPorCientoActivados, saludCartera, clientList
  } = useMemo(() => {
    
    // Map to track if client is overall "ACTIVO" and which categories they bought
    const clientMap = new Map<string, { id: string, name: string, isActivo: boolean, rubrosComprados: Set<string> }>();
    
    filteredActivacion.forEach(a => {
      const rubros = new Set<string>();
      if (a.cats) {
        if (a.cats.ACEITE) rubros.add('ACEITE');
        if (a.cats.AZUCAR) rubros.add('AZÚCAR');
        if (a.cats.POLLO || a.cats.ARROZ) rubros.add('POLLO');
        if (a.cats.ESTANDAR_ASTURIAS || a.cats.ENTERO) rubros.add('ESTANDAR Y SUPERIOR ASTURIAS');
        if (a.cats.MORTADELA_SALPICAO || a.cats.LIGEROS) rubros.add('MORTADELA SALPICAO Y ASTURIAS');
      }
      const isActivo = a.status === 'ACTIVO' || rubros.size > 0;
      const key = a.id ? String(a.id).trim() : String(a.cliente || '').trim();
      clientMap.set(key, { id: a.id, name: a.cliente, isActivo, rubrosComprados: rubros });
    });

    let baseTotal = clientMap.size;
    let baseActivos = Array.from(clientMap.values()).filter(c => c.isActivo).length;

    const _faltan = Math.max(0, baseTotal - baseActivos);
    const _porcentaje = baseTotal > 0 ? (baseActivos / baseTotal) * 100 : 0;
    
    // Período laboral dinámico
    const mesInfo = getMesLaboralInfo();
    const diasTotales = mesInfo.totalWorkingDays;
    const diasTranscurridos = mesInfo.elapsedWorkingDays;
    const diasRestantes = mesInfo.remainingWorkingDays;
    
    const _ritmoRequerido = diasRestantes > 0 ? (_faltan / diasRestantes) : 0;
    const _proyeccionCierre = diasTranscurridos > 0 ? Math.round((baseActivos / diasTranscurridos) * diasTotales) : baseActivos;
    const _ritmoActual = diasTranscurridos > 0 ? (baseActivos / diasTranscurridos) : 0;

    // Métricas de Rubros (Salud de Cartera)
    let _faltantesPorActivar = 0;
    let _sinNingunRubro = 0;
    let _cienPorCientoActivados = 0;
    let totalRubrosComprados = 0;

    Array.from(clientMap.values()).forEach(c => {
       const numRubros = Math.min(5, c.rubrosComprados.size); // cap at 5 for the standard categories
       totalRubrosComprados += numRubros;
       
       if (numRubros === 0) _sinNingunRubro++;
       if (numRubros < 5) _faltantesPorActivar++;
       if (numRubros === 5) _cienPorCientoActivados++;
    });

    const _saludCartera = baseTotal > 0 ? (totalRubrosComprados / baseTotal) : 0;

    const clientList = Array.from(clientMap.entries()).map(([key, data], idx) => {
       const hasAceite = data.rubrosComprados.has('ACEITE');
       const hasAzucar = data.rubrosComprados.has('AZÚCAR') || data.rubrosComprados.has('AZUCAR');
       const hasPollo = data.rubrosComprados.has('POLLO');
       const hasEstandarAsturias = data.rubrosComprados.has('ESTANDAR Y SUPERIOR ASTURIAS');
       const hasMortadelaSalpicao = data.rubrosComprados.has('MORTADELA SALPICAO Y ASTURIAS');

       const count = [hasAceite, hasAzucar, hasPollo, hasEstandarAsturias, hasMortadelaSalpicao].filter(Boolean).length;

       return {
          codigo: data.id ? (data.id.startsWith('#') ? data.id : `#${data.id}`) : `#${idx + 1}`,
          razonSocial: data.name,
          hasAceite,
          hasAzucar,
          hasPollo,
          hasEstandarAsturias,
          hasMortadelaSalpicao,
          cobertura: count
       };
    });

    // Sort to make it ordered by client code number
    clientList.sort((a, b) => {
      const numA = parseInt(String(a.codigo).replace(/\D/g, '')) || 0;
      const numB = parseInt(String(b.codigo).replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    return {
       totalClientes: baseTotal,
       activos: baseActivos,
       faltan: _faltan,
       porcentaje: _porcentaje,
       ritmoRequerido: _ritmoRequerido,
       proyeccionCierre: _proyeccionCierre,
       ritmoActual: _ritmoActual,
       diasTotales,
       diasTranscurridos,
       diasRestantes,
       faltantesPorActivar: _faltantesPorActivar,
       sinNingunRubro: _sinNingunRubro,
       cienPorCientoActivados: _cienPorCientoActivados,
       saludCartera: _saludCartera,
       clientList
    };
  }, [filteredVolumen, filteredActivacion]);

  const isEnRitmo = ritmoActual >= ritmoRequerido;
  const totalCartera = (faltantesPorActivar + cienPorCientoActivados) || totalClientes || 1;

  const displayedClients = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return clientList
      .filter(c => {
        if (!term) return true;
        const nameMatch = (c.razonSocial || '').toLowerCase().includes(term);
        const codeMatch = (c.codigo || '').toLowerCase().includes(term);
        return nameMatch || codeMatch;
      })
      .filter(c => viewMode === 'personal' ? c.cobertura < 5 : true);
  }, [clientList, searchTerm, viewMode]);
  
  const generarPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const vendedorName = activeVendedorId === 'ADMIN' ? 'TODOS LOS VENDEDORES' : activeVendedorId;

    // Header Banner
    doc.setFillColor(185, 0, 0);
    doc.rect(0, 0, 210, 22, 'F');
    
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('CODIZULCA C.A. - GESTIÓN DE FUERZA DE VENTAS', 14, 10);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('REPORTE OFICIAL DE ACTIVACIÓN POR CLIENTE - CORTE SEPTIEMBRE 2026', 14, 17);

    // Meta details section
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Vendedor: ${vendedorName}`, 14, 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha de Emisión: 15/09/2026`, 140, 30);

    // Mini KPI Summary Box
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(14, 34, 182, 16, 2, 2, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(14, 34, 182, 16, 2, 2, 'S');

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('CARTERA TOTAL', 18, 39);
    doc.text('ACTIVADOS', 55, 39);
    doc.text('% COBERTURA', 90, 39);
    doc.text('META DIARIA', 125, 39);
    doc.text('CLIENTES 5/5', 160, 39);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(`${totalClientes} cli`, 18, 46);
    doc.text(`${activos} cli`, 55, 46);
    doc.text(`${porcentaje.toFixed(1)}%`, 90, 46);
    doc.text(`${ritmoRequerido.toFixed(1)} cli/d`, 125, 46);
    doc.text(`${cienPorCientoActivados} cli`, 160, 46);

    const filteredList = clientList.filter(c => 
      (c.razonSocial || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
      (c.codigo || '').toLowerCase().includes((searchTerm || '').toLowerCase())
    );

    const tableData = filteredList.map((client) => [
      client.codigo,
      client.razonSocial,
      client.hasAceite ? 'SI' : '-',
      client.hasAzucar ? 'SI' : '-',
      client.hasPollo ? 'SI' : '-',
      client.hasEstandarAsturias ? 'SI' : '-',
      client.hasMortadelaSalpicao ? 'SI' : '-',
      `${client.cobertura}/5 (${client.cobertura * 20}%)`
    ]);

    autoTable(doc, {
      startY: 54,
      head: [['Cód.', 'Razón Social / Cliente', 'Aceite', 'Azúcar', 'Pollo', 'Est. Asturias', 'Mort. Salpicao', 'Cobertura']],
      body: tableData.length > 0 ? tableData : [['-', 'Sin registros de clientes disponibles para el filtro actual', '-', '-', '-', '-', '-', '-']],
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [185, 0, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7.5
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 15, halign: 'center' },
        5: { cellWidth: 23, halign: 'center' },
        6: { cellWidth: 23, halign: 'center' },
        7: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          if (data.column.index >= 2 && data.column.index <= 6) {
            if (data.cell.raw === 'SI') {
              data.cell.styles.textColor = [16, 149, 79];
              data.cell.styles.fontStyle = 'bold';
            } else if (data.cell.raw === '-') {
              data.cell.styles.textColor = [160, 160, 160];
            }
          }
        }
      },
      didDrawPage: (data) => {
        // Page footer
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(`Página ${data.pageNumber} - Confidencial CODIZULCA C.A.`, 14, 290);
      }
    });

    doc.save(`Reporte_Clientes_${vendedorName.replace(/\s+/g, '_')}_Sept_2026.pdf`);
  };

  

  return (
    <div className="space-y-6">
      {/* Top Widgets from Design Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Widget 1: Activación General Clientes */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-sans font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-red-500" /> Activación General Clientes
            </h3>
            <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-xs font-mono font-bold px-2 py-1 rounded">
              {porcentaje.toFixed(1)}%
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 gap-3">
            <div>
              <div className="text-3xl sm:text-4xl font-mono text-white font-bold tracking-tight">
                {activos} <span className="text-base sm:text-lg text-neutral-500 font-sans font-normal">/ {totalClientes} cli</span>
              </div>
              <div className="text-xs font-sans text-neutral-400 mt-1">
                Faltan por activar: <span className="text-red-500 font-bold">{faltan} clientes</span>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-[10px] font-sans text-neutral-500 uppercase tracking-wider">Proyección Cierre</div>
              <div className="text-xl font-mono text-amber-400 font-bold tracking-tight">
                {proyeccionCierre} <span className="text-sm font-sans">cli</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden border border-neutral-800 mt-2">
            <div className="bg-red-600 h-full rounded-full" style={{ width: `${porcentaje}%` }}></div>
          </div>
        </div>

        {/* Widget 2: Meta Diaria Activación */}
        <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-xl p-5 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-emerald-900/10 rounded-full blur-2xl"></div>

          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="text-sm font-sans font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Meta Diaria Activación
            </h3>
            <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 text-xs font-mono font-bold px-3 py-1 rounded-full shrink-0">
              {diasRestantes}d rest.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-4 gap-3 relative z-10">
            <div>
              <div className="text-3xl sm:text-4xl font-mono text-amber-400 font-bold tracking-tight">
                {ritmoRequerido.toFixed(1)} <span className="text-base sm:text-lg text-white font-sans font-bold">CLI/DÍA</span>
              </div>
              <div className="text-xs font-sans text-neutral-400 mt-1">
                Activar <span className="text-amber-400 font-bold">~{Math.ceil(ritmoRequerido)} cli/día</span> en {diasRestantes} días hábiles ({faltan} cli faltantes).
              </div>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-900/50 px-3 py-1.5 rounded-full flex items-center justify-center gap-2 w-full sm:w-auto self-start sm:self-auto">
              <Target className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-xs font-sans font-bold text-emerald-400">Meta Requerida</span>
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-emerald-900/30 mt-4 relative z-10">
             <span className="text-xs font-sans text-neutral-400">Avance: <strong className="text-white font-mono text-sm">{ritmoActual.toFixed(1)} cli/d</strong></span>
             <div className={`px-3 py-1 rounded-full flex items-center gap-2 ${isEnRitmo ? 'bg-emerald-950/40 border border-emerald-900/50' : 'bg-red-950/40 border border-red-900/50'}`}>
               <div className={`w-2 h-2 rounded-full animate-pulse ${isEnRitmo ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
               <span className={`text-xs font-sans font-bold ${isEnRitmo ? 'text-emerald-400' : 'text-red-400'}`}>{isEnRitmo ? 'En ritmo' : 'Atrasado'}</span>
             </div>
          </div>
        </div>

      </div>

      {/* SECTION 2: MÓDULO DE ACTIVACIÓN POR CLIENTE */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden mt-6 flex flex-col">
        
        {/* Header / Vendedor Toolbar */}
        <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-neutral-900/20">
          
          <div className="flex items-center gap-3">
             <div className="relative">
                <div className="bg-red-600 p-2.5 rounded-lg flex items-center justify-center">
                   <User className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-neutral-950 rounded-full"></div>
             </div>
             
             <div>
                <div className="flex items-center gap-2 mb-1">
                   <Zap className="w-3.5 h-3.5 text-red-500" />
                   <h2 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider">
                     Módulo de Activación por Cliente
                   </h2>
                   <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-[9px] font-mono px-2 py-0.5 rounded-full uppercase ml-1">
                     Código: 004
                   </div>
                </div>
                <h3 className="text-lg md:text-xl font-sans font-bold text-white uppercase tracking-tight">
                  {activeVendedorId === 'ADMIN' ? 'REPORTE: ' : 'VENDEDOR: '} <span className="text-red-400">{activeVendedorId === 'ADMIN' ? 'GLOBAL (TODOS)' : activeVendedorId}</span>
                </h3>
             </div>
          </div>
          
          {/* Toggle Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
             <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shrink-0">
                 <button onClick={() => setViewMode('personal')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-sans transition-colors border-r ${viewMode === 'personal' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}`}>
                   <User className="w-3.5 h-3.5" /> Vista Personal
                 </button>
                 <button onClick={() => setViewMode('listado')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-sans transition-colors border-r ${viewMode === 'listado' ? 'font-bold text-white bg-red-600 border-red-700' : 'text-neutral-400 hover:text-white border-neutral-800'}`}>
                   <LayoutList className="w-3.5 h-3.5" /> Listado
                 </button>
                 <button onClick={() => setViewMode('tarjetas')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 md:px-4 py-2 md:py-1.5 text-[10px] md:text-xs font-sans transition-colors ${viewMode === 'tarjetas' ? 'font-bold text-white bg-red-600' : 'text-neutral-400 hover:text-white'}`}>
                   <Grip className="w-3.5 h-3.5" /> Tarjetas
                 </button>
             </div>
             <div className="flex items-center gap-2 w-full sm:w-auto">
                 <div className="relative flex-1 sm:flex-none">
                     <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                     <input 
                         type="text" 
                         placeholder="Buscar cliente..." 
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

        {/* Métricas Header */}
        <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950">
           <div className="flex items-center gap-2">
             <TriangleAlert className="w-4 h-4 text-neutral-400" />
             <h3 className="text-xs md:text-sm font-sans font-bold text-neutral-300 uppercase tracking-wider">
               Métricas de Activación & Clientes Faltantes
             </h3>
           </div>
           
           <div className="text-[10px] md:text-xs font-sans text-neutral-500">
             Salud de Cartera: <span className="text-emerald-400 font-bold">{saludCartera.toFixed(1)} / 5 Rubros Promedio</span>
           </div>
        </div>

        {/* Métricas Cards (Responsive Horizontal Scroll on Mobile) */}
        <div className="p-4 md:p-5 bg-neutral-950">
          <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 md:gap-4 md:grid md:grid-cols-3" style={{ WebkitOverflowScrolling: 'touch' }}>
             
             {/* Card 1: Faltantes por activar */}
             <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 flex flex-col min-w-[280px] sm:min-w-0 snap-start shrink-0 relative overflow-hidden">
                <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-red-900/5 rounded-full blur-2xl"></div>
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                   <h4 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                     <ShieldAlert className="w-4 h-4" /> Faltantes Por Activar
                   </h4>
                   <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-[9px] md:text-[10px] font-sans font-bold px-2 py-1 rounded-full">
                     {Math.round((faltantesPorActivar / totalClientes) * 100)}% Cartera
                   </div>
                </div>

                <div className="mb-2 relative z-10">
                   <div className="text-3xl md:text-4xl font-mono text-white font-bold tracking-tight">
                     {faltantesPorActivar} <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal">de {totalClientes} clientes</span>
                   </div>
                </div>

                <p className="text-[10px] md:text-xs font-sans text-neutral-400 mb-4 mt-1 leading-tight relative z-10">
                   Les falta comprar 1 o más rubros para completar la activación de 5 rubros
                </p>

                <div className="mt-auto relative z-10">
                   <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                      <div className="bg-red-500 h-full rounded-full" style={{ width: `${Math.min(100, (faltantesPorActivar / totalClientes) * 100)}%` }}></div>
                   </div>
                </div>
             </div>

             {/* Card 2: Sin ningún rubro */}
             <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 flex flex-col min-w-[280px] sm:min-w-0 snap-start shrink-0 relative overflow-hidden">
                <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-red-900/5 rounded-full blur-2xl"></div>

                <div className="flex justify-between items-start mb-4 relative z-10">
                   <h4 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-2">
                     <XCircle className="w-4 h-4" /> Sin Ningún Rubro (0/5)
                   </h4>
                   <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-[9px] md:text-[10px] font-sans font-bold px-2 py-1 rounded-full">
                     {Math.round((sinNingunRubro / totalClientes) * 100)}% Cartera
                   </div>
                </div>

                <div className="mb-2 relative z-10">
                   <div className="text-3xl md:text-4xl font-mono text-red-400 font-bold tracking-tight">
                     {sinNingunRubro} <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal text-white">de {totalClientes} clientes</span>
                   </div>
                </div>

                <p className="text-[10px] md:text-xs font-sans text-neutral-400 mb-4 mt-1 leading-tight relative z-10">
                   Atención prioritaria: clientes con 0 compras en la temporada
                </p>

                <div className="mt-auto relative z-10">
                   <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                      <div className="bg-red-600 h-full rounded-full" style={{ width: `${Math.min(100, (sinNingunRubro / totalClientes) * 100)}%` }}></div>
                   </div>
                </div>
             </div>

             {/* Card 3: 100% Activados */}
             <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 md:p-5 flex flex-col min-w-[280px] sm:min-w-0 snap-start shrink-0 relative overflow-hidden">
                <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-emerald-900/5 rounded-full blur-2xl"></div>

                <div className="flex justify-between items-start mb-4 relative z-10">
                   <h4 className="text-xs font-sans font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                     <CheckCircle2 className="w-4 h-4" /> 100% Activados (5/5)
                   </h4>
                   <div className="bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 text-[9px] md:text-[10px] font-sans font-bold px-2 py-1 rounded-full">
                     {Math.round((cienPorCientoActivados / totalClientes) * 100)}% Cobertura
                   </div>
                </div>

                <div className="mb-2 relative z-10">
                   <div className="text-3xl md:text-4xl font-mono text-emerald-400 font-bold tracking-tight">
                     {cienPorCientoActivados} <span className="text-xs md:text-sm text-neutral-500 font-sans font-normal text-white">de {totalClientes} clientes</span>
                   </div>
                </div>

                <p className="text-[10px] md:text-xs font-sans text-neutral-400 mb-4 mt-1 leading-tight relative z-10">
                   Clientes meta: cuentan con compras en los 5 rubros del programa
                </p>

                <div className="mt-auto relative z-10">
                   <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, (cienPorCientoActivados / totalClientes) * 100)}%` }}></div>
                   </div>
                </div>
             </div>

          </div>
        </div>

      </div>

      {/* SECTION 3: DETALLE DE COBERTURA POR CLIENTE */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden mt-6 flex flex-col">
         <div className="p-4 md:p-5 border-b border-neutral-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
           <div className="flex items-center gap-2">
             <LayoutList className="w-4 h-4 text-white bg-red-600 p-1 box-content rounded" />
             <div>
               <h2 className="text-base font-sans font-bold text-white uppercase tracking-wider">
                 Detalle de Cobertura por Cliente
               </h2>
               <p className="text-[11px] font-sans text-neutral-400">
                 Tilda cualquier rubro para desplegar su <strong>Dashboard 360° Histórico de Ventas y Activación</strong>.
               </p>
             </div>
           </div>

           {/* Barra rápida de rubros para tildar el Dashboard 360° */}
           <div className="flex flex-wrap items-center gap-1.5">
             {RUBROS_ACTIVACION.map((rCode) => {
               const active = selectedRubro === rCode;
               const rTheme = getRubroTheme(rCode);
               const IconComp = rTheme.icon;
               return (
                 <button
                   key={rCode}
                   onClick={() => toggleRubro360(rCode, true)}
                   className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-sans font-bold border transition-all cursor-pointer ${
                     active
                       ? `${rTheme.badgeCls} shadow ring-1 ring-white/10`
                       : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:text-white hover:border-neutral-600'
                   }`}
                 >
                   {active ? <CheckSquare className="w-3.5 h-3.5 text-red-400" /> : <Square className="w-3.5 h-3.5 opacity-60" />}
                   <IconComp className="w-3.5 h-3.5" />
                   <span>{RUBRO_LABEL[rCode]}</span>
                 </button>
               );
             })}
           </div>
         </div>

         {selectedRubro && (
           <div ref={dashboard360Ref} className="p-4 border-b border-neutral-800 bg-black/50 animate-in fade-in slide-in-from-top-2 duration-300">
             <RubroDashboard360
               selectedRubro={selectedRubro}
               onSelectRubro={(code) => setSelectedRubro(code)}
               onClose={() => setSelectedRubro(null)}
               vendedorFilter={vendedorFilter || activeVendedorId}
               vendedorDisplayName={activeVendedorId}
               filteredVolumen={filteredVolumen}
             />
           </div>
         )}

         {/* Desktop View: Table */}
         {viewMode !== 'tarjetas' && (<div className="hidden md:block overflow-x-auto">
           <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                 <tr className="bg-[#b90000] text-[10px] font-sans text-white uppercase tracking-wider">
                   <th className="p-3 font-bold border-r border-[#a00000] w-20 text-center">Codigo</th>
                   <th className="p-3 font-bold border-r border-[#a00000]">Razon Social</th>
                   <th onClick={() => toggleRubro360('ACEITE', true)} title="Tildar para ver Historial 360° de Aceite" className="p-3 font-bold text-center border-r border-[#a00000] w-24 cursor-pointer hover:bg-red-800 transition-colors">
                     <span className="inline-flex items-center gap-1">{selectedRubro === 'ACEITE' ? <CheckSquare className="w-3 h-3" /> : <Activity className="w-3 h-3 opacity-75" />} Aceite</span>
                   </th>
                   <th onClick={() => toggleRubro360('AZUCAR', true)} title="Tildar para ver Historial 360° de Azúcar" className="p-3 font-bold text-center border-r border-[#a00000] w-24 cursor-pointer hover:bg-red-800 transition-colors">
                     <span className="inline-flex items-center gap-1">{selectedRubro === 'AZUCAR' ? <CheckSquare className="w-3 h-3" /> : <Activity className="w-3 h-3 opacity-75" />} Azúcar</span>
                   </th>
                   <th onClick={() => toggleRubro360('POLLO', true)} title="Tildar para ver Historial 360° de Pollo" className="p-3 font-bold text-center border-r border-[#a00000] w-24 cursor-pointer hover:bg-red-800 transition-colors">
                     <span className="inline-flex items-center gap-1">{selectedRubro === 'POLLO' ? <CheckSquare className="w-3 h-3" /> : <Activity className="w-3 h-3 opacity-75" />} Pollo</span>
                   </th>
                   <th onClick={() => toggleRubro360('ESTANDAR_ASTURIAS', true)} title="Tildar para ver Historial 360° de Est. y Sup. Asturias" className="p-3 font-bold text-center border-r border-[#a00000] min-w-[120px] cursor-pointer hover:bg-red-800 transition-colors">
                     <span className="inline-flex items-center gap-1">{selectedRubro === 'ESTANDAR_ASTURIAS' ? <CheckSquare className="w-3 h-3" /> : <Activity className="w-3 h-3 opacity-75" />} Est. y Sup. Asturias</span>
                   </th>
                   <th onClick={() => toggleRubro360('MORTADELA_SALPICAO', true)} title="Tildar para ver Historial 360° de Mort. Salpicao y Asturias" className="p-3 font-bold text-center border-r border-[#a00000] min-w-[130px] cursor-pointer hover:bg-red-800 transition-colors">
                     <span className="inline-flex items-center gap-1">{selectedRubro === 'MORTADELA_SALPICAO' ? <CheckSquare className="w-3 h-3" /> : <Activity className="w-3 h-3 opacity-75" />} Mort. Salpicao y Asturias</span>
                   </th>
                   <th className="p-3 font-bold text-center w-32">Cobertura</th>
                 </tr>
              </thead>
              <tbody className="text-xs font-mono">
                {displayedClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center bg-[#0d0d0d] text-neutral-400 font-sans">
                      <Users className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                      <div className="text-white font-bold text-sm">No se encontraron clientes</div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {searchTerm ? `No existen clientes que coincidan con "${searchTerm}"` : 'No hay clientes registrados bajo los criterios actuales.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedClients.map((client, idx) => {
                    const bgClass = idx % 2 === 0 ? 'bg-[#141414]' : 'bg-[#0a0a0a]';
                    const getCell = (has: boolean, rCode: RubroCodigo) => has ? (
                       <td onClick={() => toggleRubro360(rCode, true)} title={`Ver Dashboard 360° de ${RUBRO_LABEL[rCode]}`} className="p-3 text-center border-r border-neutral-800/50 bg-emerald-950/20 text-emerald-400 font-bold cursor-pointer hover:bg-emerald-900/30 transition-colors">SI</td>
                    ) : (
                       <td onClick={() => toggleRubro360(rCode, true)} title={`Ver Dashboard 360° de ${RUBRO_LABEL[rCode]}`} className="p-3 text-center border-r border-neutral-800/50 bg-neutral-900/40 text-neutral-600 font-bold cursor-pointer hover:bg-neutral-800/50 transition-colors">-</td>
                    );

                    let badgeColor = 'border-red-900/50 bg-red-950/40 text-red-400';
                    if (client.cobertura === 5) badgeColor = 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400';
                    else if (client.cobertura >= 3) badgeColor = 'border-amber-900/50 bg-amber-950/40 text-amber-400';
                    
                    const percentage = client.cobertura * 20;

                    return (
                       <tr key={idx} className={`${bgClass} border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors`}>
                          <td className="p-3 border-r border-neutral-800/50 text-white font-sans text-center font-bold">{client.codigo}</td>
                          <td className="p-3 border-r border-neutral-800/50 font-sans font-bold text-white uppercase">{client.razonSocial}</td>
                          {getCell(client.hasAceite, 'ACEITE')}
                          {getCell(client.hasAzucar, 'AZUCAR')}
                          {getCell(client.hasPollo, 'POLLO')}
                          {getCell(client.hasEstandarAsturias, 'ESTANDAR_ASTURIAS')}
                          {getCell(client.hasMortadelaSalpicao, 'MORTADELA_SALPICAO')}
                          <td className="p-3 text-center">
                             <span className={`inline-block px-2 py-1 rounded-full border text-[10px] font-bold ${badgeColor}`}>
                                {client.cobertura}/5 ({percentage}%)
                             </span>
                          </td>
                       </tr>
                    );
                  })
                )}
              </tbody>
           </table>
         </div>)}
         {/* Mobile View: Cards */}
         <div className={`flex flex-col p-3 gap-3 bg-neutral-950 ${viewMode !== 'tarjetas' ? 'md:hidden' : 'md:grid md:grid-cols-2 lg:grid-cols-3'}`}>
            <div className="text-[10px] font-sans text-neutral-500 uppercase tracking-wider mb-1 px-1">Desglose por Cliente (Tilda un rubro para ver su historial 360°)</div>
            
            {displayedClients.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-neutral-900/40 border border-neutral-800 rounded-xl text-neutral-400">
                <Users className="w-8 h-8 mx-auto text-neutral-600 mb-2" />
                <div className="text-white font-bold text-sm">No se encontraron clientes</div>
                <div className="text-xs text-neutral-500 mt-1">
                  {searchTerm ? `Sin resultados para "${searchTerm}"` : 'No hay clientes registrados en esta cartera.'}
                </div>
              </div>
            ) : (
              displayedClients.map((client, idx) => {
               let badgeColor = 'border-red-900/50 bg-red-950/40 text-red-400';
               if (client.cobertura === 5) badgeColor = 'border-emerald-900/50 bg-emerald-950/40 text-emerald-400';
               else if (client.cobertura >= 3) badgeColor = 'border-amber-900/50 bg-amber-950/40 text-amber-400';
               const percentage = client.cobertura * 20;

               const getPill = (name: string, has: boolean, rCode: RubroCodigo) => has ? (
                  <button type="button" onClick={() => toggleRubro360(rCode, true)} className="bg-emerald-950/30 hover:bg-emerald-900/40 border border-emerald-900/50 text-emerald-400 text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition-colors">
                     {name}
                  </button>
               ) : (
                  <button type="button" onClick={() => toggleRubro360(rCode, true)} className="bg-neutral-900/50 hover:bg-neutral-800 border border-neutral-800 text-neutral-600 text-[9px] font-bold px-2 py-1 rounded line-through cursor-pointer transition-colors">
                     {name}
                  </button>
               );

               return (
                  <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                     <div className="flex justify-between items-start mb-2">
                        <span className="text-neutral-400 font-mono text-xs font-bold">{client.codigo}</span>
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold ${badgeColor}`}>
                           {client.cobertura}/5 ({percentage}%)
                        </span>
                     </div>
                     
                     <h4 className="text-white font-sans text-sm font-bold mb-3 uppercase leading-tight">
                       {client.razonSocial}
                     </h4>
                     
                     <div className="flex flex-wrap gap-1.5 border-t border-neutral-800 pt-3 mt-2">
                         {getPill('ACEITE', client.hasAceite, 'ACEITE')}
                         {getPill('AZÚCAR', client.hasAzucar, 'AZUCAR')}
                         {getPill('POLLO', client.hasPollo, 'POLLO')}
                         {getPill('EST. ASTURIAS', client.hasEstandarAsturias, 'ESTANDAR_ASTURIAS')}
                         {getPill('MORT. SALPICAO', client.hasMortadelaSalpicao, 'MORTADELA_SALPICAO')}
                     </div>
                  </div>
               );
              })
            )}
         </div>
      </div>

    </div>
  );
};
