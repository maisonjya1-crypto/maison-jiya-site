"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PushConfig = { publicKey?: string; subscriptions?: number; error?: string };
type AppNavigator = Navigator & { standalone?: boolean };
type NativeOrder = { id: number; orderRef: string; customerName: string | null; products: string };
type LiveData = { orders?: NativeOrder[] };
type NativeAndroidBridge = {
  notificationsSupported: () => boolean;
  notificationsEnabled: () => boolean;
  requestNotificationPermission: () => void;
  openNotificationSettings: () => void;
  notifyNewOrder: (orderRef: string, customerName: string, products: string) => void;
};
type NativeWindow = Window & { MaisonJiyaNative?: NativeAndroidBridge };

const PANEL_VISIBLE_MS = 30_000;
const APP_REFRESH_MS = 1_000;

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

function getNativeBridge() {
  if (typeof window === "undefined") return undefined;
  return (window as NativeWindow).MaisonJiyaNative;
}

export default function PrivatePwa() {
  const [authorized, setAuthorized] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [installed, setInstalled] = useState(false);
  const [android, setAndroid] = useState(false);
  const [ios, setIos] = useState(false);
  const [nativeAndroid, setNativeAndroid] = useState(false);
  const [nativeNotificationsAvailable, setNativeNotificationsAvailable] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const [panelPinned, setPanelPinned] = useState(false);
  const [settingsHost, setSettingsHost] = useState<HTMLElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastDataSnapshot = useRef<string>("");
  const lastNativeOrderIds = useRef<Set<string> | null>(null);
  const nativePermissionPending = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimer.current = window.setTimeout(() => {
      setPanelVisible(false);
      hideTimer.current = null;
    }, PANEL_VISIBLE_MS);
  }, [clearHideTimer]);

  const syncNativeNotificationState = useCallback(() => {
    const bridge = getNativeBridge();
    let available = false;
    let enabled = false;
    try {
      available = Boolean(bridge?.notificationsSupported?.());
      enabled = available && Boolean(bridge?.notificationsEnabled?.());
    } catch {
      available = false;
      enabled = false;
    }
    setNativeNotificationsAvailable(available);
    if (available) setNotificationsEnabled(enabled);
    return { available, enabled };
  }, []);

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
      const native = isNativeAndroidApp();
      setInstalled(isStandalone());
      setAndroid(isAndroidDevice());
      setIos(isIosDevice());
      setNativeAndroid(native);
      if (native) syncNativeNotificationState();
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
  }, [loadConfig, syncNativeNotificationState]);

  useEffect(() => {
    if (!nativeAndroid) return;
    const handleNativeNotificationState = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      const state = syncNativeNotificationState();
      const enabled = typeof detail?.enabled === "boolean" ? detail.enabled : state.enabled;
      setNativeNotificationsAvailable(true);
      setNotificationsEnabled(enabled);
      setBusy(false);
      if (nativePermissionPending.current) {
        nativePermissionPending.current = false;
        setMessage(enabled
          ? "Notifications Android activées. Maison Jiya peut maintenant afficher les alertes de nouvelles commandes."
          : "Les notifications Android restent désactivées. Tu peux les autoriser depuis les paramètres Android.");
      }
    };
    window.addEventListener("maison-jiya-native-notifications", handleNativeNotificationState);
    syncNativeNotificationState();
    return () => window.removeEventListener("maison-jiya-native-notifications", handleNativeNotificationState);
  }, [nativeAndroid, syncNativeNotificationState]);

  useEffect(() => {
    startHideTimer();
    return clearHideTimer;
  }, [clearHideTimer, startHideTimer]);

  useEffect(() => {
    const attachSettingsHost = () => {
      const settingsPage = document.querySelector<HTMLElement>(".settings-page");
      if (!settingsPage) {
        setSettingsHost(null);
        return;
      }
      let host = settingsPage.querySelector<HTMLElement>("[data-mj-app-settings-host]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.mjAppSettingsHost = "true";
        const intro = settingsPage.querySelector(".settings-intro");
        if (intro?.nextSibling) settingsPage.insertBefore(host, intro.nextSibling);
        else settingsPage.insertBefore(host, settingsPage.firstChild);
      }
      setSettingsHost(host);
    };

    attachSettingsHost();
    const observer = new MutationObserver(attachSettingsHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nativeAndroid && !installed) return;
    let cancelled = false;
    const refreshIfChanged = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/data?live=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const snapshot = await response.text();

        if (nativeAndroid) {
          try {
            const body = JSON.parse(snapshot) as LiveData;
            const orders = Array.isArray(body.orders) ? body.orders : [];
            const currentIds = new Set(orders.map((order) => String(order.id)));
            const previousIds = lastNativeOrderIds.current;
            const bridge = getNativeBridge();
            if (previousIds && bridge?.notificationsEnabled?.()) {
              for (const order of orders) {
                if (!previousIds.has(String(order.id))) {
                  bridge.notifyNewOrder(order.orderRef || "Nouvelle commande", order.customerName || "", order.products || "");
                }
              }
            }
            lastNativeOrderIds.current = currentIds;
          } catch {
            // Une réponse non JSON ne bloque jamais l’actualisation normale.
          }
        }

        if (!lastDataSnapshot.current) {
          lastDataSnapshot.current = snapshot;
          return;
        }
        if (snapshot !== lastDataSnapshot.current) {
          window.location.reload();
        }
      } catch {
        // La récupération réseau Android/iPhone existante prendra le relais.
      }
    };
    const interval = window.setInterval(() => void refreshIfChanged(), APP_REFRESH_MS);
    void refreshIfChanged();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [installed, nativeAndroid]);

  function keepPanelOpen() {
    if (!panelVisible) return;
    clearHideTimer();
    setPanelPinned(true);
  }

  function closePanel() {
    clearHideTimer();
    setPanelPinned(false);
    setPanelVisible(false);
    setMessage("");
  }

  function openFromSettings() {
    clearHideTimer();
    setPanelVisible(true);
    setPanelPinned(true);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function installApp() {
    setMessage("");
    if (installed || nativeAndroid) {
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
      window.location.href = "/telecharger-app";
      return;
    }

    setMessage("Dans le menu de ton navigateur, choisis « Installer l’application ».");
  }

  async function enableNotifications() {
    if (busy) return;

    if (nativeAndroid) {
      const bridge = getNativeBridge();
      if (!nativeNotificationsAvailable || !bridge?.requestNotificationPermission) {
        setMessage("Mets à jour Maison Jiya Gestion vers l’APK Android 2.5 pour activer les notifications natives.");
        return;
      }
      setBusy(true);
      setMessage("Autorise les notifications dans la fenêtre Android qui va s’afficher.");
      nativePermissionPending.current = true;
      try {
        bridge.requestNotificationPermission();
      } catch {
        nativePermissionPending.current = false;
        setBusy(false);
        setMessage("Impossible d’ouvrir l’autorisation Android. Utilise « Gérer les notifications Android » dans les paramètres de l’application.");
      }
      return;
    }

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

  async function manageNativeNotifications() {
    const bridge = getNativeBridge();
    try {
      bridge?.openNotificationSettings?.();
    } catch {
      setMessage("Ouvre Paramètres Android → Applications → Maison Jiya Gestion → Notifications.");
    }
  }

  async function disableNotifications() {
    if (busy || nativeAndroid || !("serviceWorker" in navigator)) return;
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

  const appRuntime = nativeAndroid || installed;
  const canShowPanel = nativeAndroid || authorized;
  const description = nativeAndroid
    ? nativeNotificationsAvailable
      ? "Application Android installée. Les données sont vérifiées automatiquement chaque seconde et les notifications natives peuvent être activées sur cet appareil."
      : "Application Android installée. Mets à jour vers la version 2.5 pour activer les notifications Android natives."
    : ios
      ? installed
        ? "Application iPhone installée. Les données sont vérifiées automatiquement chaque seconde."
        : "Ajoute le dashboard privé à l’écran d’accueil depuis Safari pour l’ouvrir comme une application gratuite."
      : android
        ? "Télécharge l’APK Maison Jiya Gestion depuis la page officielle."
        : "Installe uniquement le dashboard privé sur ton appareil.";

  const settingsCard = settingsHost ? createPortal(
    <section className="settings-panel app-notification-settings" id="application-notifications">
      <div>
        <span className="card-kicker">Application</span>
        <h2>Application & notifications</h2>
        <p>Retrouve ici à tout moment le panneau d’installation, l’état des notifications et l’accès au téléchargement Android.</p>
      </div>
      <div className="app-notification-settings-actions">
        <button type="button" className="primary-button" onClick={openFromSettings}>Ouvrir le panneau</button>
        <a className="secondary-button" href="/telecharger-app">Télécharger Android</a>
      </div>
      {appRuntime && <small>Actualisation automatique : vérification des nouvelles données toutes les 1 seconde lorsque l’application est ouverte.</small>}
      {nativeAndroid && nativeNotificationsAvailable && <small>Notifications Android natives : {notificationsEnabled ? "activées" : "désactivées"}.</small>}
      {nativeAndroid && !nativeNotificationsAvailable && <small>Notifications Android natives : mise à jour APK 2.5 requise.</small>}
    </section>,
    settingsHost,
  ) : null;

  const notificationStatus = nativeAndroid
    ? nativeNotificationsAvailable
      ? notificationsEnabled ? "Notifications Android ✓" : "Notifications Android désactivées"
      : "Mise à jour Android 2.5 requise"
    : notificationsEnabled ? "Notifications ✓" : "Notifications désactivées";

  return <>
    {settingsCard}
    {panelVisible && canShowPanel && <aside
      className={`private-pwa-panel private-pwa-temporary ${panelPinned ? "pinned" : ""}`}
      aria-label="Application Maison Jiya Gestion"
      onPointerDown={keepPanelOpen}
    >
      <header>
        <div><span>Application privée</span><strong>Maison Jiya Gestion</strong></div>
        <button
          type="button"
          className="private-pwa-close"
          aria-label="Fermer le panneau application"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); closePanel(); }}
        >Fermer</button>
      </header>
      <p>{description}</p>
      <div className="private-pwa-status">
        <span className={appRuntime ? "ok" : ""}>{nativeAndroid ? "APK Android ✓" : installed ? "Mode application ✓" : ios ? "Safari" : android ? "Android" : "App non installée"}</span>
        <span className={notificationsEnabled ? "ok" : ""}>{notificationStatus}</span>
      </div>
      <div className="private-pwa-actions" onPointerDown={(event) => event.stopPropagation()}>
        {nativeAndroid
          ? <span className="private-pwa-installed-state">Application installée</span>
          : appRuntime
            ? <span className="private-pwa-installed-state">Application installée</span>
            : <button type="button" onClick={() => void installApp()}>{ios ? "Installer sur iPhone" : android ? "Télécharger l’app Android" : "Installer l’app"}</button>}
        {nativeAndroid
          ? nativeNotificationsAvailable
            ? notificationsEnabled
              ? <button type="button" className="secondary" onClick={() => void manageNativeNotifications()}>Gérer les notifications Android</button>
              : <button type="button" className="primary" disabled={busy} onClick={() => void enableNotifications()}>{busy ? "Activation…" : "Activer les notifications"}</button>
            : <a className="private-pwa-action-link" href="/telecharger-app">Mettre à jour l’app Android</a>
          : !notificationsEnabled
            ? <button type="button" className="primary" disabled={busy} onClick={() => void enableNotifications()}>{busy ? "Activation…" : "Activer les notifications"}</button>
            : <button type="button" className="secondary" disabled={busy} onClick={() => void disableNotifications()}>Désactiver notifications</button>}
      </div>
      {message && <small className="private-pwa-message">{message}</small>}
      {!panelPinned && <small className="private-pwa-countdown">Ce panneau se masque automatiquement après 30 secondes. Touche-le pour le garder ouvert.</small>}
      {panelPinned && <small className="private-pwa-countdown">Panneau maintenu ouvert. « Fermer » le masque immédiatement. Tu peux le rouvrir depuis Paramètres → Application & notifications.</small>}
    </aside>}
  </>;
}
