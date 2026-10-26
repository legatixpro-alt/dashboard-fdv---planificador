import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Printer, Save, Share2, Check, AlertCircle, Calendar as CalendarIcon, Store, Layers, Send, Building2, Search, BookOpen, X, Barcode } from 'lucide-react';
import { CodizulcaNotaPedidoItem, ParsedOrdenCompraAlkosto, AlkostoOrder } from '../types';
import { 
  SUCURSALES_ALKOSTO, 
  SUCURSALES_FAMILIA_CENTER,
  CADENAS_ABREVIATURAS,
  CATALOGO_ALKOSTO,
  CatalogoAlkostoItem,
  resolverProductoPorCodigoODescripcion,
  normalizarCodigoProducto,
  getSucursalByTag,
  detectCadenaFromTagOrName,
  saveAlkostoOrder, 
  transmitirPedidoAlkosto 
} from '../services/alkostoService';

interface CodizulcaNotaPedidoProps {
  initialData?: ParsedOrdenCompraAlkosto | null;
  vendedoraNombre?: string;
  initialSucursal?: { codigo: string; nombre: string; cadena?: 'ALKOSTO' | 'FAMILIA_CENTER' } | null;
  onOrderSaved?: () => void;
}

// Helper numérico robusto contra formato venezolano e internacional (ej: 210,00 o 1.500,50 o 1,500.50 o con símbolos)
function parseNumeroSeguro(val: any): number {
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
}

// Extrae lista de renglones/items de cualquier clave o estructura devuelta por OCR
function extractItemsList(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.articulos)) return data.articulos;
  if (Array.isArray(data.artículos)) return data.artículos;
  if (Array.isArray(data.productos)) return data.productos;
  if (Array.isArray(data.renglones)) return data.renglones;
  if (Array.isArray(data.detalle)) return data.detalle;
  if (Array.isArray(data.detalles)) return data.detalles;
  if (Array.isArray(data.lineas)) return data.lineas;
  if (Array.isArray(data.filas)) return data.filas;
  if (data.orden && typeof data.orden === 'object') return extractItemsList(data.orden);
  if (data.data && typeof data.data === 'object') return extractItemsList(data.data);
  if (data.ordenCompra && typeof data.ordenCompra === 'object') return extractItemsList(data.ordenCompra);
  if (data.ordenDeCompra && typeof data.ordenDeCompra === 'object') return extractItemsList(data.ordenDeCompra);
  if (data.order && typeof data.order === 'object') return extractItemsList(data.order);
  if (data.pedido && typeof data.pedido === 'object') return extractItemsList(data.pedido);
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length > 0 && typeof data[k][0] === 'object') {
      return data[k];
    }
  }
  return [];
}

// Construye las filas de la tabla poblándolas exactamente a partir de la data de la Orden de Compra
function buildFilasFromData(data: ParsedOrdenCompraAlkosto | null | undefined, tienda: string = 'CONSOLIDADO'): CodizulcaNotaPedidoItem[] {
  const itemsList = extractItemsList(data);
  const totalItems = itemsList.length;
  const numRows = Math.max(15, totalItems);
  const result: CodizulcaNotaPedidoItem[] = [];

  for (let i = 0; i < numRows; i++) {
    if (i < totalItems) {
      const it = itemsList[i];
      let cant = parseNumeroSeguro(it.totalCantidad) || 
                 parseNumeroSeguro((it as any).total_cantidad) || 
                 parseNumeroSeguro((it as any).cantidad) || 
                 parseNumeroSeguro((it as any).cant) || 
                 parseNumeroSeguro((it as any).cantidadSolicitada) || 
                 parseNumeroSeguro((it as any).total) || 
                 parseNumeroSeguro((it as any).cajas) || 
                 parseNumeroSeguro((it as any).bultos) || 0;

      // Si se selecciona una tienda individual (ej. AK01, FC01...), usar la cantidad de esa tienda
      if (tienda !== 'CONSOLIDADO') {
        if (it.tiendas && it.tiendas[tienda] !== undefined) {
          cant = parseNumeroSeguro(it.tiendas[tienda]);
        } else if ((it as any)[tienda] !== undefined) {
          cant = parseNumeroSeguro((it as any)[tienda]);
        } else {
          cant = 0;
        }
      } else if (!cant && it.tiendas && typeof it.tiendas === 'object') {
        cant = (Object.values(it.tiendas) as any[]).reduce((sum: number, v: any) => sum + parseNumeroSeguro(v), 0);
      }

      const rawCode = String(
        it.codigo || 
        it.skuCodizulca || 
        (it as any).sku || 
        (it as any).codigoArticulo || 
        (it as any).codigo_articulo || 
        (it as any).codigoBarra || 
        (it as any).ean || 
        ''
      ).trim();
      const rawDesc = String(
        it.descripcion || 
        (it as any).descripcion_producto || 
        (it as any).producto || 
        (it as any).nombre || 
        (it as any).articulo || 
        (it as any).item || 
        (it as any).detalle || 
        ''
      ).trim();
      const match = resolverProductoPorCodigoODescripcion(rawCode, rawDesc);

      const finalSku = (match ? match.sku : '') || (it.skuCodizulca && it.skuCodizulca.length <= 6 ? it.skuCodizulca : '') || (rawCode.length <= 6 ? rawCode : '') || rawCode;
      const finalBarcode = it.codigoBarra || (it as any).barcode || match?.codigoBarra || '';
      // Preservar la descripción exacta leída de la orden; si no viene, usar la del catálogo
      const finalDesc = rawDesc || (match ? match.producto : '');
      const finalUnid = it.unid || (it as any).unidad || match?.unidadSugerida || (parseNumeroSeguro(it.emp) > 0 ? 'CJ' : 'KG');
      
      let finalPrecio = parseNumeroSeguro(it.costoUnitario) || 
                        parseNumeroSeguro((it as any).costo_unitario) || 
                        parseNumeroSeguro((it as any).costoBruto) || 
                        parseNumeroSeguro((it as any).precio) || 
                        parseNumeroSeguro((it as any).precioUnitario) || 
                        (match ? match.precioSugeridoUSD : 0);
      let sub = parseNumeroSeguro((it as any).totalRenglon) || 
                parseNumeroSeguro((it as any).total_renglon) || 
                parseNumeroSeguro((it as any).subtotal) || 
                parseNumeroSeguro((it as any).total);
      if (!finalPrecio && sub > 0 && cant > 0) {
        finalPrecio = Number((sub / cant).toFixed(2));
      } else if (finalPrecio > 0 && !sub && cant > 0) {
        sub = Number((cant * finalPrecio).toFixed(2));
      }

      result.push({
        renglon: i + 1,
        unid: finalUnid,
        cantSolicitada: cant,
        cantDespachada: '',
        codigo: finalSku,
        skuCodizulca: finalSku,
        codigoBarra: finalBarcode,
        descripcion: finalDesc,
        precio: finalPrecio,
        subtotal: sub,
        tiendas: it.tiendas
      });
    } else {
      result.push({
        renglon: i + 1,
        unid: '',
        cantSolicitada: 0,
        cantDespachada: '',
        codigo: '',
        descripcion: '',
        precio: 0,
        subtotal: 0
      });
    }
  }

  return result;
}

export function CodizulcaNotaPedido({ 
  initialData, 
  vendedoraNombre = 'SAIRU VALLES',
  initialSucursal,
  onOrderSaved 
}: CodizulcaNotaPedidoProps) {
  // Detección inicial de cadena según initialData
  const getInitialCadena = (): 'ALKOSTO' | 'FAMILIA_CENTER' => {
    if (initialSucursal?.cadena) return initialSucursal.cadena;
    if (!initialData) return 'ALKOSTO';
    const rawItems = extractItemsList(initialData);
    const tagsList: string[] = [];
    rawItems.forEach((it: any) => {
      if (it.tiendas) Object.keys(it.tiendas).forEach(tk => tagsList.push(tk));
    });
    const esFamilia = tagsList.some(t => t.startsWith('FC')) || 
                      (initialData as any).clienteCadena === 'FAMILIA_CENTER' || 
                      /familia/i.test(initialData.proveedorNombre || '') || 
                      /familia/i.test(initialData.sede || '') || 
                      initialData.sede === 'FCOP';
    return esFamilia ? 'FAMILIA_CENTER' : 'ALKOSTO';
  };

  // Datos de cabecera del formato inicializados con initialData si está disponible
  const [cadenaActiva, setCadenaActiva] = useState<'ALKOSTO' | 'FAMILIA_CENTER'>(() => getInitialCadena());
  const [clienteNombre, setClienteNombre] = useState(() => {
    if (initialSucursal?.nombre) return initialSucursal.nombre;
    const cad = getInitialCadena();
    return cad === 'FAMILIA_CENTER' ? SUCURSALES_FAMILIA_CENTER[0].nombre : SUCURSALES_ALKOSTO[0].nombre;
  });
  const [fecha, setFecha] = useState(() => {
    if (initialData?.fechaEntrega) return initialData.fechaEntrega;
    const today = new Date();
    return today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  });
  const [fechaISO, setFechaISO] = useState(() => {
    if (initialData?.fechaEntrega && /^\d{4}-\d{2}-\d{2}$/.test(initialData.fechaEntrega)) return initialData.fechaEntrega;
    return new Date().toISOString().split('T')[0];
  });
  const [idCliente, setIdCliente] = useState(() => {
    if (initialSucursal?.codigo) return initialSucursal.codigo;
    const cad = getInitialCadena();
    return cad === 'FAMILIA_CENTER' ? SUCURSALES_FAMILIA_CENTER[0].codigo : SUCURSALES_ALKOSTO[0].codigo;
  });
  const [nroPedido, setNroPedido] = useState('AUTO');
  const [ordenCompraRef, setOrdenCompraRef] = useState(() => {
    if (!initialData) return '';
    return initialData.ordenNro || (initialData as any).numeroOrden || (initialData as any).nroOrden || (initialData as any).oc || '';
  });
  const [ruta, setRuta] = useState('SAIRU VALLES / CUENTAS CLAVE 2');
  const [supervisor, setSupervisor] = useState('PEDRO PEREZ');
  const [chofer, setChofer] = useState('TRANSPORTE CODIZULCA');
  const [observaciones, setObservaciones] = useState('');
  const [cantidadCestas, setCantidadCestas] = useState('0');

  // Tiendas disponibles
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState<string>('CONSOLIDADO');
  const [tiendasDisponibles, setTiendasDisponibles] = useState<string[]>(() => {
    const cad = getInitialCadena();
    return cad === 'FAMILIA_CENTER' ? CADENAS_ABREVIATURAS.FAMILIA_CENTER : CADENAS_ABREVIATURAS.ALKOSTO;
  });

  // Filas del formato pobladas de inmediato desde initialData
  const [filas, setFilas] = useState<CodizulcaNotaPedidoItem[]>(() => {
    return buildFilasFromData(initialData, 'CONSOLIDADO');
  });

  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [transmitiendo, setTransmitiendo] = useState(false);

  // Función para limpiar completamente el formato y dejarlo listo para otra OC
  const limpiarFormato = () => {
    setOrdenCompraRef('');
    setObservaciones('');
    setNroPedido('AUTO');
    setTiendaSeleccionada('CONSOLIDADO');
    setCantidadCestas('0');
    const today = new Date();
    setFecha(today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    setFechaISO(today.toISOString().split('T')[0]);
    const items: CodizulcaNotaPedidoItem[] = [];
    for (let i = 1; i <= 15; i++) {
      items.push({
        renglon: i,
        unid: '',
        cantSolicitada: 0,
        cantDespachada: '',
        codigo: '',
        descripcion: '',
        precio: 0,
        subtotal: 0
      });
    }
    setFilas(items);
  };

  // Al recibir o cambiar datos extraídos por OCR, poblar automáticamente el formato
  useEffect(() => {
    if (initialData) {
      const ocNum = initialData.ordenNro || (initialData as any).numeroOrden || (initialData as any).nroOrden || (initialData as any).oc || '';
      if (ocNum) {
        setOrdenCompraRef(ocNum);
      }
      const fechaVal = initialData.fechaEntrega || (initialData as any).fecha || (initialData as any).entrega || '';
      if (fechaVal) {
        setFecha(fechaVal);
        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaVal)) {
          setFechaISO(fechaVal);
        }
      }

      setTiendaSeleccionada('CONSOLIDADO');
      setObservaciones('');

      const rawItems = extractItemsList(initialData);

      // Detectar cadena según datos extraídos
      const tagsList: string[] = [];
      rawItems.forEach((it: any) => {
        if (it.tiendas) Object.keys(it.tiendas).forEach(tk => tagsList.push(tk));
      });
      const esFamilia = tagsList.some(t => t.startsWith('FC')) || 
                        (initialData as any).clienteCadena === 'FAMILIA_CENTER' || 
                        /familia/i.test(initialData.proveedorNombre || '') || 
                        /familia/i.test(initialData.sede || '') || 
                        initialData.sede === 'FCOP';

      const detectedCadena = esFamilia ? 'FAMILIA_CENTER' : 'ALKOSTO';
      setCadenaActiva(detectedCadena);

      // Detectar tiendas disponibles en los items
      const tiendaSet = new Set<string>();
      tagsList.forEach(tk => {
        tiendaSet.add(tk);
      });
      if (tiendaSet.size === 0) {
        const defaultTags = detectedCadena === 'FAMILIA_CENTER' ? CADENAS_ABREVIATURAS.FAMILIA_CENTER : CADENAS_ABREVIATURAS.ALKOSTO;
        defaultTags.forEach(t => tiendaSet.add(t));
      }
      const tiendasArray = Array.from(tiendaSet).sort();
      setTiendasDisponibles(tiendasArray);

      // Cargar filas consolidadas de inmediato con buildFilasFromData
      setFilas(buildFilasFromData(initialData, 'CONSOLIDADO'));

      const defaultSuc = detectedCadena === 'FAMILIA_CENTER' ? SUCURSALES_FAMILIA_CENTER[0] : SUCURSALES_ALKOSTO[0];
      setClienteNombre(defaultSuc.nombre);
      setIdCliente(defaultSuc.codigo);
      setObservaciones(defaultSuc.direccion);
    } else if (initialSucursal) {
      if (initialSucursal.cadena) setCadenaActiva(initialSucursal.cadena);
      setClienteNombre(initialSucursal.nombre);
      setIdCliente(initialSucursal.codigo);
      const foundSuc = [...SUCURSALES_ALKOSTO, ...SUCURSALES_FAMILIA_CENTER].find(s => s.codigo === initialSucursal.codigo);
      if (foundSuc) setObservaciones(foundSuc.direccion);
    } else {
      limpiarFormato();
    }
  }, [initialData, initialSucursal]);

  const [modalCatalogo, setModalCatalogo] = useState(false);
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('');

  // Carga las filas según si es consolidado o una tienda individual (AK01..AK10 o FC01..FC07)
  const cargarFilasSegunTienda = (tienda: string, data = initialData, cadena = cadenaActiva) => {
    const dataFilas = buildFilasFromData(data, tienda);
    setFilas(dataFilas);

    // Actualizar nombre, código y descripción de sucursal según listado oficial
    if (tienda !== 'CONSOLIDADO') {
      const suc = getSucursalByTag(tienda);
      if (suc) {
        setClienteNombre(suc.nombre);
        setIdCliente(suc.codigo);
        setObservaciones(suc.direccion);
      } else {
        const fallbackSuc = (tienda.startsWith('FC') || cadena === 'FAMILIA_CENTER') ? SUCURSALES_FAMILIA_CENTER[0] : SUCURSALES_ALKOSTO[0];
        setClienteNombre(fallbackSuc.nombre);
        setIdCliente(fallbackSuc.codigo);
        setObservaciones(fallbackSuc.direccion);
      }
    } else {
      const defaultSuc = cadena === 'FAMILIA_CENTER' ? SUCURSALES_FAMILIA_CENTER[0] : SUCURSALES_ALKOSTO[0];
      setClienteNombre(defaultSuc.nombre);
      setIdCliente(defaultSuc.codigo);
      setObservaciones(defaultSuc.direccion);
    }
  };

  // Manejar cambio manual de cadena (Alkosto vs Familia Center)
  const handleCambiarCadena = (nuevaCadena: 'ALKOSTO' | 'FAMILIA_CENTER') => {
    setCadenaActiva(nuevaCadena);
    const tags = nuevaCadena === 'FAMILIA_CENTER' ? CADENAS_ABREVIATURAS.FAMILIA_CENTER : CADENAS_ABREVIATURAS.ALKOSTO;
    setTiendasDisponibles(tags);
    setTiendaSeleccionada('CONSOLIDADO');
    cargarFilasSegunTienda('CONSOLIDADO', initialData, nuevaCadena);
  };

  // Manejar cambio de tienda seleccionada
  const handleCambiarTienda = (t: string) => {
    setTiendaSeleccionada(t);
    cargarFilasSegunTienda(t);
  };

  // Actualizar una celda específica con auto-resolución de código y producto
  const handleActualizarCelda = (
    index: number, 
    campo: keyof CodizulcaNotaPedidoItem, 
    valor: any
  ) => {
    const copy = [...filas];
    const fila = { ...copy[index], [campo]: valor };

    // Si se modifica el código, resolver automáticamente con el catálogo maestro y dejar SOLO EL SKU
    if (campo === 'codigo') {
      const match = resolverProductoPorCodigoODescripcion(valor, fila.descripcion);
      if (match) {
        fila.codigo = match.sku; // Solo los SKU
        fila.skuCodizulca = match.sku;
        fila.codigoBarra = match.codigoBarra;
        if (!fila.descripcion || fila.descripcion === '') fila.descripcion = match.producto;
        if (!fila.unid || fila.unid === '') fila.unid = match.unidadSugerida || 'CJ';
        if (!fila.precio || fila.precio === 0) fila.precio = match.precioSugeridoUSD;
      }
    }

    // Si se modifica la descripción, resolver automáticamente con el catálogo maestro y dejar SOLO EL SKU
    if (campo === 'descripcion') {
      const match = resolverProductoPorCodigoODescripcion(fila.codigo, valor);
      if (match) {
        fila.codigo = match.sku; // Solo los SKU
        fila.skuCodizulca = match.sku;
        fila.codigoBarra = match.codigoBarra;
        if (!fila.unid || fila.unid === '') fila.unid = match.unidadSugerida || 'CJ';
        if (!fila.precio || fila.precio === 0) fila.precio = match.precioSugeridoUSD;
      }
    }

    // Si cambió cantidad o precio, recalcular subtotal (la cantidad despachada se mantiene en blanco)
    if (campo === 'cantSolicitada' || campo === 'precio' || campo === 'codigo' || campo === 'descripcion') {
      const cant = Number(campo === 'cantSolicitada' ? valor : fila.cantSolicitada) || 0;
      const prec = Number(campo === 'precio' ? valor : fila.precio) || 0;
      fila.subtotal = Number((cant * prec).toFixed(2));
    }

    copy[index] = fila;
    setFilas(copy);
  };

  // Insertar un producto seleccionado desde el catálogo en el primer renglón disponible
  const handleInsertarProductoDesdeCatalogo = (prod: CatalogoAlkostoItem) => {
    const copy = [...filas];
    let targetIndex = copy.findIndex(f => !f.codigo && !f.descripcion && (!f.cantSolicitada || f.cantSolicitada === 0));

    if (targetIndex === -1) {
      targetIndex = copy.length;
      copy.push({
        renglon: targetIndex + 1,
        unid: prod.unidadSugerida || 'CJ',
        cantSolicitada: 1,
        cantDespachada: '', // Columna de cantidad despachada en blanco
        codigo: prod.sku, // Dejar solo el SKU
        skuCodizulca: prod.sku,
        codigoBarra: prod.codigoBarra,
        descripcion: prod.producto,
        precio: prod.precioSugeridoUSD,
        subtotal: prod.precioSugeridoUSD
      });
    } else {
      const existing = copy[targetIndex];
      const cant = existing.cantSolicitada > 0 ? existing.cantSolicitada : 1;
      copy[targetIndex] = {
        ...existing,
        unid: prod.unidadSugerida || 'CJ',
        cantSolicitada: cant,
        cantDespachada: '', // Columna de cantidad despachada en blanco
        codigo: prod.sku, // Dejar solo el SKU
        skuCodizulca: prod.sku,
        codigoBarra: prod.codigoBarra,
        descripcion: prod.producto,
        precio: prod.precioSugeridoUSD,
        subtotal: Number((cant * prod.precioSugeridoUSD).toFixed(2))
      };
    }

    setFilas(copy);
    setModalCatalogo(false);
    setMensajeExito(`¡Producto ${prod.producto} (${prod.sku}) agregado a la nota de pedido!`);
    setTimeout(() => setMensajeExito(null), 3000);
  };

  // Agregar renglón adicional
  const handleAgregarRenglon = () => {
    setFilas([
      ...filas,
      {
        renglon: filas.length + 1,
        unid: 'CJ',
        cantSolicitada: 0,
        cantDespachada: '',
        codigo: '',
        descripcion: '',
        precio: 0,
        subtotal: 0
      }
    ]);
  };

  // Cálculo del total general
  const totalGeneral = filas.reduce((acc, f) => acc + (Number(f.subtotal) || 0), 0);
  const totalBultosCajas = filas.reduce((acc, f) => acc + (Number(f.cantSolicitada) || 0), 0);

  // Imprimir formato oficial
  const handleImprimir = () => {
    window.print();
  };

  // Guardar en base de datos Firestore y sincronizar
  const handleGuardarEnSistema = async () => {
    setGuardando(true);
    try {
      const itemsValidos = filas.filter(f => f.codigo || f.descripcion || f.cantSolicitada > 0);
      
      const nuevoPedido: AlkostoOrder = {
        id: `alk-doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        numeroPedido: nroPedido === 'AUTO' ? 'PENDIENTE' : nroPedido,
        correlativo: nroPedido === 'AUTO' ? undefined : nroPedido,
        ordenCompraAlkosto: ordenCompraRef.trim() || undefined,
        sucursalCodigo: idCliente,
        sucursalNombre: clienteNombre,
        direccionEntrega: 'Entrega según orden de compra',
        vendedora: vendedoraNombre.toUpperCase(),
        ruta: ruta.toUpperCase(),
        fechaPedido: fechaISO,
        fechaEntregaEstimada: fechaISO,
        items: itemsValidos.map(it => {
          const match = resolverProductoPorCodigoODescripcion(it.codigo, it.descripcion);
          const kxBox = match ? match.kilosPorCaja : (it.unid === 'KG' ? 1 : 10);
          const totalK = it.unid === 'KG' ? Number(it.cantSolicitada) : (Number(it.cantSolicitada) * kxBox);
          return {
            id: `item-${it.renglon}`,
            sku: it.skuCodizulca || (match ? match.sku : it.codigo),
            producto: it.descripcion,
            categoria: match ? match.categoria : 'CHARCUTERIA / CARNES',
            presentacion: it.unid || (match ? match.presentacion : 'CJ'),
            cantidadCajas: Number(it.cantSolicitada) || 0,
            kilosPorCaja: kxBox,
            totalKilos: totalK,
            precioUnitarioUSD: Number(it.precio) || 0,
            subtotalUSD: Number(it.subtotal) || 0
          };
        }),
        totalBultos: totalBultosCajas,
        totalKilos: itemsValidos.reduce((acc, it) => {
          const match = resolverProductoPorCodigoODescripcion(it.codigo, it.descripcion);
          const kxBox = match ? match.kilosPorCaja : (it.unid === 'KG' ? 1 : 10);
          return acc + (it.unid === 'KG' ? Number(it.cantSolicitada) : Number(it.cantSolicitada) * kxBox);
        }, 0),
        totalUSD: totalGeneral,
        estado: 'ENVIADO',
        transmitido_a_pedidos_manuales: true,
        fecha_transmision: new Date().toISOString(),
        condicionPago: 'Crédito 21 días',
        observaciones: observaciones,
        createdAt: new Date().toISOString()
      };

      const pedidoGuardado = await saveAlkostoOrder(nuevoPedido);
      const correlativoFinal = pedidoGuardado.correlativo || pedidoGuardado.numeroPedido;
      setNroPedido(correlativoFinal);

      // Transmitir directamente a la Sala de Espera del Programa de Pedidos Manuales
      try {
        await transmitirPedidoAlkosto(pedidoGuardado);
        setMensajeExito(`¡Pedido N° ${correlativoFinal} transmitido directamente a la Sala de Espera de Pedidos Manuales! Tu app queda despejada.`);
      } catch (txErr) {
        setMensajeExito(`¡Pedido guardado N° ${correlativoFinal}! Enviado a Pedidos Manuales.`);
      }

      setTimeout(() => setMensajeExito(null), 5000);
      if (onOrderSaved) onOrderSaved();
    } catch (err: any) {
      console.error(err);
      alert('Error guardando pedido: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleTransmitirAOtroPrograma = async () => {
    setTransmitiendo(true);
    try {
      // 1. Si está en modo CONSOLIDADO y hay múltiples tiendas con cantidades en la orden:
      // Se debe separar cada pedido por tienda para que cada uno llegue por separado a la sala de espera
      // y tenga su propio número de correlativo asignado.
      const pedidosParaEnviar: AlkostoOrder[] = [];

      if (tiendaSeleccionada === 'CONSOLIDADO' && tiendasDisponibles.length > 0) {
        tiendasDisponibles.forEach((tTag, idx) => {
          // Filtrar items con cantidad > 0 para esta tienda
          const itemsTienda: CodizulcaNotaPedidoItem[] = [];
          filas.forEach(f => {
            if (!f.codigo && !f.descripcion) return;
            const cant = f.tiendas && f.tiendas[tTag] !== undefined 
              ? Number(f.tiendas[tTag]) || 0 
              : 0;
            if (cant > 0) {
              itemsTienda.push({
                ...f,
                cantSolicitada: cant,
                subtotal: Number((cant * (f.precio || 0)).toFixed(2))
              });
            }
          });

          if (itemsTienda.length > 0) {
            const suc = getSucursalByTag(tTag);
            const totalBultos = itemsTienda.reduce((acc, it) => acc + (Number(it.cantSolicitada) || 0), 0);
            const totalKilos = itemsTienda.reduce((acc, it) => {
              const match = resolverProductoPorCodigoODescripcion(it.codigo, it.descripcion);
              const kxBox = match ? match.kilosPorCaja : (it.unid === 'KG' ? 1 : 10);
              return acc + (it.unid === 'KG' ? Number(it.cantSolicitada) : Number(it.cantSolicitada) * kxBox);
            }, 0);
            const totalUSD = itemsTienda.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);

            const pedidoTienda: AlkostoOrder = {
              id: `alk-${tTag.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
              numeroPedido: 'AUTO',
              ordenCompraAlkosto: ordenCompraRef.trim() || undefined,
              sucursalCodigo: suc?.codigo || '7498',
              sucursalNombre: suc?.nombre || tTag,
              direccionEntrega: suc?.direccion || 'Entrega según orden de compra',
              vendedora: vendedoraNombre.toUpperCase(),
              ruta: ruta.toUpperCase(),
              fechaPedido: fechaISO,
              fechaEntregaEstimada: fechaISO,
              items: itemsTienda.map((it, itemIdx) => {
                const match = resolverProductoPorCodigoODescripcion(it.codigo, it.descripcion);
                const kxBox = match ? match.kilosPorCaja : (it.unid === 'KG' ? 1 : 10);
                const totalK = it.unid === 'KG' ? Number(it.cantSolicitada) : (Number(it.cantSolicitada) * kxBox);
                return {
                  id: `item-${it.renglon || itemIdx + 1}`,
                  sku: it.skuCodizulca || (match ? match.sku : it.codigo),
                  producto: it.descripcion,
                  categoria: match ? match.categoria : 'CHARCUTERIA / CARNES',
                  presentacion: it.unid || (match ? match.presentacion : 'CJ'),
                  cantidadCajas: Number(it.cantSolicitada) || 0,
                  kilosPorCaja: kxBox,
                  totalKilos: totalK,
                  precioUnitarioUSD: Number(it.precio) || 0,
                  subtotalUSD: Number(it.subtotal) || 0
                };
              }),
              totalBultos,
              totalKilos,
              totalUSD,
              estado: 'ENVIADO',
              transmitido_a_pedidos_manuales: true,
              fecha_transmision: new Date().toISOString(),
              condicionPago: 'Crédito 21 días',
              observaciones: suc?.direccion || observaciones,
              createdAt: new Date(Date.now() + idx * 40).toISOString()
            };
            pedidosParaEnviar.push(pedidoTienda);
          }
        });
      }

      // Si no se separaron por tienda (o si el usuario seleccionó una tienda específica como AK01, o no hay desglose):
      if (pedidosParaEnviar.length === 0) {
        const itemsValidos = filas.filter(f => (f.codigo || f.descripcion) && Number(f.cantSolicitada) > 0);
        const suc = getSucursalByTag(tiendaSeleccionada);
        const pedidoUnico: AlkostoOrder = {
          id: `alk-doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          numeroPedido: nroPedido === 'AUTO' ? 'PENDIENTE' : nroPedido,
          correlativo: nroPedido === 'AUTO' ? undefined : nroPedido,
          ordenCompraAlkosto: ordenCompraRef.trim() || undefined,
          sucursalCodigo: suc?.codigo || idCliente,
          sucursalNombre: suc?.nombre || clienteNombre,
          direccionEntrega: suc?.direccion || 'Entrega según orden de compra',
          vendedora: vendedoraNombre.toUpperCase(),
          ruta: ruta.toUpperCase(),
          fechaPedido: fechaISO,
          fechaEntregaEstimada: fechaISO,
          items: itemsValidos.map(it => {
            const match = resolverProductoPorCodigoODescripcion(it.codigo, it.descripcion);
            const kxBox = match ? match.kilosPorCaja : (it.unid === 'KG' ? 1 : 10);
            const totalK = it.unid === 'KG' ? Number(it.cantSolicitada) : (Number(it.cantSolicitada) * kxBox);
            return {
              id: `item-${it.renglon}`,
              sku: it.skuCodizulca || (match ? match.sku : it.codigo),
              producto: it.descripcion,
              categoria: match ? match.categoria : 'CHARCUTERIA / CARNES',
              presentacion: it.unid || (match ? match.presentacion : 'CJ'),
              cantidadCajas: Number(it.cantSolicitada) || 0,
              kilosPorCaja: kxBox,
              totalKilos: totalK,
              precioUnitarioUSD: Number(it.precio) || 0,
              subtotalUSD: Number(it.subtotal) || 0
            };
          }),
          totalBultos: totalBultosCajas,
          totalKilos: itemsValidos.reduce((acc, it) => {
            const match = resolverProductoPorCodigoODescripcion(it.codigo, it.descripcion);
            const kxBox = match ? match.kilosPorCaja : (it.unid === 'KG' ? 1 : 10);
            return acc + (it.unid === 'KG' ? Number(it.cantSolicitada) : Number(it.cantSolicitada) * kxBox);
          }, 0),
          totalUSD: totalGeneral,
          estado: 'ENVIADO',
          transmitido_a_pedidos_manuales: true,
          fecha_transmision: new Date().toISOString(),
          condicionPago: 'Crédito 21 días',
          observaciones: observaciones,
          createdAt: new Date().toISOString()
        };
        pedidosParaEnviar.push(pedidoUnico);
      }

      // Guardar secuencialmente cada pedido y transmitir directamente a la Sala de Espera de Pedidos Manuales
      const guardados: AlkostoOrder[] = [];
      for (const p of pedidosParaEnviar) {
        const g = await saveAlkostoOrder(p);
        guardados.push(g);
        try {
          await transmitirPedidoAlkosto(g);
        } catch (tErr) {
          console.warn("Transmisión Pedidos Manuales aviso:", tErr);
        }
      }

      const correlativosList = guardados.map(g => g.correlativo || g.numeroPedido);
      if (guardados.length > 1) {
        setMensajeExito(`¡${guardados.length} pedidos transmitidos directamente a la Sala de Espera del Gestor de Pedidos Manuales! Correlativos: N° ${correlativosList.join(', N° ')}. Formato limpio listo para la siguiente OC.`);
      } else {
        const unicoCorrelativo = correlativosList[0] || 'AUTO';
        setNroPedido(unicoCorrelativo);
        setMensajeExito(`¡Pedido transmitido directamente a la Sala de Espera del Gestor de Pedidos Manuales! Correlativo: N° ${unicoCorrelativo}. Tu app queda despejada.`);
      }

      // Limpiar y resetear el formato inmediatamente para que quede listo para enviar otra OC
      limpiarFormato();

      setTimeout(() => setMensajeExito(null), 6000);
      if (onOrderSaved) {
        onOrderSaved();
      }
    } catch (err: any) {
      alert('Error al transmitir pedido: ' + err.message);
    } finally {
      setTransmitiendo(false);
    }
  };

  return (
    <div className="space-y-4">
      
      {/* BARRA SUPERIOR DE HERRAMIENTAS Y ACCIONES REORDENADA PARA CELULAR */}
      <div className="print:hidden bg-neutral-950 border border-neutral-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col gap-3.5">
        
        {/* FILA 1 (MÓVIL Y DESKTOP): CABECERA Y CORRELATIVO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-neutral-900">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-sm">
                Formato Oficial Codizulca
              </span>
              <span className="text-[11px] text-amber-400 font-mono font-bold bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                Correlativo: {nroPedido && nroPedido !== 'AUTO' && !nroPedido.startsWith('PENDIENTE') ? `N° ${nroPedido}` : 'Auto en Sala de Espera'}
              </span>
            </div>
            <h2 className="text-xs sm:text-sm font-bold text-white mt-1">
              Nota de Pedido y Despacho Comercial
            </h2>
          </div>
        </div>

        {/* FILA 2: SELECTORES DE CADENA Y TIENDAS ADAPTADOS PARA CELULAR */}
        <div className="flex flex-col gap-2.5">
          {/* SELECTOR DE CADENA CON BOTONES TÁCTILES EN CELULAR */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] uppercase font-bold text-neutral-400 shrink-0 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-amber-500" /> Cadena:
            </span>
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleCambiarCadena('ALKOSTO')}
                className={`text-xs py-2 px-3 rounded-xl font-bold transition-all text-center ${
                  cadenaActiva === 'ALKOSTO'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                }`}
              >
                ALKOSTO (AK01 - AK10)
              </button>
              <button
                type="button"
                onClick={() => handleCambiarCadena('FAMILIA_CENTER')}
                className={`text-xs py-2 px-3 rounded-xl font-bold transition-all text-center ${
                  cadenaActiva === 'FAMILIA_CENTER'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                }`}
              >
                FAMILIA CENTER (FC01 - FC07)
              </button>
            </div>
          </div>

          {/* SELECTOR DIRECTO DE ID Y NOMBRE OFICIAL DE SUCURSAL */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] uppercase font-bold text-neutral-400 shrink-0 flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-emerald-400" /> Sucursal / Código:
            </span>
            <select
              value={idCliente}
              onChange={(e) => {
                const selectedCode = e.target.value;
                const suc = [...SUCURSALES_ALKOSTO, ...SUCURSALES_FAMILIA_CENTER].find(s => s.codigo === selectedCode);
                if (suc) {
                  setIdCliente(suc.codigo);
                  setClienteNombre(suc.nombre);
                  setObservaciones(suc.direccion);
                  if (suc.tag && tiendasDisponibles.includes(suc.tag)) {
                    setTiendaSeleccionada(suc.tag);
                    setFilas(buildFilasFromData(initialData, suc.tag));
                  }
                }
              }}
              className="w-full sm:w-auto flex-1 bg-neutral-900 border border-neutral-800 text-xs font-mono font-bold text-white rounded-xl px-3 py-2 focus:outline-none focus:border-red-500"
            >
              {(cadenaActiva === 'FAMILIA_CENTER' ? SUCURSALES_FAMILIA_CENTER : SUCURSALES_ALKOSTO).map(s => (
                <option key={s.codigo} value={s.codigo}>
                  {s.nombre} — Código: {s.codigo} ({s.direccion})
                </option>
              ))}
            </select>
          </div>

          {/* SELECTOR DE SUCURSAL ESPECÍFICA CON SCROLL SUAVE EN CELULAR */}
          {tiendasDisponibles.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
              <span className="text-[10px] uppercase font-bold text-neutral-400 shrink-0 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-red-500" /> Tienda:
              </span>
              <button
                type="button"
                onClick={() => handleCambiarTienda('CONSOLIDADO')}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold shrink-0 transition-all ${
                  tiendaSeleccionada === 'CONSOLIDADO'
                    ? 'bg-neutral-200 text-neutral-950 font-black shadow'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                }`}
              >
                Consolidado Total
              </button>
              {tiendasDisponibles.map(t => {
                const sucInfo = getSucursalByTag(t);
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => handleCambiarTienda(t)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg font-bold shrink-0 transition-all font-mono ${
                      tiendaSeleccionada === t
                        ? (t.startsWith('FC') ? 'bg-amber-600 text-white shadow' : 'bg-red-600 text-white shadow')
                        : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                    }`}
                    title={sucInfo ? `${sucInfo.codigo} - ${sucInfo.nombre}` : t}
                  >
                    {sucInfo ? `${sucInfo.codigo} (${t})` : t}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FILA 3: BOTÓN DE TRANSMISIÓN DIRECTA A SALA DE ESPERA DE PEDIDOS MANUALES */}
        <div className="w-full pt-1">
          <button
            type="button"
            onClick={handleTransmitirAOtroPrograma}
            disabled={transmitiendo}
            className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] disabled:opacity-50 text-white py-3.5 px-6 rounded-xl text-sm font-black transition-all shadow-lg shadow-emerald-950/60 uppercase tracking-wide cursor-pointer"
            title="Envía el pedido directamente a la Sala de Espera de Pedidos Manuales sin dejarlo en espera en tu app"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>{transmitiendo ? 'Transmitiendo a Pedidos Manuales...' : '🚀 Transmitir Directo a Sala de Espera (Pedidos Manuales)'}</span>
          </button>
        </div>
      </div>

      {mensajeExito && (
        <div className="print:hidden bg-emerald-950 border border-emerald-800 text-emerald-300 p-3 rounded-xl flex items-center gap-2 text-xs font-bold">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{mensajeExito}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* HOJA DEL FORMATO CODIZULCA (RÉPLICA EXACTA DE LA IMAGEN 2) */}
      {/* ============================================================== */}
      <div className="w-full overflow-x-auto pb-4">
        <div 
          id="codizulca-printable-order"
          className="min-w-[900px] max-w-[1050px] mx-auto bg-white text-slate-900 border-2 border-slate-900 shadow-2xl print:shadow-none print:border-2 print:m-0 print:w-full print:min-w-0"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* HEADER SUPERIOR: LOGO / CLIENTE / DATOS DE ORDEN */}
          <div className="grid grid-cols-12 border-b-2 border-slate-900">
            
            {/* CAJA 1: LOGO CODIZULCA Y RIF */}
            <div className="col-span-2 p-3 border-r-2 border-slate-900 flex flex-col justify-center bg-slate-50/30">
              <span className="text-2xl font-black tracking-tighter text-[#0b2545] leading-none select-none">
                codizulca
              </span>
              <span className="text-[10px] text-slate-700 font-bold uppercase tracking-wider mt-1.5 font-mono">
                RIF: J40987613-6
              </span>
            </div>

            {/* CAJA 2: NOMBRE DEL CLIENTE */}
            <div className="col-span-7 p-3 border-r-2 border-slate-900 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 uppercase shrink-0">
                CLIENTE:
              </span>
              <input
                type="text"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                className="w-full font-black text-sm text-slate-900 uppercase outline-none focus:bg-amber-50 px-1 py-0.5 rounded transition-colors"
                placeholder="NOMBRE DEL CLIENTE"
              />
            </div>

            {/* CAJA 3: FECHA, ID Y N° PEDIDO */}
            <div className="col-span-3 text-xs divide-y border-slate-900">
              <div className="flex items-center justify-between p-1.5 px-3">
                <span className="text-[11px] font-bold text-slate-600 uppercase">FECHA:</span>
                <div className="flex items-center gap-1 font-bold text-slate-900">
                  <input
                    type="text"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-24 text-right font-mono font-bold outline-none focus:bg-amber-50"
                  />
                  <CalendarIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </div>
              </div>

              <div className="flex items-center justify-between p-1.5 px-3">
                <span className="text-[11px] font-bold text-slate-600 uppercase">ID CLIENTE:</span>
                <input
                  type="text"
                  value={idCliente}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIdCliente(val);
                    const matchSuc = [...SUCURSALES_ALKOSTO, ...SUCURSALES_FAMILIA_CENTER].find(
                      s => s.codigo === val.trim() || (val.trim().length >= 4 && s.codigo.replace(/^0+/, '') === val.trim().replace(/^0+/, ''))
                    );
                    if (matchSuc) {
                      setClienteNombre(matchSuc.nombre);
                    }
                  }}
                  className="w-20 text-right font-mono font-bold text-slate-900 outline-none focus:bg-amber-50 uppercase"
                  placeholder="ID"
                />
              </div>

              <div className="flex items-center justify-between p-1.5 px-3 bg-red-50/70 border-l-2 border-red-500">
                <span className="text-[11px] font-black text-red-900 uppercase">ORDEN DE COMPRA:</span>
                <input
                  type="text"
                  value={ordenCompraRef}
                  onChange={(e) => setOrdenCompraRef(e.target.value)}
                  className="w-24 text-right font-mono font-black text-red-700 outline-none focus:bg-amber-50 uppercase"
                  placeholder="N° OC"
                />
              </div>

              <div className="flex items-center justify-between p-1.5 px-3 bg-amber-50/70 border-l-2 border-amber-500">
                <span className="text-[11px] font-bold text-slate-700 uppercase">N° CORRELATIVO:</span>
                <span className="font-mono font-black text-amber-800 text-xs px-2 py-0.5 bg-amber-100 rounded border border-amber-300">
                  {nroPedido && nroPedido !== 'AUTO' && !nroPedido.startsWith('PENDIENTE') ? `N° ${nroPedido}` : 'AUTO (SALA DE ESPERA)'}
                </span>
              </div>
            </div>
          </div>

          {/* SUBHEADER: RUTA DEL VENDEDOR */}
          <div className="p-2 px-3 border-b-2 border-slate-900 flex items-center gap-2 bg-slate-50/40">
            <span className="text-xs font-bold text-slate-600 uppercase shrink-0">
              RUTA:
            </span>
            <input
              type="text"
              value={ruta}
              onChange={(e) => setRuta(e.target.value)}
              className="w-full font-bold text-xs text-slate-900 uppercase outline-none focus:bg-amber-50 px-1 py-0.5 rounded"
              placeholder="VENDEDOR / RUTA"
            />
          </div>

          {/* TABLA PRINCIPAL DE RENGLONES */}
          <div className="w-full">
            <table className="w-full border-collapse text-left text-xs">
              {/* ENCABEZADOS DE COLUMNAS */}
              <thead>
                <tr className="border-b-2 border-slate-900 bg-slate-100/90 text-slate-800 text-[10px] sm:text-[11px] font-black uppercase tracking-wider divide-x-2 divide-slate-900">
                  <th className="p-1 text-center w-8 shrink-0">N°</th>
                  <th colSpan={2} className="p-1 text-center w-36">
                    CANT. SOLICITADA
                  </th>
                  <th className="p-1 text-center w-28">CANTIDAD DESPACHADA</th>
                  <th className="p-1 text-center w-24">SKU</th>
                  <th className="p-1 text-center">DESCRIPCION DEL PRODUCTO</th>
                  <th className="p-1 text-center w-24">PRECIO</th>
                  <th className="p-1 text-center w-28">SUB TOTAL</th>
                </tr>
                {/* SUB-ENCABEZADO PARA UNID Y CANT */}
                <tr className="border-b-2 border-slate-900 bg-slate-50 text-[10px] font-bold uppercase divide-x-2 divide-slate-900 text-slate-700">
                  <th className="p-0.5 text-center"></th>
                  <th className="p-0.5 text-center w-14">UNID</th>
                  <th className="p-0.5 text-center w-22">CANT</th>
                  <th className="p-0.5 text-center"></th>
                  <th className="p-0.5 text-center"></th>
                  <th className="p-0.5 text-center"></th>
                  <th className="p-0.5 text-center"></th>
                  <th className="p-0.5 text-center"></th>
                </tr>
              </thead>

              {/* CUERPO DE LA TABLA (FILAS 1 A 15) */}
              <tbody className="divide-y divide-slate-900">
                {filas.map((f, idx) => (
                  <tr 
                    key={f.renglon} 
                    className="divide-x-2 divide-slate-900 hover:bg-amber-50/30 transition-colors h-7 leading-tight"
                  >
                    {/* NÚMERO DE RENGLÓN */}
                    <td className="p-1 text-center font-bold text-slate-600 font-mono text-[11px] bg-slate-50/20 select-none">
                      {f.renglon}
                    </td>

                    {/* UNIDAD */}
                    <td className="p-1 text-center">
                      <input
                        type="text"
                        value={f.unid}
                        onChange={(e) => handleActualizarCelda(idx, 'unid', e.target.value.toUpperCase())}
                        className="w-full text-center font-bold text-[11px] text-slate-800 outline-none uppercase focus:bg-amber-100"
                        placeholder=""
                      />
                    </td>

                    {/* CANTIDAD SOLICITADA */}
                    <td className="p-1 text-center">
                      <input
                        type="number"
                        step="any"
                        value={f.cantSolicitada === 0 ? '' : f.cantSolicitada}
                        onChange={(e) => handleActualizarCelda(idx, 'cantSolicitada', parseFloat(e.target.value) || 0)}
                        className="w-full text-center font-mono font-bold text-xs text-slate-900 outline-none focus:bg-amber-100"
                        placeholder=""
                      />
                    </td>

                    {/* CANTIDAD DESPACHADA (COLUMNA EN BLANCO SEGÚN REQUERIMIENTO) */}
                    <td className="p-1 text-center bg-slate-50/10">
                      <input
                        type="text"
                        value={f.cantDespachada || ''}
                        onChange={(e) => handleActualizarCelda(idx, 'cantDespachada', e.target.value)}
                        className="w-full text-center font-mono font-bold text-xs text-slate-900 outline-none focus:bg-amber-100"
                        placeholder=""
                      />
                    </td>

                    {/* SKU (DEJAR SOLO LOS SKU) */}
                    <td className="p-1 text-center">
                      <input
                        type="text"
                        list="codigos-codizulca-list"
                        value={f.codigo}
                        onChange={(e) => handleActualizarCelda(idx, 'codigo', e.target.value)}
                        className="w-full text-center font-mono text-xs font-bold text-slate-900 outline-none focus:bg-amber-100 uppercase"
                        placeholder="SKU"
                      />
                    </td>

                    {/* DESCRIPCIÓN DEL PRODUCTO */}
                    <td className="p-1 px-2">
                      <input
                        type="text"
                        list="productos-codizulca-list"
                        value={f.descripcion}
                        onChange={(e) => handleActualizarCelda(idx, 'descripcion', e.target.value.toUpperCase())}
                        className="w-full font-bold text-xs text-slate-900 outline-none focus:bg-amber-100 uppercase truncate"
                        placeholder=""
                      />
                    </td>

                    {/* PRECIO UNITARIO */}
                    <td className="p-1 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={f.precio === 0 ? '' : f.precio}
                        onChange={(e) => handleActualizarCelda(idx, 'precio', parseFloat(e.target.value) || 0)}
                        className="w-full text-right font-mono font-bold text-xs text-slate-900 outline-none focus:bg-amber-100 pr-1"
                        placeholder=""
                      />
                    </td>

                    {/* SUB TOTAL */}
                    <td className="p-1 text-right font-mono font-bold text-xs text-slate-900 pr-2">
                      {f.subtotal > 0 ? f.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* BARRA INFERIOR DE TABLA (+ AGREGAR RENGLÓN Y NOTA DE EDICIÓN) */}
          <div className="border-t-2 border-slate-900 p-2 flex items-center justify-between bg-slate-50/50">
            <button
              type="button"
              onClick={handleAgregarRenglon}
              className="print:hidden border border-slate-400 hover:border-slate-800 hover:bg-slate-100 text-slate-700 px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-red-600" />
              <span>Agregar Renglón</span>
            </button>

            <span className="text-[10px] text-slate-500 italic select-none">
              Módulo de Ventas: Edición manual habilitada en todas las casillas del formato
            </span>
          </div>

          {/* FOOTER DEL FORMATO: SUPERVISOR / TOTAL / CHOFER / OBSERVACIONES / CXC / CESTAS */}
          <div className="border-t-2 border-slate-900 divide-y-2 divide-slate-900 text-xs">
            
            {/* FILA 1 FOOTER: SUPERVISOR & TOTAL */}
            <div className="grid grid-cols-12 divide-x-2 divide-slate-900">
              <div className="col-span-9 p-2 px-3 flex items-center gap-2">
                <span className="font-bold text-slate-600 uppercase text-xs shrink-0">
                  SUPERVISOR:
                </span>
                <input
                  type="text"
                  value={supervisor}
                  onChange={(e) => setSupervisor(e.target.value)}
                  className="w-full font-black text-xs text-slate-900 uppercase outline-none focus:bg-amber-50"
                  placeholder="PEDRO PEREZ"
                />
              </div>

              {/* TOTAL EN CASILLA AMARILLA */}
              <div className="col-span-3 p-1.5 px-3 flex items-center justify-between bg-white">
                <span className="font-black text-slate-900 uppercase text-xs">
                  TOTAL:
                </span>
                <span className="bg-[#fef08a] px-3 py-1 font-black text-slate-950 text-sm border border-amber-400 rounded-sm font-mono shadow-sm">
                  ${totalGeneral.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* FILA 2 FOOTER: CHOFER / OBSERVACIONES / APROBACIÓN CXC */}
            <div className="grid grid-cols-12 divide-x-2 divide-slate-900">
              {/* CHOFER */}
              <div className="col-span-4 p-2 px-3 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-600 uppercase text-[11px] shrink-0">
                    CHOFER:
                  </span>
                  <input
                    type="text"
                    value={chofer}
                    onChange={(e) => setChofer(e.target.value)}
                    className="w-full font-bold text-xs text-slate-900 uppercase outline-none focus:bg-amber-50"
                    placeholder="NOMBRE CHOFER"
                  />
                </div>
              </div>

              {/* OBSERVACIONES */}
              <div className="col-span-6 p-2 px-3 flex items-center gap-2">
                <span className="font-bold text-slate-600 uppercase text-[11px] shrink-0">
                  OBSERVACIONES:
                </span>
                <input
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="w-full font-bold text-xs text-slate-900 uppercase outline-none focus:bg-amber-50"
                  placeholder="En blanco (a completar por la analista de ventas en sala de espera)"
                />
              </div>

              {/* APROBACIÓN CXC */}
              <div className="col-span-2 p-2 text-center flex flex-col justify-between h-14 bg-slate-50/20">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  APROBACIÓN CXC
                </span>
                <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto mb-1"></div>
              </div>
            </div>

            {/* FILA 3 FOOTER: CANTIDAD DE CESTAS */}
            <div className="p-2 px-3 flex items-center gap-2 bg-slate-50/40">
              <span className="font-bold text-slate-600 uppercase text-[11px] shrink-0">
                CANTIDAD DE CESTAS:
              </span>
              <input
                type="text"
                value={cantidadCestas}
                onChange={(e) => setCantidadCestas(e.target.value)}
                className="w-20 font-mono font-bold text-xs text-slate-900 outline-none focus:bg-amber-50"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* DATALISTS PARA AUTOCOMPLETADO INTELIGENTE DE SKU Y PRODUCTOS */}
      <datalist id="codigos-codizulca-list">
        {CATALOGO_ALKOSTO.map(p => (
          <option key={p.sku} value={p.sku}>{`SKU ${p.sku} • ${p.producto} (${p.presentacion})`}</option>
        ))}
      </datalist>

      <datalist id="productos-codizulca-list">
        {CATALOGO_ALKOSTO.map(p => (
          <option key={p.sku} value={p.producto}>
            {`SKU: ${p.sku} | ${p.categoria} | ${p.presentacion}`}
          </option>
        ))}
      </datalist>

      {/* MODAL / DRAWER DEL CATÁLOGO OFICIAL DE PRODUCTOS Y CÓDIGOS CODIZULCA */}
      {modalCatalogo && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-neutral-100">
            {/* Header del Modal */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                  <Barcode className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Catálogo Maestro de Productos y Códigos Codizulca</h3>
                  <p className="text-xs text-neutral-400">
                    Búsqueda instantánea por SKU interno, código de barra EAN-13, código de cadena o descripción
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalCatalogo(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Barra de búsqueda */}
            <div className="p-3 border-b border-neutral-800 bg-neutral-900 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={busquedaCatalogo}
                  onChange={(e) => setBusquedaCatalogo(e.target.value)}
                  placeholder="Buscar por código (ej: 1496, 7590377000077, 1446, 171) o nombre del producto..."
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              {busquedaCatalogo && (
                <button
                  type="button"
                  onClick={() => setBusquedaCatalogo('')}
                  className="text-xs text-neutral-400 hover:text-white px-2 py-1"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Tabla de Productos del Catálogo */}
            <div className="flex-1 overflow-y-auto p-3">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 text-[11px] font-bold uppercase">
                    <th className="p-2">SKU</th>
                    <th className="p-2">Cód. Barra / Cadena</th>
                    <th className="p-2">Producto y Presentación</th>
                    <th className="p-2">Categoría</th>
                    <th className="p-2 text-center">Unidad</th>
                    <th className="p-2 text-right">Kilos/Caja</th>
                    <th className="p-2 text-right">Precio Sug.</th>
                    <th className="p-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-sans">
                  {CATALOGO_ALKOSTO.filter(p => {
                    if (!busquedaCatalogo) return true;
                    const q = busquedaCatalogo.trim().toUpperCase();
                    return (
                      p.sku.toUpperCase().includes(q) ||
                      p.producto.toUpperCase().includes(q) ||
                      (p.codigoBarra && p.codigoBarra.includes(q)) ||
                      (p.categoria && p.categoria.toUpperCase().includes(q)) ||
                      (p.codigosCadena && p.codigosCadena.some(c => c.toUpperCase().includes(q)))
                    );
                  }).map(item => (
                    <tr key={item.sku} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="p-2 font-mono font-black text-amber-400">{item.sku}</td>
                      <td className="p-2 font-mono text-[11px] text-neutral-300">
                        {item.codigoBarra ? (
                          <span className="text-emerald-400 font-bold">{item.codigoBarra}</span>
                        ) : (
                          item.codigosCadena?.join(', ') || '-'
                        )}
                      </td>
                      <td className="p-2 font-bold text-white">
                        <div>{item.producto}</div>
                        <div className="text-[10px] text-neutral-400 font-normal">{item.presentacion}</div>
                      </td>
                      <td className="p-2 text-neutral-400">{item.categoria}</td>
                      <td className="p-2 text-center font-bold text-neutral-300">
                        <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 font-mono text-[10px]">
                          {item.unidadSugerida || 'CJ'}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono text-neutral-300">{item.kilosPorCaja} kg</td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-400">
                        ${item.precioSugeridoUSD.toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleInsertarProductoDesdeCatalogo(item)}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[11px] font-bold transition-all shadow"
                        >
                          + Insertar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Modal */}
            <div className="p-3 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between text-xs text-neutral-400">
              <span>{CATALOGO_ALKOSTO.length} productos registrados en el maestro Codizulca</span>
              <button
                type="button"
                onClick={() => setModalCatalogo(false)}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-bold transition-colors"
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
