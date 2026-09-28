import type { DashboardAlert } from "./dashboard-alerts";
import type { DashboardPilotage } from "./dashboard-pilotage";

export type DecisionPriority = "P1" | "P2" | "P3" | "OPPORTUNITÉ";

export type DashboardDecision = {
  id: string;
  priority: DecisionPriority;
  title: string;
  reason: string;
  actionLabel: string;
  target:
    | "Commandes"
    | "Factures fournisseurs"
    | "Dépenses"
    | "Rapports"
    | "Colis";
  amount?: number;
};

const alertById = (alerts: DashboardAlert[], id: string) => alerts.find((alert) => alert.id === id);

export function buildDashboardDecisions({
  alerts,
  pilotage,
}: {
  alerts: DashboardAlert[];
  pilotage: DashboardPilotage;
}): DashboardDecision[] {
  const decisions: DashboardDecision[] = [];

  const staleOrders = alertById(alerts, "orders-pending-stale");
  if (staleOrders) {
    const count = staleOrders.count || 0;
    decisions.push({
      id: "decision-stale-orders",
      priority: "P1",
      title: `Confirmer ${count} commande${count > 1 ? "s" : ""} ancienne${count > 1 ? "s" : ""} aujourd’hui`,
      reason: "Elles attendent depuis plus de 24 h et risquent de retarder la préparation ou la livraison.",
      actionLabel: "Ouvrir les commandes",
      target: "Commandes",
      amount: staleOrders.amount,
    });
  }

  const overdueInvoices = alertById(alerts, "supplier-invoices-overdue");
  if (overdueInvoices) {
    decisions.push({
      id: "decision-overdue-invoices",
      priority: "P1",
      title: "Traiter les factures fournisseurs déjà échues",
      reason: `${overdueInvoices.count || 0} facture${(overdueInvoices.count || 0) > 1 ? "s" : ""} sont en retard. Vérifier les montants et planifier le règlement sans modifier automatiquement la trésorerie.`,
      actionLabel: "Voir les factures",
      target: "Factures fournisseurs",
      amount: overdueInvoices.amount,
    });
  }

  const dueSoon = alertById(alerts, "supplier-invoices-due-soon");
  if (dueSoon) {
    decisions.push({
      id: "decision-due-soon",
      priority: "P2",
      title: "Prévoir les échéances fournisseurs des 7 prochains jours",
      reason: "Le montant à venir est connu : il doit être anticipé avant de décider de nouvelles sorties d’argent.",
      actionLabel: "Préparer les échéances",
      target: "Factures fournisseurs",
      amount: dueSoon.amount,
    });
  }

  const unusualExpense = alertById(alerts, "unusual-expense");
  if (unusualExpense) {
    decisions.push({
      id: "decision-unusual-expense",
      priority: "P2",
      title: "Contrôler la dépense inhabituelle récente",
      reason: "Son montant dépasse nettement le niveau habituel observé dans les dépenses manuelles récentes.",
      actionLabel: "Vérifier la dépense",
      target: "Dépenses",
      amount: unusualExpense.amount,
    });
  }

  const momentum = alertById(alerts, "sales-momentum");
  if (momentum) {
    decisions.push({
      id: "decision-sales-momentum",
      priority: "OPPORTUNITÉ",
      title: "Analyser le produit ou l’offre qui accélère",
      reason: "Les livraisons récentes ont nettement augmenté par rapport aux 14 jours précédents. Vérifier marge, capacité fournisseur et continuité commerciale.",
      actionLabel: "Analyser les ventes",
      target: "Rapports",
      amount: momentum.amount,
    });
  }

  if (!staleOrders && pilotage.pendingOrders > 0) {
    decisions.push({
      id: "decision-fresh-pending-orders",
      priority: "P2",
      title: `Traiter ${pilotage.pendingOrders} nouvelle${pilotage.pendingOrders > 1 ? "s" : ""} commande${pilotage.pendingOrders > 1 ? "s" : ""}`,
      reason: "Elles sont encore dans le délai normal, mais les confirmer rapidement accélère la préparation.",
      actionLabel: "Voir les commandes",
      target: "Commandes",
      amount: pilotage.pendingValue,
    });
  }

  if (pilotage.confirmedOrders > 0) {
    decisions.push({
      id: "decision-confirmed-orders",
      priority: "P2",
      title: `Préparer ${pilotage.confirmedOrders} commande${pilotage.confirmedOrders > 1 ? "s" : ""} confirmée${pilotage.confirmedOrders > 1 ? "s" : ""}`,
      reason: "Ces commandes ont déjà été confirmées et peuvent passer à la préparation puis à l’expédition.",
      actionLabel: "Préparer les commandes",
      target: "Commandes",
      amount: pilotage.confirmedValue,
    });
  }

  if (pilotage.transitOrders > 0) {
    decisions.push({
      id: "decision-transit-orders",
      priority: "P3",
      title: `Suivre ${pilotage.transitOrders} colis en transit`,
      reason: "Un contrôle rapide permet de repérer les retards ou anomalies de livraison avant qu’ils deviennent des retours.",
      actionLabel: "Suivre les colis",
      target: "Colis",
    });
  }

  const rank: Record<DecisionPriority, number> = { P1: 0, P2: 1, P3: 2, "OPPORTUNITÉ": 3 };
  return decisions
    .sort((a, b) => rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title, "fr"))
    .slice(0, 5);
}
