// Order calculations: received quantities, allocation limits, money and profit.
// Everything is calculated from records — nothing here is typed in by hand.
import { q, type QueryFn, type Row } from "./db";

/** Requirements before a request can move to "Ready to find suppliers" (design §5.1). */
export function requestReadyGaps(r: Row): string[] {
  const gaps: string[] = [];
  if (!r.description) gaps.push("what the product is");
  if (!(Number(r.quantity) > 0)) gaps.push("quantity");
  if (r.use_type === "unsure") gaps.push("whether it is for personal use or business");
  if (!r.needed_by) gaps.push("when they need it");
  return gaps;
}

export const OPEN_REQUEST = ["new", "needs_details", "ready", "finding_suppliers", "quote_sent"];

/**
 * Received quantity per allocation. Goods received on a supplier-order line are shared out
 * to allocations in the order they were made (first allocated, first filled).
 */
export async function allocationsWithReceipts(poLineIds: string[], run: QueryFn = q): Promise<(Row & { received: number })[]> {
  if (!poLineIds.length) return [];
  const [allocs, recs] = await Promise.all([
    run("select a.*, ol.order_id, ol.description as order_line_description from purchase_allocation a join customer_order_line ol on ol.id = a.order_line_id where a.po_line_id = any($1::uuid[]) order by a.created_at", [poLineIds]),
    run("select po_line_id, coalesce(sum(qty_received - qty_damaged - qty_wrong), 0) as good from receipt_line where po_line_id = any($1::uuid[]) group by po_line_id", [poLineIds]),
  ]);
  const left = new Map<string, number>(recs.map((r) => [r.po_line_id as string, Math.max(0, Number(r.good))]));
  return allocs.map((a) => {
    const avail = left.get(a.po_line_id) ?? 0;
    const got = Math.min(Number(a.qty), avail);
    left.set(a.po_line_id, avail - got);
    return { ...a, received: got } as Row & { received: number };
  });
}

export type OrderMoney = {
  currency: string;
  rate: number;
  goodsTotal: number; // what the customer pays for products (order currency)
  charges: number; // service fee + transport + duty + delivery + other charged to the customer
  revenue: number; // order currency
  revenueEtb: number;
  paidEtb: number; // money in minus refunds out
  owedEtb: number;
  estCostEtb: number | null; // from the quote estimates
  actualGoodsEtb: number; // supplier cost of allocated units
  actualExpensesEtb: number;
  actualCostEtb: number;
  contributionEtb: number;
  unknown: string[]; // costs not yet recorded — profit is not final while this is non-empty
  final: boolean;
};

export async function orderMoney(orderId: string, run: QueryFn = q): Promise<OrderMoney> {
  const o = (await run("select * from customer_order where id = $1", [orderId]))[0];
  const lines = await run("select * from customer_order_line where order_id = $1", [orderId]);
  const lineIds = lines.map((l) => l.id);
  const [allocs, pays, exps, quote] = await Promise.all([
    lineIds.length
      ? run(
          `select a.qty, pl.unit_price, po.rate_to_etb from purchase_allocation a
           join purchase_order_line pl on pl.id = a.po_line_id join purchase_order po on po.id = pl.po_id
           where a.order_line_id = any($1::uuid[]) and po.status <> 'cancelled'`,
          [lineIds],
        )
      : Promise.resolve([] as Row[]),
    run("select direction, kind, amount, rate_to_etb from payment where order_id = $1 and status = 'completed'", [orderId]),
    run("select ea.amount_etb, e.category from expense_allocation ea join expense e on e.id = ea.expense_id where ea.order_id = $1", [orderId]),
    run("select * from customer_quote where id = $1", [o.customer_quote_id]),
  ]);
  const rate = Number(o.rate_to_etb) || 1;
  const goodsTotal = lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
  const charges = ["service_fee", "transport_charge", "duty_charge", "local_delivery_charge", "other_charge"].reduce((s, k) => s + Number(o[k] ?? 0), 0);
  // A cancelled order only earns what we were allowed to keep (recorded with a reason when cancelling).
  const revenue = o.status === "cancelled" ? Number(o.non_refundable_amount ?? 0) : goodsTotal + charges;
  const paidEtb = pays.reduce((s, p) => s + (p.direction === "in" ? 1 : -1) * Number(p.amount) * Number(p.rate_to_etb), 0);
  const actualGoodsEtb = allocs.reduce((s, a) => s + Number(a.qty) * Number(a.unit_price) * Number(a.rate_to_etb), 0);
  const actualExpensesEtb = exps.reduce((s, e) => s + Number(e.amount_etb), 0);
  const q0 = quote[0];
  // Estimated cost = supplier cost estimates (converted with the quote's rate) + the pass-through charges we expect to pay.
  const quoteRate = q0?.cost_rate_to_quote ? Number(q0.cost_rate_to_quote) : null;
  const estGoods = lines.every((l) => l.est_unit_cost != null) && quoteRate ? lines.reduce((s, l) => s + Number(l.qty) * Number(l.est_unit_cost) * quoteRate, 0) : null;
  const passThrough = Number(o.transport_charge) + Number(o.duty_charge) + Number(o.local_delivery_charge) + Number(o.other_charge);
  const estCostEtb = estGoods != null ? (estGoods + passThrough) * rate : null;

  const unknown: string[] = [];
  const orderedQty = lines.reduce((s, l) => s + Number(l.qty), 0);
  const allocatedQty = allocs.reduce((s, a) => s + Number(a.qty), 0);
  if (o.status !== "cancelled") {
    if (allocatedQty < orderedQty) unknown.push("supplier cost for units not yet ordered from a supplier");
    const cats = new Set(exps.map((e) => e.category));
    if (Number(o.transport_charge) > 0 && !cats.has("international_transport")) unknown.push("international transport");
    if (Number(o.duty_charge) > 0 && !["customs_duty", "import_tax", "clearance"].some((c) => cats.has(c))) unknown.push("customs, taxes or clearance");
    if (Number(o.local_delivery_charge) > 0 && !cats.has("local_delivery")) unknown.push("local delivery");
  }
  const actualCostEtb = actualGoodsEtb + actualExpensesEtb;
  return {
    currency: o.currency, rate, goodsTotal, charges, revenue, revenueEtb: revenue * rate, paidEtb, owedEtb: revenue * rate - paidEtb,
    estCostEtb, actualGoodsEtb, actualExpensesEtb, actualCostEtb, contributionEtb: revenue * rate - actualCostEtb,
    unknown, final: !!o.costs_final && unknown.length === 0,
  };
}

/** Works out the order status from what has actually happened (cancelled and closed are kept as set). */
export async function recalcOrderStatus(orderId: string, run: QueryFn = q, note?: string) {
  const o = (await run("select status from customer_order where id = $1", [orderId]))[0];
  if (!o || ["cancelled", "closed"].includes(o.status)) return;
  const lines = await run("select id, qty, delivered_qty from customer_order_line where order_id = $1", [orderId]);
  const poLines = (await run("select distinct a.po_line_id from purchase_allocation a join customer_order_line ol on ol.id = a.order_line_id where ol.order_id = $1", [orderId])).map((r) => r.po_line_id as string);
  const allocs = (await allocationsWithReceipts(poLines, run)).filter((a) => a.order_id === orderId);
  const allocated = new Map<string, number>();
  const received = new Map<string, number>();
  for (const a of allocs) {
    allocated.set(a.order_line_id, (allocated.get(a.order_line_id) ?? 0) + Number(a.qty));
    received.set(a.order_line_id, (received.get(a.order_line_id) ?? 0) + a.received);
  }
  const all = (f: (l: Row) => boolean) => lines.length > 0 && lines.every(f);
  const status =
    all((l) => Number(l.delivered_qty) >= Number(l.qty)) ? "delivered"
    : lines.some((l) => Number(l.delivered_qty) > 0) ? "part_delivered"
    : all((l) => (received.get(l.id) ?? 0) >= Number(l.qty)) ? "received"
    : allocs.length > 0 ? "buying"
    : "confirmed";
  if (status !== o.status) {
    await run("update customer_order set status = $2, updated_at = now() where id = $1", [orderId, status]);
    await run("insert into order_status_history (order_id, status, note) values ($1,$2,$3)", [orderId, status, note ?? null]);
  }
}

/** Supplier-order status from receipts (draft/sent/confirmed/closed/cancelled are kept as set). */
export async function recalcPoStatus(poId: string, run: QueryFn = q) {
  const po = (await run("select status from purchase_order where id = $1", [poId]))[0];
  if (!po || ["cancelled", "closed", "draft"].includes(po.status)) return;
  const rows = await run(
    `select pl.qty, coalesce((select sum(rl.qty_received) from receipt_line rl where rl.po_line_id = pl.id), 0) as got
     from purchase_order_line pl where pl.po_id = $1`,
    [poId],
  );
  const any = rows.some((r) => Number(r.got) > 0);
  const all = rows.length > 0 && rows.every((r) => Number(r.got) >= Number(r.qty));
  const status = all ? "received" : any ? "part_received" : po.status === "part_received" || po.status === "received" ? "confirmed_by_supplier" : po.status;
  if (status !== po.status) await run("update purchase_order set status = $2, updated_at = now() where id = $1", [poId, status]);
}

export async function setRequestStatus(run: QueryFn, requestId: string, status: string, note?: string | null) {
  const r = (await run("select status from sourcing_request where id = $1", [requestId]))[0];
  if (!r || r.status === status) return;
  await run("update sourcing_request set status = $2, status_reason = coalesce($3, status_reason), updated_at = now() where id = $1", [requestId, status, note ?? null]);
  await run("insert into request_status_history (request_id, status, note) values ($1,$2,$3)", [requestId, status, note ?? null]);
}
