import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("viewer"),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at"),
});

export const userSessions = sqliteTable(
  "user_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("user_sessions_user_id_idx").on(table.userId)],
);

export const loginAttempts = sqliteTable("login_attempts", {
  username: text("username").primaryKey(),
  attemptCount: integer("attempt_count").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  blockedUntil: text("blocked_until"),
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  city: text("city").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderRef: text("order_ref").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  city: text("city").notNull(),
  products: text("products").notNull(),
  quantity: integer("quantity").notNull().default(1),
  saleAmount: integer("sale_amount").notNull(),
  productCost: integer("product_cost").notNull().default(0),
  shippingCost: integer("shipping_cost").notNull().default(0),
  adCost: integer("ad_cost").notNull().default(0),
  fees: integer("fees").notNull().default(0),
  returnCost: integer("return_cost").notNull().default(0),
  source: text("source").notNull().default("Non renseignée"),
  status: text("status").notNull().default("Nouvelle"),
  paymentStatus: text("payment_status").notNull().default("À encaisser"),
  carrier: text("carrier").notNull().default("Non affecté"),
  trackingNumber: text("tracking_number").notNull().default(""),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at"),
});

export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplier: text("supplier").notNull(),
  item: text("item").notNull(),
  quantity: integer("quantity").notNull(),
  unitCost: integer("unit_cost").notNull(),
  totalCost: integer("total_cost").notNull(),
  paymentStatus: text("payment_status").notNull().default("Payé"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adPerformance = sqliteTable("ad_performance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform").notNull().default("Meta Ads"),
  campaign: text("campaign").notNull(),
  spend: integer("spend").notNull(),
  revenue: integer("revenue").notNull(),
  orderCount: integer("order_count").notNull(),
  source: text("source").notNull().default("Manuel"),
  performanceDate: text("performance_date").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const capitalLedger = sqliteTable("capital_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  direction: text("direction").notNull(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),
  entryDate: text("entry_date").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productCode: text("product_code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  purchasePrice: integer("purchase_price").notNull(),
  salePrice: integer("sale_price").notNull(),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull().references(() => products.id),
    movementType: text("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("stock_movements_product_id_idx").on(table.productId)],
);
