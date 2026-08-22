"use client";

import { useCallback, useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PushConfig = { publicKey?: string; subscriptions?: number; error?: string };
type AppNavigator = Navigator & { standalone?: boolean };

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const ipadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/.test(ua) || ipadOs;
}

function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function isNativeAndroidApp() {
  if (typeof navigator === "undefined") return false;
  return /MaisonJiyaAndroid\//i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as AppNavigator).standalone);
}

export default function PrivatePwa() {
  const [authorized, setAuthorized] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [installed, setInstalled] = useState(false);
  const [android, setAndroid] = useState(false);
  const [ios, setIos] = useState(false);
  const [nativeAndroid, setNativeAndroid] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const syncExistingSubscription = useCallback(async (key: string) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !key) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setNotificationsEnabled(Boolean(subscription) && Notification.permission === "granted");
      if (!subscription) return;
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok && response.status === 401) setAuthorized(false);
    } catch {
      // Un abonnement existant reste utilisable même si une resynchronisation ponctuelle échoue.
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch(`/api/push?status=${Date.now()}`, { cache: "no-store" });
      if (response.status === 401) {
        setAuthorized(false);
        return false;
      }
      const body = await response.json() as PushConfig;
      if (!response.ok || !body.publicKey) return false;
      setAuthorized(true);
      setPublicKey(body.publicKey);
      await syncExistingSubscription(body.publicKey);
      return true;
    } catch {
      return false;
    }
  }, [syncExistingSubscription]);

  useEffect(() => {
    const deviceTimer = window.setTimeout(() => {
      setInstalled(isStandalone());
      setAndroid(isAndroidDevice());
      setIos(isIosDevice());
      setNativeAndroid(isNativeAndroidApp());
    }, 0);

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("Maison Jiya Gestion est installée comme application.");
    };
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const displayChanged = () => setInstalled(isStandalone());

    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    displayMode.addEventListener?.("change", displayChanged);

    if ("serviceWorker" in navigator && !isNativeAndroidApp()) {
      void navigator.serviceWorker.register("/private-sw.js?v=3", {
        scope: "/",
        updateViaCache: "none",
      }).then(async (registration) => {
        await registration.update();
      }).catch(() => undefined);
    }

    let cancelled = false;
    let timer = 0;
    const tryAuth = async () => {
      if (cancelled || isNativeAndroidApp()) return;
      const ok = await loadConfig();
      if (!ok && !cancelled) timer = window.setTimeout(tryAuth, 4000);
    };
    timer = window.setTimeout(tryAuth, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(deviceTimer);
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
      displayMode.removeEventListener?.("change", displayChanged);
    };
  }, [loadConfig]);

  async function installApp() {
    setMessage("");
    if (installed) {
      setMessage("L’application est déjà installée sur cet appareil.");
      return;
    }

    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setMessage("Installation lancée. L’application va apparaître dans tes applications.");
      } else {
        setMessage("Installation annulée. Tu peux la relancer quand tu veux.");
      }
      return;
    }

    if (ios) {
      setMessage("Sur iPhone : Safari → Partager ⤴ → « Ajouter à l’écran d’accueil » → Ajouter. Ouvre ensuite l’icône Jiya Gestion.");
      return;
    }

    if (android) {
      setMessage("Sur Android, utilise l’APK Maison Jiya Gestion depuis la page officielle de téléchargement.");
      return;
    }

    setMessage("Dans le menu de ton navigateur, choisis « Installer l’application ».");
  }

  async function enableNotifications() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (ios && !isStandalone()) {
        setMessage("Sur iPhone, ajoute d’abord Maison Jiya Gestion à l’écran d’accueil depuis Safari. Ouvre ensuite l’icône installée pour activer les notifications.");
        return;
      }
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error(ios
          ? "Les notifications nécessitent une version récente d’iOS et l’ouverture depuis l’icône Maison Jiya installée."
          : "Les notifications push ne sont pas prises en charge par ce navigateur.");
      }
      if (!publicKey) {
        const ok = await loadConfig();
        if (!ok) throw new Error("Reconnecte-toi au site privé puis réessaie.");
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Autorisation de notification refusée sur cet appareil.");

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const key = publicKey || (await (await fetch("/api/push", { cache: "no-store" })).json() as PushConfig).publicKey || "";
        if (!key) throw new Error("Clé de notification indisponible.");
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(key),
        });
      }
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Impossible d’activer les notifications.");
      setNotificationsEnabled(true);
      setMessage("Notifications activées. Cet appareil sera alerté à chaque nouvelle commande du site public.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d’activer les notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    if (busy || !("serviceWorker" in navigator)) return;
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setNotificationsEnabled(false);
      setMessage("Notifications désactivées sur cet appareil.");
    } finally {
      setBusy(false);
    }
  }

  // Dans une app déjà installée (APK Android ou PWA iPhone), aucun panneau ne doit recouvrir le dashboard.
  // La synchronisation d'un abonnement push existant continue en arrière-plan sur la PWA iPhone.
  if (nativeAndroid || installed || !authorized) return null;

  const description = ios
    ? "Ajoute le dashboard privé à l’écran d’accueil depuis Safari pour l’ouvrir comme une application gratuite."
    : android
      ? "Télécharge l’APK Maison Jiya Gestion depuis la page officielle."
      : "Installe uniquement le dashboard privé sur ton appareil.";

  return <aside className="private-pwa-panel" aria-label="Application Maison Jiya Gestion">
    <header>
      <div><span>Application privée</span><strong>Maison Jiya Gestion</strong></div>
    </header>
    <p>{description}</p>
    <div className="private-pwa-status">
      <span>{ios ? "Safari" : android ? "Android" : "App non installée"}</span>
      <span className={notificationsEnabled ? "ok" : ""}>{notificationsEnabled ? "Notifications ✓" : "Notifications désactivées"}</span>
    </div>
    <div className="private-pwa-actions">
      <button type="button" onClick={() => void installApp()}>{ios ? "Installer sur iPhone" : android ? "Télécharger l’app Android" : "Installer l’app"}</button>
      {!notificationsEnabled
        ? <button type="button" className="primary" disabled={busy} onClick={() => void enableNotifications()}>{busy ? "Activation…" : "Activer les notifications"}</button>
        : <button type="button" className="secondary" disabled={busy} onClick={() => void disableNotifications()}>Désactiver notifications</button>}
    </div>
    {message && <small className="private-pwa-message">{message}</small>}
  </aside>;
}
