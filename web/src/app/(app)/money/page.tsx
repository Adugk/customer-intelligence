import Link from "next/link";
import { Card, DateInput, Empty, ErrorNote, Field, NumberInput, PageHeader, Select, Submit, Text } from "@/components/ui";
import { addRate } from "@/lib/actions/quotes";
import { q } from "@/lib/db";
import { fmtDate, fmtNum, todayISO } from "@/lib/format";
import { allRates } from "@/lib/money";
import { label, OPT } from "@/lib/options";
import { orderMoney } from "@/lib/orders";

export default async function MoneyPage({ searchParams }: PageProps<"/money">) {
  const sp = await searchParams;
  const [rates, payments, openOrders, pos] = await Promise.all([
    allRates(),
    q(
      `select p.*, b.trading_name, s.display_name, o.code as order_code, po.code as po_code from payment p
       left join business b on b.id = p.business_id left join supplier s on s.id = p.supplier_id
       left join customer_order o on o.id = p.order_id left join purchase_order po on po.id = p.po_id
       order by p.paid_on desc, p.created_at desc limit 30`,
    ),
    q("select o.id, o.code, o.status, b.trading_name from customer_order o join business b on b.id = o.business_id where o.status <> 'closed'"),
    q(
      `select po.id, po.code, po.currency, s.display_name,
         (select coalesce(sum(qty * unit_price),0) from purchase_order_line where po_id = po.id) as total,
         (select coalesce(sum(case when direction = 'out' then amount else -amount end),0) from payment where po_id = po.id and status = 'completed') as paid
       from purchase_order po join supplier s on s.id = po.supplier_id where po.status not in ('draft','cancelled')`,
    ),
  ]);
  const owed: { id: string; code: string; trading_name: string; owed: number }[] = [];
  const refunds: { id: string; code: string; trading_name: string; owed: number }[] = [];
  for (const o of openOrders) {
    const m = await orderMoney(o.id);
    if (o.status === "cancelled") {
      if (m.owedEtb < -1) refunds.push({ id: o.id, code: o.code, trading_name: o.trading_name, owed: -m.owedEtb });
    } else if (m.owedEtb > 1) owed.push({ id: o.id, code: o.code, trading_name: o.trading_name, owed: m.owedEtb });
  }
  const supplierOwed = pos.filter((p) => Number(p.total) - Number(p.paid) > 0.01);

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Money" subtitle="Exchange rates, payments and who owes what. This is for running orders — it does not replace your accounting software." />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Customers owe you">
          {owed.length ? (
            <ul className="space-y-1 text-sm">
              {owed.map((o) => (
                <li key={o.id} className="flex justify-between gap-2">
                  <Link href={`/orders/${o.id}`} className="text-brand">
                    {o.trading_name} · {o.code}
                  </Link>
                  <span className="tabular-nums">{fmtNum(o.owed, 2)} ETB</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing owed.</Empty>
          )}
          {refunds.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Refunds you still owe customers</h3>
              <ul className="space-y-1 text-sm">
                {refunds.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <Link href={`/orders/${o.id}`} className="text-brand">
                      {o.trading_name} · {o.code}
                    </Link>
                    <span className="tabular-nums">{fmtNum(o.owed, 2)} ETB</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card title="You owe suppliers">
          {supplierOwed.length ? (
            <ul className="space-y-1 text-sm">
              {supplierOwed.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link href={`/purchase-orders/${p.id}`} className="text-brand">
                    {p.display_name} · {p.code}
                  </Link>
                  <span className="tabular-nums">
                    {fmtNum(Number(p.total) - Number(p.paid), 2)} {p.currency}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing owed.</Empty>
          )}
        </Card>
      </div>

      <Card title="Exchange rates">
        <p className="mb-3 text-sm text-muted">Enter the rate you actually use. Old rates are kept — every quote, order and payment remembers the rate it used.</p>
        <form action={addRate} className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="1 of">
            <Select name="from_currency" options={OPT.currency} defaultValue="AED" blank={false} />
          </Field>
          <Field label="= how many">
            <NumberInput name="rate" />
          </Field>
          <Field label="of">
            <Select name="to_currency" options={OPT.currency} defaultValue="ETB" blank={false} />
          </Field>
          <Field label="Date">
            <DateInput name="rate_date" defaultValue={todayISO()} />
          </Field>
          <Field label="Source" className="col-span-2">
            <Text name="source" placeholder="e.g. Bank, exchange office" />
          </Field>
          <Submit className="col-span-2 sm:w-fit">Save rate</Submit>
        </form>
        {rates.length ? (
          <ul className="space-y-1 text-sm">
            {rates.map((r) => (
              <li key={r.id}>
                {fmtDate(r.rate_date)} — 1 {r.from_currency} = <strong className="tabular-nums">{fmtNum(r.rate, 4)}</strong> {r.to_currency}
                {r.source && <span className="text-muted"> · {r.source}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No rates yet. Add one before pricing in another currency.</Empty>
        )}
      </Card>

      <Card title="Recent payments">
        {payments.length ? (
          <ul className="divide-y divide-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className={`flex flex-wrap justify-between gap-2 py-2 ${p.status === "reversed" ? "text-muted line-through" : ""}`}>
                <span>
                  {fmtDate(p.paid_on)} · {p.direction === "in" ? "From" : "To"} {p.trading_name ?? p.display_name} · {label(p.kind)}{" "}
                  {p.order_code && (
                    <Link href={`/orders/${p.order_id}`} className="text-brand">
                      {p.order_code}
                    </Link>
                  )}
                  {p.po_code && (
                    <Link href={`/purchase-orders/${p.po_id}`} className="text-brand">
                      {p.po_code}
                    </Link>
                  )}
                </span>
                <span className="tabular-nums">
                  {p.direction === "in" ? "+" : "−"}
                  {fmtNum(p.amount, 2)} {p.currency}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No payments yet.</Empty>
        )}
      </Card>
    </div>
  );
}
