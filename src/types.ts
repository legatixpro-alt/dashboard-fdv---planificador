export type Role = 'ADMIN' | 'SUPERVISOR' | 'VENDEDOR';

export interface VolumenData {
  id: string;
  vendedorId: string;
  vendedorNombre?: string;
  vendedorEmail?: string;
  skuId: string;
  articulo?: string;
  cliente: string;
  categoria: string; // Rubro / Categoría
  meta: number;
  ejecutado: number;
  zona: string;
  lat?: number;
  lng?: number;
}

export interface ActivacionData {
  id: string;
  vendedorId: string;
  cliente: string;
  status: 'ACTIVO' | 'INACTIVO';
  cats?: {
    ACEITE?: number;
    AZUCAR?: number;
    POLLO?: number;
    ESTANDAR_ASTURIAS?: number;
    MORTADELA_SALPICAO?: number;
    ARROZ?: number;
    ENTERO?: number;
    LIGEROS?: number;
    [key: string]: number | undefined;
  };
  cajas?: {
    ACEITE?: number;
    AZUCAR?: number;
    POLLO?: number;
    ESTANDAR_ASTURIAS?: number;
    MORTADELA_SALPICAO?: number;
    [key: string]: number | undefined;
  };
}

export interface ClientStats {
  cliente: string;
  zona: string;
  metaTotal: number;
  ejecutadoTotal: number;
  brecha: number;
  cumplimiento: number;
  statusActivacion: 'ACTIVO' | 'INACTIVO' | 'DESCONOCIDO';
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA' | 'CUMPLIDO';
}

export type EstadoDegustacion = 'SOLICITADA' | 'APROBADA' | 'RECHAZADA' | 'REALIZADA' | 'CANCELADA';
export type TurnoDegustacion = 'MAÑANA' | 'TARDE' | 'COMPLETO';

export interface Degustacion {
  id: string;
  clienteCodigo: string;
  clienteNombre: string;
  vendedorNombre: string;
  vendedorId: string;
  vendedorEmail?: string;
  ruta: string;
  fecha: string; // YYYY-MM-DD
  turno: TurnoDegustacion;
  hora?: string; // Ej: '09:00 AM', '10:30 AM', '02:00 PM'
  productos: string[];
  kilosEstimados: number;
  personasEstimadas: number;
  requierePromotora: boolean;
  promotoraAsignada?: string;
  materialPop: boolean;
  contactoPunto?: string;
  telefonoContacto?: string;
  observaciones?: string;
  estado: EstadoDegustacion;
  notasTradeMarketing?: string;
  resultado?: {
    kilosDegustados?: number;
    personasAlcanzadas?: number;
    ventasGeneradas?: string;
    comentarios?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface DegustacionConfig {
  maxPorDia: number;
  maxPorTurnoManana: number;
  maxPorTurnoTarde: number;
  diasBloqueados: string[];
  anticipacionMinimaDias: number;
}

export interface HorarioSlot {
  hora: string;
  turno: TurnoDegustacion;
  disponible: boolean;
  degustacion?: Degustacion;
}

export type EstadoPedidoAlkosto = 'BORRADOR' | 'ENVIADO' | 'APROBADO' | 'DESPACHADO' | 'ENTREGADO' | 'CANCELADO';

export interface AlkostoOrderItem {
  id: string;
  sku: string;
  producto: string;
  categoria: string;
  presentacion: string;
  cantidadCajas: number;
  kilosPorCaja: number;
  totalKilos: number;
  precioUnitarioUSD: number;
  subtotalUSD: number;
}

export interface AlkostoOrder {
  id: string;
  numeroPedido: string;
  correlativo?: string;
  ordenCompraAlkosto?: string;
  sucursalCodigo: string;
  sucursalNombre: string;
  direccionEntrega?: string;
  vendedora: string;
  ruta: string;
  fechaPedido: string;
  fechaEntregaEstimada: string;
  items: AlkostoOrderItem[];
  totalBultos: number;
  totalKilos: number;
  totalUSD: number;
  estado: EstadoPedidoAlkosto;
  condicionPago: string;
  contactoRecepcion?: string;
  telefonoRecepcion?: string;
  observaciones?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CodizulcaNotaPedidoItem {
  renglon: number;
  unid: string; // 'CJ' | 'KG' | 'UND' | 'BLT'
  cantSolicitada: number;
  cantDespachada?: number | string;
  codigo: string;
  skuCodizulca?: string;
  codigoBarra?: string;
  descripcion: string;
  precio: number;
  subtotal: number;
  tiendas?: Record<string, number>;
}

export interface ParsedOrdenCompraAlkosto {
  clienteCadena?: 'ALKOSTO' | 'FAMILIA_CENTER' | string;
  ordenNro: string;
  sede: string;
  fechaEmision: string;
  fechaEntrega: string;
  diasCredito: number;
  tasaCambio: number;
  proveedorNombre: string;
  proveedorRif: string;
  observaciones?: string;
  subtotal: number;
  items: Array<{
    renglon: number;
    codigo: string;
    skuCodizulca?: string;
    codigoBarra?: string;
    descripcion: string;
    iva?: number;
    emp?: number;
    unid: string;
    totalCantidad: number;
    costoBruto?: number;
    costoUnitario: number;
    totalRenglon: number;
    tiendas?: Record<string, number>;
  }>;
}
