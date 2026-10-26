import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingCart, 
  Plus, 
  Store, 
  Calendar, 
  Package, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Send, 
  Download, 
  Share2, 
  DollarSign, 
  Search, 
  Check, 
  AlertCircle,
  Building2,
  ChevronDown,
  ArrowRight,
  Filter,
  RefreshCw,
  Printer,
  Camera,
  UploadCloud,
  FileSpreadsheet,
  ScanText,
  Sparkles,
  Eye,
  Layers,
  MessageSquare
} from 'lucide-react';
import { AlkostoOrder, AlkostoOrderItem, EstadoPedidoAlkosto, ParsedOrdenCompraAlkosto } from '../types';
import { 
  SUCURSALES_ALKOSTO, 
  SUCURSALES_FAMILIA_CENTER,
  CADENAS_ABREVIATURAS,
  CATALOGO_ALKOSTO, 
  subscribeAlkostoOrders, 
  saveAlkostoOrder, 
  updateAlkostoOrderStatus, 
  updateAlkostoOrderObservacion,
  deleteAlkostoOrder,
  parseAlkostoOrderImage,
  transmitirPedidoAlkosto,
  syncCadenasConfigToFirestore,
  AlkostoSucursal,
  CatalogoAlkostoItem
} from '../services/alkostoService';
import { CodizulcaNotaPedido } from './CodizulcaNotaPedido';

interface AlkostoTabProps {
  vendedoraNombre?: string;
  userRole?: string;
}

export function AlkostoTab({ vendedoraNombre = 'SAIRU VALLES', userRole = 'VENDEDOR' }: AlkostoTabProps) {
  const [orders, setOrders] = useState<AlkostoOrder[]>([]);
  
  // Vistas disponibles: 'formato' (Formato Oficial Codizulca), 'ocr' (Lector OCR), 'historial', 'resumen'
  const [activeView, setActiveView] = useState<'formato' | 'ocr' | 'historial' | 'resumen'>('formato');
  
  // Estado para la orden de compra analizada por OCR (inicia completamente limpia en producción)
  const [parsedOCData, setParsedOCData] = useState<ParsedOrdenCompraAlkosto | null>(null);
  const [ocLoadKey, setOcLoadKey] = useState(0);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Filtros de Historial y segmentación de transmisión
  const [historialTab, setHistorialTab] = useState<'pendientes' | 'transmitidos'>('pendientes');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroSucursal, setFiltroSucursal] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mensajes y alertas
  const [alertaExito, setAlertaExito] = useState<string | null>(null);
  const [alertaError, setAlertaError] = useState<string | null>(null);
  const [pedidoDetalle, setPedidoDetalle] = useState<AlkostoOrder | null>(null);
  const [selectedSucursalForFormato, setSelectedSucursalForFormato] = useState<{ codigo: string; nombre: string; cadena?: 'ALKOSTO' | 'FAMILIA_CENTER' } | null>(null);

  // Suscripción en tiempo real a pedidos de Alkosto y sincronización de abreviaturas
  useEffect(() => {
    // Sincronizar y persistir abreviaturas de Alkosto y Familia Center en Firestore
    syncCadenasConfigToFirestore().catch(() => {});

    const unsubscribe = subscribeAlkostoOrders((loadedOrders) => {
      setOrders(loadedOrders);
    });
    return () => unsubscribe();
  }, []);

  // Separación clara: Pendientes por enviar vs Ya transmitidos a Sala de Espera de Pedidos Manuales
  const pedidosPendientes = useMemo(() => {
    return orders.filter(o => o.estado === 'BORRADOR' || (!o.transmitido_a_pedidos_manuales && o.estado !== 'ENVIADO'));
  }, [orders]);

  const pedidosTransmitidos = useMemo(() => {
    return orders.filter(o => o.estado === 'ENVIADO' || o.transmitido_a_pedidos_manuales);
  }, [orders]);

  // Métricas generales de Alkosto
  const kpisAlkosto = useMemo(() => {
    const totalPedidos = orders.length;
    const kilosTotales = orders.reduce((acc, o) => acc + (o.totalKilos || 0), 0);
    const montoTotalUSD = orders.reduce((acc, o) => acc + (o.totalUSD || 0), 0);
    return {
      totalPedidos,
      kilosTotales: kilosTotales.toLocaleString('es-VE', { maximumFractionDigits: 1 }),
      montoTotalUSD: montoTotalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      pedidosPendientes: pedidosPendientes.length,
      pedidosTransmitidos: pedidosTransmitidos.length
    };
  }, [orders, pedidosPendientes, pedidosTransmitidos]);

  // Optimización y compresión client-side de imágenes para OCR rápido, nítido y liviano
  const optimizarImagenParaOCR = (file: File): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const res = e.target?.result as string;
          resolve({ base64: res.split(',')[1], mimeType: 'application/pdf' });
        };
        reader.onerror = () => reject(new Error('Error al leer el archivo PDF'));
        reader.readAsDataURL(file);
        return;
      }

      // Si es una imagen pequeña (< 3MB), enviarla directamente preservando nitidez de números pequeños
      if (file.size < 3 * 1024 * 1024 && !file.type.includes('heic')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const res = e.target?.result as string;
          resolve({ base64: res.split(',')[1], mimeType: file.type || 'image/jpeg' });
        };
        reader.onerror = () => reject(new Error('Error al leer la imagen'));
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 2800; // Alta resolución para leer tablas de pedidos con SKU y tiendas
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const raw = e.target?.result as string;
            return resolve({ base64: raw.split(',')[1], mimeType: file.type || 'image/jpeg' });
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          resolve({ base64: compressedDataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        img.onerror = () => {
          const raw = e.target?.result as string;
          resolve({ base64: raw.split(',')[1], mimeType: file.type || 'image/jpeg' });
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(file);
    });
  };

  // Procesar archivo seleccionado (Imagen o PDF) con el Lector OCR
  const procesarArchivoOCR = async (file: File) => {
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic|tiff?)$/i.test(file.name);

    if (!isPdf && !isImage && file.type && !file.type.includes('octet-stream')) {
      setOcrError('Por favor sube una imagen (PNG, JPG, JPEG) o PDF de la orden de compra.');
      return;
    }

    setOcrLoading(true);
    setOcrError(null);

    try {
      const { base64, mimeType } = await optimizarImagenParaOCR(file);
      const data = await parseAlkostoOrderImage(base64, mimeType);
      setParsedOCData(data);
      setOcLoadKey(k => k + 1);
      
      const ocIdent = data.ordenNro ? `N° ${data.ordenNro}` : '';
      const totalRenglones = data.items?.length || 0;
      setAlertaExito(`¡Orden de Compra ${data.clienteCadena === 'FAMILIA_CENTER' ? 'Familia Center' : 'Alkosto'} ${ocIdent} (${totalRenglones} renglones) cargada y montada en el formato con éxito!`);
      setTimeout(() => setAlertaExito(null), 6000);
      
      // Cambiar automáticamente a la vista del Formato Codizulca
      setActiveView('formato');
    } catch (err: any) {
      console.error("Error OCR:", err);
      setOcrError(err.message || 'No se pudo leer la orden de compra. Intenta con una imagen más nítida.');
    } finally {
      setOcrLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  // Copiar resumen de pedido para WhatsApp
  const handleCopiarWhatsApp = (pedido: AlkostoOrder) => {
    const texto = `🛒 *PEDIDO CODIZULCA - ALKOSTO*
📋 *N° Pedido:* ${pedido.correlativo || pedido.numeroPedido}
🏢 *Sucursal:* ${pedido.sucursalNombre} (Cód. ${pedido.sucursalCodigo})
📝 *OC Alkosto:* ${pedido.ordenCompraAlkosto || 'N/A'}
📅 *Fecha:* ${pedido.fechaPedido} | *Entrega:* ${pedido.fechaEntregaEstimada}
👤 *Vendedora:* ${pedido.vendedora} (Cuentas Clave 2)

📦 *DETALLE DE PRODUCTOS:*
${pedido.items.map((it, idx) => `${idx + 1}. ${it.producto}\n   ▸ Cantidad: ${it.cantidadCajas} cjs/bultos (${it.totalKilos} kg)\n   ▸ Subtotal: $${it.subtotalUSD.toFixed(2)}`).join('\n\n')}

---------------------------
📊 *TOTAL BULTOS:* ${pedido.totalBultos}
⚖️ *TOTAL KILOS:* ${pedido.totalKilos} kg
💰 *TOTAL IMPORTE:* $${pedido.totalUSD.toFixed(2)}
📌 *Condición:* ${pedido.condicionPago}
${pedido.observaciones ? `💬 *Observaciones:* ${pedido.observaciones}` : ''}
`;

    navigator.clipboard.writeText(texto).then(() => {
      setAlertaExito('¡Resumen copiado para WhatsApp! Puedes pegarlo directamente.');
      setTimeout(() => setAlertaExito(null), 3000);
    });
  };

  // Transmitir pedido directamente a la Sala de Espera del Gestor de Pedidos Manuales
  const handleTransmitir = async (pedido: AlkostoOrder) => {
    try {
      const correlativoIdent = pedido.correlativo || pedido.numeroPedido;
      setAlertaExito(`Transmitiendo pedido N° ${correlativoIdent} a la Sala de Espera de Pedidos Manuales...`);
      await transmitirPedidoAlkosto(pedido);
      await updateAlkostoOrderStatus(pedido.id, 'ENVIADO');

      const nowIso = new Date().toISOString();
      setOrders(prev => prev.map(o => o.id === pedido.id ? { 
        ...o, 
        estado: 'ENVIADO', 
        transmitido_a_pedidos_manuales: true,
        fecha_transmision: nowIso 
      } : o));

      if (pedidoDetalle && pedidoDetalle.id === pedido.id) {
        setPedidoDetalle(prev => prev ? { 
          ...prev, 
          estado: 'ENVIADO', 
          transmitido_a_pedidos_manuales: true,
          fecha_transmision: nowIso 
        } : null);
      }

      setAlertaExito(`¡Pedido N° ${correlativoIdent} transmitido con éxito! Ha viajado directamente a la Sala de Espera del Gestor de Pedidos Manuales.`);
      setTimeout(() => setAlertaExito(null), 5000);
    } catch (err: any) {
      setAlertaError(`Error transmitiendo pedido: ${err.message}`);
      setTimeout(() => setAlertaError(null), 5000);
    }
  };

  // Actualizar observación por la analista de ventas en sala de espera
  const handleActualizarObservacion = async (pedidoId: string, observacion: string) => {
    setOrders(prev => prev.map(o => o.id === pedidoId ? { ...o, observaciones: observacion } : o));
    if (pedidoDetalle && pedidoDetalle.id === pedidoId) {
      setPedidoDetalle(prev => prev ? { ...prev, observaciones: observacion } : null);
    }
    await updateAlkostoOrderObservacion(pedidoId, observacion);
  };

  // Filtrado del historial según sub-pestaña seleccionada (Pendientes vs Transmitidos)
  const pedidosFiltrados = useMemo(() => {
    const baseList = historialTab === 'pendientes' ? pedidosPendientes : pedidosTransmitidos;
    return baseList.filter(o => {
      if (filtroEstado !== 'TODOS' && o.estado !== filtroEstado) return false;
      if (filtroSucursal !== 'TODAS' && o.sucursalCodigo.replace(/^0+/, '') !== filtroSucursal.replace(/^0+/, '')) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const coincideNum = (o.numeroPedido || o.correlativo || '').toLowerCase().includes(q);
        const coincideOC = (o.ordenCompraAlkosto || '').toLowerCase().includes(q);
        const coincideSuc = o.sucursalNombre.toLowerCase().includes(q);
        const coincideProd = o.items.some(it => it.producto.toLowerCase().includes(q));
        if (!coincideNum && !coincideOC && !coincideSuc && !coincideProd) return false;
      }
      return true;
    });
  }, [historialTab, pedidosPendientes, pedidosTransmitidos, filtroEstado, filtroSucursal, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Input de archivo global (PDF, imágenes, capturas) SIN capture para permitir seleccionar archivos */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            procesarArchivoOCR(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* Input específico de cámara móvil */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            procesarArchivoOCR(e.target.files[0]);
          }
        }}
        className="hidden"
      />
      
      {/* HEADER DE MÓDULO ALKOSTO */}
      <div className="print:hidden bg-gradient-to-r from-red-950/70 via-neutral-950 to-neutral-950 border border-red-900/40 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/40">
                <Store className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xs font-mono font-bold text-red-400 uppercase tracking-widest block">
                  CUENTAS CLAVE 2 • {vendedoraNombre}
                </span>
                <h1 className="text-2xl sm:text-3xl font-sans font-black text-white tracking-tight flex items-center gap-2">
                  MÓDULO <span className="text-red-500">ALKOSTO</span>
                </h1>
              </div>
            </div>
            <p className="text-neutral-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
              Lector OCR de Órdenes de Compra y Generador de <strong className="text-white">Notas de Pedido Codizulca</strong> para todas las sucursales de Alkosto.
            </p>
          </div>

          {/* KPIS RÁPIDOS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-neutral-900/80 border border-neutral-800 p-3 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">Pedidos</span>
              <span className="text-lg font-black text-white">{kpisAlkosto.totalPedidos}</span>
            </div>
            <div className="bg-neutral-900/80 border border-neutral-800 p-3 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">Kilos</span>
              <span className="text-lg font-black text-emerald-400 font-mono">{kpisAlkosto.kilosTotales}</span>
            </div>
            <div className="bg-neutral-900/80 border border-neutral-800 p-3 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">Total USD</span>
              <span className="text-lg font-black text-white font-mono">${kpisAlkosto.montoTotalUSD}</span>
            </div>
            <div className="bg-neutral-900/80 border border-neutral-800 p-3 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block mb-0.5">Pendientes</span>
              <span className="text-lg font-black text-amber-400">{kpisAlkosto.pedidosPendientes}</span>
            </div>
          </div>
        </div>

        {/* SUB-PESTAÑAS DE NAVEGACIÓN */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-neutral-800/80 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveView('formato')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
              activeView === 'formato'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Formato Codizulca (Nota de Pedido)</span>
          </button>

          <button
            onClick={() => setActiveView('ocr')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
              activeView === 'ocr'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <ScanText className="w-4 h-4 text-amber-400" />
            <span>Lector de Órdenes de Compra (OCR con IA)</span>
          </button>

          <button
            onClick={() => setActiveView('historial')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
              activeView === 'historial'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Send className="w-4 h-4 text-emerald-400" />
            <span>
              Bandeja de Pedidos {pedidosPendientes.length > 0 ? `(${pedidosPendientes.length} por enviar)` : '(0 en espera ✓)'}
            </span>
          </button>

          <button
            onClick={() => setActiveView('resumen')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap ${
              activeView === 'resumen'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                : 'bg-neutral-900/80 text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Sucursales y Abreviaturas (18)</span>
          </button>
        </div>
      </div>

      {/* ALERTAS */}
      {alertaExito && (
        <div className="print:hidden bg-emerald-950/60 border border-emerald-800 text-emerald-300 p-4 rounded-xl flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-bold">{alertaExito}</span>
        </div>
      )}

      {alertaError && (
        <div className="print:hidden bg-red-950/60 border border-red-800 text-red-300 p-4 rounded-xl flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-xs sm:text-sm font-bold">{alertaError}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 1: FORMATO CODIZULCA (RÉPLICA EXACTA DE LA IMAGEN 2) */}
      {/* ============================================================== */}
      {activeView === 'formato' && (
        <div className="space-y-4">
          
          {/* BANNER INFORMATIVO / ACCESO RÁPIDO A OCR */}
          <div className="print:hidden bg-neutral-900/80 border border-neutral-800 rounded-xl p-3 px-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {parsedOCData?.ordenNro 
                  ? `Mostrando Orden de Compra N° ${parsedOCData.ordenNro} (${parsedOCData.items?.length || 0} renglones montados en el formato • Subtotal: $${(parsedOCData.subtotal || 0).toFixed(2)}).`
                  : 'Formato Codizulca listo. Puedes escanear o subir una Orden de Compra (Foto o PDF) para montarla de inmediato.'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrLoading}
                className="bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-900/40 px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors text-xs"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{ocrLoading ? 'Leyendo...' : 'Subir Orden (Foto o PDF)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('ocr')}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors text-xs"
              >
                <ScanText className="w-3.5 h-3.5" />
                <span>Lector OCR</span>
              </button>

              {parsedOCData && (
                <button
                  type="button"
                  onClick={() => {
                    setParsedOCData(null);
                    setOcLoadKey(k => k + 1);
                  }}
                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg font-bold transition-colors text-xs"
                >
                  Limpiar Formato
                </button>
              )}
            </div>
          </div>

          {/* RENDER DEL FORMATO EXACTO CODIZULCA */}
          <CodizulcaNotaPedido 
            key={parsedOCData ? `oc-${parsedOCData.ordenNro || 'doc'}-${ocLoadKey}` : `oc-empty-${ocLoadKey}-${selectedSucursalForFormato?.codigo || ''}`}
            initialData={parsedOCData}
            initialSucursal={selectedSucursalForFormato}
            vendedoraNombre={vendedoraNombre}
            onOrderSaved={() => {
              setParsedOCData(null);
              setSelectedSucursalForFormato(null);
              setOcLoadKey(k => k + 1);
              setAlertaExito('¡Orden(es) enviada(s) con éxito a Sala de Espera! Formato limpio y preparado para cargar o escanear la siguiente Orden de Compra.');
              setTimeout(() => setAlertaExito(null), 6000);
            }}
          />
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 2: LECTOR OCR DE ÓRDENES DE COMPRA ALKOSTO */}
      {/* ============================================================== */}
      {activeView === 'ocr' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            
            <div className="text-center max-w-xl mx-auto space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center mx-auto shadow-xl shadow-red-900/30">
                <ScanText className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Lector Inteligente de Órdenes de Compra
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400">
                Sube la foto, captura o PDF de la orden de compra emitida por <strong className="text-white">ALKOSTO</strong>. La inteligencia artificial extraerá todos los renglones, códigos, cantidades por tienda y montos para montarlos automáticamente en la Nota de Pedido de Codizulca.
              </p>
            </div>

            {/* ERROR DE OCR */}
            {ocrError && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 p-4 rounded-xl flex items-center gap-3 text-xs sm:text-sm font-bold">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span>{ocrError}</span>
              </div>
            )}

            {/* ZONA DE ARRASTRE Y SUBIDA */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  procesarArchivoOCR(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-4 ${
                dragOver 
                  ? 'border-red-500 bg-red-950/20 scale-[1.01]' 
                  : 'border-neutral-800 hover:border-red-600/80 bg-neutral-900/40 hover:bg-neutral-900/70'
              }`}
            >
              {ocrLoading ? (
                <div className="space-y-4">
                  <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">Extrayendo datos de la Orden de Compra...</h3>
                    <p className="text-xs text-neutral-400 font-mono">
                      Analizando códigos, cantidades por tienda AK01-AK10, descripciones y subtotales...
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOcrLoading(false);
                      setOcrError("Lectura OCR cancelada.");
                    }}
                    className="mt-2 text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-700 px-3 py-1.5 rounded-lg font-bold transition-all"
                  >
                    Cancelar lectura
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-8 h-8 text-red-500" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Haz clic para seleccionar o arrastra la Orden de Compra aquí
                    </h3>
                    <p className="text-xs text-neutral-500">
                      Formatos soportados: JPG, PNG, WEBP o PDF de alta resolución
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cameraInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    >
                      <Camera className="w-3.5 h-3.5 text-emerald-400" />
                      Tomar foto con cámara
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      Seleccionar archivo o PDF
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* REFERENCIA DE ABREVIATURAS OFICIALES SINCRONIZADAS */}
            <div className="pt-4 border-t border-neutral-800/80 space-y-3">
              {/* INDICADOR DE ABREVIATURAS SINCRONIZADAS */}
              <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white flex items-center gap-2">
                      Abreviaturas Sincronizadas y Guardadas en Base de Datos:
                      <span className="bg-emerald-950/80 border border-emerald-800 text-emerald-400 text-[9px] font-mono px-1.5 py-0.2 rounded uppercase">
                        Sin error de carga
                      </span>
                    </span>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <div className="flex items-center gap-1">
                        <strong className="text-red-400 font-mono text-[10px]">Alkosto:</strong>
                        <div className="flex flex-wrap gap-1 font-mono text-[10px] text-neutral-300">
                          {CADENAS_ABREVIATURAS.ALKOSTO.map(t => (
                            <span key={t} className="bg-neutral-950 border border-neutral-800 px-1.5 py-0.2 rounded text-red-300">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-neutral-600 hidden md:inline">|</span>
                      <div className="flex items-center gap-1">
                        <strong className="text-amber-400 font-mono text-[10px]">Familia Center:</strong>
                        <div className="flex flex-wrap gap-1 font-mono text-[10px] text-neutral-300">
                          {CADENAS_ABREVIATURAS.FAMILIA_CENTER.map(t => (
                            <span key={t} className="bg-neutral-950 border border-neutral-800 px-1.5 py-0.2 rounded text-amber-300">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 3: SALA DE ESPERA DE PEDIDOS (ASIGNACIÓN AUTOMÁTICA DE CORRELATIVO) */}
      {/* ============================================================== */}
      {activeView === 'historial' && (
        <div className="space-y-4">
          
          {/* BANNER PRINCIPAL Y SELECTOR DE SUB-PESTAÑAS */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl shrink-0">
                <Send className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-black text-white">Transmisión Directa a Pedidos Manuales</h3>
                  <span className="text-[10px] font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                    Sincronización en Tiempo Real
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Al transmitir, los pedidos viajan directamente a la Sala de Espera (CxC) de Pedidos Manuales sin quedar retenidos en tu aplicación.
                </p>
              </div>
            </div>

            {/* SELECTOR DE SUB-PESTAÑAS */}
            <div className="flex items-center bg-neutral-900 p-1 rounded-xl border border-neutral-800 shrink-0">
              <button
                type="button"
                onClick={() => setHistorialTab('pendientes')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  historialTab === 'pendientes'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Pendientes por Transmitir ({pedidosPendientes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setHistorialTab('transmitidos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  historialTab === 'transmitidos'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>En Sala de Espera Pedidos Manuales ({pedidosTransmitidos.length})</span>
              </button>
            </div>
          </div>

          {/* BARRA DE FILTROS */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-xl">
            <div className="flex flex-1 items-center gap-2 bg-neutral-900 rounded-xl px-3 py-2 border border-neutral-800">
              <Search className="w-4 h-4 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por N° pedido, OC, sucursal o producto..."
                className="bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none w-full"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="TODOS">Todos los Estados</option>
                <option value="BORRADOR">Borrador</option>
                <option value="ENVIADO">Enviado / Pendiente</option>
                <option value="APROBADO">Aprobado</option>
                <option value="DESPACHADO">Despachado</option>
                <option value="ENTREGADO">Entregado</option>
              </select>

              <select
                value={filtroSucursal}
                onChange={(e) => setFiltroSucursal(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 text-xs text-white rounded-xl px-3 py-2 focus:outline-none"
              >
                <option value="TODAS">Todas las Sucursales</option>
                <optgroup label="ALKOSTO DONDE COMPRAR ES GANAR, C.A.">
                  {SUCURSALES_ALKOSTO.map(s => (
                    <option key={s.codigo} value={s.codigo}>{s.codigo} - {s.nombre}</option>
                  ))}
                </optgroup>
                <optgroup label="FAMILIA CENTER, C.A">
                  {SUCURSALES_FAMILIA_CENTER.map(s => (
                    <option key={s.codigo} value={s.codigo}>{s.codigo} - {s.nombre}</option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* LISTADO DE PEDIDOS SEGÚN SUB-PESTAÑA */}
          {pedidosFiltrados.length === 0 ? (
            historialTab === 'pendientes' ? (
              <div className="p-10 text-center bg-neutral-950 border border-emerald-900/40 rounded-2xl text-neutral-300 space-y-4 shadow-xl">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-white">¡Sala de Espera de tu App Despejada!</h3>
                  <p className="text-xs max-w-md mx-auto text-neutral-400 leading-relaxed">
                    No tienes pedidos retenidos en la sala de espera de tu app. Todos los pedidos han viajado con éxito y de forma exacta a la <strong className="text-emerald-400">Sala de Espera del Gestor de Pedidos Manuales (CxC)</strong>.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                  <button
                    onClick={() => setHistorialTab('transmitidos')}
                    className="inline-flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-emerald-300 font-bold text-xs py-2.5 px-4 rounded-xl transition-all border border-emerald-800/60 cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Ver Pedidos en Sala de Espera Manual ({pedidosTransmitidos.length})</span>
                  </button>
                  <button
                    onClick={() => setActiveView('ocr')}
                    className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all shadow cursor-pointer"
                  >
                    <ScanText className="w-4 h-4" />
                    <span>Escanear Nueva OC</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center bg-neutral-950 border border-neutral-800 rounded-2xl text-neutral-400 space-y-3 shadow-xl">
                <Store className="w-12 h-12 mx-auto text-neutral-600" />
                <h3 className="text-base font-bold text-white">No hay pedidos transmitidos todavía</h3>
                <p className="text-xs max-w-sm mx-auto text-neutral-500">
                  Carga un nuevo pedido y transmítelo directamente para que viaje a la sala de espera de Pedidos Manuales.
                </p>
                <button
                  onClick={() => setHistorialTab('pendientes')}
                  className="inline-flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs py-2 px-3.5 rounded-xl transition-all border border-neutral-700 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ver Pendientes por Transmitir</span>
                </button>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pedidosFiltrados.map((ped) => {
                const isTransmitido = ped.transmitido_a_pedidos_manuales || ped.estado === 'ENVIADO';
                const badgeColor = 
                  isTransmitido ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300 font-bold' :
                  ped.estado === 'ENTREGADO' ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' :
                  ped.estado === 'DESPACHADO' ? 'bg-blue-950/60 border-blue-800 text-blue-400' :
                  ped.estado === 'APROBADO' ? 'bg-cyan-950/60 border-cyan-800 text-cyan-400' :
                  'bg-amber-950/70 border-amber-700 text-amber-300 font-bold';

                return (
                  <div
                    key={ped.id}
                    className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all space-y-4"
                  >
                    <div>
                      {/* CABECERA DE LA TARJETA */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[11px] font-mono font-black text-emerald-400 bg-emerald-950/80 border border-emerald-700/80 px-2 py-0.5 rounded shadow-sm">
                              CORRELATIVO N° {ped.correlativo || ped.numeroPedido}
                            </span>
                          </div>
                          <h4 className="text-sm font-sans font-bold text-white uppercase leading-snug">
                            {ped.sucursalNombre}
                          </h4>
                        </div>
                        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full uppercase border shrink-0 ${badgeColor}`}>
                          {isTransmitido ? 'En Espera (Pedidos Manuales)' : ped.estado}
                        </span>
                      </div>

                      {/* DATOS GENERALES */}
                      <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl p-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400">OC Alkosto:</span>
                          <span className="font-mono font-bold text-white">{ped.ordenCompraAlkosto || 'S/N'}</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400">Fecha Pedido:</span>
                          <span className="font-mono text-white">{ped.fechaPedido}</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400">Entrega Estimada:</span>
                          <span className="font-mono text-white">{ped.fechaEntregaEstimada}</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-300 pt-1 border-t border-neutral-800">
                          <span className="text-neutral-400">Total Bultos / Kilos:</span>
                          <span className="font-mono font-bold text-emerald-400">
                            {ped.totalBultos} bjs / {ped.totalKilos} kg
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-300">
                          <span className="text-neutral-400">Total Importe:</span>
                          <span className="font-mono font-bold text-white text-sm">
                            ${ped.totalUSD.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* MUESTRA DE ARTÍCULOS */}
                      <div className="mt-3">
                        <span className="text-[9px] uppercase font-bold text-neutral-400 block mb-1">
                          Productos y SKU ({ped.items.length}):
                        </span>
                        <div className="space-y-1">
                          {ped.items.slice(0, 3).map((it, idx) => (
                            <div key={idx} className="text-[11px] text-neutral-300 flex items-center justify-between">
                              <span className="truncate pr-2">
                                • {it.sku && <strong className="text-amber-400 font-mono text-[10px] mr-1">SKU {it.sku}:</strong>}{it.producto}
                              </span>
                              <span className="font-mono text-neutral-400 shrink-0">{it.cantidadCajas} cjs</span>
                            </div>
                          ))}
                          {ped.items.length > 3 && (
                            <span className="text-[10px] text-red-400 font-bold block pt-0.5">
                              + {ped.items.length - 3} productos más...
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CAMPO DE OBSERVACIÓN PARA LA ANALISTA DE VENTAS */}
                      <div className="mt-3 pt-2.5 border-t border-neutral-800/80">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <MessageSquare className="w-3 h-3 text-amber-400" />
                            Observación (Analista de Ventas):
                          </label>
                          <span className="text-[9px] text-neutral-500 font-medium">
                            {ped.observaciones?.trim() ? 'Guardado' : 'En blanco'}
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          value={ped.observaciones || ''}
                          onChange={(e) => handleActualizarObservacion(ped.id, e.target.value)}
                          placeholder="Colocar aquí información a resaltar según pedido o sede de ALKOSTO o Familia Center..."
                          className="w-full bg-neutral-900 border border-neutral-800 focus:border-amber-500/80 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 resize-none transition-all"
                        />
                      </div>
                    </div>

                    {/* BOTONES DE ACCIÓN */}
                    <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isTransmitido ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-700/80 px-2 py-1 rounded-xl">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>En Espera (CxC)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleTransmitir(ped)}
                              className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white px-2 py-1 rounded-xl text-xs font-bold border border-neutral-800 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Re-transmitir a Pedidos Manuales"
                            >
                              <RefreshCw className="w-3 h-3 text-neutral-400" />
                              <span className="text-[10px]">Re-enviar</span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleTransmitir(ped)}
                            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/50 cursor-pointer active:scale-95"
                            title="Transmitir directamente a la Sala de Espera de Pedidos Manuales"
                          >
                            <Send className="w-3.5 h-3.5 text-white" />
                            <span className="text-[11px]">Transmitir Directo</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopiarWhatsApp(ped)}
                          className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white p-2 rounded-xl text-xs font-bold border border-neutral-800 transition-colors flex items-center gap-1"
                          title="Copiar para WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="hidden sm:inline text-[11px]">WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPedidoDetalle(ped)}
                          className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white p-2 rounded-xl text-xs font-bold border border-neutral-800 transition-colors"
                          title="Ver detalle"
                        >
                          <FileText className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>

                      {/* CAMBIO DE ESTADO */}
                      <div className="flex items-center gap-1">
                        <select
                          value={ped.estado}
                          onChange={(e) => updateAlkostoOrderStatus(ped.id, e.target.value as EstadoPedidoAlkosto)}
                          className="bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none"
                        >
                          <option value="BORRADOR">Borrador</option>
                          <option value="ENVIADO">Enviado</option>
                          <option value="APROBADO">Aprobado</option>
                          <option value="DESPACHADO">Despachado</option>
                          <option value="ENTREGADO">Entregado</option>
                          <option value="CANCELADO">Cancelado</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`¿Eliminar el pedido ${ped.numeroPedido}?`)) {
                              deleteAlkostoOrder(ped.id);
                            }
                          }}
                          className="text-neutral-500 hover:text-red-500 p-1.5 transition-colors"
                          title="Eliminar Pedido"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 4: RESUMEN DE SUCURSALES Y CÓDIGOS OFICIALES DE CADENAS */}
      {/* ============================================================== */}
      {activeView === 'resumen' && (
        <div className="space-y-6">
          {/* SECCIÓN 1: ALKOSTO */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  ALKOSTO (SUCURSALES 1 AL 10)
                </h2>
                <p className="text-xs text-neutral-400">Cada sucursal con su número, código y descripción oficial</p>
              </div>
              <span className="bg-red-950 border border-red-800 text-red-400 text-xs px-3 py-1 rounded-full font-bold font-mono">
                {SUCURSALES_ALKOSTO.length} Sucursales
              </span>
            </div>

            <div className="overflow-x-auto border border-neutral-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-900 text-neutral-300 font-bold border-b border-neutral-800 uppercase">
                  <tr>
                    <th className="p-3 w-48 border-r border-neutral-800">SUCURSAL</th>
                    <th className="p-3 w-28 border-r border-neutral-800">CÓDIGO</th>
                    <th className="p-3 border-r border-neutral-800">DESCRIPCIÓN / DIRECCIÓN</th>
                    <th className="p-3 text-right w-36">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {SUCURSALES_ALKOSTO.map((suc) => (
                    <tr key={suc.codigo} className="hover:bg-neutral-900/60 transition-colors">
                      <td className="p-3 font-sans font-bold text-white border-r border-neutral-800">{suc.nombre}</td>
                      <td className="p-3 font-mono font-bold text-red-400 border-r border-neutral-800">{suc.codigo}</td>
                      <td className="p-3 font-sans text-neutral-300 border-r border-neutral-800">{suc.direccion}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSucursalForFormato({ codigo: suc.codigo, nombre: suc.nombre, cadena: 'ALKOSTO' });
                            setActiveView('formato');
                          }}
                          className="bg-neutral-800 hover:bg-red-600 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Crear Nota</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECCIÓN 2: FAMILIA CENTER */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  FAMILIA CENTER (SUCURSALES 1 AL 7)
                </h2>
                <p className="text-xs text-neutral-400">Cada sucursal con su número, código y descripción oficial</p>
              </div>
              <span className="bg-amber-950 border border-amber-800 text-amber-400 text-xs px-3 py-1 rounded-full font-bold font-mono">
                {SUCURSALES_FAMILIA_CENTER.length} Sucursales
              </span>
            </div>

            <div className="overflow-x-auto border border-neutral-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-neutral-900 text-neutral-300 font-bold border-b border-neutral-800 uppercase">
                  <tr>
                    <th className="p-3 w-48 border-r border-neutral-800">SUCURSAL</th>
                    <th className="p-3 w-28 border-r border-neutral-800">CÓDIGO</th>
                    <th className="p-3 border-r border-neutral-800">DESCRIPCIÓN / DIRECCIÓN</th>
                    <th className="p-3 text-right w-36">ACCIÓN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {SUCURSALES_FAMILIA_CENTER.map((suc) => (
                    <tr key={suc.codigo} className="hover:bg-neutral-900/60 transition-colors">
                      <td className="p-3 font-sans font-bold text-white border-r border-neutral-800">{suc.nombre}</td>
                      <td className="p-3 font-mono font-bold text-amber-400 border-r border-neutral-800">{suc.codigo}</td>
                      <td className="p-3 font-sans text-neutral-300 border-r border-neutral-800">{suc.direccion}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSucursalForFormato({ codigo: suc.codigo, nombre: suc.nombre, cadena: 'FAMILIA_CENTER' });
                            setActiveView('formato');
                          }}
                          className="bg-neutral-800 hover:bg-amber-600 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Crear Nota</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLE COMPLETO DE PEDIDO */}
      {pedidoDetalle && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
              <div>
                <span className="text-xs font-mono text-emerald-400 font-bold block">
                  CORRELATIVO N° {pedidoDetalle.correlativo || pedidoDetalle.numeroPedido} • OC: {pedidoDetalle.ordenCompraAlkosto || 'S/N'}
                </span>
                <h3 className="text-lg font-bold text-white uppercase">
                  {pedidoDetalle.sucursalNombre}
                </h3>
                <span className="text-xs text-neutral-400">
                  {pedidoDetalle.direccionEntrega}
                </span>
              </div>
              <button
                onClick={() => setPedidoDetalle(null)}
                className="text-neutral-500 hover:text-white p-2"
              >
                ✕
              </button>
            </div>

            {/* TABLA DE PRODUCTOS */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-300 uppercase">Detalle de Productos:</span>
              <div className="border border-neutral-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-900 text-neutral-400 font-mono">
                    <tr>
                      <th className="p-2.5">SKU</th>
                      <th className="p-2.5">Producto</th>
                      <th className="p-2.5 text-center">Bultos</th>
                      <th className="p-2.5 text-center">Kilos</th>
                      <th className="p-2.5 text-right">Precio $</th>
                      <th className="p-2.5 text-right">Subtotal $</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {pedidoDetalle.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-neutral-900/40">
                        <td className="p-2.5 font-mono font-bold text-amber-400">{it.sku || '-'}</td>
                        <td className="p-2.5 font-bold text-white">{it.producto}</td>
                        <td className="p-2.5 text-center font-mono">{it.cantidadCajas}</td>
                        <td className="p-2.5 text-center font-mono text-neutral-300">{it.totalKilos} kg</td>
                        <td className="p-2.5 text-right font-mono">${it.precioUnitarioUSD.toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-400">${it.subtotalUSD.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-900 font-bold border-t border-neutral-800">
                    <tr>
                      <td colSpan={2} className="p-2.5 text-white">TOTALES</td>
                      <td className="p-2.5 text-center font-mono text-white">{pedidoDetalle.totalBultos}</td>
                      <td className="p-2.5 text-center font-mono text-emerald-400">{pedidoDetalle.totalKilos} kg</td>
                      <td></td>
                      <td className="p-2.5 text-right font-mono text-emerald-400 text-sm">${pedidoDetalle.totalUSD.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* CONDICIONES & OBSERVACIÓN */}
            <div className="bg-neutral-900/60 p-3 rounded-xl border border-neutral-800 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <strong className="text-neutral-400">Condición de Pago:</strong> 
                <span className="text-white">{pedidoDetalle.condicionPago}</span>
              </div>
              <div className="flex justify-between items-center">
                <strong className="text-neutral-400">Fecha Estimada de Entrega:</strong> 
                <span className="text-white">{pedidoDetalle.fechaEntregaEstimada}</span>
              </div>
              <div className="pt-2 border-t border-neutral-800">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    Observación (Analista de Ventas - Alkosto / Familia Center):
                  </label>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {pedidoDetalle.observaciones?.trim() ? 'Guardado' : 'En blanco'}
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={pedidoDetalle.observaciones || ''}
                  onChange={(e) => handleActualizarObservacion(pedidoDetalle.id, e.target.value)}
                  placeholder="Colocar aquí información a resaltar según pedido o sede de ALKOSTO o Familia Center..."
                  className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-lg p-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-amber-500/30 resize-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:flex sm:items-center sm:justify-end gap-2 sm:gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => handleTransmitir(pedidoDetalle)}
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>{pedidoDetalle.transmitido_a_pedidos_manuales || pedidoDetalle.estado === 'ENVIADO' ? '🔄 Re-transmitir a Pedidos Manuales' : '🚀 Transmitir Directo a Sala de Espera'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopiarWhatsApp(pedidoDetalle)}
                className="w-full sm:w-auto bg-neutral-800 hover:bg-neutral-700 active:scale-[0.98] text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Copiar para WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => setPedidoDetalle(null)}
                className="w-full sm:w-auto bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 active:scale-[0.98] text-neutral-300 font-bold text-xs py-2.5 px-4 rounded-xl text-center"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
