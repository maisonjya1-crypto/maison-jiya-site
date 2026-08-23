"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CatalogItem, StorefrontCatalog, StorefrontLanguage } from "./storefront-types";

type Cart = Record<string, number>;
type FbqFunction = ((...args: unknown[]) => void) & { queue?: unknown[][]; loaded?: boolean; version?: string };
type FbqWindow = Window & { fbq?: FbqFunction; _fbq?: FbqFunction };
type ImageState = { src: string; attempt: number; failed: boolean };

type Copy = {
  officialStore: string;
  catalogue: string;
  offers: string;
  howToOrder: string;
  contact: string;
  cart: string;
  discover: string;
  whatsapp: string;
  cashOnDelivery: string;
  confirmation: string;
  moroccoDelivery: string;
  weeklyPromo: string;
  weeklyPromoKicker: string;
  bestSellers: string;
  bestSellersKicker: string;
  bestSellerText: string;
  collections: string;
  collectionsKicker: string;
  packs: string;
  packsKicker: string;
  allProducts: string;
  search: string;
  searchPlaceholder: string;
  category: string;
  allCategories: string;
  products: string;
  loading: string;
  unavailable: string;
  addToCart: string;
  viewProduct: string;
  loadMore: string;
  yourCart: string;
  emptyCart: string;
  total: string;
  checkout: string;
  continueShopping: string;
  quantity: string;
  remove: string;
  orderTitle: string;
  orderSubtitle: string;
  fullName: string;
  phone: string;
  city: string;
  address: string;
  note: string;
  optional: string;
  confirmOrder: string;
  sending: string;
  orderSuccess: string;
  orderSuccessText: string;
  orderRef: string;
  close: string;
  orderFailed: string;
  whyOrder: string;
  step1: string;
  step1Text: string;
  step2: string;
  step2Text: string;
  step3: string;
  step3Text: string;
  helpTitle: string;
  helpText: string;
  freeDelivery: string;
};

const copy: Record<StorefrontLanguage, Copy> = {
  fr: {
    officialStore: "Boutique officielle", catalogue: "Catalogue", offers: "Offres", howToOrder: "Comment commander", contact: "Contact", cart: "Panier",
    discover: "Découvrir la collection", whatsapp: "WhatsApp", cashOnDelivery: "Paiement à la livraison", confirmation: "Confirmation par notre équipe", moroccoDelivery: "Livraison partout au Maroc",
    weeklyPromo: "PROMO DE LA SEMAINE", weeklyPromoKicker: "Nos offres du moment", bestSellers: "BEST SELLERS", bestSellersKicker: "Les favoris du moment", bestSellerText: "Une sélection de modèles appréciés par nos clients.",
    collections: "NOS COLLECTIONS", collectionsKicker: "Choisissez votre univers", packs: "NOS PACKS", packsKicker: "Des offres pensées pour vous", allProducts: "TOUS NOS MODÈLES",
    search: "Rechercher", searchPlaceholder: "Montre, portefeuille, référence…", category: "Catégorie", allCategories: "Toutes les catégories", products: "articles", loading: "Chargement du catalogue…",
    unavailable: "Indisponible", addToCart: "Ajouter au panier", viewProduct: "Voir ce produit", loadMore: "Afficher plus", yourCart: "Votre panier", emptyCart: "Votre panier est vide.", total: "Total", checkout: "Commander",
    continueShopping: "Continuer mes achats", quantity: "Quantité", remove: "Supprimer", orderTitle: "Finaliser la commande", orderSubtitle: "Aucun paiement en ligne. Notre équipe vous contacte pour confirmer.", fullName: "Nom complet", phone: "Téléphone", city: "Ville", address: "Adresse de livraison",
    note: "Note", optional: "facultatif", confirmOrder: "Envoyer ma commande", sending: "Envoi…", orderSuccess: "Commande reçue", orderSuccessText: "Merci. Notre équipe vous contactera pour confirmer la disponibilité et votre commande avant préparation.", orderRef: "Référence", close: "Fermer", orderFailed: "Impossible d’enregistrer la commande. Vérifiez vos informations puis réessayez.",
    whyOrder: "COMMENT COMMANDER", step1: "1. Choisissez", step1Text: "Ajoutez les modèles et quantités qui vous plaisent, même si vous en souhaitez plusieurs.", step2: "2. Envoyez", step2Text: "Renseignez vos coordonnées et envoyez votre commande sans paiement en ligne.", step3: "3. Confirmez", step3Text: "Notre équipe vous contacte pour confirmer la disponibilité avant préparation et livraison.",
    helpTitle: "Besoin d’aide ?", helpText: "Écrivez-nous sur WhatsApp pour une question sur un modèle, un pack ou votre commande.", freeDelivery: "Livraison gratuite partout au Maroc",
  },
  ar: {
    officialStore: "المتجر الرسمي", catalogue: "الكتالوج", offers: "العروض", howToOrder: "كيفية الطلب", contact: "تواصل معنا", cart: "السلة",
    discover: "اكتشف المجموعة", whatsapp: "واتساب", cashOnDelivery: "الدفع عند الاستلام", confirmation: "تأكيد الطلب من فريقنا", moroccoDelivery: "التوصيل إلى جميع أنحاء المغرب",
    weeklyPromo: "عرض الأسبوع", weeklyPromoKicker: "عروضنا الحالية", bestSellers: "الأكثر طلبًا", bestSellersKicker: "اختيارات العملاء", bestSellerText: "مجموعة مختارة من الموديلات المفضلة لدى عملائنا.",
    collections: "مجموعاتنا", collectionsKicker: "اختر ما يناسبك", packs: "الباقات", packsKicker: "عروض مختارة لك", allProducts: "جميع الموديلات",
    search: "بحث", searchPlaceholder: "ساعة، محفظة، مرجع…", category: "الفئة", allCategories: "جميع الفئات", products: "منتجات", loading: "جارٍ تحميل الكتالوج…",
    unavailable: "غير متوفر", addToCart: "أضف إلى السلة", viewProduct: "عرض المنتج", loadMore: "عرض المزيد", yourCart: "سلة التسوق", emptyCart: "سلة التسوق فارغة.", total: "المجموع", checkout: "إتمام الطلب",
    continueShopping: "متابعة التسوق", quantity: "الكمية", remove: "حذف", orderTitle: "إتمام الطلب", orderSubtitle: "لا يوجد دفع إلكتروني. سيتواصل معك فريقنا لتأكيد الطلب.", fullName: "الاسم الكامل", phone: "رقم الهاتف", city: "المدينة", address: "عنوان التوصيل",
    note: "ملاحظة", optional: "اختياري", confirmOrder: "إرسال الطلب", sending: "جارٍ الإرسال…", orderSuccess: "تم استلام طلبك", orderSuccessText: "شكرًا لك. سيتواصل معك فريقنا لتأكيد توفر المنتجات والطلب قبل التجهيز.", orderRef: "رقم الطلب", close: "إغلاق", orderFailed: "تعذر تسجيل الطلب. تحقق من معلوماتك ثم حاول مرة أخرى.",
    whyOrder: "كيفية الطلب", step1: "1. اختر", step1Text: "أضف الموديلات والكميات التي تريدها، حتى إذا كنت ترغب في أكثر من قطعة.", step2: "2. أرسل الطلب", step2Text: "أدخل معلوماتك وأرسل الطلب من دون أي دفع إلكتروني.", step3: "3. التأكيد", step3Text: "سيتواصل معك فريقنا لتأكيد التوفر قبل تجهيز الطلب والتوصيل.",
    helpTitle: "تحتاج إلى مساعدة؟", helpText: "راسلنا على واتساب لأي سؤال حول موديل أو باقة أو طلبك.", freeDelivery: "توصيل مجاني إلى جميع أنحاء المغرب",
  },
  en: {
    officialStore: "Official store", catalogue: "Catalog", offers: "Offers", howToOrder: "How to order", contact: "Contact", cart: "Cart",
    discover: "Discover the collection", whatsapp: "WhatsApp", cashOnDelivery: "Cash on delivery", confirmation: "Confirmed by our team", moroccoDelivery: "Delivery across Morocco",
    weeklyPromo: "WEEKLY PROMOTION", weeklyPromoKicker: "Current offers", bestSellers: "BEST SELLERS", bestSellersKicker: "Customer favorites", bestSellerText: "A selection of models appreciated by our customers.",
    collections: "OUR COLLECTIONS", collectionsKicker: "Choose your style", packs: "OUR PACKS", packsKicker: "Offers selected for you", allProducts: "ALL MODELS",
    search: "Search", searchPlaceholder: "Watch, wallet, reference…", category: "Category", allCategories: "All categories", products: "items", loading: "Loading catalog…",
    unavailable: "Unavailable", addToCart: "Add to cart", viewProduct: "View product", loadMore: "Show more", yourCart: "Your cart", emptyCart: "Your cart is empty.", total: "Total", checkout: "Checkout",
    continueShopping: "Continue shopping", quantity: "Quantity", remove: "Remove", orderTitle: "Complete your order", orderSubtitle: "No online payment. Our team will contact you to confirm the order.", fullName: "Full name", phone: "Phone", city: "City", address: "Delivery address",
    note: "Note", optional: "optional", confirmOrder: "Place my order", sending: "Sending…", orderSuccess: "Order received", orderSuccessText: "Thank you. Our team will contact you to confirm availability and your order before preparation.", orderRef: "Reference", close: "Close", orderFailed: "We could not register your order. Check your details and try again.",
    whyOrder: "HOW TO ORDER", step1: "1. Choose", step1Text: "Add the models and quantities you want, even when you need several pieces.", step2: "2. Send", step2Text: "Enter your details and place your order without any online payment.", step3: "3. Confirm", step3Text: "Our team contacts you to confirm availability before preparation and delivery.",
    helpTitle: "Need help?", helpText: "Message us on WhatsApp with any question about a model, pack or your order.", freeDelivery: "Free delivery across Morocco",
  },
};

const categoryCopy: Record<StorefrontLanguage, Record<string, string>> = {
  fr: { "Packs & offres": "Packs & offres", Portefeuilles: "Portefeuilles", Montres: "Montres", Bijoux: "Bijoux", Autre: "Autre" },
  ar: { "Packs & offres": "الباقات والعروض", Portefeuilles: "المحافظ", Montres: "الساعات", Bijoux: "المجوهرات", Autre: "أخرى" },
  en: { "Packs & offres": "Packs & offers", Portefeuilles: "Wallets", Montres: "Watches", Bijoux: "Jewelry", Autre: "Other" },
};

const INITIAL_VISIBLE = 24;
const itemKey = (item: Pick<CatalogItem, "kind" | "id">) => `${item.kind === "offer" ? "o" : "p"}:${item.id}`;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const isBestSeller = (badge: string) => normalize(badge || "").replace(/[^a-z0-9]/g, "").includes("bestseller");

function money(value: number, lang: StorefrontLanguage) {
  return `${Number(value).toLocaleString(lang === "ar" ? "ar-MA" : lang === "en" ? "en-MA" : "fr-MA", { maximumFractionDigits: 2 })} DH`;
}

function track(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  (window as FbqWindow).fbq?.("track", event, data || {});
}

function enableMetaPixel(pixelId: string) {
  if (!pixelId || typeof window === "undefined") return;
  const target = window as FbqWindow;
  if (!target.fbq) {
    const fbq = ((...args: unknown[]) => { fbq.queue = fbq.queue || []; fbq.queue.push(args); }) as FbqFunction;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    target.fbq = fbq;
    target._fbq = fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  target.fbq?.("init", pixelId);
  target.fbq?.("track", "PageView");
}

function SafeImage({ src, alt, fallback, priority = false }: { src: string; alt: string; fallback: ReactNode; priority?: boolean }) {
  const [storedState, setStoredState] = useState<ImageState>({ src: "", attempt: 0, failed: false });
  const state = storedState.src === src ? storedState : { src, attempt: 0, failed: false };
  if (!src || state.failed) return <>{fallback}</>;
  const separator = src.includes("?") ? "&" : "?";
  const resolvedSrc = state.attempt ? `${src}${separator}retry=${state.attempt}` : src;
  return <img src={resolvedSrc} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => {
    if (state.attempt < 1) setStoredState({ src, attempt: 1, failed: false });
    else setStoredState({ src, attempt: state.attempt, failed: true });
  }} />;
}

function ProductCard({ item, lang, t, add, priority = false }: { item: CatalogItem; lang: StorefrontLanguage; t: Copy; add: (item: CatalogItem) => void; priority?: boolean }) {
  const fallback = <div className="storefront-v3-image-fallback"><b>{item.category.slice(0, 1).toUpperCase()}</b><small>{categoryCopy[lang][item.category] || item.category}</small></div>;
  return <article className={`storefront-v3-product ${!item.available ? "is-unavailable" : ""}`}>
    <div className="storefront-v3-product-media">
      {item.images[0] ? <SafeImage src={item.images[0]} alt={item.name} fallback={fallback} priority={priority} /> : fallback}
      {item.badge && <em>{item.badge}</em>}
      {!item.available && <i>{t.unavailable}</i>}
    </div>
    <div className="storefront-v3-product-info">
      <small>{item.productCode} · {categoryCopy[lang][item.category] || item.category}</small>
      <h3>{item.name}</h3>
      {item.description && <p>{item.description}</p>}
      <div className="storefront-v3-price"><strong>{money(item.salePrice, lang)}</strong>{item.comparePrice > item.salePrice && <del>{money(item.comparePrice, lang)}</del>}</div>
      <button type="button" disabled={!item.available} onClick={() => add(item)}>{item.available ? t.addToCart : t.unavailable}</button>
    </div>
  </article>;
}

export default function StorefrontClientV3({ initialCatalog }: { initialCatalog: StorefrontCatalog | null }) {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(initialCatalog);
  const [loading, setLoading] = useState(!initialCatalog);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<StorefrontLanguage>("fr");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<{ orderRef: string; total: number } | null>(null);
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" });
  const refreshInFlight = useRef(false);
  const lastRefreshAt = useRef(0);
  const t = copy[lang];
  const localized = catalog?.localized?.[lang] || catalog?.localized?.fr;

  const refreshCatalog = useCallback(async (showLoading = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/storefront/catalog?refresh=${Date.now()}`, { cache: "no-store", headers: { "cache-control": "no-cache" } });
      const body = await response.json() as StorefrontCatalog & { error?: string };
      if (!response.ok) throw new Error(body.error || "Catalogue indisponible.");
      setCatalog(body);
      setError("");
      lastRefreshAt.current = Date.now();
    } catch {
      if (showLoading) setError(t.orderFailed);
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [t.orderFailed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedLang = localStorage.getItem("maison-jiya-language-v3");
        if (savedLang === "fr" || savedLang === "ar" || savedLang === "en") setLang(savedLang);
        const savedCart = localStorage.getItem("maison-jiya-cart-v3");
        if (savedCart) setCart(JSON.parse(savedCart) as Cart);
      } catch { /* stockage facultatif */ }
      const params = new URLSearchParams(window.location.search);
      setUtm({ source: params.get("utm_source") || "", medium: params.get("utm_medium") || "", campaign: params.get("utm_campaign") || "" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    try { localStorage.setItem("maison-jiya-language-v3", lang); } catch { /* facultatif */ }
  }, [lang]);

  useEffect(() => {
    try { localStorage.setItem("maison-jiya-cart-v3", JSON.stringify(cart)); } catch { /* facultatif */ }
  }, [cart]);

  useEffect(() => {
    if (initialCatalog) {
      lastRefreshAt.current = Date.now();
      enableMetaPixel(initialCatalog.metaPixelId || "");
      track("ViewContent", { content_name: "Maison Jiya Boutique" });
      return;
    }
    const timer = window.setTimeout(() => void refreshCatalog(true), 0);
    return () => window.clearTimeout(timer);
  }, [initialCatalog, refreshCatalog]);

  useEffect(() => {
    const refreshIfNeeded = () => {
      if (Date.now() - lastRefreshAt.current < 2500) return;
      void refreshCatalog(false);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refreshIfNeeded(); };
    window.addEventListener("focus", refreshIfNeeded);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("focus", refreshIfNeeded); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refreshCatalog]);

  const products = catalog?.products ?? [];
  const offers = catalog?.offers ?? [];
  const items = useMemo(() => [...offers, ...products], [offers, products]);
  const filtered = useMemo(() => {
    const clean = normalize(query.trim());
    return items.filter((item) => {
      if (category !== "Tous" && item.category !== category) return false;
      if (!clean) return true;
      return normalize(`${item.name} ${item.productCode} ${item.category} ${item.description}`).includes(clean);
    });
  }, [category, items, query]);
  const visibleItems = filtered.slice(0, visibleCount);
  const bestSellers = products.filter((item) => isBestSeller(item.badge)).slice(0, 8);
  const weekly = (offers.length ? offers : products).slice(0, 8);
  const collectionCategories = (catalog?.categories || []).filter((item) => item !== "Packs & offres").slice(0, 6);

  const cartLines = useMemo(() => Object.entries(cart).map(([key, quantity]) => {
    const item = items.find((candidate) => itemKey(candidate) === key);
    return item ? { key, item, quantity } : null;
  }).filter((line): line is { key: string; item: CatalogItem; quantity: number } => Boolean(line)), [cart, items]);
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.item.salePrice * line.quantity, 0);

  function add(item: CatalogItem) {
    if (!item.available) return;
    const key = itemKey(item);
    setCart((current) => ({ ...current, [key]: Math.min(20, (current[key] || 0) + 1) }));
    setCartOpen(true);
    track("AddToCart", { content_ids: [item.productCode], content_name: item.name, content_type: item.kind, value: item.salePrice, currency: "MAD" });
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: Math.min(20, quantity) };
    });
  }

  function beginCheckout() {
    if (!cartLines.length) return;
    setCartOpen(false);
    setCheckoutOpen(true);
    setSubmitError("");
    track("InitiateCheckout", { value: total, currency: "MAD", num_items: itemCount });
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartLines.length || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: form.get("customerName"), phone: form.get("phone"), city: form.get("city"), address: form.get("address"), note: form.get("note"), website: form.get("website"),
          utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign,
          items: cartLines.map((line) => ({ kind: line.item.kind, id: line.item.id, quantity: line.quantity })),
        }),
      });
      const body = await response.json() as { error?: string; orderRef?: string; total?: number };
      if (!response.ok) throw new Error(body.error || t.orderFailed);
      const orderRef = body.orderRef || "";
      setConfirmation({ orderRef, total: Number(body.total ?? total) });
      setCart({});
      setCheckoutOpen(false);
      track("Lead", { value: Number(body.total ?? total), currency: "MAD", content_name: "Commande COD" });
    } catch {
      setSubmitError(t.orderFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const brand = catalog?.brand || "Maison Jiya";
  const waDigits = (catalog?.contactWhatsapp || catalog?.whatsapp || "").replace(/\D/g, "").replace(/^0/, "212");
  const waMessage = lang === "ar" ? `مرحبًا ${brand}، لدي سؤال بخصوص المتجر.` : lang === "en" ? `Hello ${brand}, I have a question about your store.` : `Bonjour ${brand}, j’ai une question concernant votre boutique.`;
  const waUrl = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waMessage)}` : "";
  const announcement = localized?.announcement || t.freeDelivery;
  const strip = catalog?.brandStrip?.length ? catalog.brandStrip : [brand, "MONTRES", "BIJOUX", "PORTEFEUILLES", "PACKS"];

  return <main className="storefront-v3 storefront-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
    <div className="storefront-v3-marquee" aria-label={announcement}>
      <div className="storefront-v3-marquee-track">{Array.from({ length: 10 }, (_, index) => <span key={index}>{announcement} ✦</span>)}</div>
    </div>

    <header className="storefront-v3-header">
      <nav className="storefront-v3-nav-links">
        <a href="#catalogue">{t.catalogue}</a>{offers.length > 0 && <a href="#offres">{t.offers}</a>}<a href="#commande">{t.howToOrder}</a>
      </nav>
      <a className="storefront-v3-brand" href="/boutique" aria-label={`${brand} ${t.officialStore}`}>
        <SafeImage src={catalog?.logoUrl || "/maison-jiya-logo.jpeg"} alt={brand} priority fallback={<b>MJ</b>} />
        <span><strong>{brand}</strong><small>{t.officialStore}</small></span>
      </a>
      <div className="storefront-v3-header-actions">
        <div className="storefront-v3-language" aria-label="Language / اللغة"><button className={lang === "fr" ? "active" : ""} onClick={() => setLang("fr")}>FR</button><button className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>ع</button><button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button></div>
        <button className="storefront-v3-cart-button" type="button" onClick={() => setCartOpen(true)} aria-label={t.cart}>♡ <span>{t.cart}</span><b>{itemCount}</b></button>
      </div>
    </header>

    <section className={`storefront-v3-hero ${catalog?.heroImageUrl ? "has-image" : ""}`}>
      {catalog?.heroImageUrl && <div className="storefront-v3-hero-media"><SafeImage src={catalog.heroImageUrl} alt={`${brand} collection`} priority fallback={<div className="storefront-v3-hero-fallback">MJ</div>} /></div>}
      <div className="storefront-v3-hero-copy">
        <span>{brand} · MAROC</span>
        <h1>{localized?.heroTitle || catalog?.heroTitle}</h1>
        <p>{localized?.heroText || catalog?.heroText}</p>
        <div><a href="#catalogue">{t.discover}</a>{waUrl && <a className="ghost" href={waUrl} target="_blank" rel="noreferrer">{t.whatsapp}</a>}</div>
        <ul><li>{t.cashOnDelivery}</li><li>{t.confirmation}</li><li>{t.moroccoDelivery}</li></ul>
      </div>
    </section>

    <div className="storefront-v3-brand-strip" aria-label="Maison Jiya collections"><div className="storefront-v3-brand-strip-track">{[...strip, ...strip].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div></div>

    {weekly.length > 0 && <section className="storefront-v3-section" id="offres">
      <header className="storefront-v3-section-head"><div><small>{t.weeklyPromoKicker}</small><h2>{t.weeklyPromo}</h2></div></header>
      <div className="storefront-v3-grid promo">{weekly.map((item, index) => <ProductCard key={`weekly-${item.kind}-${item.id}`} item={item} lang={lang} t={t} add={add} priority={index < 2} />)}</div>
    </section>}

    {bestSellers.length > 0 && <section className="storefront-v3-section storefront-v3-best">
      <header className="storefront-v3-section-head"><div><small>{t.bestSellersKicker}</small><h2>{t.bestSellers}</h2><p>{t.bestSellerText}</p></div></header>
      <div className="storefront-v3-horizontal">{bestSellers.map((item) => <ProductCard key={`best-${item.id}`} item={item} lang={lang} t={t} add={add} />)}</div>
    </section>}

    {collectionCategories.length > 0 && <section className="storefront-v3-section storefront-v3-collections">
      <header className="storefront-v3-section-head"><div><small>{t.collectionsKicker}</small><h2>{t.collections}</h2></div></header>
      <div className="storefront-v3-collection-grid">{collectionCategories.map((item) => {
        const representative = products.find((product) => product.category === item);
        return <button type="button" key={item} onClick={() => { setCategory(item); document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth" }); }}>
          <div>{representative?.images[0] ? <SafeImage src={representative.images[0]} alt={item} fallback={<span>{item.slice(0, 1)}</span>} /> : <span>{item.slice(0, 1)}</span>}</div>
          <strong>{categoryCopy[lang][item] || item} →</strong>
        </button>;
      })}</div>
    </section>}

    {offers.length > 0 && <section className="storefront-v3-section storefront-v3-packs">
      <header className="storefront-v3-section-head"><div><small>{t.packsKicker}</small><h2>{t.packs}</h2></div></header>
      <div className="storefront-v3-grid packs">{offers.slice(0, 6).map((item) => <ProductCard key={`pack-${item.id}`} item={item} lang={lang} t={t} add={add} />)}</div>
    </section>}

    <section className="storefront-v3-section storefront-v3-catalogue" id="catalogue">
      <header className="storefront-v3-section-head"><div><small>{brand}</small><h2>{t.allProducts}</h2></div><strong>{filtered.length} {t.products}</strong></header>
      <div className="storefront-v3-tools">
        <label><span>{t.search}</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(INITIAL_VISIBLE); }} placeholder={t.searchPlaceholder} /></label>
        <label><span>{t.category}</span><select value={category} onChange={(event) => { setCategory(event.target.value); setVisibleCount(INITIAL_VISIBLE); }}><option value="Tous">{t.allCategories}</option>{catalog?.categories.map((item) => <option key={item} value={item}>{categoryCopy[lang][item] || item}</option>)}</select></label>
      </div>
      {loading && <div className="storefront-v3-state">{t.loading}</div>}
      {error && <div className="storefront-v3-state error">{error}</div>}
      {!loading && !error && <div className="storefront-v3-grid catalogue">{visibleItems.map((item, index) => <ProductCard key={`${item.kind}-${item.id}`} item={item} lang={lang} t={t} add={add} priority={index < 2} />)}</div>}
      {visibleCount < filtered.length && <button className="storefront-v3-more" type="button" onClick={() => setVisibleCount((value) => value + INITIAL_VISIBLE)}>{t.loadMore}</button>}
    </section>

    <section className="storefront-v3-how" id="commande"><small>{brand}</small><h2>{t.whyOrder}</h2><div><article><b>01</b><strong>{t.step1}</strong><p>{t.step1Text}</p></article><article><b>02</b><strong>{t.step2}</strong><p>{t.step2Text}</p></article><article><b>03</b><strong>{t.step3}</strong><p>{t.step3Text}</p></article></div></section>

    <section className="storefront-v3-contact" id="contact"><div><small>{brand}</small><h2>{t.helpTitle}</h2><p>{t.helpText}</p></div>{waUrl && <a href={waUrl} target="_blank" rel="noreferrer">{t.whatsapp} →</a>}</section>
    <footer className="storefront-v3-footer"><div><strong>{brand}</strong><small>{localized?.shippingNote || catalog?.shippingNote}</small></div><span>© {new Date().getFullYear()} {brand}</span></footer>
    {waUrl && <a className="storefront-v3-wa" href={waUrl} target="_blank" rel="noreferrer" aria-label={t.whatsapp}>WA</a>}

    {cartOpen && <div className="storefront-v3-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
      <aside className="storefront-v3-drawer" role="dialog" aria-modal="true" aria-label={t.yourCart}>
        <header><div><small>{brand}</small><h2>{t.yourCart}</h2></div><button type="button" onClick={() => setCartOpen(false)} aria-label={t.close}>×</button></header>
        <div className="storefront-v3-cart-lines">{cartLines.length ? cartLines.map((line) => <article key={line.key}><div><strong>{line.item.name}</strong><small>{money(line.item.salePrice, lang)}</small></div><div className="storefront-v3-qty"><button type="button" onClick={() => updateQuantity(line.key, line.quantity - 1)}>−</button><span>{line.quantity}</span><button type="button" onClick={() => updateQuantity(line.key, line.quantity + 1)}>+</button></div><button className="storefront-v3-remove" type="button" onClick={() => updateQuantity(line.key, 0)}>{t.remove}</button></article>) : <p className="storefront-v3-empty">{t.emptyCart}</p>}</div>
        <footer><div><span>{t.total}</span><strong>{money(total, lang)}</strong></div><small>{localized?.shippingNote || catalog?.shippingNote}</small><button type="button" disabled={!cartLines.length} onClick={beginCheckout}>{t.checkout}</button><button className="ghost" type="button" onClick={() => setCartOpen(false)}>{t.continueShopping}</button></footer>
      </aside>
    </div>}

    {checkoutOpen && <div className="storefront-v3-overlay checkout" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}>
      <section className="storefront-v3-checkout" role="dialog" aria-modal="true" aria-label={t.orderTitle}>
        <header><div><small>{brand}</small><h2>{t.orderTitle}</h2><p>{t.orderSubtitle}</p></div><button type="button" onClick={() => setCheckoutOpen(false)} aria-label={t.close}>×</button></header>
        <div className="storefront-v3-checkout-summary"><span>{itemCount} {t.products}</span><strong>{money(total, lang)}</strong></div>
        <form onSubmit={(event) => void submitOrder(event)}>
          <label><span>{t.fullName} *</span><input name="customerName" autoComplete="name" required minLength={2} /></label>
          <div className="storefront-v3-form-row"><label><span>{t.phone} *</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" required /></label><label><span>{t.city} *</span><input name="city" autoComplete="address-level2" required /></label></div>
          <label><span>{t.address} *</span><textarea name="address" autoComplete="street-address" rows={3} minLength={5} required /></label>
          <label><span>{t.note} ({t.optional})</span><textarea name="note" rows={2} maxLength={240} /></label>
          <label className="storefront-v3-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
          {submitError && <p className="storefront-v3-submit-error" role="alert">{submitError}</p>}
          <button className="storefront-v3-submit" disabled={submitting}>{submitting ? t.sending : t.confirmOrder}</button>
          <small className="storefront-v3-cod">{t.cashOnDelivery} · {t.confirmation}</small>
        </form>
      </section>
    </div>}

    {confirmation && <div className="storefront-v3-overlay"><section className="storefront-v3-success" role="dialog" aria-modal="true"><span>✓</span><h2>{t.orderSuccess}</h2><p>{t.orderSuccessText}</p><div><small>{t.orderRef}</small><strong>{confirmation.orderRef}</strong><small>{t.total}</small><strong>{money(confirmation.total, lang)}</strong></div>{waUrl && <a href={waUrl} target="_blank" rel="noreferrer">{t.whatsapp}</a>}<button type="button" onClick={() => setConfirmation(null)}>{t.close}</button></section></div>}
  </main>;
}
