// Service Worker para FULLEMPAQUES Producción
const CACHE_NAME = 'fullempaques-prod-v20';
const OFFLINE_URL = '/produccion/offline.html';

const STATIC_ASSETS = [
  '/produccion/',
  '/produccion/index.html',
  '/produccion/styles.css',
  '/produccion/app.js',
  '/produccion/offline.html',
  '/produccion/manifest.json',
  '/produccion/icons/icon-192.svg',
  '/produccion/icons/icon-512.svg'
];

// Instalación - cachear assets estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación - limpiar caches viejos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch - estrategia según tipo de request
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Para API de Supabase - Network first con fallback a queue
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(networkFirstWithQueue(request));
    return;
  }

  // Para HTML, JS, CSS - Network first (para desarrollo)
  if (request.method === 'GET') {
    const isCodeFile = url.pathname.endsWith('.html') ||
                       url.pathname.endsWith('.js') ||
                       url.pathname.endsWith('.css');

    if (isCodeFile) {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(cacheFirst(request));
    }
    return;
  }
});

// Estrategia Network First (para archivos de código)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    throw error;
  }
}

// Estrategia Cache First
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Si falla y es navegación, mostrar offline
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    throw error;
  }
}

// Network First con cola para offline
async function networkFirstWithQueue(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // Si es una mutación (POST, PUT, etc), encolar
    if (request.method !== 'GET') {
      await queueRequest(request);
      return new Response(JSON.stringify({
        queued: true,
        message: 'Operación guardada para sincronizar'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw error;
  }
}

// Encolar request para sync posterior
async function queueRequest(request) {
  const db = await openSyncDB();
  const clonedRequest = request.clone();
  const body = await clonedRequest.text();

  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');

  await store.add({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: body,
    timestamp: Date.now()
  });

  // Registrar sync si está disponible
  if ('sync' in self.registration) {
    await self.registration.sync.register('sync-operations');
  }
}

// Abrir IndexedDB para sync queue
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fullempaques-sync', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', {
          keyPath: 'id',
          autoIncrement: true
        });
      }
    };
  });
}

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-operations') {
    event.waitUntil(syncQueuedOperations());
  }
});

// Sincronizar operaciones encoladas
async function syncQueuedOperations() {
  const db = await openSyncDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');

  const allRequests = await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  for (const item of allRequests) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      });

      // Eliminar de la cola si fue exitoso
      await new Promise((resolve, reject) => {
        const deleteRequest = store.delete(item.id);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      console.log('[SW] Synced:', item.url);
    } catch (error) {
      console.error('[SW] Sync failed for:', item.url, error);
    }
  }
}

// Notificar a clientes sobre cambios de conexión
self.addEventListener('message', (event) => {
  if (event.data === 'check-sync') {
    syncQueuedOperations().then(() => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'sync-complete' });
        });
      });
    });
  }
});
