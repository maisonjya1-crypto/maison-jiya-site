import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adPerformance, capitalLedger, carrierSettlementOrders, carrierSettlements, customers, expenses, inventoryCounts, inventorySessions, monthlyClosings, orders, products, purchases, settings, stockMovements, supplierInvoices, supplierPayments, suppliers, users } from "../../../../db/schema";
import { orderContributionBeforeGlobalAds } from "../../../../lib/finance";

const datasetNames = new Set([
  "orders",
  "products",
  "shipments",
  "customers",
  "purchases",
  "suppliers",
  "supplier-invoices",
  "supplier-payments",
  "expenses",
  "ads",
  "capital",
  "stock-movements",
  "inventory-sessions",
  "inventory-counts",
  "monthly-closings",
  "carrier-settlements",
  "carrier-settlement-orders",
  "carriers",
  "members",
  "settings",
]);

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function backupKeyFromRequest(request: Request, url: URL) {
  const authorization = request.headers.get("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,200})$/i);
  if (bearerMatch) return bearerMatch[1];
  return url.searchParams.get("key") || "";
}

function safeText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = safeText(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvResponse(headers: string[], rows: Array<Array<unknown>>) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": 'inline; filename="maison-jiya-backup.csv"',
      "x-content-type-options": "nosniff",
    },
  });
}

function carrierNames(rawValue: string | undefined, legacyValue = "") {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(rawValue || "[]");
  } catch {
    parsed = [];
  }
  const names = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  if (legacyValue && legacyValue !== "À configurer") names.push(legacyValue);
  return names
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name, index, all) => name && all.findIndex((item) => item.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr")) === index);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dataset = url.searchParams.get("dataset") || "";
    const key = backupKeyFromRequest(request, url);
    if (!datasetNames.has(dataset)) return Response.json({ error: "Jeu de données inconnu." }, { status: 400 });
    if (key.length < 32 || key.length > 200) return Response.json({ error: "Accès refusé." }, { status: 401 });

    const db = await getDb();
    const [storedToken] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "security_backup_token_hash")).limit(1);
    if (!storedToken?.value || !secureEqual(await sha256Hex(key), storedToken.value)) {
      return Response.json({ error: "Accès refusé." }, { status: 401 });
    }

    if (dataset === "orders" || dataset === "shipments" || dataset === "customers") {
      const orderRows = await db.select({
        id: orders.id,
        orderRef: orders.orderRef,
        customerId: orders.customerId,
        customerName: customers.name,
        phone: customers.phone,
        city: orders.city,
        address: orders.address,
        products: orders.products,
        quantity: orders.quantity,
        saleAmount: orders.saleAmount,
        productCost: orders.productCost,
        shippingCost: orders.shippingCost,
        adCost: orders.adCost,
        fees: orders.fees,
        returnCost: orders.returnCost,
        returnReason: orders.returnReason,
        returnNote: orders.returnNote,
        source: orders.source,
        campaign: orders.campaign,
        fulfillmentType: orders.fulfillmentType,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        carrier: orders.carrier,
        trackingNumber: orders.trackingNumber,
        carrierDispatchState: orders.carrierDispatchState,
        carrierAuthorizedAt: orders.carrierAuthorizedAt,
        carrierInvoiceCode: orders.carrierInvoiceCode,
        paidAt: orders.paidAt,
        refundedAt: orders.refundedAt,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt));

      const customerRows = await db.select().from(customers).orderBy(desc(customers.createdAt));
      const orderNumbers = new Map([...orderRows].reverse().map((row, index) => [row.id, index + 1]));
      const customerNumbers = new Map([...customerRows].reverse().map((customer, index) => [customer.id, index + 1]));

      if (dataset === "orders") return csvResponse(
        ["N° commande", "Référence commande", "N° client", "Cliente", "Téléphone", "Ville", "Adresse", "Produits", "Quantité", "Prix de vente (MAD)", "Coût produit (MAD)", "Frais livraison (MAD)", "Coût publicité attribué (MAD)", "Autres frais (MAD)", "Coût retour (MAD)", "Motif du retour", "Détail du retour", "Source", "Campagne", "Mode de vente", "Statut", "Paiement", "Agence", "Numéro de suivi", "État création agence", "Autorisé le", "Facture agence", "Date encaissée", "Date remboursée", "Créée le", "Modifiée le", "Marge commande avant dépenses globales (MAD)", "ID technique commande", "ID technique client"],
        orderRows.map((row) => [orderNumbers.get(row.id), row.orderRef, customerNumbers.get(row.customerId), row.customerName, row.phone, row.city, row.address, row.products, row.quantity, row.saleAmount, row.productCost, row.shippingCost, row.adCost, row.fees, row.returnCost, row.returnReason, row.returnNote, row.source, row.campaign, row.fulfillmentType, row.status, row.paymentStatus, row.carrier, row.trackingNumber, row.carrierDispatchState, row.carrierAuthorizedAt, row.carrierInvoiceCode, row.paidAt, row.refundedAt, row.createdAt, row.updatedAt, orderContributionBeforeGlobalAds(row), row.id, row.customerId]),
      );

      if (dataset === "shipments") return csvResponse(
        ["N° commande", "Référence commande", "Cliente", "Téléphone", "Ville", "Adresse", "Produits", "Quantité", "Statut commande", "Motif du retour", "Détail du retour", "Paiement", "Encaissé le", "Remboursé le", "Agence", "Numéro de suivi", "État création agence", "Autorisé le", "Facture agence", "Frais livraison (MAD)", "Créé le", "Modifié le", "ID technique commande"],
        orderRows.filter((row) => row.fulfillmentType !== "Magasin physique").map((row) => [orderNumbers.get(row.id), row.orderRef, row.customerName, row.phone, row.city, row.address, row.products, row.quantity, row.status, row.returnReason, row.returnNote, row.paymentStatus, row.paidAt, row.refundedAt, row.carrier, row.trackingNumber, row.carrierDispatchState, row.carrierAuthorizedAt, row.carrierInvoiceCode, row.shippingCost, row.createdAt, row.updatedAt, row.id]),
      );

      const totals = new Map<number, { count: number; amount: number }>();
      for (const order of orderRows) {
        const current = totals.get(order.customerId) || { count: 0, amount: 0 };
        current.count += 1;
        current.amount += order.saleAmount;
        totals.set(order.customerId, current);
      }
      return csvResponse(
        ["N° client", "Nom", "Téléphone", "Ville", "Nombre de commandes", "Total commandé (MAD)", "Créé le", "ID technique client"],
        customerRows.map((customer) => [customerNumbers.get(customer.id), customer.name, customer.phone, customer.city, totals.get(customer.id)?.count || 0, totals.get(customer.id)?.amount || 0, customer.createdAt, customer.id]),
      );
    }

    if (dataset === "products") {
      const rows = await db.select().from(products).orderBy(desc(products.createdAt));
      return csvResponse(
        ["ID", "ID produit", "Nom du produit", "Catégorie", "Prix d’achat (MAD)", "Prix de vente (MAD)", "Prix de vente minimum (MAD)", "Quantité restante", "Seuil alerte stock", "Couverture cible (jours)", "Valeur du stock (MAD)", "Créé le"],
        rows.map((row) => [row.id, row.productCode, row.name, row.category, row.purchasePrice, row.salePrice, row.minimumSalePrice, row.stockQuantity, row.stockAlertThreshold, row.reorderCoverDays, row.purchasePrice * row.stockQuantity, row.createdAt]),
      );
    }

    if (dataset === "purchases") {
      const rows = await db.select({
        id: purchases.id,
        purchaseRef: purchases.purchaseRef,
        purchaseLineNo: purchases.purchaseLineNo,
        purchaseMode: purchases.purchaseMode,
        supplierId: purchases.supplierId,
        supplier: purchases.supplier,
        supplierContact: suppliers.contactName,
        supplierPhone: suppliers.phone,
        supplierWhatsapp: suppliers.whatsapp,
        procurementStatus: purchases.procurementStatus,
        orderedAt: purchases.orderedAt,
        expectedAt: purchases.expectedAt,
        item: purchases.item,
        productId: purchases.productId,
        productCode: products.productCode,
        productName: products.name,
        quantity: purchases.quantity,
        unitCost: purchases.unitCost,
        totalCost: purchases.totalCost,
        account: purchases.account,
        paymentStatus: purchases.paymentStatus,
        paidAt: purchases.paidAt,
        receivedQuantity: purchases.receivedQuantity,
        receivedAt: purchases.receivedAt,
        createdAt: purchases.createdAt,
      }).from(purchases)
        .leftJoin(products, eq(purchases.productId, products.id))
        .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
        .orderBy(desc(purchases.createdAt));
      return csvResponse(
        ["ID", "Référence bon", "Ligne du bon", "Mode d’achat", "ID fournisseur", "Fournisseur", "Contact fournisseur", "Téléphone fournisseur", "WhatsApp fournisseur", "État du bon", "Commandé le", "Livraison prévue", "Article", "ID produit", "SKU", "Produit", "Quantité commandée", "Quantité réceptionnée", "Reste à recevoir", "Coût unitaire (MAD)", "Coût total (MAD)", "Compte paiement", "Statut paiement", "Payé le", "Réceptionné le", "Créé le"],
        rows.map((row) => [row.id, row.purchaseRef, row.purchaseLineNo, row.purchaseMode, row.supplierId, row.supplier, row.supplierContact, row.supplierPhone, row.supplierWhatsapp, row.procurementStatus, row.orderedAt, row.expectedAt, row.item, row.productId, row.productCode, row.productName, row.quantity, row.receivedQuantity, Math.max(0, row.quantity - row.receivedQuantity), row.unitCost, row.totalCost, row.account, row.paymentStatus, row.paidAt, row.receivedAt, row.createdAt]),
      );
    }

    if (dataset === "supplier-invoices") {
      const rows = await db.select({
        id: supplierInvoices.id,
        supplierId: supplierInvoices.supplierId,
        supplierName: suppliers.name,
        purchaseRef: supplierInvoices.purchaseRef,
        invoiceNumber: supplierInvoices.invoiceNumber,
        invoiceDate: supplierInvoices.invoiceDate,
        dueDate: supplierInvoices.dueDate,
        totalAmount: supplierInvoices.totalAmount,
        note: supplierInvoices.note,
        createdAt: supplierInvoices.createdAt,
        updatedAt: supplierInvoices.updatedAt,
      }).from(supplierInvoices)
        .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
        .orderBy(desc(supplierInvoices.invoiceDate), desc(supplierInvoices.createdAt));
      const payments = await db.select().from(supplierPayments);
      return csvResponse(
        ["ID", "N° facture", "Référence bon", "ID fournisseur", "Fournisseur", "Date facture", "Échéance", "Montant facture (MAD)", "Payé (MAD)", "Reste à payer (MAD)", "Statut", "Note", "Créé le", "Modifié le"],
        rows.map((row) => {
          const paid = payments.filter((payment) => payment.invoiceId === row.id).reduce((sum, payment) => sum + payment.amount, 0);
          const remaining = Math.max(0, row.totalAmount - paid);
          const status = remaining <= 0 ? "Payé" : paid > 0 ? "Partiellement payé" : "À payer";
          return [row.id, row.invoiceNumber, row.purchaseRef, row.supplierId, row.supplierName, row.invoiceDate, row.dueDate, row.totalAmount, paid, remaining, status, row.note, row.createdAt, row.updatedAt];
        }),
      );
    }

    if (dataset === "supplier-payments") {
      const rows = await db.select({
        id: supplierPayments.id,
        invoiceId: supplierPayments.invoiceId,
        invoiceNumber: supplierInvoices.invoiceNumber,
        purchaseRef: supplierInvoices.purchaseRef,
        supplierName: suppliers.name,
        amount: supplierPayments.amount,
        account: supplierPayments.account,
        paidAt: supplierPayments.paidAt,
        reference: supplierPayments.reference,
        note: supplierPayments.note,
        createdAt: supplierPayments.createdAt,
      }).from(supplierPayments)
        .leftJoin(supplierInvoices, eq(supplierPayments.invoiceId, supplierInvoices.id))
        .leftJoin(suppliers, eq(supplierInvoices.supplierId, suppliers.id))
        .orderBy(desc(supplierPayments.paidAt), desc(supplierPayments.createdAt));
      return csvResponse(
        ["ID", "ID facture", "N° facture", "Référence bon", "Fournisseur", "Montant payé (MAD)", "Compte", "Date paiement", "Référence paiement", "Note", "Créé le"],
        rows.map((row) => [row.id, row.invoiceId, row.invoiceNumber, row.purchaseRef, row.supplierName, row.amount, row.account, row.paidAt, row.reference, row.note, row.createdAt]),
      );
    }

    if (dataset === "suppliers") {
      const rows = await db.select().from(suppliers).orderBy(desc(suppliers.isActive), desc(suppliers.createdAt));
      return csvResponse(
        ["ID", "Fournisseur", "Contact", "Téléphone", "WhatsApp", "Ville", "Délai moyen (jours)", "Minimum de commande (MAD)", "Conditions de paiement", "Notes", "Actif", "Créé le", "Modifié le"],
        rows.map((row) => [row.id, row.name, row.contactName, row.phone, row.whatsapp, row.city, row.leadTimeDays, row.minimumOrderAmount, row.paymentTerms, row.notes, row.isActive ? "Oui" : "Non", row.createdAt, row.updatedAt]),
      );
    }

    if (dataset === "expenses") {
      const rows = await db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
      return csvResponse(
        ["ID", "Catégorie", "Libellé", "Montant (MAD)", "Compte", "Paiement", "Payé le", "Date de dépense", "Note", "Créé le"],
        rows.map((row) => [row.id, row.category, row.label, row.amount, row.account, row.paymentStatus, row.paidAt, row.expenseDate, row.note, row.createdAt]),
      );
    }

    if (dataset === "ads") {
      const rows = await db.select().from(adPerformance).orderBy(desc(adPerformance.performanceDate));
      return csvResponse(
        ["ID", "Plateforme", "Campagne", "ID campagne Meta", "Dépense native", "Devise native", "Dépense (MAD)", "Chiffre d’affaires (MAD)", "Nombre de commandes", "ROAS", "Source", "Date de performance", "Créé le"],
        rows.map((row) => [row.id, row.platform, row.campaign, row.externalId, row.nativeSpendCents / 100, row.nativeCurrency, row.spend, row.revenue, row.orderCount, row.spend ? Number((row.revenue / row.spend).toFixed(2)) : 0, row.source, row.performanceDate, row.createdAt]),
      );
    }

    if (dataset === "capital") {
      const rows = await db.select().from(capitalLedger).orderBy(desc(capitalLedger.entryDate));
      return csvResponse(
        ["ID", "Direction", "Catégorie", "Libellé", "Montant (MAD)", "Compte / enveloppe", "Commande liée", "Automatique", "Date opération", "Créé le"],
        rows.map((row) => [row.id, row.direction, row.category, row.label, row.amount, row.account, row.orderId, row.isAutomatic, row.entryDate, row.createdAt]),
      );
    }

    if (dataset === "monthly-closings") {
      const rows = await db.select().from(monthlyClosings).orderBy(desc(monthlyClosings.monthKey), desc(monthlyClosings.createdAt));
      return csvResponse(
        ["ID", "Mois", "Début période", "Fin période", "Commandes livrées", "CA livré (MAD)", "CA encaissé brut (MAD)", "Coût produits vendus (MAD)", "Livraison (MAD)", "Frais commandes (MAD)", "Retours / pertes commandes (MAD)", "Meta Ads (MAD)", "Charges exploitation (MAD)", "Pertes inventaire (MAD)", "Ajustement transporteurs (MAD)", "Marge commandes (MAD)", "Bénéfice net (MAD)", "Réinvestissement affecté (MAD)", "Apports manuels (MAD)", "Retraits manuels (MAD)", "Valeur stock début (MAD)", "Valeur stock fin (MAD)", "Source valeur stock", "Trésorerie fin (MAD)", "Source trésorerie", "Note", "Clôturé par", "Créé le"],
        rows.map((row) => [row.id, row.monthKey, row.periodStart, row.periodEnd, row.deliveredOrders, row.deliveredRevenue, row.collectedAmount, row.productCost, row.shippingCost, row.fees, row.returnCost, row.adSpend, row.operatingExpenses, row.inventoryLoss, row.carrierAdjustment, row.contributionMargin, row.netProfit, row.reinvestmentAllocated, row.manualCapitalIn, row.manualCapitalOut, row.stockValueStart, row.stockValueEnd, row.stockValueSource, row.cashEnd, row.cashEndSource, row.note, row.closedByName, row.createdAt]),
      );
    }

    if (dataset === "inventory-sessions") {
      const rows = await db.select().from(inventorySessions).orderBy(desc(inventorySessions.startedAt));
      return csvResponse(
        ["ID", "Référence session", "Statut", "Produits attendus", "Produits comptés", "Unités système", "Unités physiques", "Unités ajustées", "Valeur avant (MAD)", "Valeur après (MAD)", "Pertes (MAD)", "Responsable", "Démarré le", "Clôturé le", "Note"],
        rows.map((row) => [row.id, row.sessionRef, row.status, row.expectedProductCount, row.countedProductCount, row.totalSystemUnits, row.totalPhysicalUnits, row.totalAdjustmentUnits, row.valueBefore, row.valueAfter, row.lossValue, row.startedByName, row.startedAt, row.completedAt, row.note]),
      );
    }

    if (dataset === "inventory-counts") {
      const rows = await db.select({
        id: inventoryCounts.id,
        countRef: inventoryCounts.countRef,
        sessionId: inventoryCounts.sessionId,
        sessionRef: inventorySessions.sessionRef,
        productId: inventoryCounts.productId,
        productCode: products.productCode,
        productName: products.name,
        systemQuantity: inventoryCounts.systemQuantity,
        physicalQuantity: inventoryCounts.physicalQuantity,
        difference: inventoryCounts.difference,
        reason: inventoryCounts.reason,
        unitCost: inventoryCounts.unitCost,
        valueBefore: inventoryCounts.valueBefore,
        valueAfter: inventoryCounts.valueAfter,
        lossValue: inventoryCounts.lossValue,
        note: inventoryCounts.note,
        countedByName: inventoryCounts.countedByName,
        createdAt: inventoryCounts.createdAt,
      }).from(inventoryCounts)
        .leftJoin(products, eq(inventoryCounts.productId, products.id))
        .leftJoin(inventorySessions, eq(inventoryCounts.sessionId, inventorySessions.id))
        .orderBy(desc(inventoryCounts.createdAt));
      return csvResponse(
        ["ID", "Référence comptage", "ID session", "Référence session", "ID produit", "SKU", "Produit", "Stock système", "Stock physique", "Écart", "Motif", "Coût unitaire (MAD)", "Valeur avant (MAD)", "Valeur après (MAD)", "Perte (MAD)", "Note", "Compté par", "Créé le"],
        rows.map((row) => [row.id, row.countRef, row.sessionId, row.sessionRef, row.productId, row.productCode, row.productName, row.systemQuantity, row.physicalQuantity, row.difference, row.reason, row.unitCost, row.valueBefore, row.valueAfter, row.lossValue, row.note, row.countedByName, row.createdAt]),
      );
    }

    if (dataset === "stock-movements") {
      const rows = await db.select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        purchaseId: stockMovements.purchaseId,
        productCode: products.productCode,
        productName: products.name,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        note: stockMovements.note,
        createdAt: stockMovements.createdAt,
      }).from(stockMovements).leftJoin(products, eq(stockMovements.productId, products.id)).orderBy(desc(stockMovements.createdAt));
      return csvResponse(
        ["ID", "ID produit", "ID achat fournisseur", "ID produit / SKU", "Nom du produit", "Type de mouvement", "Quantité", "Note", "Créé le"],
        rows.map((row) => [row.id, row.productId, row.purchaseId, row.productCode, row.productName, row.movementType, row.quantity, row.note, row.createdAt]),
      );
    }

    if (dataset === "carrier-settlements") {
      const rows = await db.select().from(carrierSettlements).orderBy(desc(carrierSettlements.settlementDate), desc(carrierSettlements.createdAt));
      return csvResponse(
        ["ID", "Transporteur", "Référence", "Date reçue", "Montant attendu (MAD)", "Montant reçu (MAD)", "Écart (MAD)", "Nombre de commandes", "Statut", "Note", "Enregistré par", "Créé le"],
        rows.map((row) => [row.id, row.carrier, row.reference, row.settlementDate, row.expectedAmount, row.actualAmount, row.differenceAmount, row.orderCount, row.status, row.note, row.createdByName, row.createdAt]),
      );
    }

    if (dataset === "carrier-settlement-orders") {
      const rows = await db.select({
        id: carrierSettlementOrders.id,
        settlementId: carrierSettlementOrders.settlementId,
        settlementReference: carrierSettlements.reference,
        settlementCarrier: carrierSettlements.carrier,
        orderId: carrierSettlementOrders.orderId,
        orderRef: orders.orderRef,
        trackingNumber: orders.trackingNumber,
        expectedAmount: carrierSettlementOrders.expectedAmount,
        createdAt: carrierSettlementOrders.createdAt,
      }).from(carrierSettlementOrders)
        .leftJoin(carrierSettlements, eq(carrierSettlementOrders.settlementId, carrierSettlements.id))
        .leftJoin(orders, eq(carrierSettlementOrders.orderId, orders.id))
        .orderBy(desc(carrierSettlementOrders.createdAt));
      return csvResponse(
        ["ID", "ID règlement", "Référence règlement", "Transporteur", "ID commande", "Référence commande", "Suivi", "Montant attendu (MAD)", "Créé le"],
        rows.map((row) => [row.id, row.settlementId, row.settlementReference, row.settlementCarrier, row.orderId, row.orderRef, row.trackingNumber, row.expectedAmount, row.createdAt]),
      );
    }

    if (dataset === "carriers") {
      const rows = await db.select().from(settings);
      const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
      return csvResponse(
        ["N°", "Nom de l’agence", "Statut"],
        carrierNames(values.carrier_names, values.carrier_name).map((name, index) => [index + 1, name, "Active"]),
      );
    }

    if (dataset === "members") {
      const rows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, isOwner: users.isOwner, isActive: users.isActive, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt));
      return csvResponse(
        ["ID", "Nom d’utilisateur", "Nom affiché", "Rôle", "Propriétaire principal", "Compte actif", "Créé le"],
        rows.map((row) => [row.id, row.username, row.displayName, row.role, row.isOwner ? "Oui" : "Non", row.isActive, row.createdAt]),
      );
    }

    const rows = await db.select().from(settings);
    const descriptions: Record<string, string> = {
      safety_reserve: "Réserve de sécurité",
      reinvestment_allocation: "Part de la marge affectée au réinvestissement",
      salary_allocation: "Part de la marge affectée au salaire personnel",
      emergency_allocation: "Part de la marge affectée au fonds d’urgence",
      meta_status: "État de la connexion Meta",
      carrier_name: "Agence historique principale",
      carrier_names: "Liste des agences",
      theme: "Thème de la plateforme",
      account_name: "Nom du compte principal",
      account_email: "Adresse e-mail du compte principal",
      backup_sheet_url: "Lien du classeur de sauvegarde",
    };
    const safeRows = rows.filter((row) => !row.key.startsWith("security_") && Object.hasOwn(descriptions, row.key));
    return csvResponse(
      ["Clé", "Valeur", "Description"],
      safeRows.map((row) => [row.key, row.value, descriptions[row.key]]),
    );
  } catch (error) {
    console.error("Maison Jiya Google Sheets backup failed", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "La sauvegarde est momentanément indisponible." }, { status: 500 });
  }
}
