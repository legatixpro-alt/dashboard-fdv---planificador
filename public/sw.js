const SHARE_CACHE_NAME = 'fdv-whatsapp-share-v1';
const SHARED_RECEIPT_KEY = '/__shared_whatsapp_receipt__';
const SHARED_META_KEY = '/__shared_whatsapp_meta__';

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

          if (!sharedFile || !(sharedFile instanceof File)) {
            for (const [, value] of formData.entries()) {
              if (value instanceof File && value.size > 0) {
                sharedFile = value;
                break;
              }
            }
          }

          const title = String(formData.get('title') || '').trim();
          const text = String(formData.get('text') || '').trim();
          const sharedUrl = String(formData.get('url') || '').trim();

          if (sharedFile && sharedFile instanceof File && sharedFile.size > 0) {
            const cache = await caches.open(SHARE_CACHE_NAME);
            const fileHeaders = new Headers({
              'Content-Type': sharedFile.type || 'image/jpeg',
              'X-File-Name': encodeURIComponent(sharedFile.name || 'soporte_whatsapp.jpg'),
              'X-Shared-At': String(Date.now()),
            });
            await cache.put(
              SHARED_RECEIPT_KEY,
              new Response(sharedFile, { headers: fileHeaders })
            );
            await cache.put(
              SHARED_META_KEY,
              new Response(
                JSON.stringify({
                  name: sharedFile.name || 'soporte_whatsapp.jpg',
                  type: sharedFile.type || 'image/jpeg',
                  title,
                  text,
                  url: sharedUrl,
                  timestamp: Date.now(),
                }),
                { headers: { 'Content-Type': 'application/json' } }
              )
            );

            const allClients = await self.clients.matchAll({
              type: 'window',
              includeUncontrolled: true,
            });
            for (const client of allClients) {
              client.postMessage({
                type: 'WHATSAPP_SHARED_RECEIPT',
                timestamp: Date.now(),
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
