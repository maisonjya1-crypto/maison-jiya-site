const APP_URL = "/?source=android-app";
const APP_ICON = "/jiya-gestion-192.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Pass-through réseau uniquement : aucune donnée du dashboard privé n'est stockée en cache.
// La présence d'un fetch handler permet à Android/Chrome de traiter l'installation comme une vraie PWA.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("Nouvelle commande Maison Jiya", {
    body: "Une nouvelle commande vient d’arriver. Ouvre Maison Jiya Gestion pour la traiter.",
    icon: APP_ICON,
    badge: APP_ICON,
    tag: `maison-jiya-order-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: { url: "/?newOrder=1&source=notification" },
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
