import { desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adPerformance, capitalLedger, customers, orders, products, purchases, settings, stockMovements, users } from "../../../../db/schema";

const datasetNames = new Set([
  "orders",
  "products",
  "shipments",
  "customers",
  "purchases",
  "ads",
  "capital",
  "stock-movements",
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
    const key = url.searchParams.get("key") || "";
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
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      }).from(orders).leftJoin(customers, eq(orders.customerId, customers.id)).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt));

      const customerRows = await db.select().from(customers).orderBy(desc(customers.createdAt));
      const orderNumbers = new Map([...orderRows].reverse().map((row, index) => [row.id, index + 1]));
      const customerNumbers = new Map([...customerRows].reverse().map((customer, index) => [customer.id, index + 1]));

      if (dataset === "orders") return csvResponse(
        ["N° commande", "Référence commande", "N° client", "Cliente", "Téléphone", "Ville", "Adresse", "Produits", "Quantité", "Prix de vente (MAD)", "Coût produit (MAD)", "Frais livraison (MAD)", "Coût publicité (MAD)", "Autres frais (MAD)", "Coût retour (MAD)", "Motif du retour", "Détail du retour", "Source", "Campagne", "Mode de vente", "Statut", "Paiement", "Agence", "Numéro de suivi", "État création agence", "Autorisé le", "Facture agence", "Date encaissée", "Créée le", "Modifiée le", "Gain exact (MAD)", "ID technique commande", "ID technique client"],
        orderRows.map((row) => [orderNumbers.get(row.id), row.orderRef, customerNumbers.get(row.customerId), row.customerName, row.phone, row.city, row.address, row.products, row.quantity, row.saleAmount, row.productCost, row.shippingCost, row.adCost, row.fees, row.returnCost, row.returnReason, row.returnNote, row.source, row.campaign, row.fulfillmentType, row.status, row.paymentStatus, row.carrier, row.trackingNumber, row.carrierDispatchState, row.carrierAuthorizedAt, row.carrierInvoiceCode, row.paidAt, row.createdAt, row.updatedAt, row.saleAmount - row.productCost - row.shippingCost - row.adCost - row.fees - row.returnCost, row.id, row.customerId]),
      );

      if (dataset === "shipments") return csvResponse(
        ["N° commande", "Référence commande", "Cliente", "Téléphone", "Ville", "Adresse", "Produits", "Quantité", "Statut commande", "Motif du retour", "Détail du retour", "Paiement", "Agence", "Numéro de suivi", "État création agence", "Autorisé le", "Facture agence", "Frais livraison (MAD)", "Créé le", "Modifié le", "ID technique commande"],
        orderRows.filter((row) => row.fulfillmentType !== "Magasin physique").map((row) => [orderNumbers.get(row.id), row.orderRef, row.customerName, row.phone, row.city, row.address, row.products, row.quantity, row.status, row.returnReason, row.returnNote, row.paymentStatus, row.carrier, row.trackingNumber, row.carrierDispatchState, row.carrierAuthorizedAt, row.carrierInvoiceCode, row.shippingCost, row.createdAt, row.updatedAt, row.id]),
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
        ["ID", "ID produit", "Nom du produit", "Catégorie", "Prix d’achat (MAD)", "Prix de vente (MAD)", "Prix de vente minimum (MAD)", "Quantité restante", "Valeur du stock (MAD)", "Créé le"],
        rows.map((row) => [row.id, row.productCode, row.name, row.category, row.purchasePrice, row.salePrice, row.minimumSalePrice, row.stockQuantity, row.purchasePrice * row.stockQuantity, row.createdAt]),
      );
    }

    if (dataset === "purchases") {
      const rows = await db.select().from(purchases).orderBy(desc(purchases.createdAt));
      return csvResponse(
        ["ID", "Fournisseur", "Article", "Quantité", "Coût unitaire (MAD)", "Coût total (MAD)", "Statut paiement", "Créé le"],
        rows.map((row) => [row.id, row.supplier, row.item, row.quantity, row.unitCost, row.totalCost, row.paymentStatus, row.createdAt]),
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

    if (dataset === "stock-movements") {
      const rows = await db.select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productCode: products.productCode,
        productName: products.name,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        note: stockMovements.note,
        createdAt: stockMovements.createdAt,
      }).from(stockMovements).leftJoin(products, eq(stockMovements.productId, products.id)).orderBy(desc(stockMovements.createdAt));
      return csvResponse(
        ["ID", "ID produit", "ID produit / SKU", "Nom du produit", "Type de mouvement", "Quantité", "Note", "Créé le"],
        rows.map((row) => [row.id, row.productId, row.productCode, row.productName, row.movementType, row.quantity, row.note, row.createdAt]),
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
      const rows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, isActive: users.isActive, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt));
      return csvResponse(
        ["ID", "Nom d’utilisateur", "Nom affiché", "Rôle", "Compte actif", "Créé le"],
        rows.map((row) => [row.id, row.username, row.displayName, row.role, row.isActive, row.createdAt]),
      );
    }

    const rows = await db.select().from(settings);
    const descriptions: Record<string, string> = {
      safety_reserve: "Réserve de sécurité",
      stock_allocation: "Part du réinvestissement stock",
      ads_allocation: "Part du réinvestissement publicité",
      reserve_allocation: "Part du fonds d’urgence",
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
