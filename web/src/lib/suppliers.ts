// Supplier prices: never overwritten. Each price is a dated row for one quantity level ("tier").
// The current price for a tier is the newest row that is valid today.
import type { Row } from "./db";
import { todayISO, toISODate } from "./format";

export type Tier = { min_qty: number; unit_price: number; currency: string; valid_from: string; valid_until: string | null; tax_note: string | null; source: string | null };

export function currentTiers(prices: Row[], today = todayISO()): Tier[] {
  const best = new Map<number, Row>();
  for (const p of prices) {
    const from = toISODate(p.valid_from)!;
    const until = toISODate(p.valid_until);
    if (from > today || (until && until < today)) continue;
    const qty = Number(p.min_qty);
    const cur = best.get(qty);
    const curFrom = cur ? toISODate(cur.valid_from)! : "";
    if (!cur || from > curFrom || (from === curFrom && new Date(p.recorded_at) > new Date(cur.recorded_at))) best.set(qty, p);
  }
  return [...best.values()]
    .map((p) => ({
      min_qty: Number(p.min_qty), unit_price: Number(p.unit_price), currency: p.currency,
      valid_from: toISODate(p.valid_from)!, valid_until: toISODate(p.valid_until), tax_note: p.tax_note, source: p.source,
    }))
    .sort((a, b) => a.min_qty - b.min_qty);
}

/** Price per unit when buying `qty`: the highest level whose minimum is reached. Null if qty is below every level. */
export function priceFor(tiers: Tier[], qty: number): Tier | null {
  let hit: Tier | null = null;
  for (const t of tiers) if (qty >= t.min_qty) hit = t;
  return hit;
}

export type OfferComparison = {
  tier: Tier | null;
  buyQty: number; // what we would actually have to buy (at least the MOQ)
  goodsTotal: number | null;
  delivery: number;
  total: number | null; // goods + local delivery, in the offer's currency
  moqOk: boolean; // can we buy exactly the quantity needed?
  stockOk: boolean | null;
};

/**
 * What an offer would cost for the quantity a customer needs.
 * If the supplier's minimum order is higher than the need, the comparison uses the minimum and says so.
 */
export function compareOffer(offer: Row, prices: Row[], neededQty: number): OfferComparison {
  const tiers = currentTiers(prices);
  const moq = offer.moq != null ? Number(offer.moq) : null;
  const buyQty = Math.max(neededQty, moq ?? 0);
  const tier = priceFor(tiers, buyQty);
  const goodsTotal = tier ? tier.unit_price * buyQty : null;
  const delivery = offer.local_delivery_charge != null ? Number(offer.local_delivery_charge) : 0;
  const stockOk =
    offer.stock_status === "out_of_stock" ? false
    : offer.available_qty != null ? Number(offer.available_qty) >= buyQty
    : offer.stock_status === "in_stock" ? true
    : null;
  return { tier, buyQty, goodsTotal, delivery, total: goodsTotal != null ? goodsTotal + delivery : null, moqOk: moq == null || neededQty >= moq, stockOk };
}
