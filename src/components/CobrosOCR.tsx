import React, { useState, useEffect, useMemo, Component, ErrorInfo } from 'react';
import { supabase, hasValidSupabaseConfig } from '../lib/supabase';
import heic2any from 'heic2any';
import { 
  Camera, UploadCloud, CheckCircle, AlertTriangle, Search, 
  Loader2, Download, History, Trash2, Calendar, FileText, 
  RefreshCw, DollarSign, Building2, User, Hash, ArrowRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAuthHeaders } from '../services/authService';

// Error Boundary específico para CobrosOCR para evitar que cualquier fallo deje la pantalla en blanco
interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class CobrosErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Error inesperado en Cobros' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error capturado en CobrosErrorBoundary:", error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.removeItem('ocr_pagos_consolidados');
    } catch (e) {
      console.error(e);
    }
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto p-6 bg-red-950/40 border border-red-900 rounded-xl my-10 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-sans font-bold text-white mb-2 uppercase tracking-wider">
            Se detectó un problema en el Módulo de Cobros
          </h2>
          <p className="text-sm text-neutral-300 mb-4">
            Ocurrió un error al procesar o renderizar los pagos ({this.state.errorMessage}).
          </p>
          <button
            onClick={this.handleReset}
            className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition-colors uppercase tracking-wider inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Restaurar y Continuar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface CobrosOCRProps {
  clientes?: any[];
  currentVendedor?: string;
}

export const CobrosOCRInner: React.FC<CobrosOCRProps> = ({ 
  clientes = [], 
  currentVendedor = 'ADMIN' 
}) => {
  // Navigation
  const [activeSubTab, setActiveSubTab] = useState<'nuevo' | 'historial'>('nuevo');

  // Form State
  const [ruta, setRuta] = useState(() => localStorage.getItem('ocr_ruta') || 'Ruta 1');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'error' | 'success' | 'info', text: string } | null>(null);

  // Client Data
  const [codigoCliente, setCodigoCliente] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [rucCliente, setRucCliente] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Payment Data
  const [factura, setFactura] = useState('');
  const [tasa, setTasa] = useState('');
  const [banco, setBanco] = useState('');
  const [montoDisplay, setMontoDisplay] = useState('');
  const [montoNumerico, setMontoNumerico] = useState<number>(0);
  const [referencia, setReferencia] = useState('');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().split('T')[0]);
  const [titular, setTitular] = useState('');
  const [rifTitular, setRifTitular] = useState('');

  // Safe localStorage persistence
  const [pagosConsolidados, setPagosConsolidados] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ocr_pagos_consolidados');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(p => p && typeof p === 'object' && p.referencia);
    } catch (e) {
      console.warn("Error leyendo pagos consolidados:", e);
      return [];
    }
  });

  const [historialRelaciones, setHistorialRelaciones] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('ocr_historial_relaciones');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(r => r && typeof r === 'object').map(r => ({
        ...r,
        pagos: Array.isArray(r.pagos) ? r.pagos : []
      }));
    } catch (e) {
      console.warn("Error leyendo historial de relaciones:", e);
      return [];
    }
  });

  // Guardar en localStorage de forma segura (sin exceder cuota de 5MB)
  useEffect(() => {
    try {
      localStorage.setItem('ocr_pagos_consolidados', JSON.stringify(pagosConsolidados));
    } catch (e) {
      console.warn("Cuota de localStorage excedida, guardando versión ligera sin imágenes pesadas:", e);
      try {
        const lightweight = pagosConsolidados.map(p => ({
          ...p,
          image: p.image && p.image.length > 20000 ? undefined : p.image
        }));
        localStorage.setItem('ocr_pagos_consolidados', JSON.stringify(lightweight));
      } catch (err) {
        console.error("Fallo al guardar en localStorage:", err);
      }
    }
  }, [pagosConsolidados]);

  useEffect(() => {
    try {
      localStorage.setItem('ocr_historial_relaciones', JSON.stringify(historialRelaciones));
    } catch (e) {
      console.warn("Cuota de localStorage excedida en historial:", e);
      try {
        const lightweight = historialRelaciones.map(rel => ({
          ...rel,
          pagos: (rel.pagos || []).map((p: any) => ({
            ...p,
            image: undefined
          }))
        }));
        localStorage.setItem('ocr_historial_relaciones', JSON.stringify(lightweight));
      } catch (err) {
        console.error("Fallo al guardar historial:", err);
      }
    }
  }, [historialRelaciones]);

  // Cargar tasa BCV oficial actual por defecto si no hay tasa
  useEffect(() => {
    if (!tasa) {
      fetch('/api/tasa-bcv?date=' + fechaPago)
        .then(async res => {
          if (!res.ok) return null;
          const text = await res.text();
          if (!text.trim().startsWith('{')) return null;
          return JSON.parse(text);
        })
        .then(data => {
          if (data && data.tasa) {
            setTasa(data.tasa.toString());
          }
        })
        .catch(err => console.log("No se pudo autocompletar tasa inicial:", err));
    }
  }, [fechaPago]);

  // Limpiar y parsear montos en formato venezolano e internacional de forma 100% exacta
  const parseMontoExacto = (val: any): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const s = String(val).trim();
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      const num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    }
    if (/^\d+,\d+$/.test(s)) {
      const num = parseFloat(s.replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    const cleaned = s.replace(/[$BsUSD\s]/gi, '');
    if (cleaned.includes('.') && cleaned.includes(',')) {
      if (cleaned.indexOf('.') < cleaned.indexOf(',')) {
        const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
        return isNaN(n) ? 0 : n;
      } else {
        const n = parseFloat(cleaned.replace(/,/g, ''));
        return isNaN(n) ? 0 : n;
      }
    }
    if (cleaned.includes(',')) {
      const n = parseFloat(cleaned.replace(',', '.'));
      return isNaN(n) ? 0 : n;
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const handleMontoChange = (val: string) => {
    setMontoDisplay(val);
    const num = parseMontoExacto(val);
    setMontoNumerico(num);
  };

  const handleMontoBlur = () => {
    const num = parseMontoExacto(montoDisplay);
    if (num > 0) {
      setMontoDisplay(new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num));
      setMontoNumerico(num);
    } else {
      setMontoDisplay('');
      setMontoNumerico(0);
    }
  };

  // Buscador y sugerencias de clientes flexible (soporta ceros a la izquierda y nombres)
  const clientSuggestions = useMemo(() => {
    const rawClean = codigoCliente.replace(/^[#\s]+/, '').trim().toLowerCase();
    if (!rawClean || rawClean.length < 1) return [];
    const cleanNoZeros = rawClean.replace(/^0+/, '');

    return clientes.filter(c => {
      const cId = String(c.id || c.cliente_codigo || '').replace(/^[#\s]+/, '').trim().toLowerCase();
      const cIdNoZeros = cId.replace(/^0+/, '');
      const cName = String(c.cliente || c.cliente_nombre || c.razonSocial || '').toLowerCase();

      return cId.includes(rawClean) || 
             (cleanNoZeros.length > 0 && cIdNoZeros.includes(cleanNoZeros)) ||
             cName.includes(rawClean);
    }).slice(0, 12);
  }, [codigoCliente, clientes]);

  const handleCodigoChange = (val: string) => {
    setCodigoCliente(val);
    setShowSuggestions(true);

    const rawClean = val.replace(/^[#\s]+/, '').trim().toLowerCase();
    if (!rawClean) return;
    const cleanNoZeros = rawClean.replace(/^0+/, '');

    // Búsqueda de coincidencia exacta por código (con o sin ceros)
    const exact = clientes.find(c => {
      const cId = String(c.id || c.cliente_codigo || '').replace(/^[#\s]+/, '').trim().toLowerCase();
      const cIdNoZeros = cId.replace(/^0+/, '');
      return cId === rawClean || (cleanNoZeros.length > 0 && cIdNoZeros === cleanNoZeros);
    });

    if (exact) {
      const foundName = exact.cliente || exact.cliente_nombre || exact.razonSocial || '';
      setNombreCliente(foundName);
      setRucCliente(String(exact.id || exact.cliente_codigo || ''));
      setAlertMsg({ type: 'info', text: `Cliente identificado: ${foundName}` });
      setTimeout(() => setAlertMsg(null), 3500);
    }
  };

  const handleCodigoBlur = () => {
    setTimeout(async () => {
      setShowSuggestions(false);
      const clean = codigoCliente.replace(/^[#\s]+/, '').trim();
      if (clean && !nombreCliente.trim()) {
        try {
          const res = await fetch(`/api/client-lookup?codigo=${encodeURIComponent(clean.replace(/^0+/, '') || clean)}`, {
            headers: getAuthHeaders()
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.nombre) {
              setNombreCliente(data.nombre);
              setRucCliente(data.ruc || clean);
              setAlertMsg({ type: 'info', text: `Cliente encontrado en base de datos: ${data.nombre}` });
              setTimeout(() => setAlertMsg(null), 3000);
            }
          }
        } catch (e) {}
      }
    }, 250);
  };

  const selectClient = (c: any) => {
    const code = String(c.id || c.cliente_codigo || '');
    const name = c.cliente || c.cliente_nombre || c.razonSocial || '';
    setCodigoCliente(code);
    setNombreCliente(name);
    setRucCliente(code);
    setShowSuggestions(false);
    setAlertMsg({ type: 'info', text: `Cliente seleccionado: ${name}` });
    setTimeout(() => setAlertMsg(null), 3000);
  };

  // Procesamiento de imagen con canvas y compresión
  const handleImageInput = async (file: File) => {
    if (pagosConsolidados.length >= 60) {
      setAlertMsg({ type: 'error', text: 'Has alcanzado el límite de 60 pagos en la relación. Por favor exporta en PDF para archivar.' });
      return;
    }

    setAlertMsg(null);
    let finalFile = file;

    // Soporte para formato HEIC de iPhone
    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
      try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.75 });
        finalFile = new File([converted as Blob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
      } catch (err) {
        console.error("Fallo conversión HEIC:", err);
        setAlertMsg({ type: 'error', text: 'Error al convertir formato HEIC de iPhone.' });
        return;
      }
    }

    // Comprimir y redimensionar con Canvas a un máximo de 1000px
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1000;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const resizedBase64 = canvas.toDataURL('image/jpeg', 0.75);
        setPreviewImage(resizedBase64);
        processOCR(resizedBase64.split(',')[1]);
      };

      img.onerror = () => {
        setAlertMsg({ type: 'error', text: 'No se pudo leer la imagen. Intente con JPG o PNG.' });
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      setAlertMsg({ type: 'error', text: 'Error al abrir el archivo de comprobante.' });
    };

    reader.readAsDataURL(finalFile);
  };

  // OCR con el modelo Gemini del backend
  const processOCR = async (base64: string) => {
    setIsProcessing(true);
    setAlertMsg({ type: 'info', text: 'Analizando comprobante con IA...' });
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ imageBase64: base64 })
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (e) {
        throw new Error("El servidor devolvió un formato no válido.");
      }

      if (!res.ok) throw new Error(data.error || 'Error al procesar con OCR');

      // Asignar los campos extraídos
      if (data.banco && data.banco !== 'null') setBanco(data.banco);
      if (data.referencia && data.referencia !== 'null') setReferencia(String(data.referencia).trim());
      if (data.titular && data.titular !== 'null') {
        const titularStr = String(data.titular).trim();
        setTitular(titularStr);

        // Auto-vincular cliente si no se ha seleccionado y coincide con titular
        if (!codigoCliente && titularStr.length > 3) {
          const tClean = titularStr.toLowerCase();
          const match = clientes.find(c => {
            const cName = String(c.cliente || c.cliente_nombre || c.razonSocial || '').toLowerCase();
            return cName && (cName.includes(tClean) || tClean.includes(cName));
          });
          if (match) {
            const foundCode = String(match.id || match.cliente_codigo || '');
            const foundName = match.cliente || match.cliente_nombre || match.razonSocial || '';
            setCodigoCliente(foundCode);
            setNombreCliente(foundName);
            setRucCliente(foundCode);
          }
        }
      }
      if (data.rif && data.rif !== 'null') setRifTitular(data.rif);

      if (data.monto !== undefined && data.monto !== null) {
        const num = parseMontoExacto(data.monto);
        if (num > 0) {
          setMontoNumerico(num);
          setMontoDisplay(new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num));
        }
      }

      if (data.fecha_pago && data.fecha_pago !== 'null') {
        const fStr = String(data.fecha_pago).trim();
        setFechaPago(fStr);

        // Consultar tasa oficial de esa fecha
        try {
          const rateRes = await fetch(`/api/tasa-bcv?date=${fStr}`);
          if (rateRes.ok) {
            const rateText = await rateRes.text();
            if (rateText.trim().startsWith('{')) {
              const rateData = JSON.parse(rateText);
              if (rateData && rateData.tasa) {
                setTasa(rateData.tasa.toString());
              }
            }
          }
        } catch (rErr) {
          console.warn("No se pudo autocompletar la tasa:", rErr);
        }
      }

      setAlertMsg({ type: 'success', text: '¡Datos extraídos con éxito! Valida o ajusta cualquier detalle.' });
      setTimeout(() => setAlertMsg(null), 4000);
    } catch (err: any) {
      console.error("Error en processOCR:", err);
      const raw = String(err?.message || '');
      const looksRaw = raw.trim().startsWith('{') || /RESOURCE_EXHAUSTED|prepayment|billing/i.test(raw);
      setAlertMsg({
        type: 'error',
        text: looksRaw || !raw
          ? 'El lector automático (IA) no está disponible por ahora. Ingresa los datos del pago manualmente.'
          : raw
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Soporte de pegado desde portapapeles (WhatsApp / Capturas)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
          handleImageInput(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pagosConsolidados]);

  // Consolidar y guardar pago
  const handleSave = async () => {
    const cleanRef = referencia.trim();
    if (!cleanRef) {
      setAlertMsg({ type: 'error', text: 'Debe ingresar el número de referencia del pago.' });
      return;
    }
    if (montoNumerico <= 0) {
      setAlertMsg({ type: 'error', text: 'Debe ingresar un monto válido mayor a 0.' });
      return;
    }
    if (!nombreCliente.trim()) {
      setAlertMsg({ type: 'error', text: 'Debe ingresar el nombre del cliente o seleccionar un código válido.' });
      return;
    }

    try {
      setIsProcessing(true);

      // Verificar si ya existe en la lista actual
      const existeEnLista = pagosConsolidados.some(p => 
        String(p.referencia || '').trim().toLowerCase() === cleanRef.toLowerCase()
      );
      if (existeEnLista) {
        setAlertMsg({ type: 'error', text: `¡Atención! La referencia ${cleanRef} ya está registrada en la lista de cobros actual.` });
        setIsProcessing(false);
        return;
      }

      // Verificar si ya existe en el historial archivado
      const existeEnHistorial = historialRelaciones.some(rel => 
        (rel.pagos || []).some((p: any) => String(p.referencia || '').trim().toLowerCase() === cleanRef.toLowerCase())
      );
      if (existeEnHistorial) {
        const confirmar = window.confirm(`⚠️ Advertencia: La referencia ${cleanRef} ya fue registrada en una relación anterior archivada en el historial. ¿Estás seguro de registrarla nuevamente?`);
        if (!confirmar) {
          setIsProcessing(false);
          return;
        }
      }

      const tasaNum = parseFloat(tasa) || 0;
      const vendedorEmail = (currentVendedor.toUpperCase().includes('MIKELANGELO') || currentVendedor.toUpperCase().includes('SOTO'))
        ? 'Mikelangelodiaz@gmail.com'
        : undefined;
      const nuevoPago = {
        id: `pago-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        vendedor: currentVendedor,
        vendedorEmail: vendedorEmail,
        ruta: ruta || 'Ruta 1',
        banco: banco.trim() || 'No especificado',
        monto: montoNumerico,
        referencia: cleanRef,
        fecha_pago: fechaPago,
        titular: titular.trim() || 'No especificado',
        rif: rifTitular.trim() || '',
        tasa: tasaNum,
        codigo_cliente: codigoCliente.trim() || 'N/A',
        nombre_cliente: nombreCliente.trim(),
        factura: factura.trim() || 'N/A',
        image: previewImage || undefined
      };

      // Registro opcional en Supabase
      if (hasValidSupabaseConfig) {
        try {
          await supabase.from('exports').insert([{
            vendedor: nuevoPago.vendedor,
            ruta: nuevoPago.ruta,
            referencia: nuevoPago.referencia,
            monto: nuevoPago.monto,
            fecha_pago: nuevoPago.fecha_pago,
            tasa: nuevoPago.tasa,
            codigo_cliente: nuevoPago.codigo_cliente,
            factura: nuevoPago.factura
          }]);
        } catch (supaErr) {
          console.warn("Registro opcional en Supabase no disponible:", supaErr);
        }
      }

      setPagosConsolidados(prev => [nuevoPago, ...prev]);
      setAlertMsg({ 
        type: 'success', 
        text: `¡Pago de ${nuevoPago.nombre_cliente} (Bs. ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(nuevoPago.monto)}) consolidado exitosamente!` 
      });

      // Limpiar formulario para el siguiente pago de forma segura
      setPreviewImage(null);
      setReferencia('');
      setMontoDisplay('');
      setMontoNumerico(0);
      setFactura('');
      setCodigoCliente('');
      setNombreCliente('');
      setRucCliente('');
      setTitular('');
      setRifTitular('');
      setShowSuggestions(false);

      setTimeout(() => setAlertMsg(null), 4000);
    } catch (err: any) {
      console.error("Error al consolidar pago:", err);
      setAlertMsg({ type: 'error', text: err.message || 'Error al guardar el pago.' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Eliminar un pago individual de la lista actual
  const handleEliminarPago = (id: string) => {
    setPagosConsolidados(prev => prev.filter(p => p.id !== id));
    setAlertMsg({ type: 'info', text: 'Pago removido de la relación actual.' });
    setTimeout(() => setAlertMsg(null), 2500);
  };

  // Generar PDF de la relación actual
  const generarRelacionPDF = () => {
    if (pagosConsolidados.length === 0) {
      setAlertMsg({ type: 'error', text: 'No hay pagos cargados para exportar en PDF.' });
      return;
    }

    setAlertMsg({ type: 'info', text: 'Generando documento PDF de la relación...' });
    try {
      const doc = new jsPDF('landscape');
      const totalMonto = pagosConsolidados.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
      const totalUSD = pagosConsolidados.reduce((acc, curr) => {
        const t = Number(curr.tasa) || 0;
        return acc + (t > 0 ? (Number(curr.monto) || 0) / t : 0);
      }, 0);

      // Encabezado
      doc.setFontSize(14);
      doc.setTextColor(211, 47, 47);
      doc.text('DISTRIBUIDORA CODIZULCA - RELACIÓN DE COBROS', 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(`Vendedor: ${currentVendedor}  |  Ruta: ${ruta}  |  Fecha: ${new Date().toLocaleDateString('es-VE')}`, 14, 21);
      doc.text(`Total Pagos: ${pagosConsolidados.length}  |  Total Bs: ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(totalMonto)}  |  Total USD: $${totalUSD.toFixed(2)}`, 14, 26);

      // Tabla de Pagos
      const tableData = pagosConsolidados.map(p => {
        const m = Number(p.monto) || 0;
        const t = Number(p.tasa) || 0;
        const usd = t > 0 ? (m / t).toFixed(2) : '0.00';
        return [
          p.codigo_cliente || 'N/A',
          p.nombre_cliente || 'Sin nombre',
          p.factura || 'N/A',
          p.banco || 'N/A',
          new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m),
          p.referencia || 'N/A',
          p.fecha_pago || 'N/A',
          p.titular || 'N/A',
          p.rif || '',
          t > 0 ? t.toFixed(2) : 'N/A',
          `$${usd}`
        ];
      });

      autoTable(doc, {
        startY: 30,
        head: [['C.C', 'Cliente', 'Factura', 'Banco', 'Monto (Bs.)', 'Referencia', 'Fecha', 'Titular', 'RIF/CI', 'Tasa', 'USD ($)']],
        body: tableData,
        headStyles: { fillColor: [211, 47, 47] },
        styles: { fontSize: 8 },
        theme: 'grid'
      });

      // Anexos de Comprobantes (hasta 10 por página)
      let imageCount = 0;
      pagosConsolidados.forEach((p, index) => {
        if (p.image) {
          if (imageCount % 10 === 0) {
            doc.addPage();
            doc.setFontSize(11);
            doc.setTextColor(211, 47, 47);
            doc.text('SOPORTES DE PAGO ADJUNTOS', 14, 12);
          }

          const localIndex = imageCount % 10;
          const col = localIndex % 5;
          const row = Math.floor(localIndex / 5);
          const x = 14 + (col * 55);
          const y = 18 + (row * 90);

          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(`Ref: ${p.referencia || 'N/A'}`, x, y);
          doc.text(`Cli: ${(p.nombre_cliente || '').slice(0, 15)}`, x, y + 4);

          try {
            doc.addImage(p.image, 'JPEG', x, y + 6, 48, 75, undefined, 'FAST');
          } catch (imgErr) {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('Error al incrustar imagen', x, y + 20);
          }

          imageCount++;
        }
      });

      const dateStr = new Date().toISOString().split('T')[0];
      doc.save(`Relacion_Cobros_${currentVendedor.replace(/\s+/g, '_')}_${dateStr}.pdf`);
      setAlertMsg({ type: 'success', text: '¡PDF exportado con éxito!' });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err: any) {
      console.error("Error al generar PDF:", err);
      setAlertMsg({ type: 'error', text: 'Error al generar el documento PDF.' });
    }
  };

  // Generar PDF desde un registro del Historial
  const generarPDFDesdeHistorial = (rel: any) => {
    setAlertMsg({ type: 'info', text: 'Generando PDF de la relación archivada...' });
    try {
      const doc = new jsPDF('landscape');
      const pagos = Array.isArray(rel.pagos) ? rel.pagos : [];
      const totalMonto = Number(rel.montoTotal) || pagos.reduce((acc: number, curr: any) => acc + (Number(curr.monto) || 0), 0);

      doc.setFontSize(14);
      doc.setTextColor(211, 47, 47);
      doc.text('DISTRIBUIDORA CODIZULCA - HISTORIAL DE RELACIÓN', 14, 15);

      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(`Vendedor: ${rel.vendedor || currentVendedor}  |  Fecha: ${new Date(rel.fecha).toLocaleDateString('es-VE')} ${new Date(rel.fecha).toLocaleTimeString('es-VE')}`, 14, 21);
      doc.text(`Total Pagos: ${pagos.length}  |  Total Bs: ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(totalMonto)}`, 14, 26);

      const tableData = pagos.map((p: any) => {
        const m = Number(p.monto) || 0;
        const t = Number(p.tasa) || 0;
        const usd = t > 0 ? (m / t).toFixed(2) : '0.00';
        return [
          p.codigo_cliente || 'N/A',
          p.nombre_cliente || 'Sin nombre',
          p.factura || 'N/A',
          p.banco || 'N/A',
          new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m),
          p.referencia || 'N/A',
          p.fecha_pago || 'N/A',
          p.titular || 'N/A',
          p.rif || '',
          t > 0 ? t.toFixed(2) : 'N/A',
          `$${usd}`
        ];
      });

      autoTable(doc, {
        startY: 30,
        head: [['C.C', 'Cliente', 'Factura', 'Banco', 'Monto (Bs.)', 'Referencia', 'Fecha', 'Titular', 'RIF/CI', 'Tasa', 'USD ($)']],
        body: tableData,
        headStyles: { fillColor: [211, 47, 47] },
        styles: { fontSize: 8 },
        theme: 'grid'
      });

      const dateStr = new Date(rel.fecha).toISOString().split('T')[0];
      doc.save(`Relacion_Historica_${(rel.vendedor || currentVendedor).replace(/\s+/g, '_')}_${dateStr}.pdf`);
      setAlertMsg({ type: 'success', text: '¡PDF histórico exportado con éxito!' });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err: any) {
      console.error("Error generando PDF histórico:", err);
      setAlertMsg({ type: 'error', text: 'Error al exportar el PDF del historial.' });
    }
  };

  // Enviar a Cuentas por Cobrar (Archivar en Historial)
  const handleEnviarCuentasPorCobrar = () => {
    if (pagosConsolidados.length === 0) return;

    const totalMonto = pagosConsolidados.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0);
    const nuevaRelacion = {
      id: `rel-${Date.now()}`,
      fecha: new Date().toISOString(),
      vendedor: currentVendedor,
      cantidadPagos: pagosConsolidados.length,
      montoTotal: totalMonto,
      pagos: [...pagosConsolidados]
    };

    setHistorialRelaciones(prev => [nuevaRelacion, ...prev]);
    setPagosConsolidados([]);
    setAlertMsg({ type: 'success', text: '¡Relación enviada y archivada en el Historial con éxito!' });
    setTimeout(() => setAlertMsg(null), 3500);
  };

  return (
    <div className="w-full">
      {/* Pestañas Superiores */}
      <div className="flex border-b border-neutral-800 mb-6 justify-between items-center">
        <div className="flex">
          <button 
            onClick={() => setActiveSubTab('nuevo')}
            className={`px-6 py-3 text-sm font-sans font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
              activeSubTab === 'nuevo' 
                ? 'text-red-500 border-b-2 border-red-500' 
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <Camera className="w-4 h-4" />
            Cargar / Registrar Cobro
          </button>
          <button 
            onClick={() => setActiveSubTab('historial')}
            className={`px-6 py-3 text-sm font-sans font-bold uppercase tracking-wider transition-colors flex items-center gap-2 ${
              activeSubTab === 'historial' 
                ? 'text-red-500 border-b-2 border-red-500' 
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            <History className="w-4 h-4" />
            Historial de Relaciones ({historialRelaciones.length})
          </button>
        </div>

        {/* Info Vendedor Activo */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono">
          <User className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-neutral-400">Vendedor:</span>
          <span className="text-white font-bold">{currentVendedor}</span>
        </div>
      </div>

      {/* Alerta Global */}
      {alertMsg && (
        <div className={`p-3.5 rounded-xl flex items-center gap-2.5 font-bold text-xs mb-6 shadow-md transition-all ${
          alertMsg.type === 'error' 
            ? 'bg-red-950/60 border border-red-900 text-red-400' 
            : alertMsg.type === 'success'
            ? 'bg-emerald-950/60 border border-emerald-900 text-emerald-400'
            : 'bg-neutral-900 border border-neutral-700 text-neutral-200'
        }`}>
          {alertMsg.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
          ) : (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-500" />
          )}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {activeSubTab === 'nuevo' ? (
        <div className="grid lg:grid-cols-[1.1fr_1.4fr] gap-6">
          
          {/* COLUMNA IZQUIERDA: FORMULARIO Y CARGA */}
          <div className="space-y-5">
            
            {/* 1. CARGA DE COMPROBANTE (IA OCR) */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                  <UploadCloud className="w-4 h-4 text-red-500" />
                  1. Carga de comprobante (OCR con IA)
                </h3>
                {previewImage && (
                  <button 
                    onClick={() => setPreviewImage(null)}
                    className="text-[11px] text-neutral-400 hover:text-white bg-neutral-900 px-2.5 py-1 rounded border border-neutral-800 transition-colors"
                  >
                    Cambiar Imagen
                  </button>
                )}
              </div>

              {!previewImage ? (
                <label className="border-2 border-dashed border-neutral-800 hover:border-red-600 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-neutral-900/40 hover:bg-neutral-900 transition-all text-center min-h-[140px] group">
                  <Camera className="w-7 h-7 text-neutral-400 group-hover:text-red-500 transition-colors mb-2" />
                  <span className="text-sm text-neutral-200 font-bold">Pega una captura, Toca o Arrastra</span>
                  <span className="text-xs text-neutral-500 mt-1 max-w-[280px]">
                    Admite JPG, PNG, HEIC de iPhone o pega directo con Ctrl+V desde WhatsApp
                  </span>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*,.heic" 
                    onChange={e => e.target.files && handleImageInput(e.target.files[0])} 
                  />
                </label>
              ) : (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden relative flex items-center justify-center h-44">
                  <img src={previewImage} alt="Comprobante" className="w-full h-full object-contain" />
                  {isProcessing && (
                    <div className="absolute inset-0 bg-neutral-950/85 flex flex-col items-center justify-center z-10 backdrop-blur-xs">
                      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-2" />
                      <span className="text-emerald-400 text-xs font-bold animate-pulse">Extrayendo datos con Gemini IA...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. FORMULARIO DE COBRO Y CLIENTE */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2 border-b border-neutral-800/80 pb-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                2. Datos del Pago y Cliente
              </h3>

              {/* Fila Cliente: Código con Autocompletado + Nombre */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 relative">
                {/* Código de Cliente */}
                <div className="relative">
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Cód. Cliente (C.C) *
                  </label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={codigoCliente} 
                      onChange={e => handleCodigoChange(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                      placeholder="Ej: 1001 o nombre" 
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 pr-8 text-white text-sm focus:border-red-500 focus:outline-none transition-colors" 
                    />
                    <Search className="w-4 h-4 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  {/* Dropdown de Sugerencias */}
                  {showSuggestions && clientSuggestions.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                      {clientSuggestions.map((c, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => selectClient(c)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 border-b border-neutral-800/60 last:border-0 flex justify-between items-center transition-colors"
                        >
                          <span className="font-bold text-white truncate max-w-[70%]">{c.cliente || c.razonSocial}</span>
                          <span className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">
                            #{c.id}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nombre / Razón Social del Cliente */}
                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Nombre / Razón Social *
                  </label>
                  <input 
                    type="text" 
                    value={nombreCliente} 
                    onChange={e => setNombreCliente(e.target.value)} 
                    placeholder="Nombre del cliente" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-neutral-200 text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>
              </div>

              {/* RUC / RIF del Cliente si existe */}
              {rucCliente && (
                <div className="text-[11px] text-neutral-400 bg-neutral-900/60 p-2 rounded border border-neutral-800/60 flex items-center justify-between">
                  <span>Código de Cartera: <strong className="text-white">#{rucCliente}</strong></span>
                  <span className="text-emerald-400 font-bold">Cliente Vinculado</span>
                </div>
              )}

              {/* Fila Factura y Tasa BCV */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Nro. de Factura *
                  </label>
                  <input 
                    type="text" 
                    value={factura} 
                    onChange={e => setFactura(e.target.value)} 
                    placeholder="Ej: 001-002" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>

                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Tasa Oficial (BCV) *
                  </label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={tasa} 
                    onChange={e => setTasa(e.target.value)} 
                    placeholder="0.00" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>
              </div>

              {/* Fila Banco y Monto */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Banco
                  </label>
                  <input 
                    type="text" 
                    value={banco} 
                    onChange={e => setBanco(e.target.value)} 
                    placeholder="Ej: Banco de Venezuela" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider block">
                      Monto (Bs.) *
                    </label>
                    {montoNumerico > 0 && parseFloat(tasa) > 0 && (
                      <span className="text-[11px] font-mono text-emerald-400 font-bold">
                        ≈ ${(montoNumerico / parseFloat(tasa)).toFixed(2)} USD
                      </span>
                    )}
                  </div>
                  <input 
                    type="text" 
                    value={montoDisplay} 
                    onChange={e => handleMontoChange(e.target.value)} 
                    onBlur={handleMontoBlur}
                    placeholder="0,00" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-emerald-400 font-mono font-bold text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>
              </div>

              {/* Fila Referencia y Fecha de Pago */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Nro. de Referencia *
                  </label>
                  <input 
                    type="text" 
                    value={referencia} 
                    onChange={e => setReferencia(e.target.value)} 
                    placeholder="Ej: 019283" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white font-mono text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>

                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Fecha de Pago *
                  </label>
                  <input 
                    type="date" 
                    value={fechaPago} 
                    onChange={e => setFechaPago(e.target.value)} 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-white text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>
              </div>

              {/* Fila Titular y RIF/Cédula */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    Titular / Remitente
                  </label>
                  <input 
                    type="text" 
                    value={titular} 
                    onChange={e => setTitular(e.target.value)} 
                    placeholder="Nombre del emisor" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-neutral-300 text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>

                <div>
                  <label className="text-[10px] font-sans font-bold text-neutral-400 uppercase tracking-wider mb-1 block">
                    R.I.F. / C.I. Titular
                  </label>
                  <input 
                    type="text" 
                    value={rifTitular} 
                    onChange={e => setRifTitular(e.target.value)} 
                    placeholder="Ej: V-18293041" 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 text-neutral-300 text-sm focus:border-red-500 focus:outline-none transition-colors" 
                  />
                </div>
              </div>

              {/* Botón de Consolidación */}
              <button 
                type="button"
                onClick={handleSave} 
                disabled={isProcessing}
                className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all uppercase tracking-wider text-sm shadow-lg cursor-pointer"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Consolidar Pago en la Relación
              </button>
            </div>
          </div>

          {/* COLUMNA DERECHA: RELACIÓN DE COBROS ACTUAL */}
          <div className="border border-neutral-800 rounded-xl bg-neutral-950 flex flex-col h-[680px] shadow-sm overflow-hidden">
            {/* Header Relación */}
            <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-sans font-bold text-neutral-300 uppercase tracking-wider">
                  Relación de Cobros Actual
                </h3>
                <p className="text-[10px] text-neutral-500 font-mono mt-0.5">
                  Vendedor: {currentVendedor}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {pagosConsolidados.length > 0 && (
                  <button 
                    onClick={generarRelacionPDF} 
                    className="flex items-center gap-1.5 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-white px-3 py-1.5 rounded-lg border border-neutral-700 transition-all uppercase tracking-wider shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-red-400" />
                    Exportar PDF
                  </button>
                )}
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/40 px-2.5 py-1.5 rounded-lg border border-emerald-900/60 font-mono">
                  {pagosConsolidados.length} {pagosConsolidados.length === 1 ? 'pago' : 'pagos'}
                </span>
              </div>
            </div>

            {/* Lista de Pagos */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {pagosConsolidados.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <div className="bg-neutral-900 p-4 rounded-full border border-neutral-800 mb-3">
                    <FileText className="w-8 h-8 text-neutral-600" />
                  </div>
                  <p className="text-sm font-sans font-bold text-neutral-400 mb-1">No hay cobros en la relación actual</p>
                  <p className="text-xs text-neutral-600 max-w-[240px]">
                    Sube una foto o completa los datos del formulario a la izquierda y presiona "Consolidar Pago".
                  </p>
                </div>
              ) : (
                pagosConsolidados.map((pago: any) => {
                  const m = Number(pago.monto) || 0;
                  const t = Number(pago.tasa) || 0;
                  const usd = t > 0 ? (m / t).toFixed(2) : null;
                  return (
                    <div 
                      key={pago.id} 
                      className="bg-neutral-900/70 border border-neutral-800 rounded-lg p-3.5 text-sm relative group hover:border-neutral-700 transition-colors shadow-xs"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="pr-2">
                          <p className="font-bold text-white text-sm leading-snug">
                            {pago.nombre_cliente || 'Cliente sin nombre'}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[11px] text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 font-mono">
                              Fact: {pago.factura || 'N/A'}
                            </span>
                            <span className="text-[11px] text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 font-mono">
                              C.C: {pago.codigo_cliente || 'N/A'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-emerald-400 font-mono font-bold text-sm">
                            {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m)} Bs
                          </p>
                          {usd && (
                            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                              ~ ${usd} USD
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-xs text-neutral-400 border-t border-neutral-800/80 pt-2.5 mt-2">
                        <span className="truncate max-w-[55%] text-neutral-400 text-[11px]">
                          {pago.banco}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-neutral-400 text-[11px]">
                            Ref: {pago.referencia}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleEliminarPago(pago.id)}
                            className="text-neutral-500 hover:text-red-400 transition-colors p-1 cursor-pointer"
                            title="Eliminar este pago de la relación"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Relación */}
            {pagosConsolidados.length > 0 && (
              <div className="p-4 border-t border-neutral-800 bg-neutral-900/60 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-mono px-1">
                  <span className="text-neutral-400">Total a Relacionar:</span>
                  <span className="text-emerald-400 font-bold text-sm">
                    Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(
                      pagosConsolidados.reduce((acc, curr) => acc + (Number(curr.monto) || 0), 0)
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={generarRelacionPDF}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2.5 rounded-lg text-xs transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer border border-neutral-700"
                  >
                    <Download className="w-3.5 h-3.5 text-red-400" />
                    Exportar PDF
                  </button>

                  <button 
                    type="button"
                    onClick={handleEnviarCuentasPorCobrar}
                    className="bg-white hover:bg-neutral-200 text-neutral-950 font-bold py-2.5 rounded-lg text-xs transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Archivar Relación
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VISTA: HISTORIAL DE RELACIONES */
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-sans font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <History className="w-5 h-5 text-red-500" />
              Historial de Relaciones Enviadas
            </h2>
            <span className="text-xs font-bold text-neutral-400 bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800 font-mono">
              {historialRelaciones.length} {historialRelaciones.length === 1 ? 'relación' : 'relaciones'}
            </span>
          </div>

          {historialRelaciones.length === 0 ? (
            <div className="text-center py-14 bg-neutral-950 border border-neutral-800 rounded-xl">
              <History className="w-10 h-10 text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-400 text-sm font-sans font-bold mb-1">No hay relaciones en el historial</p>
              <p className="text-neutral-600 text-xs">
                Cuando finalices una relación de cobros y presiones "Archivar Relación", aparecerá aquí para consultar y reenviar.
              </p>
            </div>
          ) : (
            <div className="grid gap-3.5">
              {historialRelaciones.map(rel => {
                const pagos = Array.isArray(rel.pagos) ? rel.pagos : [];
                const montoTotal = Number(rel.montoTotal) || pagos.reduce((acc: number, curr: any) => acc + (Number(curr.monto) || 0), 0);
                return (
                  <details key={rel.id} className="bg-neutral-950 border border-neutral-800 rounded-xl group overflow-hidden shadow-xs">
                    <summary className="p-4 bg-neutral-900/60 hover:bg-neutral-800/60 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors list-none">
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-950/40 border border-emerald-900/50 p-2 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white mb-0.5 tracking-wide">
                            Relación {new Date(rel.fecha).toLocaleDateString('es-VE')}
                          </h3>
                          <p className="text-[11px] text-neutral-400 font-mono">
                            {new Date(rel.fecha).toLocaleTimeString('es-VE')} &bull; Vendedor: {rel.vendedor || currentVendedor}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-6 md:gap-8">
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Pagos</p>
                          <p className="text-sm font-bold text-neutral-300 font-mono">{pagos.length}</p>
                        </div>

                        <div className="text-right">
                          <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Monto Total</p>
                          <p className="text-sm font-bold text-emerald-400 font-mono">
                            Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(montoTotal)}
                          </p>
                        </div>

                        <div className="text-neutral-500 group-open:rotate-180 transition-transform">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </summary>

                    <div className="p-4 border-t border-neutral-800 bg-neutral-950">
                      <div className="flex justify-end mb-3">
                        <button
                          type="button"
                          onClick={() => generarPDFDesdeHistorial(rel)}
                          className="flex items-center gap-1.5 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white px-3.5 py-2 rounded-lg border border-neutral-700 transition-colors uppercase tracking-wider shadow-sm cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-red-400" />
                          Exportar PDF (Reenviar)
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-neutral-800 text-[10px] font-sans text-neutral-500 uppercase tracking-wider">
                              <th className="pb-2 font-bold">Cliente</th>
                              <th className="pb-2 font-bold text-center">Banco</th>
                              <th className="pb-2 font-bold text-center">Referencia</th>
                              <th className="pb-2 font-bold text-right">Monto (Bs.)</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs font-mono text-neutral-300">
                            {pagos.map((p: any, idx: number) => (
                              <tr key={idx} className="border-b border-neutral-800/40 last:border-0 hover:bg-neutral-900/30 transition-colors">
                                <td className="py-2.5 font-sans">
                                  <div className="font-bold text-white">{p.nombre_cliente || p.codigo_cliente}</div>
                                  <div className="text-[10px] text-neutral-500">
                                    C.C: {p.codigo_cliente} &bull; Fac: {p.factura || 'Sin factura'}
                                  </div>
                                </td>
                                <td className="py-2.5 text-center text-neutral-400">{p.banco}</td>
                                <td className="py-2.5 text-center text-neutral-400">{p.referencia}</td>
                                <td className="py-2.5 text-right font-bold text-emerald-400">
                                  Bs. {new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(Number(p.monto) || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const CobrosOCR: React.FC<CobrosOCRProps> = (props) => {
  return (
    <CobrosErrorBoundary>
      <CobrosOCRInner {...props} />
    </CobrosErrorBoundary>
  );
};
