import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fixture, loadSource } from "./helpers/d1-fixture.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("la migration des avis interdit une note hors 1 à 5", async () => {
  const database = await fixture();
  database.sqlite.exec(read("migrations/0019_storefront_reviews.sql"));
  database.sqlite.exec("INSERT INTO storefront_reviews (customer_name, city, rating, body) VALUES ('Salma B.', 'Rabat', 5, 'Très belle montre, merci.')");
  assert.throws(() => database.sqlite.exec("INSERT INTO storefront_reviews (customer_name, rating, body) VALUES ('X', 6, 'Texte')"));
  assert.throws(() => database.sqlite.exec("INSERT INTO storefront_reviews (customer_name, rating, body) VALUES ('X', 0, 'Texte')"));
});

test("le logiciel crée, modifie, masque et supprime un avis, avec une photo unique", () => {
  const admin = read("app/api/storefront/admin/route.ts");
  assert.match(admin, /action === "saveReview"/);
  assert.match(admin, /action === "deleteReview"/);
  assert.match(admin, /Indiquez le prénom du client/);
  assert.match(admin, /Le texte est facultatif/);
  assert.match(admin, /Math\.max\(1, Math\.min\(5, integer\(payload\.rating\) \|\| 5\)\)/);
  const media = read("app/api/storefront/admin/media/route.ts");
  assert.match(media, /"promotion", "review"\]\.includes\(ownerType\)/);
  assert.match(media, /ownerType === "review" \? 1 : GALLERY_LIMIT/);
  const cms = read("app/storefront-cms-v2-enhancement.tsx");
  assert.match(cms, /switchTab\("reviews"\)\}>Avis clients/);
  assert.match(cms, /N’invente jamais d’avis/);
  assert.match(cms, /uploadMany\("review", review\.id, "gallery", files, 1\)/);
  assert.doesNotMatch(read("db/storefront-cms.ts"), /CREATE TABLE IF NOT EXISTS storefront_reviews/);
});

test("la boutique n'affiche que les avis visibles et ne casse pas si la table manque", () => {
  const loader = read("db/storefront-public-fast.ts");
  assert.match(loader, /FROM storefront_reviews\s+WHERE is_visible = 1/);
  assert.match(loader, /\} catch \{\n    reviewRows = \[\];/);
  assert.match(loader, /if \(!name \|\| \(!body && !imageUrl\)\) return \[\];/);
  const client = read("app/boutique/storefront-client-v3.tsx");
  assert.match(client, /\{renderReviews\(reviews\.slice\(0, 12\)\)\}/);
  assert.match(client, /\{renderReviews\(pageReviews\)\}/);
  assert.match(client, /publiés avec leur accord/);
  assert.match(client, /className=\{`mj-review-shot \$\{review\.body \? "" : "is-main"\}`\}/);
  assert.match(client, /\{zoomImage && <div className="storefront-v3-overlay mj-zoom"/);
  assert.match(read("app/storefront-cms-v2-enhancement.tsx"), /masque le numéro, la photo de profil et le nom de famille/);
  // Aucune note moyenne inventée dans les données Google.
  assert.doesNotMatch(read("lib/storefront-structured-data.ts"), /aggregateRating/);
});
