// Requirement Opportunity Score and qualification rules (design §2.4 and §8.3).
// Every point is explainable; estimates count half, assumptions count zero.
import type { Row } from "./db";
import { addDays, daysBetween, intervalInMonths, todayISO, toISODate } from "./format";
import { authorityLabel, basisWeight, label } from "./options";
import { DEFAULT_SCORE_BANDS, type ScoreBands } from "./settings";

export type Component = { key: string; label: string; max: number; points: number; raw: number; evidenced: boolean; detail: string };
export type ScoreResult = { score: number; completeness: number; components: Component[] };

export type ScoreContext = {
  problems: Row[]; // sourcing_problem rows linked to this requirement
  contacts: Row[]; // contacts of the business
  product?: Row | null; // matched catalog product
  conditionsCount: number; // buying conditions for this requirement or the whole business
  bands?: ScoreBands; // owner's money levels (Settings); defaults if missing
};

export function monthlyDemand(r: Row): { value: number | null; basis: string | null; calculated: boolean } {
  if (r.monthly_demand != null) return { value: Number(r.monthly_demand), basis: r.pattern_basis, calculated: false };
  const months = intervalInMonths(r.order_interval_value, r.order_interval_unit);
  if (r.qty_per_order != null && months) {
    return { value: Number(r.qty_per_order) / months, basis: r.pattern_basis, calculated: true };
  }
  return { value: null, basis: null, calculated: false };
}

/** Next purchase date: stated by the customer, or predicted from last purchase + interval. */
export function nextPurchase(r: Row): { date: string | null; basis: string | null; predicted: boolean } {
  const stated = toISODate(r.next_purchase_date);
  if (stated) return { date: stated, basis: r.next_basis, predicted: false };
  const last = toISODate(r.last_purchase_date);
  const months = intervalInMonths(r.order_interval_value, r.order_interval_unit);
  if (last && months) {
    let d = addDays(last, Math.round(months * 30.44));
    const today = todayISO();
    // roll forward past dates by whole intervals so the prediction stays in the future
    let guard = 0;
    while (d < today && guard++ < 100) d = addDays(d, Math.max(1, Math.round(months * 30.44)));
    return { date: d, basis: r.pattern_basis, predicted: true };
  }
  return { date: null, basis: null, predicted: false };
}

const SEV_POINTS: Record<string, number> = { critical: 20, high: 14, medium: 8, low: 3 };
const AUTH_POINTS: Record<string, number> = { final: 10, shared: 6, recommends_only: 3 };
const WILL_POINTS: Record<string, number> = { agreed_to_trial_order: 15, agreed_to_sample: 12, open_with_conditions: 8 };

// ETB money levels are set by the owner in Settings (design §8.3).
function valueBand(etbPerMonth: number, b: ScoreBands): number {
  if (etbPerMonth > b.b3) return 20;
  if (etbPerMonth >= b.b2) return 16;
  if (etbPerMonth >= b.b1) return 10;
  return 4;
}

export function scoreRequirement(r: Row, ctx: ScoreContext): ScoreResult {
  const comps: Component[] = [];
  const push = (key: string, label: string, max: number, raw: number, basis: string | null, detail: string) => {
    const w = raw > 0 ? basisWeight(basis) : 0;
    comps.push({ key, label, max, raw, points: Math.round(raw * w * 10) / 10, evidenced: raw > 0 && w > 0, detail });
  };

  // 1. Demand value
  const md = monthlyDemand(r);
  if (md.value != null && r.current_unit_price != null && r.price_currency === "ETB") {
    const value = md.value * Number(r.current_unit_price);
    const w = Math.min(basisWeight(md.basis), basisWeight(r.price_basis));
    const raw = valueBand(value, ctx.bands ?? DEFAULT_SCORE_BANDS);
    comps.push({
      key: "value", label: "How much money it's worth", max: 20, raw,
      points: Math.round(raw * w * 10) / 10, evidenced: w > 0,
      detail: `about ${Math.round(value).toLocaleString()} ETB a month`,
    });
  } else {
    push("value", "How much money it's worth", 20, 0, null, r.current_unit_price != null && r.price_currency !== "ETB" ? "Price is not in ETB" : "Monthly quantity or price not known yet");
  }

  // 2. Recurrence
  const months = intervalInMonths(r.order_interval_value, r.order_interval_unit);
  let rec = 0;
  if (r.purchase_pattern === "recurring" && months != null) rec = months <= 1 ? 15 : months <= 3 ? 10 : 5;
  else if (r.purchase_pattern === "seasonal") rec = 5;
  push("recurrence", "Buys again and again", 15, rec, r.pattern_basis, r.purchase_pattern ? `${label(r.purchase_pattern)}${months ? `, every ${Math.round(months * 10) / 10} mo` : ""}` : "Not known yet");

  // 3. Problem severity (highest active, addressable problem on this requirement)
  const probs = ctx.problems.filter((p) => p.status === "active" && (p.addressable_by_us === "yes" || p.addressable_by_us === "possibly"));
  let best: Row | null = null;
  for (const p of probs) {
    const pts = (SEV_POINTS[p.severity] ?? 0) * basisWeight(p.basis);
    const bestPts = best ? (SEV_POINTS[best.severity] ?? 0) * basisWeight(best.basis) : -1;
    if (pts > bestPts) best = p;
  }
  push("problem", "How big their problem is", 20, best ? SEV_POINTS[best.severity] ?? 0 : 0, best?.basis ?? null, best ? `${label(best.severity)}: ${label(best.category)}` : "No problem we can help with yet");

  // 4. Timing
  const np = nextPurchase(r);
  let tp = 0;
  let tDetail = "Next purchase not known yet";
  if (np.date) {
    const d = daysBetween(todayISO(), np.date);
    if (d < 0) tDetail = "The expected date has passed — ask again";
    else {
      tp = d <= 30 ? 15 : d <= 90 ? 10 : d <= 180 ? 5 : 0;
      tDetail = `${np.predicted ? "Worked out:" : "Expected"} in ${d} days`;
    }
  }
  push("timing", "Buying soon", 15, tp, np.basis, tDetail);

  // 5. Willingness to test
  push("willingness", "Will they try us?", 15, WILL_POINTS[r.willingness_to_test] ?? 0, r.willingness_basis, label(r.willingness_to_test ?? "not_asked"));

  // 6. Decision access
  let bestC: Row | null = null;
  for (const c of ctx.contacts) {
    const pts = (AUTH_POINTS[c.purchasing_authority] ?? 0) * basisWeight(c.authority_basis);
    const bestPts = bestC ? (AUTH_POINTS[bestC.purchasing_authority] ?? 0) * basisWeight(bestC.authority_basis) : -1;
    if (pts > bestPts) bestC = c;
  }
  push("decision", "Talking to the decision-maker", 10, bestC ? AUTH_POINTS[bestC.purchasing_authority] ?? 0 : 0, bestC?.authority_basis ?? null, bestC ? `${bestC.name} (can decide: ${authorityLabel(bestC.purchasing_authority)})` : "Decision-maker not known yet");

  // 7. Specification clarity (fully within our control → calculated, full weight)
  let spec = 0;
  if (ctx.product && ctx.product.key_specifications) spec = 5;
  else if (ctx.product || (r.category_id && r.brand_requirement)) spec = 2;
  push("spec", "Exact product known", 5, spec, "calculated", ctx.product ? `Linked to ${ctx.product.name}` : "Not linked to your product list");

  const score = Math.round(comps.reduce((s, c) => s + c.points, 0));
  const completeness = Math.round(comps.reduce((s, c) => s + (c.evidenced ? c.max : 0), 0));
  return { score, completeness, components: comps };
}

export function scoreBand(score: number): { label: string; action: string; cls: string } {
  if (score >= 70) return { label: "High priority", action: "Worth acting on now — prepare an offer", cls: "bg-emerald-600 text-white" };
  if (score >= 45) return { label: "Good", action: "Promising — fill in what's missing", cls: "bg-sky-600 text-white" };
  if (score >= 20) return { label: "Early", action: "Keep in touch and check again before they next buy", cls: "bg-amber-500 text-white" };
  return { label: "Low", action: "Low for now — ask more questions or leave it", cls: "bg-slate-400 text-white" };
}

/** Missing evidence for moving a requirement to 'specified' or 'qualified' (design §2.4-A). */
export function qualificationGaps(r: Row, ctx: ScoreContext): { specified: string[]; qualified: string[] } {
  const strong = (b: string | null) => basisWeight(b) > 0; // confirmed/observed/documented/estimate
  const specified: string[] = [];
  if (!r.product_id && !r.category_id) specified.push("A category, or a link to your product list");
  if (r.qty_per_order == null) specified.push("How many they buy each time");
  if (!r.order_interval_value || !r.order_interval_unit) specified.push("How often they buy");
  if ((r.qty_per_order != null || r.order_interval_value) && !strong(r.pattern_basis)) specified.push("Quantity and frequency must come from the customer, not our guess");

  const qualified = [...specified];
  if (!r.product_id) qualified.push("Link to your product list");
  if (ctx.conditionsCount === 0) qualified.push("At least one of their conditions");
  const np = nextPurchase(r);
  if (!np.date) qualified.push("When they will buy next");
  const dm = ctx.contacts.some((c) => (c.purchasing_authority === "final" || c.purchasing_authority === "shared") && strong(c.authority_basis));
  if (!dm) qualified.push("A person who can decide to buy");
  if (!["open_with_conditions", "agreed_to_sample", "agreed_to_trial_order"].includes(r.willingness_to_test)) qualified.push("“Will they try us?” answered with at least “Maybe, with conditions”");
  return { specified, qualified };
}

/** Staleness rules from design §2.3. Returns the names of stale groups. */
export function staleGroups(r: Row): string[] {
  const today = todayISO();
  const old = (d: unknown, days: number) => {
    const iso = toISODate(d);
    return iso ? daysBetween(iso, today) > days : false;
  };
  const out: string[] = [];
  if (r.current_unit_price != null && old(r.price_verified_at, 60)) out.push("Price");
  if (r.current_stock_status && old(r.stock_verified_at, 30)) out.push("Stock");
  if (r.qty_per_order != null && old(r.pattern_verified_at, 120)) out.push("Quantity and frequency");
  const np = toISODate(r.next_purchase_date);
  if (np && np < today) out.push("Next purchase date");
  return out;
}
