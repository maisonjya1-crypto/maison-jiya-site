import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    userId: integer("user_id").notNull().references(() => users.id),
    usageDate: text("usage_date").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.usageDate] })],
);

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
  productId: integer("product_id").references(() => products.id),
  city: text("city").notNull(),
  address: text("address").notNull().default(""),
  products: text("products").notNull(),
  quantity: integer("quantity").notNull().default(1),
  saleAmount: integer("sale_amount").notNull(),
  productCost: integer("product_cost").notNull().default(0),
  shippingCost: integer("shipping_cost").notNull().default(0),
  adCost: integer("ad_cost").notNull().default(0),
  fees: integer("fees").notNull().default(0),
  returnCost: integer("return_cost").notNull().default(0),
  returnReason: text("return_reason").notNull().default(""),
  returnNote: text("return_note").notNull().default(""),
  source: text("source").notNull().default("Non renseignée"),
  campaign: text("campaign").notNull().default(""),
  fulfillmentType: text("fulfillment_type").notNull().default("Livraison"),
  status: text("status").notNull().default("Nouvelle"),
  paymentStatus: text("payment_status").notNull().default("À encaisser"),
  carrier: text("carrier").notNull().default("Non affecté"),
  trackingNumber: text("tracking_number").notNull().default(""),
  carrierDispatchState: text("carrier_dispatch_state").notNull().default("À autoriser"),
  carrierAuthorizedAt: text("carrier_authorized_at"),
  carrierInvoiceCode: text("carrier_invoice_code").notNull().default(""),
  stockDeducted: integer("stock_deducted", { mode: "boolean" }).notNull().default(false),
  paidAt: text("paid_at"),
  deletedAt: text("deleted_at"),
  deletedByUserId: integer("deleted_by_user_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at"),
});

export const orderStatusHistory = sqliteTable(
  "order_status_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedByUserId: integer("changed_by_user_id"),
    changedByName: text("changed_by_name").notNull(),
    changedAt: text("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("order_status_history_order_id_idx").on(table.orderId)],
);

export const carrierEvents = sqliteTable(
  "carrier_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(),
    externalCode: text("external_code").notNull(),
    externalStatus: text("external_status").notNull(),
    payloadHash: text("payload_hash").notNull().unique(),
    message: text("message").notNull().default(""),
    proofImage: text("proof_image").notNull().default(""),
    occurredAt: text("occurred_at"),
    orderId: integer("order_id"),
    processed: integer("processed", { mode: "boolean" }).notNull().default(false),
    errorMessage: text("error_message").notNull().default(""),
    receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("carrier_events_external_code_idx").on(table.externalCode),
    index("carrier_events_order_id_idx").on(table.orderId),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id"),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    entityLabel: text("entity_label").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("audit_logs_created_at_idx").on(table.createdAt)],
);

export const dailyBackups = sqliteTable("daily_backups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  backupDate: text("backup_date").notNull().unique(),
  reason: text("reason").notNull().default("Automatique"),
  snapshotJson: text("snapshot_json").notNull(),
  recordCount: integer("record_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  externalId: text("external_id").notNull().default(""),
  spend: integer("spend").notNull(),
  revenue: integer("revenue").notNull(),
  orderCount: integer("order_count").notNull(),
  nativeSpendCents: integer("native_spend_cents").notNull().default(0),
  nativeRevenueCents: integer("native_revenue_cents").notNull().default(0),
  nativeCurrency: text("native_currency").notNull().default("MAD"),
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
  account: text("account").notNull().default("Banque"),
  orderId: integer("order_id"),
  isAutomatic: integer("is_automatic", { mode: "boolean" }).notNull().default(false),
  autoKey: text("auto_key").unique(),
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
    orderId: integer("order_id").references(() => orders.id),
    movementType: text("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("stock_movements_product_id_idx").on(table.productId),
    index("stock_movements_order_id_idx").on(table.orderId),
  ],
);

export const inventoryCounts = sqliteTable(
  "inventory_counts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    countRef: text("count_ref").notNull().unique(),
    productId: integer("product_id").notNull().references(() => products.id),
    systemQuantity: integer("system_quantity").notNull(),
    physicalQuantity: integer("physical_quantity").notNull(),
    difference: integer("difference").notNull(),
    note: text("note").notNull().default(""),
    countedByUserId: integer("counted_by_user_id"),
    countedByName: text("counted_by_name").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("inventory_counts_product_id_idx").on(table.productId)],
);
