"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TrainingOrder = {
  id: string;
  customer: string;
  product: string;
  amount: number;
  cost: number;
  status: "En attente" | "Livrée" | "Retour";
  createdAt: string;
};

type TrainingPurchase = {
  id: string;
  supplier: string;
  item: string;
  amount: number;
  paid: boolean;
  createdAt: string;
};

type TrainingStock = {
  id: string;
  product: string;
  quantity: number;
  direction: "Entrée" | "Sortie";
  createdAt: string;
};

type TrainingCapital = {
  id: string;
  label: string;
  amount: number;
  direction: "Entrée" | "Sortie";
  createdAt: string;
};

type TrainingState = {
  orders: TrainingOrder[];
  purchases: TrainingPurchase[];
  stock: TrainingStock[];
  capital: TrainingCapital[];
};

const STORAGE_KEY = "maison-jiya-training-sandbox-v1";
const emptyState: TrainingState = { orders: [], purchases: [], stock: [], capital: [] };

function money(value: number) {
  return `${Number(value || 0).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
}

function number(value: FormDataEntryValue | null) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 4)}`;
}

export default function TrainingPage({ onExit }: { onExit: () => void }) {
  const [state, setState] = useState<TrainingState>(emptyState);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TrainingState>;
        setState({
          orders: Array.isArray(parsed.orders) ? parsed.orders : [],
          purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
          stock: Array.isArray(parsed.stock) ? parsed.stock : [],
          capital: Array.isArray(parsed.capital) ? parsed.capital : [],
        });
      }
    } catch {
      setState(emptyState);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const metrics = useMemo(() => {
    const delivered = state.orders.filter((order) => order.status === "Livrée");
    const revenue = delivered.reduce((sum, order) => sum + order.amount, 0);
    const orderCosts = delivered.reduce((sum, order) => sum + order.cost, 0);
    const returnLosses = state.orders.filter((order) => order.status === "Retour").reduce((sum, order) => sum + order.cost, 0);
    const purchases = state.purchases.filter((purchase) => purchase.paid).reduce((sum, purchase) => sum + purchase.amount, 0);
    const capital = state.capital.reduce((sum, entry) => sum + (entry.direction === "Entrée" ? entry.amount : -entry.amount), 0);
    const stock = state.stock.reduce((sum, movement) => sum + (movement.direction === "Entrée" ? movement.quantity : -movement.quantity), 0);
    return { revenue, profit: revenue - orderCosts - returnLosses, purchases, capital, stock };
  }, [state]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  function addOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = number(form.get("amount"));
    const cost = number(form.get("cost"));
    const customer = String(form.get("customer") || "").trim();
    const product = String(form.get("product") || "").trim();
    const status = String(form.get("status") || "En attente") as TrainingOrder["status"];
    if (!customer || !product || !amount) return flash("Complète cliente, produit et montant.");
    setState((current) => ({
      ...current,
      orders: [{ id: id("ORD"), customer, product, amount, cost, status, createdAt: new Date().toISOString() }, ...current.orders],
    }));
    event.currentTarget.reset();
    flash("Commande TEST ajoutée uniquement dans l’entraînement.");
  }

  function addPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const supplier = String(form.get("supplier") || "").trim();
    const item = String(form.get("item") || "").trim();
    const amount = number(form.get("amount"));
    if (!supplier || !item || !amount) return flash("Complète fournisseur, achat et montant.");
    setState((current) => ({
      ...current,
      purchases: [{ id: id("ACH"), supplier, item, amount, paid: form.get("paid") === "on", createdAt: new Date().toISOString() }, ...current.purchases],
    }));
    event.currentTarget.reset();
    flash("Achat TEST ajouté uniquement dans l’entraînement.");
  }

  function addStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const product = String(form.get("product") || "").trim();
    const quantity = Math.max(1, Math.round(number(form.get("quantity"))));
    const direction = String(form.get("direction") || "Entrée") as TrainingStock["direction"];
    if (!product) return flash("Indique un produit.");
    setState((current) => ({
      ...current,
      stock: [{ id: id("STK"), product, quantity, direction, createdAt: new Date().toISOString() }, ...current.stock],
    }));
    event.currentTarget.reset();
    flash("Mouvement TEST ajouté uniquement dans l’entraînement.");
  }

  function addCapital(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") || "").trim();
    const amount = number(form.get("amount"));
    const direction = String(form.get("direction") || "Entrée") as TrainingCapital["direction"];
    if (!label || !amount) return flash("Complète le libellé et le montant.");
    setState((current) => ({
      ...current,
      capital: [{ id: id("CAP"), label, amount, direction, createdAt: new Date().toISOString() }, ...current.capital],
    }));
    event.currentTarget.reset();
    flash("Capital TEST ajouté uniquement dans l’entraînement.");
  }

  function resetTraining() {
    if (!window.confirm("Effacer uniquement toutes les données d’entraînement de cet appareil ?")) return;
    setState(emptyState);
    window.localStorage.removeItem(STORAGE_KEY);
    flash("Entraînement remis à zéro. Les vraies données n’ont pas été touchées.");
  }

  return (
    <div className="training-page">
      <section className="training-hero">
        <div>
          <span className="card-kicker">Bac à sable privé</span>
          <h2>Mode entraînement</h2>
          <p>Tout ce que tu saisis ici reste uniquement dans ce navigateur. Rien n’est envoyé à D1, aux transporteurs, à Meta, à Google Sheets ni à la boutique publique.</p>
        </div>
        <div className="training-actions">
          <button type="button" className="secondary-button" onClick={resetTraining}>Réinitialiser les tests</button>
          <button type="button" className="primary-button" onClick={onExit}>Retour aux vraies données</button>
        </div>
      </section>

      {notice ? <div className="training-notice">{notice}</div> : null}

      <section className="training-kpis">
        <article><span>CA test livré</span><strong>{money(metrics.revenue)}</strong></article>
        <article><span>Bénéfice test</span><strong>{money(metrics.profit)}</strong></article>
        <article><span>Achats test payés</span><strong>{money(metrics.purchases)}</strong></article>
        <article><span>Capital test</span><strong>{money(metrics.capital)}</strong></article>
        <article><span>Variation stock test</span><strong>{metrics.stock}</strong></article>
      </section>

      <div className="training-grid">
        <section className="panel training-card">
          <h3>Commande test</h3>
          <form onSubmit={addOrder}>
            <label><span>Cliente</span><input name="customer" placeholder="Ex. Cliente test" required /></label>
            <label><span>Produit</span><input name="product" placeholder="Ex. Montre test" required /></label>
            <div className="training-row">
              <label><span>Vente (MAD)</span><input name="amount" type="number" min="0" step="0.01" required /></label>
              <label><span>Coût produit</span><input name="cost" type="number" min="0" step="0.01" /></label>
            </div>
            <label><span>Statut</span><select name="status" defaultValue="En attente"><option>En attente</option><option>Livrée</option><option>Retour</option></select></label>
            <button className="primary-button">Ajouter la commande TEST</button>
          </form>
        </section>

        <section className="panel training-card">
          <h3>Achat fournisseur test</h3>
          <form onSubmit={addPurchase}>
            <label><span>Fournisseur</span><input name="supplier" placeholder="Ex. Fournisseur test" required /></label>
            <label><span>Achat</span><input name="item" placeholder="Ex. 10 montres" required /></label>
            <label><span>Total (MAD)</span><input name="amount" type="number" min="0" step="0.01" required /></label>
            <label className="training-check"><input name="paid" type="checkbox" defaultChecked /><span>Considérer payé</span></label>
            <button className="primary-button">Ajouter l’achat TEST</button>
          </form>
        </section>

        <section className="panel training-card">
          <h3>Stock test</h3>
          <form onSubmit={addStock}>
            <label><span>Produit</span><input name="product" placeholder="Ex. MJ-MONTRE-01" required /></label>
            <div className="training-row">
              <label><span>Mouvement</span><select name="direction"><option>Entrée</option><option>Sortie</option></select></label>
              <label><span>Quantité</span><input name="quantity" type="number" min="1" step="1" required /></label>
            </div>
            <button className="primary-button">Ajouter le mouvement TEST</button>
          </form>
        </section>

        <section className="panel training-card">
          <h3>Capital test</h3>
          <form onSubmit={addCapital}>
            <label><span>Libellé</span><input name="label" placeholder="Ex. Apport test" required /></label>
            <div className="training-row">
              <label><span>Type</span><select name="direction"><option>Entrée</option><option>Sortie</option></select></label>
              <label><span>Montant (MAD)</span><input name="amount" type="number" min="0" step="0.01" required /></label>
            </div>
            <button className="primary-button">Ajouter le mouvement TEST</button>
          </form>
        </section>
      </div>

      <section className="panel training-history">
        <div>
          <span className="card-kicker">Historique local</span>
          <h3>Derniers essais</h3>
        </div>
        <div className="training-history-grid">
          <div><strong>Commandes</strong>{state.orders.slice(0, 5).map((row) => <p key={row.id}>{row.customer} · {row.product} · {money(row.amount)} · {row.status}</p>)}</div>
          <div><strong>Achats</strong>{state.purchases.slice(0, 5).map((row) => <p key={row.id}>{row.supplier} · {row.item} · {money(row.amount)}</p>)}</div>
          <div><strong>Stock</strong>{state.stock.slice(0, 5).map((row) => <p key={row.id}>{row.product} · {row.direction} {row.quantity}</p>)}</div>
          <div><strong>Capital</strong>{state.capital.slice(0, 5).map((row) => <p key={row.id}>{row.label} · {row.direction} {money(row.amount)}</p>)}</div>
        </div>
      </section>
    </div>
  );
}
