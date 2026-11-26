import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm, ExpenseList, PaymentForm, PaymentList } from "@/components/money-forms";
import { Area, Card, Chip, DateInput, Details, ErrorNote, Field, NumberInput, PageHeader, StatusChip, Submit, Text } from "@/components/ui";
import { cancelOrder, closeOrder, recordDelivery } from "@/lib/actions/orders";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtDate, fmtDateTime, fmtNum, todayISO } from "@/lib/format";
import { latestRate } from "@/lib/money";
import { label } from "@/lib/options";
import { allocationsWithReceipts, orderMoney } from "@/lib/orders";

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const o = await one(
    "select o.*, b.trading_name, cq.code as quote_code from customer_order o join business b on b.id = o.business_id join customer_quote cq on cq.id = o.customer_quote_id where o.id = $1",
    [id],
  );
  if (!o) notFound();
  const lines = await q("select ol.*, r.code as request_code, r.use_type from customer_order_line ol left join sourcing_request r on r.id = ol.request_id where ol.order_id = $1", [id]);
  const lineIds = lines.map((l) => l.id);
  const [pos, payments, expenses, history, money, rate] = await Promise.all([
    q(
      `select pl.id as po_line_id, po.id, po.code, po.status, s.display_name from purchase_allocation a
       join purchase_order_line pl on pl.id = a.po_line_id join purchase_order po on po.id = pl.po_id join supplier s on s.id = po.supplier_id
       where a.order_line_id = any($1::uuid[])`,
      [lineIds],
    ),
    q("select * from payment where order_id = $1 order by paid_on, created_at", [id]),
    q(
      `select e.*, ea.amount_etb as share_etb from expense_allocation ea join expense e on e.id = ea.expense_id where ea.order_id = $1
       order by e.incurred_on`,
      [id],
    ),
    q("select * from order_status_history where order_id = $1 order by changed_at desc", [id]),
    orderMoney(id),
    o.currency === "ETB" ? Promise.resolve(null) : latestRate(o.currency),
  ]);
  const allocs = (await allocationsWithReceipts([...new Set(pos.map((p) => p.po_line_id as string))])).filter((a) => a.order_id === id);
  const per = (lid: string, k: "qty" | "received") => allocs.filter((a) => a.order_line_id === lid).reduce((s, a) => s + Number(k === "qty" ? a.qty : a.received), 0);
  const uniquePos = [...new Map(pos.map((p) => [p.id, p])).values()];
  const cur = o.currency;
  const done = ["closed", "cancelled"].includes(o.status);
  const canDeliver = !done && lines.some((l) => per(l.id, "received") > Number(l.delivered_qty));
  const cancelled = o.status === "cancelled";
  const refundDue = cancelled ? Math.max(0, -money.owedEtb) : 0;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Order ${o.code}`}
        subtitle={
          <>
            <Link href={`/customers/${o.business_id}`} className="text-brand">
              {o.trading_name}
            </Link>{" "}
            · from price <Link href={`/quotes/${o.customer_quote_id}`} className="text-brand">{o.quote_code}</Link> · confirmed {fmtDate(o.confirmed_at)} ({label(o.acceptance).toLowerCase()})
          </>
        }
        back={{ href: "/orders", label: "Orders" }}
      />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <StatusChip status={o.status} />
        {money.owedEtb > 1 && o.status !== "cancelled" && <Chip tone="warn">Customer owes {fmtNum(money.owedEtb, 2)} ETB</Chip>}
        {refundDue > 1 && <Chip tone="danger">Refund due {fmtNum(refundDue, 2)} ETB</Chip>}
      </div>

      <div className="space-y-4">
        <Card title="Products">
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-2 font-medium">Product</th>
                  <th className="py-2 pr-2 text-right font-medium">Ordered</th>
                  <th className="py-2 pr-2 text-right font-medium">Bought from supplier</th>
                  <th className="py-2 pr-2 text-right font-medium">Arrived OK</th>
                  <th className="py-2 pr-2 text-right font-medium">Delivered</th>
                  <th className="py-2 text-right font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line/60">
                    <td className="py-2 pr-2">
                      {l.description}
                      <div className="text-xs text-muted">
                        {l.request_code && (
                          <Link href={`/requests/${l.request_id}`} className="text-brand">
                            {l.request_code}
                          </Link>
                        )}{" "}
                        · {label(l.use_type)}
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtNum(l.qty)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtNum(per(l.id, "qty"))}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtNum(per(l.id, "received"))}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{fmtNum(l.delivered_qty)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtNum(Number(l.qty) * Number(l.unit_price), 2)} {cur}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {uniquePos.length > 0 && (
            <p className="mt-2 text-sm">
              Supplier orders:{" "}
              {uniquePos.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link href={`/purchase-orders/${p.id}`} className="text-brand">
                    {p.code}
                  </Link>{" "}
                  <span className="text-muted">({p.display_name}, {label(p.status).toLowerCase()})</span>
                </span>
              ))}
            </p>
          )}
          {uniquePos.length === 0 && !done && <p className="mt-2 text-sm text-muted">Nothing bought yet. Create the supplier order from the sourcing case (open the request → Finding suppliers).</p>}
        </Card>

        <Card title="Money">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label={cancelled ? `Kept after cancelling (${cur})` : `Customer pays (${cur})`} value={fmtNum(money.revenue, 2)} />
            <Stat label="Paid so far (ETB)" value={fmtNum(money.paidEtb, 2)} />
            {cancelled ? (
              <Stat label="Refund still to pay (ETB)" value={fmtNum(refundDue, 2)} warn={refundDue > 1} />
            ) : (
              <Stat label="Still owed (ETB)" value={fmtNum(Math.max(0, money.owedEtb), 2)} warn={money.owedEtb > 1} />
            )}
            <Stat label="Estimated cost (ETB)" value={money.estCostEtb != null && !cancelled ? fmtNum(money.estCostEtb, 2) : "—"} />
            <Stat label="Actual cost so far (ETB)" value={fmtNum(money.actualCostEtb, 2)} />
            {money.unknown.length && o.status !== "cancelled" ? (
              <Stat label="Profit (ETB)" value="Not known yet" />
            ) : (
              <Stat label={cancelled ? "Result (ETB)" : money.final ? "Profit (final, ETB)" : "Profit so far (ETB)"} value={fmtNum(money.contributionEtb, 2)} />
            )}
          </div>
          {o.status !== "cancelled" && (
            money.unknown.length ? (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <strong>Profit is not final.</strong> Costs not recorded yet: {money.unknown.join(", ")}.
              </p>
            ) : !money.final ? (
              <p className="mt-3 text-sm text-muted">All expected costs are recorded. The profit becomes final when you close the order.</p>
            ) : null
          )}
          <p className="mt-2 text-xs text-muted">
            Actual cost = supplier price of the units bought for this order (at the supplier order&apos;s rate) + this order&apos;s share of recorded costs.{cur !== "ETB" && <> Order rate: 1 {cur} = {fmtNum(money.rate, 4)} ETB.</>}
          </p>
        </Card>

        <Card title="Payments">
          <PaymentList payments={payments} returnTo={`/orders/${id}`} locked={o.status === "closed"} />
          {!["closed"].includes(o.status) && (
            <div className="mt-3">
              <Details summary="+ Record a payment or refund">
                <PaymentForm orderId={id} currency={cur} rate={rate?.rate ?? null} kinds={["part", "full", "deposit", "refund"]} direction={o.status === "cancelled" ? "out" : "in"} />
              </Details>
            </div>
          )}
        </Card>

        <Card title="Costs" action={<span className="text-xs text-muted">Costs shared with other customers are recorded on the supplier order</span>}>
          <ExpenseList expenses={expenses} returnTo={`/orders/${id}`} />
          {!done && (
            <div className="mt-3">
              <Details summary="+ Record a cost">
                <ExpenseForm orderId={id} currency="ETB" rate={null} />
              </Details>
            </div>
          )}
        </Card>

        {canDeliver && (
          <Card title="Record delivery to the customer">
            <form action={recordDelivery} className="space-y-3">
              <input type="hidden" name="order_id" value={id} />
              {lines.map((l) => {
                const ready = per(l.id, "received") - Number(l.delivered_qty);
                return (
                  <Field key={l.id} label={`${l.description} — up to ${fmtNum(Math.max(0, ready))} ready`}>
                    <NumberInput name={`deliver_${l.id}`} defaultValue={ready > 0 ? ready : undefined} />
                  </Field>
                );
              })}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Delivered on">
                  <DateInput name="delivered_on" defaultValue={todayISO()} />
                </Field>
                <Field label="Note">
                  <Text name="note" placeholder="e.g. Handed to owner at shop" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="customer_confirmed" className="h-5 w-5 accent-[var(--brand)]" /> The customer confirmed they received it
              </label>
              <Submit>Save delivery</Submit>
            </form>
          </Card>
        )}
        {o.delivery_note && <p className="whitespace-pre-wrap text-sm text-muted">Delivery: {o.delivery_note}</p>}

        {o.status === "delivered" && (
          <Card title="Close the order">
            <form action={closeOrder} className="space-y-3">
              <input type="hidden" name="order_id" value={id} />
              {money.unknown.length > 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confirm_costs" className="mt-0.5 h-5 w-5 accent-[var(--brand)]" /> There were no other costs ({money.unknown.join(", ")})
                </label>
              )}
              <Field label="Customer feedback (optional)">
                <Area name="feedback" rows={2} />
              </Field>
              <Submit>Close order — profit becomes final</Submit>
            </form>
          </Card>
        )}
        {o.feedback && <p className="text-sm">Customer feedback: {o.feedback}</p>}

        {["confirmed", "buying", "received"].includes(o.status) && (
          <Details summary="Cancel this order">
            <form action={cancelOrder} className="space-y-3">
              <input type="hidden" name="order_id" value={id} />
              <p className="text-sm text-muted">
                Paid so far: {fmtNum(money.paidEtb, 2)} ETB. Enter the amount you may keep under the agreed terms (e.g. costs already spent). The rest is a refund — record it as a refund payment after cancelling.
              </p>
              <Field label="Reason *">
                <Text name="reason" required />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`Amount we keep (${cur})`}>
                  <NumberInput name="non_refundable_amount" />
                </Field>
                <Field label="Why we may keep it">
                  <Text name="non_refundable_reason" />
                </Field>
              </div>
              <button className="btn-danger">Cancel order</button>
            </form>
          </Details>
        )}
        {o.status === "cancelled" && (
          <p className="text-sm text-muted">
            Cancelled: {o.cancelled_reason}
            {Number(o.non_refundable_amount) > 0 && ` · kept ${fmtNum(o.non_refundable_amount, 2)} ${cur} (${o.non_refundable_reason})`}
          </p>
        )}

        <Card title="History">
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-muted">{fmtDateTime(h.changed_at)}</span> — {label(h.status)}
                {h.note && <span className="text-muted"> · {h.note}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label: l, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className={`text-base font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{l}</div>
    </div>
  );
}
