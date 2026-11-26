import Link from "next/link";
import { Card, StatusChip } from "./ui";
import { q } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { label } from "@/lib/options";
import { compareOffer } from "@/lib/suppliers";

/**
 * Compares every supplier offering this product, for the quantity this customer needs.
 * It never picks a winner: price is shown next to minimum order, stock, delivery time, terms and checks.
 */
export async function SupplierComparison({ productId, neededQty, unit, qtySource }: { productId: string; neededQty: number; unit: string; qtySource: string }) {
  const [offers, prices] = await Promise.all([
    q(
      `select o.*, s.display_name, s.verification_status, s.payment_terms, s.return_policy, s.export_capable, s.currency as supplier_currency
       from supplier_offer o join supplier s on s.id = o.supplier_id
       where o.product_id = $1 and o.is_active and s.archived_at is null and s.verification_status <> 'rejected'`,
      [productId],
    ),
    q("select p.* from supplier_price p join supplier_offer o on o.id = p.offer_id where o.product_id = $1", [productId]),
  ]);
  const rows = offers.map((o) => ({ o, c: compareOffer(o, prices.filter((p) => p.offer_id === o.id), neededQty) }));
  const currencies = new Set(rows.map((r) => r.c.tier?.currency).filter(Boolean));
  // Within one currency, show the lowest total first. Rows without a current price go last.
  rows.sort((a, b) => (a.c.total == null ? 1 : b.c.total == null ? -1 : a.c.tier!.currency === b.c.tier!.currency ? a.c.total - b.c.total : 0));

  return (
    <Card title="Suppliers who sell this" action={<span className="text-xs text-muted">For {fmtNum(neededQty)} {unit}s ({qtySource})</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No supplier offers this product yet. Add it to a supplier on their <Link href="/suppliers" className="text-brand">supplier page</Link> and link it to this product.
        </p>
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-2 font-medium">Supplier</th>
                  <th className="py-2 pr-2 text-right font-medium">Price each</th>
                  <th className="py-2 pr-2 text-right font-medium">You would buy</th>
                  <th className="py-2 pr-2 text-right font-medium">Total incl. local delivery</th>
                  <th className="py-2 pr-2 font-medium">Stock</th>
                  <th className="py-2 pr-2 text-right font-medium">Days</th>
                  <th className="py-2 font-medium">Terms</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ o, c }) => (
                  <tr key={o.id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-2">
                      <Link href={`/suppliers/${o.supplier_id}?tab=products`} className="font-medium text-brand">
                        {o.display_name}
                      </Link>
                      <div className="mt-0.5">
                        <StatusChip status={o.verification_status} />
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {c.tier ? (
                        <>
                          {fmtNum(c.tier.unit_price, 2)} {c.tier.currency}
                          <div className="text-xs text-muted">level {fmtNum(c.tier.min_qty)}+</div>
                        </>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">no price today</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {fmtNum(c.buyQty)}
                      {!c.moqOk && <div className="text-xs text-amber-700 dark:text-amber-300">minimum is {fmtNum(o.moq)}</div>}
                    </td>
                    <td className="py-2 pr-2 text-right font-medium tabular-nums">
                      {c.total != null ? `${fmtNum(c.total, 2)} ${c.tier!.currency}` : "—"}
                      {c.delivery > 0 && <div className="text-xs font-normal text-muted">incl. {fmtNum(c.delivery, 2)} delivery</div>}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={c.stockOk === false ? "text-red-700 dark:text-red-300" : ""}>{label(o.stock_status)}</span>
                      {o.available_qty != null && <div className="text-xs text-muted">{fmtNum(o.available_qty)} available</div>}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{o.lead_time_days ?? "—"}</td>
                    <td className="py-2 text-xs text-muted">
                      {[o.payment_terms && `Pay: ${o.payment_terms}`, (o.return_terms || o.return_policy) && `Returns: ${o.return_terms || o.return_policy}`, o.warranty && `Warranty: ${o.warranty}`, o.export_capable === "yes" && "Exports"].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            This is a comparison, not a recommendation. The cheapest is not always the best — check whether the supplier is verified, has stock, and gives fair terms.
            {currencies.size > 1 && " These suppliers use different currencies, so totals can't be compared directly."}
            {" "}Shipping to Ethiopia and import costs are not included yet.
          </p>
        </>
      )}
    </Card>
  );
}
