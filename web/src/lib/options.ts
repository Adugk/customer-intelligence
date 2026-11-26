// Standard dropdown values (stored as codes, shown as labels).
// Definitions are in docs/Customer-Module-Design.md, section 4.

export const OPT = {
  businessType: ["retailer", "specialist_retailer", "wholesaler", "distributor", "importer", "service_business", "online_seller", "workshop_manufacturer", "institutional_buyer", "other"],
  sectors: ["cosmetics_beauty", "hair_salon_supplies", "electronics", "mobile_accessories", "footwear", "clothing_apparel", "household", "stationery_office", "auto_parts", "hardware_tools", "medical_pharma", "food_beverage", "other"],
  customerSegment: ["consumers", "businesses", "both"],
  pricePositioning: ["budget", "mid_market", "premium", "mixed", "unknown"],
  salesChannels: ["physical_shop", "wholesale_counter", "telegram", "tiktok", "instagram", "facebook", "website_marketplace", "field_sales", "b2b_contracts"],
  staffSize: ["1-2", "3-5", "6-20", "21-50", "51+", "unknown"],
  yearsOperating: ["<1", "1-3", "3-10", "10+", "unknown"],
  acquisitionSource: ["cold_visit", "referral", "social_media", "inbound_call_message", "personal_network", "event_market", "other"],
  relationshipStage: ["prospect", "contacted", "in_discovery", "qualified", "active_opportunity", "first_order_customer", "repeat_customer", "dormant", "not_a_fit", "do_not_contact"],
  stageOverride: ["dormant", "not_a_fit", "do_not_contact"],
  sourcingStatus: ["well_served", "partially_served", "underserved", "unknown"],
  notAFitReason: ["no_recurring_demand", "products_outside_scope", "too_small", "regulated_products", "already_well_served", "trust_or_ethics_concern", "other"],
  confidentiality: ["standard", "do_not_disclose_relationship", "strict"],
  subCity: ["Addis Ketema", "Akaki Kality", "Arada", "Bole", "Gulele", "Kirkos", "Kolfe Keranio", "Lemi Kura", "Lideta", "Nifas Silk-Lafto", "Yeka"],
  areaSuggestions: ["Merkato", "Piassa", "Bole", "Mexico", "Kazanchis", "Megenagna", "Sar Bet", "CMC", "Arat Kilo", "Saris", "Gerji", "Ayat", "Lebu", "Torhailoch"],
  decisionRoles: ["owner", "purchasing_decision_maker", "payment_approver", "influencer", "gatekeeper", "staff_user", "unknown"],
  purchasingAuthority: ["final", "shared", "recommends_only", "none", "unknown"],
  paymentAuthority: ["final", "shared", "none", "unknown"],
  channel: ["visit", "call", "whatsapp", "telegram", "sms", "email"],
  language: ["amharic", "english", "afaan_oromo", "other"],
  contactPermission: ["allowed_all", "allowed_specific_channels", "asked_not_to_contact", "not_asked"],
  sourceType: ["local_wholesaler", "local_importer", "brand_distributor_ethiopia", "own_direct_import", "import_via_agent_or_traveller", "online_local", "online_international", "manufacturer_direct", "other"],
  importsDirectly: ["yes_regularly", "yes_occasionally", "no", "unknown"],
  restockTrigger: ["when_stock_runs_out", "fixed_schedule", "when_cash_available", "supplier_offer", "seasonal_peaks", "customer_orders"],
  purchaseValueBand: ["under_50k_etb", "50k_200k_etb", "200k_1m_etb", "over_1m_etb", "not_disclosed"],
  paymentMethods: ["cash", "bank_transfer", "mobile_money", "cheque", "supplier_credit", "other"],
  paymentTiming: ["full_prepayment", "deposit_then_balance", "on_delivery", "credit_terms", "mixed", "unknown"],
  goodsReceipt: ["collects_from_supplier", "supplier_delivers", "third_party_transport", "courier"],
  formalReceipt: ["vat_invoice_required", "receipt_required", "not_required", "unknown"],
  constraints: ["cash_flow", "storage_space", "forex_access", "import_permits", "customs_uncertainty", "moq_too_high", "transport", "none_known"],
  unit: ["piece", "pair", "pack", "box", "carton", "dozen", "kg", "litre", "metre", "set"],
  brandRequirement: ["exact_brand_only", "equivalent_brands_ok", "any_meeting_spec"],
  condition: ["new", "refurbished", "used", "any"],
  authenticity: ["genuine_brand_required", "generic_acceptable", "either_with_clear_labelling"],
  purchasePattern: ["recurring", "seasonal", "project_or_one_off", "unknown"],
  intervalUnit: ["day", "week", "month"],
  months: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
  currency: ["ETB", "USD", "AED", "other"],
  yesNoUnknown: ["yes", "no", "unknown"],
  stockStatus: ["in_stock", "low", "out_of_stock", "unknown"],
  stockoutFrequency: ["never", "rarely", "sometimes", "often", "constantly", "unknown"],
  stockoutDuration: ["under_1_week", "1_2_weeks", "2_4_weeks", "1_3_months", "over_3_months", "unknown"],
  stockoutConsequences: ["lost_sales", "customers_go_elsewhere", "buy_locally_at_higher_price", "substitute_product", "service_disrupted", "no_real_impact"],
  datePrecision: ["exact_date", "within_month", "within_quarter"],
  urgency: ["immediate", "soon", "planned", "no_urgency"],
  demandStatus: ["mentioned", "interested", "specified", "qualified", "well_served", "not_pursuing"],
  willingness: ["not_asked", "not_willing", "open_with_conditions", "agreed_to_sample", "agreed_to_trial_order"],
  notPursuingReason: ["no_addressable_problem", "price_unachievable", "volume_too_small", "cannot_source", "regulatory", "customer_declined", "other"],
  sourceOrigin: ["addis_ababa", "elsewhere_in_ethiopia", "uae_dubai", "china", "turkey", "india", "other", "unknown"],
  sourceRole: ["main_source", "secondary_source", "occasional_backup"],
  nameDisclosure: ["disclosed", "declined", "not_asked"],
  relationshipLength: ["<1yr", "1-3yrs", "3yrs+", "unknown"],
  strengths: ["price", "reliability", "credit_terms", "quality", "speed", "range", "relationship_trust", "delivery"],
  satisfaction: ["very_satisfied", "satisfied", "mixed", "dissatisfied", "unknown"],
  problemCategory: ["availability", "stockouts", "price_level", "price_volatility", "moq_too_high", "quality", "authenticity_counterfeit", "wrong_spec_delivered", "delivery_delay", "delivery_unreliable", "communication", "payment_terms", "trust_risk", "forex_import_access", "documentation_receipts", "warranty_returns", "other"],
  problemBasis: ["confirmed", "observed", "documented", "estimate", "assumption"],
  problemFrequency: ["once", "occasional", "recurring", "constant"],
  severity: ["low", "medium", "high", "critical"],
  addressable: ["yes", "possibly", "no", "unknown"],
  problemStatus: ["active", "resolved_by_customer", "resolved_by_us", "no_longer_relevant"],
  conditionType: ["price", "quality_standard", "authenticity_proof", "consistent_availability", "delivery_speed", "delivery_to_premises", "small_orders_accepted", "payment_terms", "warranty", "return_policy", "verify_before_payment", "sample_first", "formal_receipt", "confidentiality", "exclusivity", "packaging_labelling", "other"],
  importance: ["must_have", "important", "nice_to_have"],
  ourPosition: ["can_meet", "can_partially_meet", "cannot_meet", "to_be_assessed"],
  interactionChannel: ["visit", "call", "whatsapp", "telegram", "sms", "email", "meeting_our_office", "third_party_intro"],
  initiatedBy: ["us", "customer", "referrer"],
  purpose: ["introduction", "discovery", "qualification", "follow_up", "quote_discussion", "negotiation", "order", "delivery", "after_sales", "relationship"],
  outcome: ["progressed", "information_gathered", "no_change", "setback", "not_reached"],
  followUpAction: ["call", "visit", "whatsapp", "telegram", "send_information", "send_quote", "check_purchase_timing", "request_sample_feedback", "verify_data"],
  followUpStatus: ["open", "done", "snoozed", "cancelled"],
  followUpOrigin: ["manual", "next_purchase_reminder", "stale_data", "no_response_chase", "our_commitment"],
  oppStage: ["identified", "sourcing", "quoted", "negotiating", "reserved", "confirmed", "in_fulfilment", "delivered", "closed_won", "closed_lost", "cancelled"],
  commitment: ["none", "verbal", "written", "deposit_paid", "fully_paid"],
  lostReason: ["price_too_high", "timing_missed", "spec_or_quality_mismatch", "moq_issue", "trust_not_established", "payment_terms", "incumbent_matched", "no_response", "could_not_source", "other"],
} as const;

/** Provenance basis values — see design §2.3. */
export const BASIS = ["confirmed", "observed", "documented", "estimate", "assumption", "unknown", "not_disclosed"] as const;
export type Basis = (typeof BASIS)[number] | "calculated";

export const BASIS_META: Record<string, { label: string; icon: string; cls: string; weight: number }> = {
  confirmed: { label: "Customer told us", icon: "✔", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200", weight: 1 },
  observed: { label: "We saw it", icon: "👁", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200", weight: 1 },
  documented: { label: "From a document", icon: "📄", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200", weight: 1 },
  calculated: { label: "Worked out by the app", icon: "∑", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", weight: 1 },
  estimate: { label: "Our estimate", icon: "≈", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200", weight: 0.5 },
  assumption: { label: "Our guess", icon: "?", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200", weight: 0 },
  unknown: { label: "Customer doesn't know", icon: "—", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", weight: 0 },
  not_disclosed: { label: "Customer won't say", icon: "🔒", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", weight: 0 },
};

export function basisWeight(b: string | null | undefined): number {
  return b ? (BASIS_META[b]?.weight ?? 0) : 0;
}

const LABEL_OVERRIDES: Record<string, string> = {
  b2b_contracts: "B2B contracts",
  moq_too_high: "MOQ too high",
  vat_invoice_required: "VAT invoice required",
  uae_dubai: "UAE / Dubai",
  under_50k_etb: "Under 50,000 ETB",
  "50k_200k_etb": "50,000–200,000 ETB",
  "200k_1m_etb": "200,000–1,000,000 ETB",
  over_1m_etb: "Over 1,000,000 ETB",
  under_1_week: "Under 1 week",
  "1_2_weeks": "1–2 weeks",
  "2_4_weeks": "2–4 weeks",
  "1_3_months": "1–3 months",
  over_3_months: "Over 3 months",
  rarely: "Rarely (1–2 a year)",
  sometimes: "Sometimes (about quarterly)",
  often: "Often (about monthly)",
  immediate: "Immediate (< 2 weeks)",
  soon: "Soon (< 2 months)",
  planned: "Planned (later)",
  sms: "SMS",
  etb: "ETB",
  tiktok: "TikTok",
  mobile_money: "Mobile money (telebirr, M-PESA)",
  closed_won: "Won (paid in full)",
  closed_lost: "Lost",
  in_fulfilment: "Being bought and shipped",
  reserved: "Verbal yes (not paid)",
  confirmed: "Confirmed order",
  deposit_paid: "Deposit paid",
  fully_paid: "Fully paid",
  verbal: "Verbal yes only",
  written: "Written order",
  none: "Nothing yet",
  not_disclosed: "Customer won't say",
  not_asked: "Not asked yet",
  unknown: "Don't know",
  // product need status
  mentioned: "Mentioned",
  interested: "Interested",
  specified: "Details known",
  qualified: "Ready to quote",
  well_served: "Happy with current supplier",
  partially_served: "Partly happy",
  underserved: "Not happy",
  not_pursuing: "Not following up",
  // customer stage
  prospect: "Not contacted yet",
  contacted: "Contacted",
  in_discovery: "Learning their needs",
  active_opportunity: "Deal in progress",
  first_order_customer: "First-time buyer",
  repeat_customer: "Repeat buyer",
  dormant: "Inactive",
  // will they try us?
  not_willing: "No",
  open_with_conditions: "Maybe, with conditions",
  agreed_to_sample: "Will take a sample",
  agreed_to_trial_order: "Will place a trial order",
  // deal stages
  identified: "New",
  sourcing: "Finding suppliers",
  quoted: "Price sent",
  negotiating: "Negotiating",
  // business types and misc
  service_business: "Service business (salon, barber…)",
  workshop_manufacturer: "Workshop / maker",
  institutional_buyer: "Company or institution",
  inbound_call_message: "They contacted us",
  cold_visit: "We visited them",
  personal_network: "Personal contacts",
  event_market: "Event or market",
  do_not_disclose_relationship: "Don't tell others they buy from us",
  strict: "Keep fully private",
  standard: "Normal",
  import_via_agent_or_traveller: "Through an agent or traveller",
  brand_distributor_ethiopia: "Brand distributor in Ethiopia",
  own_direct_import: "They import themselves",
  must_have: "Must have",
  nice_to_have: "Nice to have",
  information_gathered: "Learned something",
  progressed: "Moved forward",
  setback: "Went backwards",
  not_reached: "Couldn't reach them",
  next_purchase_reminder: "Purchase reminder",
  our_commitment: "Our promise",
  check_purchase_timing: "Ask when they will buy",
  request_sample_feedback: "Ask about the sample",
  verify_data: "Re-check information",
};

export const SEVERITY_HELP: Record<string, string> = {
  low: "Small – just an inconvenience",
  medium: "Medium – costs them money or time",
  high: "Big – they lose sales or customers",
  critical: "Very big – they can't sell that product",
};

/** Words for "Can they decide to buy?" / "Can they approve payment?" (codes shared with other lists, so kept separate). */
export const AUTHORITY_LABELS: Record<string, string> = {
  final: "Yes",
  shared: "Shares the decision",
  recommends_only: "Only advises",
  none: "No",
  unknown: "Don't know",
};
export function authorityLabel(code: string | null | undefined): string {
  return (code && AUTHORITY_LABELS[code]) || "Don't know";
}

/** Simple status colours used everywhere: grey = not started, blue = in progress, amber = needs attention, green = done, red = problem. */
export type Tone = "neutral" | "info" | "warn" | "ok" | "danger" | "brand";
const TONES: Record<string, Tone> = {
  mentioned: "neutral", interested: "info", specified: "info", qualified: "ok", well_served: "neutral", not_pursuing: "neutral",
  prospect: "neutral", contacted: "info", in_discovery: "info", active_opportunity: "info", first_order_customer: "ok", repeat_customer: "ok", dormant: "warn", not_a_fit: "neutral", do_not_contact: "danger",
  identified: "neutral", sourcing: "info", quoted: "info", negotiating: "info", reserved: "warn", confirmed: "ok", in_fulfilment: "ok", delivered: "ok", closed_won: "ok", closed_lost: "danger", cancelled: "danger",
};
export function toneOf(code: string | null | undefined): Tone {
  return (code && TONES[code]) || "neutral";
}

export function label(code: string | null | undefined): string {
  if (code == null || code === "") return "—";
  if (LABEL_OVERRIDES[code]) return LABEL_OVERRIDES[code];
  if (/^[A-Z]/.test(code)) return code;
  const s = code.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}
