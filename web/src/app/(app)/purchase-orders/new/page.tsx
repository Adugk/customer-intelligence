import { notFound } from "next/navigation";
import { Card, DateInput, ErrorNote, Field, NumberInput, PageHeader, Submit, Text } from "@/components/ui";
import { createPurchaseOrder } from "@/lib/actions/orders";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtNum } from "@/lib/format";
import { latestRate } from "@/lib/money";

export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchase-orders/new">) {
  const sp = await searchParams;
  const cid = typeof sp.case === "string" && isUuid(sp.case) ? sp.case : null;
  if (!cid) notFound();
  const c = await one("select * from sourcing_case where id = $1", [cid]);
  if (!c) notFound();
  const sq = c.chosen_quote_id ? await one("select sq.*, s.display_name from supplier_quote sq join supplier s on s.id = sq.supplier_id where sq.id = $1", [c.chosen_quote_id]) : undefined;
  const qlines = sq ? await q("select * from supplier_quote_line where quote_id = $1 order by description", [sq.id]) : [];
  const orderLines = await q(
    `select ol.*, o.code as order_code, b.trading_name,
       ol.qty - coalesce((select sum(a.qty) from purchase_allocation a where a.order_line_id = ol.id), 0) as remaining
     from customer_order_line ol join customer_order o on o.id = ol.order_id join business b on b.id = o.business_id
     join sourcing_request r on r.id = ol.request_id
     where r.sourcing_case_id = $1 and o.status not in ('cancelled','closed')`,
    [cid],
  );
  const open = orderLines.filter((l) => Number(l.remaining) > 0);
  const remainingTotal = open.reduce((s, l) => s + Number(l.remaining), 0);
  const rate = sq && sq.currency !== "ETB" ? await latestRate(sq.currency) : null;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Order from the supplier" subtitle={sq ? `${sq.display_name} · quote ${sq.code}` : c.title} back={{ href: `/cases/${cid}`, label: "Back to sourcing case" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      {!sq ? (
        <p className="text-sm">Choose a supplier quote in the sourcing case first.</p>
      ) : (
        <form action={createPurchaseOrder} className="space-y-4">
          <input type="hidden" name="case_id" value={cid} />
          <Card title="What to buy">
            {qlines.map((ql, i) => {
              const moq = ql.moq != null ? Number(ql.moq) : 0;
              const buy = Math.max(remainingTotal, moq);
              return (
                <div key={ql.id} className="mb-4 space-y-3 rounded-lg bg-surface-2 p-3">
                  <div className="text-sm font-medium">
                    {ql.description} <span className="font-normal text-muted">— quoted {fmtNum(ql.unit_price, 2)} {sq.currency} each{moq ? `, minimum ${fmtNum(moq)}` : ""}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Field label="Units to buy">
                      <NumberInput name={`qty_${ql.id}`} defaultValue={i === 0 ? buy : undefined} />
                    </Field>
                    <Field label={`Price each (${sq.currency})`}>
                      <NumberInput name={`price_${ql.id}`} defaultValue={ql.unit_price} />
                    </Field>
                  </div>
                  {buy > remainingTotal && i === 0 && <p className="text-xs text-amber-700 dark:text-amber-300">The supplier&apos;s minimum is more than customers ordered. The extra {fmtNum(buy - remainingTotal)} {buy - remainingTotal === 1 ? "unit" : "units"} will be spare stock.</p>}
                  <div>
                    <div className="lbl">Units for each customer</div>
                    {open.length === 0 ? (
                      <p className="text-sm text-muted">No confirmed customer order still needs units.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {open.map((ol) => (
                          <Field key={ol.id} label={`${ol.trading_name} · ${ol.order_code} (needs ${fmtNum(ol.remaining)})`}>
                            <NumberInput name={`alloc_${ql.id}_${ol.id}`} defaultValue={i === 0 ? ol.remaining : undefined} />
                          </Field>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
          <Card title="Details">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={`Rate: 1 ${sq.currency} = ? ETB`} hint={rate ? `Latest recorded: ${rate.rate}` : sq.currency === "ETB" ? "Prices are in ETB" : "No rate recorded yet — enter it"}>
                <NumberInput name="rate_to_etb" defaultValue={sq.currency === "ETB" ? 1 : (rate?.rate ?? undefined)} />
              </Field>
              <Field label="Expected ready on">
                <DateInput name="expected_date" />
              </Field>
              <Field label="Notes">
                <Text name="notes" />
              </Field>
            </div>
            {open.length === 0 && (
              <div className="mt-3">
                <Field label="Buying for stock? Say why *" hint="A supplier order normally needs a confirmed customer order.">
                  <Text name="stock_reason" />
                </Field>
              </div>
            )}
          </Card>
          <Submit>Create supplier order (draft)</Submit>
        </form>
      )}
    </div>
  );
}
