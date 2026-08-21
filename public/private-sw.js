self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("Nouvelle commande Maison Jiya", {
    body: "Une nouvelle commande vient d’arriver. Ouvre Maison Jiya Gestion pour la traiter.",
    icon: "/maison-jiya-logo.jpeg",
    badge: "/maison-jiya-logo.jpeg",
    tag: `maison-jiya-order-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: { url: "/?newOrder=1" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("navigate" in client) await client.navigate(target);
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
