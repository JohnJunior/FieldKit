// FieldKit service worker
// Strategy:
//   - App shell (HTML/CSS/JS/icons): cache-first, pre-cached on install.
//   - Everything else: network-first with a cache fallback, so the app
//     still opens offline but fresh content wins when we're online.
//
// Bump CACHE_VERSION whenever the shell changes — old caches are deleted
// on activate so users never get stuck on a stale build.

const CACHE_VERSION = "fieldkit-v7";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/js/db.js",
  "/js/media.js",
  "/js/geo.js",
  "/js/files.js",
  "/js/push.js",
  "/js/auth.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  // Activate this SW immediately instead of waiting for all tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Web Share Target: the OS shares INTO us as a POST to /share-target (see the
  // manifest). We read the shared text/file, save it as an entry, then redirect
  // back to the app — all with no server involved.
  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== "GET") return; // never cache other mutations

  // Navigation requests: network-first, fall back to cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static shell assets: cache-first for instant loads.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Everything else: network-first, cache the response, fall back if offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Background Sync: flush queued entries when connectivity returns.
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-entries") {
    event.waitUntil(notifyClientsToSync());
  }
});

async function notifyClientsToSync() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "FLUSH_SYNC_QUEUE" });
  }
}

// ---------- Push notifications ----------
// A real push server (holding the VAPID private key) POSTs to the browser's
// push service, which wakes the SW with this event — even if no tab is open.
self.addEventListener("push", (event) => {
  let data = { title: "FieldKit", body: "You have a new update.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data.url,
    })
  );
});

// Focus an existing window if we have one, otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const open = all.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.focus();
      return self.clients.openWindow(target);
    })()
  );
});

// ---------- Web Share Target ----------
async function handleShareTarget(request) {
  try {
    const form = await request.formData();
    const text = [form.get("title"), form.get("text")].filter(Boolean).join(" — ");
    const file = form.get("media"); // File | null, per the manifest params

    let media = null;
    if (file && file.size) {
      const type = file.type.startsWith("audio/") ? "audio" : "image";
      media = { type, blob: file }; // a File is a Blob — stores fine in IndexedDB
    }

    await addSharedEntry({
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
      text: text || "Shared to FieldKit",
      media,
      lat: null,
      lng: null,
      heading: null,
      createdAt: Date.now(),
      synced: false,
    });
  } catch (err) {
    // Even if saving fails, still send the user back into the app.
    console.warn("share-target failed:", err);
  }
  // Redirect (303) so the browser does a GET of the app, not a POST replay.
  return Response.redirect("/?shared=1", 303);
}

// Minimal IndexedDB writer living in the SW. Must mirror db.js's schema
// (db "fieldkit", store "entries", keyPath "id") so the page reads it back.
function addSharedEntry(entry) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("fieldkit", 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("entries")) {
        const store = db.createObjectStore("entries", { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("synced", "synced");
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("entries", "readwrite");
      tx.objectStore("entries").put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
}
