"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { JY_MARK } from "./brand-marks";
import { productPath } from "../../lib/product-slug";
import { frequentlyBoughtWith, pickCartSuggestion, promotionProgress } from "../../lib/cart-suggestion";
import { giftBoxTotal, matchesAudience, normalizeAudience, type Audience } from "../../lib/storefront-extras";
import type { CatalogItem, StorefrontCatalog, StorefrontReview, StorefrontLanguage, StorefrontMarketingSection } from "./storefront-types";
import { calculateIndependentPromotions, promotionRuleLabel, type StorefrontPromotion } from "../../lib/storefront-promotions";

type Cart = Record<string, number>;
type FbqFunction = ((...args: unknown[]) => void) & { queue?: unknown[][]; loaded?: boolean; version?: string };
type FbqWindow = Window & { fbq?: FbqFunction; _fbq?: FbqFunction; __maisonJiyaPixels?: Record<string, boolean> };
type ImageState = { src: string; attempt: number; failed: boolean };
type MetaConsent = "loading" | "unset" | "accepted" | "refused";
const META_CONSENT_KEY = "maison-jiya-meta-consent-v1";
function pixelConsentGranted() {
  try { return typeof window !== "undefined" && window.localStorage.getItem(META_CONSENT_KEY) === "accepted"; }
  catch { return false; }
}

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
  subtotal: string;
  total: string;
  promoSecondItem: string;
  promoApplied: string;
  promoHint: string;
  promotionProducts: string;
  clearPromotionFilter: string;
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
    unavailable: "Indisponible", addToCart: "Ajouter au panier", viewProduct: "Voir ce produit", loadMore: "Afficher plus", yourCart: "Votre panier", emptyCart: "Votre panier est vide.", subtotal: "Sous-total", total: "Total", promoSecondItem: "Promotion", promoApplied: "Offre appliquée", promoHint: "Les promotions actives s’appliquent automatiquement, une seule à la fois.", promotionProducts: "Produits concernés par l’offre", clearPromotionFilter: "Voir tout le catalogue", checkout: "Commander",
    continueShopping: "Continuer mes achats", quantity: "Quantité", remove: "Supprimer", orderTitle: "Finaliser la commande", orderSubtitle: "Aucun paiement en ligne. Notre équipe vous contacte pour confirmer.", fullName: "Nom complet", phone: "Téléphone", city: "Ville", address: "Adresse de livraison",
    note: "Note", optional: "facultatif", confirmOrder: "Envoyer ma commande", sending: "Envoi…", orderSuccess: "Commande reçue", orderSuccessText: "Merci. Notre équipe vous contactera pour confirmer la disponibilité et votre commande avant préparation.", orderRef: "Référence", close: "Fermer", orderFailed: "Impossible d’enregistrer la commande. Vérifiez vos informations puis réessayez.",
    whyOrder: "COMMENT COMMANDER", step1: "1. Choisissez", step1Text: "Ajoutez les modèles et quantités qui vous plaisent, même si vous en souhaitez plusieurs.", step2: "2. Envoyez", step2Text: "Renseignez vos coordonnées et envoyez votre commande sans paiement en ligne.", step3: "3. Confirmez", step3Text: "Notre équipe vous contacte pour confirmer la disponibilité avant préparation et livraison.",
    helpTitle: "Besoin d’aide ?", helpText: "Écrivez-nous sur WhatsApp pour une question sur un modèle, un pack ou votre commande.", freeDelivery: "Livraison partout au Maroc",
  },
  ar: {
    officialStore: "المتجر الرسمي", catalogue: "الكتالوج", offers: "العروض", howToOrder: "كيفية الطلب", contact: "تواصل معنا", cart: "السلة",
    discover: "اكتشف المجموعة", whatsapp: "واتساب", cashOnDelivery: "الدفع عند الاستلام", confirmation: "تأكيد الطلب من فريقنا", moroccoDelivery: "التوصيل إلى جميع أنحاء المغرب",
    weeklyPromo: "عرض الأسبوع", weeklyPromoKicker: "عروضنا الحالية", bestSellers: "الأكثر طلبًا", bestSellersKicker: "اختيارات العملاء", bestSellerText: "مجموعة مختارة من الموديلات المفضلة لدى عملائنا.",
    collections: "مجموعاتنا", collectionsKicker: "اختر ما يناسبك", packs: "الباقات", packsKicker: "عروض مختارة لك", allProducts: "جميع الموديلات",
    search: "بحث", searchPlaceholder: "ساعة، محفظة، مرجع…", category: "الفئة", allCategories: "جميع الفئات", products: "منتجات", loading: "جارٍ تحميل الكتالوج…",
    unavailable: "غير متوفر", addToCart: "أضف إلى السلة", viewProduct: "عرض المنتج", loadMore: "عرض المزيد", yourCart: "سلة التسوق", emptyCart: "سلة التسوق فارغة.", subtotal: "المجموع قبل العرض", total: "المجموع", promoSecondItem: "عرض", promoApplied: "تم تطبيق العرض", promoHint: "تُطبّق العروض النشطة تلقائيًا، عرض واحد فقط في كل مرة.", promotionProducts: "المنتجات المشمولة بالعرض", clearPromotionFilter: "عرض كل المنتجات", checkout: "إتمام الطلب",
    continueShopping: "متابعة التسوق", quantity: "الكمية", remove: "حذف", orderTitle: "إتمام الطلب", orderSubtitle: "لا يوجد دفع إلكتروني. سيتواصل معك فريقنا لتأكيد الطلب.", fullName: "الاسم الكامل", phone: "رقم الهاتف", city: "المدينة", address: "عنوان التوصيل",
    note: "ملاحظة", optional: "اختياري", confirmOrder: "إرسال الطلب", sending: "جارٍ الإرسال…", orderSuccess: "تم استلام طلبك", orderSuccessText: "شكرًا لك. سيتواصل معك فريقنا لتأكيد توفر المنتجات والطلب قبل التجهيز.", orderRef: "رقم الطلب", close: "إغلاق", orderFailed: "تعذر تسجيل الطلب. تحقق من معلوماتك ثم حاول مرة أخرى.",
    whyOrder: "كيفية الطلب", step1: "1. اختر", step1Text: "أضف الموديلات والكميات التي تريدها، حتى إذا كنت ترغب في أكثر من قطعة.", step2: "2. أرسل الطلب", step2Text: "أدخل معلوماتك وأرسل الطلب من دون أي دفع إلكتروني.", step3: "3. التأكيد", step3Text: "سيتواصل معك فريقنا لتأكيد التوفر قبل تجهيز الطلب والتوصيل.",
    helpTitle: "تحتاج إلى مساعدة؟", helpText: "راسلنا على واتساب لأي سؤال حول موديل أو باقة أو طلبك.", freeDelivery: "التوصيل إلى جميع أنحاء المغرب",
  },
  en: {
    officialStore: "Official store", catalogue: "Catalog", offers: "Offers", howToOrder: "How to order", contact: "Contact", cart: "Cart",
    discover: "Discover the collection", whatsapp: "WhatsApp", cashOnDelivery: "Cash on delivery", confirmation: "Confirmed by our team", moroccoDelivery: "Delivery across Morocco",
    weeklyPromo: "WEEKLY PROMOTION", weeklyPromoKicker: "Current offers", bestSellers: "BEST SELLERS", bestSellersKicker: "Customer favorites", bestSellerText: "A selection of customer-favorite styles.",
    collections: "OUR COLLECTIONS", collectionsKicker: "Choose your style", packs: "OUR PACKS", packsKicker: "Offers selected for you", allProducts: "ALL MODELS",
    search: "Search", searchPlaceholder: "Watch, wallet, reference…", category: "Category", allCategories: "All categories", products: "items", loading: "Loading catalog…",
    unavailable: "Unavailable", addToCart: "Add to cart", viewProduct: "View product", loadMore: "Show more", yourCart: "Your cart", emptyCart: "Your cart is empty.", subtotal: "Subtotal", total: "Total", promoSecondItem: "Promotion", promoApplied: "Offer applied", promoHint: "Active promotions apply automatically, one at a time.", promotionProducts: "Products included in the offer", clearPromotionFilter: "View full catalog", checkout: "Checkout",
    continueShopping: "Continue shopping", quantity: "Quantity", remove: "Remove", orderTitle: "Complete your order", orderSubtitle: "No online payment. Our team will contact you to confirm the order.", fullName: "Full name", phone: "Phone", city: "City", address: "Delivery address",
    note: "Note", optional: "optional", confirmOrder: "Place my order", sending: "Sending…", orderSuccess: "Order received", orderSuccessText: "Thank you. Our team will contact you to confirm availability and your order before preparation.", orderRef: "Reference", close: "Close", orderFailed: "We could not register your order. Check your details and try again.",
    whyOrder: "HOW TO ORDER", step1: "1. Choose", step1Text: "Add the models and quantities you want, even when you need several pieces.", step2: "2. Send", step2Text: "Enter your details and place your order without any online payment.", step3: "3. Confirm", step3Text: "Our team contacts you to confirm availability before preparation and delivery.",
    helpTitle: "Need help?", helpText: "Message us on WhatsApp with any question about a model, pack or your order.", freeDelivery: "Delivery across Morocco",
  },
};

const categoryCopy: Record<StorefrontLanguage, Record<string, string>> = {
  fr: { "Packs & offres": "Packs & offres", Portefeuilles: "Portefeuilles", Montres: "Montres", Bijoux: "Bijoux", Autre: "Autre" },
  ar: { "Packs & offres": "الباقات والعروض", Portefeuilles: "المحافظ", Montres: "الساعات", Bijoux: "المجوهرات", Autre: "أخرى" },
  en: { "Packs & offres": "Packs & offers", Portefeuilles: "Wallets", Montres: "Watches", Bijoux: "Jewelry", Autre: "Other" },
};

const INITIAL_VISIBLE = 24;
const itemKey = (item: Pick<CatalogItem, "kind" | "id">) => `${item.kind === "offer" ? "o" : "p"}:${item.id}`;

function sanitizeStoredCart(value: unknown): Cart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: Cart = {};
  for (const [key, rawQuantity] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[op]:\d+$/.test(key)) continue;
    const quantity = Number(rawQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    clean[key] = Math.min(20, quantity);
  }
  return clean;
}

function pruneCartForCatalog(cart: Cart, catalog: StorefrontCatalog | null): Cart {
  if (!catalog) return cart;
  const validItems = new Map([...catalog.offers, ...catalog.products].map((item) => [itemKey(item), item]));
  const next: Cart = {};
  for (const [key, quantity] of Object.entries(cart)) {
    const item = validItems.get(key);
    if (!item || !item.available) continue;
    next[key] = quantity;
  }
  return next;
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const isBestSeller = (badge: string) => normalize(badge || "").replace(/[^a-z0-9]/g, "").includes("bestseller");

function money(value: number, lang: StorefrontLanguage) {
  return `${Number(value).toLocaleString(lang === "ar" ? "ar-MA" : lang === "en" ? "en-MA" : "fr-MA", { maximumFractionDigits: 2 })} DH`;
}

function track(event: string, data?: Record<string, unknown>, options?: { eventID?: string }) {
  if (!pixelConsentGranted()) return;
  if (options?.eventID) (window as FbqWindow).fbq?.("track", event, data || {}, options);
  else (window as FbqWindow).fbq?.("track", event, data || {});
}

function enableMetaPixel(pixelId: string) {
  if (!pixelId || !pixelConsentGranted()) return false;
  const target = window as FbqWindow;
  target.__maisonJiyaPixels = target.__maisonJiyaPixels || {};
  if (target.__maisonJiyaPixels[pixelId]) return false;
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
  target.__maisonJiyaPixels[pixelId] = true;
  return true;
}

function trackLeadOnce(orderRef: string, total: number, lines: Array<{ item: CatalogItem; quantity: number }>) {
  if (!orderRef || typeof window === "undefined" || !(window as FbqWindow).fbq) return;
  const storageKey = `maison-jiya-meta-lead:${orderRef}`;
  try {
    if (localStorage.getItem(storageKey)) return;
  } catch { /* le tracking reste facultatif */ }
  track("Lead", {
    content_name: "Commande COD",
    value: total,
    currency: "MAD",
    content_type: "product",
    content_ids: lines.map((line) => line.item.productCode),
    contents: lines.map((line) => ({ id: line.item.productCode, quantity: line.quantity, item_price: line.item.salePrice })),
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
    order_id: orderRef,
  }, { eventID: `lead-${orderRef}` });
  try { localStorage.setItem(storageKey, "1"); } catch { /* le tracking reste facultatif */ }
}

function JyMark() {
  return <svg className="mj-jy" viewBox={`0 0 ${JY_MARK.width} ${JY_MARK.height}`} aria-hidden="true" focusable="false"><path fillRule="evenodd" d={JY_MARK.d} /></svg>;
}

function SafeImage({ src, alt, fallback, priority = false, width, height }: { src: string; alt: string; fallback: ReactNode; priority?: boolean; width?: number; height?: number }) {
  const [storedState, setStoredState] = useState<ImageState>({ src: "", attempt: 0, failed: false });
  const state = storedState.src === src ? storedState : { src, attempt: 0, failed: false };
  if (!src || state.failed) return <>{fallback}</>;
  const separator = src.includes("?") ? "&" : "?";
  const resolvedSrc = state.attempt ? `${src}${separator}retry=${state.attempt}` : src;
  return <img src={resolvedSrc} alt={alt} width={width} height={height} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={() => {
    if (state.attempt < 1) setStoredState({ src, attempt: 1, failed: false });
    else setStoredState({ src, attempt: state.attempt, failed: true });
  }} />;
}

function ProductCard({ item, lang, t, add, open, priority = false }: { item: CatalogItem; lang: StorefrontLanguage; t: Copy; add: (item: CatalogItem) => void; open: (item: CatalogItem) => void; priority?: boolean }) {
  const fallback = <div className="storefront-v3-image-fallback"><b>{item.category.slice(0, 1).toUpperCase()}</b><small>{categoryCopy[lang][item.category] || item.category}</small></div>;
  const discount = item.comparePrice > item.salePrice ? Math.round((1 - item.salePrice / item.comparePrice) * 100) : 0;
  return <article className={`storefront-v3-product ${!item.available ? "is-unavailable" : ""}`}>
    <button className="storefront-v3-product-media storefront-v3-product-open" type="button" onClick={() => open(item)} aria-label={`${t.viewProduct} : ${item.name}`}>
      {item.images[0] ? <SafeImage src={item.images[0]} alt={item.name} fallback={fallback} priority={priority} width={480} height={500} /> : fallback}
      {discount > 0 ? <em className="is-discount">-{discount} %</em> : item.badge ? <em>{item.badge}</em> : null}
      {item.images.length > 1 && <span className="storefront-v3-photo-count">{item.images.length} photos</span>}
      {!item.available && <i>{t.unavailable}</i>}
    </button>
    <div className="storefront-v3-product-info">
      <small>{categoryCopy[lang][item.category] || item.category}</small>
      {/* Vrai lien vers la page du produit (Google, partage), ouvert en fenêtre rapide au clic simple. */}
      <h3><a className="storefront-v3-product-title-button" href={productPath(item)} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return; event.preventDefault(); open(item); }}>{item.name}</a></h3>
      <div className="storefront-v3-price"><strong>{money(item.salePrice, lang)}</strong>{item.comparePrice > item.salePrice && <del>{money(item.comparePrice, lang)}</del>}</div>
      <button className="storefront-v3-add-product" type="button" disabled={!item.available} onClick={() => add(item)}>{item.available ? t.addToCart : t.unavailable}</button>
    </div>
  </article>;
}

const reviewCopy = {
  fr: { title: "Ils nous font confiance", text: "Messages reçus de nos clients, publiés avec leur accord.", via: "Reçu sur", product: "À propos de" },
  ar: { title: "يثقون بنا", text: "رسائل توصلنا بها من زبائننا، منشورة بموافقتهم.", via: "عبر", product: "بخصوص" },
  en: { title: "They trust us", text: "Messages from our customers, published with their consent.", via: "Received on", product: "About" },
};

function ReviewCard({ review, lang, product, zoom }: { review: StorefrontReview; lang: StorefrontLanguage; product?: CatalogItem; zoom: (src: string) => void }) {
  const c = reviewCopy[lang];
  const when = review.date ? new Date(`${review.date}T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-MA", { day: "numeric", month: "short", year: "numeric" }) : "";
  return <figure className="mj-review">
    <div className="mj-review-stars" role="img" aria-label={`${review.rating}/5`}>{"★".repeat(review.rating)}<span>{"★".repeat(5 - review.rating)}</span></div>
    {review.body && <blockquote>{review.body}</blockquote>}
    {/* Capture WhatsApp ou photo : affichée en grand, agrandissable en plein écran. */}
    {review.imageUrl && <button type="button" className={`mj-review-shot ${review.body ? "" : "is-main"}`} onClick={() => zoom(review.imageUrl)} aria-label={lang === "ar" ? "تكبير الصورة" : lang === "en" ? "Enlarge" : "Agrandir la capture"}>
      <SafeImage src={review.imageUrl} alt={`${review.name} — ${lang === "ar" ? "رسالة" : lang === "en" ? "message" : "message"}`} fallback={null} width={540} height={960} />
    </button>}
    <figcaption>
      <strong>{review.name}{review.city ? ` · ${review.city}` : ""}</strong>
      <small>{[review.source && `${c.via} ${review.source}`, when].filter(Boolean).join(" · ")}</small>
      {product && <a href={productPath(product)}>{c.product} : {product.name}</a>}
    </figcaption>
  </figure>;
}

function ProductGalleryModal({ item, lang, t, add, close }: { item: CatalogItem; lang: StorefrontLanguage; t: Copy; add: (item: CatalogItem) => void; close: () => void }) {
  return <div className="storefront-v3-overlay product-gallery" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="storefront-v3-product-dialog" role="dialog" aria-modal="true" aria-label={item.name}>
      <button className="storefront-v3-product-dialog-close" type="button" onClick={close} aria-label={t.close}>×</button>
      <ProductDetail item={item} lang={lang} t={t} add={add} variant="dialog" />
    </section>
  </div>;
}

const pageCopy = {
  fr: { pageLink: "Voir la page du produit", share: "Partager", copied: "Lien copié", back: "Boutique", related: "Vous aimerez aussi", missing: "Cet article n’est plus disponible", missingText: "Il a peut-être été retiré de la boutique. Découvrez les autres modèles.", seeAll: "Voir tous les modèles", delivery: "Livraison partout au Maroc · paiement à la réception · confirmation par téléphone" },
  ar: { pageLink: "صفحة المنتج", share: "مشاركة", copied: "تم نسخ الرابط", back: "المتجر", related: "قد يعجبك أيضًا", missing: "هذا المنتج لم يعد متوفرًا", missingText: "ربما تمت إزالته من المتجر. اكتشف الموديلات الأخرى.", seeAll: "جميع الموديلات", delivery: "توصيل لجميع أنحاء المغرب · الدفع عند الاستلام · تأكيد بالهاتف" },
  en: { pageLink: "Open product page", share: "Share", copied: "Link copied", back: "Shop", related: "You may also like", missing: "This item is no longer available", missingText: "It may have been removed from the shop. Discover the other models.", seeAll: "See all models", delivery: "Delivery across Morocco · pay on delivery · phone confirmation" },
};

function ProductDetail({ item, lang, t, add, variant }: { item: CatalogItem; lang: StorefrontLanguage; t: Copy; add: (item: CatalogItem) => void; variant: "dialog" | "page" }) {
  const p = pageCopy[lang];
  const [shareState, setShareState] = useState<"" | "copied">("");
  async function share() {
    const url = `${window.location.origin}${productPath(item)}`;
    try {
      if (navigator.share) { await navigator.share({ title: item.name, url }); return; }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      window.setTimeout(() => setShareState(""), 2200);
    } catch { /* partage annulé */ }
  }
  const [activeImage, setActiveImage] = useState(0);
  const touchStart = useRef<number | null>(null);
  const images = item.images.length ? item.images : [""];
  const imageCount = images.length;
  const fallback = <div className="storefront-v3-image-fallback"><b>{item.category.slice(0, 1).toUpperCase()}</b><small>{categoryCopy[lang][item.category] || item.category}</small></div>;

  const move = useCallback((delta: number) => {
    setActiveImage((current) => (current + delta + imageCount) % imageCount);
  }, [imageCount]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (imageCount > 1 && event.key === "ArrowLeft") move(-1);
      if (imageCount > 1 && event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageCount, move]);

  return <>
      <div className="storefront-v3-product-gallery">
        <div
          className="storefront-v3-product-gallery-main"
          onTouchStart={(event) => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (start === null || imageCount <= 1) return;
            const end = event.changedTouches[0]?.clientX ?? start;
            const distance = end - start;
            if (Math.abs(distance) < 40) return;
            move(distance < 0 ? 1 : -1);
          }}
        >
          {images[activeImage] ? <SafeImage src={images[activeImage]} alt={`${item.name} · ${activeImage + 1}`} fallback={fallback} priority width={900} height={900} /> : fallback}
          {imageCount > 1 && <>
            <button className="storefront-v3-gallery-arrow previous" type="button" onClick={() => move(-1)} aria-label="Photo précédente">‹</button>
            <button className="storefront-v3-gallery-arrow next" type="button" onClick={() => move(1)} aria-label="Photo suivante">›</button>
            <span className="storefront-v3-gallery-counter">{activeImage + 1} / {imageCount}</span>
          </>}
        </div>
        {imageCount > 1 && <div className="storefront-v3-product-thumbnails" aria-label="Galerie photos">
          {images.map((image, index) => <button className={index === activeImage ? "active" : ""} type="button" key={image || index} onClick={() => setActiveImage(index)} aria-label={`Afficher la photo ${index + 1}`}>
            {image ? <SafeImage src={image} alt={`${item.name} miniature ${index + 1}`} fallback={<span>{index + 1}</span>} width={96} height={96} /> : <span>{index + 1}</span>}
          </button>)}
        </div>}
      </div>
      <div className="storefront-v3-product-dialog-info">
        <small>{item.productCode} · {categoryCopy[lang][item.category] || item.category}</small>
        {variant === "page" ? <h1>{item.name}</h1> : <h2>{item.name}</h2>}
        {item.description && <p>{item.description}</p>}
        <div className="storefront-v3-product-dialog-price"><strong>{money(item.salePrice, lang)}</strong>{item.comparePrice > item.salePrice && <del>{money(item.comparePrice, lang)}</del>}</div>
        <span className={`storefront-v3-product-availability ${item.available ? "available" : "unavailable"}`}>{item.availability}</span>
        <button className="storefront-v3-product-dialog-add" type="button" disabled={!item.available} onClick={() => add(item)}>{item.available ? t.addToCart : t.unavailable}</button>
        {variant === "page" && <p className="mj-product-reassure">{p.delivery}</p>}
        <div className="mj-product-links">
          {variant === "dialog" && <a href={productPath(item)}>{p.pageLink}</a>}
          <button type="button" onClick={() => void share()}>{shareState === "copied" ? p.copied : p.share}</button>
        </div>
      </div>
  </>;
}

export default function StorefrontClientV3({ initialCatalog, productKey }: { initialCatalog: StorefrontCatalog | null; productKey?: string }) {
  const [catalog, setCatalog] = useState<StorefrontCatalog | null>(initialCatalog);
  const [loading, setLoading] = useState(!initialCatalog);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<StorefrontLanguage>("fr");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tous");
  const [promotionCategoryFilter, setPromotionCategoryFilter] = useState<string[]>([]);
  const [promotionFilterName, setPromotionFilterName] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<{ orderRef: string; total: number } | null>(null);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [utm, setUtm] = useState({ source: "", medium: "", campaign: "" });
  const [metaConsent, setMetaConsent] = useState<MetaConsent>("loading");
  const [cookieSettingsOpen, setCookieSettingsOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>("");
  const [giftBoxChosen, setGiftBoxChosen] = useState(false);
  const [bundleSkipped, setBundleSkipped] = useState<string[]>([]);
  const [zoomImage, setZoomImage] = useState("");
  useEffect(() => {
    if (!zoomImage) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomImage(""); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomImage]);
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
      setCart((current) => pruneCartForCatalog(current, body));
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
        if (savedCart) setCart(pruneCartForCatalog(sanitizeStoredCart(JSON.parse(savedCart)), initialCatalog));
      } catch { /* stockage facultatif */ }
      setPreferencesLoaded(true);
      const params = new URLSearchParams(window.location.search);
      setUtm({ source: params.get("utm_source") || "", medium: params.get("utm_medium") || "", campaign: params.get("utm_campaign") || "" });
      // Lien direct vers une gamme : /boutique?gamme=homme#catalogue
      const gamme = normalizeAudience(params.get("gamme"));
      if (gamme && gamme !== "unisexe") setAudience(gamme);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    if (!preferencesLoaded) return;
    try { localStorage.setItem("maison-jiya-language-v3", lang); } catch { /* facultatif */ }
  }, [lang, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    try { localStorage.setItem("maison-jiya-cart-v3", JSON.stringify(cart)); } catch { /* facultatif */ }
  }, [cart, preferencesLoaded]);

  useEffect(() => {
    const overlayOpen = Boolean(selectedItem || cartOpen || checkoutOpen || confirmation);
    if (!overlayOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (checkoutOpen && submitting) return;
      if (confirmation) {
        setConfirmation(null);
        return;
      }
      if (checkoutOpen) {
        setCheckoutOpen(false);
        return;
      }
      if (cartOpen) {
        setCartOpen(false);
        return;
      }
      if (selectedItem) setSelectedItem(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [cartOpen, checkoutOpen, confirmation, selectedItem, submitting]);

  useEffect(() => {
    if (initialCatalog) {
      lastRefreshAt.current = Date.now();
      return;
    }
    const timer = window.setTimeout(() => void refreshCatalog(true), 0);
    return () => window.clearTimeout(timer);
  }, [initialCatalog, refreshCatalog]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value = localStorage.getItem(META_CONSENT_KEY);
        setMetaConsent(value === "accepted" || value === "refused" ? value : "unset");
      } catch {
        setMetaConsent("unset");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function chooseMetaConsent(choice: "accepted" | "refused") {
    const wasAccepted = pixelConsentGranted();
    try { localStorage.setItem(META_CONSENT_KEY, choice); } catch { /* Aucun suivi si stockage indisponible. */ }
    setMetaConsent(choice);
    setCookieSettingsOpen(false);
    // Après un refus, retirer entièrement les balises Pixel déjà installées requiert un rechargement.
    if (wasAccepted && choice === "refused") window.location.reload();
  }

  useEffect(() => {
    if (metaConsent !== "accepted") return;
    const pixelId = catalog?.metaPixelId || "";
    // Sur une page produit, la mesure du produit est faite plus bas (une fois le produit trouvé).
    if (pixelId && enableMetaPixel(pixelId) && !productKey) {
      track("ViewContent", { content_name: "Maison Jiya Boutique", content_type: "product_group" });
    }
  }, [catalog?.metaPixelId, metaConsent, productKey]);

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
  const promotion = catalog?.promotionBanner;
  const items = useMemo(() => [...offers, ...products], [offers, products]);
  const filtered = useMemo(() => {
    const clean = normalize(query.trim());
    return items.filter((item) => {
      if (promotionCategoryFilter.length && (item.kind !== "product" || !promotionCategoryFilter.includes(item.category))) return false;
      if (category !== "Tous" && item.category !== category) return false;
      if (audience && (item.kind !== "product" || !matchesAudience(item.audience, audience))) return false;
      if (!clean) return true;
      return normalize(`${item.name} ${item.productCode} ${item.category} ${item.description}`).includes(clean);
    });
  }, [audience, category, items, promotionCategoryFilter, query]);
  const visibleItems = filtered.slice(0, visibleCount);
  const bestSellers = products.filter((item) => isBestSeller(item.badge)).slice(0, 8);
  const promotedOffer = promotion?.offerId ? offers.find((item) => item.id === promotion.offerId) : undefined;
  const weeklyOffers = promotedOffer ? [promotedOffer, ...offers.filter((item) => item.id !== promotedOffer.id)] : offers;

  const cartLines = useMemo(() => Object.entries(cart).map(([key, quantity]) => {
    const item = items.find((candidate) => itemKey(candidate) === key);
    return item ? { key, item, quantity } : null;
  }).filter((line): line is { key: string; item: CatalogItem; quantity: number } => Boolean(line)), [cart, items]);
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const allPromotions = catalog?.promotions || [];
  const activePromotions = allPromotions.filter((item) => item.isActive);
  const displayPromotions = activePromotions.filter((item) => item.displayEnabled);
  const cartPricing = calculateIndependentPromotions(
    cartLines.map((line) => ({
      key: line.key,
      kind: line.item.kind,
      unitPrice: line.item.salePrice,
      quantity: line.quantity,
      category: line.item.category,
    })),
    activePromotions,
  );
  const subtotal = cartPricing.subtotal;
  // Option coffret : un coffret par article, ajouté après la promo (recalculé par le serveur).
  const giftBox = catalog?.giftBox;
  const giftBoxLine = giftBox ? giftBoxTotal(giftBox, itemCount, giftBoxChosen) : { count: 0, amount: 0 };
  const total = Math.round((cartPricing.total + giftBoxLine.amount) * 100) / 100;
  const promoProgress = promotionProgress(
    cartLines.map((line) => ({ kind: line.item.kind, category: line.item.category, quantity: line.quantity, unitPrice: line.item.salePrice })),
    activePromotions,
    cartPricing.applied,
  );
  const cartSuggestion = pickCartSuggestion(
    items,
    cartLines.map((line) => line.key),
    cartLines.map((line) => ({ kind: line.item.kind, category: line.item.category, quantity: line.quantity, unitPrice: line.item.salePrice })),
    activePromotions,
    cartPricing.applied,
  );
  const primaryPromotion = activePromotions.slice().sort((left, right) => left.priority - right.priority || left.id - right.id)[0];

  function add(item: CatalogItem) {
    if (!item.available) return;
    const key = itemKey(item);
    setCart((current) => ({ ...current, [key]: Math.min(20, (current[key] || 0) + 1) }));
    setSelectedItem(null);
    setCartOpen(true);
    track("AddToCart", { content_ids: [item.productCode], content_name: item.name, content_type: item.kind, value: item.salePrice, currency: "MAD" });
  }

  function openItem(item: CatalogItem) {
    setSelectedItem(item);
    track("ViewContent", { content_ids: [item.productCode], content_name: item.name, content_type: item.kind, value: item.salePrice, currency: "MAD" });
  }

  function updateQuantity(key: string, quantity: number) {
    setCart((current) => {
      if (!Number.isInteger(quantity) || quantity <= 0) {
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
          privacyAcknowledged: form.get("privacyAcknowledged") === "yes",
          utmSource: utm.source, utmMedium: utm.medium, utmCampaign: utm.campaign,
          giftBox: giftBoxLine.count > 0,
          items: cartLines.map((line) => ({ kind: line.item.kind, id: line.item.id, quantity: line.quantity })),
        }),
      });
      const body = await response.json() as { error?: string; orderRef?: string; total?: number };
      if (!response.ok) throw new Error(body.error || t.orderFailed);
      const orderRef = body.orderRef || "";
      const orderTotal = Number(body.total ?? total);
      // Paiement à la livraison : une commande envoyée n'est pas encore un achat.
      // Seul « Lead » est envoyé ici ; « Purchase » sera réservé aux commandes livrées
      // (API Conversions côté serveur, à brancher).
      trackLeadOnce(orderRef, orderTotal, cartLines);
      setConfirmation({ orderRef, total: orderTotal });
      setCart({});
      setCheckoutOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error && error.message ? error.message : t.orderFailed);
    } finally {
      setSubmitting(false);
    }
  }

  const brand = catalog?.brand || "Maison Jiya";
  const waDigits = (catalog?.contactWhatsapp || catalog?.whatsapp || "").replace(/\D/g, "").replace(/^0/, "212");
  const waMessage = lang === "ar" ? `مرحبًا ${brand}، لدي سؤال بخصوص المتجر.` : lang === "en" ? `Hello ${brand}, I have a question about your store.` : `Bonjour ${brand}, j’ai une question concernant votre boutique.`;
  const waUrl = waDigits ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waMessage)}` : "";
  const announcement = localized?.announcement || t.moroccoDelivery;
  const promotionTarget = displayPromotions.length ? "#promotions" : offers.length ? "#offres" : "#catalogue";
  const marketingSections = catalog?.marketingSections ?? [];

  function openPromotionProducts(promo: StorefrontPromotion) {
    setPromotionCategoryFilter(promo.eligibleCategories);
    setPromotionFilterName(promo.name || promotionRuleLabel(promo));
    setCategory("Tous");
    setQuery("");
    setVisibleCount(INITIAL_VISIBLE);
    window.requestAnimationFrame(() => document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function clearPromotionProducts() {
    setPromotionCategoryFilter([]);
    setPromotionFilterName("");
    setVisibleCount(INITIAL_VISIBLE);
  }

  function openMarketingTarget(section: StorefrontMarketingSection) {
    if (["Montres", "Bijoux", "Portefeuilles"].includes(section.target)) {
      setCategory(section.target);
      setVisibleCount(INITIAL_VISIBLE);
      window.requestAnimationFrame(() => document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    const selector = section.target === "offers" && offers.length ? "#offres" : "#catalogue";
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Vitrine photos : chaque bloc créé dans le logiciel (Boutique → Blocs promo) devient une
  // tuile image + titre + bouton. « En haut » = juste sous l'accueil.
  function renderMarketingSections(placement: StorefrontMarketingSection["placement"]) {
    const sections = marketingSections.filter((section) => section.placement === placement);
    if (!sections.length) return null;
    const heading = placement === "after_categories" ? (lang === "ar" ? "مختارات" : lang === "en" ? "Featured" : "À la une") : "";
    return <section className="storefront-v3-marketing-zone mj-section" data-placement={placement}>
      {heading && <header className="mj-section-head"><h2>{heading}</h2></header>}
      <div className={`storefront-v3-marketing-grid mj-tiles count-${Math.min(sections.length, 3)}`}>
        {sections.map((section) => <article className={`storefront-v3-marketing-card mj-tile ${section.imageUrl ? "has-image" : "no-image"}`} key={section.id}>
          {/* L'affiche est montrée entière (jamais rognée) : elle contient souvent du texte. */}
          {section.imageUrl && <button type="button" className="mj-tile-media" onClick={() => openMarketingTarget(section)} aria-label={`${section.title} — ${section.ctaLabel || t.discover}`}>
            <SafeImage src={section.imageUrl} alt={section.title} fallback={<span className="mj-tile-fallback"><JyMark /></span>} width={1080} height={1080} />
          </button>}
          <div className="mj-tile-caption">
            {section.eyebrow && <small>{section.eyebrow}</small>}
            {section.badge && <em className="storefront-v3-marketing-badge">{section.badge}</em>}
            <h3>{section.title}</h3>
            {section.body && <p>{section.body}</p>}
            <button type="button" className="mj-button" onClick={() => openMarketingTarget(section)}>{section.ctaLabel || t.discover}</button>
          </div>
        </article>)}
      </div>
    </section>;
  }

  const ui = {
    fr: { heroCta: "Voir les modèles", dealCta: "Voir les produits concernés", packs: "Packs", packsText: "Plusieurs pièces, un prix réduit.", best: "Les plus demandés", catalogue: "Tous les modèles", all: "Tout", steps: "Commander en 3 étapes", cartBar: "Voir le panier", contactCta: "Écrire sur WhatsApp", about: "À propos de nous", values: [["Raffinement", "Des pièces choisies pour leur allure."], ["Détail", "Une finition regardée de près."], ["Confiance", "Confirmé par téléphone, payé à la réception."]] as [string, string][] },
    ar: { heroCta: "شاهد الموديلات", dealCta: "المنتجات المشمولة", packs: "الباقات", packsText: "عدة قطع بسعر مخفض.", best: "الأكثر طلبًا", catalogue: "جميع الموديلات", all: "الكل", steps: "اطلب في 3 خطوات", cartBar: "عرض السلة", contactCta: "راسلنا على واتساب", about: "من نحن", values: [["الرقي", "قطع مختارة لجمال مظهرها."], ["التفاصيل", "تشطيب نراقبه عن قرب."], ["الثقة", "تأكيد بالهاتف والدفع عند الاستلام."]] as [string, string][] },
    en: { heroCta: "Shop the models", dealCta: "See eligible products", packs: "Packs", packsText: "Several pieces, one reduced price.", best: "Most wanted", catalogue: "All models", all: "All", steps: "Order in 3 steps", cartBar: "View cart", contactCta: "Message us on WhatsApp", about: "About us", values: [["Refinement", "Pieces chosen for their look."], ["Detail", "A finish checked up close."], ["Trust", "Confirmed by phone, paid on delivery."]] as [string, string][] },
  }[lang];
  const aboutTitle = localized?.aboutTitle || "";
  const aboutText = localized?.aboutText || "";
  const leadPromotion = displayPromotions[0];
  const chipCategories = (catalog?.categories || []).filter((item) => items.some((entry) => entry.category === item));
  // Page produit (/boutique/produit/...) : mêmes en-tête, panier et commande que la boutique.
  const isProductPage = Boolean(productKey);
  const pageItem = isProductPage && productKey !== "missing" ? items.find((item) => itemKey(item) === productKey) || null : null;
  const home = isProductPage ? "/boutique" : "";
  const pageTrack = pageItem ? { code: pageItem.productCode, name: pageItem.name, kind: pageItem.kind, price: pageItem.salePrice } : null;
  const pageTrackKey = pageTrack ? `${pageTrack.kind}:${pageTrack.code}` : "";
  const pixelId = catalog?.metaPixelId || "";
  useEffect(() => {
    if (metaConsent !== "accepted" || !pageTrack || !pixelId || !enableMetaPixel(pixelId)) return;
    track("ViewContent", { content_ids: [pageTrack.code], content_name: pageTrack.name, content_type: pageTrack.kind, value: pageTrack.price, currency: "MAD" });
    // Une seule mesure par produit affiché (le catalogue se rafraîchit sans changer de produit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaConsent, pixelId, pageTrackKey]);
  const hasAudience = products.some((item) => item.audience);
  const audienceCopy = { fr: { all: "Tous", homme: "Homme", femme: "Femme", forHim: "Pour lui", forHer: "Pour elle", see: "Voir la sélection" }, ar: { all: "الكل", homme: "رجال", femme: "نساء", forHim: "له", forHer: "لها", see: "شاهد التشكيلة" }, en: { all: "All", homme: "Men", femme: "Women", forHim: "For him", forHer: "For her", see: "See the selection" } }[lang];
  function chooseAudience(next: Audience) {
    clearPromotionProducts();
    setAudience(next);
    setCategory("Tous");
    setVisibleCount(INITIAL_VISIBLE);
    window.requestAnimationFrame(() => document.querySelector("#catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const genderTiles = (["homme", "femme"] as const).map((key) => ({ key, item: products.find((item) => item.available && matchesAudience(item.audience, key) && item.images[0]) })).filter((tile) => tile.item);
  const bundleItems = pageItem && pageItem.kind === "product" ? frequentlyBoughtWith(pageItem, items, activePromotions) : [];
  const bundleSelected = pageItem ? [pageItem, ...bundleItems.filter((item) => !bundleSkipped.includes(itemKey(item)))] : [];
  const bundlePricing = calculateIndependentPromotions(bundleSelected.map((item) => ({ key: itemKey(item), kind: item.kind, unitPrice: item.salePrice, quantity: 1, category: item.category })), activePromotions);
  function addBundle() {
    if (!pageItem) return;
    setCart((current) => {
      const next = { ...current };
      for (const item of bundleSelected) if (item.available) next[itemKey(item)] = Math.min(20, (next[itemKey(item)] || 0) + 1);
      return next;
    });
    setCartOpen(true);
    track("AddToCart", { content_ids: bundleSelected.map((item) => item.productCode), content_type: "product", value: bundlePricing.total, currency: "MAD" });
  }
  const relatedItems = pageItem
    ? [...items.filter((item) => item.category === pageItem.category && itemKey(item) !== itemKey(pageItem)), ...items.filter((item) => item.category !== pageItem.category)].filter((item) => item.available).slice(0, 8)
    : [];
  const reviews = catalog?.reviews ?? [];
  const productsById = new Map(products.map((item) => [item.id, item]));
  const pageReviews = pageItem
    ? [...reviews.filter((review) => pageItem.kind === "product" && review.productId === pageItem.id), ...reviews.filter((review) => !review.productId)].slice(0, 6)
    : [];
  const renderReviews = (list: StorefrontReview[]) => list.length > 0 && <section className="storefront-v3-section mj-section mj-reviews" id="avis">
    <header className="mj-section-head"><h2>{reviewCopy[lang].title}</h2><p>{reviewCopy[lang].text}</p></header>
    <div className="storefront-v3-horizontal mj-review-list">{list.map((review) => <ReviewCard key={review.id} review={review} lang={lang} zoom={setZoomImage} product={!isProductPage && review.productId ? productsById.get(review.productId) : undefined} />)}</div>
  </section>;
  const dealHeadline = (promo: StorefrontPromotion) => promo.ruleType === "buy_x_get_y_free"
    ? `${Math.max(1, promo.buyQuantity)}+${Math.max(1, promo.freeQuantity)}`
    : `-${Math.round(promo.percentValue)} %`;

  return <main className="storefront-v3 storefront-shell mj-shop" dir={lang === "ar" ? "rtl" : "ltr"}>
    <p className="mj-topbar">{announcement}</p>

    <header className="storefront-v3-header mj-header">
      <a className="storefront-v3-brand" href="/boutique" aria-label={brand}>
        <JyMark />
        <span className="mj-wordmark"><strong>{brand}</strong><small>L&apos;heure de briller</small></span>
      </a>
      <nav className="storefront-v3-nav-links" aria-label={t.catalogue}>
        <a href={`${home}#catalogue`}>{t.catalogue}</a>
        {hasAudience && (["homme", "femme"] as const).map((key) => <a key={key} href={`/boutique?gamme=${key}#catalogue`} onClick={(event) => { if (isProductPage) return; event.preventDefault(); chooseAudience(key); }}>{audienceCopy[key]}</a>)}
        {(displayPromotions.length > 0 || offers.length > 0) && <a href={`${home}${displayPromotions.length ? "#promotions" : "#offres"}`}>{t.offers}</a>}
        <a href="#commande">{t.howToOrder}</a>
        {aboutText && <a href={`${home}#a-propos`}>{ui.about}</a>}
      </nav>
      <div className="storefront-v3-header-actions">
        <div className="storefront-v3-language" role="group" aria-label="Language / اللغة"><button type="button" aria-pressed={lang === "fr"} aria-label="Français" className={lang === "fr" ? "active" : ""} onClick={() => setLang("fr")}>FR</button><button type="button" aria-pressed={lang === "ar"} aria-label="العربية" className={lang === "ar" ? "active" : ""} onClick={() => setLang("ar")}>ع</button><button type="button" aria-pressed={lang === "en"} aria-label="English" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button></div>
        <button className="storefront-v3-cart-button" type="button" onClick={() => setCartOpen(true)} aria-label={`${t.cart} · ${itemCount} ${t.products}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4h2.2l2.5 10.4a1 1 0 0 0 1 .8h9.1a1 1 0 0 0 1-.8L20.5 7.5H5.6" /><circle cx="9.5" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>
          <span>{t.cart}</span>{itemCount > 0 && <b aria-live="polite">{itemCount}</b>}
        </button>
      </div>
    </header>

    {promotion?.enabled && (promotion.title || promotion.text) && <aside className="storefront-v3-promotion-bar" aria-label={promotion.title || promotion.badge}>
      <span>{promotion.badge || "OFFRE"}</span>
      <div><strong>{promotion.title}</strong>{promotion.text && <small>{promotion.text}</small>}</div>
      <a href={`${home}${promotionTarget}`}>{promotion.ctaLabel || t.offers}</a>
    </aside>}

    {isProductPage && <>
      <nav className="mj-breadcrumb" aria-label="Fil d’Ariane">
        <a href="/boutique">{pageCopy[lang].back}</a>
        {pageItem && <><span aria-hidden="true">/</span><a href={`/boutique#catalogue`}>{categoryCopy[lang][pageItem.category] || pageItem.category}</a><span aria-hidden="true">/</span><span aria-current="page">{pageItem.name}</span></>}
      </nav>
      {pageItem
        ? <section className="mj-product-page storefront-v3-product-dialog" aria-label={pageItem.name}>
          <ProductDetail key={itemKey(pageItem)} item={pageItem} lang={lang} t={t} add={add} variant="page" />
        </section>
        : <section className="mj-product-missing">
          <h1>{pageCopy[lang].missing}</h1>
          <p>{pageCopy[lang].missingText}</p>
          <a className="mj-button" href="/boutique#catalogue">{pageCopy[lang].seeAll}</a>
        </section>}
      {pageItem && bundleItems.length > 0 && <section className="mj-section mj-bundle">
        <header className="mj-section-head"><h2>{lang === "ar" ? "غالبًا ما تُشترى معًا" : lang === "en" ? "Frequently bought together" : "Souvent achetés ensemble"}</h2></header>
        <div className="mj-bundle-box">
          <ul>
            {[pageItem, ...bundleItems].map((item, index) => {
              const key = itemKey(item);
              const checked = index === 0 || !bundleSkipped.includes(key);
              return <li key={key}>
                <label>
                  <input type="checkbox" checked={checked} disabled={index === 0} onChange={(event) => setBundleSkipped((current) => event.target.checked ? current.filter((entry) => entry !== key) : [...current, key])} />
                  <span className="mj-bundle-media">{item.images[0] ? <SafeImage src={item.images[0]} alt="" fallback={<span />} width={120} height={120} /> : <span />}</span>
                  <span className="mj-bundle-name"><strong>{index === 0 ? (lang === "ar" ? "هذا المنتج: " : lang === "en" ? "This item: " : "Cet article : ") : ""}{item.name}</strong><small>{money(item.salePrice, lang)}</small></span>
                </label>
              </li>;
            })}
          </ul>
          <div className="mj-bundle-total">
            {bundlePricing.applied && <small>{bundlePricing.name} · −{money(bundlePricing.discount, lang)}</small>}
            <span>{lang === "ar" ? "المجموع" : lang === "en" ? "Total" : "Total"} <strong>{money(bundlePricing.total, lang)}</strong>{bundlePricing.applied && <del>{money(bundlePricing.subtotal, lang)}</del>}</span>
            <button type="button" className="mj-button" disabled={!pageItem.available} onClick={addBundle}>{lang === "ar" ? `أضف ${bundleSelected.length} إلى السلة` : lang === "en" ? `Add ${bundleSelected.length} to cart` : `Ajouter les ${bundleSelected.length} au panier`}</button>
          </div>
        </div>
      </section>}
      {relatedItems.length > 0 && <section className="storefront-v3-section mj-section">
        <header className="mj-section-head"><h2>{pageCopy[lang].related}</h2></header>
        <div className="storefront-v3-horizontal">{relatedItems.map((item) => <ProductCard key={`related-${itemKey(item)}`} item={item} lang={lang} t={t} add={add} open={openItem} />)}</div>
      </section>}
      {renderReviews(pageReviews)}
    </>}

    {!isProductPage && <>
    {/* Accueil : le logo JIYA dans son cadran (même image que l'ouverture), puis un titre court. */}
    <section className="mj-hero">
      <div className="mj-hero-emblem" aria-hidden="true">
        <span className="mj-dial-ring" />
        <img src="/brand/maison-jiya-emblem.svg" alt="" width={682} height={522} fetchPriority="high" decoding="async" />
      </div>
      <div className="mj-hero-copy">
        {leadPromotion && <a className="mj-hero-chip" href="#promotions">{promotionRuleLabel(leadPromotion)}</a>}
        <h1>{localized?.heroTitle || catalog?.heroTitle || brand}</h1>
        {(localized?.heroText || catalog?.heroText) && <p>{localized?.heroText || catalog?.heroText}</p>}
        <div className="mj-hero-actions">
          <a className="mj-button" href="#catalogue">{ui.heroCta}</a>
          {waUrl && <a className="mj-button ghost" href={waUrl} target="_blank" rel="noreferrer">{t.whatsapp}</a>}
          <a className="mj-button ghost" href="/boutique/suivi">{lang === "ar" ? "تتبع طلبي" : lang === "en" ? "Track my order" : "Suivre ma commande"}</a>
        </div>
        <ul className="mj-trust"><li>{t.cashOnDelivery}</li><li>{t.confirmation}</li><li>{t.moroccoDelivery}</li></ul>
      </div>
    </section>

    {genderTiles.length === 2 && <section className="mj-gender" aria-label="Gammes">
      {genderTiles.map(({ key, item }) => <a key={key} className="mj-gender-tile" href={`/boutique?gamme=${key}#catalogue`} onClick={(event) => { event.preventDefault(); chooseAudience(key); }}>
        <SafeImage src={item!.images[0]} alt="" fallback={<span />} width={640} height={640} />
        <span><strong>{key === "homme" ? audienceCopy.forHim : audienceCopy.forHer}</strong><small>{audienceCopy.see}</small></span>
      </a>)}
    </section>}

    {renderMarketingSections("after_categories")}

    {leadPromotion && <section className="mj-deal" id="promotions">
      <strong className="mj-deal-figure">{dealHeadline(leadPromotion)}</strong>
      <div className="mj-deal-copy">
        <h2>{promotionRuleLabel(leadPromotion)}</h2>
        <p>{leadPromotion.description || (lang === "ar" ? "يُطبّق العرض تلقائيًا في السلة على المنتجات المؤهلة." : lang === "en" ? "Applied automatically in the cart to eligible products." : "La remise s’applique toute seule dans le panier, sur les produits concernés.")}</p>
        <button type="button" className="mj-button light" onClick={() => openPromotionProducts(leadPromotion)}>{leadPromotion.ctaLabel || ui.dealCta}</button>
      </div>
      {leadPromotion.imageUrl && <div className="mj-deal-media"><SafeImage src={leadPromotion.imageUrl} alt={leadPromotion.name || promotionRuleLabel(leadPromotion)} fallback={null} width={720} height={540} /></div>}
      {displayPromotions.length > 1 && <ul className="mj-deal-others">{displayPromotions.slice(1).map((promo) => <li key={promo.id}><button type="button" onClick={() => openPromotionProducts(promo)}>{promotionRuleLabel(promo)}</button></li>)}</ul>}
    </section>}

    {offers.length > 0 && <section className="storefront-v3-section mj-section" id="offres">
      <header className="mj-section-head"><h2>{ui.packs}</h2><p>{ui.packsText}</p></header>
      <div className="storefront-v3-horizontal">{weeklyOffers.slice(0, 8).map((item) => <ProductCard key={`pack-${item.id}`} item={item} lang={lang} t={t} add={add} open={openItem} />)}</div>
    </section>}

    {bestSellers.length > 0 && <section className="storefront-v3-section mj-section storefront-v3-best">
      <header className="mj-section-head"><h2>{ui.best}</h2><p>{t.bestSellerText}</p></header>
      <div className="storefront-v3-horizontal">{bestSellers.map((item) => <ProductCard key={`best-${item.id}`} item={item} lang={lang} t={t} add={add} open={openItem} />)}</div>
    </section>}

    {renderMarketingSections("before_catalogue")}

    <section className="storefront-v3-section mj-section storefront-v3-catalogue" id="catalogue">
      <header className="mj-section-head"><h2>{ui.catalogue}</h2><p>{filtered.length} {t.products}</p></header>
      <div className="mj-filters">
        {hasAudience && <div className="mj-chips mj-audience-chips" role="group" aria-label="Gamme">
          {(["", "homme", "femme"] as Audience[]).map((key) => <button key={key || "all"} type="button" aria-pressed={audience === key} className={audience === key ? "active" : ""} onClick={() => { setAudience(key); setVisibleCount(INITIAL_VISIBLE); }}>{key ? audienceCopy[key as "homme" | "femme"] : audienceCopy.all}</button>)}
        </div>}
        <div className="mj-chips" role="group" aria-label={t.category}>
          {["Tous", ...chipCategories].map((item) => <button key={item} type="button" aria-pressed={category === item} className={category === item ? "active" : ""} onClick={() => { clearPromotionProducts(); setCategory(item); setVisibleCount(INITIAL_VISIBLE); }}>{item === "Tous" ? ui.all : categoryCopy[lang][item] || item}</button>)}
        </div>
        <label className="storefront-v3-tools mj-search"><span className="mj-visually-hidden">{t.search}</span><input type="search" value={query} onChange={(event) => { clearPromotionProducts(); setQuery(event.target.value); setVisibleCount(INITIAL_VISIBLE); }} placeholder={t.searchPlaceholder} /></label>
      </div>
      {promotionCategoryFilter.length > 0 && <div className="storefront-v3-promotion-filter">
        <span><strong>{promotionFilterName}</strong><small>{promotionCategoryFilter.map((item) => categoryCopy[lang][item] || item).join(", ")}</small></span>
        <button type="button" onClick={clearPromotionProducts}>{t.clearPromotionFilter}</button>
      </div>}
      {loading && <div className="storefront-v3-state">{t.loading}</div>}
      {error && <div className="storefront-v3-state error">{error}</div>}
      {!loading && !error && <div className="storefront-v3-grid catalogue">{visibleItems.map((item, index) => <ProductCard key={`${item.kind}-${item.id}`} item={item} lang={lang} t={t} add={add} open={openItem} priority={index < 2} />)}</div>}
      {visibleCount < filtered.length && <button className="storefront-v3-more mj-button ghost" type="button" onClick={() => setVisibleCount((value) => value + INITIAL_VISIBLE)}>{t.loadMore}</button>}
    </section>

    {/* Avis clients : uniquement de vrais messages saisis dans le logiciel (Boutique → Avis clients). */}
    {renderReviews(reviews.slice(0, 12))}

    {/* À propos de nous : texte modifiable dans le logiciel (Boutique → Identité). */}
    {aboutText && <section className="mj-about" id="a-propos">
      <div className="mj-about-mark" aria-hidden="true"><span className="mj-dial-ring" /><JyMark /></div>
      <div className="mj-about-copy">
        <small>{ui.about}</small>
        <h2>{aboutTitle}</h2>
        {aboutText.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph.trim()}</p>)}
        <ul className="mj-about-values">{ui.values.map(([title, text]) => <li key={title}><strong>{title}</strong><span>{text}</span></li>)}</ul>
      </div>
    </section>}
    </>}

    <section className="storefront-v3-how mj-steps" id="commande">
      <h2>{ui.steps}</h2>
      <ol>
        <li><strong>{t.step1.replace(/^\d+\.\s*/, "")}</strong><p>{t.step1Text}</p></li>
        <li><strong>{t.step2.replace(/^\d+\.\s*/, "")}</strong><p>{t.step2Text}</p></li>
        <li><strong>{t.step3.replace(/^\d+\.\s*/, "")}</strong><p>{t.step3Text}</p></li>
      </ol>
    </section>

    {renderMarketingSections("before_contact")}

    <section className="storefront-v3-contact mj-contact" id="contact">
      <div><h2>{t.helpTitle}</h2><p>{t.helpText}</p></div>
      {waUrl && <a className="mj-button" href={waUrl} target="_blank" rel="noreferrer">{ui.contactCta}</a>}
    </section>
    <footer className="storefront-v3-footer mj-footer">
      <div><img className="mj-footer-logo" src="/brand/maison-jiya-logo.svg" alt={brand} width={682} height={522} loading="lazy" /><small>{localized?.shippingNote || catalog?.shippingNote}</small></div>
      <nav className="mj-legal-links" aria-label="Informations boutique">
        {aboutText && <a href={`${home}#a-propos`}>{ui.about}</a>}
        <a href="/boutique/suivi">{lang === "ar" ? "تتبع طلبي" : lang === "en" ? "Track my order" : "Suivre ma commande"}</a>
        <a href="/boutique/mentions-legales">Mentions légales</a>
        <a href="/boutique/conditions-vente">Conditions de vente</a>
        <a href="/boutique/livraison-retours">Livraison et paiement</a>
        <a href="/boutique/confidentialite">Confidentialité</a>
        {catalog?.metaPixelId && <button type="button" onClick={() => setCookieSettingsOpen(true)}>Cookies publicitaires</button>}
      </nav>
      <span>© {new Date().getFullYear()} {brand}</span>
    </footer>
    {catalog?.metaPixelId && (metaConsent === "unset" || cookieSettingsOpen) && <aside className="mj-meta-consent" role="dialog" aria-modal="false" aria-label="Préférences publicitaires">
      <strong>Cookies publicitaires</strong>
      <p>Avec votre accord, Maison Jiya utilise le Pixel Meta pour mesurer ses publicités Facebook et Instagram. Refuser ne bloque pas les achats. <a href="/boutique/confidentialite">En savoir plus</a>.</p>
      <div>
        <button className="mj-cookie-refuse" type="button" onClick={() => chooseMetaConsent("refused")}>Refuser</button>
        <button className="mj-cookie-accept" type="button" onClick={() => chooseMetaConsent("accepted")}>Accepter</button>
      </div>
    </aside>}
    {itemCount > 0 && !cartOpen && !checkoutOpen && <button type="button" className="mj-cart-bar" onClick={() => setCartOpen(true)}>
      <span>{ui.cartBar} · {itemCount}</span><strong>{money(total, lang)}</strong>
    </button>}
    {waUrl && <a className={`storefront-v3-wa ${itemCount > 0 && !cartOpen && !checkoutOpen ? "above-cart" : ""}`} href={waUrl} target="_blank" rel="noreferrer" aria-label={t.whatsapp}>
      {/* Icône officielle WhatsApp fournie par Maison Jiya (public/brand/whatsapp-icon.png). */}
      <img src="/brand/whatsapp-icon.png" alt="" width={30} height={30} />
    </a>}

    {zoomImage && <div className="storefront-v3-overlay mj-zoom" role="dialog" aria-modal="true" onClick={() => setZoomImage("")}>
      <button type="button" className="storefront-v3-product-dialog-close" onClick={() => setZoomImage("")} aria-label={t.close}>×</button>
      <SafeImage src={zoomImage} alt="" fallback={null} width={1080} height={1920} />
    </div>}

    {selectedItem && <ProductGalleryModal key={itemKey(selectedItem)} item={selectedItem} lang={lang} t={t} add={add} close={() => setSelectedItem(null)} />}

    {cartOpen && <div className="storefront-v3-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
      <aside className="storefront-v3-drawer" role="dialog" aria-modal="true" aria-label={t.yourCart}>
        <header><div><small>{brand}</small><h2>{t.yourCart}</h2></div><button type="button" onClick={() => setCartOpen(false)} aria-label={t.close}>×</button></header>
        {promoProgress && <div className="mj-promo-progress" role="status">
          <p>{lang === "ar" ? `أضف ${promoProgress.missing} قطعة للاستفادة من: ${promotionRuleLabel(promoProgress.promotion)}` : lang === "en" ? `Add ${promoProgress.missing} more item${promoProgress.missing > 1 ? "s" : ""} to get: ${promotionRuleLabel(promoProgress.promotion)}` : `Plus que ${promoProgress.missing} article${promoProgress.missing > 1 ? "s" : ""} pour profiter de : ${promotionRuleLabel(promoProgress.promotion)}`}</p>
          <span><i style={{ width: `${Math.round((promoProgress.have / promoProgress.need) * 100)}%` }} /></span>
        </div>}
        <div className="storefront-v3-cart-lines">{cartSuggestion && <aside className="mj-cart-suggestion" aria-label={lang === "ar" ? "اقتراح" : lang === "en" ? "Suggestion" : "Suggestion"}>
          <p>{cartSuggestion.reason === "promo"
            ? (lang === "ar" ? `أضف قطعة أخرى: ${promotionRuleLabel(cartSuggestion.promotion!)}` : lang === "en" ? `Add one more piece: ${promotionRuleLabel(cartSuggestion.promotion!)}` : `Ajoutez un article : ${promotionRuleLabel(cartSuggestion.promotion!)}`)
            : (lang === "ar" ? "لإكمال إطلالتك" : lang === "en" ? "Complete the look" : "Pour compléter")}</p>
          <div>
            <a href={productPath(cartSuggestion.item)} className="mj-cart-suggestion-media" onClick={(event) => { event.preventDefault(); setCartOpen(false); openItem(cartSuggestion.item); }}>
              {cartSuggestion.item.images[0] ? <SafeImage src={cartSuggestion.item.images[0]} alt={cartSuggestion.item.name} fallback={<span />} width={96} height={96} /> : <span />}
            </a>
            <span><strong>{cartSuggestion.item.name}</strong><small>{money(cartSuggestion.item.salePrice, lang)}</small></span>
            <button type="button" onClick={() => add(cartSuggestion.item)}>{lang === "ar" ? "أضف" : lang === "en" ? "Add" : "Ajouter"}</button>
          </div>
        </aside>}{cartLines.length ? cartLines.map((line) => <article key={line.key}><div><strong>{line.item.name}</strong><small>{money(line.item.salePrice, lang)}</small>{cartPricing.applied && (cartPricing.discountedUnits[line.key] || 0) > 0 && <small className="storefront-v3-promo-line">{cartPricing.name} · {cartPricing.discountedUnits[line.key]} article(s)</small>}</div><div className="storefront-v3-qty"><button type="button" aria-label={`${t.quantity} − · ${line.item.name}`} onClick={() => updateQuantity(line.key, line.quantity - 1)}>−</button><span aria-live="polite">{line.quantity}</span><button type="button" aria-label={`${t.quantity} + · ${line.item.name}`} onClick={() => updateQuantity(line.key, line.quantity + 1)}>+</button></div><button className="storefront-v3-remove" type="button" onClick={() => updateQuantity(line.key, 0)}>{t.remove}</button></article>) : <p className="storefront-v3-empty">{t.emptyCart}</p>}</div>
        <footer>
          {cartLines.length > 0 && <div className="storefront-v3-cart-subtotal"><span>{t.subtotal}</span><strong>{money(subtotal, lang)}</strong></div>}
          {cartLines.length > 0 && (cartPricing.applied
            ? <div className="storefront-v3-cart-discount"><span>{cartPricing.name}<small>{t.promoApplied} · non cumulable</small></span><strong>−{money(cartPricing.discount, lang)}</strong></div>
            : activePromotions.length > 0
              ? <p className="storefront-v3-cart-promo-hint"><strong>{primaryPromotion?.name}</strong><br />{primaryPromotion?.description || t.promoHint}</p>
              : null)}
          {giftBox?.enabled && cartLines.length > 0 && <label className="mj-giftbox-option">
            <input type="checkbox" checked={giftBoxChosen} onChange={(event) => setGiftBoxChosen(event.target.checked)} />
            <span><strong>{giftBox.label} · +{money(giftBox.price, lang)}{itemCount > 1 ? (lang === "ar" ? " للقطعة" : lang === "en" ? " each" : " / article") : ""}</strong><small>{giftBox.text}</small></span>
          </label>}
          {giftBoxLine.count > 0 && <div className="storefront-v3-cart-subtotal"><span>{giftBox?.label} ×{giftBoxLine.count}</span><strong>+{money(giftBoxLine.amount, lang)}</strong></div>}
          <div className="storefront-v3-cart-total"><span>{t.total}</span><strong>{money(total, lang)}</strong></div>
          <small>{localized?.shippingNote || catalog?.shippingNote}</small><button type="button" disabled={!cartLines.length} onClick={beginCheckout}>{t.checkout}</button><button className="ghost" type="button" onClick={() => setCartOpen(false)}>{t.continueShopping}</button>
        </footer>
      </aside>
    </div>}

    {checkoutOpen && <div className="storefront-v3-overlay checkout" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}>
      <section className="storefront-v3-checkout" role="dialog" aria-modal="true" aria-label={t.orderTitle}>
        <header><div><small>{brand}</small><h2>{t.orderTitle}</h2><p>{t.orderSubtitle}</p></div><button type="button" onClick={() => setCheckoutOpen(false)} aria-label={t.close}>×</button></header>
        <div className="storefront-v3-checkout-summary"><div><span>{itemCount} {t.products}</span>{cartPricing.applied && <small>{cartPricing.name} · −{money(cartPricing.discount, lang)}</small>}</div><strong>{money(total, lang)}</strong></div>
        <form onSubmit={(event) => void submitOrder(event)}>
          <label><span>{t.fullName} *</span><input name="customerName" autoComplete="name" required minLength={2} maxLength={120} /></label>
          <div className="storefront-v3-form-row"><label><span>{t.phone} *</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" required maxLength={40} /></label><label><span>{t.city} *</span><input name="city" autoComplete="address-level2" required maxLength={100} /></label></div>
          <label><span>{t.address} *</span><textarea name="address" autoComplete="street-address" rows={3} minLength={5} maxLength={260} required /></label>
          <label><span>{t.note} ({t.optional})</span><textarea name="note" rows={2} maxLength={240} /></label>
          <label className="storefront-v3-honeypot" aria-hidden="true"><span>Website</span><input name="website" tabIndex={-1} autoComplete="off" /></label>
          <label className="mj-checkout-privacy">
            <input name="privacyAcknowledged" type="checkbox" required value="yes" />
            <span>{lang === "ar" ? <>أوافق على استخدام بياناتي لتأكيد طلبي وتسليمه، وقد اطلعت على <a href="/boutique/confidentialite" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</a>.</> : lang === "en" ? <>I agree to the use of my details to confirm and deliver my order, and I have read the <a href="/boutique/confidentialite" target="_blank" rel="noopener noreferrer">privacy policy</a>.</> : <>J&apos;accepte l&apos;utilisation de mes coordonnées pour confirmer et livrer ma commande, et j&apos;ai pris connaissance de la <a href="/boutique/confidentialite" target="_blank" rel="noopener noreferrer">politique de confidentialité</a>.</>}</span>
          </label>
          <p className="mj-checkout-legal-link"><a href="/boutique/conditions-vente" target="_blank" rel="noopener noreferrer">Conditions de vente</a> · <a href="/boutique/livraison-retours" target="_blank" rel="noopener noreferrer">Livraison et paiement</a></p>
          {submitError && <p className="storefront-v3-submit-error" role="alert">{submitError}</p>}
          <button className="storefront-v3-submit" disabled={submitting}>{submitting ? t.sending : t.confirmOrder}</button>
          <small className="storefront-v3-cod">{t.cashOnDelivery} · {t.confirmation}</small>
        </form>
      </section>
    </div>}

    {confirmation && <div className="storefront-v3-overlay"><section className="storefront-v3-success" role="dialog" aria-modal="true" aria-label={t.orderSuccess}><span>✓</span><h2>{t.orderSuccess}</h2><p>{t.orderSuccessText}</p><div><small>{t.orderRef}</small><strong>{confirmation.orderRef}</strong><small>{t.total}</small><strong>{money(confirmation.total, lang)}</strong></div><a href={`/boutique/suivi?ref=${encodeURIComponent(confirmation.orderRef)}`}>{lang === "ar" ? "تتبع طلبي" : lang === "en" ? "Track my order" : "Suivre ma commande"}</a>{waUrl && <a href={waUrl} target="_blank" rel="noreferrer">{t.whatsapp}</a>}<button type="button" onClick={() => setConfirmation(null)}>{t.close}</button></section></div>}
  </main>;
}
