"use client";

import { FormEvent, useState } from "react";

type OrderDraft = {
  customerName: string;
  phone: string;
  city: string;
  products: string;
  quantity: number;
  saleAmount: number;
  productCost: number;
  shippingCost: number;
  adCost: number;
  fees: number;
  source: "WhatsApp";
  status: "En attente";
  carrier: string;
  trackingNumber: string;
  confidence: number;
  warnings: string[];
};

type ApiResult = {
  answer?: string;
  draft?: OrderDraft;
  remaining?: number;
  error?: string;
};

const suggestions = [
  "Quel est mon bénéfice et ma trésorerie ?",
  "Quels produits dois-je réapprovisionner ?",
  "Quelle source apporte le plus de commandes ?",
  "Combien puis-je réinvestir maintenant ?",
];

async function callAi(payload: Record<string, string>) {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json() as ApiResult;
  if (!response.ok) throw new Error(body.error || "L’assistant IA est indisponible.");
  return body;
}

export default function AiPage({
  canEdit,
  submit,
  onOrderCreated,
}: {
  canEdit: boolean;
  submit: (action: string, values: Record<string, FormDataEntryValue>) => Promise<void>;
  onOrderCreated: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [asking, setAsking] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [parserError, setParserError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  async function ask(value = question) {
    const nextQuestion = value.trim();
    if (!nextQuestion || asking) return;
    setQuestion(nextQuestion);
    setAsking(true);
    setAssistantError("");
    try {
      const body = await callAi({ mode: "assistant", question: nextQuestion });
      setAnswer(body.answer || "Aucune réponse reçue.");
      setRemaining(typeof body.remaining === "number" ? body.remaining : null);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "L’assistant IA est indisponible.");
    } finally {
      setAsking(false);
    }
  }

  async function parseOrder() {
    if (!whatsappMessage.trim() || parsing) return;
    setParsing(true);
    setParserError("");
    setDraft(null);
    try {
      const body = await callAi({ mode: "parseOrder", message: whatsappMessage });
      if (!body.draft) throw new Error("La commande n’a pas pu être extraite.");
      setDraft(body.draft);
      setRemaining(typeof body.remaining === "number" ? body.remaining : null);
    } catch (error) {
      setParserError(error instanceof Error ? error.message : "Analyse impossible.");
    } finally {
      setParsing(false);
    }
  }

  function updateDraft<K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setParserError("");
    try {
      await submit("addOrder", {
        customerName: draft.customerName,
        phone: draft.phone,
        city: draft.city,
        products: draft.products,
        quantity: String(draft.quantity),
        saleAmount: String(draft.saleAmount),
        productCost: String(draft.productCost),
        shippingCost: String(draft.shippingCost),
        adCost: String(draft.adCost),
        fees: String(draft.fees),
        source: draft.source,
        status: draft.status,
        carrier: draft.carrier,
        trackingNumber: draft.trackingNumber,
      });
      setWhatsappMessage("");
      setDraft(null);
      onOrderCreated();
    } catch (error) {
      setParserError(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ai-page">
      <section className="ai-intro">
        <div>
          <p className="card-kicker">IA Maison Jiya</p>
          <h2>Analysez votre activité et saisissez vos commandes plus vite</h2>
          <p>L’IA consulte uniquement les indicateurs utiles. Une commande WhatsApp reste modifiable et n’est jamais enregistrée sans votre confirmation.</p>
        </div>
        <div className="ai-limit-badge">
          <span>Protection du quota gratuit</span>
          <strong>{remaining === null ? "24 max." : remaining}</strong>
          <small>{remaining === null ? "demandes partagées par jour" : "demandes restantes aujourd’hui"}</small>
        </div>
      </section>

      <section className="ai-grid">
        <article className="ai-card assistant-card">
          <div className="ai-card-head">
            <span className="ai-card-icon" aria-hidden="true">✦</span>
            <div>
              <p className="card-kicker">Assistant d’analyse</p>
              <h2>Que voulez-vous savoir ?</h2>
              <p>Les réponses utilisent les chiffres enregistrés dans votre plateforme, sans transmettre les noms ni les téléphones des clientes.</p>
            </div>
          </div>
          <div className="ai-suggestions" aria-label="Questions suggérées">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => void ask(suggestion)} disabled={asking}>{suggestion}</button>
            ))}
          </div>
          <label className="ai-textarea-label">
            <span>Votre question</span>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={600} placeholder="Ex. Quelle source est la plus rentable ce mois-ci ?" />
          </label>
          {assistantError && <p className="ai-error" role="alert">{assistantError}</p>}
          <button className="primary-button ai-main-action" type="button" onClick={() => void ask()} disabled={asking || question.trim().length < 3}>
            {asking ? "Analyse en cours…" : "Analyser mes données"}
          </button>
          {answer && (
            <div className="ai-answer" aria-live="polite">
              <span>Réponse de l’assistant</span>
              <p>{answer}</p>
              <small>Conseil indicatif : vérifiez les montants avant toute décision financière.</small>
            </div>
          )}
        </article>

        <article className="ai-card whatsapp-card">
          <div className="ai-card-head">
            <span className="ai-card-icon whatsapp" aria-hidden="true">W</span>
            <div>
              <p className="card-kicker">Saisie intelligente</p>
              <h2>Transformer un message WhatsApp en commande</h2>
              <p>Collez le message reçu. Le téléphone est détecté puis masqué avant l’envoi au modèle d’IA.</p>
            </div>
          </div>
          {!canEdit ? (
            <div className="ai-readonly-note">Votre rôle permet de consulter l’analyse, mais pas de créer une commande.</div>
          ) : (
            <>
              <label className="ai-textarea-label">
                <span>Message WhatsApp</span>
                <textarea value={whatsappMessage} onChange={(event) => setWhatsappMessage(event.target.value)} maxLength={3000} placeholder="Ex. Salma, 0612345678, Casablanca, montre MJ-01, 2 pièces, total 598 MAD…" />
              </label>
              <p className="ai-privacy-note">Ne collez que les informations nécessaires à la commande. Les données extraites doivent être vérifiées avant l’enregistrement.</p>
              {parserError && <p className="ai-error" role="alert">{parserError}</p>}
              <button className="primary-button ai-main-action" type="button" onClick={() => void parseOrder()} disabled={parsing || whatsappMessage.trim().length < 3}>
                {parsing ? "Lecture du message…" : "Préparer la commande"}
              </button>
            </>
          )}
        </article>
      </section>

      {draft && (
        <section className="ai-draft-panel">
          <div className="ai-draft-head">
            <div>
              <p className="card-kicker">Brouillon à confirmer</p>
              <h2>Vérifiez chaque information</h2>
              <p>Aucune commande n’a encore été créée.</p>
            </div>
            <div className="ai-confidence">
              <span>Confiance de lecture</span>
              <strong>{draft.confidence}%</strong>
              <i><b style={{ width: `${draft.confidence}%` }} /></i>
            </div>
          </div>
          {draft.warnings.length > 0 && (
            <div className="ai-warnings">
              {draft.warnings.map((warning) => <span key={warning}>À vérifier : {warning}</span>)}
            </div>
          )}
          <form onSubmit={(event) => void createOrder(event)}>
            <div className="ai-draft-grid">
              <AiField label="Nom de la cliente *" value={draft.customerName} onChange={(value) => updateDraft("customerName", value)} required />
              <AiField label="Téléphone *" value={draft.phone} onChange={(value) => updateDraft("phone", value)} type="tel" required />
              <AiField label="Ville *" value={draft.city} onChange={(value) => updateDraft("city", value)} required />
              <AiField label="Produit(s) *" value={draft.products} onChange={(value) => updateDraft("products", value)} required />
              <AiNumber label="Quantité *" value={draft.quantity} onChange={(value) => updateDraft("quantity", Math.max(1, value))} min={1} required />
              <AiNumber label="Vente totale (MAD) *" value={draft.saleAmount} onChange={(value) => updateDraft("saleAmount", value)} required />
              <AiNumber label="Coût produit (MAD)" value={draft.productCost} onChange={(value) => updateDraft("productCost", value)} />
              <AiNumber label="Transport déduit (MAD)" value={draft.shippingCost} onChange={(value) => updateDraft("shippingCost", value)} />
              <AiNumber label="Publicité attribuée (MAD)" value={draft.adCost} onChange={(value) => updateDraft("adCost", value)} />
              <AiNumber label="Autres frais (MAD)" value={draft.fees} onChange={(value) => updateDraft("fees", value)} />
              <AiField label="Transporteur" value={draft.carrier} onChange={(value) => updateDraft("carrier", value)} />
              <AiField label="Numéro de suivi" value={draft.trackingNumber} onChange={(value) => updateDraft("trackingNumber", value)} />
            </div>
            <div className="ai-draft-actions">
              <button className="cancel-button" type="button" onClick={() => setDraft(null)}>Annuler le brouillon</button>
              <button className="primary-button" disabled={saving}>{saving ? "Enregistrement…" : "Confirmer et créer la commande"}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function AiField({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="ai-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function AiNumber({ label, value, onChange, min = 0, required = false }: { label: string; value: number; onChange: (value: number) => void; min?: number; required?: boolean }) {
  return (
    <label className="ai-field">
      <span>{label}</span>
      <input type="number" inputMode="decimal" min={min} value={value} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))} required={required} />
    </label>
  );
}
