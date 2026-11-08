import type { StorefrontCatalog } from "../app/boutique/storefront-types";
import type { CatalogItem } from "../app/boutique/storefront-types";
import { productPath } from "./product-slug";
import { absoluteUrl, BRAND_NAMES, PUBLIC_SITE_URL, STOREFRONT_URL } from "./site";

/* Données structurées schema.org : elles aident Google à comprendre que
   « Maison Jiya » est une boutique (nom, logo, produits, prix en dirhams).
   On ne déclare que des informations réelles : aucun avis ni note inventés. */
export function storefrontStructuredData(catalog: StorefrontCatalog | null) {
  const brand = catalog?.brand || "Maison Jiya";
  const logo = absoluteUrl("/brand/jy-512.png");
  const organization = {
    "@type": "OnlineStore",
    "@id": `${PUBLIC_SITE_URL}/#store`,
    name: brand,
    alternateName: BRAND_NAMES.filter((name) => name !== brand),
    url: STOREFRONT_URL,
    logo,
    image: absoluteUrl("/brand/og-maison-jiya.jpg"),
    slogan: "L'heure de briller",
    description: "Montres, bijoux, portefeuilles et packs cadeaux livrés partout au Maroc, paiement à la livraison.",
    areaServed: { "@type": "Country", name: "Maroc" },
    currenciesAccepted: "MAD",
    paymentAccepted: "Paiement à la livraison",
  };
  const website = {
    "@type": "WebSite",
    "@id": `${PUBLIC_SITE_URL}/#website`,
    name: brand,
    alternateName: BRAND_NAMES.filter((name) => name !== brand),
    url: STOREFRONT_URL,
    inLanguage: ["fr", "ar", "en"],
    publisher: { "@id": `${PUBLIC_SITE_URL}/#store` },
  };
  const items = [...(catalog?.products || []), ...(catalog?.offers || [])].filter((item) => item.name && item.salePrice > 0).slice(0, 40);
  const graph: Record<string, unknown>[] = [organization, website];
  if (items.length) {
    graph.push({
      "@type": "ItemList",
      name: `${brand} — catalogue`,
      itemListElement: items.map((item, index) => {
        const image = item.images.map(absoluteUrl).filter(Boolean).slice(0, 3);
        return {
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            url: `${PUBLIC_SITE_URL}${productPath(item)}`,
            name: item.name,
            sku: item.productCode || undefined,
            category: item.category || undefined,
            description: item.description || undefined,
            image: image.length ? image : undefined,
            brand: { "@type": "Brand", name: brand },
            offers: {
              "@type": "Offer",
              price: item.salePrice.toFixed(2),
              priceCurrency: "MAD",
              availability: item.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url: `${PUBLIC_SITE_URL}${productPath(item)}`,
              seller: { "@id": `${PUBLIC_SITE_URL}/#store` },
            },
          },
        };
      }),
    });
  }
  // « < » est échappé pour qu'aucun texte produit ne puisse fermer la balise <script>.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

/* Données structurées d'une page produit : produit, offre en dirhams et fil d'Ariane. */
export function productStructuredData(item: CatalogItem, catalog: StorefrontCatalog | null) {
  const brand = catalog?.brand || "Maison Jiya";
  const url = `${PUBLIC_SITE_URL}${productPath(item)}`;
  const image = item.images.map(absoluteUrl).filter(Boolean).slice(0, 6);
  const graph = [
    {
      "@type": "Product",
      "@id": `${url}#product`,
      name: item.name,
      url,
      sku: item.productCode || undefined,
      category: item.category || undefined,
      description: item.description || undefined,
      image: image.length ? image : undefined,
      brand: { "@type": "Brand", name: brand },
      offers: {
        "@type": "Offer",
        url,
        price: item.salePrice.toFixed(2),
        priceCurrency: "MAD",
        availability: item.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        seller: { "@id": `${PUBLIC_SITE_URL}/#store` },
      },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: brand, item: STOREFRONT_URL },
        { "@type": "ListItem", position: 2, name: item.category || "Catalogue", item: `${STOREFRONT_URL}#catalogue` },
        { "@type": "ListItem", position: 3, name: item.name, item: url },
      ],
    },
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}
