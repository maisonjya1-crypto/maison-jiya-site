export type OrderPaymentStatus = "À encaisser" | "Encaissé" | "Non encaissé" | "Remboursé";

type NormalizeOrderPaymentInput = {
  status: string;
  requestedPaymentStatus: OrderPaymentStatus;
  previousPaymentStatus: string;
  paidAt: string | null | undefined;
  refundedAt: string | null | undefined;
  carrierPaid?: boolean;
  now: string;
};

export type NormalizedOrderPayment = {
  paymentStatus: OrderPaymentStatus;
  paidAt: string | null;
  refundedAt: string | null;
};

const terminalWithoutSale = new Set(["Retour", "Annulée"]);

export function normalizeOrderPaymentState(input: NormalizeOrderPaymentInput): NormalizedOrderPayment {
  const wasCollected = input.previousPaymentStatus === "Encaissé"
    || input.previousPaymentStatus === "Remboursé"
    || Boolean(input.paidAt);

  let paymentStatus = input.requestedPaymentStatus;

  if (terminalWithoutSale.has(input.status)) {
    paymentStatus = wasCollected ? "Remboursé" : "Non encaissé";
  } else if (input.carrierPaid && input.status === "Livrée") {
    paymentStatus = "Encaissé";
  }

  if (paymentStatus === "Encaissé") {
    return {
      paymentStatus,
      paidAt: input.paidAt || input.now,
      refundedAt: null,
    };
  }

  if (paymentStatus === "Remboursé") {
    return {
      paymentStatus,
      paidAt: input.paidAt || null,
      refundedAt: input.refundedAt || input.now,
    };
  }

  return {
    paymentStatus,
    paidAt: null,
    refundedAt: null,
  };
}
