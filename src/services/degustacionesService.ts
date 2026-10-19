import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Degustacion, DegustacionConfig, EstadoDegustacion, TurnoDegustacion, HorarioSlot } from '../types';

const DEGUSTACIONES_COLLECTION = 'degustaciones';
const CONFIG_COLLECTION = 'degustaciones_config';
const CONFIG_DOC_ID = 'general_settings';
const STORAGE_KEY = 'dashboard_fdv_degustaciones_cache';
const CONFIG_STORAGE_KEY = 'dashboard_fdv_degustaciones_config';

export const DEFAULT_HORARIO_MANANA = '09:00 AM - 01:00 PM';
export const DEFAULT_HORARIO_TARDE = '02:00 PM - 07:00 PM';

export const SUGGESTED_HORARIOS_MANANA = ['09:00 AM - 01:00 PM'];
export const SUGGESTED_HORARIOS_TARDE = ['02:00 PM - 07:00 PM'];

export const HORARIOS_MANANA = ['09:00 AM - 01:00 PM'];
export const HORARIOS_TARDE = ['02:00 PM - 07:00 PM'];

export const DEFAULT_CONFIG: DegustacionConfig = {
  maxPorDia: 18,
  maxPorTurnoManana: 9,
  maxPorTurnoTarde: 9,
  diasBloqueados: [],
  anticipacionMinimaDias: 2
};

const TEST_IDS_TO_EXCLUDE = ['deg-001', 'deg-002', 'deg-003', 'deg-mupk8tih-e3wf', 'deg-muplzpkm-ncuu', 'test-ping-01'];

function getLocalCache(): Degustacion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(d => d && d.id && !TEST_IDS_TO_EXCLUDE.includes(d.id) && !d.id.startsWith('test-'));
      }
    }
  } catch (e) {
    console.warn("Error parsing degustaciones local cache", e);
  }
  return [];
}

function setLocalCache(data: Degustacion[]) {
  try {
    const cleanData = data.filter(d => d && d.id && !TEST_IDS_TO_EXCLUDE.includes(d.id) && !d.id.startsWith('test-'));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));
  } catch (e) {
    console.warn("Error setting degustaciones local cache", e);
  }
}

export function getLocalConfig(): DegustacionConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const manana = parsed.maxPorTurnoManana !== undefined ? parsed.maxPorTurnoManana : 9;
      const tarde = parsed.maxPorTurnoTarde !== undefined ? parsed.maxPorTurnoTarde : 9;
      return { 
        ...DEFAULT_CONFIG, 
        ...parsed,
        maxPorTurnoManana: manana,
        maxPorTurnoTarde: tarde,
        maxPorDia: manana + tarde
      };
    }
  } catch (e) {
    console.warn("Error reading local config", e);
  }
  return DEFAULT_CONFIG;
}

export function setLocalConfig(config: DegustacionConfig) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn("Error writing local config", e);
  }
}

/**
 * Suscribirse a las degustaciones en tiempo real desde Firestore,
 * con fallback instantáneo a cache local si la red está en espera o offline.
 */
export function subscribeDegustaciones(
  callback: (degustaciones: Degustacion[]) => void
): () => void {
  // Emitir primero el caché local limpio para render instantáneo
  const initialData = getLocalCache();
  callback(initialData);

  try {
    const q = query(collection(db, DEGUSTACIONES_COLLECTION));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: Degustacion[] = [];
          snapshot.docs.forEach(d => {
            const rawData = d.data() as Partial<Degustacion>;
            // Eliminar datos de prueba o documentos vacíos corruptos
            if (
              ['deg-001', 'deg-002', 'deg-003'].includes(d.id) ||
              d.id.startsWith('deg-00') ||
              (!rawData.clienteNombre && !rawData.fecha)
            ) {
              deleteDoc(doc(db, DEGUSTACIONES_COLLECTION, d.id)).catch(e => console.warn("Seed/empty cleanup err:", e));
              return;
            }

            list.push({
              id: d.id,
              clienteCodigo: rawData.clienteCodigo || '',
              clienteNombre: rawData.clienteNombre || 'Cliente sin nombre',
              vendedorNombre: rawData.vendedorNombre || '',
              vendedorId: rawData.vendedorId || '',
              ruta: rawData.ruta || '',
              fecha: rawData.fecha || '',
              turno: rawData.turno || 'MAÑANA',
              hora: rawData.hora || '',
              productos: Array.isArray(rawData.productos) ? rawData.productos : [],
              kilosEstimados: Number(rawData.kilosEstimados) || 0,
              personasEstimadas: Number(rawData.personasEstimadas) || 0,
              requierePromotora: Boolean(rawData.requierePromotora),
              promotoraAsignada: rawData.promotoraAsignada || '',
              materialPop: Boolean(rawData.materialPop),
              contactoPunto: rawData.contactoPunto || '',
              telefonoContacto: rawData.telefonoContacto || '',
              observaciones: rawData.observaciones || '',
              estado: rawData.estado || 'SOLICITADA',
              notasTradeMarketing: rawData.notasTradeMarketing || '',
              resultado: rawData.resultado,
              createdAt: rawData.createdAt || new Date().toISOString()
            });
          });

          // Ordenar por fecha descendente
          list.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
          setLocalCache(list);
          callback(list);
        } else {
          setLocalCache([]);
          callback([]);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, DEGUSTACIONES_COLLECTION);
        // Continuar con caché local ante error
        callback(getLocalCache());
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn("Firestore subscription failed, relying on local cache:", err);
    return () => {};
  }
}

export const DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbx6JMUR1IubQuZ97Ics7emw_I0G9UAy-5vig4Vl8zPwW8yMBbZldvQGeGOPNiNbUmVTaQ/exec';
export const GOOGLE_SHEETS_WEBHOOK_STORAGE_KEY = 'codizulca_sheets_webhook_url';

export function getGoogleSheetsWebhookUrl(): string {
  try {
    return localStorage.getItem(GOOGLE_SHEETS_WEBHOOK_STORAGE_KEY) || (import.meta as any).env?.VITE_GOOGLE_SHEETS_WEBHOOK_URL || DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
  } catch {
    return DEFAULT_GOOGLE_SHEETS_WEBHOOK_URL;
  }
}

export function setGoogleSheetsWebhookUrl(url: string): void {
  try {
    localStorage.setItem(GOOGLE_SHEETS_WEBHOOK_STORAGE_KEY, url.trim());
  } catch (e) {
    console.warn("Could not save webhook url to localStorage", e);
  }
}

export async function syncToGoogleSheets(degustacion: Degustacion): Promise<boolean> {
  const webhookUrl = getGoogleSheetsWebhookUrl();
  if (!webhookUrl) return false;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'ADD_DEGUSTACION',
        timestamp: new Date().toISOString(),
        id: degustacion.id,
        fechaRegistro: degustacion.createdAt || new Date().toISOString(),
        vendedor: degustacion.vendedorNombre,
        ruta: degustacion.ruta || degustacion.vendedorId,
        clienteCodigo: degustacion.clienteCodigo,
        clienteNombre: degustacion.clienteNombre,
        fechaDegustacion: degustacion.fecha,
        turno: degustacion.turno,
        hora: degustacion.hora,
        productos: Array.isArray(degustacion.productos) ? degustacion.productos.join(', ') : degustacion.productos,
        kilosEstimados: degustacion.kilosEstimados,
        personasEstimadas: degustacion.personasEstimadas,
        requierePromotora: degustacion.requierePromotora ? 'SI' : 'NO',
        materialPop: degustacion.materialPop ? 'SI' : 'NO',
        contactoPunto: degustacion.contactoPunto || '',
        telefonoContacto: degustacion.telefonoContacto || '',
        estado: degustacion.estado || 'SOLICITADA',
        promotoraAsignada: degustacion.promotoraAsignada || '',
        notasTradeMarketing: degustacion.notasTradeMarketing || '',
        observaciones: degustacion.observaciones || ''
      })
    });
    return true;
  } catch (err) {
    console.warn("Error enviando a Google Sheets Webhook:", err);
    return false;
  }
}

export const GERENCIA_SUPABASE_SURVEYS_URL = (import.meta as any).env?.VITE_GERENCIA_SUPABASE_SURVEYS_URL || 'https://nudltbgyewyiklqdyujk.supabase.co/rest/v1/surveys';
export const GERENCIA_SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_GERENCIA_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51ZGx0Ymd5ZXd5aWtscWR5dWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTgzMDA3OCwiZXhwIjoyMTA3NDA2MDc4fQ.k92vdZiuVkTzAWNK8Fq71m1Xi_MoWtpx_eRQcZTw1cA';

export function buildGerenciaSurveyPayload(degustacion: Degustacion) {
  const normEstado = (degustacion.estado || 'SOLICITADA').toUpperCase();
  let status = 'Solicitada';
  if (normEstado === 'APROBADA') status = 'Aprobada';
  else if (normEstado === 'RECHAZADA') status = 'Rechazada';
  else if (normEstado === 'CANCELADA') status = 'Cancelada';
  else if (normEstado === 'REALIZADA') status = 'Realizada';

  let shift = 'Mañana (9:00 AM - 1:00 PM)';
  if (degustacion.turno === 'TARDE') shift = 'Tarde (2:00 PM - 7:00 PM)';
  else if (degustacion.turno === 'COMPLETO') shift = 'Día Completo';

  const productListStr = Array.isArray(degustacion.productos)
    ? degustacion.productos.join(', ')
    : (degustacion.productos || 'Productos');

  const commentsObj = {
    isTasting: true,
    degustacionId: degustacion.id,
    id: degustacion.id,
    client: degustacion.clienteNombre,
    cliente: degustacion.clienteNombre,
    clienteCodigo: degustacion.clienteCodigo || 'PDV',
    store: degustacion.clienteNombre,
    vendedor: degustacion.vendedorNombre,
    salesRep: degustacion.vendedorNombre,
    promoter: degustacion.promotoraAsignada || degustacion.vendedorNombre || 'Vendedor',
    promotoraAsignada: degustacion.promotoraAsignada || '',
    ruta: degustacion.ruta || degustacion.vendedorId || '',
    date: degustacion.fecha || new Date().toISOString().split('T')[0],
    turno: degustacion.turno || 'MAÑANA',
    shift: shift,
    time: degustacion.hora || (degustacion.turno === 'MAÑANA' ? '09:00 AM - 01:00 PM' : '02:00 PM - 07:00 PM'),
    products: productListStr,
    product: productListStr,
    kilos: Number(degustacion.kilosEstimados) || 0,
    kg: Number(degustacion.kilosEstimados) || 0,
    personas: Number(degustacion.personasEstimadas) || 0,
    personasEstimadas: Number(degustacion.personasEstimadas) || 0,
    estado: normEstado,
    status: status,
    requierePromotora: Boolean(degustacion.requierePromotora),
    promoterType: degustacion.requierePromotora ? 'Fija' : 'Vendedor / Impulso',
    materialPop: degustacion.materialPop ? 'SI' : 'NO',
    contactoPunto: degustacion.contactoPunto || '',
    telefonoContacto: degustacion.telefonoContacto || '',
    address: `Ruta: ${degustacion.ruta || degustacion.vendedorNombre || ''} | Contacto: ${degustacion.contactoPunto || ''} (${degustacion.telefonoContacto || ''})`,
    notes: degustacion.observaciones || `Agendada por ${degustacion.vendedorNombre}. Kilos: ${degustacion.kilosEstimados}. Personas: ${degustacion.personasEstimadas}.`,
    originalComments: degustacion.observaciones || `Agendada por ${degustacion.vendedorNombre}. Kilos: ${degustacion.kilosEstimados}. Personas: ${degustacion.personasEstimadas}.`,
    notasTradeMarketing: degustacion.notasTradeMarketing || '',
    resultado: degustacion.resultado || null
  };

  return {
    type: 'Degustacion',
    date: degustacion.fecha || new Date().toISOString().split('T')[0],
    store: degustacion.clienteNombre,
    promoter: degustacion.promotoraAsignada || degustacion.vendedorNombre || 'Vendedor',
    product: productListStr,
    comments: JSON.stringify(commentsObj)
  };
}

export async function syncToGerenciaDashboard(degustacion: Degustacion): Promise<boolean> {
  try {
    const payload = buildGerenciaSurveyPayload(degustacion);

    // 1. Comprobar si ya existe una encuesta registrada con este degustacionId
    const searchUrl = `${GERENCIA_SUPABASE_SURVEYS_URL}?type=eq.Degustacion&comments=like.*${degustacion.id}*&select=id&limit=1`;
    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'apikey': GERENCIA_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`
      }
    });

    if (searchRes.ok) {
      const records = await searchRes.json();
      if (Array.isArray(records) && records.length > 0 && records[0].id) {
        // Actualizar registro existente mediante PATCH para no duplicar datos
        const updateUrl = `${GERENCIA_SUPABASE_SURVEYS_URL}?id=eq.${records[0].id}`;
        const patchRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'apikey': GERENCIA_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(payload)
        });
        return patchRes.ok;
      }
    }

    // 2. Si no existe, insertar un nuevo registro con POST
    const res = await fetch(GERENCIA_SUPABASE_SURVEYS_URL, {
      method: 'POST',
      headers: {
        'apikey': GERENCIA_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    return res.ok;
  } catch (err) {
    console.warn("Error sincronizando con el Dashboard de Gerencia:", err);
    return false;
  }
}

export async function deleteFromGerenciaDashboard(id: string): Promise<boolean> {
  try {
    const deleteUrl = `${GERENCIA_SUPABASE_SURVEYS_URL}?type=eq.Degustacion&comments=like.*${id}*`;
    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': GERENCIA_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${GERENCIA_SUPABASE_ANON_KEY}`
      }
    });
    return res.ok;
  } catch (err) {
    console.warn("Error eliminando del Dashboard de Gerencia:", err);
    return false;
  }
}

/**
 * Sincroniza en lote todas las degustaciones con el Dashboard de Gerencia y Módulo de Trade Marketing
 */
export async function syncAllDegustacionesToGerencia(degustaciones: Degustacion[]): Promise<{ success: number; failed: number }> {
  try {
    const res = await fetch('/api/degustaciones/sync-gerencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      return { success: data.total || data.synced || degustaciones.length, failed: 0 };
    }
  } catch (err) {
    console.warn("[TRADE SYNC] Fallback a sincronización cliente directa:", err);
  }

  let success = 0;
  let failed = 0;
  const validDegs = degustaciones.filter(d => d && d.id && !TEST_IDS_TO_EXCLUDE.includes(d.id));
  for (const d of validDegs) {
    const ok = await syncToGerenciaDashboard(d);
    if (ok) success++;
    else failed++;
  }
  return { success, failed };
}

/**
 * Guarda o crea una degustación en Firestore y en caché local
 */
export async function saveDegustacion(degustacion: Degustacion): Promise<void> {
  // Actualizar inmediatamente en cache local
  const current = getLocalCache();
  const index = current.findIndex(d => d.id === degustacion.id);
  let updatedList: Degustacion[];
  if (index >= 0) {
    updatedList = [...current];
    updatedList[index] = degustacion;
  } else {
    updatedList = [degustacion, ...current];
  }
  setLocalCache(updatedList);

  // Guardar en Firestore
  try {
    const docRef = doc(db, DEGUSTACIONES_COLLECTION, degustacion.id);
    await setDoc(docRef, degustacion, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${DEGUSTACIONES_COLLECTION}/${degustacion.id}`);
  }

  // Sincronizar automáticamente con Google Sheets
  syncToGoogleSheets(degustacion).catch(() => {});

  // Sincronizar directamente con el Dashboard de Gerencia (https://dashboardgerencia01.ai.studio)
  syncToGerenciaDashboard(degustacion).catch(() => {});
}

/**
 * Actualiza el estado o notas de una degustación
 */
export async function updateDegustacion(
  id: string, 
  updates: Partial<Degustacion>
): Promise<void> {
  const current = getLocalCache();
  const index = current.findIndex(d => d.id === id);
  let updatedItem: Degustacion | null = null;
  if (index >= 0) {
    updatedItem = { ...current[index], ...updates, updatedAt: new Date().toISOString() };
    current[index] = updatedItem;
    setLocalCache([...current]);
  }

  try {
    const docRef = doc(db, DEGUSTACIONES_COLLECTION, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${DEGUSTACIONES_COLLECTION}/${id}`);
  }

  if (updatedItem) {
    syncToGoogleSheets(updatedItem).catch(() => {});
    syncToGerenciaDashboard(updatedItem).catch(() => {});
  }
}

/**
 * Elimina una degustación
 */
export async function deleteDegustacion(id: string): Promise<void> {
  const current = getLocalCache().filter(d => d.id !== id);
  setLocalCache(current);

  try {
    await deleteDoc(doc(db, DEGUSTACIONES_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${DEGUSTACIONES_COLLECTION}/${id}`);
  }

  deleteFromGerenciaDashboard(id).catch(() => {});
}

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Obtiene el rango de la semana (Lunes a Domingo) para una fecha dada
 */
export function getWeekRange(dateStr: string): { startStr: string; endStr: string; label: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startStr = formatYMD(monday);
  const endStr = formatYMD(sunday);
  const label = `${monday.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })} al ${sunday.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`;

  return { startStr, endStr, label };
}

/**
 * Obtiene la fecha y hora límite de agendamiento para una semana (Lunes de esa semana a las 12:00 PM del mediodía)
 * Por ejemplo: Para los eventos de Jueves 08-10, Viernes 09-10 y Sábado 10-10,
 * el límite de agendamiento es hoy Lunes 05-10 a las 12:00 PM (mediodía).
 * Pasadas las 12:00 PM del Lunes, la semana en curso se bloquea y solo permite la siguiente semana.
 */
export function getMondayDeadlineForWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, ..., 4 is Thursday, 5 is Friday, 6 is Saturday
  
  // Calcular el Lunes de esa misma semana
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const closingMonday = new Date(d);
  closingMonday.setDate(d.getDate() + diffToMonday);
  closingMonday.setHours(12, 0, 0, 0); // 12:00 PM (mediodía)
  return closingMonday;
}

/**
 * Cuenta cuántas degustaciones activas tiene un vendedor en la semana de una fecha
 */
export function countVendorDegustacionesInWeek(
  vendedorIdOrName: string,
  targetDateStr: string,
  degustaciones: Degustacion[]
): number {
  if (!vendedorIdOrName || !targetDateStr) return 0;
  const { startStr, endStr } = getWeekRange(targetDateStr);
  const normTarget = String(vendedorIdOrName).trim().toUpperCase();
  
  return degustaciones.filter(d => {
    // Excluir rechazadas o canceladas
    if (d.estado === 'RECHAZADA' || d.estado === 'CANCELADA') return false;
    
    // Verificar que esté en el rango de la semana
    if (d.fecha < startStr || d.fecha > endStr) return false;

    // Verificar correspondencia con el vendedor
    const normV = (d.vendedorNombre || d.vendedorId || '').trim().toUpperCase();
    return normV.includes(normTarget) || normTarget.includes(normV);
  }).length;
}

/**
 * Obtiene la próxima fecha válida (Jueves, Viernes o Sábado) cuyo cierre (Lunes 12:00 PM) no haya vencido
 */
export function getNextAvailableBookingDate(): string {
  const now = new Date();
  for (let i = 0; i < 45; i++) {
    const testDate = new Date();
    testDate.setDate(now.getDate() + i);
    const day = testDate.getDay();
    if (day === 4 || day === 5 || day === 6) {
      const dateStr = formatYMD(testDate);
      const mondayDeadline = getMondayDeadlineForWeek(dateStr);
      if (now.getTime() <= mondayDeadline.getTime()) {
        return dateStr;
      }
    }
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7);
  while (fallback.getDay() !== 4) {
    fallback.setDate(fallback.getDate() + 1);
  }
  return formatYMD(fallback);
}

/**
 * Verifica la disponibilidad de una fecha específica
 */
export function checkDateAvailability(
  dateStr: string,
  degustaciones: Degustacion[],
  config: DegustacionConfig = DEFAULT_CONFIG
): {
  disponible: boolean;
  cuposTotales: number;
  cuposOcupados: number;
  cuposDisponibles: number;
  cuposMananaOcupados: number;
  cuposMananaDisponibles: number;
  cuposTardeOcupados: number;
  cuposTardeDisponibles: number;
  motivo?: string;
  turnosOcupados: TurnoDegustacion[];
  horariosManana: HorarioSlot[];
  horariosTarde: HorarioSlot[];
  degustacionesManana: Degustacion[];
  degustacionesTarde: Degustacion[];
  degustacionesEnFecha: Degustacion[];
} {
  const targetDate = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxManana = config.maxPorTurnoManana ?? 9;
  const maxTarde = config.maxPorTurnoTarde ?? 9;
  const totalMax = maxManana + maxTarde;

  const buildHorarios = (
    horasBase: string[],
    turno: TurnoDegustacion,
    degustacionesTurno: Degustacion[],
    bloqueado: boolean
  ): HorarioSlot[] => {
    const maxTurno = turno === 'MAÑANA' ? maxManana : maxTarde;
    const ocupados = degustacionesTurno.length;
    const isShiftAvailable = !bloqueado && ocupados < maxTurno;

    return horasBase.map(h => ({
      hora: h,
      turno,
      disponible: isShiftAvailable,
      degustacion: degustacionesTurno[0]
    }));
  };

  // 1. Comprobar días pasados
  if (targetDate.getTime() < today.getTime()) {
    return {
      disponible: false,
      cuposTotales: totalMax,
      cuposOcupados: 0,
      cuposDisponibles: 0,
      cuposMananaOcupados: 0,
      cuposMananaDisponibles: 0,
      cuposTardeOcupados: 0,
      cuposTardeDisponibles: 0,
      motivo: 'La fecha ya ha pasado.',
      turnosOcupados: [],
      horariosManana: buildHorarios(HORARIOS_MANANA, 'MAÑANA', [], true),
      horariosTarde: buildHorarios(HORARIOS_TARDE, 'TARDE', [], true),
      degustacionesManana: [],
      degustacionesTarde: [],
      degustacionesEnFecha: []
    };
  }

  // 2. Comprobar días permitidos en calendario: SOLO JUEVES (4), VIERNES (5) Y SÁBADOS (6)
  const dayOfWeek = targetDate.getDay();
  if (dayOfWeek !== 4 && dayOfWeek !== 5 && dayOfWeek !== 6) {
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return {
      disponible: false,
      cuposTotales: 0,
      cuposOcupados: 0,
      cuposDisponibles: 0,
      cuposMananaOcupados: 0,
      cuposMananaDisponibles: 0,
      cuposTardeOcupados: 0,
      cuposTardeDisponibles: 0,
      motivo: `Las degustaciones solo están habilitadas para los días Jueves, Viernes y Sábados (seleccionaste un ${dayNames[dayOfWeek]}).`,
      turnosOcupados: [],
      horariosManana: buildHorarios(HORARIOS_MANANA, 'MAÑANA', [], true),
      horariosTarde: buildHorarios(HORARIOS_TARDE, 'TARDE', [], true),
      degustacionesManana: [],
      degustacionesTarde: [],
      degustacionesEnFecha: []
    };
  }

  // 3. Comprobar límite de agendamiento semanal: Habilitado hasta el lunes a las 12:00 PM del mediodía
  const now = new Date();
  const mondayDeadline = getMondayDeadlineForWeek(dateStr);
  if (now.getTime() > mondayDeadline.getTime()) {
    return {
      disponible: false,
      cuposTotales: totalMax,
      cuposOcupados: 0,
      cuposDisponibles: 0,
      cuposMananaOcupados: 0,
      cuposMananaDisponibles: 0,
      cuposTardeOcupados: 0,
      cuposTardeDisponibles: 0,
      motivo: 'El agendamiento para esta semana cerró el Lunes a las 12:00 PM. Por favor selecciona una fecha de la siguiente semana.',
      turnosOcupados: [],
      horariosManana: buildHorarios(HORARIOS_MANANA, 'MAÑANA', [], true),
      horariosTarde: buildHorarios(HORARIOS_TARDE, 'TARDE', [], true),
      degustacionesManana: [],
      degustacionesTarde: [],
      degustacionesEnFecha: []
    };
  }

  // Comprobar días mínimos de anticipación (mínimo 2 días hábiles)
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < config.anticipacionMinimaDias) {
    return {
      disponible: false,
      cuposTotales: totalMax,
      cuposOcupados: 0,
      cuposDisponibles: 0,
      cuposMananaOcupados: 0,
      cuposMananaDisponibles: 0,
      cuposTardeOcupados: 0,
      cuposTardeDisponibles: 0,
      motivo: `Se requiere mínimo ${config.anticipacionMinimaDias} días de anticipación para coordinar promotoras y producto con Trade Marketing.`,
      turnosOcupados: [],
      horariosManana: buildHorarios(HORARIOS_MANANA, 'MAÑANA', [], true),
      horariosTarde: buildHorarios(HORARIOS_TARDE, 'TARDE', [], true),
      degustacionesManana: [],
      degustacionesTarde: [],
      degustacionesEnFecha: []
    };
  }

  // Comprobar si el día está bloqueado administrativamente
  if (config.diasBloqueados && config.diasBloqueados.includes(dateStr)) {
    return {
      disponible: false,
      cuposTotales: totalMax,
      cuposOcupados: totalMax,
      cuposDisponibles: 0,
      cuposMananaOcupados: maxManana,
      cuposMananaDisponibles: 0,
      cuposTardeOcupados: maxTarde,
      cuposTardeDisponibles: 0,
      motivo: 'Fecha bloqueada por Trade Marketing (Inventario o evento corporativo).',
      turnosOcupados: ['MAÑANA', 'TARDE', 'COMPLETO'],
      horariosManana: buildHorarios(HORARIOS_MANANA, 'MAÑANA', [], true),
      horariosTarde: buildHorarios(HORARIOS_TARDE, 'TARDE', [], true),
      degustacionesManana: [],
      degustacionesTarde: [],
      degustacionesEnFecha: []
    };
  }

  // Filtrar degustaciones activas para esa fecha (no canceladas ni rechazadas)
  const activeDeg = degustaciones.filter(d => 
    d.fecha === dateStr && d.estado !== 'CANCELADA' && d.estado !== 'RECHAZADA'
  );

  let cuposMananaOcupados = 0;
  let cuposTardeOcupados = 0;
  const degManana: Degustacion[] = [];
  const degTarde: Degustacion[] = [];

  activeDeg.forEach(d => {
    if (d.turno === 'MAÑANA') {
      cuposMananaOcupados += 1;
      degManana.push(d);
    } else if (d.turno === 'TARDE') {
      cuposTardeOcupados += 1;
      degTarde.push(d);
    } else if (d.turno === 'COMPLETO') {
      cuposMananaOcupados += 1;
      cuposTardeOcupados += 1;
      degManana.push(d);
      degTarde.push(d);
    }
  });

  const cuposMananaDisponibles = Math.max(0, maxManana - cuposMananaOcupados);
  const cuposTardeDisponibles = Math.max(0, maxTarde - cuposTardeOcupados);
  const cuposOcupados = cuposMananaOcupados + cuposTardeOcupados;
  const cuposDisponibles = cuposMananaDisponibles + cuposTardeDisponibles;

  const turnosOcupados: TurnoDegustacion[] = [];
  if (cuposMananaDisponibles <= 0) turnosOcupados.push('MAÑANA');
  if (cuposTardeDisponibles <= 0) turnosOcupados.push('TARDE');
  if (cuposMananaDisponibles <= 0 && cuposTardeDisponibles <= 0) turnosOcupados.push('COMPLETO');

  const horariosManana = buildHorarios(HORARIOS_MANANA, 'MAÑANA', degManana, false);
  const horariosTarde = buildHorarios(HORARIOS_TARDE, 'TARDE', degTarde, false);

  if (cuposDisponibles <= 0) {
    return {
      disponible: false,
      cuposTotales: totalMax,
      cuposOcupados,
      cuposDisponibles: 0,
      cuposMananaOcupados,
      cuposMananaDisponibles: 0,
      cuposTardeOcupados,
      cuposTardeDisponibles: 0,
      motivo: `Cupo diario agotado (${maxManana} en la mañana y ${maxTarde} en la tarde programados).`,
      turnosOcupados,
      horariosManana,
      horariosTarde,
      degustacionesManana: degManana,
      degustacionesTarde: degTarde,
      degustacionesEnFecha: activeDeg
    };
  }

  return {
    disponible: true,
    cuposTotales: totalMax,
    cuposOcupados,
    cuposDisponibles,
    cuposMananaOcupados,
    cuposMananaDisponibles,
    cuposTardeOcupados,
    cuposTardeDisponibles,
    turnosOcupados,
    horariosManana,
    horariosTarde,
    degustacionesManana: degManana,
    degustacionesTarde: degTarde,
    degustacionesEnFecha: activeDeg
  };
}
