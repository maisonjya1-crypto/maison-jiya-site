"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";

type Product = {
  id: number;
  productCode: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  stockQuantity: number;
};

type ExtraItem = { key: string; productId: string; quantity: string };
type WhatsAppNumber = { id: string; label: string; phone: string; isDefault: boolean };
type PortalContainer = Parameters<typeof createPortal>[1];

const formatMoney = (value: number) => `${value.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;

function setControlledInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function MultiOrderBuilder({
  form,
  products,
  extras,
  setExtras,
  isPack,
  setIsPack,
  packName,
  setPackName,
  saving,
  error,
}: {
  form: HTMLFormElement;
  products: Product[];
  extras: ExtraItem[];
  setExtras: Dispatch<SetStateAction<ExtraItem[]>>;
  isPack: boolean;
  setIsPack: (value: boolean) => void;
  packName: string;
  setPackName: (value: string) => void;
  saving: boolean;
  error: string;
}) {
  const [firstProductId, setFirstProductId] = useState("");
  const [firstQuantity, setFirstQuantity] = useState("1");

  useEffect(() => {
    const productSelect = form.querySelector('select[name="productId"]') as HTMLSelectElement | null;
    const quantityInput = form.querySelector('input[name="quantity"]') as HTMLInputElement | null;
    if (!productSelect || !quantityInput) return;
    const read = () => {
      setFirstProductId(productSelect.value);
      setFirstQuantity(quantityInput.value || "1");
    };
    read();
    productSelect.addEventListener("change", read);
    quantityInput.addEventListener("input", read);
    return () => {
      productSelect.removeEventListener("change", read);
      quantityInput.removeEventListener("input", read);
    };
  }, [form]);

  const lines = useMemo(() => {
    const source = [{ productId: firstProductId, quantity: firstQuantity }, ...extras];
    return source.map((line) => ({
      product: products.find((product) => String(product.id) === line.productId),
      quantity: Math.max(1, Number(line.quantity) || 1),
    })).filter((line): line is { product: Product; quantity: number } => Boolean(line.product));
  }, [extras, firstProductId, firstQuantity, products]);
  const totalUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const catalogTotal = lines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0);
  const purchaseCost = lines.reduce((sum, line) => sum + line.product.purchasePrice * line.quantity, 0);

  function addItem() {
    if (!products.length || extras.length >= 19) return;
    const preferred = products.find((product) => String(product.id) !== firstProductId) || products[0];
    setExtras((current) => [...current, { key: crypto.randomUUID(), productId: String(preferred.id), quantity: "1" }]);
  }

  function applyCatalogTotal() {
    const input = form.querySelector('input[name="saleAmount"]') as HTMLInputElement | null;
    if (input) setControlledInputValue(input, String(catalogTotal));
  }

  return (
    <section className="mj-multi-order-builder">
      <div className="mj-builder-head">
        <div><span>Commande composée</span><strong>Plusieurs produits dans la même commande</strong><small>Le premier produit reste ci-dessus. Ajoutez ici les autres articles.</small></div>
        <button type="button" onClick={addItem} disabled={!products.length || extras.length >= 19 || saving}>＋ Ajouter un autre produit</button>
      </div>

      {extras.length > 0 && <div className="mj-extra-lines">
        {extras.map((line, index) => {
          const selected = products.find((product) => String(product.id) === line.productId);
          return <div className="mj-extra-item-row" key={line.key}>
            <span className="mj-line-number">{index + 2}</span>
            <label><span>Produit</span><select value={line.productId} onChange={(event) => setExtras((current) => current.map((item) => item.key === line.key ? { ...item, productId: event.target.value } : item))} disabled={saving}>{products.map((product) => <option value={product.id} key={product.id}>{product.productCode} · {product.name} · stock {product.stockQuantity}</option>)}</select></label>
            <label><span>Quantité</span><input type="number" min="1" max="999" inputMode="numeric" value={line.quantity} onChange={(event) => setExtras((current) => current.map((item) => item.key === line.key ? { ...item, quantity: event.target.value } : item))} disabled={saving} /></label>
            <div className="mj-line-info"><small>{selected ? `${formatMoney(selected.salePrice)} / unité` : "—"}</small><strong>{selected ? formatMoney(selected.salePrice * Math.max(1, Number(line.quantity) || 1)) : "—"}</strong></div>
            <button className="mj-remove-line" type="button" aria-label="Retirer ce produit" onClick={() => setExtras((current) => current.filter((item) => item.key !== line.key))} disabled={saving}>×</button>
          </div>;
        })}
      </div>}

      <div className="mj-pack-box">
        <label className="mj-pack-toggle"><input type="checkbox" checked={isPack} onChange={(event) => setIsPack(event.target.checked)} disabled={saving || extras.length === 0} /><span><strong>C’est un pack</strong><small>Le stock reste déduit article par article.</small></span></label>
        {isPack && extras.length > 0 && <label className="mj-pack-name"><span>Nom du pack</span><input type="text" maxLength={100} value={packName} onChange={(event) => setPackName(event.target.value)} placeholder="Ex. Pack Duo rentrée" disabled={saving} /></label>}
      </div>

      {extras.length > 0 && <div className="mj-order-composition-summary">
        <div><span>Articles</span><strong>{totalUnits}</strong></div>
        <div><span>Coût produits</span><strong>{formatMoney(purchaseCost)}</strong></div>
        <div><span>Total catalogue</span><strong>{formatMoney(catalogTotal)}</strong></div>
        <button type="button" onClick={applyCatalogTotal} disabled={saving}>Utiliser ce total comme vente</button>
        <p>Pour une offre pack, vous pouvez ensuite modifier librement « Vente totale » afin d’appliquer votre prix promotionnel.</p>
      </div>}
      {error && <p className="mj-enhancement-error" role="alert">{error}</p>}
    </section>
  );
}

function WhatsAppSettingsPanel() {
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/settings/whatsapp", { cache: "no-store" });
        const body = await response.json() as { numbers?: WhatsAppNumber[]; canEdit?: boolean; error?: string };
        if (!response.ok) throw new Error(body.error || "Numéros WhatsApp indisponibles.");
        if (!cancelled) {
          setNumbers(body.numbers || []);
          setCanEdit(Boolean(body.canEdit));
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Numéros WhatsApp indisponibles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function addNumber() {
    setNumbers((current) => [...current, { id: crypto.randomUUID(), label: `WhatsApp ${current.length + 1}`, phone: "", isDefault: current.length === 0 }]);
  }

  async function save() {
    if (!canEdit || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/settings/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ numbers }),
      });
      const body = await response.json() as { numbers?: WhatsAppNumber[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Enregistrement impossible.");
      setNumbers(body.numbers || []);
      setNotice("Numéros WhatsApp enregistrés");
      window.setTimeout(() => setNotice(""), 2500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally { setSaving(false); }
  }

  return <section className="settings-panel mj-whatsapp-panel" id="whatsapp-maison-jiya">
    <div className="mj-whatsapp-head"><div><span className="card-kicker">Communication</span><h2>Numéros WhatsApp Maison Jiya</h2><p>Ajoutez et modifiez les numéros utilisés par votre équipe. Le numéro par défaut est clairement identifié.</p></div><span>{numbers.length} numéro{numbers.length === 1 ? "" : "s"}</span></div>
    {loading ? <p>Chargement des numéros…</p> : <div className="mj-whatsapp-list">
      {numbers.map((number, index) => <article className="mj-whatsapp-row" key={number.id}>
        <label><span>Nom / usage</span><input value={number.label} onChange={(event) => setNumbers((current) => current.map((item) => item.id === number.id ? { ...item, label: event.target.value } : item))} disabled={!canEdit || saving} placeholder="Ex. Commandes" /></label>
        <label><span>Numéro marocain</span><input type="tel" inputMode="tel" value={number.phone} onChange={(event) => setNumbers((current) => current.map((item) => item.id === number.id ? { ...item, phone: event.target.value } : item))} disabled={!canEdit || saving} placeholder="0612345678" /></label>
        <label className="mj-default-number"><input type="radio" name="mj-default-whatsapp" checked={number.isDefault} onChange={() => setNumbers((current) => current.map((item) => ({ ...item, isDefault: item.id === number.id })))} disabled={!canEdit || saving} /><span>Par défaut</span></label>
        {number.phone && <a className="mj-whatsapp-open" href={`https://wa.me/212${number.phone.replace(/\D/g, "").replace(/^0/, "")}`} target="_blank" rel="noreferrer">Ouvrir ↗</a>}
        {canEdit && <button type="button" className="mj-remove-whatsapp" onClick={() => setNumbers((current) => {
          const next = current.filter((item) => item.id !== number.id);
          if (number.isDefault && next.length) next[0] = { ...next[0], isDefault: true };
          return next;
        })} disabled={saving} aria-label={`Supprimer ${number.label || `WhatsApp ${index + 1}`}`}>Supprimer</button>}
      </article>)}
      {!numbers.length && <div className="mj-whatsapp-empty"><strong>Aucun numéro enregistré</strong><small>Ajoutez le premier numéro utilisé par Maison Jiya.</small></div>}
    </div>}
    {error && <p className="mj-enhancement-error" role="alert">{error}</p>}
    {notice && <p className="mj-enhancement-success">✓ {notice}</p>}
    {canEdit ? <div className="mj-whatsapp-actions"><button type="button" className="secondary-button" onClick={addNumber} disabled={saving || numbers.length >= 10}>＋ Ajouter un numéro</button><button type="button" className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les numéros"}</button></div> : <small>Seul l’administrateur peut modifier cette liste.</small>}
  </section>;
}

export default function PlatformEnhancements() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orderForm, setOrderForm] = useState<HTMLFormElement | null>(null);
  const [orderHost, setOrderHost] = useState<HTMLElement | null>(null);
  const [settingsHost, setSettingsHost] = useState<HTMLElement | null>(null);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [isPack, setIsPack] = useState(false);
  const [packName, setPackName] = useState("");
  const [multiSaving, setMultiSaving] = useState(false);
  const [multiError, setMultiError] = useState("");
  const bootstrapped = useRef(false);

  useEffect(() => {
    const scan = () => {
      const productSelect = document.querySelector('.modal form select[name="productId"]') as HTMLSelectElement | null;
      const form = productSelect?.form || null;
      setOrderForm((current) => current === form ? current : form);

      if (!bootstrapped.current && document.querySelector(".app-shell")) {
        bootstrapped.current = true;
        void (async () => {
          try {
            const bootstrapResponse = await fetch("/api/platform/bootstrap", { method: "POST" });
            const bootstrap = await bootstrapResponse.json() as { identityRestored?: boolean };
            if (bootstrapResponse.ok && bootstrap.identityRestored && !sessionStorage.getItem("mj-identity-restored-v1")) {
              sessionStorage.setItem("mj-identity-restored-v1", "true");
              window.location.reload();
              return;
            }
            const response = await fetch("/api/data", { cache: "no-store" });
            if (response.ok) {
              const body = await response.json() as { products?: Product[] };
              setProducts(body.products || []);
            }
          } catch (error) {
            console.error("Maison Jiya enhancements bootstrap failed", error);
          }
        })();
      }

      const settingsPage = document.querySelector(".settings-page") as HTMLElement | null;
      if (settingsPage && !settingsPage.querySelector('[data-mj-whatsapp-host="true"]')) {
        const host = document.createElement("div");
        host.dataset.mjWhatsappHost = "true";
        const intro = settingsPage.querySelector(".settings-intro");
        if (intro) intro.insertAdjacentElement("afterend", host); else settingsPage.prepend(host);
        setSettingsHost(host);
      } else if (!settingsPage) setSettingsHost(null);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setExtras([]); setIsPack(false); setPackName(""); setMultiError(""); setMultiSaving(false);
    if (!orderForm) { setOrderHost(null); return; }
    let cancelled = false;
    void fetch("/api/data", { cache: "no-store" }).then(async (response) => {
      if (!response.ok || cancelled) return;
      const body = await response.json() as { products?: Product[] };
      if (!cancelled) setProducts(body.products || []);
    }).catch(() => undefined);
    const host = document.createElement("div");
    host.dataset.mjMultiOrderHost = "true";
    const actions = orderForm.querySelector(".modal-actions");
    if (actions) actions.insertAdjacentElement("beforebegin", host); else orderForm.append(host);
    setOrderHost(host);
    return () => { cancelled = true; host.remove(); setOrderHost(null); };
  }, [orderForm]);

  useEffect(() => {
    if (!orderForm) return;
    const intercept = (event: SubmitEvent) => {
      if (event.target !== orderForm || extras.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (multiSaving) return;
      const formData = new FormData(orderForm);
      const firstProductId = String(formData.get("productId") || "");
      const firstQuantity = String(formData.get("quantity") || "1");
      const items = [
        { productId: firstProductId, quantity: firstQuantity },
        ...extras.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      ];
      const payload = Object.fromEntries(formData.entries());
      setMultiSaving(true); setMultiError("");
      void (async () => {
        try {
          const response = await fetch("/api/orders/multi", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...payload, items, isPack, packName }),
          });
          const body = await response.json() as { error?: string };
          if (!response.ok) throw new Error(body.error || "Création de la commande impossible.");
          window.location.reload();
        } catch (caught) {
          setMultiError(caught instanceof Error ? caught.message : "Création de la commande impossible.");
          setMultiSaving(false);
        }
      })();
    };
    document.addEventListener("submit", intercept, true);
    return () => document.removeEventListener("submit", intercept, true);
  }, [extras, isPack, multiSaving, orderForm, packName]);

  return <>
    {orderHost && orderForm ? createPortal(<MultiOrderBuilder form={orderForm} products={products} extras={extras} setExtras={setExtras} isPack={isPack} setIsPack={setIsPack} packName={packName} setPackName={setPackName} saving={multiSaving} error={multiError} />, orderHost as unknown as PortalContainer) : null}
    {settingsHost ? createPortal(<WhatsAppSettingsPanel />, settingsHost as unknown as PortalContainer) : null}
  </>;
}
