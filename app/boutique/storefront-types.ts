export type StorefrontLanguage = "fr" | "ar" | "en";

export type CatalogItem = {
  id: number;
  kind: "product" | "offer";
  productCode: string;
  name: string;
  category: string;
  salePrice: number;
  comparePrice: number;
  badge: string;
  description: string;
  availability: string;
  available: boolean;
  lowStock: boolean;
  images: string[];
};

export type StorefrontLocaleCopy = {
  announcement: string;
  heroTitle: string;
  heroText: string;
  shippingNote: string;
};

export type StorefrontPromotionBanner = {
  enabled: boolean;
  badge: string;
  title: string;
  text: string;
  ctaLabel: string;
  offerId: number | null;
};

export type StorefrontCatalog = {
  brand: string;
  announcement: string;
  heroTitle: string;
  heroText: string;
  shippingNote: string;
  metaPixelId: string;
  promotionBanner?: StorefrontPromotionBanner;
  logoUrl: string;
  heroImageUrl: string;
  whatsapp: string;
  contactWhatsapp: string;
  brandStrip?: string[];
  localized?: Partial<Record<StorefrontLanguage, StorefrontLocaleCopy>>;
  products: CatalogItem[];
  offers: CatalogItem[];
  categories: string[];
};
