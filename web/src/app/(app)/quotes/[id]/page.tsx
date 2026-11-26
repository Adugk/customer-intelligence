import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteFields } from "@/components/quote-fields";
import { Card, DateInput, Details, ErrorNote, Field, NumberInput, PageHeader, Select, StatusChip, Submit, Text } from "@/components/ui";
import { createOrder } from "@/lib/actions/orders";
import { decideQuote, reviseQuote, sendQuote, updateCustomerQuote } from "@/lib/actions/quotes";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtDate, fmtDateTime, fmtNum, todayISO } from "@/lib/format";
import { label, OPT } from "@/lib/options";
import { CHARGE_LABELS, quoteTotals } from "@/lib/quote-math";

export default async function QuotePage({ params, searchParams }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const qt = await one("select cq.*, b.trading_name from customer_quote cq join business b on b.id = cq.business_id where cq.id = $1", [id]);
  if (!qt) notFound();
  const [lines, newer, older, order] = await Promise.all([
    q("select * from customer_quote_line where quote_id = $1", [id]),
    one("select id, code from customer_quote where revision_of_id = $1", [id]),
    qt.revision_of_id ? one("select id, code from customer_quote where id = $1", [qt.revision_of_id]) : Promise.resolve(undefined),
    one("select id, code, status from customer_order where customer_quote_id = $1", [id]),
  ]);
  const t = quoteTotals(qt, lines);
  const expired = qt.valid_until && String(qt.valid_until) < todayISO();
  const cur = qt.currency;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Price ${qt.code}`}
        subtitle={<>{qt.trading_name} · version {qt.revision_no}{older && <> · replaces <Link href={`/quotes/${older.id}`} className="text-brand">{older.code}</Link></>}</>}
        back={qt.sourcing_request_id ? { href: `/requests/${qt.sourcing_request_id}`, label: "Back to request" } : undefined}
        actions={
          <Link href={`/quotes/${id}/print`} className="btn-ghost" target="_blank">
            Printable version
          </Link>
        }
      />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <StatusChip status={qt.status} />
        {qt.valid_until && <span className={`chip ${expired ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "bg-surface-2 text-muted"}`}>Valid until {fmtDate(qt.valid_until)}</span>}
        {qt.sent_at && <span className="chip bg-surface-2 text-muted">Sent {fmtDateTime(qt.sent_at)}</span>}
      </div>
      {newer && (
        <p className="mb-4 rounded-lg bg-surface-2 p-3 text-sm">
          A newer version exists: <Link href={`/quotes/${newer.id}`} className="text-brand">{newer.code}</Link>
        </p>
      )}
      {order && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Order <Link href={`/orders/${order.id}`} className="underline">{order.code}</Link> — {label(order.status)}
        </p>
      )}

      <div className="space-y-4">
        <Card title="What the customer sees">
          <table className="w-full text-sm">
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-line/60">
                  <td className="py-2 pr-2">
                    {fmtNum(l.qty)} × {l.description}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtNum(l.unit_price, 2)} each = {fmtNum(Number(l.qty) * Number(l.unit_price), 2)} {cur}
                  </td>
                </tr>
              ))}
              {CHARGE_LABELS.filter(([k]) => Number(qt[k]) > 0).map(([k, lbl]) => (
                <tr key={k} className="border-b border-line/60">
                  <td className="py-2 pr-2 text-muted">{k === "other_charge" && qt.other_charge_label ? qt.other_charge_label : lbl}</td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtNum(qt[k], 2)} {cur}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-2 font-semibold">Total</td>
                <td className="py-2 text-right text-base font-semibold tabular-nums">
                  {fmtNum(t.total, 2)} {cur}
                </td>
              </tr>
            </tbody>
          </table>
          <dl className="mt-3 space-y-1 text-sm">
            {qt.payment_terms && <div><dt className="inline text-muted">Payment: </dt><dd className="inline">{qt.payment_terms}</dd></div>}
            {qt.delivery_estimate && <div><dt className="inline text-muted">Delivery: </dt><dd className="inline">{qt.delivery_estimate}</dd></div>}
            {qt.included && <div><dt className="inline text-muted">Included: </dt><dd className="inline">{qt.included}</dd></div>}
            {qt.exclusions && <div><dt className="inline text-muted">Not included: </dt><dd className="inline">{qt.exclusions}</dd></div>}
            {qt.uncertain && <div><dt className="inline text-muted">Not certain yet: </dt><dd className="inline">{qt.uncertain}</dd></div>}
          </dl>
        </Card>

        <Card title="Our estimate (private)">
          {t.estCost != null ? (
            <p className="text-sm">
              Estimated cost {fmtNum(t.estCost, 2)} {cur} · estimated margin <strong>{fmtNum(t.estMargin, 2)} {cur}</strong> ({t.total ? Math.round((t.estMargin! / t.total) * 100) : 0}%). This is an estimate — the real figure is worked out on the order from actual costs.
            </p>
          ) : (
            <p className="text-sm text-muted">No supplier cost recorded, so the margin can&apos;t be estimated.</p>
          )}
        </Card>

        {qt.status === "draft" && (
          <>
            <form action={sendQuote} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <input type="hidden" name="quote_id" value={id} />
              <p className="text-sm">Send the printable version to the customer (WhatsApp, Telegram or email), then mark it as sent.</p>
              <button className="btn-primary">Mark as sent</button>
            </form>
            <Details summary="Edit draft">
              <form action={updateCustomerQuote} className="space-y-4">
                <input type="hidden" name="quote_id" value={id} />
                {lines[0] && <input type="hidden" name="line_id" value={lines[0].id} />}
                <QuoteFields qt={qt} line={lines[0]} />
                <Submit>Save draft</Submit>
              </form>
            </Details>
          </>
        )}

        {qt.status === "sent" && !order && (
          <Card title="The customer said yes? Confirm the order">
            <form action={createOrder} className="space-y-3">
              <input type="hidden" name="quote_id" value={id} />
              <fieldset className="space-y-2 text-sm">
                <legend className="lbl">How did they confirm? *</legend>
                {OPT.acceptance.map((a) => (
                  <label key={a} className="flex items-center gap-2">
                    <input type="radio" name="acceptance" value={a} className="h-4 w-4 accent-[var(--brand)]" />
                    {a === "written" ? "In writing (message, email or signed)" : a === "deposit" ? "They paid a deposit" : "They paid in full"}
                  </label>
                ))}
                <p className="text-xs text-muted">A verbal yes is not an order. Wait for writing or a payment.</p>
              </fieldset>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={`Amount paid (${cur})`}>
                  <NumberInput name="pay_amount" />
                </Field>
                <Field label="Paid by">
                  <Select name="pay_method" options={OPT.paymentMethod} />
                </Field>
                <Field label="Receipt / reference">
                  <Text name="pay_reference" />
                </Field>
                <Field label="Date paid">
                  <DateInput name="pay_date" defaultValue={todayISO()} />
                </Field>
              </div>
              <Submit>Confirm order</Submit>
            </form>
          </Card>
        )}

        {["sent", "draft"].includes(qt.status) && !order && (
          <div className="flex flex-wrap gap-2">
            <form action={reviseQuote}>
              <input type="hidden" name="quote_id" value={id} />
              <button className="btn-ghost">Make a new version</button>
            </form>
            {qt.status === "sent" && (
              <Details summary="Customer said no / price expired">
                <form action={decideQuote} className="space-y-3">
                  <input type="hidden" name="quote_id" value={id} />
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="to" value="rejected" defaultChecked className="accent-[var(--brand)]" /> They said no
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="to" value="expired" className="accent-[var(--brand)]" /> No answer, expired
                    </label>
                  </div>
                  <Field label="Why (if they said no) *">
                    <Text name="note" />
                  </Field>
                  <button className="btn-danger">Save</button>
                </form>
              </Details>
            )}
          </div>
        )}
        {qt.decision_note && <p className="text-sm text-muted">Customer&apos;s answer: {qt.decision_note}</p>}
      </div>
    </div>
  );
}
