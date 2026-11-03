const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomBase36(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // Le léger biais du modulo (256 n'est pas multiple de 36) est sans effet sur l'unicité.
  let result = "";
  for (const byte of bytes) result += BASE36[byte % 36];
  return result;
}

/**
 * Référence lisible et pratiquement unique, même pour des centaines de lignes
 * créées dans la même milliseconde (import) : 5 caractères d'horodatage +
 * 6 caractères aléatoires (plus de 2 milliards de combinaisons).
 * Exemple : referenceWithPrefix("MJ-W") → "MJ-W3K9QZ7F2KQ1".
 */
export function referenceWithPrefix(prefix: string) {
  return `${prefix}${Date.now().toString(36).slice(-5).toUpperCase()}${randomBase36(6)}`;
}
