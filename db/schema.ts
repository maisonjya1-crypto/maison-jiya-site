import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("viewer"),
  isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
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
  refundedAt: text("refunded_at"),
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

export const mutationReceipts = sqliteTable(
  "mutation_receipts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestKey: text("request_key").notNull().unique(),
    userId: integer("user_id").notNull(),
    action: text("action").notNull(),
    status: text("status").notNull().default("processing"),
    message: text("message").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("mutation_receipts_user_id_idx").on(table.userId),
    index("mutation_receipts_created_at_idx").on(table.createdAt),
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

export const dailyClosings = sqliteTable(
  "daily_closings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    closeDate: text("close_date").notNull().unique(),
    expectedBank: integer("expected_bank").notNull().default(0),
    actualBank: integer("actual_bank").notNull().default(0),
    bankVariance: integer("bank_variance").notNull().default(0),
    expectedCash: integer("expected_cash").notNull().default(0),
    actualCash: integer("actual_cash").notNull().default(0),
    cashVariance: integer("cash_variance").notNull().default(0),
    expectedOther: integer("expected_other").notNull().default(0),
    actualOther: integer("actual_other").notNull().default(0),
    otherVariance: integer("other_variance").notNull().default(0),
    expectedTotal: integer("expected_total").notNull().default(0),
    actualTotal: integer("actual_total").notNull().default(0),
    totalVariance: integer("total_variance").notNull().default(0),
    carrierMoney: integer("carrier_money").notNull().default(0),
    receivables: integer("receivables").notNull().default(0),
    unpaidPurchases: integer("unpaid_purchases").notNull().default(0),
    unpaidExpenses: integer("unpaid_expenses").notNull().default(0),
    collectedOrders: integer("collected_orders").notNull().default(0),
    collectedAmount: integer("collected_amount").notNull().default(0),
    refundedOrders: integer("refunded_orders").notNull().default(0),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    paidPurchasesCount: integer("paid_purchases_count").notNull().default(0),
    paidPurchasesAmount: integer("paid_purchases_amount").notNull().default(0),
    paidExpensesCount: integer("paid_expenses_count").notNull().default(0),
    paidExpensesAmount: integer("paid_expenses_amount").notNull().default(0),
    adSpend: integer("ad_spend").notNull().default(0),
    note: text("note").notNull().default(""),
    closedByUserId: integer("closed_by_user_id"),
    closedByName: text("closed_by_name").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at"),
  },
  (table) => [index("daily_closings_date_idx").on(table.closeDate)],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    contactName: text("contact_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    whatsapp: text("whatsapp").notNull().default(""),
    city: text("city").notNull().default(""),
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    minimumOrderAmount: integer("minimum_order_amount").notNull().default(0),
    paymentTerms: text("payment_terms").notNull().default(""),
    notes: text("notes").notNull().default(""),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at"),
  },
  (table) => [
    index("suppliers_active_idx").on(table.isActive),
  ],
);

export const purchases = sqliteTable(
  "purchases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    supplier: text("supplier").notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    purchaseRef: text("purchase_ref"),
    purchaseLineNo: integer("purchase_line_no").notNull().default(1),
    purchaseMode: text("purchase_mode").notNull().default("Retrait fournisseur"),
    procurementStatus: text("procurement_status").notNull().default("Commandé"),
    orderedAt: text("ordered_at"),
    expectedAt: text("expected_at"),
    item: text("item").notNull(),
    productId: integer("product_id").references(() => products.id),
    quantity: integer("quantity").notNull(),
    unitCost: integer("unit_cost").notNull(),
    totalCost: integer("total_cost").notNull(),
    account: text("account").notNull().default("Banque"),
    paymentStatus: text("payment_status").notNull().default("Payé"),
    paidAt: text("paid_at"),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    receivedAt: text("received_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("purchases_product_id_idx").on(table.productId),
    index("purchases_supplier_id_idx").on(table.supplierId),
    index("purchases_purchase_ref_idx").on(table.purchaseRef),
    uniqueIndex("purchases_purchase_ref_line_unique_idx").on(table.purchaseRef, table.purchaseLineNo),
    index("purchases_purchase_mode_idx").on(table.purchaseMode),
    index("purchases_procurement_status_idx").on(table.procurementStatus),
  ],
);

export const supplierInvoices = sqliteTable(
  "supplier_invoices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
    purchaseRef: text("purchase_ref").notNull().unique(),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: text("invoice_date").notNull(),
    dueDate: text("due_date").notNull(),
    totalAmount: integer("total_amount").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at"),
  },
  (table) => [
    uniqueIndex("supplier_invoices_supplier_number_unique_idx").on(table.supplierId, table.invoiceNumber),
    index("supplier_invoices_supplier_id_idx").on(table.supplierId),
    index("supplier_invoices_due_date_idx").on(table.dueDate),
  ],
);

export const supplierPayments = sqliteTable(
  "supplier_payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    invoiceId: integer("invoice_id").notNull().references(() => supplierInvoices.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    account: text("account").notNull().default("Banque"),
    paidAt: text("paid_at").notNull(),
    reference: text("reference").notNull().default(""),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("supplier_payments_invoice_id_idx").on(table.invoiceId),
    index("supplier_payments_paid_at_idx").on(table.paidAt),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    category: text("category").notNull(),
    label: text("label").notNull(),
    amount: integer("amount").notNull(),
    account: text("account").notNull().default("Banque"),
    paymentStatus: text("payment_status").notNull().default("Payé"),
    paidAt: text("paid_at"),
    expenseDate: text("expense_date").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("expenses_expense_date_idx").on(table.expenseDate),
    index("expenses_payment_status_idx").on(table.paymentStatus),
  ],
);

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

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productCode: text("product_code").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    purchasePrice: integer("purchase_price").notNull(),
    salePrice: integer("sale_price").notNull(),
    minimumSalePrice: integer("minimum_sale_price").notNull().default(0),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    stockAlertThreshold: integer("stock_alert_threshold").notNull().default(5),
    reorderCoverDays: integer("reorder_cover_days").notNull().default(30),
    archivedAt: text("archived_at"),
    archivedByUserId: integer("archived_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("products_archived_at_idx").on(table.archivedAt)],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull().references(() => products.id),
    orderId: integer("order_id").references(() => orders.id),
    purchaseId: integer("purchase_id").references(() => purchases.id),
    movementType: text("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("stock_movements_product_id_idx").on(table.productId),
    index("stock_movements_order_id_idx").on(table.orderId),
    index("stock_movements_purchase_id_idx").on(table.purchaseId),
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
