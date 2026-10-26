const SHARE_CACHE_NAME = 'fdv-whatsapp-share-v1';
const SHARED_RECEIPT_KEY = '/__shared_whatsapp_receipt__';
const SHARED_META_KEY = '/__shared_whatsapp_meta__';

const SHARE_DB_NAME = 'fdv_whatsapp_share_db';
const SHARE_DB_VERSION = 1;
const SHARE_STORE_NAME = 'shared_receipts';
const SHARE_RECORD_KEY = 'latest_shared_receipt';

function inferMimeType(fileName, rawType) {
  const cleanType = String(rawType || '').toLowerCase().trim();
  const lowerName = String(fileName || '').toLowerCase().trim();
  if (cleanType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (cleanType === 'image/png' || lowerName.endsWith('.png')) {
    return 'image/png';
  }
  if (cleanType === 'image/webp' || lowerName.endsWith('.webp')) {
    return 'image/webp';
  }
  if (cleanType === 'image/heic' || cleanType === 'image/heif' || lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) {
    return 'image/heic';
  }
  if (cleanType.startsWith('image/')) {
    return cleanType;
  }
  return 'image/jpeg';
}

function saveToIndexedDBInSW(record) {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(false);
        return;
      }
      const req = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
          db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
          const store = tx.objectStore(SHARE_STORE_NAME);
          store.put({ ...record, id: SHARE_RECORD_KEY });
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch (err) {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    event.request.method === 'POST' &&
    (url.pathname === '/share-target-cobro' || url.searchParams.has('share-target'))
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          let sharedFile = formData.get('comprobante');

          if (!sharedFile || !(sharedFile instanceof Blob)) {
            for (const [, value] of formData.entries()) {
              if (value instanceof Blob && value.size > 0) {
                sharedFile = value;
                break;
              }
            }
          }

          const title = String(formData.get('title') || '').trim();
          const text = String(formData.get('text') || '').trim();
          const sharedUrl = String(formData.get('url') || '').trim();

          if (sharedFile && sharedFile instanceof Blob && sharedFile.size > 0) {
            const rawName = (sharedFile && sharedFile.name) ? sharedFile.name : '';
            const resolvedMime = inferMimeType(rawName, sharedFile.type);
            const defaultExt = resolvedMime === 'application/pdf' ? '.pdf' : '.jpg';
            const resolvedName = rawName || `soporte_whatsapp_${Date.now()}${defaultExt}`;
            const nowTs = Date.now();

            // 1. Guardar en IndexedDB compartido con el frontend
            const fileBuffer = await sharedFile.arrayBuffer();
            const safeBlob = new Blob([fileBuffer], { type: resolvedMime });
            await saveToIndexedDBInSW({
              blob: safeBlob,
              name: resolvedName,
              type: resolvedMime,
              size: safeBlob.size,
              title,
              text,
              url: sharedUrl,
              timestamp: nowTs,
            });

            // 2. Guardar también en CacheStorage como respaldo redundante
            const cache = await caches.open(SHARE_CACHE_NAME);
            const fileHeaders = new Headers({
              'Content-Type': resolvedMime,
              'X-File-Name': encodeURIComponent(resolvedName),
              'X-File-Size': String(safeBlob.size),
              'X-Shared-At': String(nowTs),
            });
            await cache.put(
              SHARED_RECEIPT_KEY,
              new Response(safeBlob.slice(0), { headers: fileHeaders })
            );
            await cache.put(
              SHARED_META_KEY,
              new Response(
                JSON.stringify({
                  name: resolvedName,
                  type: resolvedMime,
                  size: safeBlob.size,
                  title,
                  text,
                  url: sharedUrl,
                  timestamp: nowTs,
                }),
                { headers: { 'Content-Type': 'application/json' } }
              )
            );

            // 3. Notificar a cualquier pestaña/ventana activa (Warm Start)
            const allClients = await self.clients.matchAll({
              type: 'window',
              includeUncontrolled: true,
            });
            for (const client of allClients) {
              client.postMessage({
                type: 'WHATSAPP_SHARED_RECEIPT',
                timestamp: nowTs,
                name: resolvedName,
                mimeType: resolvedMime,
                size: safeBlob.size,
              });
            }
          }

          return Response.redirect('/?shared-receipt=1#cobros', 303);
        } catch (err) {
          console.error('[SW] Error procesando comprobante compartido desde WhatsApp:', err);
          return Response.redirect('/?shared-receipt=error#cobros', 303);
        }
      })()
    );
  }
});
