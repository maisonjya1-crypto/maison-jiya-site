"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";

type Media = {
  id: number;
  ownerType: string;
  ownerId: number;
  kind: string;
  mimeType: string;
  sortOrder: number;
  createdAt: string;
};

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

type CmsMarketingSection = {
  id: number;
  eyebrow: string;
  title: string;
  body: string;
  badge: string;
  ctaLabel: string;
  target: "offers" | "catalogue" | "Montres" | "Bijoux" | "Portefeuilles";
  placement: "after_categories" | "before_catalogue" | "before_contact";
  isActive: boolean;
  sortOrder: number;
  media: Media[];
};


type CmsSettings = {
  brandName: string;
  announcement: string;
  heroTitle: string;
  heroText: string;
  shippingNote: string;
  metaPixelId: string;
  promoEnabled: boolean;
  promoBadge: string;
  promoTitle: string;
  promoText: string;
  promoCtaLabel: string;
  promoOfferId: number;
  contactWhatsapp: string;
  defaultBusinessWhatsapp: string;
  contactUsesDefault: boolean;
};

type CmsData = {
  settings: CmsSettings;
  products: CmsProduct[];
  offers: CmsOffer[];
  marketingSections: CmsMarketingSection[];
  brandMedia: Media[];
  canEdit: boolean;
};

type PortalTarget = Element | DocumentFragment;
type UploadOwner = "brand" | "product" | "offer" | "marketing";
type UploadKind = "logo" | "hero" | "gallery";
type UploadMany = (ownerType: UploadOwner, ownerId: number, kind: UploadKind, files: FileList | null, maxFiles?: number) => Promise<void>;

const MAX_GALLERY = 6;
const emptyData: CmsData = {
  settings: {
    brandName: "Maison Jiya",
    announcement: "",
    heroTitle: "",
    heroText: "",
    shippingNote: "",
    metaPixelId: "",
    promoEnabled: false,
    promoBadge: "OFFRE",
    promoTitle: "",
    promoText: "",
    promoCtaLabel: "Voir l’offre",
    promoOfferId: 0,
    contactWhatsapp: "",
    defaultBusinessWhatsapp: "",
    contactUsesDefault: true,
  },
  products: [],
  offers: [],
  marketingSections: [],
  brandMedia: [],
  canEdit: false,
};

const money = (value: number) => `${Number(value).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
const mediaUrl = (id: number) => `/api/storefront/media/${id}`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const publicCategory = (category: string) => ["Wallet", "Wallets", "Portefeuille", "Portefeuilles"].includes(category) ? "Portefeuilles" : category;

async function encodeCanvas(canvas: HTMLCanvasElement, mimeType: "image/webp" | "image/jpeg", quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

async function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  const webp = await encodeCanvas(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return webp;
  return encodeCanvas(canvas, "image/jpeg", quality);
}

async function loadImageForCanvas(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          source: bitmap as CanvasImageSource,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        };
      }
      bitmap.close();
    } catch {
      // Safari/iOS peut refuser createImageBitmap pour certaines photos locales.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Décodage image impossible"));
      image.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Dimensions d’image invalides");
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Cette photo ne peut pas être lue sur ce téléphone. Essaie une autre photo ou une capture d’écran.");
  }
}

async function compressImage(file: File, kind: UploadKind) {
  if (!file || file.size <= 0) throw new Error("Choisis une photo.");
  if (file.type && !file.type.startsWith("image/")) throw new Error("Choisis un fichier image.");
  if (file.size > 30_000_000) throw new Error("Cette photo est trop lourde. Choisis une photo de moins de 30 Mo.");

  const image = await loadImageForCanvas(file);
  const limits = kind === "gallery"
    ? { maxSide: 900, targetBytes: 300_000, maxBytes: 450_000 }
    : kind === "logo"
      ? { maxSide: 800, targetBytes: 260_000, maxBytes: 450_000 }
      : { maxSide: 1600, targetBytes: 600_000, maxBytes: 850_000 };
  const scale = Math.min(1, limits.maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    image.release();
    throw new Error("Impossible de préparer cette image.");
  }

  try {
    context.drawImage(image.source, 0, 0, width, height);
  } finally {
    image.release();
  }

  let lastBlob: Blob | null = null;
  for (const quality of [0.78, 0.68, 0.58, 0.48, 0.4]) {
    lastBlob = await canvasBlob(canvas, quality);
    if (lastBlob && lastBlob.size <= limits.targetBytes) break;
  }
  if (!lastBlob || lastBlob.size > limits.maxBytes) throw new Error("Cette photo reste trop lourde après compression.");

  const extension = lastBlob.type === "image/webp" ? "webp" : "jpg";
  const baseName = file.name ? file.name.replace(/\.[^.]+$/, "") : "photo";
  return new File([lastBlob], `${baseName}.${extension}`, { type: lastBlob.type || "image/jpeg" });
}

export default function StorefrontCmsV2Enhancement() {
  const [navHost, setNavHost] = useState<PortalTarget | null>(null);
  const [workspace, setWorkspace] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const locate = () => {
      setNavHost(document.querySelector(".sidebar nav"));
      setWorkspace(document.querySelector<HTMLElement>(".workspace"));
    };
    const timer = window.setTimeout(locate, 0);
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    const closeFromOtherNav = (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest(".nav-item");
      if (button && !(button as HTMLElement).dataset.storefrontCmsV2) setOpen(false);
    };
    document.addEventListener("click", closeFromOtherNav, true);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("click", closeFromOtherNav, true);
    };
  }, []);

  return <>
    {navHost && createPortal(
      <button
        type="button"
        data-storefront-cms-v2="true"
        className={open ? "nav-item active storefront-cms-nav" : "nav-item storefront-cms-nav"}
        onClick={() => setOpen(true)}
      >
        <span className="nav-index">WEB</span>
        <span className="nav-label">Boutique publique</span>
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
  const [tab, setTab] = useState<"identity" | "products" | "offers" | "marketing">("identity");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [productLimit, setProductLimit] = useState(16);
  const [uploadingLabel, setUploadingLabel] = useState("");
  const pageRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/storefront/admin", { cache: "no-store" });
      const body = await response.json() as CmsData & { error?: string };
      if (!response.ok) throw new Error(body.error || "Boutique publique indisponible.");
      setData(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Boutique publique indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(payload: Record<string, unknown>) {
    setError("");
    setNotice("");
    const response = await fetch("/api/storefront/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as CmsData & { error?: string };
    if (!response.ok) throw new Error(body.error || "Enregistrement impossible.");
    setData(body);
    setNotice("Boutique publique mise à jour");
    window.setTimeout(() => setNotice(""), 2400);
  }

  function addMediaLocally(media: Media) {
    const append = (items: Media[], replaceKind = false) => {
      const filtered = items.filter((item) => item.id !== media.id && (!replaceKind || item.kind !== media.kind));
      return [...filtered, media].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    };
    setData((current) => {
      if (media.ownerType === "brand") return { ...current, brandMedia: append(current.brandMedia, true) };
      if (media.ownerType === "product") return { ...current, products: current.products.map((product) => product.productId === media.ownerId ? { ...product, media: append(product.media) } : product) };
      if (media.ownerType === "offer") return { ...current, offers: current.offers.map((offer) => offer.id === media.ownerId ? { ...offer, media: append(offer.media) } : offer) };
      if (media.ownerType === "marketing") return { ...current, marketingSections: current.marketingSections.map((section) => section.id === media.ownerId ? { ...section, media: append(section.media, true) } : section) };
      return current;
    });
  }

  function removeMediaLocally(id: number) {
    const drop = (items: Media[]) => items.filter((item) => item.id !== id);
    setData((current) => ({
      ...current,
      brandMedia: drop(current.brandMedia),
      products: current.products.map((product) => ({ ...product, media: drop(product.media) })),
      offers: current.offers.map((offer) => ({ ...offer, media: drop(offer.media) })),
      marketingSections: current.marketingSections.map((section) => ({ ...section, media: drop(section.media) })),
    }));
  }

  async function uploadMany(ownerType: UploadOwner, ownerId: number, kind: UploadKind, files: FileList | null, maxFiles?: number) {
    if (!files?.length) return;
    setError("");
    setNotice("");
    try {
      const allowed = kind === "gallery" ? Math.max(0, Math.min(MAX_GALLERY, maxFiles ?? MAX_GALLERY)) : 1;
      const selected = Array.from(files).slice(0, allowed);
      if (!selected.length) throw new Error(`Maximum ${MAX_GALLERY} photos par produit ou pack.`);
      for (let index = 0; index < selected.length; index += 1) {
        const raw = selected[index];
        setUploadingLabel(selected.length > 1 ? `Préparation photo ${index + 1}/${selected.length}…` : "Préparation de la photo…");
        const file = await compressImage(raw, kind);
        setUploadingLabel(selected.length > 1 ? `Envoi photo ${index + 1}/${selected.length}…` : "Envoi de la photo…");
        const form = new FormData();
        form.set("ownerType", ownerType);
        form.set("ownerId", String(ownerId));
        form.set("kind", kind);
        form.set("file", file);
        const response = await fetch("/api/storefront/admin/media", { method: "POST", body: form });
        const body = await response.json() as { error?: string; media?: Media };
        if (!response.ok) throw new Error(body.error || "Upload impossible.");
        if (body.media) addMediaLocally(body.media);
      }
      setNotice(selected.length > 1 ? `${selected.length} photos ajoutées` : "Photo ajoutée");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload impossible.");
    } finally {
      setUploadingLabel("");
    }
  }

  async function removeMedia(id: number) {
    if (!window.confirm("Supprimer cette photo de la boutique publique ?")) return;
    const response = await fetch(`/api/storefront/admin/media?id=${id}`, { method: "DELETE" });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setError(body.error || "Suppression impossible.");
      return;
    }
    removeMediaLocally(id);
  }

  const categories = useMemo(() => ["Toutes", ...Array.from(new Set(data.products.map((product) => publicCategory(product.category)))).sort((a, b) => a.localeCompare(b, "fr"))], [data.products]);
  const filteredProducts = useMemo(() => {
    const clean = normalize(query.trim());
    return data.products.filter((product) => {
      if (category !== "Toutes" && publicCategory(product.category) !== category) return false;
      if (!clean) return true;
      return normalize(`${product.productCode} ${product.internalName} ${product.publicName} ${publicCategory(product.category)}`).includes(clean);
    });
  }, [category, data.products, query]);
  const visibleProducts = filteredProducts.slice(0, productLimit);

  function switchTab(next: "identity" | "products" | "offers" | "marketing") {
    if (next === tab) return;
    setTab(next);
    setNotice("");
    setError("");
    if (next === "products") setProductLimit(16);
    window.requestAnimationFrame(() => pageRef.current?.scrollTo({ top: 0, behavior: "auto" }));
  }

  return <section ref={pageRef} className="storefront-cms-page storefront-cms-v2">
    <header className="storefront-cms-topbar">
      <div>
        <span>Boutique publique</span>
        <h1>Piloter uniquement ce que voient les clients</h1>
        <p>Produits publics, photos, prix, packs, offres et contact restent séparés de tes coûts et de ta gestion interne.</p>
        {!loading && <div className={`storefront-cms-access-status ${data.canEdit ? "can-edit" : "read-only"}`}>
          <strong>{data.canEdit ? "Mode édition" : "Lecture seule"}</strong>
          <span>{data.canEdit ? "Tu peux modifier les prix, l’affichage, les textes, les offres et ajouter/supprimer les photos." : "Ton compte peut consulter la boutique, mais pas modifier les prix, offres ou photos."}</span>
        </div>}
      </div>
      <div>
        <a href="/boutique?source=gestion&pwa=v4" target="_blank" rel="noreferrer">Voir la boutique ↗</a>
        <button type="button" onClick={close}>Fermer ×</button>
      </div>
    </header>

    <nav className="storefront-cms-tabs" aria-label="Sections de la boutique publique">
      <button type="button" className={tab === "identity" ? "active" : ""} aria-pressed={tab === "identity"} onClick={() => switchTab("identity")}>Identité & contact</button>
      <button type="button" className={tab === "products" ? "active" : ""} aria-pressed={tab === "products"} onClick={() => switchTab("products")}>Catalogue public <b>{data.products.length}</b></button>
      <button type="button" className={tab === "offers" ? "active" : ""} aria-pressed={tab === "offers"} onClick={() => switchTab("offers")}>Packs & offres <b>{data.offers.length}</b></button>
      <button type="button" className={tab === "marketing" ? "active" : ""} aria-pressed={tab === "marketing"} onClick={() => switchTab("marketing")}>Blocs promo <b>{data.marketingSections.length}</b></button>
    </nav>

    {notice && <div className="storefront-cms-notice success">✓ {notice}</div>}
    {error && <div className="storefront-cms-notice error">{error}</div>}
    {uploadingLabel && <div className="storefront-cms-upload-progress" role="status"><span className="storefront-cms-upload-spinner" />{uploadingLabel}</div>}

    {loading ? <div className="storefront-cms-loading">Chargement de la boutique publique…</div> : <>
      {tab === "identity" && <IdentityPanel data={data} save={save} uploadMany={uploadMany} removeMedia={removeMedia} />}
      {tab === "products" && <div className="storefront-cms-products">
        <div className="storefront-cms-filterbar">
          <label><span>Rechercher</span><input value={query} onChange={(event) => { setQuery(event.target.value); setProductLimit(16); }} placeholder="Nom, référence…" /></label>
          <label><span>Catégorie</span><select value={category} onChange={(event) => { setCategory(event.target.value); setProductLimit(16); }}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <div><strong>{filteredProducts.length}</strong><small>produit(s)</small></div>
        </div>
        <div className="storefront-cms-public-category-note">Électronique et Boîtes sont volontairement exclues de la boutique publique. Wallets est affiché aux clients sous le nom « Portefeuilles ».</div>
        <div className="storefront-cms-product-list">
          {visibleProducts.map((product) => <ProductEditor key={product.productId} product={product} canEdit={data.canEdit} save={save} uploadMany={uploadMany} removeMedia={removeMedia} />)}
        </div>
        {visibleProducts.length < filteredProducts.length && <div className="storefront-cms-load-more-wrap"><button type="button" className="secondary-button" onClick={() => setProductLimit((value) => value + 16)}>Afficher 16 produits de plus ({filteredProducts.length - visibleProducts.length} restant(s))</button></div>}
      </div>}
      {tab === "offers" && <OffersPanel data={data} save={save} uploadMany={uploadMany} removeMedia={removeMedia} />}
      {tab === "marketing" && <MarketingPanel data={data} save={save} uploadMany={uploadMany} removeMedia={removeMedia} />}
    </>}
  </section>;
}

function IdentityPanel({ data, save, uploadMany, removeMedia }: {
  data: CmsData;
  save: (payload: Record<string, unknown>) => Promise<void>;
  uploadMany: UploadMany;
  removeMedia: (id: number) => Promise<void>;
}) {
  const logo = data.brandMedia.find((item) => item.kind === "logo");
  const hero = data.brandMedia.find((item) => item.kind === "hero");
  const [saving, setSaving] = useState(false);
  const [useDefaultWhatsapp, setUseDefaultWhatsapp] = useState(data.settings.contactUsesDefault);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data.canEdit || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await save({
        action: "saveGeneral",
        brandName: form.get("brandName"),
        announcement: form.get("announcement"),
        heroTitle: form.get("heroTitle"),
        heroText: form.get("heroText"),
        shippingNote: form.get("shippingNote"),
        metaPixelId: form.get("metaPixelId"),
        promoEnabled: form.get("promoEnabled") === "on",
        promoBadge: form.get("promoBadge"),
        promoTitle: form.get("promoTitle"),
        promoText: form.get("promoText"),
        promoCtaLabel: form.get("promoCtaLabel"),
        promoOfferId: form.get("promoOfferId"),
        contactWhatsapp: form.get("contactWhatsapp"),
        useDefaultWhatsapp,
      });
    } finally {
      setSaving(false);
    }
  }

  return <div className="storefront-cms-identity-grid">
    <form className="storefront-cms-card storefront-cms-general" onSubmit={(event) => void submit(event)}>
      <div className="storefront-cms-card-head"><div><span>Texte & identité</span><h2>Informations visibles sur le site public</h2></div><span className="storefront-cms-private-badge">Public uniquement</span></div>
      <div className="storefront-cms-form-grid">
        <label><span>Nom affiché de la marque</span><input name="brandName" defaultValue={data.settings.brandName} disabled={!data.canEdit} /></label>
        <label><span>Bandeau en haut du site</span><input name="announcement" defaultValue={data.settings.announcement} disabled={!data.canEdit} /></label>
      </div>
      <label><span>Grand titre d’accueil</span><input name="heroTitle" defaultValue={data.settings.heroTitle} disabled={!data.canEdit} /></label>
      <label><span>Texte d’accueil</span><textarea name="heroText" rows={4} defaultValue={data.settings.heroText} disabled={!data.canEdit} /></label>
      <label><span>Message sur la livraison</span><input name="shippingNote" defaultValue={data.settings.shippingNote} disabled={!data.canEdit} /></label>

      <div className="storefront-cms-contact-box">
        <div><span>Contact public</span><h3>WhatsApp Business</h3><p>Ce numéro apparaît automatiquement dans la boutique et dans le bloc Contact.</p></div>
        <label className="storefront-cms-visible">
          <input type="checkbox" checked={useDefaultWhatsapp} onChange={(event) => setUseDefaultWhatsapp(event.target.checked)} disabled={!data.canEdit} />
          <span>Utiliser automatiquement le numéro WhatsApp Business par défaut</span>
        </label>
        <label>
          <span>Numéro WhatsApp affiché aux clients</span>
          <input name="contactWhatsapp" type="tel" inputMode="tel" defaultValue={data.settings.contactWhatsapp} placeholder="06XXXXXXXX" disabled={!data.canEdit || useDefaultWhatsapp} />
          <small>{data.settings.defaultBusinessWhatsapp ? `Numéro Business par défaut : ${data.settings.defaultBusinessWhatsapp}` : "Aucun numéro Business par défaut n’est encore configuré dans Paramètres."}</small>
        </label>
      </div>

      <div className="storefront-cms-promo-box">
        <div>
          <span>Barre promotionnelle</span>
          <h3>Mettre une offre en avant en haut de la boutique</h3>
          <p>Tu écris librement le message : pack, -20 %, « 1+1=3 », remise, cadeau… Le bouton peut renvoyer vers une offre réelle déjà créée.</p>
        </div>
        <label className="storefront-cms-visible">
          <input name="promoEnabled" type="checkbox" defaultChecked={data.settings.promoEnabled} disabled={!data.canEdit} />
          <span>Afficher la barre promotionnelle</span>
        </label>
        <div className="storefront-cms-form-grid">
          <label><span>Petit badge</span><input name="promoBadge" defaultValue={data.settings.promoBadge} placeholder="OFFRE, -20 %, PACK…" disabled={!data.canEdit} /></label>
          <label><span>Titre</span><input name="promoTitle" defaultValue={data.settings.promoTitle} placeholder="Ex. 1+1=3 ce week-end" disabled={!data.canEdit} /></label>
        </div>
        <label><span>Texte libre</span><input name="promoText" defaultValue={data.settings.promoText} placeholder="Ex. Choisis 3 bracelets et paie le prix de 2." disabled={!data.canEdit} /></label>
        <div className="storefront-cms-form-grid">
          <label><span>Texte du bouton</span><input name="promoCtaLabel" defaultValue={data.settings.promoCtaLabel} placeholder="Voir l’offre" disabled={!data.canEdit} /></label>
          <label><span>Offre liée au bouton (facultatif)</span><select name="promoOfferId" defaultValue={String(data.settings.promoOfferId || 0)} disabled={!data.canEdit}><option value="0">Catalogue / offres générales</option>{data.offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
        </div>
      </div>

      <div className="storefront-cms-pixel-box">
        <div><span>Meta Pixel</span><h3>{data.settings.metaPixelId ? "Pixel configuré" : "Pixel non configuré"}</h3><p>{data.settings.metaPixelId ? "Le site déclenche PageView, ViewContent, AddToCart, InitiateCheckout et Purchase après une commande enregistrée." : "Ajoute l’identifiant de ton Pixel Meta pour activer le suivi de la boutique."}</p></div>
        <label><span>Meta Pixel ID (optionnel)</span><input name="metaPixelId" inputMode="numeric" defaultValue={data.settings.metaPixelId} placeholder="Ex. 123456789…" disabled={!data.canEdit} /></label>
        <small>Purchase correspond à une commande COD enregistrée sur le site. L’encaissement réel reste géré séparément dans Maison Jiya.</small>
      </div>
      <button className="primary-button" type="submit" disabled={!data.canEdit || saving}>{saving ? "Enregistrement…" : "Enregistrer identité, promo & tracking"}</button>
    </form>

    <div className="storefront-cms-card storefront-cms-brand-media">
      <div className="storefront-cms-card-head"><div><span>Visuels de marque</span><h2>Logo & bannière</h2></div></div>
      <MediaSlot title="Logo du site public" media={logo} canEdit={data.canEdit} onFiles={(files) => uploadMany("brand", 0, "logo", files)} onRemove={removeMedia} />
      <MediaSlot title="Image de couverture" media={hero} canEdit={data.canEdit} onFiles={(files) => uploadMany("brand", 0, "hero", files)} onRemove={removeMedia} />
      <small>Les images sont automatiquement redimensionnées et compressées avant l’envoi.</small>
    </div>
  </div>;
}

function MediaSlot({ title, media, canEdit, onFiles, onRemove }: {
  title: string;
  media?: Media;
  canEdit: boolean;
  onFiles: (files: FileList | null) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  return <div className="storefront-cms-media-slot">
    <div>{media ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaUrl(media.id)} alt={title} loading="lazy" decoding="async" />
    </> : <span>Aucune image</span>}</div>
    <section>
      <strong>{title}</strong><small>JPG, PNG ou WebP</small>
      {canEdit && <label className="storefront-cms-upload">Choisir une photo<input type="file" accept="image/*" onChange={(event) => { const files = event.currentTarget.files; void onFiles(files); event.currentTarget.value = ""; }} /></label>}
      {media && canEdit && <button type="button" onClick={() => void onRemove(media.id)}>Supprimer</button>}
    </section>
  </div>;
}

function GalleryEditor({ ownerType, ownerId, media, canEdit, uploadMany, removeMedia, title }: {
  ownerType: "product" | "offer";
  ownerId: number;
  media: Media[];
  canEdit: boolean;
  uploadMany: UploadMany;
  removeMedia: (id: number) => Promise<void>;
  title: string;
}) {
  const remaining = Math.max(0, MAX_GALLERY - media.length);
  return <div className="storefront-cms-gallery">
    <div className="storefront-cms-gallery-head">
      <div><strong>{title}</strong><small>{media.length}/{MAX_GALLERY} photo(s) · la première est le visuel principal.</small></div>
      {canEdit && remaining > 0 && <label className="storefront-cms-upload">＋ Ajouter des photos<input type="file" multiple accept="image/*" onChange={(event) => { const files = event.currentTarget.files; void uploadMany(ownerType, ownerId, "gallery", files, remaining); event.currentTarget.value = ""; }} /></label>}
    </div>
    <div className="storefront-cms-gallery-grid">
      {media.map((item, index) => <figure key={item.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl(item.id)} alt="" loading="lazy" decoding="async" />
        {index === 0 && <span className="storefront-cms-main-photo">Principale</span>}
        {canEdit && <button type="button" onClick={() => void removeMedia(item.id)}>×</button>}
      </figure>)}
      {!media.length && <div className="storefront-cms-no-media">Sélectionne une ou plusieurs photos à la fois.</div>}
    </div>
  </div>;
}

function ProductEditor({ product, canEdit, save, uploadMany, removeMedia }: {
  product: CmsProduct;
  canEdit: boolean;
  save: (payload: Record<string, unknown>) => Promise<void>;
  uploadMany: UploadMany;
  removeMedia: (id: number) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await save({
        action: "saveProduct",
        productId: product.productId,
        publicName: form.get("publicName"),
        publicPrice: form.get("publicPrice"),
        isVisible: form.get("isVisible") === "on",
        availabilityMode: form.get("availabilityMode"),
        badge: form.get("badge"),
        description: form.get("description"),
        sortOrder: form.get("sortOrder"),
      });
    } finally {
      setSaving(false);
    }
  }

  const effectiveOut = product.stockQuantity <= 0 || product.availabilityMode === "out_of_stock";
  return <details className="storefront-cms-product" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>
      <div className="storefront-cms-product-main">
        {product.media[0] ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(product.media[0].id)} alt="" loading="lazy" decoding="async" />
        </> : <span className="storefront-cms-product-placeholder">!</span>}
        <div><strong>{product.publicName || product.internalName}</strong><small>{product.productCode} · {publicCategory(product.category)}{!product.media.length ? " · photo manquante : masqué du site" : ""}</small></div>
      </div>
      <div className="storefront-cms-product-status"><span className={effectiveOut ? "out" : "in"}>{effectiveOut ? "Rupture" : "Disponible"}</span><strong>{money(product.publicPrice || product.internalPrice)}</strong><small>Stock réel : {product.stockQuantity}</small></div>
      <b>⌄</b>
    </summary>

    {open && <form onSubmit={(event) => void submit(event)}>
      <div className="storefront-cms-product-editgrid">
        <label><span>Nom sur le site public</span><input name="publicName" defaultValue={product.publicName} disabled={!canEdit} /></label>
        <label><span>Prix public (MAD)</span><input name="publicPrice" type="number" min="0" step="1" defaultValue={product.publicPrice} disabled={!canEdit} /></label>
        <label><span>Disponibilité publique</span><select name="availabilityMode" defaultValue={product.availabilityMode} disabled={!canEdit}><option value="auto">Automatique selon le stock</option><option value="available">Disponible si stock réel &gt; 0</option><option value="out_of_stock">Forcer « Rupture »</option></select></label>
        <label><span>Badge</span><input name="badge" defaultValue={product.badge} placeholder="Nouveau, Best-seller…" disabled={!canEdit} /></label>
        <label><span>Ordre d’affichage</span><input name="sortOrder" type="number" defaultValue={product.sortOrder} disabled={!canEdit} /></label>
        <label className="storefront-cms-visible"><input name="isVisible" type="checkbox" defaultChecked={product.isVisible} disabled={!canEdit} /><span>Afficher ce produit sur le site public</span></label>
      </div>
      <label><span>Description publique</span><textarea name="description" rows={3} defaultValue={product.description} placeholder="Courte description visible par les clients…" disabled={!canEdit} /></label>
      <GalleryEditor ownerType="product" ownerId={product.productId} media={product.media} canEdit={canEdit} uploadMany={uploadMany} removeMedia={removeMedia} title="Photos du produit" />
      <div className="storefront-cms-save-row"><small>Prix interne : {money(product.internalPrice)} · stock interne : {product.stockQuantity}</small><button className="primary-button" type="submit" disabled={!canEdit || saving}>{saving ? "Enregistrement…" : "Enregistrer ce produit public"}</button></div>
    </form>}
  </details>;
}

function MarketingPanel({ data, save, uploadMany, removeMedia }: {
  data: CmsData;
  save: (payload: Record<string, unknown>) => Promise<void>;
  uploadMany: UploadMany;
  removeMedia: (id: number) => Promise<void>;
}) {
  const blank: CmsMarketingSection = {
    id: 0,
    eyebrow: "OFFRE DU MOMENT",
    title: "",
    body: "",
    badge: "PROMO",
    ctaLabel: "Voir l’offre",
    target: "offers",
    placement: "after_categories",
    isActive: true,
    sortOrder: 0,
    media: [],
  };
  return <div className="storefront-cms-marketing">
    <div className="storefront-cms-offer-intro">
      <div>
        <span>Blocs promo / marketing</span>
        <h2>Crée autant de mises en avant que tu veux</h2>
        <p>Remise, offre flash, livraison offerte, 1+1=3, pack spécial… Chaque bloc a son image, son texte, son bouton, sa position et son ordre.</p>
      </div>
      <strong>{data.marketingSections.filter((section) => section.isActive).length} actif(s)</strong>
    </div>
    <MarketingEditor section={blank} canEdit={data.canEdit} save={save} uploadMany={uploadMany} removeMedia={removeMedia} isNew />
    <div className="storefront-cms-marketing-list">
      {data.marketingSections.map((section) => <MarketingEditor key={`${section.id}-${section.title}-${section.media.length}`} section={section} canEdit={data.canEdit} save={save} uploadMany={uploadMany} removeMedia={removeMedia} />)}
      {!data.marketingSections.length && <div className="storefront-cms-no-media">Aucun bloc marketing créé pour le moment.</div>}
    </div>
  </div>;
}

function MarketingEditor({ section, canEdit, save, uploadMany, removeMedia, isNew = false }: {
  section: CmsMarketingSection;
  canEdit: boolean;
  save: (payload: Record<string, unknown>) => Promise<void>;
  uploadMany: UploadMany;
  removeMedia: (id: number) => Promise<void>;
  isNew?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(isNew);
  const image = section.media[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await save({
        action: "saveMarketingSection",
        sectionId: section.id,
        eyebrow: form.get("eyebrow"),
        title: form.get("title"),
        body: form.get("body"),
        badge: form.get("badge"),
        ctaLabel: form.get("ctaLabel"),
        target: form.get("target"),
        placement: form.get("placement"),
        sortOrder: form.get("sortOrder"),
        isActive: form.get("isActive") === "on",
      });
      if (isNew) event.currentTarget.reset();
    } finally {
      setSaving(false);
    }
  }

  async function removeSection() {
    if (!section.id || !window.confirm(`Supprimer le bloc « ${section.title} » ?`)) return;
    await save({ action: "deleteMarketingSection", sectionId: section.id });
  }

  return <details className={`storefront-cms-offer-card storefront-cms-marketing-card ${isNew ? "new" : ""}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>
      <div>
        <span>{isNew ? "＋ Nouveau bloc" : section.badge || "Promo"}</span>
        <strong>{isNew ? "Créer un bloc promo / remise" : section.title}</strong>
        <small>{isNew ? "Image + texte + bouton + emplacement." : `${section.eyebrow || "Marketing"} · ordre ${section.sortOrder}`}</small>
      </div>
      {!isNew && <span className={section.isActive ? "storefront-cms-offer-active" : "storefront-cms-offer-off"}>{section.isActive ? "En ligne" : "Masqué"}</span>}
      <b>⌄</b>
    </summary>

    {open && <form onSubmit={(event) => void submit(event)}>
      <div className="storefront-cms-product-editgrid">
        <label><span>Petit titre</span><input name="eyebrow" defaultValue={section.eyebrow} placeholder="OFFRE DU MOMENT" disabled={!canEdit} /></label>
        <label><span>Titre principal</span><input name="title" defaultValue={section.title} placeholder="Ex. -20 % sur les bijoux" required disabled={!canEdit} /></label>
        <label><span>Badge</span><input name="badge" defaultValue={section.badge} placeholder="-20 %, FLASH, CADEAU…" disabled={!canEdit} /></label>
        <label><span>Texte du bouton</span><input name="ctaLabel" defaultValue={section.ctaLabel} placeholder="Profiter de l’offre" disabled={!canEdit} /></label>
        <label><span>Le bouton mène vers</span><select name="target" defaultValue={section.target} disabled={!canEdit}><option value="offers">Packs & offres</option><option value="catalogue">Tout le catalogue</option><option value="Montres">Montres</option><option value="Bijoux">Bijoux</option><option value="Portefeuilles">Portefeuilles</option></select></label>
        <label><span>Emplacement sur le site</span><select name="placement" defaultValue={section.placement} disabled={!canEdit}><option value="after_categories">Après les catégories</option><option value="before_catalogue">Avant le catalogue</option><option value="before_contact">Avant le bloc contact</option></select></label>
        <label><span>Ordre</span><input name="sortOrder" type="number" defaultValue={section.sortOrder} disabled={!canEdit} /></label>
        <label className="storefront-cms-visible"><input name="isActive" type="checkbox" defaultChecked={section.isActive} disabled={!canEdit} /><span>Afficher ce bloc sur la boutique</span></label>
      </div>
      <label><span>Texte du bloc</span><textarea name="body" rows={3} defaultValue={section.body} placeholder="Ex. Cette semaine, profitez de notre sélection à prix réduit." disabled={!canEdit} /></label>

      {!isNew ? <div className="storefront-cms-marketing-image">
        <div>
          {image ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(image.id)} alt="" loading="lazy" decoding="async" />
          </> : <span>Image promotionnelle</span>}
        </div>
        <section>
          <strong>Visuel du bloc</strong>
          <small>Une seule image. Un nouveau fichier remplace automatiquement l’ancien.</small>
          {canEdit && <label className="storefront-cms-upload">＋ {image ? "Remplacer l’image" : "Ajouter une image"}<input type="file" accept="image/*" onChange={(event) => { const files = event.currentTarget.files; void uploadMany("marketing", section.id, "gallery", files, 1); event.currentTarget.value = ""; }} /></label>}
          {canEdit && image && <button className="danger-text-button" type="button" onClick={() => void removeMedia(image.id)}>Supprimer l’image</button>}
        </section>
      </div> : <div className="storefront-cms-public-category-note">Crée d’abord le bloc. Ensuite tu pourras lui ajouter son image.</div>}

      <div className="storefront-cms-save-row">
        {!isNew && canEdit ? <button className="danger-text-button" type="button" onClick={() => void removeSection()}>Supprimer le bloc</button> : <small>Le bloc reste indépendant du stock et des prix internes.</small>}
        <button className="primary-button" type="submit" disabled={!canEdit || saving}>{saving ? "Enregistrement…" : isNew ? "Créer le bloc" : "Enregistrer le bloc"}</button>
      </div>
    </form>}
  </details>;
}

function OffersPanel({ data, save, uploadMany, removeMedia }: {
  data: CmsData;
  save: (payload: Record<string, unknown>) => Promise<void>;
  uploadMany: UploadMany;
  removeMedia: (id: number) => Promise<void>;
}) {
  const [offerQuery, setOfferQuery] = useState("");
  const blank: CmsOffer = { id: 0, name: "", description: "", price: 0, comparePrice: 0, badge: "Offre", isActive: true, sortOrder: 0, items: [], media: [] };
  const visibleOffers = useMemo(() => {
    const clean = normalize(offerQuery.trim());
    if (!clean) return data.offers;
    return data.offers.filter((offer) => normalize(`${offer.name} ${offer.badge} ${offer.description}`).includes(clean));
  }, [data.offers, offerQuery]);

  return <div className="storefront-cms-offers">
    <div className="storefront-cms-offer-intro"><div><span>Packs & promotions</span><h2>Crée tes offres avec les vrais produits</h2><p>Pack, remise, -20 %, 1+1=3… choisis les produits et fixe toi-même le vrai prix de l’offre. Électronique et Boîtes n’apparaissent pas ici.</p></div><strong>{data.offers.filter((offer) => offer.isActive).length} offre(s) active(s)</strong></div>
    <OfferEditor key="new-offer" offer={blank} products={data.products} canEdit={data.canEdit} save={save} uploadMany={uploadMany} removeMedia={removeMedia} isNew />
    <div className="storefront-cms-offer-list-tools"><label><span>Rechercher une offre existante</span><input value={offerQuery} onChange={(event) => setOfferQuery(event.target.value)} placeholder="Nom du pack, badge…" /></label><strong>{visibleOffers.length} résultat(s)</strong></div>
    <div className="storefront-cms-offer-list">{visibleOffers.map((offer) => <OfferEditor key={`${offer.id}-${offer.name}-${offer.items.length}-${offer.media.length}`} offer={offer} products={data.products} canEdit={data.canEdit} save={save} uploadMany={uploadMany} removeMedia={removeMedia} />)}</div>
  </div>;
}

function OfferEditor({ offer, products, canEdit, save, uploadMany, removeMedia, isNew = false }: {
  offer: CmsOffer;
  products: CmsProduct[];
  canEdit: boolean;
  save: (payload: Record<string, unknown>) => Promise<void>;
  uploadMany: UploadMany;
  removeMedia: (id: number) => Promise<void>;
  isNew?: boolean;
}) {
  const [items, setItems] = useState<OfferItem[]>(offer.items);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(isNew);
  const [productQuery, setProductQuery] = useState("");
  const [productCategory, setProductCategory] = useState("Toutes");

  const categories = useMemo(() => ["Toutes", ...Array.from(new Set(products.map((product) => publicCategory(product.category)))).sort((a, b) => a.localeCompare(b, "fr"))], [products]);
  const choices = useMemo(() => {
    const clean = normalize(productQuery.trim());
    return products.filter((product) => {
      if (productCategory !== "Toutes" && publicCategory(product.category) !== productCategory) return false;
      if (!clean) return true;
      return normalize(`${product.productCode} ${product.internalName} ${product.publicName} ${publicCategory(product.category)}`).includes(clean);
    }).slice(0, 30);
  }, [productCategory, productQuery, products]);

  function addProduct(productId: number) {
    setItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) return current.map((item) => item.productId === productId ? { ...item, quantity: Math.min(50, item.quantity + 1) } : item);
      if (current.length >= 30) return current;
      return [...current, { productId, quantity: 1 }];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    if (!items.length) {
      window.alert("Ajoute au moins un produit au pack.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await save({
        action: "saveOffer",
        offerId: offer.id,
        name: form.get("name"),
        description: form.get("description"),
        price: form.get("price"),
        comparePrice: form.get("comparePrice"),
        badge: form.get("badge"),
        isActive: form.get("isActive") === "on",
        sortOrder: form.get("sortOrder"),
        items,
      });
      if (isNew) {
        event.currentTarget.reset();
        setItems([]);
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeOffer() {
    if (!offer.id || !window.confirm(`Supprimer l’offre « ${offer.name} » ?`)) return;
    await save({ action: "deleteOffer", offerId: offer.id });
  }

  return <details className={`storefront-cms-offer-card ${isNew ? "new" : ""}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>
      <div><span>{isNew ? "＋ Nouvelle offre" : offer.badge || "Pack"}</span><strong>{isNew ? "Créer un pack, une remise ou une offre" : offer.name}</strong><small>{isNew ? "Recherche les produits, compose le pack puis ajoute ses photos." : `${offer.items.length} composant(s) · ${money(offer.price)}`}</small></div>
      {!isNew && <span className={offer.isActive ? "storefront-cms-offer-active" : "storefront-cms-offer-off"}>{offer.isActive ? "En ligne" : "Masquée"}</span>}
      <b>⌄</b>
    </summary>

    {open && <form onSubmit={(event) => void submit(event)}>
      <div className="storefront-cms-product-editgrid">
        <label><span>Nom de l’offre</span><input name="name" defaultValue={offer.name} required disabled={!canEdit} placeholder="Ex. Pack Duo, -20 %, 1+1=3…" /></label>
        <label><span>Prix offre (MAD)</span><input name="price" type="number" min="1" step="1" defaultValue={offer.price || ""} required disabled={!canEdit} /></label>
        <label><span>Ancien prix barré</span><input name="comparePrice" type="number" min="0" step="1" defaultValue={offer.comparePrice || ""} disabled={!canEdit} /></label>
        <label><span>Badge</span><input name="badge" defaultValue={offer.badge} placeholder="-20%, Offre rentrée…" disabled={!canEdit} /></label>
        <label><span>Ordre</span><input name="sortOrder" type="number" defaultValue={offer.sortOrder} disabled={!canEdit} /></label>
        <label className="storefront-cms-visible"><input name="isActive" type="checkbox" defaultChecked={offer.isActive} disabled={!canEdit} /><span>Afficher cette offre</span></label>
      </div>
      <label><span>Description de l’offre</span><textarea name="description" rows={3} defaultValue={offer.description} disabled={!canEdit} placeholder="Explique ce que contient le pack…" /></label>

      <div className="storefront-cms-components storefront-cms-picker">
        <div className="storefront-cms-gallery-head"><div><strong>Choisir les produits concernés</strong><small>Pour 1+1=3, mets par exemple quantité 3 puis fixe le prix final que tu veux faire payer.</small></div><span>{items.length} produit(s) choisi(s)</span></div>
        <div className="storefront-cms-picker-tools">
          <label><span>Rechercher un produit</span><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Référence, montre, bracelet…" /></label>
          <label><span>Catégorie</span><select value={productCategory} onChange={(event) => setProductCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="storefront-cms-picker-results">
          {choices.map((product) => <button type="button" key={product.productId} onClick={() => addProduct(product.productId)} disabled={!canEdit}>
            <span><strong>{product.internalName}</strong><small>{product.productCode} · {publicCategory(product.category)} · stock {product.stockQuantity}</small></span><b>＋ Ajouter</b>
          </button>)}
          {!choices.length && <div className="storefront-cms-no-media">Aucun produit ne correspond à cette recherche.</div>}
        </div>

        <div className="storefront-cms-selected-components">
          <strong>Composition du pack</strong>
          {items.map((item) => {
            const product = products.find((candidate) => candidate.productId === item.productId);
            if (!product) return null;
            return <div className="storefront-cms-component-row storefront-cms-component-row-v2" key={item.productId}>
              <div><strong>{product.internalName}</strong><small>{product.productCode} · {publicCategory(product.category)} · stock {product.stockQuantity}</small></div>
              <label><span>Qté</span><input type="number" min="1" max="50" value={item.quantity} onChange={(event) => setItems((current) => current.map((row) => row.productId === item.productId ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row))} disabled={!canEdit} /></label>
              {canEdit && <button type="button" onClick={() => setItems((current) => current.filter((row) => row.productId !== item.productId))}>×</button>}
            </div>;
          })}
          {!items.length && <div className="storefront-cms-no-media">Aucun produit choisi pour le moment.</div>}
        </div>
      </div>

      {!isNew && <GalleryEditor ownerType="offer" ownerId={offer.id} media={offer.media} canEdit={canEdit} uploadMany={uploadMany} removeMedia={removeMedia} title="Photos du pack / de l’offre" />}
      {isNew && <div className="storefront-cms-public-category-note">Enregistre d’abord le pack. Dès qu’il est créé, sa fiche apparaît ci-dessous et tu peux ajouter jusqu’à {MAX_GALLERY} photos en une seule sélection.</div>}

      <div className="storefront-cms-save-row">
        {!isNew && canEdit ? <button className="danger-text-button" type="button" onClick={() => void removeOffer()}>Supprimer l’offre</button> : <small>{items.length} composant(s)</small>}
        <button className="primary-button" type="submit" disabled={!canEdit || saving}>{saving ? "Enregistrement…" : isNew ? "Créer l’offre" : "Enregistrer l’offre"}</button>
      </div>
    </form>}
  </details>;
}
