"use client";

import { FormEvent, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";

type Media = { id: number; ownerType: string; ownerId: number; kind: string; mimeType: string; sortOrder: number; createdAt: string };
type CmsProduct = {
  productId: number;
  productCode: string;
  internalName: string;
  category: string;
  stockQuantity: number;
  internalPrice: number;
  publicName: string;
  publicPrice: number;
  isVisible: boolean;
  availabilityMode: string;
  badge: string;
  description: string;
  sortOrder: number;
  media: Media[];
};
type OfferItem = { offerId?: number; productId: number; quantity: number };
type CmsOffer = {
  id: number;
  name: string;
  description: string;
  price: number;
  comparePrice: number;
  badge: string;
  isActive: boolean;
  sortOrder: number;
  items: OfferItem[];
  media: Media[];
};
type CmsData = {
  settings: {
    brandName: string;
    announcement: string;
    heroTitle: string;
    heroText: string;
    shippingNote: string;
    metaPixelId: string;
  };
  products: CmsProduct[];
  offers: CmsOffer[];
  brandMedia: Media[];
  canEdit: boolean;
};

type PortalTarget = Element | DocumentFragment;
const emptyData: CmsData = {
  settings: { brandName: "Maison Jiya", announcement: "", heroTitle: "", heroText: "", shippingNote: "", metaPixelId: "" },
  products: [], offers: [], brandMedia: [], canEdit: false,
};
const money = (value: number) => `${Number(value).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
const mediaUrl = (id: number) => `/api/storefront/media/${id}`;

async function compressImage(file: File) {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) throw new Error("Choisis une image JPG, PNG ou WebP.");
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de préparer cette image.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("Impossible de compresser cette image.");
  if (blob.size > 1_250_000) throw new Error("Cette image reste trop lourde. Choisis une photo plus légère.");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

export default function StorefrontCmsEnhancement() {
  const [navHost, setNavHost] = useState<PortalTarget | null>(null);
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const locate = () => {
      setNavHost(document.querySelector(".sidebar nav"));
      setWorkspace(document.querySelector(".workspace"));
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    const closeFromOtherNav = (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest(".nav-item");
      if (button && !(button as HTMLElement).dataset.storefrontCms) setOpen(false);
    };
    document.addEventListener("click", closeFromOtherNav, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", closeFromOtherNav, true);
    };
  }, []);

  return <>
    {navHost && createPortal(
      <button type="button" data-storefront-cms="true" className={open ? "nav-item active storefront-cms-nav" : "nav-item storefront-cms-nav"} onClick={() => setOpen(true)}>
        <span className="nav-index">WEB</span><span className="nav-label">Boutique publique</span>
      </button>,
      navHost,
    )}
    {open && workspace && createPortal(<StorefrontCmsPage close={() => setOpen(false)} />, workspace)}
  </>;
}

function StorefrontCmsPage({ close }: { close: () => void }) {
  const [data, setData] = useState<CmsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"identity" | "products" | "offers">("identity");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/storefront/admin", { cache: "no-store" });
      const body = await response.json() as CmsData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Boutique publique indisponible.");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Boutique publique indisponible.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function save(payload: Record<string, unknown>) {
    setError(""); setNotice("");
    const response = await fetch("/api/storefront/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as CmsData & { error?: string };
    if (!response.ok) throw new Error(body.error || "Enregistrement impossible.");
    setData(body);
    setNotice("Boutique publique mise à jour");
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function upload(ownerType: "brand" | "product" | "offer", ownerId: number, kind: "logo" | "hero" | "gallery", event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.files?.[0];
    event.target.value = "";
    if (!raw) return;
    setError("");
    try {
      const file = await compressImage(raw);
      const form = new FormData();
      form.set("ownerType", ownerType); form.set("ownerId", String(ownerId)); form.set("kind", kind); form.set("file", file);
      const response = await fetch("/api/storefront/admin/media", { method: "POST", body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Upload impossible.");
      await load();
      setNotice("Photo ajoutée");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Upload impossible."); }
  }

  async function removeMedia(id: number) {
    if (!window.confirm("Supprimer cette photo de la boutique publique ?")) return;
    const response = await fetch(`/api/storefront/admin/media?id=${id}`, { method: "DELETE" });
    const body = await response.json() as { error?: string };
    if (!response.ok) { setError(body.error || "Suppression impossible."); return; }
    await load();
  }

  const categories = useMemo(() => ["Toutes", ...Array.from(new Set(data.products.map((product) => product.category))).sort((a, b) => a.localeCompare(b, "fr"))], [data.products]);
  const filteredProducts = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase("fr");
    return data.products.filter((product) => (category === "Toutes" || product.category === category) && (!clean || `${product.productCode} ${product.internalName} ${product.publicName}`.toLocaleLowerCase("fr").includes(clean)));
  }, [category, data.products, query]);

  return <section className="storefront-cms-page">
    <header className="storefront-cms-topbar">
      <div><span>Boutique publique</span><h1>Piloter ce que voient les clients</h1><p>Cette zone est séparée de tes coûts, bénéfices, capital et autres données privées.</p></div>
      <div><a href="/boutique" target="_blank" rel="noreferrer">Voir la boutique ↗</a><button type="button" onClick={close}>Fermer ×</button></div>
    </header>
    <nav className="storefront-cms-tabs">
      <button className={tab === "identity" ? "active" : ""} onClick={() => setTab("identity")}>Identité du site</button>
      <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Catalogue public <b>{data.products.length}</b></button>
      <button className={tab === "offers" ? "active" : ""} onClick={() => setTab("offers")}>Packs & offres <b>{data.offers.length}</b></button>
    </nav>
    {notice && <div className="storefront-cms-notice success">✓ {notice}</div>}
    {error && <div className="storefront-cms-notice error">{error}</div>}
    {loading ? <div className="storefront-cms-loading">Chargement de la boutique publique…</div> : <>
      {tab === "identity" && <IdentityPanel data={data} save={save} upload={upload} removeMedia={removeMedia} />}
      {tab === "products" && <div className="storefront-cms-products">
        <div className="storefront-cms-filterbar"><label><span>Rechercher</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou référence…" /></label><label><span>Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><div><strong>{filteredProducts.length}</strong><small>produit(s) affiché(s)</small></div></div>
        <div className="storefront-cms-product-list">{filteredProducts.map((product) => <ProductEditor key={`${product.productId}-${product.publicName}-${product.publicPrice}-${product.media.length}`} product={product} canEdit={data.canEdit} save={save} upload={upload} removeMedia={removeMedia} />)}</div>
      </div>}
      {tab === "offers" && <OffersPanel data={data} save={save} upload={upload} removeMedia={removeMedia} />}
    </>}
  </section>;
}

function IdentityPanel({ data, save, upload, removeMedia }: { data: CmsData; save: (p: Record<string, unknown>) => Promise<void>; upload: StorefrontUpload; removeMedia: (id: number) => Promise<void> }) {
  const logo = data.brandMedia.find((item) => item.kind === "logo");
  const hero = data.brandMedia.find((item) => item.kind === "hero");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!data.canEdit || saving) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try { await save({ action: "saveGeneral", brandName: form.get("brandName"), announcement: form.get("announcement"), heroTitle: form.get("heroTitle"), heroText: form.get("heroText"), shippingNote: form.get("shippingNote"), metaPixelId: form.get("metaPixelId") }); } finally { setSaving(false); }
  }
  return <div className="storefront-cms-identity-grid">
    <form className="storefront-cms-card storefront-cms-general" onSubmit={(event) => void submit(event)}>
      <div className="storefront-cms-card-head"><div><span>Texte & identité</span><h2>Informations visibles sur le site public</h2></div><span className="storefront-cms-private-badge">Public uniquement</span></div>
      <div className="storefront-cms-form-grid"><label><span>Nom affiché de la marque</span><input name="brandName" defaultValue={data.settings.brandName} disabled={!data.canEdit} /></label><label><span>Bandeau en haut du site</span><input name="announcement" defaultValue={data.settings.announcement} disabled={!data.canEdit} /></label></div>
      <label><span>Grand titre d’accueil</span><input name="heroTitle" defaultValue={data.settings.heroTitle} disabled={!data.canEdit} /></label>
      <label><span>Texte d’accueil</span><textarea name="heroText" rows={4} defaultValue={data.settings.heroText} disabled={!data.canEdit} /></label>
      <label><span>Message sur la livraison</span><input name="shippingNote" defaultValue={data.settings.shippingNote} disabled={!data.canEdit} /></label>
      <label><span>Meta Pixel ID (optionnel)</span><input name="metaPixelId" inputMode="numeric" defaultValue={data.settings.metaPixelId} placeholder="Ex. 123456789…" disabled={!data.canEdit} /><small>Tu pourras le remplir quand tu voudras utiliser la boutique avec Meta Ads.</small></label>
      <button className="primary-button" type="submit" disabled={!data.canEdit || saving}>{saving ? "Enregistrement…" : "Enregistrer l’identité publique"}</button>
    </form>
    <div className="storefront-cms-card storefront-cms-brand-media"><div className="storefront-cms-card-head"><div><span>Visuels de marque</span><h2>Logo & bannière</h2></div></div>
      <MediaSlot title="Logo du site public" media={logo} canEdit={data.canEdit} onUpload={(event) => upload("brand", 0, "logo", event)} onRemove={removeMedia} />
      <MediaSlot title="Image de couverture" media={hero} canEdit={data.canEdit} onUpload={(event) => upload("brand", 0, "hero", event)} onRemove={removeMedia} />
      <small>Les images sont automatiquement redimensionnées et compressées avant l’envoi.</small>
    </div>
  </div>;
}

type StorefrontUpload = (ownerType: "brand" | "product" | "offer", ownerId: number, kind: "logo" | "hero" | "gallery", event: ChangeEvent<HTMLInputElement>) => Promise<void>;

function MediaSlot({ title, media, canEdit, onUpload, onRemove }: { title: string; media?: Media; canEdit: boolean; onUpload: (e: ChangeEvent<HTMLInputElement>) => Promise<void>; onRemove: (id: number) => Promise<void> }) {
  return <div className="storefront-cms-media-slot"><div>{media ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(media.id)} alt={title} /></> : <span>Aucune image</span>}</div><section><strong>{title}</strong><small>JPG, PNG ou WebP</small>{canEdit && <label className="storefront-cms-upload">Choisir une photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void onUpload(event)} /></label>}{media && canEdit && <button type="button" onClick={() => void onRemove(media.id)}>Supprimer</button>}</section></div>;
}

function ProductEditor({ product, canEdit, save, upload, removeMedia }: { product: CmsProduct; canEdit: boolean; save: (p: Record<string, unknown>) => Promise<void>; upload: StorefrontUpload; removeMedia: (id: number) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canEdit || saving) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try { await save({ action: "saveProduct", productId: product.productId, publicName: form.get("publicName"), publicPrice: form.get("publicPrice"), isVisible: form.get("isVisible") === "on", availabilityMode: form.get("availabilityMode"), badge: form.get("badge"), description: form.get("description"), sortOrder: form.get("sortOrder") }); } finally { setSaving(false); }
  }
  const effectiveOut = product.stockQuantity <= 0 || product.availabilityMode === "out_of_stock";
  return <details className="storefront-cms-product" open={false}>
    <summary><div className="storefront-cms-product-main">{product.media[0] ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(product.media[0].id)} alt="" /></> : <span className="storefront-cms-product-placeholder">{product.category.slice(0, 1)}</span>}<div><strong>{product.publicName || product.internalName}</strong><small>{product.productCode} · {product.category}</small></div></div><div className="storefront-cms-product-status"><span className={effectiveOut ? "out" : "in"}>{effectiveOut ? "Rupture" : "Disponible"}</span><strong>{money(product.publicPrice || product.internalPrice)}</strong><small>Stock réel : {product.stockQuantity}</small></div><b>⌄</b></summary>
    <form onSubmit={(event) => void submit(event)}><div className="storefront-cms-product-editgrid"><label><span>Nom sur le site public</span><input name="publicName" defaultValue={product.publicName} disabled={!canEdit} /></label><label><span>Prix public (MAD)</span><input name="publicPrice" type="number" min="0" step="1" defaultValue={product.publicPrice} disabled={!canEdit} /></label><label><span>Disponibilité publique</span><select name="availabilityMode" defaultValue={product.availabilityMode} disabled={!canEdit}><option value="auto">Automatique selon le stock</option><option value="available">Disponible si stock réel &gt; 0</option><option value="out_of_stock">Forcer « Rupture »</option></select></label><label><span>Badge</span><input name="badge" defaultValue={product.badge} placeholder="Nouveau, Best-seller…" disabled={!canEdit} /></label><label><span>Ordre d’affichage</span><input name="sortOrder" type="number" defaultValue={product.sortOrder} disabled={!canEdit} /></label><label className="storefront-cms-visible"><input name="isVisible" type="checkbox" defaultChecked={product.isVisible} disabled={!canEdit} /><span>Afficher ce produit sur le site public</span></label></div><label><span>Description publique</span><textarea name="description" rows={3} defaultValue={product.description} placeholder="Courte description visible par les clients…" disabled={!canEdit} /></label>
      <div className="storefront-cms-gallery"><div className="storefront-cms-gallery-head"><div><strong>Photos du produit</strong><small>La première photo est utilisée comme visuel principal.</small></div>{canEdit && product.media.length < 6 && <label className="storefront-cms-upload">＋ Ajouter une photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload("product", product.productId, "gallery", event)} /></label>}</div><div className="storefront-cms-gallery-grid">{product.media.map((media) => <figure key={media.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(media.id)} alt="" />{canEdit && <button type="button" onClick={() => void removeMedia(media.id)}>×</button>}</figure>)}{!product.media.length && <div className="storefront-cms-no-media">Ajoute les vraies photos que les clients doivent voir.</div>}</div></div>
      <div className="storefront-cms-save-row"><small>Prix interne actuel : {money(product.internalPrice)} · stock interne : {product.stockQuantity}</small><button className="primary-button" type="submit" disabled={!canEdit || saving}>{saving ? "Enregistrement…" : "Enregistrer ce produit public"}</button></div></form>
  </details>;
}

function OffersPanel({ data, save, upload, removeMedia }: { data: CmsData; save: (p: Record<string, unknown>) => Promise<void>; upload: StorefrontUpload; removeMedia: (id: number) => Promise<void> }) {
  const blank: CmsOffer = { id: 0, name: "", description: "", price: 0, comparePrice: 0, badge: "Offre", isActive: true, sortOrder: 0, items: [], media: [] };
  return <div className="storefront-cms-offers"><div className="storefront-cms-offer-intro"><div><span>Packs & promotions</span><h2>Crée tes offres sans créer de faux produit dans le stock</h2><p>Chaque pack est composé de vrais produits. Quand un client commande, le stock est suivi article par article.</p></div><strong>{data.offers.filter((offer) => offer.isActive).length} offre(s) active(s)</strong></div>
    <OfferEditor key="new-offer" offer={blank} products={data.products} canEdit={data.canEdit} save={save} upload={upload} removeMedia={removeMedia} isNew />
    <div className="storefront-cms-offer-list">{data.offers.map((offer) => <OfferEditor key={`${offer.id}-${offer.name}-${offer.items.length}-${offer.media.length}`} offer={offer} products={data.products} canEdit={data.canEdit} save={save} upload={upload} removeMedia={removeMedia} />)}</div>
  </div>;
}

function OfferEditor({ offer, products, canEdit, save, upload, removeMedia, isNew = false }: { offer: CmsOffer; products: CmsProduct[]; canEdit: boolean; save: (p: Record<string, unknown>) => Promise<void>; upload: StorefrontUpload; removeMedia: (id: number) => Promise<void>; isNew?: boolean }) {
  const [items, setItems] = useState<OfferItem[]>(offer.items.length ? offer.items : [{ productId: products[0]?.productId || 0, quantity: 1 }]);
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canEdit || saving) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try { await save({ action: "saveOffer", offerId: offer.id, name: form.get("name"), description: form.get("description"), price: form.get("price"), comparePrice: form.get("comparePrice"), badge: form.get("badge"), isActive: form.get("isActive") === "on", sortOrder: form.get("sortOrder"), items }); if (isNew) event.currentTarget.reset(); } finally { setSaving(false); }
  }
  async function removeOffer() {
    if (!offer.id || !window.confirm(`Supprimer l’offre « ${offer.name} » ?`)) return;
    await save({ action: "deleteOffer", offerId: offer.id });
  }
  return <details className={`storefront-cms-offer-card ${isNew ? "new" : ""}`} open={isNew}>
    <summary><div><span>{isNew ? "＋ Nouvelle offre" : offer.badge || "Pack"}</span><strong>{isNew ? "Créer un pack ou une offre" : offer.name}</strong><small>{isNew ? "Choisis les produits, le prix et les photos." : `${offer.items.length} composant(s) · ${money(offer.price)}`}</small></div>{!isNew && <span className={offer.isActive ? "storefront-cms-offer-active" : "storefront-cms-offer-off"}>{offer.isActive ? "En ligne" : "Masquée"}</span>}<b>⌄</b></summary>
    <form onSubmit={(event) => void submit(event)}><div className="storefront-cms-product-editgrid"><label><span>Nom de l’offre</span><input name="name" defaultValue={offer.name} required disabled={!canEdit} placeholder="Ex. Pack Duo Élégance" /></label><label><span>Prix offre (MAD)</span><input name="price" type="number" min="1" step="1" defaultValue={offer.price || ""} required disabled={!canEdit} /></label><label><span>Ancien prix barré (optionnel)</span><input name="comparePrice" type="number" min="0" step="1" defaultValue={offer.comparePrice || ""} disabled={!canEdit} /></label><label><span>Badge</span><input name="badge" defaultValue={offer.badge} placeholder="-20%, Offre rentrée…" disabled={!canEdit} /></label><label><span>Ordre</span><input name="sortOrder" type="number" defaultValue={offer.sortOrder} disabled={!canEdit} /></label><label className="storefront-cms-visible"><input name="isActive" type="checkbox" defaultChecked={offer.isActive} disabled={!canEdit} /><span>Afficher cette offre</span></label></div><label><span>Description de l’offre</span><textarea name="description" rows={3} defaultValue={offer.description} disabled={!canEdit} placeholder="Explique ce que contient le pack…" /></label>
      <div className="storefront-cms-components"><div className="storefront-cms-gallery-head"><div><strong>Produits inclus</strong><small>Le stock sera déduit sur ces produits après confirmation.</small></div>{canEdit && items.length < 20 && <button type="button" className="secondary-button" onClick={() => setItems((current) => [...current, { productId: products[0]?.productId || 0, quantity: 1 }])}>＋ Ajouter un composant</button>}</div>{items.map((item, index) => <div className="storefront-cms-component-row" key={`${index}-${item.productId}`}><select value={item.productId} onChange={(event) => setItems((current) => current.map((row, i) => i === index ? { ...row, productId: Number(event.target.value) } : row))} disabled={!canEdit}>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productCode} · {product.internalName} · stock {product.stockQuantity}</option>)}</select><input type="number" min="1" max="50" value={item.quantity} onChange={(event) => setItems((current) => current.map((row, i) => i === index ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row))} disabled={!canEdit} />{canEdit && items.length > 1 && <button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>×</button>}</div>)}</div>
      {!isNew && <div className="storefront-cms-gallery"><div className="storefront-cms-gallery-head"><div><strong>Photos de l’offre</strong><small>Jusqu’à 6 images.</small></div>{canEdit && offer.media.length < 6 && <label className="storefront-cms-upload">＋ Ajouter une photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void upload("offer", offer.id, "gallery", event)} /></label>}</div><div className="storefront-cms-gallery-grid">{offer.media.map((media) => <figure key={media.id}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={mediaUrl(media.id)} alt="" />{canEdit && <button type="button" onClick={() => void removeMedia(media.id)}>×</button>}</figure>)}{!offer.media.length && <div className="storefront-cms-no-media">Aucune photo pour cette offre.</div>}</div></div>}
      <div className="storefront-cms-save-row">{!isNew && canEdit ? <button className="danger-text-button" type="button" onClick={() => void removeOffer()}>Supprimer l’offre</button> : <small>{isNew ? "Enregistre d’abord l’offre, puis ajoute ses photos." : ""}</small>}<button className="primary-button" type="submit" disabled={!canEdit || saving}>{saving ? "Enregistrement…" : isNew ? "Créer l’offre" : "Enregistrer l’offre"}</button></div></form>
  </details>;
}
