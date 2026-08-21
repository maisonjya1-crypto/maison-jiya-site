const APP_URL = "/?source=mobile-app";
const APP_ICON = "/jiya-gestion-192.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Réseau uniquement : aucune donnée du dashboard privé n'est conservée en cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "Nouvelle commande Maison Jiya";
  const body = payload.body || "Une nouvelle commande vient d’arriver. Ouvre Maison Jiya Gestion pour la traiter.";
  const target = payload.url || "/?newOrder=1&source=notification";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: APP_ICON,
    badge: APP_ICON,
    tag: payload.tag || `maison-jiya-order-${Date.now()}`,
    renotify: true,
    data: { url: target },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || APP_URL;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(target);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
