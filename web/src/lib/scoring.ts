// Requirement Opportunity Score and qualification rules (design §2.4 and §8.3).
// Every point is explainable; estimates count half, assumptions count zero.
import type { Row } from "./db";
import { addDays, daysBetween, intervalInMonths, todayISO, toISODate } from "./format";
import { basisWeight, label } from "./options";

export type Component = { key: string; label: string; max: number; points: number; raw: number; evidenced: boolean; detail: string };
export type ScoreResult = { score: number; completeness: number; components: Component[] };

export type ScoreContext = {
  problems: Row[]; // sourcing_problem rows linked to this requirement
  contacts: Row[]; // contacts of the business
  product?: Row | null; // matched catalog product
  conditionsCount: number; // buying conditions for this requirement or the whole business
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

// [ASSUMPTION] ETB value bands — recalibrate with real data (design §8.3).
function valueBand(etbPerMonth: number): number {
  if (etbPerMonth > 500000) return 20;
  if (etbPerMonth >= 100000) return 16;
  if (etbPerMonth >= 20000) return 10;
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
    const raw = valueBand(value);
    comps.push({
      key: "value", label: "Demand value", max: 20, raw,
      points: Math.round(raw * w * 10) / 10, evidenced: w > 0,
      detail: `≈ ${Math.round(value).toLocaleString()} ETB / month`,
    });
  } else {
    push("value", "Demand value", 20, 0, null, r.current_unit_price != null && r.price_currency !== "ETB" ? "Price not in ETB" : "Monthly demand or price unknown");
  }

  // 2. Recurrence
  const months = intervalInMonths(r.order_interval_value, r.order_interval_unit);
  let rec = 0;
  if (r.purchase_pattern === "recurring" && months != null) rec = months <= 1 ? 15 : months <= 3 ? 10 : 5;
  else if (r.purchase_pattern === "seasonal") rec = 5;
  push("recurrence", "Recurrence", 15, rec, r.pattern_basis, r.purchase_pattern ? `${label(r.purchase_pattern)}${months ? `, every ${Math.round(months * 10) / 10} mo` : ""}` : "Pattern unknown");

  // 3. Problem severity (highest active, addressable problem on this requirement)
  const probs = ctx.problems.filter((p) => p.status === "active" && (p.addressable_by_us === "yes" || p.addressable_by_us === "possibly"));
  let best: Row | null = null;
  for (const p of probs) {
    const pts = (SEV_POINTS[p.severity] ?? 0) * basisWeight(p.basis);
    const bestPts = best ? (SEV_POINTS[best.severity] ?? 0) * basisWeight(best.basis) : -1;
    if (pts > bestPts) best = p;
  }
  push("problem", "Problem severity", 20, best ? SEV_POINTS[best.severity] ?? 0 : 0, best?.basis ?? null, best ? `${label(best.severity)}: ${label(best.category)}` : "No addressable problem recorded");

  // 4. Timing
  const np = nextPurchase(r);
  let tp = 0;
  let tDetail = "Next purchase unknown";
  if (np.date) {
    const d = daysBetween(todayISO(), np.date);
    if (d < 0) tDetail = "Next purchase date has passed — re-check";
    else {
      tp = d <= 30 ? 15 : d <= 90 ? 10 : d <= 180 ? 5 : 0;
      tDetail = `${np.predicted ? "Predicted" : "Expected"} in ${d} days`;
    }
  }
  push("timing", "Timing", 15, tp, np.basis, tDetail);

  // 5. Willingness to test
  push("willingness", "Willingness to test", 15, WILL_POINTS[r.willingness_to_test] ?? 0, r.willingness_basis, label(r.willingness_to_test ?? "not_asked"));

  // 6. Decision access
  let bestC: Row | null = null;
  for (const c of ctx.contacts) {
    const pts = (AUTH_POINTS[c.purchasing_authority] ?? 0) * basisWeight(c.authority_basis);
    const bestPts = bestC ? (AUTH_POINTS[bestC.purchasing_authority] ?? 0) * basisWeight(bestC.authority_basis) : -1;
    if (pts > bestPts) bestC = c;
  }
  push("decision", "Decision access", 10, bestC ? AUTH_POINTS[bestC.purchasing_authority] ?? 0 : 0, bestC?.authority_basis ?? null, bestC ? `${bestC.name}: ${label(bestC.purchasing_authority)} authority` : "No decision-maker known");

  // 7. Specification clarity (fully within our control → calculated, full weight)
  let spec = 0;
  if (ctx.product && ctx.product.key_specifications) spec = 5;
  else if (ctx.product || (r.category_id && r.brand_requirement)) spec = 2;
  push("spec", "Specification clarity", 5, spec, "calculated", ctx.product ? `Matched to ${ctx.product.code}` : "Not matched to catalog");

  const score = Math.round(comps.reduce((s, c) => s + c.points, 0));
  const completeness = Math.round(comps.reduce((s, c) => s + (c.evidenced ? c.max : 0), 0));
  return { score, completeness, components: comps };
}

export function scoreBand(score: number): { label: string; action: string; cls: string } {
  if (score >= 70) return { label: "Strong", action: "Qualify fully and create an opportunity", cls: "bg-emerald-600 text-white" };
  if (score >= 45) return { label: "Promising", action: "Fill the evidence gaps", cls: "bg-sky-600 text-white" };
  if (score >= 20) return { label: "Early", action: "Light follow-up; re-check before next purchase", cls: "bg-amber-500 text-white" };
  return { label: "Weak / unknown", action: "Park, or do discovery if evidence is low", cls: "bg-slate-400 text-white" };
}

/** Missing evidence for moving a requirement to 'specified' or 'qualified' (design §2.4-A). */
export function qualificationGaps(r: Row, ctx: ScoreContext): { specified: string[]; qualified: string[] } {
  const strong = (b: string | null) => basisWeight(b) > 0; // confirmed/observed/documented/estimate
  const specified: string[] = [];
  if (!r.product_id && !r.category_id) specified.push("Product category or catalog match");
  if (r.qty_per_order == null) specified.push("Quantity per order");
  if (!r.order_interval_value || !r.order_interval_unit) specified.push("Order interval");
  if ((r.qty_per_order != null || r.order_interval_value) && !strong(r.pattern_basis)) specified.push("Purchase pattern needs a basis better than assumption");

  const qualified = [...specified];
  if (!r.product_id) qualified.push("Match to a catalog product");
  if (ctx.conditionsCount === 0) qualified.push("At least one buying condition");
  const np = nextPurchase(r);
  if (!np.date) qualified.push("Next purchase timing");
  const dm = ctx.contacts.some((c) => (c.purchasing_authority === "final" || c.purchasing_authority === "shared") && strong(c.authority_basis));
  if (!dm) qualified.push("A decision-maker engaged (final or shared authority)");
  if (!["open_with_conditions", "agreed_to_sample", "agreed_to_trial_order"].includes(r.willingness_to_test)) qualified.push("Willingness to test (at least 'open with conditions')");
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
  if (r.qty_per_order != null && old(r.pattern_verified_at, 120)) out.push("Purchase pattern");
  const np = toISODate(r.next_purchase_date);
  if (np && np < today) out.push("Next purchase date");
  return out;
}
