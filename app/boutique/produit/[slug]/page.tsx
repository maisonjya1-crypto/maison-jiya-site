import type { Metadata } from "next";
import { getRawDb } from "../../../../db";
import { getPublicDb } from "../../../../db/public-db";
import { ensureStorefrontCms } from "../../../../db/storefront-cms";
import { loadStorefrontCatalogFast } from "../../../../db/storefront-public-fast";
import { parseProductSlug, productPath } from "../../../../lib/product-slug";
import { absoluteUrl, PUBLIC_SITE_URL } from "../../../../lib/site";
import { productStructuredData } from "../../../../lib/storefront-structured-data";
import StorefrontClientV3 from "../../storefront-client-v3";
import type { CatalogItem, StorefrontCatalog } from "../../storefront-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ slug: string }> };

async function loadCatalog(): Promise<StorefrontCatalog | null> {
  try {
    const raw = await getRawDb();
    const ready = await raw.prepare("SELECT value FROM settings WHERE key = 'storefront_manual_catalog_initialized_v1' LIMIT 1").first<{ value: string }>();
    if (!ready?.value) await ensureStorefrontCms(raw);
    return await loadStorefrontCatalogFast(await getPublicDb());
  } catch (error) {
    console.error("Maison Jiya product page preload failed", error);
    return null;
  }
}

function findItem(catalog: StorefrontCatalog | null, slug: string): CatalogItem | null {
  const parsed = parseProductSlug(slug);
  if (!catalog || !parsed) return null;
  const list = parsed.kind === "offer" ? catalog.offers : catalog.products;
  return list.find((item) => item.id === parsed.id) || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = findItem(await loadCatalog(), slug);
  if (!item) return { title: "Article introuvable", robots: { index: false, follow: true } };
  const price = `${item.salePrice.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} DH`;
  const description = (item.description || `${item.name} — ${item.category}. Livraison partout au Maroc, paiement à la réception.`).slice(0, 180);
  const image = absoluteUrl(item.images[0] || "") || `${PUBLIC_SITE_URL}/brand/og-maison-jiya.jpg`;
  const url = `${PUBLIC_SITE_URL}${productPath(item)}`;
  return {
    title: `${item.name} — ${price}`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: `${item.name} — ${price}`, description, siteName: "Maison Jiya", images: [{ url: image, alt: item.name }] },
    twitter: { card: "summary_large_image", title: `${item.name} — ${price}`, description, images: [image] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const catalog = await loadCatalog();
  const item = findItem(catalog, slug);
  return <div className="mj-shop-root" data-storefront-deployment="maison-jiya-luxe-v7" data-page="product">
    {item && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productStructuredData(item, catalog) }} />}
    <StorefrontClientV3 initialCatalog={catalog} productKey={item ? `${item.kind === "offer" ? "o" : "p"}:${item.id}` : "missing"} />
  </div>;
}
