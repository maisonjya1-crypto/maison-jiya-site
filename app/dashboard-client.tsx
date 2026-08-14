"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import AiPage from "./ai-page";

type Order = {
  id: number;
  orderRef: string;
  customerId: number;
  productId: number | null;
  customerName: string | null;
  phone: string | null;
  city: string;
  address: string;
  products: string;
  quantity: number;
  saleAmount: number;
  productCost: number;
  shippingCost: number;
  adCost: number;
  fees: number;
  returnCost: number;
  returnReason: string;
  returnNote: string;
  source: string;
  status: string;
  paymentStatus: string;
  carrier: string;
  trackingNumber: string;
  carrierDispatchState: string;
  carrierAuthorizedAt: string | null;
  carrierInvoiceCode: string;
  stockDeducted: boolean;
  paidAt: string | null;
  deletedAt: string | null;
  deletedByUserId: number | null;
  createdAt: string;
  updatedAt: string | null;
};
type Customer = {
  id: number;
  name: string;
  phone: string;
  city: string;
  createdAt: string;
};
type Purchase = {
  id: number;
  supplier: string;
  item: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  paymentStatus: string;
  createdAt: string;
};
type Ad = {
  id: number;
  platform: string;
  campaign: string;
  spend: number;
  revenue: number;
  orderCount: number;
  source: string;
  performanceDate: string;
};
type Capital = {
  id: number;
  direction: string;
  category: string;
  label: string;
  amount: number;
  entryDate: string;
};
type Product = {
  id: number;
  productCode: string;
  name: string;
  category: string;
  purchasePrice: number;
  salePrice: number;
  stockQuantity: number;
  createdAt: string;
};
type StockMovement = {
  id: number;
  productId: number;
  orderId: number | null;
  orderRef: string | null;
  productCode: string | null;
  productName: string | null;
  movementType: string;
  quantity: number;
  note: string;
  createdAt: string;
};
type InventoryCount = {
  id: number;
  countRef: string;
  productId: number;
  productCode: string | null;
  productName: string | null;
  systemQuantity: number;
  physicalQuantity: number;
  difference: number;
  note: string;
  countedByUserId: number | null;
  countedByName: string;
  createdAt: string;
};
type Member = {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "editor" | "viewer";
  isActive: boolean;
  createdAt: string;
};
type OrderStatusHistory = {
  id: number;
  orderId: number;
  fromStatus: string | null;
  toStatus: string;
  changedByUserId: number | null;
  changedByName: string;
  changedAt: string;
};
type AuditLog = {
  id: number;
  userId: number | null;
  username: string;
  displayName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string;
  createdAt: string;
};
type DailyBackup = {
  id: number;
  backupDate: string;
  reason: string;
  recordCount: number;
  createdAt: string;
};
type Data = {
  orders: Order[];
  trash: Order[];
  customers: Customer[];
  purchases: Purchase[];
  ads: Ad[];
  capital: Capital[];
  products: Product[];
  stockMovements: StockMovement[];
  inventoryCounts: InventoryCount[];
  members: Member[];
  orderStatusHistory: OrderStatusHistory[];
  auditLogs: AuditLog[];
  backups: DailyBackup[];
  settings: Record<string, string>;
  access: {
    canEdit: boolean;
    isOwner: boolean;
    canClaimOwnership: boolean;
    passwordConfigured: boolean;
    sessionExpiresAt: string | null;
    role: "admin" | "editor" | "viewer";
    username: string;
    displayName: string;
  };
};
type ModalName = "order" | "purchase" | "ad" | "capital" | "product" | null;
type StockSelection = { product: Product; type: "Entrée" | "Vente" } | null;
type InventorySelection = Product | null;
type ThemeKey = "mauve-froid" | "rose-poudre" | "sombre-prune" | "bleu-brume" | "sable-chic";
type CapitalFlow = {
  direction: "Entrée" | "Sortie";
  source: string;
  amount: number;
  date: string;
};
type CarrierQuote = { available: boolean; carrier: "Sendit" | "ForceLog"; error?: string; fee: number | null };
type CarrierQuoteResult = { pickupCity: "Casablanca"; quotes: CarrierQuote[]; recommendedCarrier: "Sendit" | "ForceLog" | null };
type EditableEntity =
  | { kind: "product"; record: Product }
  | { kind: "movement"; record: StockMovement }
  | { kind: "customer"; record: Customer }
  | { kind: "purchase"; record: Purchase }
  | { kind: "ad"; record: Ad }
  | { kind: "capital"; record: Capital };

const emptyData: Data = {
  orders: [],
  trash: [],
  customers: [],
  purchases: [],
  ads: [],
  capital: [],
  products: [],
  stockMovements: [],
  inventoryCounts: [],
  members: [],
  orderStatusHistory: [],
  auditLogs: [],
  backups: [],
  settings: {},
  access: { canEdit: false, isOwner: false, canClaimOwnership: false, passwordConfigured: true, sessionExpiresAt: null, role: "viewer", username: "", displayName: "" },
};
const money = (value: number) => `${Math.round(value).toLocaleString("fr-MA")} MAD`;
const moneyTone = (value: number) => (value > 0 ? "money-positive" : value < 0 ? "money-negative" : "");
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const dateTimeLabel = (value: string) =>
  new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const navigation = ["Vue d’ensemble", "Commandes", "Produits", "Colis", "Clients", "Achats", "Publicités", "Capital", "Assistant IA", "Corbeille", "Paramètres"];
const orderStatusOptions = ["En attente", "Confirmée", "Expédiée", "En livraison", "Livrée", "Retour", "Annulée"];
const returnReasonOptions = ["Cliente injoignable", "Refus de la cliente", "Adresse incorrecte", "Cliente absente", "Produit endommagé", "Mauvais produit", "Autre"];
const orderSourceOptions = ["WhatsApp", "Instagram", "Facebook", "TikTok", "Site web", "Autre"];
const productCategoryOptions = ["Montres", "Bijoux", "Wallets", "Électronique", "Autre"];
const capitalMonthLabels = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const capitalMonthShort = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const capitalChartColors = ["var(--forest)", "var(--terracotta)", "var(--gold)", "#557ea4", "#8b6f9f", "#c47c8d", "#b68658", "#77869b"];
const themeOptions: { key: ThemeKey; name: string; mode: "Clair" | "Sombre"; description: string; colors: string[] }[] = [
  { key: "mauve-froid", name: "Mauve froid", mode: "Clair", description: "Mauve élégant, blanc doux et rose froid.", colors: ["#6f5680", "#a77ea7", "#f7f4f8", "#ffffff"] },
  { key: "rose-poudre", name: "Rose poudré", mode: "Clair", description: "Rose subtil, prune douce et blanc rosé.", colors: ["#a85e78", "#d190a5", "#fff7f8", "#ffffff"] },
  { key: "sombre-prune", name: "Sombre prune", mode: "Sombre", description: "Prune profonde, lilas lumineux et contraste doux.", colors: ["#1b1620", "#5e3c68", "#c69ad3", "#f7eef8"] },
  { key: "bleu-brume", name: "Bleu brume", mode: "Clair", description: "Bleu froid, gris perle et blanc net.", colors: ["#546f8c", "#829ab1", "#f3f6f8", "#ffffff"] },
  { key: "sable-chic", name: "Sable chic", mode: "Clair", description: "Beige raffiné, cacao doux et ivoire.", colors: ["#806452", "#b59377", "#f8f5ef", "#ffffff"] },
];

function safeTheme(value: string | undefined): ThemeKey {
  return themeOptions.some((theme) => theme.key === value) ? (value as ThemeKey) : "mauve-froid";
}

function createBackupToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCarrierNames(settings: Record<string, string>) {
  const candidates: string[] = [];
  try {
    const parsed = JSON.parse(settings.carrier_names || "[]");
    if (Array.isArray(parsed)) candidates.push(...parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    // Le nom historique reste disponible ci-dessous.
  }
  if (settings.carrier_name && settings.carrier_name !== "À configurer") candidates.push(settings.carrier_name);
  return candidates
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name, index, names) => name.length >= 2 && names.findIndex((item) => item.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")) === index);
}

export default function DashboardClient() {
  const [active, setActive] = useState("Vue d’ensemble");
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EditableEntity | null>(null);
  const [stockSelection, setStockSelection] = useState<StockSelection>(null);
  const [inventorySelection, setInventorySelection] = useState<InventorySelection>(null);
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/data");
      const body = (await response.json()) as Data & { error?: string };
      if (response.status === 401) {
        const authResponse = await fetch("/api/auth", { cache: "no-store" });
        const authBody = (await authResponse.json()) as { configured?: boolean; error?: string };
        if (!authResponse.ok) throw new Error(authBody.error || "La connexion est momentanément indisponible.");
        setAuthConfigured(Boolean(authBody.configured));
        setAuthRequired(true);
        return;
      }
      if (!response.ok) throw new Error(body.error || "Données indisponibles");
      setData(body);
      setAuthRequired(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Données indisponibles");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);
  useEffect(() => {
    const clearPrintOrder = () => setPrintOrder(null);
    window.addEventListener("afterprint", clearPrintOrder);
    return () => window.removeEventListener("afterprint", clearPrintOrder);
  }, []);

  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setData(emptyData);
    setAuthRequired(true);
    setAuthConfigured(true);
  }

  async function submit(action: string, values: Record<string, FormDataEntryValue>) {
    setError("");
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...values }),
    });
    const body = (await response.json()) as Data & { error?: string; message?: string };
    if (!response.ok) {
      const message = body.error || "Enregistrement impossible";
      setError(message);
      throw new Error(message);
    }
    setData(body);
    setModal(null);
    setSelectedOrder(null);
    setSelectedEntity(null);
    setStockSelection(null);
    setInventorySelection(null);
    const messages: Record<string, string> = {
      createMember: "Compte partenaire créé",
      resetMemberPassword: "Mot de passe remplacé",
      updateMember: "Droits du partenaire mis à jour",
      updateAccountSettings: "Compte principal mis à jour",
      updateSetting: "Réglage appliqué",
      updateCarriers: "Liste des agences mise à jour",
      updateBackupToken: "Clé privée de sauvegarde créée",
      revokeBackupToken: "Sauvegarde Google Sheets désactivée",
      updateBackupWebhook: "Synchronisation instantanée connectée",
      createBackupNow: "Sauvegarde complète créée",
      restoreBackup: "Sauvegarde restaurée avec succès",
      deleteOrder: "Commande placée dans la corbeille pendant 90 jours",
      restoreOrder: "Commande restaurée",
      updateProduct: "Produit mis à jour",
      deleteProduct: "Produit et historique de stock supprimés",
      updateStockMovement: "Mouvement de stock mis à jour",
      deleteStockMovement: "Mouvement de stock supprimé",
      countInventory: "Inventaire enregistré et stock corrigé",
      updateCustomer: "Client mis à jour",
      deleteCustomer: "Client supprimé",
      updatePurchase: "Achat mis à jour",
      deletePurchase: "Achat supprimé",
      updateAd: "Publicité mise à jour",
      deleteAd: "Publicité supprimée",
      updateCapital: "Mouvement de capital mis à jour",
      deleteCapital: "Mouvement de capital supprimé",
      authorizeCarrierDispatch: "Colis créé chez l’agence sélectionnée",
      syncCarriersNow: "Suivi des agences actualisé",
    };
    setNotice(body.message || messages[action] || "Enregistré avec succès");
    setTimeout(() => setNotice(""), 2500);
  }

  function requireEditAccess() {
    if (data.access.canEdit) return true;
    setActive("Paramètres");
    setError("Votre compte est en lecture seule. Demandez un rôle Éditeur à l’administrateur.");
    return false;
  }

  function openEntry(kind: ModalName) {
    if (requireEditAccess()) setModal(kind);
  }

  function openOrder(order: Order) {
    if (requireEditAccess()) setSelectedOrder(order);
  }

  function printOrderSlip(order: Order) {
    setPrintOrder(order);
    window.setTimeout(() => window.print(), 80);
  }

  function openStock(selection: StockSelection) {
    if (requireEditAccess()) setStockSelection(selection);
  }

  function openInventory(product: Product) {
    if (requireEditAccess()) setInventorySelection(product);
  }

  function openEntity(selection: EditableEntity) {
    if (requireEditAccess()) setSelectedEntity(selection);
  }

  async function deleteEntity(selection: EditableEntity) {
    if (!requireEditAccess()) return;
    let action = "";
    let label = "";
    let warning = "";
    switch (selection.kind) {
      case "product":
        action = "deleteProduct";
        label = `le produit ${selection.record.name}`;
        warning = " Son historique de stock sera également supprimé.";
        break;
      case "movement":
        action = "deleteStockMovement";
        label = `ce mouvement de stock de ${selection.record.quantity} unité(s)`;
        warning = " La quantité restante sera recalculée.";
        break;
      case "customer":
        action = "deleteCustomer";
        label = `le client ${selection.record.name}`;
        warning = " La suppression sera refusée si ce client possède encore des commandes.";
        break;
      case "purchase":
        action = "deletePurchase";
        label = `l’achat ${selection.record.item}`;
        break;
      case "ad":
        action = "deleteAd";
        label = `la campagne ${selection.record.campaign}`;
        break;
      case "capital":
        action = "deleteCapital";
        label = `le mouvement ${selection.record.label}`;
        break;
    }
    const confirmed = window.confirm(`Supprimer définitivement ${label} ?${warning}\n\nCette action est irréversible.`);
    if (!confirmed) return;
    try {
      await submit(action, { id: String(selection.record.id) });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    }
  }

  async function deleteOrder(order: Order) {
    if (!requireEditAccess()) return;
    const confirmed = window.confirm(
      `Placer la commande ${order.orderRef} de ${order.customerName} dans la corbeille ?\n\nVous pourrez la restaurer pendant 90 jours.`,
    );
    if (!confirmed) return;
    try {
      await submit("deleteOrder", { id: String(order.id) });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    }
  }

  const metrics = useMemo(() => {
    const delivered = data.orders.filter((o) => o.status === "Livrée");
    const deliveredRevenue = delivered.reduce((s, o) => s + o.saleAmount, 0);
    const collected = data.orders.filter((o) => o.paymentStatus === "Encaissé");
    const revenue = collected.reduce((s, o) => s + o.saleAmount, 0);
    const shippingFees = collected.reduce((s, o) => s + o.shippingCost, 0);
    const collectionFees = collected.reduce((s, o) => s + o.fees, 0);
    const netCollected = revenue - shippingFees - collectionFees;
    const costs = delivered.reduce((s, o) => s + o.productCost + o.shippingCost + o.adCost + o.fees, 0);
    const losses = data.orders.reduce((s, o) => s + o.returnCost, 0);
    const adSpend = data.ads.reduce((s, a) => s + a.spend, 0);
    const adRevenue = data.ads.reduce((s, a) => s + a.revenue, 0);
    const purchases = data.purchases.filter((p) => p.paymentStatus === "Payé").reduce((s, p) => s + p.totalCost, 0);
    const capitalNet = data.capital.reduce((s, r) => s + (r.direction === "Entrée" ? r.amount : -r.amount), 0);
    const profit = deliveredRevenue - costs - losses;
    const cash = capitalNet + netCollected - purchases - losses - adSpend;
    return {
      revenue,
      shippingFees,
      collectionFees,
      netCollected,
      profit,
      losses,
      adSpend,
      roas: adSpend ? adRevenue / adSpend : 0,
      cash,
      capitalNet,
      margin: deliveredRevenue ? (profit / deliveredRevenue) * 100 : 0,
      reinvest: Math.round(Math.max(0, cash) * 0.5),
    };
  }, [data]);
  const delivery = useMemo(() => {
    const count = (states: string[]) => data.orders.filter((o) => states.includes(o.status)).length;
    return [
      { label: "Livrés", value: count(["Livrée"]), tone: "green" },
      {
        label: "En transit",
        value: count(["Expédiée", "En livraison"]),
        tone: "blue",
      },
      {
        label: "En attente",
        value: count(["En attente", "Confirmée", "Nouvelle"]),
        tone: "orange",
      },
      {
        label: "Retours / annulations",
        value: count(["Retour", "Annulée", "Retournée", "Refusée"]),
        tone: "red",
      },
    ];
  }, [data.orders]);

  const currentTheme = safeTheme(data.settings.theme);
  const carrierNames = parseCarrierNames(data.settings);

  if (authRequired) {
    return <AuthPage configured={authConfigured} onAuthenticated={() => void loadData()} />;
  }
  const roleLabel = data.access.role === "admin" ? "Administrateur" : data.access.role === "editor" ? "Éditeur" : "Lecture seule";

  return (
    <main className={`app-shell theme-${currentTheme}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo" src="/maison-jiya-logo.jpeg" alt="Logo Maison Jiya" />
          </span>
          <div>
            <strong>Maison Jiya</strong>
            <small>Pilotage</small>
          </div>
        </div>
        <nav aria-label="Navigation principale">
          {navigation.map((item, index) => (
            <button key={item} className={active === item ? "nav-item active" : "nav-item"} onClick={() => setActive(item)}>
              <span className="nav-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="nav-label">{item}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="connection-card connection-card-button"
          onClick={() => setActive("Paramètres")}
          aria-label="Configurer le transporteur dans Paramètres"
        >
          <span className="live-dot" />
          <div>
            <strong>Transporteur</strong>
            <small>{carrierNames.length > 1 ? `${carrierNames.length} agences configurées` : carrierNames[0] || "Configurer les agences"}</small>
          </div>
        </button>
        <div className="profile">
          <span className="avatar">{data.access.displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{data.access.displayName}</strong>
            <small>{roleLabel}</small>
          </div>
          <button className="logout-button" type="button" onClick={() => void logout()} aria-label="Se déconnecter">↗</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Pilotage Maison Jiya · MAD</p>
            <h1>{active}</h1>
          </div>
          {!['Assistant IA', 'Paramètres'].includes(active) && (
            <div className="top-actions">
              <button className="period-button">Toutes les données</button>
              <button className="primary-button" onClick={() => openEntry(active === "Produits" ? "product" : active === "Achats" ? "purchase" : active === "Publicités" ? "ad" : active === "Capital" ? "capital" : "order")}>
                <span>{data.access.canEdit ? "＋" : "🔒"}</span> {data.access.canEdit ? "Ajouter" : "Lecture seule"}
              </button>
            </div>
          )}
        </header>
        {!loading && (
          <section className={`edit-access-strip ${data.access.canEdit ? "unlocked" : "locked"}`} aria-label="Session et droits d’accès">
            <div>
              <span className="access-icon" aria-hidden="true">{data.access.canEdit ? "✓" : "🔒"}</span>
              <div>
                <strong>Session sécurisée · {roleLabel}</strong>
                <small>Connecté comme {data.access.displayName} (@{data.access.username}). {data.access.canEdit ? "Vous pouvez ajouter et modifier les données." : "Vous pouvez consulter les données sans les modifier."}</small>
              </div>
            </div>
            <button className="access-action" type="button" onClick={() => void logout()}>Se déconnecter</button>
          </section>
        )}
        {notice && (
          <div className="toast success-toast">
            <span>✓ {notice}</span>
          </div>
        )}
        {error && (
          <div className="toast error-toast">
            <span>{error}</span>
            <button onClick={() => void loadData()}>Réessayer</button>
          </div>
        )}
        {loading ? <Loading /> : <Page active={active} setActive={setActive} data={data} metrics={metrics} delivery={delivery} open={openEntry} edit={openOrder} print={printOrderSlip} remove={deleteOrder} editEntity={openEntity} removeEntity={deleteEntity} moveStock={openStock} countInventory={openInventory} submit={submit} />}
      </section>
      {modal && <EntryModal kind={modal} carrierNames={carrierNames} products={data.products} close={() => setModal(null)} submit={submit} />}
      {selectedOrder && <OrderModal order={selectedOrder} history={data.orderStatusHistory.filter((entry) => entry.orderId === selectedOrder.id)} carrierNames={carrierNames} close={() => setSelectedOrder(null)} print={() => printOrderSlip(selectedOrder)} submit={submit} />}
      {selectedEntity && <EntityModal selection={selectedEntity} close={() => setSelectedEntity(null)} submit={submit} />}
      {stockSelection && <StockMovementModal selection={stockSelection} close={() => setStockSelection(null)} submit={submit} />}
      {inventorySelection && <InventoryCountModal product={inventorySelection} close={() => setInventorySelection(null)} submit={submit} />}
      {printOrder && <PrintOrderSheet order={printOrder} />}
    </main>
  );
}

function AuthPage({ configured, onAuthenticated }: { configured: boolean; onAuthenticated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    if (!configured && password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: configured ? "login" : "bootstrap",
          username: formData.get("username"),
          displayName: formData.get("displayName"),
          password,
          confirmation,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Connexion impossible.");
      form.reset();
      onAuthenticated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connexion impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-shell theme-mauve-froid">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maison-jiya-logo.jpeg" alt="Logo Maison Jiya" />
          </span>
          <div><strong>Maison Jiya</strong><small>Pilotage</small></div>
        </div>
        <div className="auth-heading">
          <span className="card-kicker">Espace sécurisé</span>
          <h1>{configured ? "Bon retour parmi nous" : "Créer le compte principal"}</h1>
          <p>{configured ? "Connectez-vous avec le nom d’utilisateur et le mot de passe remis par l’administrateur." : "Cette première étape crée votre compte administrateur. Vos partenaires pourront ensuite avoir leurs propres accès."}</p>
        </div>
        <form className="auth-form" onSubmit={(event) => void authenticate(event)}>
          {!configured && (
            <label>
              <span>Nom affiché</span>
              <input name="displayName" type="text" defaultValue="Maison Jiya" minLength={2} maxLength={80} required autoComplete="name" />
            </label>
          )}
          <label>
            <span>Nom d’utilisateur</span>
            <input name="username" type="text" defaultValue={configured ? "" : "Maison Jiya"} minLength={2} maxLength={50} required autoComplete="username" autoCapitalize="none" />
          </label>
          <label>
            <span>Mot de passe</span>
            <input name="password" type="password" minLength={9} maxLength={128} required autoComplete={configured ? "current-password" : "new-password"} />
            {!configured && <small>Minimum 9 caractères, avec au moins une lettre et un chiffre.</small>}
          </label>
          {!configured && (
            <label>
              <span>Confirmer le mot de passe</span>
              <input name="confirmation" type="password" minLength={9} maxLength={128} required autoComplete="new-password" />
            </label>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Vérification…" : configured ? "Se connecter" : "Créer mon compte sécurisé"}</button>
        </form>
        <p className="auth-security-note">Session sécurisée pendant 12 heures · 5 essais maximum · aucun compte ChatGPT requis</p>
      </section>
      <aside className="auth-showcase" aria-hidden="true">
        <span>MAISON JIYA · MAD</span>
        <h2>Toute votre activité, dans un espace simple et protégé.</h2>
        <div className="auth-benefits"><i>Commandes</i><i>Stock</i><i>Capital</i><i>Assistant IA</i><i>Partenaires</i></div>
      </aside>
    </main>
  );
}

function Loading() {
  return (
    <div className="loading-state">
      <span />
      <p>Préparation de votre espace de pilotage…</p>
    </div>
  );
}

function Page({
  active,
  setActive,
  data,
  metrics,
  delivery,
  open,
  edit,
  print,
  remove,
  editEntity,
  removeEntity,
  moveStock,
  countInventory,
  submit,
}: {
  active: string;
  setActive: (v: string) => void;
  data: Data;
  metrics: {
    revenue: number;
    shippingFees: number;
    collectionFees: number;
    netCollected: number;
    profit: number;
    losses: number;
    adSpend: number;
    roas: number;
    cash: number;
    capitalNet: number;
    margin: number;
    reinvest: number;
  };
  delivery: { label: string; value: number; tone: string }[];
  open: (m: ModalName) => void;
  edit: (o: Order) => void;
  print: (o: Order) => void;
  remove: (o: Order) => void;
  editEntity: (selection: EditableEntity) => void;
  removeEntity: (selection: EditableEntity) => void;
  moveStock: (selection: StockSelection) => void;
  countInventory: (product: Product) => void;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  if (active === "Commandes") return <OrdersPage orders={data.orders} onAdd={() => open("order")} onEdit={edit} onPrint={print} onDelete={remove} />;
  if (active === "Produits") return <ProductsPage products={data.products} orders={data.orders} movements={data.stockMovements} inventoryCounts={data.inventoryCounts} onAdd={() => open("product")} onMove={moveStock} onCount={countInventory} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Colis") return <ShippingPage orders={data.orders} history={data.orderStatusHistory} settings={data.settings} onEdit={edit} onPrint={print} onDelete={remove} />;
  if (active === "Clients") return <CustomersPage customers={data.customers} orders={data.orders} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Achats") return <PurchasesPage purchases={data.purchases} onAdd={() => open("purchase")} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Publicités") return <AdsPage ads={data.ads} settings={data.settings} onAdd={() => open("ad")} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Capital") return <CapitalPage data={data} metrics={metrics} onAdd={() => open("capital")} onEdit={editEntity} onDelete={removeEntity} />;
  if (active === "Assistant IA") return <AiPage canEdit={data.access.canEdit} submit={submit} onOrderCreated={() => setActive("Commandes")} />;
  if (active === "Corbeille") return <TrashPage orders={data.trash} canRestore={data.access.isOwner} submit={submit} />;
  if (active === "Paramètres") return <SettingsPage currentTheme={safeTheme(data.settings.theme)} accountName={data.settings.account_name || "Maison Jiya"} accountEmail={data.settings.account_email || ""} carriers={parseCarrierNames(data.settings)} backupConfigured={data.settings.backup_configured === "true"} backupSheetUrl={data.settings.backup_sheet_url || ""} backupWebhookUrl={data.settings.backup_webhook_url || ""} backupWebhookConfigured={data.settings.backup_webhook_configured === "true"} senditApiConfigured={data.settings.sendit_api_configured === "true"} senditWebhookConfigured={data.settings.sendit_webhook_configured === "true"} forceLogApiConfigured={data.settings.forcelog_api_configured === "true"} carrierLastSyncAt={data.settings.carrier_last_sync_at || ""} access={data.access} members={data.members} auditLogs={data.auditLogs} backups={data.backups} submit={submit} />;
  const total = Math.max(1, data.orders.length);
  return (
    <>
      <section className="hero-grid">
        <article className="hero-card">
          <div className="hero-heading">
            <div>
              <p>Trésorerie estimée</p>
              <h2>{money(metrics.cash)}</h2>
            </div>
            <span className="trend positive">À piloter</span>
          </div>
          <div className="sparkline">
            {[31, 38, 34, 43, 49, 47, 55, 58, 64, 68, 72, 82].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="hero-foot">
            <span>
              Capital net <strong>{money(metrics.capitalNet)}</strong>
            </span>
            <span>
              Virements nets <strong>{money(metrics.netCollected)}</strong>
            </span>
            <span>
              Marge nette <strong>{metrics.margin.toFixed(1)}%</strong>
            </span>
          </div>
        </article>
        <article className="reinvest-card">
          <span className="card-kicker">Répartition automatique</span>
          <h2>{money(metrics.reinvest)}</h2>
          <p>Le capital positif disponible est réparti automatiquement : 50% réinvestissement, 30% salaire et 20% fonds d’urgence.</p>
          <div className="allocation-bar">
            <span className="stock" />
            <span className="ads" />
            <span className="reserve" />
          </div>
          <div className="allocation-legend">
            <span>
              <i className="stock-dot" />
              Réinvestir 50%
            </span>
            <span>
              <i className="ads-dot" />
              Salaire 30%
            </span>
            <span>
              <i className="reserve-dot" />
              Urgence 20%
            </span>
          </div>
        </article>
      </section>
      <section className="kpi-grid">
        <Kpi label="CA encaissé" value={money(metrics.revenue)} detail={`Transport et frais déduits : ${money(metrics.shippingFees + metrics.collectionFees)}`} />
        <Kpi label="Bénéfice net estimé" value={money(metrics.profit)} detail="CA − coûts réels" />
        <Kpi label="Dépenses Meta saisies" value={money(metrics.adSpend)} detail={`ROAS · ${metrics.roas.toFixed(2)}×`} />
        <Kpi label="Pertes & retours" value={money(metrics.losses)} detail="Coûts déclarés" danger />
      </section>
      <section className="content-grid">
        <article className="panel orders-panel">
          <PanelHead kicker="Opérations" title="Commandes récentes" action="Voir tout →" onClick={() => setActive("Commandes")} />
          <OrderTable orders={data.orders.slice(0, 5)} onEdit={edit} onPrint={print} onDelete={remove} />
        </article>
        <article className="panel delivery-panel">
          <PanelHead kicker="Livraison" title="État des colis" total={String(data.orders.length)} />
          <div className="delivery-list">
            {delivery.map((r) => (
              <div className="delivery-row" key={r.label}>
                <div>
                  <span>{r.label}</span>
                  <strong>{r.value}</strong>
                </div>
                <div className="progress">
                  <span className={r.tone} style={{ width: `${(r.value / total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <button className="secondary-button" onClick={() => setActive("Colis")}>
            Ouvrir le suivi colis
          </button>
        </article>
      </section>
    </>
  );
}

function SettingsPage({ currentTheme, accountName, accountEmail, carriers, backupConfigured, backupSheetUrl, backupWebhookUrl, backupWebhookConfigured, senditApiConfigured, senditWebhookConfigured, forceLogApiConfigured, carrierLastSyncAt, access, members, auditLogs, backups, submit }: {
  currentTheme: ThemeKey;
  accountName: string;
  accountEmail: string;
  carriers: string[];
  backupConfigured: boolean;
  backupSheetUrl: string;
  backupWebhookUrl: string;
  backupWebhookConfigured: boolean;
  senditApiConfigured: boolean;
  senditWebhookConfigured: boolean;
  forceLogApiConfigured: boolean;
  carrierLastSyncAt: string;
  access: Data["access"];
  members: Member[];
  auditLogs: AuditLog[];
  backups: DailyBackup[];
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [pendingTheme, setPendingTheme] = useState<ThemeKey | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [savingFullBackup, setSavingFullBackup] = useState(false);
  const [backupToken, setBackupToken] = useState("");
  const [copyState, setCopyState] = useState("");
  const selectedTheme = themeOptions.find((theme) => theme.key === currentTheme) || themeOptions[0];

  async function applyTheme(theme: ThemeKey) {
    if (!access.canEdit || theme === currentTheme || pendingTheme) return;
    setPendingTheme(theme);
    try {
      await submit("updateSetting", { key: "theme", value: theme });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setPendingTheme(null);
    }
  }

  async function addCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCarrier || !access.isOwner) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const carrierName = String(formData.get("carrierName") || "").trim();
    setSavingCarrier(true);
    try {
      await submit("updateCarriers", {
        carriers: JSON.stringify([...carriers, carrierName]),
      });
      form.reset();
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingCarrier(false);
    }
  }

  async function generateBackupToken() {
    if (savingBackup || !access.isOwner) return;
    if (backupConfigured && !window.confirm("Créer une nouvelle clé ?\n\nL’ancienne clé ne fonctionnera plus et devra être remplacée dans Google Sheets.")) return;
    const token = createBackupToken();
    setSavingBackup(true);
    setCopyState("");
    try {
      await submit("updateBackupToken", { token });
      setBackupToken(token);
    } catch {
      setBackupToken("");
    } finally {
      setSavingBackup(false);
    }
  }

  async function copyBackupToken() {
    if (!backupToken) return;
    try {
      await navigator.clipboard.writeText(backupToken);
      setCopyState("Clé copiée");
    } catch {
      setCopyState("Sélectionnez puis copiez la clé");
    }
  }

  async function revokeBackupToken() {
    if (savingBackup || !access.isOwner || !backupConfigured) return;
    if (!window.confirm("Désactiver la sauvegarde Google Sheets ?\n\nLe classeur gardera les données déjà copiées, mais les prochaines synchronisations seront bloquées.")) return;
    setSavingBackup(true);
    try {
      await submit("revokeBackupToken", {});
      setBackupToken("");
      setCopyState("");
    } finally {
      setSavingBackup(false);
    }
  }

  async function saveBackupWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingWebhook || !access.isOwner) return;
    const formData = new FormData(event.currentTarget);
    setSavingWebhook(true);
    try {
      await submit("updateBackupWebhook", { url: formData.get("webhookUrl") || "" });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingWebhook(false);
    }
  }

  async function createFullBackup() {
    if (savingFullBackup || !access.isOwner) return;
    setSavingFullBackup(true);
    try {
      await submit("createBackupNow", {});
    } finally {
      setSavingFullBackup(false);
    }
  }

  async function restoreFullBackup(backup: DailyBackup) {
    if (savingFullBackup || !access.isOwner) return;
    const confirmed = window.confirm(
      `Restaurer la sauvegarde du ${dateLabel(backup.createdAt)} ?\n\nLes données commerciales actuelles seront remplacées par cette copie. Une sauvegarde de sécurité sera créée juste avant. Les comptes et mots de passe ne seront pas modifiés.`,
    );
    if (!confirmed) return;
    setSavingFullBackup(true);
    try {
      await submit("restoreBackup", { backupId: String(backup.id) });
    } finally {
      setSavingFullBackup(false);
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAccount || !access.canEdit || !access.isOwner) return;
    const formData = new FormData(event.currentTarget);
    setSavingAccount(true);
    try {
      await submit("updateAccountSettings", {
        accountName: formData.get("accountName") || "",
        accountEmail: formData.get("accountEmail") || "",
        displayName: formData.get("displayName") || "",
        username: formData.get("username") || "",
      });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingAccount(false);
    }
  }

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingMember || !access.isOwner) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    const confirmationInput = form.elements.namedItem("confirmation") as HTMLInputElement | null;
    if (password !== confirmation) {
      confirmationInput?.setCustomValidity("Les deux mots de passe ne correspondent pas.");
      confirmationInput?.reportValidity();
      return;
    }
    confirmationInput?.setCustomValidity("");
    setSavingMember(true);
    try {
      await submit("createMember", {
        displayName: formData.get("displayName") || "",
        username: formData.get("username") || "",
        role: formData.get("role") || "viewer",
        password,
      });
      form.reset();
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSavingMember(false);
    }
  }

  return (
    <div className="settings-page">
      <section className="settings-intro">
        <div>
          <span className="card-kicker">Personnalisation</span>
          <h2>Choisissez l’ambiance de Maison Jiya</h2>
          <p>Le thème sélectionné s’applique à toute la plateforme et reste enregistré pour vos prochaines connexions.</p>
        </div>
        <div className="current-theme-badge">
          <span>Thème actuel</span>
          <strong>{selectedTheme.name}</strong>
          <small>{selectedTheme.mode}</small>
        </div>
      </section>

      <section className="settings-panel carrier-settings-panel" id="carrier">
        <div className="carrier-settings-head">
          <div className="carrier-settings-copy">
            <span className="carrier-settings-icon" aria-hidden="true">T</span>
            <div>
              <span className="card-kicker">Livraison</span>
              <h2>Agences de transport</h2>
              <p>Ajoutez toutes les agences utilisées par Maison Jiya, puis choisissez l’agence lors de chaque commande.</p>
            </div>
          </div>
          <span className="carrier-count">{carriers.length} agence{carriers.length > 1 ? "s" : ""}</span>
        </div>
        <div className="carrier-management-grid">
          <form className="carrier-settings-form" onSubmit={(event) => void addCarrier(event)}>
            <label>
              <span>Ajouter une agence</span>
              <input name="carrierName" type="text" minLength={2} maxLength={80} required placeholder="Ex. Cathedis, Ozon Express…" disabled={!access.isOwner} />
              <small>Vous pourrez la sélectionner dans chaque nouvelle commande.</small>
            </label>
            <button className="primary-button" type="submit" disabled={savingCarrier || !access.isOwner}>
              {savingCarrier ? "Ajout…" : "＋ Ajouter l’agence"}
            </button>
            {!access.isOwner && <p>Seul l’administrateur peut gérer les agences.</p>}
          </form>
          <div className="carrier-agency-list">
            {carriers.length ? carriers.map((carrier) => (
              <CarrierAgencyRow key={carrier} name={carrier} carriers={carriers} canEdit={access.isOwner} submit={submit} />
            )) : (
              <div className="carrier-empty"><strong>Aucune agence enregistrée</strong><small>Ajoutez votre première agence avec le formulaire.</small></div>
            )}
          </div>
        </div>
        <div className="carrier-api-grid">
          <article className={`carrier-api-card ${senditApiConfigured && senditWebhookConfigured ? "active" : ""}`}>
            <div><span className="carrier-api-logo">S</span><div><strong>Sendit automatique</strong><small>{senditApiConfigured ? "Création des colis prête" : "Clés API à ajouter dans Cloudflare"}</small></div></div>
            <span className={`backup-status ${senditApiConfigured && senditWebhookConfigured ? "active" : ""}`}>{senditApiConfigured && senditWebhookConfigured ? "Connecté" : "À terminer"}</span>
            <ul>
              <li className={senditApiConfigured ? "done" : ""}>Tarif comparé depuis Casablanca avant votre choix</li>
              <li className={senditApiConfigured ? "done" : ""}>Création uniquement après « Autoriser et créer le colis »</li>
              <li className={senditWebhookConfigured ? "done" : ""}>Statuts reçus automatiquement et signature vérifiée</li>
            </ul>
            <label><span>URL à mettre dans le webhook Sendit</span><input readOnly value="https://maison-jiya-site.maisonjya1.workers.dev/api/integrations/sendit/webhook" onFocus={(event) => event.currentTarget.select()} /></label>
            <small>Événement : Mise à jour du statut du colis. Choisissez la même clé API que celle utilisée pour l’intégration.</small>
          </article>
          <article className={`carrier-api-card ${forceLogApiConfigured ? "active" : ""}`}>
            <div><span className="carrier-api-logo">F</span><div><strong>ForceLog automatique</strong><small>{forceLogApiConfigured ? "Création des colis prête" : "Clé API à ajouter dans Cloudflare"}</small></div></div>
            <span className={`backup-status ${forceLogApiConfigured ? "active" : ""}`}>{forceLogApiConfigured ? "Connecté" : "À terminer"}</span>
            <ul>
              <li className={forceLogApiConfigured ? "done" : ""}>Tarif comparé depuis Casablanca avant votre choix</li>
              <li className={forceLogApiConfigured ? "done" : ""}>Création uniquement après votre autorisation</li>
              <li>Suivi et paiement vérifiés automatiquement toutes les 30 minutes</li>
            </ul>
            <small>La clé reste chiffrée dans Cloudflare et n’apparaît jamais dans le site ni dans Google Sheets.</small>
          </article>
        </div>
        <div className="carrier-sync-actions">
          {carrierLastSyncAt && <p className="carrier-sync-stamp">Dernier événement agence reçu : {dateTimeLabel(carrierLastSyncAt)}</p>}
          {access.isOwner && <button type="button" className="secondary-button" onClick={() => void submit("syncCarriersNow", {})}>Actualiser suivi et facturation</button>}
        </div>
      </section>

      <section className="settings-panel sheets-backup-panel" id="google-sheets">
        <div className="sheets-backup-head">
          <div className="sheets-backup-title">
            <span className="sheets-backup-icon" aria-hidden="true">▦</span>
            <div>
              <span className="card-kicker">Sauvegarde indépendante</span>
              <h2>Google Sheets automatique</h2>
              <p>Les données sont copiées dans des onglets séparés et restent enregistrées dans le classeur, même si le site devient indisponible.</p>
            </div>
          </div>
          <span className={`backup-status ${backupConfigured ? "active" : ""}`}>{backupConfigured ? "Clé active" : "À configurer"}</span>
        </div>

        <div className="sheets-backup-grid">
          <div className="backup-key-card">
            <span className="card-kicker">1 · Connexion sécurisée</span>
            <h3>{backupConfigured ? "La sauvegarde est autorisée" : "Générez votre clé privée"}</h3>
            <p>La clé n’est jamais stockée en clair dans le site. Elle est affichée uniquement au moment de sa création.</p>
            {backupToken && (
              <div className="backup-token-box">
                <label><span>Votre nouvelle clé privée</span><input value={backupToken} readOnly onFocus={(event) => event.currentTarget.select()} /></label>
                <button className="secondary-button" type="button" onClick={() => void copyBackupToken()}>{copyState || "Copier la clé"}</button>
                <small>Collez maintenant cette clé dans l’onglet Configuration, cellule B6. Si vous la perdez, générez-en une nouvelle.</small>
              </div>
            )}
            <div className="backup-actions">
              <button className="primary-button" type="button" onClick={() => void generateBackupToken()} disabled={savingBackup || !access.isOwner}>
                {savingBackup ? "Préparation…" : backupConfigured ? "Régénérer la clé" : "Générer la clé privée"}
              </button>
              {backupConfigured && <button className="danger-text-button" type="button" onClick={() => void revokeBackupToken()} disabled={savingBackup || !access.isOwner}>Désactiver</button>}
            </div>
            {!access.isOwner && <small>Seul l’administrateur peut gérer la clé de sauvegarde.</small>}
          </div>

          <div className="backup-steps-card">
            <span className="card-kicker">2 · Classeur préparé</span>
            <h3>Sauvegarde Maison Jiya</h3>
            <ol>
              <li><span>1</span><p><strong>Ouvrez le classeur</strong><small>Tous les onglets et le code de synchronisation sont déjà préparés.</small></p></li>
              <li><span>2</span><p><strong>Collez la clé dans Configuration!B6</strong><small>Gardez cette clé privée et ne la partagez pas avec vos partenaires.</small></p></li>
              <li><span>3</span><p><strong>Suivez l’onglet Installation</strong><small>Autorisez Google une seule fois. Le déclencheur périodique restera actif comme sauvegarde de secours.</small></p></li>
            </ol>
            <a className="primary-button backup-sheet-link" href={backupSheetUrl} target="_blank" rel="noreferrer">Ouvrir le Google Sheet ↗</a>
          </div>

          <form className="backup-key-card" onSubmit={(event) => void saveBackupWebhook(event)}>
            <span className="card-kicker">3 · Synchronisation instantanée</span>
            <h3>{backupWebhookConfigured ? "Connexion immédiate active" : "Connectez le Web App Apps Script"}</h3>
            <p>L’adresse Apps Script est conservée côté serveur et n’est jamais envoyée aux comptes partenaires. Après chaque enregistrement, le serveur demande immédiatement la mise à jour du classeur.</p>
            <label>
              <span>URL du Web App Apps Script</span>
              <input
                name="webhookUrl"
                type="url"
                defaultValue={backupWebhookUrl}
                placeholder="https://script.google.com/macros/s/…/exec"
                required
                disabled={!access.isOwner}
              />
              <small>Gardez cette adresse privée. Le déclencheur périodique reste actif si Google est momentanément indisponible.</small>
            </label>
            <button className="primary-button" type="submit" disabled={savingWebhook || !access.isOwner}>
              {savingWebhook ? "Connexion…" : backupWebhookConfigured ? "Mettre à jour la connexion" : "Activer la synchronisation immédiate"}
            </button>
            {!access.isOwner && <small>Seul l’administrateur peut connecter Apps Script.</small>}
          </form>
        </div>

        <div className="backup-privacy-note">
          <strong>Données protégées</strong>
          <span>Les mots de passe, les clés de session et les codes de sécurité ne sont jamais exportés. Les partenaires apparaissent seulement avec leur nom, leur rôle et l’état du compte.</span>
        </div>
      </section>

      <section className="settings-panel continuity-panel" id="backups">
        <div className="continuity-head">
          <div>
            <span className="card-kicker">Continuité des données</span>
            <h2>Sauvegardes quotidiennes restaurables</h2>
            <p>Une copie complète des données commerciales est créée chaque jour et conservée pendant 90 jours. Les comptes, mots de passe et clés privées restent séparés.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => void createFullBackup()} disabled={savingFullBackup || !access.isOwner}>
            {savingFullBackup ? "Préparation…" : "＋ Sauvegarder maintenant"}
          </button>
        </div>
        {access.isOwner ? (
          <div className="backup-history-list">
            {backups.length ? backups.slice(0, 12).map((backup) => (
              <article className="backup-history-row" key={backup.id}>
                <span className="backup-history-icon" aria-hidden="true">↻</span>
                <div>
                  <strong>{dateTimeLabel(backup.createdAt)}</strong>
                  <small>{backup.reason} · {backup.recordCount.toLocaleString("fr-MA")} enregistrements</small>
                </div>
                <button className="secondary-button" type="button" onClick={() => void restoreFullBackup(backup)} disabled={savingFullBackup}>Restaurer</button>
              </article>
            )) : <div className="empty-state"><strong>Première sauvegarde en préparation</strong><p>Elle apparaîtra ici après l’actualisation de la page.</p></div>}
          </div>
        ) : <p className="settings-readonly-note">Seul l’administrateur peut consulter et restaurer les sauvegardes.</p>}
      </section>

      <section className="settings-panel audit-panel" id="audit">
        <div className="continuity-head">
          <div>
            <span className="card-kicker">Traçabilité</span>
            <h2>Journal des actions</h2>
            <p>Le compte utilisé, l’action et l’heure sont enregistrés automatiquement pour chaque modification.</p>
          </div>
          <span className="backup-status active">{auditLogs.length} actions récentes</span>
        </div>
        {access.isOwner ? (
          <div className="audit-list">
            {auditLogs.length ? auditLogs.slice(0, 30).map((entry) => (
              <article className="audit-row" key={entry.id}>
                <span className="audit-avatar">{entry.displayName.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{entry.displayName}</strong>
                  <small>{entry.action} · {entry.entityType}{entry.entityLabel ? ` · ${entry.entityLabel}` : entry.entityId ? ` #${entry.entityId}` : ""}</small>
                </div>
                <time dateTime={entry.createdAt}>{dateTimeLabel(entry.createdAt)}</time>
              </article>
            )) : <div className="empty-state"><strong>Aucune action enregistrée</strong><p>Les prochaines modifications apparaîtront ici.</p></div>}
          </div>
        ) : <p className="settings-readonly-note">Le journal détaillé est réservé à l’administrateur.</p>}
      </section>

      <section className="settings-panel security-settings-panel" id="security">
        <div className="security-overview">
          <span className="security-shield active" aria-hidden="true">✓</span>
          <div>
            <span className="card-kicker">Accès et sécurité</span>
            <h2>Comptes partenaires sécurisés</h2>
            <p>Chaque personne se connecte avec son propre nom d’utilisateur et son propre mot de passe. Aucun compte ChatGPT ni adresse e-mail n’est nécessaire.</p>
            <div className="security-badges">
              <span>Mot de passe haché et salé</span>
              <span>5 essais maximum</span>
              <span>Session 12 heures</span>
            </div>
          </div>
        </div>

        <div className="security-forms">
          {access.isOwner ? (
            <form className="security-form member-create-form" onSubmit={(event) => void createMember(event)}>
              <div>
                <strong>Ajouter un partenaire</strong>
                <small>Choisissez exactement ce que cette personne pourra faire.</small>
              </div>
              <div className="member-create-grid">
                <label><span>Nom affiché</span><input name="displayName" type="text" minLength={2} maxLength={80} required placeholder="Ex. Salma" /></label>
                <label><span>Nom d’utilisateur</span><input name="username" type="text" minLength={2} maxLength={50} required autoCapitalize="none" placeholder="Ex. salma" /></label>
                <label>
                  <span>Rôle</span>
                  <select name="role" defaultValue="editor">
                    <option value="editor">Éditeur — peut ajouter et modifier</option>
                    <option value="viewer">Lecture seule — peut seulement consulter</option>
                    <option value="admin">Administrateur — gère aussi les accès</option>
                  </select>
                </label>
                <label><span>Mot de passe</span><input name="password" type="password" minLength={9} maxLength={128} required autoComplete="new-password" /></label>
                <label><span>Confirmer</span><input name="confirmation" type="password" minLength={9} maxLength={128} required autoComplete="new-password" onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
              </div>
              <small className="password-rule">Au moins 9 caractères, avec une lettre et un chiffre.</small>
              <button className="primary-button" type="submit" disabled={savingMember}>{savingMember ? "Création…" : "Créer le compte partenaire"}</button>
            </form>
          ) : (
            <div className="owner-security-note">
              <strong>Votre rôle : {access.role === "editor" ? "Éditeur" : "Lecture seule"}</strong>
              <p>Seul un administrateur peut créer des partenaires, modifier leurs rôles ou remplacer leurs mots de passe.</p>
            </div>
          )}
        </div>
      </section>

      {access.isOwner && (
        <section className="settings-panel members-panel">
          <div className="settings-panel-head">
            <div><span className="card-kicker">Équipe</span><h2>{members.length} compte{members.length > 1 ? "s" : ""}</h2></div>
            <p>Les mots de passe ne sont jamais affichés. Vous pouvez seulement les remplacer.</p>
          </div>
          <div className="member-list">
            {members.map((member) => <MemberCard key={member.id} member={member} currentUsername={access.username} submit={submit} />)}
          </div>
        </section>
      )}

      <section className="settings-panel account-settings-panel">
        <div className="account-identity">
          <span className="account-logo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maison-jiya-logo.jpeg" alt="Logo Maison Jiya" />
          </span>
          <div>
            <span className="card-kicker">Compte principal</span>
            <h2>{accountName}</h2>
            <p>{accountEmail || "E-mail privé à configurer"}</p>
      <small>Profil principal affiché dans la plateforme</small>
          </div>
        </div>
        <form className="account-settings-form" key={`${accountName}-${accountEmail}-${access.username}-${access.displayName}`} onSubmit={(event) => void saveAccount(event)}>
          <label>
            <span>Nom de la marque</span>
            <input name="accountName" type="text" minLength={2} maxLength={80} defaultValue={accountName} required autoComplete="organization" disabled={!access.canEdit || !access.isOwner} />
          </label>
          <label>
            <span>Adresse e-mail principale</span>
            <input name="accountEmail" type="email" maxLength={254} defaultValue={accountEmail} required autoComplete="email" disabled={!access.canEdit || !access.isOwner} />
          </label>
          <label>
            <span>Nom affiché du compte principal</span>
            <input name="displayName" type="text" minLength={2} maxLength={80} defaultValue={access.displayName} required autoComplete="name" disabled={!access.isOwner} />
          </label>
          <label>
            <span>Nom d’utilisateur de connexion</span>
            <input name="username" type="text" minLength={2} maxLength={50} defaultValue={access.username} required autoComplete="username" autoCapitalize="none" disabled={!access.isOwner} />
          </label>
          <div className="account-form-footer">
            <p>Ces informations sont modifiables uniquement par un administrateur. Si vous changez le nom d’utilisateur de connexion, utilisez le nouveau nom dès la prochaine session.</p>
            <button className="primary-button" type="submit" disabled={savingAccount || !access.canEdit || !access.isOwner}>{savingAccount ? "Enregistrement…" : "Enregistrer le compte"}</button>
          </div>
        </form>
      </section>

      <section className="settings-panel">
        <div className="settings-panel-head">
          <div>
            <span className="card-kicker">Couleurs de l’interface</span>
            <h2>5 thèmes disponibles</h2>
          </div>
          <p>Vous pouvez changer de thème à tout moment.</p>
        </div>
        <div className="theme-grid" role="radiogroup" aria-label="Choisir le thème de la plateforme">
          {themeOptions.map((theme) => {
            const selected = currentTheme === theme.key;
            const pending = pendingTheme === theme.key;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`theme-choice ${selected ? "selected" : ""}`}
                key={theme.key}
                disabled={!access.canEdit || Boolean(pendingTheme)}
                onClick={() => void applyTheme(theme.key)}
              >
                <span className={`theme-mini-preview preview-${theme.key}`} aria-hidden="true">
                  <i className="preview-sidebar">MJ</i>
                  <i className="preview-content">
                    <b />
                    <em />
                    <small />
                  </i>
                </span>
                <span className="theme-choice-copy">
                  <span className="theme-choice-title">
                    <strong>{theme.name}</strong>
                    <small>{theme.mode}</small>
                  </span>
                  <span className="theme-description">{theme.description}</span>
                  <span className="theme-swatches" aria-hidden="true">
                    {theme.colors.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                  </span>
                </span>
                <span className="theme-state">{pending ? "Application…" : selected ? "✓ Actif" : "Choisir"}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function CarrierAgencyRow({ name, carriers, canEdit, submit }: {
  name: string;
  carriers: string[];
  canEdit: boolean;
  submit: (action: string, values: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function renameCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    const formData = new FormData(event.currentTarget);
    const nextName = String(formData.get("carrierName") || "").trim();
    setSaving(true);
    try {
      await submit("updateCarriers", {
        carriers: JSON.stringify(carriers.map((carrier) => carrier === name ? nextName : carrier)),
        renameFrom: name,
        renameTo: nextName,
      });
      setEditing(false);
    } catch {
      setSaving(false);
    }
  }

  async function removeCarrier() {
    if (!canEdit || saving || !window.confirm(`Supprimer l’agence « ${name} » de la liste ?\n\nLes anciennes commandes garderont le nom de cette agence.`)) return;
    setSaving(true);
    try {
      await submit("updateCarriers", {
        carriers: JSON.stringify(carriers.filter((carrier) => carrier !== name)),
      });
    } catch {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <form className="carrier-agency-edit" onSubmit={(event) => void renameCarrier(event)}>
        <label><span>Nouveau nom</span><input name="carrierName" type="text" minLength={2} maxLength={80} defaultValue={name} required autoFocus /></label>
        <div><button type="button" className="cancel-button" onClick={() => setEditing(false)}>Annuler</button><button className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
      </form>
    );
  }

  return (
    <article className="carrier-agency-card">
      <span className="carrier-agency-mark" aria-hidden="true">T</span>
      <div><strong>{name}</strong><small>Disponible dans les commandes</small></div>
      {canEdit && <RecordActions label={`l’agence ${name}`} onEdit={() => setEditing(true)} onDelete={() => void removeCarrier()} />}
    </article>
  );
}

function MemberCard({ member, currentUsername, submit }: {
  member: Member;
  currentUsername: string;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const isCurrent = member.username === currentUsername;

  async function updateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || isCurrent) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const activeInput = form.elements.namedItem("isActive") as HTMLInputElement | null;
    setSaving(true);
    try {
      await submit("updateMember", {
        memberId: String(member.id),
        role: formData.get("role") || member.role,
        isActive: activeInput?.checked ? "true" : "false",
      });
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetting || isCurrent) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    const confirmationInput = form.elements.namedItem("confirmation") as HTMLInputElement | null;
    if (password !== confirmation) {
      confirmationInput?.setCustomValidity("Les deux mots de passe ne correspondent pas.");
      confirmationInput?.reportValidity();
      return;
    }
    confirmationInput?.setCustomValidity("");
    setResetting(true);
    try {
      await submit("resetMemberPassword", { memberId: String(member.id), password, confirmation });
      form.reset();
    } catch {
      // Le message d’erreur global est affiché par le tableau de bord.
    } finally {
      setResetting(false);
    }
  }

  const roleLabel = member.role === "admin" ? "Administrateur" : member.role === "editor" ? "Éditeur" : "Lecture seule";
  return (
    <article className={`member-card ${member.isActive ? "" : "inactive"}`}>
      <div className="member-card-head">
        <span className="member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span>
        <div><strong>{member.displayName}</strong><small>@{member.username} · {roleLabel}{isCurrent ? " · Vous" : ""}</small></div>
        <span className={`member-status ${member.isActive ? "active" : ""}`}>{member.isActive ? "Actif" : "Suspendu"}</span>
      </div>
      <form className="member-rights-form" onSubmit={(event) => void updateMember(event)}>
        <label><span>Rôle</span><select name="role" defaultValue={member.role} disabled={isCurrent}><option value="admin">Administrateur</option><option value="editor">Éditeur</option><option value="viewer">Lecture seule</option></select></label>
        <label className="member-active-toggle"><input name="isActive" type="checkbox" defaultChecked={member.isActive} disabled={isCurrent} /><span>Compte actif</span></label>
        <button className="secondary-button" type="submit" disabled={saving || isCurrent}>{saving ? "Mise à jour…" : isCurrent ? "Compte principal" : "Enregistrer les droits"}</button>
      </form>
      {!isCurrent && (
        <form className="member-password-form" onSubmit={(event) => void resetPassword(event)}>
          <label><span>Nouveau mot de passe</span><input name="password" type="password" minLength={9} maxLength={128} required autoComplete="new-password" /></label>
          <label><span>Confirmer</span><input name="confirmation" type="password" minLength={9} maxLength={128} required autoComplete="new-password" onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
          <button className="secondary-button" type="submit" disabled={resetting}>{resetting ? "Remplacement…" : "Remplacer le mot de passe"}</button>
        </form>
      )}
    </article>
  );
}

function Kpi({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <article>
      <p>{label}</p>
      <h3>{value}</h3>
      <small className={danger ? "down" : "up"}>{detail}</small>
    </article>
  );
}
function PanelHead({ kicker, title, action, onClick, total }: { kicker: string; title: string; action?: string; onClick?: () => void; total?: string }) {
  return (
    <div className="panel-head">
      <div>
        <span className="card-kicker">{kicker}</span>
        <h2>{title}</h2>
      </div>
      {action ? <button onClick={onClick}>{action}</button> : <span className="panel-total">{total}</span>}
    </div>
  );
}
function OrderActions({ order, onEdit, onPrint, onDelete }: { order: Order; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  return (
    <details className="order-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <summary aria-label={`Actions pour la commande ${order.orderRef}`} title="Actions">
        ⋯
      </summary>
      <div className="order-action-menu" role="menu">
        <button type="button" role="menuitem" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onEdit(order);
        }}>
          <span aria-hidden="true">✎</span>
          Modifier la commande
        </button>
        <button type="button" role="menuitem" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onPrint(order);
        }}>
          <span aria-hidden="true">▣</span>
          Imprimer le bordereau
        </button>
        <button type="button" role="menuitem" className="danger" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onDelete(order);
        }}>
          <span aria-hidden="true">⌫</span>
          Supprimer
        </button>
      </div>
    </details>
  );
}
function RecordActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <details className="order-actions record-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <summary aria-label={`Actions pour ${label}`} title="Actions">⋯</summary>
      <div className="order-action-menu" role="menu">
        <button type="button" role="menuitem" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onEdit();
        }}>
          <span aria-hidden="true">✎</span>
          Modifier
        </button>
        <button type="button" role="menuitem" className="danger" onClick={(event) => {
          event.currentTarget.closest("details")?.removeAttribute("open");
          onDelete();
        }}>
          <span aria-hidden="true">⌫</span>
          Supprimer
        </button>
      </div>
    </details>
  );
}
function TrashPage({ orders, canRestore, submit }: { orders: Order[]; canRestore: boolean; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [renderedAt] = useState(() => Date.now());
  async function restore(order: Order) {
    if (!canRestore) return;
    if (!window.confirm(`Restaurer la commande ${order.orderRef} ?\n\nElle réapparaîtra dans Commandes et Colis.`)) return;
    await submit("restoreOrder", { id: String(order.id) });
  }

  return (
    <section className="panel page-panel trash-page">
      <div className="section-toolbar">
        <div>
          <span className="card-kicker">Conservation 90 jours</span>
          <h2>{orders.length} commande{orders.length > 1 ? "s" : ""} dans la corbeille</h2>
          <p>Une commande supprimée peut être restaurée. Après 90 jours, elle est effacée automatiquement.</p>
        </div>
      </div>
      {!canRestore ? (
        <div className="empty-state"><strong>Accès administrateur requis</strong><p>Seul le compte principal peut consulter et restaurer la corbeille.</p></div>
      ) : orders.length ? (
        <div className="trash-list">
          {orders.map((order) => {
            const deletedAt = order.deletedAt ? new Date(order.deletedAt) : new Date();
            const expiresAt = new Date(deletedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
            const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - renderedAt) / (24 * 60 * 60 * 1000)));
            return (
              <article className="trash-row" key={order.id}>
                <div>
                  <strong>{order.orderRef} · {order.customerName}</strong>
                  <small>{order.products} · {order.city} · supprimée le {dateLabel(deletedAt.toISOString())}</small>
                </div>
                <span className="trash-expiry">{daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}</span>
                <button className="secondary-button" type="button" onClick={() => void restore(order)}>↶ Restaurer</button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state"><strong>La corbeille est vide</strong><p>Les commandes supprimées apparaîtront ici pendant 90 jours.</p></div>
      )}
    </section>
  );
}
function OrdersPage({ orders, onAdd, onEdit, onPrint, onDelete }: { orders: Order[]; onAdd: () => void; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  return (
    <section className="panel page-panel">
      <div className="section-toolbar">
        <div>
          <h2>{orders.length} commandes</h2>
          <p>Utilisez le menu ⋯ pour modifier ou supprimer une commande saisie par erreur.</p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          ＋ Saisir une commande
        </button>
      </div>
      <OrderTable orders={orders} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
    </section>
  );
}
function OrderTable({ orders, onEdit, onPrint, onDelete }: { orders: Order[]; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  return (
    <>
      <div className="desktop-order-table table-scroll">
        <table>
          <thead>
            <tr>
              <th>Commande</th>
              <th>Cliente</th>
              <th>Ville</th>
              <th>Vente</th>
              <th>Gain estimé</th>
              <th>Statut</th>
              <th className="order-actions-heading">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const gain = o.saleAmount - o.productCost - o.shippingCost - o.adCost - o.fees - o.returnCost;
              return (
                <tr key={o.id} className="clickable-row" onClick={() => onEdit(o)}>
                  <td>
                    <strong>{o.orderRef}</strong>
                    <small>{dateLabel(o.createdAt)}</small>
                  </td>
                  <td>
                    {o.customerName}
                    <small>{o.products} · {o.source}</small>
                  </td>
                  <td>{o.city}</td>
                  <td><strong>{money(o.saleAmount)}</strong></td>
                  <td className={gain >= 0 ? "money-positive" : "money-negative"}>{money(gain)}</td>
                  <td><Status value={o.status} /></td>
                  <td className="order-actions-cell">
                    <OrderActions order={o} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mobile-order-list">
        {orders.map((o) => {
          const gain = o.saleAmount - o.productCost - o.shippingCost - o.adCost - o.fees - o.returnCost;
          return (
            <article key={o.id} className="mobile-order-card" role="button" tabIndex={0} aria-label={`Ouvrir la commande ${o.orderRef}`} onClick={() => onEdit(o)} onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onEdit(o);
              }
            }}>
              <div className="mobile-order-top">
                <span>
                  <strong>{o.orderRef}</strong>
                  <small>{dateLabel(o.createdAt)} · {o.source}</small>
                </span>
                <div className="mobile-order-status">
                  <Status value={o.status} />
                  <OrderActions order={o} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
                </div>
              </div>
              <div className="mobile-order-client">
                <strong>{o.customerName}</strong>
                <small>{o.city} · {o.products}</small>
              </div>
              <div className="mobile-order-money">
                <span>Vente <strong>{money(o.saleAmount)}</strong></span>
                <span>Gain <strong className={gain >= 0 ? "money-positive" : "money-negative"}>{money(gain)}</strong></span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
function carrierTrackingPortal(carrier: string) {
  const normalized = carrier.toLocaleLowerCase("fr").replace(/\s+/g, "");
  if (normalized.includes("forcelog")) return { label: "Suivre sur ForceLog", url: "https://forcelog.ma/suivi-de-colis/" };
  if (normalized.includes("sendit")) return { label: "Ouvrir l’espace Sendit", url: "https://app.sendit.ma/deliveries" };
  return null;
}

function elapsedDays(from: string, to = new Date().toISOString()) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 86_400_000)) : 0;
}

function ShippingPage({ orders, history, settings, onEdit, onPrint, onDelete }: { orders: Order[]; history: OrderStatusHistory[]; settings: Record<string, string>; onEdit: (o: Order) => void; onPrint: (o: Order) => void; onDelete: (o: Order) => void }) {
  const carrierNames = useMemo(() => parseCarrierNames(settings), [settings]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [query, setQuery] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("Toutes");
  const [statusFilter, setStatusFilter] = useState("Tous");
  const [manifestCarrier, setManifestCarrier] = useState(carrierNames[0] || "");
  const effectiveManifestCarrier = carrierNames.includes(manifestCarrier) ? manifestCarrier : carrierNames[0] || "";
  const [manifestDate, setManifestDate] = useState(today);
  const [manifestToPrint, setManifestToPrint] = useState<{ carrier: string; date: string; orders: Order[] } | null>(null);
  const historyByOrder = useMemo(() => {
    const grouped = new Map<number, OrderStatusHistory[]>();
    history.forEach((entry) => grouped.set(entry.orderId, [...(grouped.get(entry.orderId) || []), entry]));
    grouped.forEach((entries) => entries.sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime()));
    return grouped;
  }, [history]);
  useEffect(() => {
    const clearManifest = () => setManifestToPrint(null);
    window.addEventListener("afterprint", clearManifest);
    return () => window.removeEventListener("afterprint", clearManifest);
  }, []);

  const carrierComparison = carrierNames.map((carrier) => {
    const assigned = orders.filter((order) => order.carrier.toLocaleLowerCase("fr") === carrier.toLocaleLowerCase("fr"));
    const delivered = assigned.filter((order) => order.status === "Livrée");
    const returned = assigned.filter((order) => order.status === "Retour");
    const completed = delivered.length + returned.length;
    const deliveryDays = delivered.map((order) => {
      const deliveredEntry = (historyByOrder.get(order.id) || []).find((entry) => entry.toStatus === "Livrée");
      return elapsedDays(order.createdAt, deliveredEntry?.changedAt || order.updatedAt || order.createdAt);
    });
    return {
      carrier,
      assigned: assigned.length,
      delivered: delivered.length,
      returned: returned.length,
      active: assigned.filter((order) => ["Confirmée", "Expédiée", "En livraison"].includes(order.status)).length,
      successRate: completed ? (delivered.length / completed) * 100 : 0,
      averageDelay: deliveryDays.length ? deliveryDays.reduce((sum, value) => sum + value, 0) / deliveryDays.length : null,
      averageCost: assigned.length ? assigned.reduce((sum, order) => sum + order.shippingCost, 0) / assigned.length : 0,
      completed,
    };
  });
  const rankedCarriers = carrierComparison.filter((row) => row.completed > 0).sort((left, right) => right.successRate - left.successRate || (left.averageDelay ?? 999) - (right.averageDelay ?? 999));
  const bestCarrier = rankedCarriers[0]?.carrier || "";

  const trackingRows = orders.map((order) => {
    const latestHistory = historyByOrder.get(order.id)?.[0];
    const age = elapsedDays(latestHistory?.changedAt || order.updatedAt || order.createdAt);
    const needsTrackingNumber = ["Expédiée", "En livraison", "Livrée"].includes(order.status) && !order.trackingNumber;
    const delayed = (["Confirmée"].includes(order.status) && age >= 2) || (["Expédiée", "En livraison"].includes(order.status) && age >= 4);
    return { order, age, needsTrackingNumber, delayed, alert: needsTrackingNumber || delayed };
  }).filter(({ order }) => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    const matchesQuery = !normalizedQuery || [order.orderRef, order.trackingNumber, order.customerName || "", order.city].some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery));
    const matchesCarrier = carrierFilter === "Toutes" || order.carrier === carrierFilter;
    const matchesStatus = statusFilter === "Tous" || order.status === statusFilter;
    return matchesQuery && matchesCarrier && matchesStatus;
  }).sort((left, right) => Number(right.alert) - Number(left.alert) || new Date(right.order.createdAt).getTime() - new Date(left.order.createdAt).getTime());
  const alertCount = trackingRows.filter((row) => row.alert).length;
  const manifestOrders = orders.filter((order) => order.carrier === effectiveManifestCarrier && ["Confirmée", "Expédiée", "En livraison"].includes(order.status));

  function printManifest() {
    if (!effectiveManifestCarrier || manifestOrders.length === 0) return;
    setManifestToPrint({ carrier: effectiveManifestCarrier, date: manifestDate, orders: manifestOrders });
    window.setTimeout(() => window.print(), 80);
  }
  return (
    <>
      <section className="integration-banner">
        <div>
          <span className="live-dot" />
          <div>
            <strong>{carrierNames.length ? `${carrierNames.length} agence${carrierNames.length > 1 ? "s" : ""} disponible${carrierNames.length > 1 ? "s" : ""}` : "Agences de livraison"}</strong>
            <p>{carrierNames.length ? carrierNames.join(" · ") : "Aucune agence configurée. Ajoutez vos agences dans Paramètres."}</p>
          </div>
        </div>
        <Status value={carrierNames.length ? "Configuré" : "À configurer"} />
      </section>
      <section className="carrier-comparison-grid" aria-label="Comparaison des agences de livraison">
        {carrierComparison.map((row) => (
          <article className={`carrier-performance-card ${row.carrier === bestCarrier ? "best" : ""}`} key={row.carrier}>
            <div className="carrier-performance-head">
              <div><span>Agence</span><h2>{row.carrier}</h2></div>
              {row.carrier === bestCarrier ? <strong>Meilleur taux</strong> : <small>{row.completed ? "Données disponibles" : "À mesurer"}</small>}
            </div>
            <div className="carrier-performance-stats">
              <p><span>Taux livré</span><strong>{row.completed ? `${row.successRate.toFixed(1)} %` : "—"}</strong></p>
              <p><span>Délai moyen</span><strong>{row.averageDelay === null ? "—" : `${row.averageDelay.toFixed(1)} j`}</strong></p>
              <p><span>Coût moyen</span><strong>{row.assigned ? money(row.averageCost) : "—"}</strong></p>
            </div>
            <footer><span>{row.delivered} livré(s)</span><span>{row.returned} retour(s)</span><span>{row.active} en cours</span></footer>
          </article>
        ))}
        {carrierComparison.length === 0 && <article className="panel carrier-empty-card"><strong>Ajoutez une agence dans Paramètres</strong><p>La comparaison commencera dès que des commandes lui seront affectées.</p></article>}
      </section>
      <section className="panel carrier-manifest-panel">
        <div className="manifest-copy"><span className="card-kicker">Préparation agence</span><h2>Manifeste quotidien</h2><p>Le document regroupe les colis confirmés ou en cours pour l’agence choisie. Il peut être imprimé et remis au transporteur.</p></div>
        <div className="manifest-controls">
          <label><span>Agence</span><select value={effectiveManifestCarrier} onChange={(event) => setManifestCarrier(event.target.value)}>{carrierNames.map((carrier) => <option key={carrier}>{carrier}</option>)}</select></label>
          <label><span>Date du manifeste</span><input type="date" value={manifestDate} onChange={(event) => setManifestDate(event.target.value)} /></label>
          <button className="primary-button" type="button" disabled={!effectiveManifestCarrier || manifestOrders.length === 0} onClick={printManifest}>▣ Imprimer · {manifestOrders.length} colis</button>
        </div>
      </section>
      <section className="panel page-panel shipping-tracking-panel">
        <div className="shipping-tracking-head">
          <div><span className="card-kicker">Paiement à la livraison</span><h2>Suivi opérationnel des colis</h2><p>Statuts du site, retards détectés et accès au portail officiel de l’agence.</p></div>
          <span className={`tracking-alert-total ${alertCount ? "active" : ""}`}>{alertCount} alerte{alertCount === 1 ? "" : "s"}</span>
        </div>
        <div className="shipping-filters">
          <label><span>Rechercher</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Commande, cliente ou suivi" /></label>
          <label><span>Agence</span><select value={carrierFilter} onChange={(event) => setCarrierFilter(event.target.value)}><option>Toutes</option>{carrierNames.map((carrier) => <option key={carrier}>{carrier}</option>)}</select></label>
          <label><span>Statut</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Tous</option>{orderStatusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
        </div>
        <div className="card-list">
          {trackingRows.map(({ order: o, age, delayed, needsTrackingNumber }) => {
            const portal = carrierTrackingPortal(o.carrier);
            return (
            <article className={`shipment-card ${delayed || needsTrackingNumber ? "needs-attention" : ""}`} key={o.id} role="button" tabIndex={0} onClick={() => onEdit(o)} onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onEdit(o);
              }
            }}>
              <div>
                <strong>{o.orderRef}</strong>
                <small>{o.customerName} · {o.city} · {o.source}</small>
              </div>
              <div>
                <strong>{o.trackingNumber || "Sans numéro"}</strong>
                <small>{o.carrier}</small>
                {portal && <a className="carrier-tracking-link" href={portal.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{portal.label} ↗</a>}
              </div>
              <div>
                <Status value={o.status} />
                <small>{o.paymentStatus} · statut depuis {age} j</small>
                {needsTrackingNumber && <span className="shipment-alert">Numéro manquant</span>}
                {delayed && <span className="shipment-alert">Délai à vérifier</span>}
              </div>
              <div className="shipment-actions">
                <OrderActions order={o} onEdit={onEdit} onPrint={onPrint} onDelete={onDelete} />
              </div>
            </article>
          );})}
          {trackingRows.length === 0 && <EmptyState title="Aucun colis trouvé" text="Modifiez les filtres ou ajoutez une commande." />}
        </div>
        <p className="tracking-source-note">Sendit met à jour automatiquement les statuts dès que son webhook sécurisé est connecté. Les commandes confirmées sont envoyées automatiquement à Sendit ou ForceLog lorsque leurs clés Cloudflare sont actives.</p>
      </section>
      {manifestToPrint && <CarrierManifestSheet manifest={manifestToPrint} />}
    </>
  );
}

function CarrierManifestSheet({ manifest }: { manifest: { carrier: string; date: string; orders: Order[] } }) {
  const total = manifest.orders.reduce((sum, order) => sum + order.saleAmount, 0);
  return (
    <section className="print-carrier-manifest" aria-label={`Manifeste ${manifest.carrier}`}>
      <header className="manifest-print-header">
        <div><strong>Maison Jiya</strong><span>Manifeste de remise des colis</span></div>
        <div><small>Agence</small><strong>{manifest.carrier}</strong><span>{dateLabel(`${manifest.date}T12:00:00`)}</span></div>
      </header>
      <div className="manifest-print-summary"><p><span>Nombre de colis</span><strong>{manifest.orders.length}</strong></p><p><span>Montant COD total</span><strong>{money(total)}</strong></p></div>
      <table>
        <thead><tr><th>#</th><th>Commande</th><th>Cliente</th><th>Téléphone</th><th>Ville</th><th>Produit</th><th>Suivi</th><th>COD</th><th>Statut</th></tr></thead>
        <tbody>{manifest.orders.map((order, index) => <tr key={order.id}><td>{index + 1}</td><td>{order.orderRef}</td><td>{order.customerName}</td><td>{order.phone}</td><td>{order.city}</td><td>{order.products} × {order.quantity}</td><td>{order.trackingNumber || "À compléter"}</td><td>{money(order.saleAmount)}</td><td>{order.status}</td></tr>)}</tbody>
      </table>
      <footer><div><span>Remis par Maison Jiya</span></div><div><span>Reçu par {manifest.carrier}</span></div></footer>
    </section>
  );
}
function CustomersPage({ customers, orders, onEdit, onDelete }: { customers: Customer[]; orders: Order[]; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void }) {
  return (
    <section className="panel page-panel">
      <PanelHead kicker="CRM" title="Fichier clients" total={String(customers.length)} />
      <div className="customer-grid">
        {customers.map((c) => {
          const own = orders.filter((o) => o.customerId === c.id),
            spent = own.filter((o) => o.paymentStatus === "Encaissé").reduce((sum, o) => sum + o.saleAmount, 0);
          return (
            <article className="customer-card" key={c.id}>
              <span className="customer-avatar">{c.name.slice(0, 1)}</span>
              <div>
                <strong>{c.name}</strong>
                <p>{c.phone} · {c.city}</p>
                <small>{own.length} commande(s) · {money(spent)} encaissé</small>
              </div>
              <RecordActions label={`le client ${c.name}`} onEdit={() => onEdit({ kind: "customer", record: c })} onDelete={() => onDelete({ kind: "customer", record: c })} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
function ProductsPage({ products, orders, movements, inventoryCounts, onAdd, onMove, onCount, onEdit, onDelete }: { products: Product[]; orders: Order[]; movements: StockMovement[]; inventoryCounts: InventoryCount[]; onAdd: () => void; onMove: (selection: StockSelection) => void; onCount: (product: Product) => void; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void }) {
  const units = products.reduce((sum, product) => sum + product.stockQuantity, 0),
    purchaseValue = products.reduce((sum, product) => sum + product.stockQuantity * product.purchasePrice, 0),
    saleValue = products.reduce((sum, product) => sum + product.stockQuantity * product.salePrice, 0),
    lowStock = products.filter((product) => product.stockQuantity <= 5).length;
  const profitability = products.map((product) => {
    const productOrders = orders.filter((order) => order.productId === product.id);
    const delivered = productOrders.filter((order) => order.status === "Livrée");
    const revenue = delivered.reduce((sum, order) => sum + order.saleAmount, 0);
    const operatingCosts = delivered.reduce((sum, order) => sum + order.productCost + order.shippingCost + order.adCost + order.fees, 0);
    const returnCosts = productOrders.reduce((sum, order) => sum + order.returnCost, 0);
    const costs = operatingCosts + returnCosts;
    const profit = revenue - costs;
    return {
      product,
      deliveredUnits: delivered.reduce((sum, order) => sum + order.quantity, 0),
      revenue,
      costs,
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
    };
  }).sort((left, right) => right.profit - left.profit);
  return (
    <>
      <section className="kpi-grid stock-kpis">
        <Kpi label="Produits" value={String(products.length)} detail={`${lowStock} stock(s) faible(s)`} />
        <Kpi label="Unités restantes" value={String(units)} detail="Stock disponible" />
        <Kpi label="Valeur d’achat" value={money(purchaseValue)} detail="Au prix d’achat" />
        <Kpi label="Valeur de vente" value={money(saleValue)} detail="Potentiel du stock" />
      </section>
      <section className="panel product-profit-panel">
        <PanelHead kicker="Rentabilité" title="Bénéfice par produit" total={money(profitability.reduce((sum, row) => sum + row.profit, 0))} />
        <p className="profitability-note">Calcul automatique sur les commandes livrées, selon les coûts saisis : produit, livraison, publicité, frais et retours.</p>
        {products.length === 0 ? (
          <EmptyState title="Aucune rentabilité à calculer" text="Ajoutez un produit puis rattachez-le à vos commandes." />
        ) : (
          <div className="table-scroll profitability-table">
            <table>
              <thead><tr><th>Produit</th><th>Unités livrées</th><th>CA livré</th><th>Coûts</th><th>Bénéfice net</th><th>Marge</th></tr></thead>
              <tbody>
                {profitability.map((row) => (
                  <tr key={row.product.id}>
                    <td><strong>{row.product.name}</strong><small>{row.product.productCode}</small></td>
                    <td>{row.deliveredUnits}</td>
                    <td>{money(row.revenue)}</td>
                    <td>{money(row.costs)}</td>
                    <td className={moneyTone(row.profit)}><strong>{money(row.profit)}</strong></td>
                    <td><span className={`margin-chip ${row.margin < 0 ? "negative" : row.margin > 0 ? "positive" : "neutral"}`}>{row.margin.toFixed(1)} %</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel page-panel products-panel">
        <div className="section-toolbar">
          <div><h2>Catalogue & stock</h2><p>Les commandes confirmées déduisent le stock. Utilisez « Sortie » seulement pour une correction manuelle.</p></div>
          <button className="primary-button" onClick={onAdd}>＋ Ajouter un produit</button>
        </div>
        {products.length === 0 ? (
          <EmptyState title="Aucun produit" text="Ajoutez votre premier produit pour commencer le suivi du stock." />
        ) : (
          <>
            <div className="desktop-product-table table-scroll">
              <table>
                <thead><tr><th>ID produit</th><th>Produit</th><th>Catégorie</th><th>Achat</th><th>Vente</th><th>Restant</th><th>Actions</th></tr></thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td><strong>{product.productCode}</strong></td>
                      <td>{product.name}</td>
                      <td><span className="category-chip">{product.category}</span></td>
                      <td>{money(product.purchasePrice)}</td>
                      <td><strong>{money(product.salePrice)}</strong></td>
                      <td><StockLevel quantity={product.stockQuantity} /></td>
                      <td>
                        <div className="entity-actions-row">
                          <div className="stock-actions">
                            <button className="stock-in" onClick={() => onMove({ product, type: "Entrée" })}>＋ Stock</button>
                            <button className="stock-out" disabled={product.stockQuantity === 0} onClick={() => onMove({ product, type: "Vente" })}>− Sortie</button>
                            <button className="inventory-button" onClick={() => onCount(product)}>≋ Inventaire</button>
                          </div>
                          <RecordActions label={`le produit ${product.name}`} onEdit={() => onEdit({ kind: "product", record: product })} onDelete={() => onDelete({ kind: "product", record: product })} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-product-list">
              {products.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-card-head">
                    <div><span>{product.productCode}</span><h3>{product.name}</h3></div>
                    <div className="product-card-actions">
                      <StockLevel quantity={product.stockQuantity} />
                      <RecordActions label={`le produit ${product.name}`} onEdit={() => onEdit({ kind: "product", record: product })} onDelete={() => onDelete({ kind: "product", record: product })} />
                    </div>
                  </div>
                  <span className="category-chip">{product.category}</span>
                  <div className="product-prices">
                    <p>Prix d’achat<strong>{money(product.purchasePrice)}</strong></p>
                    <p>Prix de vente<strong>{money(product.salePrice)}</strong></p>
                  </div>
                  <div className="stock-actions">
                    <button className="stock-in" onClick={() => onMove({ product, type: "Entrée" })}>＋ Ajouter du stock</button>
                    <button className="stock-out" disabled={product.stockQuantity === 0} onClick={() => onMove({ product, type: "Vente" })}>− Sortie manuelle</button>
                    <button className="inventory-button" onClick={() => onCount(product)}>≋ Faire l’inventaire</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <section className="panel stock-history">
        <PanelHead kicker="Historique" title="Derniers mouvements" total={String(movements.length)} />
        {movements.length === 0 ? (
          <EmptyState title="Aucun mouvement" text="Les entrées et les ventes apparaîtront ici." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Produit</th><th>Mouvement</th><th>Quantité</th><th>Note</th><th>Actions</th></tr></thead>
              <tbody>
                {movements.slice(0, 12).map((movement) => (
                  <tr key={movement.id}>
                    <td>{dateLabel(movement.createdAt)}</td>
                    <td><strong>{movement.productName}</strong><small>{movement.productCode}</small></td>
                    <td><Status value={movement.movementType} /></td>
                    <td className={["Entrée", "Réintégration", "Inventaire +"].includes(movement.movementType) ? "money-positive" : "money-negative"}>{["Entrée", "Réintégration", "Inventaire +"].includes(movement.movementType) ? "+" : "−"}{movement.quantity}</td>
                    <td>{movement.note || "—"}</td>
                    <td className="order-actions-cell">
                      {movement.orderId || movement.movementType.startsWith("Inventaire") ? <span className="automatic-movement">{movement.orderId ? "Automatique" : "Inventaire"}</span> : <RecordActions label="ce mouvement de stock" onEdit={() => onEdit({ kind: "movement", record: movement })} onDelete={() => onDelete({ kind: "movement", record: movement })} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel inventory-history-panel">
        <PanelHead kicker="Contrôle physique" title="Historique des inventaires" total={String(inventoryCounts.length)} />
        {inventoryCounts.length === 0 ? (
          <EmptyState title="Aucun inventaire enregistré" text="Cliquez sur « Inventaire » près d’un produit pour comparer le stock physique au stock du site." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Référence</th><th>Produit</th><th>Stock site</th><th>Stock physique</th><th>Écart</th><th>Compté par</th><th>Note</th></tr></thead>
              <tbody>
                {inventoryCounts.slice(0, 20).map((count) => (
                  <tr key={count.id}>
                    <td>{dateTimeLabel(count.createdAt)}</td>
                    <td><strong>{count.countRef}</strong></td>
                    <td><strong>{count.productName}</strong><small>{count.productCode}</small></td>
                    <td>{count.systemQuantity}</td>
                    <td>{count.physicalQuantity}</td>
                    <td className={count.difference > 0 ? "money-positive" : count.difference < 0 ? "money-negative" : ""}><strong>{count.difference > 0 ? "+" : ""}{count.difference}</strong></td>
                    <td>{count.countedByName}</td>
                    <td>{count.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function StockLevel({ quantity }: { quantity: number }) {
  return (
    <span className={`stock-level ${quantity === 0 ? "empty" : quantity <= 5 ? "low" : "ok"}`}>
      <strong>{quantity}</strong> unité{quantity === 1 ? "" : "s"}
      <small>{quantity === 0 ? "Rupture" : quantity <= 5 ? "Stock faible" : "Disponible"}</small>
    </span>
  );
}
function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
function PurchasesPage({ purchases, onAdd, onEdit, onDelete }: { purchases: Purchase[]; onAdd: () => void; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void }) {
  const total = purchases.reduce((sum, purchase) => sum + purchase.totalCost, 0);
  return (
    <>
      <section className="kpi-grid three">
        <Kpi label="Total achats" value={money(total)} detail={`${purchases.length} opérations`} />
        <Kpi label="Achats payés" value={money(purchases.filter((purchase) => purchase.paymentStatus === "Payé").reduce((sum, purchase) => sum + purchase.totalCost, 0))} detail="Sorties confirmées" />
        <Kpi label="Reste à payer" value={money(purchases.filter((purchase) => purchase.paymentStatus !== "Payé").reduce((sum, purchase) => sum + purchase.totalCost, 0))} detail="À surveiller" danger />
      </section>
      <section className="panel page-panel">
        <div className="section-toolbar">
          <div><h2>Achats fournisseurs</h2><p>Stock, tissu, emballages et autres coûts.</p></div>
          <button className="primary-button" onClick={onAdd}>＋ Ajouter un achat</button>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Fournisseur</th><th>Achat</th><th>Qté</th><th>Total</th><th>Paiement</th><th>Actions</th></tr></thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{dateLabel(purchase.createdAt)}</td>
                  <td><strong>{purchase.supplier}</strong></td>
                  <td>{purchase.item}</td>
                  <td>{purchase.quantity}</td>
                  <td><strong>{money(purchase.totalCost)}</strong></td>
                  <td><Status value={purchase.paymentStatus} /></td>
                  <td className="order-actions-cell"><RecordActions label={`l’achat ${purchase.item}`} onEdit={() => onEdit({ kind: "purchase", record: purchase })} onDelete={() => onDelete({ kind: "purchase", record: purchase })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function AdsPage({ ads, settings, onAdd, onEdit, onDelete }: { ads: Ad[]; settings: Record<string, string>; onAdd: () => void; onEdit: (selection: EditableEntity) => void; onDelete: (selection: EditableEntity) => void }) {
  const spend = ads.reduce((sum, ad) => sum + ad.spend, 0),
    revenue = ads.reduce((sum, ad) => sum + ad.revenue, 0),
    count = ads.reduce((sum, ad) => sum + ad.orderCount, 0);
  return (
    <>
      <section className="integration-banner">
        <div><span className="meta-mark">M</span><div><strong>Meta Ads</strong><p>Saisie manuelle active. La connexion automatique nécessitera l’autorisation de votre compte Meta Ads.</p></div></div>
        <Status value={settings.meta_status || "À connecter"} />
      </section>
      <section className="kpi-grid three">
        <Kpi label="Dépenses" value={money(spend)} detail="Données saisies" />
        <Kpi label="CA attribué" value={money(revenue)} detail={`${count} commandes`} />
        <Kpi label="ROAS" value={`${spend ? (revenue / spend).toFixed(2) : "0.00"}×`} detail="CA attribué ÷ dépenses" />
      </section>
      <section className="panel page-panel">
        <div className="section-toolbar">
          <div><h2>Performance des campagnes</h2><p>Ces résultats sont manuels jusqu’à la connexion Meta.</p></div>
          <button className="primary-button" onClick={onAdd}>＋ Saisir une campagne</button>
        </div>
        <div className="ad-grid">
          {ads.map((ad) => (
            <article className="ad-card" key={ad.id}>
              <div className="ad-card-heading">
                <div><span>{ad.platform}</span><h3>{ad.campaign}</h3></div>
                <RecordActions label={`la campagne ${ad.campaign}`} onEdit={() => onEdit({ kind: "ad", record: ad })} onDelete={() => onDelete({ kind: "ad", record: ad })} />
              </div>
              <div>
                <p>Dépenses<strong>{money(ad.spend)}</strong></p>
                <p>CA attribué<strong>{money(ad.revenue)}</strong></p>
                <p>ROAS<strong>{ad.spend ? (ad.revenue / ad.spend).toFixed(2) : "0"}×</strong></p>
              </div>
              <small>{ad.source} · {dateLabel(ad.performanceDate)}</small>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
function CapitalPage({
  data,
  metrics,
  onAdd,
  onEdit,
  onDelete,
}: {
  data: Data;
  metrics: {
    cash: number;
    capitalNet: number;
    netCollected: number;
    reinvest: number;
  };
  onAdd: () => void;
  onEdit: (selection: EditableEntity) => void;
  onDelete: (selection: EditableEntity) => void;
}) {
  const currentYear = new Date().getFullYear();
  const distributableCapital = Math.max(0, metrics.cash);
  const personalSalary = Math.round(distributableCapital * 0.3);
  const emergencyFund = Math.max(0, distributableCapital - metrics.reinvest - personalSalary);
  const automatedFlows: CapitalFlow[] = [
    ...data.orders
      .filter((order) => order.paymentStatus === "Encaissé")
      .map((order) => ({
        direction: "Entrée" as const,
        source: `Ventes · ${order.source || "Non renseignée"}`,
        amount: Math.max(0, order.saleAmount - order.shippingCost),
        date: order.paidAt || order.createdAt,
      })),
    ...data.orders
      .filter((order) => order.paymentStatus === "Encaissé" && order.fees > 0)
      .map((order) => ({
        direction: "Sortie" as const,
        source: "Frais de commande",
        amount: order.fees,
        date: order.paidAt || order.createdAt,
      })),
    ...data.orders
      .filter((order) => order.returnCost > 0)
      .map((order) => ({
        direction: "Sortie" as const,
        source: "Retours déclarés",
        amount: order.returnCost,
        date: order.updatedAt || order.createdAt,
      })),
    ...data.purchases
      .filter((purchase) => purchase.paymentStatus === "Payé")
      .map((purchase) => ({
        direction: "Sortie" as const,
        source: "Achats fournisseurs",
        amount: purchase.totalCost,
        date: purchase.createdAt,
      })),
    ...data.ads
      .filter((ad) => ad.spend > 0)
      .map((ad) => ({
        direction: "Sortie" as const,
        source: "Publicités Meta",
        amount: ad.spend,
        date: ad.performanceDate,
      })),
  ];
  const manualFlows: CapitalFlow[] = data.capital.map((entry) => ({
    direction: entry.direction === "Entrée" ? "Entrée" : "Sortie",
    source: `Capital · ${entry.category || "Sans source"}`,
    amount: entry.amount,
    date: entry.entryDate,
  }));
  const flows = [...automatedFlows, ...manualFlows];
  const pendingOrders = data.orders.filter((order) => order.status === "Livrée" && order.paymentStatus === "À encaisser");
  const pendingBySource = Array.from(new Set(pendingOrders.map((order) => order.source || "Non renseignée")))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((source) => {
      const orders = pendingOrders.filter((order) => (order.source || "Non renseignée") === source);
      return {
        source,
        count: orders.length,
        amount: orders.reduce((sum, order) => sum + Math.max(0, order.saleAmount - order.shippingCost - order.fees), 0),
      };
    });
  const pendingTotal = pendingBySource.reduce((sum, row) => sum + row.amount, 0);
  const dataYears = Array.from(new Set(flows.map((flow) => Number(flow.date.slice(0, 4))).filter(Number.isFinite))).sort((a, b) => b - a);
  const yearOptions = Array.from(new Set([currentYear, ...dataYears])).sort((a, b) => b - a);
  const [selectedYear, setSelectedYear] = useState(() => dataYears[0] || currentYear);
  const annualEntries = flows.filter((flow) => Number(flow.date.slice(0, 4)) === selectedYear);
  const sources = Array.from(new Set(annualEntries.map((flow) => flow.source))).sort((a, b) => a.localeCompare(b, "fr"));
  const rows = capitalMonthLabels.map((month, index) => {
    const entries = annualEntries.filter((entry) => Number(entry.date.slice(5, 7)) === index + 1);
    const sourceValues = Object.fromEntries(sources.map((source) => [source, entries.filter((entry) => entry.source === source).reduce((sum, entry) => sum + (entry.direction === "Entrée" ? entry.amount : -entry.amount), 0)]));
    const inflow = entries.filter((entry) => entry.direction === "Entrée").reduce((sum, entry) => sum + entry.amount, 0);
    const outflow = entries.filter((entry) => entry.direction !== "Entrée").reduce((sum, entry) => sum + entry.amount, 0);
    return {
      month,
      monthShort: capitalMonthShort[index],
      sourceValues,
      inflow,
      outflow,
      net: inflow - outflow,
    };
  });
  const annualInflow = rows.reduce((sum, row) => sum + row.inflow, 0),
    annualOutflow = rows.reduce((sum, row) => sum + row.outflow, 0),
    annualNet = annualInflow - annualOutflow;
  return (
    <>
      <section className="capital-automation-banner">
        <div className="automation-copy">
          <span className="automation-icon">↻</span>
          <div>
            <strong>Automatisation active</strong>
            <p>Les mouvements sont calculés depuis vos commandes, achats, publicités et retours. Aucune double saisie n’est nécessaire.</p>
          </div>
        </div>
        <div className="automation-tags">
          <span>Ventes encaissées</span>
          <span>Achats payés</span>
          <span>Meta saisie</span>
          <span>Retours & frais</span>
        </div>
      </section>
      <section className="hero-grid">
        <article className="hero-card">
          <div className="hero-heading">
            <div>
              <p>Capital disponible estimé</p>
              <h2>{money(metrics.cash)}</h2>
              <small className="capital-main-note">Encaissements reçus − sorties confirmées</small>
            </div>
          </div>
          <div className="capital-summary">
            <p>
              Ventes encaissées nettes
              <strong>{money(metrics.netCollected)}</strong>
            </p>
            <p>
              Ajustements manuels<strong>{money(metrics.capitalNet)}</strong>
            </p>
            <p>
              Réinvestissement suggéré<strong>{money(metrics.reinvest)}</strong>
            </p>
          </div>
        </article>
        <article className="reinvest-card unallocated-card">
          <span className="card-kicker">Répartition automatique</span>
          <h2>100%</h2>
          <p>Chaque montant encaissé est réparti automatiquement entre vos trois enveloppes.</p>
          <small>{money(distributableCapital)} répartis</small>
        </article>
      </section>
      <section className="capital-envelope-section">
        <div className="capital-envelope-head">
          <span className="card-kicker">Répartition personnelle</span>
          <h2>Vos trois enveloppes</h2>
          <p>Le calcul se met à jour automatiquement dès que la trésorerie change. Ces enveloppes sont des montants conseillés pour piloter votre argent.</p>
        </div>
        <div className="capital-envelope-grid">
          <article className="capital-envelope-card reinvest-envelope">
            <span className="envelope-icon">↗</span>
            <span className="envelope-label">Montant de réinvestissement</span>
            <h3>{money(metrics.reinvest)}</h3>
            <p>50% du capital positif disponible pour le stock, les achats et la croissance.</p>
            <small>Automatique · 50%</small>
          </article>
          <article className="capital-envelope-card salary-envelope">
            <span className="envelope-icon">◎</span>
            <span className="envelope-label">Salaire personnel</span>
            <h3>{money(personalSalary)}</h3>
            <p>30% du capital positif disponible comme rémunération personnelle conseillée.</p>
            <small>Automatique · 30%</small>
          </article>
          <article className="capital-envelope-card emergency-envelope">
            <span className="envelope-icon">◇</span>
            <span className="envelope-label">Fonds d’urgence</span>
            <h3>{money(emergencyFund)}</h3>
            <p>20% du capital positif disponible conservé pour les imprévus et les périodes difficiles.</p>
            <small>Automatique · 20%</small>
          </article>
        </div>
      </section>
      <section className="panel capital-pending-panel">
        <PanelHead kicker="Paiement à la livraison" title="Ventes livrées à encaisser" total={money(pendingTotal)} />
        <p className="pending-explainer">Ces ventes apparaissent automatiquement ici dès qu’elles sont livrées. Elles entreront dans la trésorerie après le statut « Encaissé ».</p>
        {pendingBySource.length === 0 ? (
          <div className="pending-empty">Aucune vente livrée en attente de virement.</div>
        ) : (
          <div className="pending-source-grid">
            {pendingBySource.map((row) => (
              <article key={row.source}>
                <span>{row.source}</span>
                <strong>{money(row.amount)}</strong>
                <small>
                  {row.count} commande{row.count === 1 ? "" : "s"}
                </small>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="capital-analytics-head">
        <div>
          <span className="card-kicker">Analyse mensuelle automatique</span>
          <h2>Capital par source et par mois</h2>
          <p>Ventes encaissées nettes du transport, achats payés, publicités, retours et ajustements manuels.</p>
        </div>
        <label className="year-select">
          <span>Année</span>
          <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {yearOptions.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
      </section>
      <section className="kpi-grid three capital-year-kpis">
        <Kpi label={`Entrées ${selectedYear}`} value={money(annualInflow)} detail="Encaissements et apports" />
        <Kpi label={`Sorties ${selectedYear}`} value={money(annualOutflow)} detail="Dépenses confirmées" danger />
        <Kpi label={`Solde net ${selectedYear}`} value={money(annualNet)} detail="Entrées − sorties" danger={annualNet < 0} />
      </section>
      <section className="panel capital-chart-panel">
        <PanelHead kicker="Graphique" title={`Évolution mensuelle · ${selectedYear}`} total={`${sources.length} source${sources.length === 1 ? "" : "s"}`} />
        <MonthlyCapitalChart rows={rows} sources={sources} />
      </section>
      <section className="panel capital-table-panel">
        <PanelHead kicker="Tableau chiffré" title={`Détail des 12 mois · ${selectedYear}`} total={money(annualNet)} />
        <div className="table-scroll">
          <table className="capital-monthly-table">
            <thead>
              <tr>
                <th>Mois</th>
                {sources.map((source) => (
                  <th key={source}>{source}</th>
                ))}
                <th>Entrées</th>
                <th>Sorties</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <td>
                    <strong>{row.month}</strong>
                  </td>
                  {sources.map((source) => (
                    <td key={source} className={moneyTone(row.sourceValues[source])}>
                      {money(row.sourceValues[source])}
                    </td>
                  ))}
                  <td className={moneyTone(row.inflow)}>{money(row.inflow)}</td>
                  <td className={row.outflow > 0 ? "money-negative" : ""}>{money(row.outflow)}</td>
                  <td className={moneyTone(row.net)}>{money(row.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>Total annuel</strong>
                </td>
                {sources.map((source) => {
                  const total = rows.reduce((sum, row) => sum + row.sourceValues[source], 0);
                  return (
                    <td key={source} className={moneyTone(total)}>
                      <strong>{money(total)}</strong>
                    </td>
                  );
                })}
                <td className={moneyTone(annualInflow)}>
                  <strong>{money(annualInflow)}</strong>
                </td>
                <td className={annualOutflow > 0 ? "money-negative" : ""}>
                  <strong>{money(annualOutflow)}</strong>
                </td>
                <td className={moneyTone(annualNet)}>
                  <strong>{money(annualNet)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="panel page-panel capital-ledger-panel">
        <div className="section-toolbar">
          <div>
            <h2>Ajustements manuels</h2>
            <p>Réservé aux apports, retraits et mouvements qui ne viennent pas déjà des ventes, achats ou publicités.</p>
          </div>
          <button className="primary-button" onClick={onAdd}>
            ＋ Nouveau mouvement
          </button>
        </div>
        {data.capital.length === 0 ? (
          <EmptyState title="Aucun ajustement manuel" text="C’est normal : les opérations courantes alimentent automatiquement le capital." />
        ) : (
          <div className="ledger-list">
            {data.capital.map((r) => (
              <article key={r.id}>
                <span className={r.direction === "Entrée" ? "ledger-icon in" : "ledger-icon out"}>{r.direction === "Entrée" ? "↘" : "↗"}</span>
                <div>
                  <strong>{r.label}</strong>
                  <small>
                    {r.category} · {dateLabel(r.entryDate)}
                  </small>
                </div>
                <b className={r.direction === "Entrée" ? "money-positive" : "money-negative"}>
                  {r.direction === "Entrée" ? "+" : "−"}
                  {money(r.amount)}
                </b>
                <RecordActions label={`le mouvement ${r.label}`} onEdit={() => onEdit({ kind: "capital", record: r })} onDelete={() => onDelete({ kind: "capital", record: r })} />
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function MonthlyCapitalChart({
  rows,
  sources,
}: {
  rows: {
    month: string;
    monthShort: string;
    sourceValues: Record<string, number>;
    inflow: number;
    outflow: number;
    net: number;
  }[];
  sources: string[];
}) {
  if (sources.length === 0) return <EmptyState title="Aucune donnée pour cette année" text="Ajoutez un mouvement avec une date comprise dans l’année sélectionnée." />;
  const width = 920,
    height = 270,
    left = 62,
    right = 20,
    top = 22,
    bottom = 45,
    plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const maxAbs = Math.max(1, ...rows.flatMap((row) => sources.map((source) => Math.abs(row.sourceValues[source] || 0))));
  const x = (index: number) => left + (plotWidth * index) / (rows.length - 1);
  const y = (value: number) => top + plotHeight / 2 - (value / maxAbs) * (plotHeight / 2);
  const axisValues = [maxAbs, 0, -maxAbs];
  return (
    <div className="capital-chart-wrap">
      <div className="capital-chart-legend">
        {sources.map((source, index) => (
          <span key={source}>
            <i
              style={{
                background: capitalChartColors[index % capitalChartColors.length],
              }}
            />
            {source}
          </span>
        ))}
      </div>
      <svg className="capital-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Graphique du capital par source pour chaque mois">
        <title>Capital mensuel par source</title>
        {axisValues.map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className={value === 0 ? "chart-zero" : "chart-grid"} />
            <text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-value">
              {Math.round(value).toLocaleString("fr-MA")}
            </text>
          </g>
        ))}
        {rows.map((row, index) => (
          <text key={row.month} x={x(index)} y={height - 16} textAnchor="middle" className="chart-month">
            {row.monthShort}
          </text>
        ))}
        {sources.map((source, sourceIndex) => {
          const color = capitalChartColors[sourceIndex % capitalChartColors.length],
            points = rows.map((row, index) => `${x(index)},${y(row.sourceValues[source] || 0)}`).join(" ");
          return (
            <g key={source}>
              <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {rows.map((row, index) => (
                <circle key={row.month} cx={x(index)} cy={y(row.sourceValues[source] || 0)} r="4" fill={color} stroke="#fff" strokeWidth="2">
                  <title>
                    {row.month} · {source} : {money(row.sourceValues[source] || 0)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="chart-note">Valeurs positives : entrées · valeurs négatives : sorties · montants en MAD</p>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const tone = ["Livrée", "Encaissé", "Payé", "Connecté", "Configuré", "Entrée", "Réintégration"].includes(value) ? "success" : ["Retour", "Annulée", "Refusée", "Retournée", "Remboursé", "Non encaissé"].includes(value) ? "danger" : ["Expédiée", "En livraison", "Vente", "Commande"].includes(value) ? "info" : "warning";
  return <span className={`status ${tone}`}>{value}</span>;
}

function CarrierQuoteChooser({ city, defaultCarrier = "", defaultFee = 0, locked = false }: { city: string; defaultCarrier?: string; defaultFee?: number; locked?: boolean }) {
  const [result, setResult] = useState<CarrierQuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState(defaultCarrier);
  const [selectedFee, setSelectedFee] = useState(defaultFee);
  const [manuallySelected, setManuallySelected] = useState(false);

  useEffect(() => {
    const cleanCity = city.trim();
    if (cleanCity.length < 2 || locked) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/integrations/carriers/quote?city=${encodeURIComponent(cleanCity)}`, { signal: controller.signal });
        const body = (await response.json()) as CarrierQuoteResult & { error?: string };
        if (!response.ok) throw new Error(body.error || "Tarifs indisponibles.");
        setResult(body);
        if (!manuallySelected && body.recommendedCarrier) {
          const recommended = body.quotes.find((quote) => quote.carrier === body.recommendedCarrier);
          setSelectedCarrier(body.recommendedCarrier);
          if (recommended?.fee !== null && recommended?.fee !== undefined) setSelectedFee(recommended.fee);
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Tarifs indisponibles.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [city, locked, manuallySelected]);

  function choose(quote: CarrierQuote) {
    if (!quote.available || quote.fee === null || locked) return;
    setManuallySelected(true);
    setSelectedCarrier(quote.carrier);
    setSelectedFee(quote.fee);
  }

  return (
    <section className="carrier-quote-chooser">
      <input type="hidden" name="carrier" value={selectedCarrier || defaultCarrier || "Non affecté"} />
      <input type="hidden" name="shippingCost" value={String(selectedFee)} />
      <div className="carrier-quote-head">
        <div><strong>Comparer les agences</strong><small>Départ : Casablanca · aucune création de colis à cette étape</small></div>
        <span>{loading ? "Comparaison…" : result?.recommendedCarrier ? `${result.recommendedCarrier} recommandée` : "Saisissez la ville"}</span>
      </div>
      {result && (
        <div className="carrier-quote-grid">
          {result.quotes.map((quote) => {
            const recommended = result.recommendedCarrier === quote.carrier;
            const selected = selectedCarrier === quote.carrier;
            return (
              <button className={`${selected ? "selected" : ""} ${recommended ? "recommended" : ""}`} key={quote.carrier} type="button" onClick={() => choose(quote)} disabled={!quote.available || locked}>
                <span>{quote.carrier}{recommended ? " · moins chère" : ""}</span>
                <strong>{quote.fee === null ? "Indisponible" : money(quote.fee)}</strong>
                {quote.error && <small>{quote.error}</small>}
              </button>
            );
          })}
        </div>
      )}
      {error && <small className="carrier-quote-error">{error}</small>}
      {!result && !error && <small>Les tarifs Sendit et ForceLog apparaîtront automatiquement après la ville.</small>}
    </section>
  );
}

function EntryModal({ kind, carrierNames, products, close, submit }: { kind: Exclude<ModalName, null>; carrierNames: string[]; products: Product[]; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const labels = {
    order: "Nouvelle commande",
    purchase: "Nouvel achat",
    ad: "Performance Meta Ads",
    capital: "Mouvement de capital",
    product: "Nouveau produit",
  };
  const [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(products[0] ? String(products[0].id) : "");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderSaleAmount, setOrderSaleAmount] = useState(products[0] ? String(products[0].salePrice) : "");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState("En attente");
  const [orderCity, setOrderCity] = useState("");
  const selectedProduct = products.find((product) => String(product.id) === selectedProductId) || null;

  function selectOrderProduct(productId: string) {
    const product = products.find((item) => String(item.id) === productId);
    setSelectedProductId(productId);
    if (product) setOrderSaleAmount(String(product.salePrice * Math.max(1, Number(orderQuantity) || 1)));
  }

  function updateOrderQuantity(quantity: string) {
    setOrderQuantity(quantity);
    if (selectedProduct) setOrderSaleAmount(String(selectedProduct.salePrice * Math.max(1, Number(quantity) || 1)));
  }
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await submit(kind === "order" ? "addOrder" : kind === "product" ? "addProduct" : kind === "purchase" ? "addPurchase" : kind === "ad" ? "addAd" : "addCapital", Object.fromEntries(new FormData(e.currentTarget)));
    } catch (c) {
      setFormError(c instanceof Error ? c.message : "Erreur");
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="card-kicker">Saisie Maison Jiya</span>
            <h2>{labels[kind]}</h2>
            <p>Les champs marqués * sont obligatoires.</p>
          </div>
          <button onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <form onSubmit={handle}>
          <div className="form-grid">
            {kind === "product" && (
              <>
                <Field label="ID produit / SKU *" name="productCode" required />
                <Field label="Nom du produit *" name="name" required />
                <Select label="Catégorie *" name="category" options={productCategoryOptions} />
                <Field label="Quantité initiale *" name="initialQuantity" type="number" inputMode="numeric" defaultValue="0" min="0" required />
                <Field label="Prix d’achat (MAD) *" name="purchasePrice" type="number" inputMode="decimal" min="0" required />
                <Field label="Prix de vente (MAD) *" name="salePrice" type="number" inputMode="decimal" min="0" required />
              </>
            )}
            {kind === "order" && (
              <>
                <Field label="Nom de la cliente *" name="customerName" autoComplete="name" required />
                <Field label="Téléphone *" name="phone" type="tel" inputMode="tel" autoComplete="tel" required />
                <label className="field"><span>Ville *</span><input name="city" autoComplete="address-level2" value={orderCity} onChange={(event) => setOrderCity(event.target.value)} required /></label>
                <Field label="Adresse de livraison *" name="address" autoComplete="street-address" required />
                {products.length ? (
                  <label className="field order-product-select">
                    <span>Produit du catalogue *</span>
                    <select name="productId" value={selectedProductId} onChange={(event) => selectOrderProduct(event.target.value)} required>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>{product.productCode} · {product.name} · stock {product.stockQuantity}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="order-product-empty" role="alert">
                    <strong>Aucun produit disponible</strong>
                    <small>Fermez cette fenêtre, ouvrez Produits et ajoutez d’abord votre produit au catalogue.</small>
                  </div>
                )}
                <Select label="Source de la commande *" name="source" options={orderSourceOptions} />
                <label className="field">
                  <span>Statut de la commande</span>
                  <select name="status" value={selectedOrderStatus} onChange={(event) => setSelectedOrderStatus(event.target.value)}>
                    {orderStatusOptions.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                {selectedOrderStatus === "Retour" && (
                  <>
                    <label className="field">
                      <span>Motif du retour *</span>
                      <select name="returnReason" defaultValue="" required>
                        <option value="" disabled>Choisir un motif</option>
                        {returnReasonOptions.map((reason) => <option key={reason}>{reason}</option>)}
                      </select>
                    </label>
                    <label className="field return-note-field">
                      <span>Détail du retour</span>
                      <input name="returnNote" type="text" maxLength={240} placeholder="Précision utile, surtout si vous choisissez Autre" />
                    </label>
                  </>
                )}
                <label className="field"><span>Quantité *</span><input name="quantity" type="number" inputMode="numeric" min="1" value={orderQuantity} onChange={(event) => updateOrderQuantity(event.target.value)} required /></label>
                <label className="field"><span>Vente totale (MAD) *</span><input name="saleAmount" type="number" inputMode="decimal" min="0" value={orderSaleAmount} onChange={(event) => setOrderSaleAmount(event.target.value)} required /></label>
                {selectedProduct && (
                  <div className="order-product-summary">
                    <div><small>Stock disponible</small><strong>{selectedProduct.stockQuantity} unité{selectedProduct.stockQuantity === 1 ? "" : "s"}</strong></div>
                    <div><small>Coût automatique</small><strong>{money(selectedProduct.purchasePrice * Math.max(1, Number(orderQuantity) || 1))}</strong></div>
                    <p>Le stock sera déduit une seule fois dès que le statut devient « Confirmée ».</p>
                  </div>
                )}
                <Field label="Publicité attribuée (MAD)" name="adCost" type="number" inputMode="decimal" min="0" />
                <Field label="Autres frais (MAD)" name="fees" type="number" inputMode="decimal" min="0" />
                <CarrierQuoteChooser city={orderCity} defaultCarrier={carrierNames.find((carrier) => ["Sendit", "ForceLog"].includes(carrier)) || carrierNames[0]} />
                <div className="order-carrier-safety-note"><strong>Validation en deux étapes</strong><small>Enregistrer cette commande ne crée aucun colis. Vous l’autoriserez ensuite depuis la commande confirmée.</small></div>
              </>
            )}
            {kind === "purchase" && (
              <>
                <Field label="Fournisseur *" name="supplier" required />
                <Field label="Article / motif *" name="item" required />
                <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" defaultValue="1" min="1" required />
                <Field label="Coût unitaire (MAD) *" name="unitCost" type="number" inputMode="decimal" min="0" required />
                <Select label="Paiement" name="paymentStatus" options={["Payé", "À payer"]} />
              </>
            )}
            {kind === "ad" && (
              <>
                <Field label="Campagne *" name="campaign" required />
                <Field label="Dépenses (MAD) *" name="spend" type="number" inputMode="decimal" min="0" required />
                <Field label="CA attribué (MAD) *" name="revenue" type="number" inputMode="decimal" min="0" required />
                <Field label="Commandes *" name="orderCount" type="number" inputMode="numeric" min="0" required />
                <Field label="Date *" name="performanceDate" type="date" required />
              </>
            )}
            {kind === "capital" && (
              <>
                <Select label="Type" name="direction" options={["Entrée", "Sortie"]} />
                <Field label="Source du capital *" name="category" defaultValue="Apport" required />
                <Field label="Libellé *" name="label" required />
                <Field label="Montant (MAD) *" name="amount" type="number" inputMode="decimal" min="0" required />
                <Field label="Date *" name="entryDate" type="date" required />
              </>
            )}
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>
              Annuler
            </button>
            <button className="primary-button" disabled={saving || (kind === "order" && products.length === 0)}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function OrderModal({ order, history, carrierNames, close, print, submit }: { order: Order; history: OrderStatusHistory[]; carrierNames: string[]; close: () => void; print: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(order.status);
  const currentCarrier = order.carrier && order.carrier !== "Non affecté" ? order.carrier : "";
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal compact">
        <div className="modal-head">
          <div>
            <span className="card-kicker">{order.orderRef}</span>
            <h2>{order.customerName}</h2>
            <p>
              {order.products} · {money(order.saleAmount)}
            </p>
          </div>
          <button onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setFormError("");
            try {
              await submit("updateOrder", {
                id: String(order.id),
                ...Object.fromEntries(new FormData(e.currentTarget)),
              });
            } catch (caught) {
              setFormError(caught instanceof Error ? caught.message : "Mise à jour impossible.");
              setSaving(false);
            }
          }}
        >
          <div className="form-grid">
            <Select label="Source de la commande" name="source" defaultValue={order.source || "Non renseignée"} options={[...orderSourceOptions, "Non renseignée"]} />
            <label className="field">
              <span>Statut de la commande</span>
              <select name="status" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                {orderStatusOptions.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            {selectedStatus === "Retour" && (
              <>
                <label className="field">
                  <span>Motif du retour *</span>
                  <select name="returnReason" defaultValue={order.returnReason || ""} required>
                    <option value="" disabled>Choisir un motif</option>
                    {returnReasonOptions.map((reason) => <option key={reason}>{reason}</option>)}
                  </select>
                </label>
                <label className="field return-note-field">
                  <span>Détail du retour</span>
                  <input name="returnNote" type="text" maxLength={240} defaultValue={order.returnNote} placeholder="Précision utile, surtout si vous choisissez Autre" />
                </label>
              </>
            )}
            <Select label="Encaissement" name="paymentStatus" defaultValue={order.paymentStatus} options={["À encaisser", "Encaissé", "Non encaissé", "Remboursé"]} />
            <Field label="Adresse de livraison *" name="address" defaultValue={order.address} autoComplete="street-address" required />
            <Field label="Coût retour (MAD)" name="returnCost" type="number" inputMode="decimal" min="0" defaultValue={String(order.returnCost)} />
            <CarrierQuoteChooser city={order.city} defaultCarrier={currentCarrier || carrierNames[0]} defaultFee={order.shippingCost} locked={Boolean(order.trackingNumber)} />
          </div>
          <div className={`carrier-authorization-state ${order.trackingNumber ? "created" : order.status === "Confirmée" ? "ready" : "waiting"}`}>
            <span aria-hidden="true">{order.trackingNumber ? "✓" : order.status === "Confirmée" ? "🔒" : "◷"}</span>
            <div>
              <strong>{order.trackingNumber ? `Colis créé · ${order.trackingNumber}` : order.status === "Confirmée" ? "En attente de votre autorisation" : "Confirmez d’abord la commande"}</strong>
              <small>{order.trackingNumber ? `${order.carrier} suit maintenant ce colis. L’encaissement sera ajouté au capital après facturation payée.` : order.status === "Confirmée" ? "Vérifiez l’agence et son tarif, puis autorisez la création réelle du colis." : "Aucune donnée n’est envoyée à Sendit ou ForceLog avant la confirmation et votre autorisation."}</small>
            </div>
          </div>
          <div className={`order-stock-state ${order.productId ? (order.stockDeducted ? "deducted" : "waiting") : "legacy"}`}>
            <span aria-hidden="true">{order.productId ? (order.stockDeducted ? "✓" : "◷") : "!"}</span>
            <div>
              <strong>{order.productId ? (order.stockDeducted ? "Stock déjà déduit" : "Stock en attente") : "Commande historique non reliée"}</strong>
              <small>{order.productId ? (order.stockDeducted ? `${order.quantity} unité(s) retirée(s) automatiquement.` : "La quantité sera retirée au passage au statut Confirmée.") : "Cette ancienne commande conserve son produit en texte et ne modifie pas automatiquement le stock."}</small>
            </div>
          </div>
          <div className="status-history-panel">
            <div className="status-history-head">
              <span className="card-kicker">Historique des statuts</span>
              <small>{history.length} changement{history.length > 1 ? "s" : ""}</small>
            </div>
            <div className="status-history-list">
              {history.length ? history.map((entry) => (
                <article className="status-history-row" key={entry.id}>
                  <span className="status-history-dot" aria-hidden="true" />
                  <div>
                    <strong>{entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}</strong>
                    <small>{entry.changedByName} · {dateTimeLabel(entry.changedAt)}</small>
                  </div>
                </article>
              )) : <small>Aucun changement de statut enregistré.</small>}
            </div>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary-button print-order-button" onClick={print}>
              ▣ Imprimer le bordereau
            </button>
            <button type="button" className="cancel-button" onClick={close}>
              Annuler
            </button>
            {!order.trackingNumber && order.status === "Confirmée" && (
              <button
                type="button"
                className="carrier-authorize-button"
                disabled={saving}
                onClick={async (event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  setSaving(true);
                  setFormError("");
                  try {
                    await submit("authorizeCarrierDispatch", { id: String(order.id), ...Object.fromEntries(new FormData(form)) });
                  } catch (caught) {
                    setFormError(caught instanceof Error ? caught.message : "Création du colis impossible.");
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Création chez l’agence…" : "Autoriser et créer le colis"}
              </button>
            )}
            <button className="primary-button" disabled={saving}>
              {saving ? "Mise à jour…" : "Mettre à jour"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function PrintOrderSheet({ order }: { order: Order }) {
  return (
    <section className="print-order-sheet" aria-label={`Bordereau de la commande ${order.orderRef}`}>
      <header className="print-slip-header">
        <div className="print-slip-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/maison-jiya-logo.jpeg" alt="Maison Jiya" />
          <div><strong>Maison Jiya</strong><span>L&apos;heure de briller</span></div>
        </div>
        <div className="print-slip-reference">
          <small>Bordereau de commande</small>
          <strong>{order.orderRef}</strong>
          <span>{dateLabel(order.createdAt)}</span>
        </div>
      </header>
      <div className="print-slip-highlight">
        <span>Montant à encaisser</span>
        <strong>{money(order.saleAmount)}</strong>
        <small>Paiement à la livraison</small>
      </div>
      <div className="print-slip-grid">
        <article>
          <span>Destinataire</span>
          <strong>{order.customerName || "Cliente"}</strong>
          <p>{order.phone || "Téléphone non renseigné"}</p>
          <p>{order.city}</p>
        </article>
        <article>
          <span>Livraison</span>
          <strong>{order.carrier || "Agence non affectée"}</strong>
          <p>N° de suivi : {order.trackingNumber || "À compléter"}</p>
          <p>Statut : {order.status}</p>
        </article>
      </div>
      <div className="print-slip-product">
        <div><span>Produit</span><strong>{order.products}</strong></div>
        <div><span>Quantité</span><strong>{order.quantity}</strong></div>
        <div><span>Source</span><strong>{order.source}</strong></div>
      </div>
      {order.status === "Retour" && order.returnReason && (
        <div className="print-slip-return">
          <span>Retour</span>
          <strong>{order.returnReason}</strong>
          {order.returnNote && <p>{order.returnNote}</p>}
        </div>
      )}
      <footer className="print-slip-footer">
        <div><span>Signature / cachet</span></div>
        <p>Merci de vérifier le nom, le téléphone, la ville et le montant avant l&apos;expédition.</p>
      </footer>
    </section>
  );
}
function EntityModal({ selection, close, submit }: { selection: EditableEntity; close: () => void; submit: (action: string, values: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const titles = {
    product: "Modifier le produit",
    movement: "Modifier le mouvement de stock",
    customer: "Modifier le client",
    purchase: "Modifier l’achat",
    ad: "Modifier la publicité",
    capital: "Modifier le mouvement de capital",
  };
  const actions = {
    product: "updateProduct",
    movement: "updateStockMovement",
    customer: "updateCustomer",
    purchase: "updatePurchase",
    ad: "updateAd",
    capital: "updateCapital",
  };
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await submit(actions[selection.kind], {
        id: String(selection.record.id),
        ...Object.fromEntries(new FormData(event.currentTarget)),
      });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Modification impossible.");
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="entity-modal-title">
        <div className="modal-head">
          <div><span className="card-kicker">Modification sécurisée</span><h2 id="entity-modal-title">{titles[selection.kind]}</h2><p>Les calculs du tableau de bord seront actualisés après l’enregistrement.</p></div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={handle}>
          <div className="form-grid">
            {selection.kind === "product" && <>
              <Field label="ID produit / SKU *" name="productCode" defaultValue={selection.record.productCode} required />
              <Field label="Nom du produit *" name="name" defaultValue={selection.record.name} required />
              <Select label="Catégorie *" name="category" defaultValue={selection.record.category} options={productCategoryOptions} />
              <Field label="Prix d’achat (MAD) *" name="purchasePrice" type="number" inputMode="decimal" min="0" defaultValue={String(selection.record.purchasePrice)} required />
              <Field label="Prix de vente (MAD) *" name="salePrice" type="number" inputMode="decimal" min="0" defaultValue={String(selection.record.salePrice)} required />
            </>}
            {selection.kind === "movement" && <>
              <div className="movement-edit-note"><strong>{selection.record.productName || "Produit"}</strong><small>Le stock restant sera recalculé automatiquement.</small></div>
              <Select label="Type de mouvement" name="movementType" defaultValue={selection.record.movementType} options={["Entrée", "Vente"]} />
              <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" min="1" defaultValue={String(selection.record.quantity)} required />
              <Field label="Note" name="note" defaultValue={selection.record.note} />
            </>}
            {selection.kind === "customer" && <>
              <Field label="Nom du client *" name="name" defaultValue={selection.record.name} autoComplete="name" required />
              <Field label="Téléphone *" name="phone" type="tel" inputMode="tel" defaultValue={selection.record.phone} autoComplete="tel" required />
              <Field label="Ville *" name="city" defaultValue={selection.record.city} autoComplete="address-level2" required />
            </>}
            {selection.kind === "purchase" && <>
              <Field label="Fournisseur *" name="supplier" defaultValue={selection.record.supplier} required />
              <Field label="Article / motif *" name="item" defaultValue={selection.record.item} required />
              <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" min="1" defaultValue={String(selection.record.quantity)} required />
              <Field label="Coût unitaire (MAD) *" name="unitCost" type="number" inputMode="decimal" min="0" defaultValue={String(selection.record.unitCost)} required />
              <Select label="Paiement" name="paymentStatus" defaultValue={selection.record.paymentStatus} options={["Payé", "À payer"]} />
            </>}
            {selection.kind === "ad" && <>
              <Field label="Campagne *" name="campaign" defaultValue={selection.record.campaign} required />
              <Field label="Dépenses (MAD) *" name="spend" type="number" inputMode="decimal" min="0" defaultValue={String(selection.record.spend)} required />
              <Field label="CA attribué (MAD) *" name="revenue" type="number" inputMode="decimal" min="0" defaultValue={String(selection.record.revenue)} required />
              <Field label="Commandes *" name="orderCount" type="number" inputMode="numeric" min="0" defaultValue={String(selection.record.orderCount)} required />
              <Field label="Date *" name="performanceDate" type="date" defaultValue={selection.record.performanceDate.slice(0, 10)} required />
            </>}
            {selection.kind === "capital" && <>
              <Select label="Type" name="direction" defaultValue={selection.record.direction} options={["Entrée", "Sortie"]} />
              <Field label="Source du capital *" name="category" defaultValue={selection.record.category} required />
              <Field label="Libellé *" name="label" defaultValue={selection.record.label} required />
              <Field label="Montant (MAD) *" name="amount" type="number" inputMode="decimal" min="0" defaultValue={String(selection.record.amount)} required />
              <Field label="Date *" name="entryDate" type="date" defaultValue={selection.record.entryDate.slice(0, 10)} required />
            </>}
          </div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>Annuler</button>
            <button className="primary-button" disabled={saving}>{saving ? "Mise à jour…" : "Enregistrer les modifications"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
function StockMovementModal({ selection, close, submit }: { selection: Exclude<StockSelection, null>; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="modal compact" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="card-kicker">
              {selection.product.productCode} · {selection.product.category}
            </span>
            <h2>{selection.type === "Entrée" ? "Ajouter du stock" : "Enregistrer une sortie manuelle"}</h2>
            <p>
              {selection.product.name} · {selection.product.stockQuantity} unité(s) restante(s)
            </p>
          </div>
          <button onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setFormError("");
            try {
              await submit("addStockMovement", {
                productId: String(selection.product.id),
                movementType: selection.type,
                ...Object.fromEntries(new FormData(e.currentTarget)),
              });
            } catch (c) {
              setFormError(c instanceof Error ? c.message : "Erreur");
              setSaving(false);
            }
          }}
        >
          <div className="movement-summary">
            <span className={selection.type === "Entrée" ? "movement-symbol in" : "movement-symbol out"}>{selection.type === "Entrée" ? "＋" : "−"}</span>
            <div>
              <strong>{selection.type}</strong>
              <p>{selection.type === "Entrée" ? "La quantité sera ajoutée au stock restant." : "À utiliser pour une perte, un article abîmé ou une correction. Les ventes sont retirées automatiquement quand une commande passe à Confirmée."}</p>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" defaultValue="1" min="1" required />
            <Field label="Note" name="note" />
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>
              Annuler
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Enregistrement…" : selection.type === "Entrée" ? "Ajouter au stock" : "Confirmer la vente"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function InventoryCountModal({ product, close, submit }: { product: Product; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [physicalQuantity, setPhysicalQuantity] = useState(String(product.stockQuantity));
  const parsedPhysicalQuantity = Math.max(0, Math.round(Number(physicalQuantity) || 0));
  const difference = parsedPhysicalQuantity - product.stockQuantity;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal compact inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title">
        <div className="modal-head">
          <div>
            <span className="card-kicker">{product.productCode} · Contrôle de stock</span>
            <h2 id="inventory-modal-title">Inventaire physique</h2>
            <p>Comptez les articles réellement présents. Le stock du site sera aligné et chaque écart restera dans l’historique.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fermer">×</button>
        </div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setFormError("");
          try {
            await submit("countInventory", {
              productId: String(product.id),
              ...Object.fromEntries(new FormData(event.currentTarget)),
            });
          } catch (caught) {
            setFormError(caught instanceof Error ? caught.message : "Inventaire impossible.");
            setSaving(false);
          }
        }}>
          <div className="inventory-summary">
            <div><span>Stock du site</span><strong>{product.stockQuantity}</strong></div>
            <div><span>Stock physique</span><strong>{parsedPhysicalQuantity}</strong></div>
            <div className={difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral"}><span>Écart</span><strong>{difference > 0 ? "+" : ""}{difference}</strong></div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Quantité physique comptée *</span>
              <input name="physicalQuantity" type="number" inputMode="numeric" min="0" value={physicalQuantity} onChange={(event) => setPhysicalQuantity(event.target.value)} required />
            </label>
            <Field label="Note / explication de l’écart" name="note" />
          </div>
          <p className="inventory-warning">{difference === 0 ? "✓ Aucun écart : le contrôle sera quand même enregistré." : `Le site corrigera automatiquement le stock de ${product.stockQuantity} à ${parsedPhysicalQuantity} unité(s).`}</p>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>Annuler</button>
            <button className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Valider l’inventaire"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Field({ label, ...props }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string; inputMode?: "tel" | "numeric" | "decimal"; autoComplete?: string; min?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
function Select({ label, name, options, defaultValue }: { label: string; name: string; options: string[]; defaultValue?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
