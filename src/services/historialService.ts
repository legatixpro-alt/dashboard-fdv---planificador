import { getAuthHeaders } from './googleSheetsService';

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
