import { getAuthHeaders } from './googleSheetsService';
import { RubroCodigo } from '../lib/rubros';

export interface HistPeriodo { ano: number; mes: number }

export interface HistVolumenRow {
  ano: number; mes: number; sku: string; articulo: string; rubro: string;
  cajas: number; unidades: number; kgs: number; monto: number; clientes: number;
}

export interface HistRubroMes {
  ano: number; mes: number;
  kgs: Record<string, number>; cajas: Record<string, number>; monto: Record<string, number>;
  activos: Record<string, number>;
  clientesConMovimiento: number; fueraCartera: number;
}

export interface HistClienteRow {
  id: string; cliente: string; vendedor: string; enCartera: boolean;
  cajas: Record<string, number>; kgs: number; monto: number;
}

export interface HistClienteDetalle {
  meses: { ano: number; mes: number; cliente: string; vendedor: string; cajas: Record<string, number>; kgs: number; monto: number }[];
  productos: { ano: number; mes: number; sku: string; articulo: string; rubro: string; cajas: number; kgs: number; monto: number }[];
}

export interface Rubro360Mes {
  ano: number;
  mes: number;
  clientesActivados: number;
  clientesEnCartera: number;
  clientesFueraCartera: number;
  porcentajeCartera: number;
  variacionClientes: number | null;
  variacionPct: number | null;
  cajas: number;
  unidades: number;
  kgs: number;
  skusActivos: number;
  kgsPorCliente: number;
  /** Meta solicitada para ese mes si fue registrada; null = no hay meta guardada de ese mes. */
  meta: number | null;
}

export interface Rubro360MetaMes {
  periodo: string;
  ano: number;
  mes: number;
  meta: number;
  activados: number;
}

export interface Rubro360Sku {
  sku: string;
  articulo: string;
  totalCajas: number;
  totalUnidades: number;
  totalKgs: number;
  clientesUnicos: number;
  mesesActivos: number;
  porMes: Record<string, { cajas: number; kgs: number; clientes: number }>;
}

export type EstadoClienteRubro360 =
  | 'REACTIVADO_ESTE_MES'
  | 'NUEVO_ESTE_MES'
  | 'OPORTUNIDAD_RECUPERACION'
  | 'SIN_HISTORIAL'
  | 'FUERA_CARTERA';

export interface Rubro360Cliente {
  id: string;
  cliente: string;
  vendedor: string;
  enCartera: boolean;
  activoMesActual: boolean;
  mesesActivados: number;
  totalMesesDisponibles: number;
  frecuenciaPct: number;
  ultimoMesCompra: { ano: number; mes: number } | null;
  totalCajas: number;
  totalKgs: number;
  estado360: EstadoClienteRubro360;
  porMes: Record<string, { cajas: number; kgs: number; activo: boolean }>;
}

export interface Rubro360Data {
  rubro: RubroCodigo;
  /** Meses visibles según el filtro aplicado. */
  periodos: HistPeriodo[];
  /** Todos los meses con historial (para armar el filtro de fechas). */
  periodosDisponibles: HistPeriodo[];
  carteraTotal: number;
  activadosMesActual: number;
  metaMesActual: number;
  periodoMetaActual: string | null;
  metasPorMes: Rubro360MetaMes[];
  meses: Rubro360Mes[];
  skus: Rubro360Sku[];
  clientes: Rubro360Cliente[];
  resumen: {
    totalMeses: number;
    promedioClientesMes: number;
    promedioCajasMes: number;
    promedioKgsMes: number;
    mejorMes: { ano: number; mes: number; clientesActivados: number; kgs: number; cajas: number } | null;
    peorMes: { ano: number; mes: number; clientesActivados: number; kgs: number; cajas: number } | null;
    totalCajasHistorico: number;
    totalKgsHistorico: number;
    clientesUnicosHistorico: number;
    clientesHabituales: number;
    oportunidadRecuperacion: number;
    reactivadosEsteMes: number;
    nuevosEsteMes: number;
  };
}

export function categoryToRubroCode(cat: string): RubroCodigo {
  const c = (cat || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (c.includes('ACEITE')) return 'ACEITE';
  if (c.includes('AZUCAR')) return 'AZUCAR';
  if (c.includes('POLLO') || c.includes('ARROZ')) return 'POLLO';
  if (c.includes('ESTANDAR') || c.includes('SUPERIOR') || c.includes('ENTERO')) return 'ESTANDAR_ASTURIAS';
  if (c.includes('MORTADELA') || c.includes('SALPICAO') || c.includes('LIGEROS')) return 'MORTADELA_SALPICAO';
  return 'ACEITE';
}

export class HistorialError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.code = code; }
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: getAuthHeaders() });
  let body: any = null;
  try { body = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) throw new HistorialError(body?.error || `Error ${res.status} consultando el historial`, body?.code);
  return body as T;
}

const v = (vendedor?: string) => (vendedor ? `vendedor=${encodeURIComponent(vendedor)}` : '');

export const fetchHistMeta = () => getJSON<{ periodos: HistPeriodo[] }>('/api/historial/meta');
export const fetchHistVolumen = (vendedor?: string) =>
  getJSON<{ rows: HistVolumenRow[] }>(`/api/historial/volumen?${v(vendedor)}`);
export const fetchHistRubros = (vendedor?: string) =>
  getJSON<{ meses: HistRubroMes[]; cartera: number }>(`/api/historial/rubros?${v(vendedor)}`);
export const fetchHistClientes = (ano: number, mes: number, vendedor?: string) =>
  getJSON<{ rows: HistClienteRow[] }>(`/api/historial/clientes?ano=${ano}&mes=${mes}&${v(vendedor)}`);
export const fetchHistCliente = (id: string, vendedor?: string) =>
  getJSON<HistClienteDetalle>(`/api/historial/cliente/${encodeURIComponent(id)}?${v(vendedor)}`);
export const fetchHistRubro360 = (rubro: RubroCodigo, vendedor?: string, meses: string[] = []) =>
  getJSON<Rubro360Data>(
    `/api/historial/rubro-360?rubro=${encodeURIComponent(rubro)}&${v(vendedor)}${meses.length ? `&meses=${encodeURIComponent(meses.join(','))}` : ''}`
  );
