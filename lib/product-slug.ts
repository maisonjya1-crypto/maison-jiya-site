// Adresse de chaque produit : /boutique/produit/<nom-en-minuscules>-<id>  (pack : -pack-<id>).
// L'identifiant en fin d'adresse fait foi : renommer un produit ne casse pas les anciens liens.
type SlugItem = { kind: "product" | "offer"; id: number; name: string };

export function slugifyName(name: string) {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "") || "article";
}

export function productSlug(item: SlugItem) {
  return `${slugifyName(item.name)}-${item.kind === "offer" ? "pack-" : ""}${item.id}`;
}

export function productPath(item: SlugItem) {
  return `/boutique/produit/${productSlug(item)}`;
}

export function parseProductSlug(slug: string): { kind: "product" | "offer"; id: number } | null {
  const match = /(?:^|-)(pack-)?(\d{1,9})$/.exec(decodeURIComponent(slug || "").trim());
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { kind: match[1] ? "offer" : "product", id };
}
