// Textes d'accueil par défaut de la boutique (modifiables dans le logiciel → Boutique).
// Les anciens textes par défaut, trop longs, sont remplacés automatiquement s'ils n'ont
// jamais été personnalisés.
type Lang = "fr" | "ar" | "en";

export const HERO_DEFAULTS: Record<Lang, { title: string; text: string }> = {
  fr: { title: "Montres, bijoux et portefeuilles.", text: "À offrir ou à s'offrir. Livrés partout au Maroc, payés à la réception." },
  ar: { title: "ساعات، مجوهرات ومحافظ.", text: "للإهداء أو لنفسك. توصيل إلى جميع أنحاء المغرب والدفع عند الاستلام." },
  en: { title: "Watches, jewellery and wallets.", text: "To give or to keep. Delivered across Morocco, paid on delivery." },
};

const LEGACY_DEFAULTS: Record<Lang, { title: string; text: string }> = {
  fr: { title: "Les pièces que vous aimez, simplement livrées chez vous.", text: "Choisissez vos articles, validez votre commande en ligne et payez à la livraison. Notre équipe vous contacte ensuite pour confirmer." },
  ar: { title: "قطع أنيقة تحبها، تصل إليك بكل بساطة.", text: "اختر منتجاتك وأرسل طلبك عبر الموقع. سيتواصل معك فريقنا لتأكيد الطلب قبل التجهيز، والدفع عند الاستلام." },
  en: { title: "Pieces you love, delivered simply to your door.", text: "Choose your items and place your order online. Our team will contact you to confirm it before preparation, with cash on delivery." },
};

export function heroCopy(stored: string | null | undefined, lang: Lang, field: "title" | "text") {
  const value = stored?.trim() || "";
  if (!value || value === LEGACY_DEFAULTS[lang][field]) return HERO_DEFAULTS[lang][field];
  return value;
}

// « À propos de nous » : texte par défaut dans le ton de la charte (doux, élégant, phrases brèves).
// À personnaliser dans le logiciel → Boutique → Identité → À propos de nous.
export const ABOUT_DEFAULTS: Record<Lang, { title: string; text: string }> = {
  fr: {
    title: "Le détail qui fait tout.",
    text: "Maison Jiya, c'est l'envie de rendre l'élégance simple et accessible. Nous choisissons des montres, des bijoux et des portefeuilles pour leur allure et leur finition : des pièces qui accompagnent un rendez-vous, un cadeau, un instant qui compte.\n\nNotre équipe confirme chaque commande par téléphone avant l'envoi. Nous livrons partout au Maroc et vous payez à la réception.",
  },
  ar: {
    title: "التفاصيل تصنع الفرق.",
    text: "ميزون جيا هي رغبة في جعل الأناقة بسيطة وفي متناول الجميع. نختار الساعات والمجوهرات والمحافظ لجمالها وجودة تشطيبها: قطع ترافق موعدًا، هدية، أو لحظة مهمة.\n\nيؤكد فريقنا كل طلب عبر الهاتف قبل الإرسال. نوصل إلى جميع أنحاء المغرب والدفع عند الاستلام.",
  },
  en: {
    title: "The detail that makes it.",
    text: "Maison Jiya is about making elegance simple and within reach. We choose watches, jewellery and wallets for their look and finish: pieces for a date, a gift, a moment that matters.\n\nOur team confirms every order by phone before shipping. We deliver across Morocco and you pay on delivery.",
  },
};

export function aboutCopy(stored: string | null | undefined, lang: Lang, field: "title" | "text") {
  return stored?.trim() || ABOUT_DEFAULTS[lang][field];
}
