/* Service worker MindPitch: offline-first untuk berkas aplikasi. Data peta disimpan di IndexedDB (lokal). */
const CACHE = "mindpitch-v2";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE);
      // pra-cache aset hasil build (JS/CSS) yang disebut di index.html agar langsung bisa offline
      try {
        const res = await fetch("./index.html", { cache: "reload" });
        const html = await res.text();
        const urls = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) =>
          new URL(m[1], self.registration.scope).href
        );
        await cache.addAll(urls);
      } catch (e) {
        /* abaikan: akan di-cache saat dipakai */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // navigasi: coba jaringan dulu, jatuh ke cache saat offline
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch (e) {
          const opt = { ignoreVary: true };
          return (await caches.match("./index.html", opt)) || (await caches.match("./", opt)) || Response.error();
        }
      })()
    );
    return;
  }

  // aset lain: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // ignoreVary: server sering mengirim "Vary: Origin" sehingga modul script tidak cocok dengan cache
      const cached = await cache.match(req, { ignoreVary: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })()
  );
});
