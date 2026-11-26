import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtDate, fmtNum } from "@/lib/format";
import { CHARGE_LABELS, quoteTotals } from "@/lib/quote-math";

export const dynamic = "force-dynamic";

/** Clean, customer-facing quote. Shows no internal costs, supplier names or margins. */
export default async function PrintQuotePage({ params }: PageProps<"/quotes/[id]/print">) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const qt = await one("select cq.*, b.trading_name from customer_quote cq join business b on b.id = cq.business_id where cq.id = $1", [id]);
  if (!qt) notFound();
  const lines = await q("select description, qty, unit_price from customer_quote_line where quote_id = $1", [id]);
  const t = quoteTotals(qt, lines);
  const cur = qt.currency;
  return (
    <main className="mx-auto max-w-2xl bg-white p-8 text-black print:p-0">
      <div className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Price offer</h1>
          <p className="text-sm text-neutral-600">
            {qt.code}
            {qt.revision_no > 1 && ` (version ${qt.revision_no})`} · {fmtDate(qt.sent_at ?? qt.created_at)}
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="text-neutral-600">For</div>
          <div className="font-medium">{qt.trading_name}</div>
        </div>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-600">
            <th className="py-2 font-medium">Product</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Price each</th>
            <th className="py-2 text-right font-medium">Amount ({cur})</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-neutral-200">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right">{fmtNum(l.qty)}</td>
              <td className="py-2 text-right">{fmtNum(l.unit_price, 2)}</td>
              <td className="py-2 text-right">{fmtNum(Number(l.qty) * Number(l.unit_price), 2)}</td>
            </tr>
          ))}
          {CHARGE_LABELS.filter(([k]) => Number(qt[k]) > 0).map(([k, lbl]) => (
            <tr key={k} className="border-b border-neutral-200">
              <td className="py-2" colSpan={3}>
                {k === "other_charge" && qt.other_charge_label ? qt.other_charge_label : lbl}
              </td>
              <td className="py-2 text-right">{fmtNum(qt[k], 2)}</td>
            </tr>
          ))}
          <tr>
            <td className="py-3 text-base font-semibold" colSpan={3}>
              Total
            </td>
            <td className="py-3 text-right text-base font-semibold">
              {fmtNum(t.total, 2)} {cur}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-6 space-y-2 text-sm">
        {qt.payment_terms && <p><strong>Payment:</strong> {qt.payment_terms}</p>}
        {qt.delivery_estimate && <p><strong>Delivery:</strong> {qt.delivery_estimate}</p>}
        {qt.included && <p><strong>Included:</strong> {qt.included}</p>}
        {qt.exclusions && <p><strong>Not included:</strong> {qt.exclusions}</p>}
        {qt.uncertain && <p><strong>Not certain yet:</strong> {qt.uncertain}</p>}
        {qt.valid_until && <p><strong>This price is valid until {fmtDate(qt.valid_until)}.</strong></p>}
        <p className="pt-2 text-neutral-600">Amounts marked “estimate” may change; we will tell you before any change.</p>
      </div>
    </main>
  );
}
