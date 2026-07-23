// GARFIX EOS Service Worker — PWA support
// Version: 12 (aligned with app version)
// Strategies: network-first for API, cache-first for static, stale-while-revalidate for pages

const CACHE_NAME = "garfix-v12";
const STATIC_CACHE = "garfix-static-v12";
const API_CACHE = "garfix-api-v12";
const PAGE_CACHE = "garfix-pages-v12";

const APP_SHELL = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Maximum cache ages (in seconds)
const API_MAX_AGE = 30;      // 30 seconds — stale API data is risky
const STATIC_MAX_AGE = 86400; // 1 day — static assets rarely change
const PAGE_MAX_AGE = 300;     // 5 minutes — pages update on deploy

// ── Install ──────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {/* graceful — shell items may not exist yet */})
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE && k !== API_CACHE && k !== PAGE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch Strategies ─────────────────────────────────────────────────

// Network-first for API requests (don't cache stale data)
async function networkFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Clone and cache with timestamp
      const cloned = networkResponse.clone();
      const headers = new Headers(cloned.headers);
      headers.set("sw-cache-timestamp", Date.now().toString());
      const body = await cloned.blob();
      const cachedResponse = new Response(body, { headers });
      cache.put(request, cachedResponse);
    }
    return networkResponse;
  } catch (err) {
    // Offline fallback — check cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      const timestamp = parseInt(cachedResponse.headers.get("sw-cache-timestamp") || "0");
      const age = (Date.now() - timestamp) / 1000;
      if (age < maxAge * 10) { // Allow 10x max age when offline
        return cachedResponse;
      }
    }
    return new Response(JSON.stringify({ error: "Offline", message: "لا يتوفر اتصال بالشبكة" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Cache-first for static assets (JS bundles, CSS, images)
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && request.url.startsWith(self.location.origin)) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // For images, return a placeholder SVG
    if (request.url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
          <rect width="200" height="200" fill="#1a1035"/>
          <text x="100" y="105" text-anchor="middle" fill="#7c3aed" font-size="14">GARFIX</text>
        </svg>`,
        { headers: { "Content-Type": "image/svg+xml" } }
      );
    }
    return new Response("Offline", { status: 503 });
  }
}

// Stale-while-revalidate for pages (show cached, update in background)
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => cachedResponse || new Response("Offline", { status: 503 }));

  return cachedResponse || fetchPromise;
}

// ── Fetch Handler ────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== "GET") return;

  // Skip cross-origin requests (except our own API)
  if (url.origin !== self.location.origin) return;

  // API requests: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(event.request, API_CACHE, API_MAX_AGE));
    return;
  }

  // Static assets: cache-first (JS, CSS, fonts, images in _next/static)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(js|css|woff2?|ttf|png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // App pages: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request, PAGE_CACHE));
});

// ── Offline Fallback Page ────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  // This is a secondary handler for navigation requests that fail
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedPage = await cache.match("/");
        if (cachedPage) return cachedPage;

        // Generate a minimal offline page
        return new Response(
          `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>GARFIX — وضع عدم الاتصال</title>
  <style>
    body { background: #0f0a1e; color: white; font-family: system-ui; display: flex; align-items: center; justify-content: center; min-height: 100vh; text-align: center; }
    .card { background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.2); padding: 40px 30px; border-radius: 18px; max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 900; margin-bottom: 10px; }
    p { color: rgba(255,255,255,0.7); font-size: 14px; margin-bottom: 20px; }
    button { background: linear-gradient(135deg,#7c3aed,#a78bfa); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>وضع عدم الاتصال</h1>
    <p>لا يتوفر اتصال بالشبكة حالياً. بعض البيانات قد لا تكون محدّثة.</p>
    <button onclick="window.location.reload()">محاولة إعادة الاتصال</button>
  </div>
</body>
</html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      })
    );
  }
});

// ── Push Notification Placeholder ────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "GARFIX — إشعار جديد";
    const options = {
      body: data.body || "لديك إشعار جديد في GARFIX",
      icon: "/icon-192.png",
      badge: "/icon-72.png",
      dir: "rtl",
      lang: "ar",
      vibrate: [100, 50, 100],
      data: {
        url: data.url || "/",
        type: data.type || "general",
      },
      actions: [
        { action: "open", title: "فتح" },
        { action: "dismiss", title: "تجاهل" },
      ],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback for non-JSON push data
    event.waitUntil(
      self.registration.showNotification("GARFIX — إشعار جديد", {
        body: event.data.text() || "لديك إشعار جديد",
        icon: "/icon-192.png",
        dir: "rtl",
        lang: "ar",
      })
    );
  }
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If there's already a window open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ── Background Sync Placeholder ──────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "garfix-sync-invoices") {
    // Placeholder: sync pending invoices when connection restored
    event.waitUntil(
      // TODO: implement invoice sync from IndexedDB
      Promise.resolve()
    );
  }
});
