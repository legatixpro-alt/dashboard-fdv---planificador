import { VolumenData, ActivacionData } from '../types';

let memVolumen: { key: string; data: VolumenData[]; time: number } | null = null;
let memActivacion: { key: string; data: any[]; time: number } | null = null;
let memMetas: { key: string; data: any[]; time: number } | null = null;
const MEM_TTL = 30000; // 30 seconds client-side cache

export const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('dashboard_fdv_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const fetchVolumenData = async (force: boolean = false, vendorId?: string): Promise<VolumenData[]> => {
  const cacheKey = `${vendorId || 'ALL'}`;
  if (!force && memVolumen && memVolumen.key === cacheKey && (Date.now() - memVolumen.time < MEM_TTL)) {
    return memVolumen.data;
  }
  try {
    const vParam = vendorId ? `&vendedor=${encodeURIComponent(vendorId)}` : '';
    const response = await fetchWithTimeout(`/api/data/volumen?force=${force}${vParam}`, {
      headers: getAuthHeaders()
    }, 8000);
    if (!response.ok) return memVolumen?.data || [];
    const text = await response.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn("Respuesta no-JSON recibida en volumen data.");
      return memVolumen?.data || [];
    }
    const parsed = JSON.parse(text);
    memVolumen = { key: cacheKey, data: parsed, time: Date.now() };
    return parsed;
  } catch (error: any) {
    console.warn("Error leyendo volumen data:", error?.message);
    return memVolumen?.data || [];
  }
};

export const fetchActivacionData = async (force: boolean = false, vendorId?: string): Promise<any[]> => {
  const cacheKey = `${vendorId || 'ALL'}`;
  if (!force && memActivacion && memActivacion.key === cacheKey && (Date.now() - memActivacion.time < MEM_TTL)) {
    return memActivacion.data;
  }
  try {
    const vParam = vendorId ? `&vendedor=${encodeURIComponent(vendorId)}` : '';
    const response = await fetchWithTimeout(`/api/data/activacion?force=${force}${vParam}`, {
      headers: getAuthHeaders()
    }, 8000);
    if (!response.ok) return memActivacion?.data || [];
    const text = await response.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn("Respuesta no-JSON recibida en activacion data.");
      return memActivacion?.data || [];
    }
    const parsed = JSON.parse(text);
    memActivacion = { key: cacheKey, data: parsed, time: Date.now() };
    return parsed;
  } catch (error: any) {
    console.warn("Error leyendo activacion data:", error?.message);
    return memActivacion?.data || [];
  }
};

export const fetchMetasActivacion = async (force: boolean = false, vendorId?: string): Promise<any[]> => {
  const cacheKey = `${vendorId || 'ALL'}`;
  if (!force && memMetas && memMetas.key === cacheKey && (Date.now() - memMetas.time < MEM_TTL)) {
    return memMetas.data;
  }
  try {
    const vParam = vendorId ? `&vendedor=${encodeURIComponent(vendorId)}` : '';
    const response = await fetchWithTimeout(`/api/data/metas-activacion?force=${force}${vParam}`, {
      headers: getAuthHeaders()
    }, 8000);
    if (!response.ok) return memMetas?.data || [];
    const text = await response.text();
    if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      console.warn("Respuesta no-JSON recibida en metas data.");
      return memMetas?.data || [];
    }
    const parsed = JSON.parse(text);
    memMetas = { key: cacheKey, data: parsed, time: Date.now() };
    return parsed;
  } catch (error: any) {
    console.warn("Error leyendo metas data:", error?.message);
    return memMetas?.data || [];
  }
};

export const triggerSheetsSync = async (): Promise<{ success: boolean; message: string; countVolumen?: number; countActivacion?: number }> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders()
  };

  const response = await fetch('/api/sync/sheets', {
    method: 'POST',
    headers
  });
  return response.json();
};
