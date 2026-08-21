export type StorefrontProductSettingRow = {
  productId: number;
  productCode: string;
  internalName: string;
  category: string;
  stockQuantity: number;
  internalPrice: number;
  publicName: string;
  publicPrice: number;
  isVisible: number;
  availabilityMode: string;
  badge: string;
  description: string;
  sortOrder: number;
};

export type StorefrontOfferRow = {
  id: number;
  name: string;
  description: string;
  price: number;
  comparePrice: number;
  badge: string;
  isActive: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string | null;
};

export type StorefrontOfferItemRow = {
  offerId: number;
  productId: number;
  quantity: number;
};

export type StorefrontMediaRow = {
  id: number;
  ownerType: string;
  ownerId: number;
  kind: string;
  mimeType: string;
  sortOrder: number;
  createdAt: string;
};

export async function ensureStorefrontCms(database: D1Database) {
  await database.batch([
    database.prepare(`
      CREATE TABLE IF NOT EXISTS storefront_product_settings (
        product_id INTEGER PRIMARY KEY NOT NULL,
        public_name TEXT DEFAULT '' NOT NULL,
        public_price REAL DEFAULT 0 NOT NULL,
        is_visible INTEGER DEFAULT 1 NOT NULL,
        availability_mode TEXT DEFAULT 'auto' NOT NULL,
        badge TEXT DEFAULT '' NOT NULL,
        description TEXT DEFAULT '' NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS storefront_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '' NOT NULL,
        price REAL NOT NULL,
        compare_price REAL DEFAULT 0 NOT NULL,
        badge TEXT DEFAULT '' NOT NULL,
        is_active INTEGER DEFAULT 1 NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT
      )
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS storefront_offer_items (
        offer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1 NOT NULL,
        PRIMARY KEY (offer_id, product_id)
      )
    `),
    database.prepare(`
      CREATE TABLE IF NOT EXISTS storefront_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        owner_type TEXT NOT NULL,
        owner_id INTEGER DEFAULT 0 NOT NULL,
        kind TEXT DEFAULT 'gallery' NOT NULL,
        mime_type TEXT NOT NULL,
        data_base64 TEXT NOT NULL,
        byte_size INTEGER DEFAULT 0 NOT NULL,
        sort_order INTEGER DEFAULT 0 NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `),
    database.prepare("CREATE INDEX IF NOT EXISTS storefront_media_owner_idx ON storefront_media (owner_type, owner_id, sort_order, id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS storefront_offer_items_offer_idx ON storefront_offer_items (offer_id)"),
  ]);

  const defaults = [
    ["storefront_brand_name", "Maison Jiya"],
    ["storefront_announcement", "Paiement à la livraison partout au Maroc"],
    ["storefront_hero_title", "Les pièces que vous aimez, simplement livrées chez vous."],
    ["storefront_hero_text", "Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer."],
    ["storefront_shipping_note", "Les éventuels frais de livraison sont confirmés par notre équipe."],
    ["storefront_meta_pixel_id", ""],
  ];
  await database.batch(defaults.map(([key, value]) => database.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `).bind(key, value)));
}

export async function getStorefrontMedia(database: D1Database, ownerType?: string, ownerId?: number) {
  const where = ownerType ? "WHERE owner_type = ? AND owner_id = ?" : "";
  const statement = database.prepare(`
    SELECT id, owner_type AS ownerType, owner_id AS ownerId, kind,
           mime_type AS mimeType, sort_order AS sortOrder, created_at AS createdAt
    FROM storefront_media
    ${where}
    ORDER BY sort_order, id
  `);
  return ownerType
    ? (await statement.bind(ownerType, ownerId || 0).all<StorefrontMediaRow>()).results
    : (await statement.all<StorefrontMediaRow>()).results;
}
