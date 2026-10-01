export const productNatureOptions = [
  "Montre",
  "Bracelet",
  "Collier",
  "Ensemble",
  "Bague",
  "Boucles d’oreilles",
  "Wallet",
  "Boîte",
  "Sac / Bandoulière",
  "Électronique",
  "Autre",
] as const;

export type ProductNature = (typeof productNatureOptions)[number];

const natureConfig: Record<ProductNature, { prefix: string; category: string }> = {
  "Montre": { prefix: "M", category: "Montres" },
  "Bracelet": { prefix: "B", category: "Bijoux" },
  "Collier": { prefix: "C", category: "Bijoux" },
  "Ensemble": { prefix: "EN", category: "Bijoux" },
  "Bague": { prefix: "G", category: "Bijoux" },
  "Boucles d’oreilles": { prefix: "O", category: "Bijoux" },
  "Wallet": { prefix: "W", category: "Wallets" },
  "Boîte": { prefix: "BX", category: "Boîtes" },
  "Sac / Bandoulière": { prefix: "SAC", category: "Wallets" },
  "Électronique": { prefix: "E", category: "Électronique" },
  "Autre": { prefix: "X", category: "Autre" },
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function categoryForNature(nature: string) {
  const key = (productNatureOptions as readonly string[]).includes(nature) ? nature as ProductNature : "Autre";
  return natureConfig[key].category;
}

export function inferProductNature(name: string, category = ""): ProductNature {
  const normalized = normalize(name);
  if (/\bBRACELET/.test(normalized)) return "Bracelet";
  if (/\bCOLLIER\b|\bCOLIER\b/.test(normalized)) return "Collier";
  if (/\bENSEMBLE\b|\bPACK BIJOU/.test(normalized)) return "Ensemble";
  if (/\bBAGUE\b/.test(normalized)) return "Bague";
  if (/\bBOUCLE/.test(normalized)) return "Boucles d’oreilles";
  if (/\bBOITE\b/.test(normalized)) return "Boîte";
  if (/\bBANDOULIERE\b|\bSAC\b/.test(normalized)) return "Sac / Bandoulière";
  if (/\bWALLET\b|\bPORTEFEUILLE\b/.test(normalized)) return "Wallet";
  const normalizedCategory = normalize(category);
  if (normalizedCategory === "MONTRES") return "Montre";
  if (normalizedCategory === "ELECTRONIQUE") return "Électronique";
  if (normalizedCategory === "WALLETS") return "Wallet";
  if (normalizedCategory === "BOITES") return "Boîte";
  return "Autre";
}

const genericByNature: Record<ProductNature, Set<string>> = {
  "Montre": new Set(["MONTRE"]),
  "Bracelet": new Set(["BRACELET", "BRACELETFIL"]),
  "Collier": new Set(["COLLIER", "COLIER"]),
  "Ensemble": new Set(["ENSEMBLE", "PACK"]),
  "Bague": new Set(["BAGUE"]),
  "Boucles d’oreilles": new Set(["BOUCLE", "BOUCLES", "OREILLE", "OREILLES"]),
  "Wallet": new Set(["WALLET", "PORTEFEUILLE"]),
  "Boîte": new Set(["BOITE"]),
  "Sac / Bandoulière": new Set(["SAC", "BANDOULIERE"]),
  "Électronique": new Set(),
  "Autre": new Set(),
};

function compactSeries(name: string, nature: ProductNature) {
  let normalized = normalize(name);
  normalized = normalized
    .replace(/\bVAN\s+CLEEF\b/g, "VC")
    .replace(/\bPATEK\s+PHILIPPE\b/g, "PP")
    .replace(/\bPATTEK\s+PHILIPPE\b/g, "PP")
    .replace(/\bMICHAEL\s+KORS\b/g, "MK")
    .replace(/\bDANIEL\s+WELLINGTON\b/g, "DW");

  const ignored = genericByNature[nature];
  const tokens = normalized.split(/\s+/).filter(Boolean).filter((token) => !ignored.has(token));
  if (!tokens.length) return "ART";
  if (tokens.length === 1) {
    const token = tokens[0];
    if (/^\d+[A-Z]*$/.test(token)) return token.slice(0, 6);
    return token.slice(0, 3);
  }

  const series = tokens.map((token) => {
    if (["VC", "PP", "MK", "DW"].includes(token)) return token;
    if (/^\d+[A-Z]*$/.test(token)) return token.slice(0, 4);
    return token[0];
  }).join("");
  return series.slice(0, 8) || "ART";
}

export function suggestProductCode(args: {
  name: string;
  nature: string;
  existingCodes?: Iterable<string>;
}) {
  const nature = (productNatureOptions as readonly string[]).includes(args.nature) ? args.nature as ProductNature : "Autre";
  const prefix = natureConfig[nature].prefix;
  const series = compactSeries(args.name, nature);
  const base = prefix + "-" + series;
  const existing = new Set(Array.from(args.existingCodes || [], (code) => String(code).trim().toUpperCase()));
  let next = 1;
  const basePrefix = base + "-";
  for (const code of existing) {
    if (!code.startsWith(basePrefix)) continue;
    const suffix = code.slice(basePrefix.length);
    if (/^\d{2,}$/.test(suffix)) next = Math.max(next, Number(suffix) + 1);
  }
  let candidate = base + "-" + String(next).padStart(2, "0");
  while (existing.has(candidate)) {
    next += 1;
    candidate = base + "-" + String(next).padStart(2, "0");
  }
  return candidate;
}
