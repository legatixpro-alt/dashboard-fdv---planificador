// Sistema de Validación, Almacenamiento Local (IndexedDB) y Cola de Sincronización Offline
// para Soportes de Pago (JPG, PNG, WEBP, HEIC y PDF) del Módulo de Cobros

export interface CobroRecord {
  id: string;
  vendedor: string;
  vendedorEmail?: string;
  ruta: string;
  metodo_pago: string;
  banco: string;
  monto: number;
  referencia: string;
  fecha_pago: string;
  titular: string;
  rif: string;
  tasa: number;
  codigo_cliente: string;
  nombre_cliente: string;
  factura: string;
  // Vista previa o dataUrl comprimida (imagen JPEG o documento PDF en base64)
  image?: string;
  fileDataUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  fileSize?: number;
  // URL pública en Supabase Storage una vez sincronizado
  comprobante_url?: string;
  syncStatus: 'synced' | 'pending' | 'syncing' | 'error';
  syncError?: string;
  createdAt: string;
  syncedAt?: string;
}

const DB_NAME = 'fdv_cobros_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'cobros_queue';

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
export const ALLOWED_PDF_EXTENSIONS = ['.pdf'];
export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB antes de comprimir

export interface FileValidationResult {
  valid: boolean;
  isPdf: boolean;
  isHeic: boolean;
  resolvedMime: string;
  error?: string;
}

export function validateReceiptFile(file: File): FileValidationResult {
  if (!file || file.size === 0) {
    return {
      valid: false,
      isPdf: false,
      isHeic: false,
      resolvedMime: '',
      error: 'El archivo seleccionado está vacío o no es válido.',
    };
  }

  const lowerName = (file.name || '').toLowerCase().trim();
  const rawType = (file.type || '').toLowerCase().trim();

  const isPdf =
    rawType === 'application/pdf' ||
    ALLOWED_PDF_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

  const isHeic =
    rawType === 'image/heic' ||
    rawType === 'image/heif' ||
    lowerName.endsWith('.heic') ||
    lowerName.endsWith('.heif');

  const isImage =
    !isPdf &&
    (rawType.startsWith('image/') ||
      ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext)));

  if (!isPdf && !isImage) {
    return {
      valid: false,
      isPdf: false,
      isHeic: false,
      resolvedMime: rawType,
      error: 'Formato no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP, HEIC) o documentos PDF.',
    };
  }

  if (isPdf && file.size > MAX_PDF_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      isPdf: true,
      isHeic: false,
      resolvedMime: 'application/pdf',
      error: `El documento PDF pesa ${sizeMb} MB y supera el límite máximo de 10 MB.`,
    };
  }

  if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      isPdf: false,
      isHeic,
      resolvedMime: rawType || 'image/jpeg',
      error: `La imagen pesa ${sizeMb} MB y supera el límite máximo de 15 MB.`,
    };
  }

  let resolvedMime = rawType;
  if (isPdf) resolvedMime = 'application/pdf';
  else if (isHeic) resolvedMime = 'image/heic';
  else if (lowerName.endsWith('.png')) resolvedMime = 'image/png';
  else if (lowerName.endsWith('.webp')) resolvedMime = 'image/webp';
  else if (!resolvedMime || !resolvedMime.startsWith('image/')) resolvedMime = 'image/jpeg';

  return {
    valid: true,
    isPdf,
    isHeic,
    resolvedMime,
  };
}

function openCobrosDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB no disponible en este navegador'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Error abriendo IndexedDB'));
  });
}

export async function saveCobroToLocalDB(record: CobroRecord): Promise<void> {
  try {
    const db = await openCobrosDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[OfflineQueue] Error guardando cobro en IndexedDB:', err);
  }
}

export async function getAllCobrosFromLocalDB(): Promise<CobroRecord[]> {
  try {
    const db = await openCobrosDB();
    const records = await new Promise<CobroRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return records.sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  } catch (err) {
    console.warn('[OfflineQueue] Error leyendo cobros de IndexedDB:', err);
    return [];
  }
}

export async function deleteCobroFromLocalDB(id: string): Promise<void> {
  try {
    const db = await openCobrosDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[OfflineQueue] Error eliminando cobro de IndexedDB:', err);
  }
}

export async function clearCobrosFromLocalDB(): Promise<void> {
  try {
    const db = await openCobrosDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[OfflineQueue] Error limpiando IndexedDB:', err);
  }
}

export async function syncCobroToCloud(
  record: CobroRecord,
  authHeaders: Record<string, string>
): Promise<{
  success: boolean;
  comprobante_url?: string;
  syncedAt?: string;
  error?: string;
}> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      success: false,
      error: 'Sin conexión a Internet. El cobro quedó guardado en la cola local y se subirá al recuperar señal.',
    };
  }

  try {
    const res = await fetch('/api/cobros/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        id: record.id,
        vendedor: record.vendedor,
        vendedorEmail: record.vendedorEmail,
        ruta: record.ruta,
        metodo_pago: record.metodo_pago || 'Pago Móvil',
        banco: record.banco,
        monto: record.monto,
        referencia: record.referencia,
        fecha_pago: record.fecha_pago,
        titular: record.titular,
        rif: record.rif,
        tasa: record.tasa,
        codigo_cliente: record.codigo_cliente,
        nombre_cliente: record.nombre_cliente,
        factura: record.factura,
        fileDataUrl: record.fileDataUrl || record.image || undefined,
        fileName: record.fileName || undefined,
        fileMimeType: record.fileMimeType || undefined,
        createdAt: record.createdAt,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Error HTTP ${res.status} al sincronizar cobro`);
    }

    const data = await res.json();
    const updatedRecord: CobroRecord = {
      ...record,
      comprobante_url: data.comprobante_url || record.comprobante_url,
      syncStatus: 'synced',
      syncError: undefined,
      syncedAt: data.syncedAt || new Date().toISOString(),
    };
    await saveCobroToLocalDB(updatedRecord);

    return {
      success: true,
      comprobante_url: updatedRecord.comprobante_url,
      syncedAt: updatedRecord.syncedAt,
    };
  } catch (err: any) {
    const errMsg = err?.message || 'No se pudo sincronizar con la nube';
    await saveCobroToLocalDB({
      ...record,
      syncStatus: 'pending',
      syncError: errMsg,
    });
    return {
      success: false,
      error: errMsg,
    };
  }
}
