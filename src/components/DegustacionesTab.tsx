import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, Clock, Users, CheckCircle2, AlertCircle, 
  XCircle, Plus, Search, FileText, ChevronLeft, ChevronRight, 
  Download, Phone, UserCheck, Package, 
  Send, Sparkles, MessageSquare, Shield, Check, X, Building2,
  CalendarCheck, Clock3, AlertTriangle, UserPlus, FileCheck2, RefreshCw
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Degustacion, 
  DegustacionConfig, 
  EstadoDegustacion, 
  TurnoDegustacion, 
  Role 
} from '../types';
import { 
  subscribeDegustaciones, 
  saveDegustacion, 
  updateDegustacion, 
  checkDateAvailability, 
  getLocalConfig, 
  DEFAULT_CONFIG,
  DEFAULT_HORARIO_MANANA,
  DEFAULT_HORARIO_TARDE,
  getWeekRange,
  countVendorDegustacionesInWeek,
  getNextAvailableBookingDate,
  syncAllDegustacionesToGerencia
} from '../services/degustacionesService';

interface DegustacionesTabProps {
  userRole: Role;
  vendedorName: string;
  activeVendedorId: string;
  clientesAsignados?: any[];
  onNavigateToTab?: (tabId: string) => void;
}

const PRODUCTOS_CATALOGO = [
  'ESPALDA',
  'ESTANDAR',
  'AHUMADO',
  'SUPERIOR',
  'PAVO',
  'MORTADELA',
  'ARROZ CON LECHE'
];

export const DegustacionesTab: React.FC<DegustacionesTabProps> = ({
  userRole,
  vendedorName,
  activeVendedorId,
  clientesAsignados = []
}) => {
  const isManager = userRole === 'ADMIN';

  // Sub-tabs unificadas: Disponibilidad, Agendar, Historial
  type SubTab = 'disponibilidad' | 'agendar' | 'historial';
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('disponibilidad');

  // Datos en tiempo real desde Firestore
  const [degustaciones, setDegustaciones] = useState<Degustacion[]>([]);
  const [config] = useState<DegustacionConfig>(getLocalConfig());
  const [isLoading, setIsLoading] = useState(true);

  // Filtros de búsqueda para el historial
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState<string>('');

  // Selector de mes para calendario
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => getNextAvailableBookingDate());

  // Modal de acción / detalle
  const [activeModalItem, setActiveModalItem] = useState<Degustacion | null>(null);
  const [modalActionType, setModalActionType] = useState<'aprobar' | 'rechazar' | 'realizada' | 'detalle' | null>(null);
  const [promotoraInput, setPromotoraInput] = useState('');
  const [notasTradeInput, setNotasTradeInput] = useState('');
  const [resultadoKilos, setResultadoKilos] = useState<number>(0);
  const [resultadoPersonas, setResultadoPersonas] = useState<number>(0);
  const [resultadoVentas, setResultadoVentas] = useState<string>('');
  const [resultadoComentarios, setResultadoComentarios] = useState<string>('');

  // Formulario de nueva degustación
  const [formClienteCodigo, setFormClienteCodigo] = useState('');
  const [formClienteNombre, setFormClienteNombre] = useState('');
  const [formClienteSearch, setFormClienteSearch] = useState('');
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false);
  const [formFecha, setFormFecha] = useState(() => getNextAvailableBookingDate());
  const [formTurno, setFormTurno] = useState<TurnoDegustacion>('MAÑANA');
  const [formHora, setFormHora] = useState<string>(DEFAULT_HORARIO_MANANA);
  const [formProductos, setFormProductos] = useState<string[]>(['ESPALDA', 'MORTADELA']);
  const [formKilos, setFormKilos] = useState<number>(5.0);
  const [formPersonas, setFormPersonas] = useState<number>(150);
  const [formRequierePromotora, setFormRequierePromotora] = useState<boolean>(true);
  const [formMaterialPop, setFormMaterialPop] = useState<boolean>(true);
  const [formContactoPunto, setFormContactoPunto] = useState('');
  const [formTelefonoContacto, setFormTelefonoContacto] = useState('');
  const [formObservaciones, setFormObservaciones] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccessMessage, setFormSuccessMessage] = useState<string | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);

  // Subscribirse a Firestore
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeDegustaciones((data) => {
      setDegustaciones(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Lista de clientes asignados únicos para el autocompletado
  const availableClientes = useMemo(() => {
    const map = new Map<string, { codigo: string; nombre: string; ruta?: string }>();
    (clientesAsignados || []).forEach(c => {
      if (c) {
        const codigo = String(c.id || c.codigo || '').trim();
        const nombre = String(c.cliente || c.nombre || c.razonSocial || '').trim();
        if (nombre) {
          const key = (codigo ? codigo.toUpperCase() : '') + ':::' + nombre.toUpperCase();
          if (!map.has(key)) {
            map.set(key, {
              codigo: codigo || 'PDV',
              nombre: nombre,
              ruta: c.vendedorId || c.vendedor || ''
            });
          }
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [clientesAsignados]);

  // Filtrado de clientes para autocompletado en el formulario
  const filteredClienteSuggestions = useMemo(() => {
    const q = (formClienteSearch || '').toLowerCase().trim();
    if (!q) {
      // Si el campo está vacío, sugerir los primeros 35 clientes de la cartera
      return availableClientes.slice(0, 35);
    }
    const cleanQ = q.replace(/^[#\s]+/, '').replace(/^c-/, '');
    return availableClientes
      .filter(c => {
        const nameMatch = c.nombre.toLowerCase().includes(q);
        const codeMatch = c.codigo.toLowerCase().includes(q);
        const codeClean = c.codigo.toLowerCase().replace(/^[#\s]+/, '').replace(/^c-/, '');
        const cleanCodeMatch = codeClean.includes(cleanQ);
        return nameMatch || codeMatch || cleanCodeMatch;
      })
      .slice(0, 35);
  }, [availableClientes, formClienteSearch]);

  // Manejo de cambio en el campo de código de cliente con búsqueda y carga automática del nombre
  const handleCodigoChange = (codigoVal: string) => {
    setFormClienteCodigo(codigoVal);
    const clean = codigoVal.replace(/^[#\s]+/, '').trim().toLowerCase();
    if (!clean) return;

    // Buscar coincidencia por código exacto o coincidencia quitando prefijo 'c-'
    const cleanNoPrefix = clean.replace(/^c-/, '');
    const found = availableClientes.find(c => {
      const cCode = c.codigo.replace(/^[#\s]+/, '').trim().toLowerCase();
      const cCodeNoPrefix = cCode.replace(/^c-/, '');
      return cCode === clean || cCodeNoPrefix === cleanNoPrefix || cCode === cleanNoPrefix || cCodeNoPrefix === clean;
    });

    if (found) {
      setFormClienteNombre(found.nombre);
      setFormClienteSearch(found.nombre);
      setShowClienteSuggestions(false);
    }
  };

  // Manejo de cambio en la barra de búsqueda / nombre del cliente
  const handleNombreOrSearchChange = (val: string) => {
    setFormClienteSearch(val);
    setFormClienteNombre(val);
    setShowClienteSuggestions(true);

    const clean = val.replace(/^[#\s]+/, '').trim().toLowerCase();
    if (!clean) {
      setFormClienteCodigo('');
      return;
    }

    // Si coincide exactamente con el código o nombre de algún cliente de la base de datos
    const exact = availableClientes.find(c => {
      const cName = c.nombre.trim().toLowerCase();
      const cCode = c.codigo.replace(/^[#\s]+/, '').trim().toLowerCase();
      return cName === clean || cCode === clean;
    });

    if (exact) {
      setFormClienteCodigo(exact.codigo);
      setFormClienteNombre(exact.nombre);
    }
  };

  // Selección directa desde el desplegable
  const handleSelectCliente = (c: { codigo: string; nombre: string; ruta?: string }) => {
    setFormClienteCodigo(c.codigo);
    setFormClienteNombre(c.nombre);
    setFormClienteSearch(c.nombre);
    setShowClienteSuggestions(false);
  };

  // Degustaciones visibles según el rol del usuario y filtros
  const visibleDegustaciones = useMemo(() => {
    return degustaciones.filter(d => {
      // Para vendedor: solo ve sus degustaciones personales
      if (!isManager) {
        const vendorKey = vendedorName.toUpperCase().trim();
        const dVendor = (d.vendedorNombre || '').toUpperCase().trim();
        const dVendorId = (d.vendedorId || '').toUpperCase().trim();
        const isOwner = dVendor.includes(vendorKey) || vendorKey.includes(dVendor) || 
                        dVendorId.includes(vendorKey) || vendorKey.includes(dVendorId);
        if (!isOwner) return false;
      } else {
        // Para admin: puede filtrar por vendedor
        if (filtroVendedor !== 'TODOS' && d.vendedorNombre !== filtroVendedor) {
          return false;
        }
      }

      // Filtro de estado
      if (filtroEstado !== 'TODOS' && d.estado !== filtroEstado) {
        return false;
      }

      // Filtro de búsqueda textual
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const matchCliente = (d.clienteNombre || '').toLowerCase().includes(q) || (d.clienteCodigo || '').toLowerCase().includes(q);
        const matchVendedor = (d.vendedorNombre || '').toLowerCase().includes(q);
        const matchRuta = (d.ruta || '').toLowerCase().includes(q);
        const matchProductos = (d.productos || []).some(p => p.toLowerCase().includes(q));
        const matchNotas = (d.notasTradeMarketing || '').toLowerCase().includes(q);
        return matchCliente || matchVendedor || matchRuta || matchProductos || matchNotas;
      }

      return true;
    });
  }, [degustaciones, isManager, vendedorName, filtroVendedor, filtroEstado, busqueda]);

  // Lista de vendedores únicos para el selector de filtro en historial (Admin)
  const listaVendedoresParaFiltro = useMemo(() => {
    const setV = new Set<string>();
    degustaciones.forEach(d => {
      if (d.vendedorNombre) setV.add(d.vendedorNombre);
    });
    return Array.from(setV).sort();
  }, [degustaciones]);

  // Métricas globales y personales
  const metricas = useMemo(() => {
    const list = isManager ? degustaciones : visibleDegustaciones;
    const total = list.length;
    const solicitadas = list.filter(d => d.estado === 'SOLICITADA').length;
    const aprobadas = list.filter(d => d.estado === 'APROBADA').length;
    const realizadas = list.filter(d => d.estado === 'REALIZADA').length;
    const rechazadas = list.filter(d => d.estado === 'RECHAZADA' || d.estado === 'CANCELADA').length;
    return { total, solicitadas, aprobadas, realizadas, rechazadas };
  }, [degustaciones, visibleDegustaciones, isManager]);

  // Conteo de degustaciones del vendedor en la semana de la fecha seleccionada en el formulario
  const weeklyUsage = useMemo(() => {
    if (!formFecha) return { count: 0, rangeLabel: '', isMaxReached: false };
    const count = countVendorDegustacionesInWeek(vendedorName || activeVendedorId, formFecha, degustaciones);
    const range = getWeekRange(formFecha);
    return {
      count,
      rangeLabel: range.label,
      isMaxReached: count >= 5
    };
  }, [formFecha, vendedorName, activeVendedorId, degustaciones]);

  // Comprobar disponibilidad de la fecha activa en el formulario
  const disponibilidadFechaSeleccionada = useMemo(() => {
    if (!formFecha) return null;
    return checkDateAvailability(formFecha, degustaciones, config);
  }, [formFecha, degustaciones, config]);

  // Comprobar disponibilidad de la fecha activa en el calendario
  const disponibilidadCalendarDate = useMemo(() => {
    if (!selectedCalendarDate) return null;
    return checkDateAvailability(selectedCalendarDate, degustaciones, config);
  }, [selectedCalendarDate, degustaciones, config]);

  // Asegurar que formHora tenga un valor inicial apropiado si está vacío
  useEffect(() => {
    if (!formHora) {
      setFormHora(formTurno === 'MAÑANA' ? DEFAULT_HORARIO_MANANA : DEFAULT_HORARIO_TARDE);
    }
  }, [formTurno, formHora]);

  // Navegación de meses para el calendario
  const handlePrevMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Días del mes para renderizar el calendario interactivo
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: { dayNumber: number; dateStr: string; isCurrentMonth: boolean; dayOfWeek: number }[] = [];
    
    // Padding inicial
    for (let i = 0; i < firstDay; i++) {
      days.push({ dayNumber: 0, dateStr: '', isCurrentMonth: false, dayOfWeek: i });
    }

    // Días reales del mes
    for (let d = 1; d <= totalDays; d++) {
      const currentD = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dayNumber: d, dateStr, isCurrentMonth: true, dayOfWeek: currentD.getDay() });
    }

    return days;
  }, [currentMonthDate]);

  // Manejar envío de nueva degustación por el vendedor
  const handleSubmitNuevaDegustacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSuccessMessage(null);
    setFormErrorMessage(null);

    const finalClienteNombre = formClienteNombre.trim() || formClienteSearch.trim();
    if (!finalClienteNombre) {
      setFormErrorMessage('Por favor selecciona o ingresa un cliente válido de tu cartera.');
      return;
    }

    if (!formFecha) {
      setFormErrorMessage('Debes seleccionar una fecha para la degustación.');
      return;
    }

    // 1. Validar límite semanal de 5 degustaciones por vendedor
    const weeklyCount = countVendorDegustacionesInWeek(vendedorName || activeVendedorId, formFecha, degustaciones);
    if (weeklyCount >= 5) {
      const { label } = getWeekRange(formFecha);
      setFormErrorMessage(`Has alcanzado el límite máximo de 5 degustaciones permitidas para la semana del ${label}.`);
      return;
    }

    // 2. Validar día de la semana (solo Jueves, Viernes y Sábado)
    const targetD = new Date(formFecha + 'T00:00:00');
    const dayOfWeek = targetD.getDay();
    if (dayOfWeek !== 4 && dayOfWeek !== 5 && dayOfWeek !== 6) {
      setFormErrorMessage('El calendario solo permite agendar degustaciones los días Jueves, Viernes y Sábados.');
      return;
    }

    // 3. Validar disponibilidad general de la fecha
    const avail = checkDateAvailability(formFecha, degustaciones, config);
    if (!avail.disponible) {
      setFormErrorMessage(`Fecha no disponible: ${avail.motivo || 'Cupo completo o anticipación insuficiente.'}`);
      return;
    }

    if (formTurno === 'MAÑANA' && avail.cuposMananaDisponibles <= 0) {
      setFormErrorMessage('El turno de la mañana ya completó el límite de 9 degustaciones para esta fecha. Selecciona el turno de la tarde o una fecha diferente.');
      return;
    }

    if (formTurno === 'TARDE' && avail.cuposTardeDisponibles <= 0) {
      setFormErrorMessage('El turno de la tarde ya completó el límite de 9 degustaciones para esta fecha. Selecciona el turno de la mañana o una fecha diferente.');
      return;
    }

    // Validar que el mismo cliente no esté agendado dos veces en el mismo turno en esta fecha
    const clienteYaAgendado = (formTurno === 'MAÑANA' ? avail.degustacionesManana : avail.degustacionesTarde).some(
      d => (d.clienteNombre && d.clienteNombre.trim().toUpperCase() === finalClienteNombre.trim().toUpperCase()) ||
           (d.clienteCodigo && formClienteCodigo && d.clienteCodigo.trim() === formClienteCodigo.trim() && formClienteCodigo.trim() !== 'PDV')
    );
    if (clienteYaAgendado) {
      setFormErrorMessage(`El cliente "${finalClienteNombre}" ya tiene una degustación registrada en el turno de la ${formTurno.toLowerCase()} para esta fecha.`);
      return;
    }

    if (formProductos.length === 0) {
      setFormErrorMessage('Selecciona al menos un producto a degustar.');
      return;
    }

    setFormSubmitting(true);
    try {
      const nueva: Degustacion = {
        id: `deg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        clienteCodigo: formClienteCodigo.trim() || 'PDV',
        clienteNombre: finalClienteNombre.toUpperCase(),
        vendedorNombre: vendedorName.trim().toUpperCase(),
        vendedorId: activeVendedorId,
        vendedorEmail: (vendedorName.toUpperCase().includes('MIKELANGELO') || vendedorName.toUpperCase().includes('SOTO') || activeVendedorId.toUpperCase().includes('SOTO') || activeVendedorId.toUpperCase().includes('MIKELANGELO'))
          ? 'Mikelangelodiaz@gmail.com'
          : undefined,
        ruta: activeVendedorId,
        fecha: formFecha,
        turno: formTurno,
        hora: formHora,
        productos: formProductos,
        kilosEstimados: Number(formKilos) || 5,
        personasEstimadas: Number(formPersonas) || 100,
        requierePromotora: formRequierePromotora,
        promotoraAsignada: '',
        materialPop: formMaterialPop,
        contactoPunto: formContactoPunto.trim(),
        telefonoContacto: formTelefonoContacto.trim(),
        observaciones: formObservaciones.trim(),
        estado: 'SOLICITADA',
        notasTradeMarketing: 'Solicitud agendada. En revisión por Trade Marketing para confirmación y asignación.',
        createdAt: new Date().toISOString()
      };

      await saveDegustacion(nueva);

      setFormSuccessMessage(`¡Degustación para "${nueva.clienteNombre}" agendada con éxito! Redirigiendo a tu historial de seguimiento...`);
      
      // Limpiar campos
      setFormClienteCodigo('');
      setFormClienteNombre('');
      setFormClienteSearch('');
      setFormContactoPunto('');
      setFormTelefonoContacto('');
      setFormObservaciones('');

      // Redirigir al historial tras 1.5 segundos
      setTimeout(() => {
        setActiveSubTab('historial');
        setFormSuccessMessage(null);
      }, 1500);
    } catch (err: any) {
      console.error("Error al registrar degustación:", err);
      setFormErrorMessage(`Error al guardar: ${err.message || 'Error de conexión'}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Manejar acciones del modal (Aprobar, Rechazar, Realizada)
  const handleConfirmModalAction = async () => {
    if (!activeModalItem) return;

    try {
      if (modalActionType === 'aprobar') {
        await updateDegustacion(activeModalItem.id, {
          estado: 'APROBADA',
          promotoraAsignada: promotoraInput.trim() || 'Por Asignar',
          notasTradeMarketing: notasTradeInput.trim() || 'Aprobada por Trade Marketing. Recursos asignados.'
        });
      } else if (modalActionType === 'rechazar') {
        await updateDegustacion(activeModalItem.id, {
          estado: 'RECHAZADA',
          notasTradeMarketing: notasTradeInput.trim() || 'Rechazada por Trade Marketing (fecha u operatividad).'
        });
      } else if (modalActionType === 'realizada') {
        await updateDegustacion(activeModalItem.id, {
          estado: 'REALIZADA',
          notasTradeMarketing: notasTradeInput.trim() || 'Degustación completada satisfactoriamente en punto de venta.',
          resultado: {
            kilosDegustados: Number(resultadoKilos) || activeModalItem.kilosEstimados,
            personasAlcanzadas: Number(resultadoPersonas) || activeModalItem.personasEstimadas,
            ventasGeneradas: resultadoVentas.trim() || 'Impacto positivo en rotación de producto',
            comentarios: resultadoComentarios.trim()
          }
        });
      }

      setActiveModalItem(null);
      setModalActionType(null);
    } catch (err) {
      console.error("Error al actualizar degustación:", err);
    }
  };

  // Exportar reporte de degustaciones a PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('landscape');
    const totalKilos = visibleDegustaciones.reduce((acc, d) => acc + (Number(d.kilosEstimados) || 0), 0);
    const visSolicitadas = visibleDegustaciones.filter(d => d.estado === 'SOLICITADA').length;
    const visAprobadas = visibleDegustaciones.filter(d => d.estado === 'APROBADA').length;
    const visRealizadas = visibleDegustaciones.filter(d => d.estado === 'REALIZADA').length;
    const visRechazadas = visibleDegustaciones.filter(d => d.estado === 'RECHAZADA' || d.estado === 'CANCELADA').length;
    
    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 28, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CODIZULCA - REPORTE DE DEGUSTACIONES', 14, 13);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-VE')} | Usuario: ${vendedorName} (${userRole}) | Filtro Estado: ${filtroEstado} | Vendedor: ${isManager ? filtroVendedor : vendedorName}`, 14, 20);
    doc.text(`Resumen: Total ${visibleDegustaciones.length} (Solicitadas: ${visSolicitadas} | Aprobadas: ${visAprobadas} | Realizadas: ${visRealizadas} | Rechazadas: ${visRechazadas}) | Total Kilos Est.: ${totalKilos.toFixed(1)} kg`, 14, 25);

    const tableData = visibleDegustaciones.map(d => [
      d.fecha,
      d.clienteNombre,
      d.vendedorNombre,
      d.turno,
      d.hora || '-',
      (d.productos || []).join(', '),
      `${Number(d.kilosEstimados || 0)} kg`,
      d.requierePromotora ? (d.promotoraAsignada || 'Solicitada') : 'No requerida',
      d.estado,
      d.notasTradeMarketing || '-'
    ]);

    if (visibleDegustaciones.length > 0) {
      tableData.push([
        'TOTAL',
        `${visibleDegustaciones.length} degustaciones`,
        '',
        '',
        '',
        `Aprob: ${visAprobadas} | Realiz: ${visRealizadas}`,
        `${totalKilos.toFixed(1)} kg`,
        '',
        '',
        ''
      ]);
    }

    autoTable(doc, {
      startY: 32,
      head: [['Fecha', 'Cliente / PDV', 'Vendedor', 'Turno', 'Hora', 'Productos', 'Kilos', 'Promotora', 'Estado', 'Seguimiento / Notas']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 42 },
        2: { cellWidth: 28 },
        3: { cellWidth: 16 },
        4: { cellWidth: 16 },
        5: { cellWidth: 42 },
        6: { cellWidth: 14 },
        7: { cellWidth: 26 },
        8: { cellWidth: 22 },
        9: { cellWidth: 45 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && visibleDegustaciones.length > 0 && data.row.index === tableData.length - 1) {
          data.cell.styles.fillColor = [226, 232, 240];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    doc.save(`Codizulca_Degustaciones_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const [isSyncingGerencia, setIsSyncingGerencia] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const handleSyncGerencia = async () => {
    setIsSyncingGerencia(true);
    setSyncStatusMsg(null);
    try {
      const res = await syncAllDegustacionesToGerencia(degustaciones);
      setSyncStatusMsg(`Sincronización con Gerencia completada: ${res.success} enviadas (${res.failed} errores).`);
      setTimeout(() => setSyncStatusMsg(null), 6000);
    } catch (err: any) {
      setSyncStatusMsg(`Error al sincronizar con Gerencia: ${err?.message || 'Error de red'}`);
      setTimeout(() => setSyncStatusMsg(null), 6000);
    } finally {
      setIsSyncingGerencia(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* BANNER PRINCIPAL: DEGUSTACIONES */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-amber-500 to-emerald-500" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-lg sm:text-xl md:text-2xl font-sans font-bold text-white tracking-tight">
                  Módulo de Degustaciones
                </h1>
                <span className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full border font-bold ${
                  isManager 
                    ? 'bg-amber-950/60 border-amber-800 text-amber-400'
                    : 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                }`}>
                  {isManager ? 'Supervisión / Trade Marketing' : 'Fuerza de Ventas'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-400">
                Agendamiento de degustaciones (Jueves, Viernes y Sábados | Habilitado hasta el Lunes a las 5:00 PM | Máx. 5 por vendedor/semana | 18 cupos diarios).
              </p>
            </div>
          </div>

          {/* ACCIONES SUPERIORES */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={handleSyncGerencia}
              disabled={isSyncingGerencia}
              title="Sincronizar degustaciones con el Dashboard de Gerencia (https://codizulca-dashboard-4.onrender.com)"
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-60 text-neutral-300 hover:text-white px-3 sm:px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-sans font-bold transition-all active:scale-95 touch-manipulation shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-emerald-400 ${isSyncingGerencia ? 'animate-spin' : ''}`} />
              <span>{isSyncingGerencia ? 'Sincronizando...' : 'Sincronizar Gerencia'}</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white px-3 sm:px-4 py-2.5 rounded-xl border border-neutral-800 text-xs font-sans font-bold transition-all active:scale-95 touch-manipulation shadow-sm"
            >
              <Download className="w-4 h-4 text-red-500" />
              <span>Exportar PDF</span>
            </button>

            <button
              onClick={() => setActiveSubTab('agendar')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all active:scale-95 touch-manipulation shadow-lg shadow-red-900/30"
            >
              <Plus className="w-4 h-4" />
              <span>Agendar Degustación</span>
            </button>
          </div>
        </div>

        {syncStatusMsg && (
          <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs font-sans flex items-center gap-2.5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncStatusMsg}</span>
          </div>
        )}

        {/* TARJETAS RESUMEN DE INDICADORES */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-neutral-900">
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
              {isManager ? 'Total Solicitudes' : 'Mis Solicitudes'}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-sans font-extrabold text-white">{metricas.total}</span>
              <span className="text-[10px] text-neutral-500">registradas</span>
            </div>
          </div>

          <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-amber-400 block mb-1">En Revisión</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-sans font-extrabold text-amber-400">{metricas.solicitadas}</span>
              <span className="text-[10px] text-amber-500/80">pendientes</span>
            </div>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">Aprobadas</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-sans font-extrabold text-emerald-400">{metricas.aprobadas}</span>
              <span className="text-[10px] text-emerald-500/80">confirmadas</span>
            </div>
          </div>

          <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-3">
            <span className="text-[10px] uppercase font-bold text-blue-400 block mb-1">Realizadas</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-sans font-extrabold text-blue-400">{metricas.realizadas}</span>
              <span className="text-[10px] text-blue-500/80">completadas</span>
            </div>
          </div>
        </div>
      </div>

      {/* PESTAÑAS: 1. DISPONIBILIDAD | 2. AGENDAR | 3. HISTORIAL */}
      <div className="flex border-b border-neutral-800 gap-2 pb-2 overflow-x-auto scrollbar-none no-scrollbar touch-pan-x">
        <button
          onClick={() => setActiveSubTab('disponibilidad')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap active:scale-95 touch-manipulation shrink-0 ${
            activeSubTab === 'disponibilidad'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          <span>Disponibilidad</span>
        </button>

        <button
          onClick={() => setActiveSubTab('agendar')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap active:scale-95 touch-manipulation shrink-0 ${
            activeSubTab === 'agendar'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Agendar</span>
        </button>

        <button
          onClick={() => setActiveSubTab('historial')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all whitespace-nowrap active:scale-95 touch-manipulation shrink-0 ${
            activeSubTab === 'historial'
              ? 'bg-red-600 text-white shadow-md shadow-red-900/30'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Historial y Seguimiento</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
            activeSubTab === 'historial' ? 'bg-black/40 text-white' : 'bg-neutral-800 text-neutral-300'
          }`}>
            {metricas.total}
          </span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* 1. VISTA AGENDAR: FORMULARIO DE RESERVA                         */}
      {/* ============================================================== */}
      {activeSubTab === 'agendar' && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 sm:p-6 md:p-8 shadow-xl max-w-4xl mx-auto">
          <div className="mb-6 pb-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-sans font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-red-500" />
                Agendar Nueva Degustación
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Completa los datos de tu cliente para coordinar fecha, promotora e inventario de Trade Marketing.
              </p>
            </div>

            {/* WIDGET DE CUPO SEMANAL (MÁXIMO 5 POR VENDEDOR) */}
            <div className={`p-3 rounded-xl border flex flex-col justify-center ${
              weeklyUsage.isMaxReached 
                ? 'bg-red-950/40 border-red-800/80 text-red-300'
                : 'bg-neutral-900/80 border-neutral-800 text-neutral-300'
            }`}>
              <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
                <span className="text-neutral-400">Cupo semanal:</span>
                <span className={weeklyUsage.isMaxReached ? 'text-red-400 font-extrabold' : 'text-emerald-400 font-extrabold'}>
                  {weeklyUsage.count} / 5 degustaciones
                </span>
              </div>
              <div className="w-full bg-neutral-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div 
                  className={`h-full transition-all ${
                    weeklyUsage.isMaxReached ? 'bg-red-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (weeklyUsage.count / 5) * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-neutral-500 mt-1 block">
                Semana: {weeklyUsage.rangeLabel}
              </span>
            </div>
          </div>

          {/* MENSAJES DE ESTADO */}
          {formSuccessMessage && (
            <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 p-4 rounded-xl text-xs sm:text-sm font-sans flex items-center gap-3 mb-6 animate-fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{formSuccessMessage}</span>
            </div>
          )}

          {formErrorMessage && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 p-4 rounded-xl text-xs sm:text-sm font-sans flex items-center gap-3 mb-6 animate-shake">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{formErrorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmitNuevaDegustacion} className="space-y-6">
            
            {/* BLOQUE 1: CLIENTE ASIGNADO */}
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  1. Selección de Cliente (Cartera Asignada)
                </h3>
                <span className="text-[11px] font-mono font-bold text-neutral-300 bg-neutral-950 border border-neutral-800 px-2.5 py-1 rounded-lg">
                  {availableClientes.length} clientes en base de datos
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* LÍNEA 1: CÓDIGO DEL CLIENTE (Búsqueda y carga automática) */}
                <div className="md:col-span-1">
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Código de Cliente
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ej: C-0104 o 104"
                      value={formClienteCodigo}
                      onChange={(e) => handleCodigoChange(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 uppercase font-mono"
                    />
                  </div>
                  <span className="text-[10px] text-neutral-400 mt-1 block">
                    Ingresa el código para cargar el nombre automáticamente
                  </span>
                </div>

                {/* LÍNEA 2: BARRA DE BÚSQUEDA Y NOMBRE DEL CLIENTE */}
                <div className="md:col-span-2 relative">
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Buscar Cliente por Nombre *
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="Escribe el nombre o haz clic para ver clientes..."
                      value={formClienteSearch}
                      onChange={(e) => handleNombreOrSearchChange(e.target.value)}
                      onFocus={() => setShowClienteSuggestions(true)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-10 pr-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 uppercase font-sans"
                    />
                  </div>

                  {/* SUGERENCIAS DE AUTOCOMPLETADO */}
                  {showClienteSuggestions && filteredClienteSuggestions.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-neutral-800">
                      <div className="p-2.5 bg-neutral-950 text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex justify-between items-center sticky top-0 border-b border-neutral-800">
                        <span>Clientes de tu cartera asignada ({filteredClienteSuggestions.length}):</span>
                        <button
                          type="button"
                          onClick={() => setShowClienteSuggestions(false)}
                          className="text-neutral-400 hover:text-white px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-800"
                        >
                          ✕ Cerrar
                        </button>
                      </div>
                      {filteredClienteSuggestions.map((c, idx) => (
                        <div
                          key={`${c.codigo}-${idx}`}
                          onClick={() => handleSelectCliente(c)}
                          className="p-3 hover:bg-neutral-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                        >
                          <div className="max-w-[75%]">
                            <span className="font-bold text-white block uppercase truncate">{c.nombre}</span>
                            <span className="text-[10px] text-neutral-400 font-mono">
                              Cód: <strong className="text-neutral-200">{c.codigo}</strong> {c.ruta ? `• Ruta: ${c.ruta}` : ''}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-red-400 bg-red-950/40 border border-red-900/40 px-2 py-1 rounded shrink-0">
                            Seleccionar
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* CONFIRMACIÓN DE CLIENTE SELECCIONADO */}
              {formClienteNombre && (
                <div className="mt-2.5 p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <span className="text-emerald-300 font-bold uppercase block text-xs sm:text-sm">
                        {formClienteNombre}
                      </span>
                      {formClienteCodigo && (
                        <span className="text-[10px] font-mono text-emerald-400/90">
                          Código PDV: #{formClienteCodigo}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormClienteCodigo('');
                      setFormClienteNombre('');
                      setFormClienteSearch('');
                      setShowClienteSuggestions(true);
                    }}
                    className="text-neutral-400 hover:text-white text-[11px] underline ml-2 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800"
                  >
                    Cambiar
                  </button>
                </div>
              )}
            </div>

            {/* BLOQUE 2: FECHA, TURNO Y HORA (SOLO JUEVES, VIERNES Y SÁBADOS) */}
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4" />
                2. Fecha y Horario (Solo Jueves, Viernes y Sábados)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* FECHA */}
                <div>
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Fecha de la Degustación *
                  </label>
                  <input
                    type="date"
                    required
                    value={formFecha}
                    onChange={(e) => setFormFecha(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                  
                  {/* VALIDACIÓN VISUAL DE DÍA */}
                  {formFecha && (
                    <div className="mt-1.5 text-[10px]">
                      {(() => {
                        const d = new Date(formFecha + 'T00:00:00');
                        const day = d.getDay();
                        const isAllowed = day === 4 || day === 5 || day === 6;
                        const dayName = d.toLocaleDateString('es-VE', { weekday: 'long' });
                        if (isAllowed) {
                          return (
                            <span className="text-emerald-400 font-bold flex items-center gap-1 capitalize">
                              <CheckCircle2 className="w-3 h-3" /> Día habilitado ({dayName})
                            </span>
                          );
                        }
                        return (
                          <span className="text-red-400 font-bold flex items-center gap-1 capitalize">
                            <AlertTriangle className="w-3 h-3" /> Solo Jueves, Viernes o Sábados (seleccionaste {dayName})
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* TURNO */}
                <div>
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Turno *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormTurno('MAÑANA');
                        setFormHora(DEFAULT_HORARIO_MANANA);
                      }}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                        formTurno === 'MAÑANA'
                          ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-900/30'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      Mañana (9 am a 1 pm)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormTurno('TARDE');
                        setFormHora(DEFAULT_HORARIO_TARDE);
                      }}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                        formTurno === 'TARDE'
                          ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-900/30'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                      }`}
                    >
                      Tarde (2 pm a 7 pm)
                    </button>
                  </div>
                </div>

                {/* HORARIO MODIFICABLE */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider">
                      Horario de Degustación * (Modificable)
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    value={formHora}
                    onChange={(e) => setFormHora(e.target.value)}
                    placeholder={formTurno === 'MAÑANA' ? '09:00 AM - 01:00 PM' : '02:00 PM - 07:00 PM'}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              {/* AVISO DE CUPOS EN LA FECHA */}
              {disponibilidadFechaSeleccionada && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  disponibilidadFechaSeleccionada.disponible 
                    ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-300' 
                    : 'bg-red-950/40 border-red-900/50 text-red-300'
                }`}>
                  <span className="flex items-center gap-1.5 font-bold">
                    <Clock3 className="w-4 h-4" />
                    {disponibilidadFechaSeleccionada.disponible
                      ? `Cupos en esta fecha: ${disponibilidadFechaSeleccionada.cuposDisponibles} libres (${disponibilidadFechaSeleccionada.cuposMananaDisponibles} en Mañana 9am-1pm / ${disponibilidadFechaSeleccionada.cuposTardeDisponibles} en Tarde 2pm-7pm)`
                      : disponibilidadFechaSeleccionada.motivo || 'Fecha no disponible.'}
                  </span>
                </div>
              )}
            </div>

            {/* BLOQUE 3: PRODUCTOS Y ESTIMACIONES */}
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                3. Catálogo de Productos y Volumen
              </h3>

              <div>
                <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                  Productos a degustar * (Selecciona uno o más)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {PRODUCTOS_CATALOGO.map((prod) => {
                    const isChecked = formProductos.includes(prod);
                    return (
                      <div
                        key={prod}
                        onClick={() => {
                          if (isChecked) {
                            setFormProductos(prev => prev.filter(p => p !== prod));
                          } else {
                            setFormProductos(prev => [...prev, prod]);
                          }
                        }}
                        className={`p-3 rounded-xl border text-xs font-sans cursor-pointer transition-all flex items-center gap-2.5 select-none ${
                          isChecked
                            ? 'bg-red-950/40 border-red-600 text-white font-bold'
                            : 'bg-neutral-900/80 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          isChecked ? 'bg-red-600 border-red-500 text-white' : 'border-neutral-700 bg-neutral-950'
                        }`}>
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="truncate">{prod}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Kilos Estimados (Kg) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="50"
                    required
                    value={formKilos}
                    onChange={(e) => setFormKilos(parseFloat(e.target.value) || 0)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Personas Estimadas a Impactar *
                  </label>
                  <input
                    type="number"
                    step="10"
                    min="10"
                    max="1000"
                    required
                    value={formPersonas}
                    onChange={(e) => setFormPersonas(parseInt(e.target.value) || 0)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* BLOQUE 4: RECURSOS Y CONTACTO EN PDV */}
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-xs font-sans font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                4. Recursos y Contacto en Punto de Venta
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 bg-neutral-900 border border-neutral-800 rounded-xl cursor-pointer hover:border-neutral-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={formRequierePromotora}
                    onChange={(e) => setFormRequierePromotora(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500 bg-neutral-950 border-neutral-700"
                  />
                  <span className="text-xs font-bold text-white">Requiere Promotora / Impulsadora</span>
                </label>

                <label className="flex items-center gap-3 p-3 bg-neutral-900 border border-neutral-800 rounded-xl cursor-pointer hover:border-neutral-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={formMaterialPop}
                    onChange={(e) => setFormMaterialPop(e.target.checked)}
                    className="w-4 h-4 rounded text-red-600 focus:ring-red-500 bg-neutral-950 border-neutral-700"
                  />
                  <span className="text-xs font-bold text-white">Requiere Material POP / Stand</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Persona de Contacto en PDV *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Sr. Manuel Rincón (Gerente de Tienda)"
                    value={formContactoPunto}
                    onChange={(e) => setFormContactoPunto(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                    Teléfono de Contacto *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej: +58 414-1234567"
                    value={formTelefonoContacto}
                    onChange={(e) => setFormTelefonoContacto(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider mb-2">
                  Observaciones / Instrucciones Especiales
                </label>
                <textarea
                  rows={3}
                  placeholder="Detalles de ubicación del stand, acceso a electricidad, requerimientos de cocción, etc."
                  value={formObservaciones}
                  onChange={(e) => setFormObservaciones(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 font-sans"
                />
              </div>
            </div>

            {/* BOTÓN ENVIAR */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={formSubmitting || weeklyUsage.isMaxReached}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white px-8 py-3.5 rounded-xl font-sans font-bold text-sm transition-all shadow-lg shadow-red-900/40 active:scale-95 touch-manipulation"
              >
                {formSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Enviando Solicitud...</span>
                  </>
                ) : weeklyUsage.isMaxReached ? (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    <span>Límite semanal alcanzado (5/5)</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Enviar Solicitud a Trade Marketing</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. VISTA DISPONIBILIDAD: CALENDARIO INTERACTIVO                 */}
      {/* ============================================================== */}
      {activeSubTab === 'disponibilidad' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* CALENDARIO MENSUAL */}
          <div className="lg:col-span-8 bg-neutral-950 border border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-sm sm:text-base font-sans font-bold text-white flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-red-500" />
                  Calendario de Cupos y Disponibilidad
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Días habilitados: <strong className="text-white">Jueves, Viernes y Sábados</strong> | Cierre de agendamiento: <strong className="text-red-400">Lunes 5:00 PM posterior</strong>.
                </p>
              </div>

              {/* Selector de Mes */}
              <div className="flex items-center justify-between sm:justify-start gap-2 bg-neutral-900 border border-neutral-800 rounded-xl p-1 self-start sm:self-auto w-full sm:w-auto">
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 hover:bg-neutral-800 active:scale-90 text-neutral-400 hover:text-white rounded-lg transition-all touch-manipulation"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-sans font-bold text-white px-3 uppercase text-center flex-1 sm:flex-initial">
                  {currentMonthDate.toLocaleString('es-VE', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 hover:bg-neutral-800 active:scale-90 text-neutral-400 hover:text-white rounded-lg transition-all touch-manipulation"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* LEYENDA */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 bg-neutral-900/50 border border-neutral-800/80 rounded-xl text-[11px] text-neutral-300">
              <div className="flex flex-wrap gap-3 items-center">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  Disponible (Jue-Vie-Sáb)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  Cupos Limitados
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                  Agotado
                </span>
                <span className="flex items-center gap-1.5 text-neutral-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-700 shrink-0" />
                  Cerró Lun 5pm / No hab.
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-900/50">
                <span>📌 Límite: Máx 5 degustaciones por vendedor / semana</span>
              </div>
            </div>

            {/* DÍAS DE LA SEMANA */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider">
              <span className="text-neutral-600">Dom</span>
              <span className="text-neutral-600">Lun</span>
              <span className="text-neutral-600">Mar</span>
              <span className="text-neutral-600">Mié</span>
              <span className="text-red-400 font-extrabold">Jue</span>
              <span className="text-red-400 font-extrabold">Vie</span>
              <span className="text-red-400 font-extrabold">Sáb</span>
            </div>

            {/* GRID DE FECHAS */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calendarDays.map((cDay, idx) => {
                if (!cDay.isCurrentMonth) {
                  return <div key={idx} className="min-h-[52px] sm:h-18 bg-neutral-950/20 rounded-xl border border-neutral-900/20 opacity-20" />;
                }

                const isAllowedDay = cDay.dayOfWeek === 4 || cDay.dayOfWeek === 5 || cDay.dayOfWeek === 6;
                const avail = checkDateAvailability(cDay.dateStr, degustaciones, config);
                const isSelected = selectedCalendarDate === cDay.dateStr;

                let badgeColor = 'bg-neutral-950 border-neutral-900 text-neutral-600 opacity-40 cursor-not-allowed';
                let statusText = 'No habilitado';

                if (isAllowedDay) {
                  if (avail.disponible) {
                    if (avail.cuposDisponibles <= 2) {
                      badgeColor = 'bg-amber-950/30 border-amber-800/60 text-amber-300 hover:border-amber-500 cursor-pointer';
                      statusText = `${avail.cuposDisponibles} cupos`;
                    } else {
                      badgeColor = 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300 hover:border-emerald-500 cursor-pointer';
                      statusText = `${avail.cuposDisponibles} cupos`;
                    }
                  } else if (avail.cuposOcupados >= avail.cuposTotales && avail.cuposTotales > 0) {
                    badgeColor = 'bg-red-950/30 border-red-800/60 text-red-400 cursor-pointer';
                    statusText = 'Agotado';
                  } else {
                    badgeColor = 'bg-neutral-900 border-neutral-800 text-neutral-500 cursor-pointer';
                    statusText = avail.motivo && (avail.motivo.includes('Lunes a las 5:00 PM') || avail.motivo.includes('Lunes a las 12:00 PM')) ? 'Cerró Lun 5pm' : 'No disponible';
                  }
                }

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedCalendarDate(cDay.dateStr);
                      setFormFecha(cDay.dateStr);
                    }}
                    className={`min-h-[52px] sm:h-18 p-2 rounded-xl border flex flex-col justify-between transition-all select-none active:scale-95 touch-manipulation ${badgeColor} ${
                      isSelected ? 'ring-2 ring-red-500 border-red-500 scale-[1.02] shadow-lg shadow-red-900/30 bg-red-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-xs sm:text-sm ${isAllowedDay ? 'text-white' : 'text-neutral-600'}`}>
                        {cDay.dayNumber}
                      </span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-sans font-medium truncate leading-tight">
                      {statusText}
                    </div>
                    {isAllowedDay && avail.disponible && (
                      <div className="text-[8px] text-neutral-400 font-mono hidden sm:block leading-none">
                        M:{avail.cuposMananaDisponibles} T:{avail.cuposTardeDisponibles}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* DETALLE DE CUPOS DEL DÍA SELECCIONADO */}
          <div className="lg:col-span-4 bg-neutral-950 border border-neutral-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-sans font-bold text-white uppercase tracking-wider">
                  Detalle de la Fecha
                </h3>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 mb-4">
                <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Fecha</span>
                <span className="text-base font-sans font-extrabold text-white capitalize block">
                  {selectedCalendarDate ? new Date(selectedCalendarDate + 'T00:00:00').toLocaleDateString('es-VE', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : 'Ninguna seleccionada'}
                </span>

                {disponibilidadCalendarDate && (
                  <div className="mt-4 pt-3 border-t border-neutral-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Estado:</span>
                      <span className={`font-bold px-2.5 py-0.5 rounded-full text-[10px] uppercase ${
                        disponibilidadCalendarDate.disponible 
                          ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                          : 'bg-red-950 border border-red-800 text-red-400'
                      }`}>
                        {disponibilidadCalendarDate.disponible ? 'Habilitado' : 'No Disponible'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Mañana (09 am a 1 pm):</span>
                      <span className="font-mono font-bold text-white">
                        {disponibilidadCalendarDate.cuposMananaDisponibles} de 9 libres
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Tarde (2 pm a 7 pm):</span>
                      <span className="font-mono font-bold text-white">
                        {disponibilidadCalendarDate.cuposTardeDisponibles} de 9 libres
                      </span>
                    </div>

                    {disponibilidadCalendarDate.motivo && (
                      <p className="text-[11px] text-amber-400 bg-amber-950/30 p-2 rounded-lg border border-amber-900/40">
                        ℹ {disponibilidadCalendarDate.motivo}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* DETALLE DE TURNOS Y DEGUSTACIONES */}
              {disponibilidadCalendarDate && (
                <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
                  {/* MAÑANA */}
                  <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">Mañana (9 am a 1 pm)</span>
                        <span className="text-[10px] text-neutral-400 font-mono">Horario modificable</span>
                      </div>
                      <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                        disponibilidadCalendarDate.cuposMananaDisponibles > 0
                          ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                          : 'bg-red-950 border-red-800 text-red-400'
                      }`}>
                        {disponibilidadCalendarDate.cuposMananaDisponibles} de 9 libres
                      </span>
                    </div>

                    {(disponibilidadCalendarDate?.degustacionesManana || []).length > 0 && (
                      <div className="pt-2 border-t border-neutral-800 space-y-1.5">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block">Agendadas:</span>
                        {(disponibilidadCalendarDate?.degustacionesManana || []).map((d, idx) => (
                          <div key={`${d.id}-${idx}`} className="text-[10px] bg-neutral-950 p-2 rounded-lg border border-neutral-800 flex items-center justify-between">
                            <span className="font-bold text-white truncate max-w-[130px] uppercase">{d.clienteNombre}</span>
                            <span className="text-red-400 font-mono text-[9px] shrink-0">{d.hora || '09:00 AM - 01:00 PM'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* TARDE */}
                  <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">Tarde (2 pm a 7 pm)</span>
                        <span className="text-[10px] text-neutral-400 font-mono">Horario modificable</span>
                      </div>
                      <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                        disponibilidadCalendarDate.cuposTardeDisponibles > 0
                          ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                          : 'bg-red-950 border-red-800 text-red-400'
                      }`}>
                        {disponibilidadCalendarDate.cuposTardeDisponibles} de 9 libres
                      </span>
                    </div>

                    {(disponibilidadCalendarDate?.degustacionesTarde || []).length > 0 && (
                      <div className="pt-2 border-t border-neutral-800 space-y-1.5">
                        <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block">Agendadas:</span>
                        {(disponibilidadCalendarDate?.degustacionesTarde || []).map((d, idx) => (
                          <div key={`${d.id}-${idx}`} className="text-[10px] bg-neutral-950 p-2 rounded-lg border border-neutral-800 flex items-center justify-between">
                            <span className="font-bold text-white truncate max-w-[130px] uppercase">{d.clienteNombre}</span>
                            <span className="text-red-400 font-mono text-[9px] shrink-0">{d.hora || '02:00 PM - 07:00 PM'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* BOTÓN PARA IR A AGENDAR */}
            <div className="mt-5 pt-4 border-t border-neutral-800">
              <button
                onClick={() => {
                  setFormFecha(selectedCalendarDate);
                  setActiveSubTab('agendar');
                }}
                disabled={!disponibilidadCalendarDate?.disponible}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white p-3 rounded-xl font-sans font-bold text-xs transition-all shadow-md shadow-red-900/30 active:scale-95 touch-manipulation"
              >
                <Plus className="w-4 h-4" />
                <span>Agendar en esta fecha</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. VISTA HISTORIAL: SEGUIMIENTO COMPLETO DE DEGUSTACIONES       */}
      {/* ============================================================== */}
      {activeSubTab === 'historial' && (
        <div className="space-y-6">
          
          {/* BARRA DE FILTROS Y BÚSQUEDA */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro por estado */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-400">Estado:</span>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 text-xs font-sans font-bold text-white rounded-xl px-3 py-2 outline-none cursor-pointer"
                >
                  <option value="TODOS">Todos ({metricas.total})</option>
                  <option value="SOLICITADA">Solicitadas ({metricas.solicitadas})</option>
                  <option value="APROBADA">Aprobadas ({metricas.aprobadas})</option>
                  <option value="REALIZADA">Realizadas ({metricas.realizadas})</option>
                  <option value="RECHAZADA">Rechazadas ({metricas.rechazadas})</option>
                </select>
              </div>

              {/* Filtro por vendedor (Solo visible para Admin) */}
              {isManager && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-400">Vendedor:</span>
                  <select
                    value={filtroVendedor}
                    onChange={(e) => setFiltroVendedor(e.target.value)}
                    className="bg-neutral-900 border border-neutral-800 text-xs font-sans font-bold text-white rounded-xl px-3 py-2 outline-none cursor-pointer"
                  >
                    <option value="TODOS">Todos los vendedores</option>
                    {listaVendedoresParaFiltro.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Búsqueda en vivo */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar cliente, ruta, producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* LISTA / TARJETAS DE SEGUIMIENTO */}
          {visibleDegustaciones.length === 0 ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-12 text-center">
              <CalendarCheck className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
              <h3 className="text-sm font-sans font-bold text-white mb-1">No hay degustaciones registradas</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto mb-4">
                No se encontraron solicitudes que coincidan con los filtros seleccionados.
              </p>
              <button
                onClick={() => setActiveSubTab('agendar')}
                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-xl text-xs font-sans font-bold transition-all shadow-md shadow-red-900/30"
              >
                <Plus className="w-4 h-4" />
                <span>Agendar Primera Degustación</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleDegustaciones.map((d) => {
                const isSolicitada = d.estado === 'SOLICITADA';
                const isAprobada = d.estado === 'APROBADA';
                const isRealizada = d.estado === 'REALIZADA';
                const isRechazada = d.estado === 'RECHAZADA' || d.estado === 'CANCELADA';

                return (
                  <div 
                    key={d.id} 
                    className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all relative overflow-hidden group"
                  >
                    {/* Barra lateral de estado */}
                    <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${
                      isSolicitada ? 'bg-amber-500' :
                      isAprobada ? 'bg-emerald-500' :
                      isRealizada ? 'bg-blue-500' : 'bg-red-500'
                    }`} />

                    <div className="space-y-3.5 pl-1.5">
                      {/* HEADER TARJETA: CLIENTE & BADGE */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-mono text-neutral-400 block mb-0.5">
                            {d.clienteCodigo || 'PDV'}
                          </span>
                          <h4 className="text-sm font-sans font-extrabold text-white uppercase leading-snug">
                            {d.clienteNombre}
                          </h4>
                        </div>

                        <span className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-full uppercase shrink-0 border ${
                          isSolicitada ? 'bg-amber-950/60 border-amber-800 text-amber-300' :
                          isAprobada ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' :
                          isRealizada ? 'bg-blue-950/60 border-blue-800 text-blue-300' :
                          'bg-red-950/60 border-red-800 text-red-300'
                        }`}>
                          {d.estado}
                        </span>
                      </div>

                      {/* DATOS DE LA DEGUSTACIÓN */}
                      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-3 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400 flex items-center gap-1.5">
                            <CalendarIcon className="w-3.5 h-3.5 text-red-500" /> Fecha:
                          </span>
                          <span className="font-bold text-white font-mono">{d.fecha}</span>
                        </div>

                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-red-500" /> Turno / Hora:
                          </span>
                          <span className="font-bold text-white font-mono">{d.turno} ({d.hora || 'Flexible'})</span>
                        </div>

                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-red-500" /> Kilos:
                          </span>
                          <span className="font-bold text-emerald-400 font-mono">{d.kilosEstimados} kg</span>
                        </div>

                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400 flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-red-500" /> Promotora:
                          </span>
                          <span className="font-bold text-white">
                            {d.requierePromotora ? (d.promotoraAsignada || 'Por Asignar') : 'No requerida'}
                          </span>
                        </div>

                        {isManager && (
                          <div className="flex items-center justify-between text-neutral-300 pt-1 border-t border-neutral-800">
                            <span className="text-neutral-400">Vendedor:</span>
                            <span className="font-bold text-white truncate max-w-[160px]">{d.vendedorNombre}</span>
                          </div>
                        )}
                      </div>

                      {/* PRODUCTOS */}
                      <div>
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                          Productos a Degustar:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {(d.productos || []).map((p, idx) => (
                            <span key={`${p}-${idx}`} className="text-[10px] bg-neutral-900 border border-neutral-800 text-neutral-300 px-2 py-0.5 rounded-md">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* NOTAS DE SEGUIMIENTO TRADE MARKETING */}
                      {d.notasTradeMarketing && (
                        <div className="p-2.5 bg-neutral-900/80 border border-neutral-800 rounded-xl text-[11px] text-neutral-300 flex items-start gap-2">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="leading-tight">
                            <strong className="text-white block text-[10px] uppercase font-bold">Seguimiento Trade Marketing:</strong>
                            <span>{d.notasTradeMarketing}</span>
                          </div>
                        </div>
                      )}

                      {/* RESULTADO (SI YA FUE REALIZADA) */}
                      {d.resultado && (
                        <div className="p-2.5 bg-blue-950/30 border border-blue-900/50 rounded-xl text-[11px] text-blue-300 space-y-1">
                          <strong className="text-blue-400 block text-[10px] uppercase font-bold">Resultados Obtenidos:</strong>
                          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                            <span>Kilos: {d.resultado.kilosDegustados} kg</span>
                            <span>Personas: {d.resultado.personasAlcanzadas}</span>
                          </div>
                          {d.resultado.ventasGeneradas && (
                            <div className="text-[10px] font-sans">Ventas: {d.resultado.ventasGeneradas}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ACCIONES INFERIORES */}
                    <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-end gap-2 pl-1.5">
                      <button
                        onClick={() => {
                          setActiveModalItem(d);
                          setModalActionType('detalle');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs font-bold transition-all active:scale-95"
                      >
                        Ver Detalle
                      </button>

                      {/* ACCIONES DE GERENCIA (ADMIN) */}
                      {isManager && (
                        <>
                          {isSolicitada && (
                            <>
                              <button
                                onClick={() => {
                                  setActiveModalItem(d);
                                  setModalActionType('aprobar');
                                  setPromotoraInput(d.promotoraAsignada || '');
                                  setNotasTradeInput(d.notasTradeMarketing || '');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all active:scale-95 shadow-sm shadow-emerald-900/30"
                              >
                                Aprobar
                              </button>
                              <button
                                onClick={() => {
                                  setActiveModalItem(d);
                                  setModalActionType('rechazar');
                                  setNotasTradeInput('');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900 text-red-300 border border-red-800 text-xs font-bold transition-all active:scale-95"
                              >
                                Rechazar
                              </button>
                            </>
                          )}

                          {isAprobada && (
                            <button
                              onClick={() => {
                                setActiveModalItem(d);
                                setModalActionType('realizada');
                                setResultadoKilos(d.kilosEstimados);
                                setResultadoPersonas(d.personasEstimadas);
                                setResultadoVentas('');
                                setResultadoComentarios('');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all active:scale-95 shadow-sm shadow-blue-900/30"
                            >
                              Marcar Realizada
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL DE ACCIÓN / DETALLE                                       */}
      {/* ============================================================== */}
      {activeModalItem && modalActionType && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-sans font-bold text-white flex items-center gap-2">
                {modalActionType === 'aprobar' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {modalActionType === 'rechazar' && <XCircle className="w-5 h-5 text-red-500" />}
                {modalActionType === 'realizada' && <FileCheck2 className="w-5 h-5 text-blue-500" />}
                {modalActionType === 'detalle' && <FileText className="w-5 h-5 text-neutral-400" />}
                
                {modalActionType === 'aprobar' && 'Aprobar Solicitud de Degustación'}
                {modalActionType === 'rechazar' && 'Rechazar Solicitud de Degustación'}
                {modalActionType === 'realizada' && 'Registrar Resultados de Degustación'}
                {modalActionType === 'detalle' && 'Detalle Completo de Degustación'}
              </h3>
              <button
                onClick={() => {
                  setActiveModalItem(null);
                  setModalActionType(null);
                }}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* RESUMEN DEL REGISTRO */}
            <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-3.5 space-y-1.5 text-xs">
              <div className="text-white font-bold text-sm uppercase">{activeModalItem.clienteNombre}</div>
              <div className="text-neutral-400">
                Fecha: <strong className="text-white font-mono">{activeModalItem.fecha}</strong> | Turno: <strong className="text-white">{activeModalItem.turno} ({activeModalItem.hora || 'Flexible'})</strong>
              </div>
              <div className="text-neutral-400">
                Vendedor: <strong className="text-white">{activeModalItem.vendedorNombre}</strong>
              </div>
              <div className="text-neutral-400">
                Contacto: <strong className="text-white">{activeModalItem.contactoPunto || 'No indicado'}</strong> ({activeModalItem.telefonoContacto || 'S/T'})
              </div>
            </div>

            {/* CAMPOS SEGÚN LA ACCIÓN */}
            {modalActionType === 'aprobar' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                    Promotora / Impulsadora Asignada:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Valentina Mendoza"
                    value={promotoraInput}
                    onChange={(e) => setPromotoraInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                    Notas de Coordinación Trade Marketing:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Stand asignado, entrega de producto coordinada con almacén..."
                    value={notasTradeInput}
                    onChange={(e) => setNotasTradeInput(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {modalActionType === 'rechazar' && (
              <div>
                <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                  Motivo de Rechazo:
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explica al vendedor por qué no se puede realizar la degustación en esta fecha..."
                  value={notasTradeInput}
                  onChange={(e) => setNotasTradeInput(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                />
              </div>
            )}

            {modalActionType === 'realizada' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                      Kilos Degustados:
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={resultadoKilos}
                      onChange={(e) => setResultadoKilos(parseFloat(e.target.value) || 0)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                      Personas Impactadas:
                    </label>
                    <input
                      type="number"
                      value={resultadoPersonas}
                      onChange={(e) => setResultadoPersonas(parseInt(e.target.value) || 0)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                    Ventas Facturadas / Impacto:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 30 Cajas facturadas al cliente"
                    value={resultadoVentas}
                    onChange={(e) => setResultadoVentas(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 uppercase mb-1">
                    Comentarios y feedback:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Excelente receptividad, agotada la mortadela..."
                    value={resultadoComentarios}
                    onChange={(e) => setResultadoComentarios(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-xs text-white"
                  />
                </div>
              </div>
            )}

            {modalActionType === 'detalle' && (
              <div className="space-y-3 text-xs">
                <div>
                  <strong className="text-neutral-400 block mb-1">Productos:</strong>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeModalItem.productos || []).map((p, idx) => (
                      <span key={`${p}-${idx}`} className="bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-white font-bold">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <strong className="text-neutral-400 block mb-1">Observaciones del Vendedor:</strong>
                  <p className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800 text-neutral-300">
                    {activeModalItem.observaciones || 'Sin observaciones adicionales.'}
                  </p>
                </div>

                {activeModalItem.notasTradeMarketing && (
                  <div>
                    <strong className="text-neutral-400 block mb-1">Seguimiento Trade Marketing:</strong>
                    <p className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800 text-amber-300">
                      {activeModalItem.notasTradeMarketing}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* BOTONES MODAL */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setActiveModalItem(null);
                  setModalActionType(null);
                }}
                className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold transition-all"
              >
                Cerrar
              </button>

              {modalActionType !== 'detalle' && (
                <button
                  type="button"
                  onClick={handleConfirmModalAction}
                  className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 ${
                    modalActionType === 'aprobar' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30' :
                    modalActionType === 'rechazar' ? 'bg-red-600 hover:bg-red-500 shadow-red-900/30' :
                    'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30'
                  }`}
                >
                  Confirmar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
