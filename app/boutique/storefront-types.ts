export type CatalogItem = {
  id: number;
  kind: "product" | "offer";
  productCode: string;
  name: string;
  category: string;
  salePrice: number;
  comparePrice: number;
  badge: string;
  isBestSeller: boolean;
  description: string;
  availability: string;
  available: boolean;
  lowStock: boolean;
  images: string[];
};

export type StorefrontCatalog = {
  brand: string;
  announcement: string;
  heroTitle: string;
  heroText: string;
  shippingNote: string;
  metaPixelId: string;
  logoUrl: string;
  heroImageUrl: string;
  whatsapp: string;
  contactWhatsapp: string;
  products: CatalogItem[];
  offers: CatalogItem[];
  categories: string[];
};
