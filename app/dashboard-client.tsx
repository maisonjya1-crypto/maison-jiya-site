"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Order = {
  id: number;
  orderRef: string;
  customerId: number;
  customerName: string | null;
  phone: string | null;
  city: string;
  products: string;
  quantity: number;
  saleAmount: number;
  productCost: number;
  shippingCost: number;
  adCost: number;
  fees: number;
  returnCost: number;
  source: string;
  status: string;
  paymentStatus: string;
  carrier: string;
  trackingNumber: string;
  paidAt: string | null;
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
  productCode: string | null;
  productName: string | null;
  movementType: string;
  quantity: number;
  note: string;
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
type Data = {
  orders: Order[];
  customers: Customer[];
  purchases: Purchase[];
  ads: Ad[];
  capital: Capital[];
  products: Product[];
  stockMovements: StockMovement[];
  members: Member[];
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
type ThemeKey = "mauve-froid" | "rose-poudre" | "sombre-prune" | "bleu-brume" | "sable-chic";
type CapitalFlow = {
  direction: "Entrée" | "Sortie";
  source: string;
  amount: number;
  date: string;
};

const emptyData: Data = {
  orders: [],
  customers: [],
  purchases: [],
  ads: [],
  capital: [],
  products: [],
  stockMovements: [],
  members: [],
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

const navigation = ["Vue d’ensemble", "Commandes", "Produits", "Colis", "Clients", "Achats", "Publicités", "Capital", "Paramètres"];
const orderStatusOptions = ["En attente", "Confirmée", "Expédiée", "En livraison", "Livrée", "Retour", "Annulée"];
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

export default function DashboardClient() {
  const [active, setActive] = useState("Vue d’ensemble");
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalName>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [stockSelection, setStockSelection] = useState<StockSelection>(null);
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
    const body = (await response.json()) as Data & { error?: string };
    if (!response.ok) {
      const message = body.error || "Enregistrement impossible";
      setError(message);
      throw new Error(message);
    }
    setData(body);
    setModal(null);
    setSelectedOrder(null);
    setStockSelection(null);
    const messages: Record<string, string> = {
      createMember: "Compte partenaire créé",
      resetMemberPassword: "Mot de passe remplacé",
      updateMember: "Droits du partenaire mis à jour",
      updateAccountSettings: "Compte principal mis à jour",
      updateSetting: "Thème appliqué",
    };
    setNotice(messages[action] || "Enregistré avec succès");
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

  function openStock(selection: StockSelection) {
    if (requireEditAccess()) setStockSelection(selection);
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
        <div className="connection-card">
          <span className="live-dot" />
          <div>
            <strong>Transporteur</strong>
            <small>{data.settings.carrier_name || "À configurer"}</small>
          </div>
        </div>
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
          {active !== "Paramètres" && (
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
        {loading ? <Loading /> : <Page active={active} setActive={setActive} data={data} metrics={metrics} delivery={delivery} open={openEntry} edit={openOrder} moveStock={openStock} submit={submit} />}
      </section>
      {modal && <EntryModal kind={modal} close={() => setModal(null)} submit={submit} />}
      {selectedOrder && <OrderModal order={selectedOrder} close={() => setSelectedOrder(null)} submit={submit} />}
      {stockSelection && <StockMovementModal selection={stockSelection} close={() => setStockSelection(null)} submit={submit} />}
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
        <div className="auth-benefits"><i>Commandes</i><i>Stock</i><i>Capital</i><i>Partenaires</i></div>
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
  moveStock,
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
  moveStock: (selection: StockSelection) => void;
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  if (active === "Commandes") return <OrdersPage orders={data.orders} onAdd={() => open("order")} onEdit={edit} />;
  if (active === "Produits") return <ProductsPage products={data.products} movements={data.stockMovements} onAdd={() => open("product")} onMove={moveStock} />;
  if (active === "Colis") return <ShippingPage orders={data.orders} settings={data.settings} onEdit={edit} />;
  if (active === "Clients") return <CustomersPage customers={data.customers} orders={data.orders} />;
  if (active === "Achats") return <PurchasesPage purchases={data.purchases} onAdd={() => open("purchase")} />;
  if (active === "Publicités") return <AdsPage ads={data.ads} settings={data.settings} onAdd={() => open("ad")} />;
  if (active === "Capital") return <CapitalPage data={data} metrics={metrics} onAdd={() => open("capital")} />;
  if (active === "Paramètres") return <SettingsPage currentTheme={safeTheme(data.settings.theme)} accountName={data.settings.account_name || "Maison Jiya"} accountEmail={data.settings.account_email || ""} access={data.access} members={data.members} submit={submit} />;
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
          <OrderTable orders={data.orders.slice(0, 5)} onEdit={edit} />
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

function SettingsPage({ currentTheme, accountName, accountEmail, access, members, submit }: {
  currentTheme: ThemeKey;
  accountName: string;
  accountEmail: string;
  access: Data["access"];
  members: Member[];
  submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  const [pendingTheme, setPendingTheme] = useState<ThemeKey | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
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
function OrdersPage({ orders, onAdd, onEdit }: { orders: Order[]; onAdd: () => void; onEdit: (o: Order) => void }) {
  return (
    <section className="panel page-panel">
      <div className="section-toolbar">
        <div>
          <h2>{orders.length} commandes</h2>
          <p>Touchez une commande pour modifier son statut et son suivi.</p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          ＋ Saisir une commande
        </button>
      </div>
      <OrderTable orders={orders} onEdit={onEdit} />
    </section>
  );
}
function OrderTable({ orders, onEdit }: { orders: Order[]; onEdit: (o: Order) => void }) {
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
                    <small>
                      {o.products} · {o.source}
                    </small>
                  </td>
                  <td>{o.city}</td>
                  <td>
                    <strong>{money(o.saleAmount)}</strong>
                  </td>
                  <td className={gain >= 0 ? "money-positive" : "money-negative"}>{money(gain)}</td>
                  <td>
                    <Status value={o.status} />
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
            <button key={o.id} className="mobile-order-card" onClick={() => onEdit(o)}>
              <div className="mobile-order-top">
                <span>
                  <strong>{o.orderRef}</strong>
                  <small>
                    {dateLabel(o.createdAt)} · {o.source}
                  </small>
                </span>
                <Status value={o.status} />
              </div>
              <div className="mobile-order-client">
                <strong>{o.customerName}</strong>
                <small>
                  {o.city} · {o.products}
                </small>
              </div>
              <div className="mobile-order-money">
                <span>
                  Vente <strong>{money(o.saleAmount)}</strong>
                </span>
                <span>
                  Gain <strong className={gain >= 0 ? "money-positive" : "money-negative"}>{money(gain)}</strong>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
function ShippingPage({ orders, settings, onEdit }: { orders: Order[]; settings: Record<string, string>; onEdit: (o: Order) => void }) {
  return (
    <>
      <section className="integration-banner">
        <div>
          <span className="live-dot" />
          <div>
            <strong>Connexion transporteur</strong>
            <p>{settings.carrier_name || "Aucun transporteur sélectionné"} · Ajoutez le nom de votre transporteur pour préparer la synchronisation.</p>
          </div>
        </div>
        <Status value="À configurer" />
      </section>
      <section className="panel page-panel">
        <PanelHead kicker="Paiement à la livraison" title="Suivi des colis" total={String(orders.length)} />
        <div className="card-list">
          {orders.map((o) => (
            <button className="shipment-card" key={o.id} onClick={() => onEdit(o)}>
              <div>
                <strong>{o.orderRef}</strong>
                <small>
                  {o.customerName} · {o.city} · {o.source}
                </small>
              </div>
              <div>
                <strong>{o.trackingNumber || "Sans numéro"}</strong>
                <small>{o.carrier}</small>
              </div>
              <div>
                <Status value={o.status} />
                <small>{o.paymentStatus}</small>
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
function CustomersPage({ customers, orders }: { customers: Customer[]; orders: Order[] }) {
  return (
    <section className="panel page-panel">
      <PanelHead kicker="CRM" title="Fichier clients" total={String(customers.length)} />
      <div className="customer-grid">
        {customers.map((c) => {
          const own = orders.filter((o) => o.customerId === c.id),
            spent = own.filter((o) => o.paymentStatus === "Encaissé").reduce((s, o) => s + o.saleAmount, 0);
          return (
            <article className="customer-card" key={c.id}>
              <span className="customer-avatar">{c.name.slice(0, 1)}</span>
              <div>
                <strong>{c.name}</strong>
                <p>
                  {c.phone} · {c.city}
                </p>
                <small>
                  {own.length} commande(s) · {money(spent)} encaissé
                </small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function ProductsPage({ products, movements, onAdd, onMove }: { products: Product[]; movements: StockMovement[]; onAdd: () => void; onMove: (selection: StockSelection) => void }) {
  const units = products.reduce((s, p) => s + p.stockQuantity, 0),
    purchaseValue = products.reduce((s, p) => s + p.stockQuantity * p.purchasePrice, 0),
    saleValue = products.reduce((s, p) => s + p.stockQuantity * p.salePrice, 0),
    lowStock = products.filter((p) => p.stockQuantity <= 5).length;
  return (
    <>
      <section className="kpi-grid stock-kpis">
        <Kpi label="Produits" value={String(products.length)} detail={`${lowStock} stock(s) faible(s)`} />
        <Kpi label="Unités restantes" value={String(units)} detail="Stock disponible" />
        <Kpi label="Valeur d’achat" value={money(purchaseValue)} detail="Au prix d’achat" />
        <Kpi label="Valeur de vente" value={money(saleValue)} detail="Potentiel du stock" />
      </section>
      <section className="panel page-panel products-panel">
        <div className="section-toolbar">
          <div>
            <h2>Catalogue & stock</h2>
            <p>Ajoutez un produit, une entrée de stock ou une vente.</p>
          </div>
          <button className="primary-button" onClick={onAdd}>
            ＋ Ajouter un produit
          </button>
        </div>
        {products.length === 0 ? (
          <EmptyState title="Aucun produit" text="Ajoutez votre premier produit pour commencer le suivi du stock." />
        ) : (
          <>
            <div className="desktop-product-table table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID produit</th>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Achat</th>
                    <th>Vente</th>
                    <th>Restant</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <strong>{product.productCode}</strong>
                      </td>
                      <td>{product.name}</td>
                      <td>
                        <span className="category-chip">{product.category}</span>
                      </td>
                      <td>{money(product.purchasePrice)}</td>
                      <td>
                        <strong>{money(product.salePrice)}</strong>
                      </td>
                      <td>
                        <StockLevel quantity={product.stockQuantity} />
                      </td>
                      <td>
                        <div className="stock-actions">
                          <button className="stock-in" onClick={() => onMove({ product, type: "Entrée" })}>
                            ＋ Stock
                          </button>
                          <button className="stock-out" disabled={product.stockQuantity === 0} onClick={() => onMove({ product, type: "Vente" })}>
                            − Vendre
                          </button>
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
                    <div>
                      <span>{product.productCode}</span>
                      <h3>{product.name}</h3>
                    </div>
                    <StockLevel quantity={product.stockQuantity} />
                  </div>
                  <span className="category-chip">{product.category}</span>
                  <div className="product-prices">
                    <p>
                      Prix d’achat
                      <strong>{money(product.purchasePrice)}</strong>
                    </p>
                    <p>
                      Prix de vente<strong>{money(product.salePrice)}</strong>
                    </p>
                  </div>
                  <div className="stock-actions">
                    <button className="stock-in" onClick={() => onMove({ product, type: "Entrée" })}>
                      ＋ Ajouter du stock
                    </button>
                    <button className="stock-out" disabled={product.stockQuantity === 0} onClick={() => onMove({ product, type: "Vente" })}>
                      − Vendre
                    </button>
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
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th>Mouvement</th>
                  <th>Quantité</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {movements.slice(0, 12).map((m) => (
                  <tr key={m.id}>
                    <td>{dateLabel(m.createdAt)}</td>
                    <td>
                      <strong>{m.productName}</strong>
                      <small>{m.productCode}</small>
                    </td>
                    <td>
                      <Status value={m.movementType} />
                    </td>
                    <td className={m.movementType === "Entrée" ? "money-positive" : "money-negative"}>
                      {m.movementType === "Entrée" ? "+" : "−"}
                      {m.quantity}
                    </td>
                    <td>{m.note || "—"}</td>
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
function PurchasesPage({ purchases, onAdd }: { purchases: Purchase[]; onAdd: () => void }) {
  const total = purchases.reduce((s, p) => s + p.totalCost, 0);
  return (
    <>
      <section className="kpi-grid three">
        <Kpi label="Total achats" value={money(total)} detail={`${purchases.length} opérations`} />
        <Kpi label="Achats payés" value={money(purchases.filter((p) => p.paymentStatus === "Payé").reduce((s, p) => s + p.totalCost, 0))} detail="Sorties confirmées" />
        <Kpi label="Reste à payer" value={money(purchases.filter((p) => p.paymentStatus !== "Payé").reduce((s, p) => s + p.totalCost, 0))} detail="À surveiller" danger />
      </section>
      <section className="panel page-panel">
        <div className="section-toolbar">
          <div>
            <h2>Achats fournisseurs</h2>
            <p>Stock, tissu, emballages et autres coûts.</p>
          </div>
          <button className="primary-button" onClick={onAdd}>
            ＋ Ajouter un achat
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Fournisseur</th>
                <th>Achat</th>
                <th>Qté</th>
                <th>Total</th>
                <th>Paiement</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{dateLabel(p.createdAt)}</td>
                  <td>
                    <strong>{p.supplier}</strong>
                  </td>
                  <td>{p.item}</td>
                  <td>{p.quantity}</td>
                  <td>
                    <strong>{money(p.totalCost)}</strong>
                  </td>
                  <td>
                    <Status value={p.paymentStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function AdsPage({ ads, settings, onAdd }: { ads: Ad[]; settings: Record<string, string>; onAdd: () => void }) {
  const spend = ads.reduce((s, a) => s + a.spend, 0),
    revenue = ads.reduce((s, a) => s + a.revenue, 0),
    count = ads.reduce((s, a) => s + a.orderCount, 0);
  return (
    <>
      <section className="integration-banner">
        <div>
          <span className="meta-mark">M</span>
          <div>
            <strong>Meta Ads</strong>
            <p>Saisie manuelle active. La connexion automatique nécessitera l’autorisation de votre compte Meta Ads.</p>
          </div>
        </div>
        <Status value={settings.meta_status || "À connecter"} />
      </section>
      <section className="kpi-grid three">
        <Kpi label="Dépenses" value={money(spend)} detail="Données saisies" />
        <Kpi label="CA attribué" value={money(revenue)} detail={`${count} commandes`} />
        <Kpi label="ROAS" value={`${spend ? (revenue / spend).toFixed(2) : "0.00"}×`} detail="CA attribué ÷ dépenses" />
      </section>
      <section className="panel page-panel">
        <div className="section-toolbar">
          <div>
            <h2>Performance des campagnes</h2>
            <p>Ces résultats sont manuels jusqu’à la connexion Meta.</p>
          </div>
          <button className="primary-button" onClick={onAdd}>
            ＋ Saisir une campagne
          </button>
        </div>
        <div className="ad-grid">
          {ads.map((a) => (
            <article className="ad-card" key={a.id}>
              <span>{a.platform}</span>
              <h3>{a.campaign}</h3>
              <div>
                <p>
                  Dépenses<strong>{money(a.spend)}</strong>
                </p>
                <p>
                  CA attribué<strong>{money(a.revenue)}</strong>
                </p>
                <p>
                  ROAS
                  <strong>{a.spend ? (a.revenue / a.spend).toFixed(2) : "0"}×</strong>
                </p>
              </div>
              <small>
                {a.source} · {dateLabel(a.performanceDate)}
              </small>
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
}: {
  data: Data;
  metrics: {
    cash: number;
    capitalNet: number;
    netCollected: number;
    reinvest: number;
  };
  onAdd: () => void;
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
  const tone = ["Livrée", "Encaissé", "Payé", "Connecté", "Entrée"].includes(value) ? "success" : ["Retour", "Annulée", "Refusée", "Retournée", "Remboursé", "Non encaissé"].includes(value) ? "danger" : ["Expédiée", "En livraison", "Vente"].includes(value) ? "info" : "warning";
  return <span className={`status ${tone}`}>{value}</span>;
}

function EntryModal({ kind, close, submit }: { kind: Exclude<ModalName, null>; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const labels = {
    order: "Nouvelle commande",
    purchase: "Nouvel achat",
    ad: "Performance Meta Ads",
    capital: "Mouvement de capital",
    product: "Nouveau produit",
  };
  const [saving, setSaving] = useState(false),
    [formError, setFormError] = useState("");
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
                <Field label="Ville *" name="city" autoComplete="address-level2" required />
                <Field label="Produit(s) *" name="products" required />
                <Select label="Source de la commande *" name="source" options={orderSourceOptions} />
                <Select label="Statut de la commande" name="status" options={orderStatusOptions} />
                <Field label="Quantité *" name="quantity" type="number" inputMode="numeric" defaultValue="1" min="1" required />
                <Field label="Vente (MAD) *" name="saleAmount" type="number" inputMode="decimal" min="0" required />
                <Field label="Coût produit (MAD)" name="productCost" type="number" inputMode="decimal" min="0" />
                <Field label="Frais de transport déduits (MAD)" name="shippingCost" type="number" inputMode="decimal" min="0" />
                <Field label="Publicité attribuée (MAD)" name="adCost" type="number" inputMode="decimal" min="0" />
                <Field label="Autres frais (MAD)" name="fees" type="number" inputMode="decimal" min="0" />
                <Field label="Transporteur" name="carrier" />
                <Field label="Numéro de suivi" name="trackingNumber" />
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
            <button className="primary-button" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function OrderModal({ order, close, submit }: { order: Order; close: () => void; submit: (a: string, v: Record<string, FormDataEntryValue>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
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
            try {
              await submit("updateOrder", {
                id: String(order.id),
                ...Object.fromEntries(new FormData(e.currentTarget)),
              });
            } catch {
              setSaving(false);
            }
          }}
        >
          <div className="form-grid">
            <Select label="Source de la commande" name="source" defaultValue={order.source || "Non renseignée"} options={[...orderSourceOptions, "Non renseignée"]} />
            <Select label="Statut de la commande" name="status" defaultValue={order.status} options={orderStatusOptions} />
            <Select label="Encaissement" name="paymentStatus" defaultValue={order.paymentStatus} options={["À encaisser", "Encaissé", "Non encaissé", "Remboursé"]} />
            <Field label="Frais de transport déduits (MAD)" name="shippingCost" type="number" inputMode="decimal" min="0" defaultValue={String(order.shippingCost)} />
            <Field label="Transporteur" name="carrier" defaultValue={order.carrier} />
            <Field label="Numéro de suivi" name="trackingNumber" defaultValue={order.trackingNumber} />
            <Field label="Coût retour (MAD)" name="returnCost" type="number" inputMode="decimal" min="0" defaultValue={String(order.returnCost)} />
          </div>
          <div className="modal-actions">
            <button type="button" className="cancel-button" onClick={close}>
              Annuler
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? "Mise à jour…" : "Mettre à jour"}
            </button>
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
            <h2>{selection.type === "Entrée" ? "Ajouter du stock" : "Enregistrer une vente"}</h2>
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
              <p>{selection.type === "Entrée" ? "La quantité sera ajoutée au stock restant." : "La quantité sera retirée du stock restant. La commande et l’encaissement restent gérés dans Commandes."}</p>
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
