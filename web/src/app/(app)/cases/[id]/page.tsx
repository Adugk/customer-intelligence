import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Chip, DateInput, Details, Empty, ErrorNote, Field, NumberInput, PageHeader, Select, StatusChip, Submit, Text } from "@/components/ui";
import { addRequestToCase, addSupplierQuote, chooseSupplierQuote, expireSupplierQuote, removeRequestFromCase } from "@/lib/actions/requests";
import { q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtDate, fmtNum, todayISO } from "@/lib/format";
import { label, OPT } from "@/lib/options";

export default async function CasePage({ params, searchParams }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const c = (await q("select c.*, p.name as product_name from sourcing_case c left join product p on p.id = c.product_id where c.id = $1", [id]))[0];
  if (!c) notFound();
  const [reqs, quotes, lines, suppliers, offers, candidates, orderLines] = await Promise.all([
    q("select r.*, b.trading_name from sourcing_request r join business b on b.id = r.business_id where r.sourcing_case_id = $1 order by r.created_at", [id]),
    q("select sq.*, s.display_name, s.verification_status, s.currency as supplier_currency from supplier_quote sq join supplier s on s.id = sq.supplier_id where sq.sourcing_case_id = $1 order by sq.created_at", [id]),
    q("select l.* from supplier_quote_line l join supplier_quote sq on sq.id = l.quote_id where sq.sourcing_case_id = $1", [id]),
    q("select id, display_name, currency, verification_status from supplier where archived_at is null and verification_status <> 'rejected' order by display_name"),
    c.product_id
      ? q("select o.id, o.offer_name, o.supplier_id, s.display_name from supplier_offer o join supplier s on s.id = o.supplier_id where o.product_id = $1 and o.is_active order by s.display_name", [c.product_id])
      : q("select o.id, o.offer_name, o.supplier_id, s.display_name from supplier_offer o join supplier s on s.id = o.supplier_id where o.is_active order by s.display_name limit 200"),
    c.product_id
      ? q(
          `select r.id, r.code, r.quantity, r.description, b.trading_name from sourcing_request r join business b on b.id = r.business_id
           where r.product_id = $1 and r.sourcing_case_id is null and r.status in ('new','needs_details','ready') and r.use_type <> 'unsure' and r.needed_by is not null`,
          [c.product_id],
        )
      : Promise.resolve([]),
    q("select ol.id from customer_order_line ol join sourcing_request r on r.id = ol.request_id join customer_order o on o.id = ol.order_id where r.sourcing_case_id = $1 and o.status not in ('cancelled','closed')", [id]),
  ]);
  const needed = reqs.filter((r) => !["cancelled", "declined"].includes(r.status)).reduce((s, r) => s + Number(r.quantity), 0);
  const today = todayISO();
  const currencies = new Set(quotes.filter((x) => x.status !== "expired").map((x) => x.currency));

  return (
    <div className="max-w-5xl">
      <PageHeader title={c.title} subtitle={`${c.code} · finding suppliers${c.product_name ? ` · ${c.product_name}` : ""}`} back={reqs[0] ? { href: `/requests/${reqs[0].id}`, label: "Back to request" } : { href: "/requests", label: "Requests" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />

      <div className="space-y-4">
        <Card title={`Customers in this search — ${fmtNum(needed)} needed in total`}>
          <ul className="divide-y divide-line">
            {reqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <Link href={`/requests/${r.id}`} className="font-medium text-brand">
                    {r.trading_name}
                  </Link>{" "}
                  — {fmtNum(r.quantity)} {r.unit}s · {label(r.use_type)} · needed by {fmtDate(r.needed_by)}
                </span>
                <span className="flex items-center gap-2">
                  <StatusChip status={r.status} />
                  {reqs.length > 1 && ["finding_suppliers", "ready"].includes(r.status) && (
                    <form action={removeRequestFromCase}>
                      <input type="hidden" name="case_id" value={id} />
                      <input type="hidden" name="request_id" value={r.id} />
                      <button className="text-xs text-red-700 dark:text-red-300">Remove</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Each customer keeps their own quantity, price and payment. Buying together never merges them into one anonymous order.</p>
          {candidates.length > 0 && (
            <div className="mt-3">
              <Details summary={`+ Add another customer who wants the same product (${candidates.length})`}>
                <form action={addRequestToCase} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="case_id" value={id} />
                  <label className="text-sm">
                    <span className="lbl">Request</span>
                    <select name="request_id" className="inp" required defaultValue="">
                      <option value="" disabled>
                        — Choose —
                      </option>
                      {candidates.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.trading_name} — {fmtNum(x.quantity)} ({x.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn-primary">Add</button>
                </form>
              </Details>
            </div>
          )}
        </Card>

        <Card title="Supplier quotes — compare">
          {quotes.length === 0 ? (
            <Empty>No supplier quotes yet. Ask suppliers for prices, then record each answer below.</Empty>
          ) : (
            <>
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="py-2 pr-2 font-medium">Supplier</th>
                      <th className="py-2 pr-2 font-medium">Offered</th>
                      <th className="py-2 pr-2 text-right font-medium">Total incl. delivery</th>
                      <th className="py-2 pr-2 text-right font-medium">Per unit</th>
                      <th className="py-2 pr-2 text-right font-medium">Days</th>
                      <th className="py-2 pr-2 font-medium">Terms</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((x) => {
                      const ls = lines.filter((l) => l.quote_id === x.id);
                      const qty = ls.reduce((s, l) => s + Number(l.qty), 0);
                      const goods = ls.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
                      const total = goods + Number(x.delivery_charge);
                      const moqTooHigh = ls.some((l) => l.moq != null && Number(l.moq) > needed);
                      const expired = x.valid_until && String(x.valid_until) < today;
                      return (
                        <tr key={x.id} className={`border-b border-line/60 align-top ${x.status === "not_chosen" || x.status === "expired" ? "text-muted" : ""}`}>
                          <td className="py-2 pr-2">
                            <Link href={`/suppliers/${x.supplier_id}`} className="font-medium text-brand">
                              {x.display_name}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              <StatusChip status={x.verification_status} />
                            </div>
                            <div className="text-xs text-muted">
                              {x.code}
                              {x.reference && ` · ref ${x.reference}`}
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            {ls.map((l) => (
                              <div key={l.id}>
                                {fmtNum(l.qty)} × {l.description} @ {fmtNum(l.unit_price, 2)}
                                {l.moq != null && <span className="text-xs text-muted"> (min {fmtNum(l.moq)})</span>}
                              </div>
                            ))}
                            {qty < needed && <div className="text-xs text-amber-700 dark:text-amber-300">Covers {fmtNum(qty)} of {fmtNum(needed)} needed</div>}
                            {moqTooHigh && <div className="text-xs text-amber-700 dark:text-amber-300">Minimum order is more than you need</div>}
                          </td>
                          <td className="py-2 pr-2 text-right font-medium tabular-nums">
                            {fmtNum(total, 2)} {x.currency}
                            {Number(x.delivery_charge) > 0 && <div className="text-xs font-normal text-muted">incl. {fmtNum(x.delivery_charge, 2)} delivery</div>}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{qty ? fmtNum(total / qty, 2) : "—"}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{x.lead_time_days ?? "—"}</td>
                          <td className="py-2 pr-2 text-xs text-muted">
                            {[x.payment_terms && `Pay: ${x.payment_terms}`, x.return_terms && `Returns: ${x.return_terms}`, x.tax_note, x.valid_until && `Valid until ${fmtDate(x.valid_until)}`].filter(Boolean).join(" · ") || "—"}
                            {expired && x.status === "received" && <div className="text-amber-700 dark:text-amber-300">This quote has expired</div>}
                          </td>
                          <td className="py-2">
                            <StatusChip status={x.status} />
                            {x.status === "received" && !expired && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs text-brand">Choose…</summary>
                                <form action={chooseSupplierQuote} className="mt-2 w-56 space-y-2">
                                  <input type="hidden" name="case_id" value={id} />
                                  <input type="hidden" name="quote_id" value={x.id} />
                                  <Text name="reason" required placeholder="Why this supplier? *" />
                                  <button className="btn-primary min-h-9 w-full text-xs">Choose this supplier</button>
                                </form>
                              </details>
                            )}
                            {x.status === "received" && (
                              <form action={expireSupplierQuote} className="mt-1">
                                <input type="hidden" name="case_id" value={id} />
                                <input type="hidden" name="quote_id" value={x.id} />
                                <button className="text-xs text-muted underline">Mark expired</button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted">
                You choose — the app never picks the cheapest automatically. Check the supplier&apos;s checks, minimum order, delivery time and terms too.
                {currencies.size > 1 && " These quotes are in different currencies, so the totals can't be compared directly."} Shipping to Ethiopia and import costs are not included.
              </p>
            </>
          )}
          {c.choice_reason && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              <strong>Chosen:</strong> {quotes.find((x) => x.id === c.chosen_quote_id)?.display_name} — {c.choice_reason}
            </p>
          )}
          <div className="mt-3">
            <Details summary="+ Record a supplier quote" open={quotes.length === 0}>
              <form action={addSupplierQuote} className="space-y-3">
                <input type="hidden" name="case_id" value={id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Supplier *">
                    <select className="inp" name="supplier_id" required defaultValue="">
                      <option value="" disabled>
                        — Choose —
                      </option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display_name} ({label(s.verification_status)})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Currency">
                    <Select name="currency" options={OPT.currency} defaultValue="AED" blank={false} />
                  </Field>
                  <Field label="Their quote number">
                    <Text name="reference" />
                  </Field>
                  <Field label="Received on">
                    <DateInput name="received_on" defaultValue={today} />
                  </Field>
                  <Field label="Valid until">
                    <DateInput name="valid_until" />
                  </Field>
                  <Field label="Local delivery charge">
                    <NumberInput name="delivery_charge" />
                  </Field>
                  <Field label="Delivery time (days)">
                    <NumberInput name="lead_time_days" />
                  </Field>
                  <Field label="Payment terms">
                    <Text name="payment_terms" placeholder="e.g. 50% deposit" />
                  </Field>
                  <Field label="Returns">
                    <Text name="return_terms" />
                  </Field>
                </div>
                <Field label="Tax note">
                  <Text name="tax_note" placeholder="e.g. Includes 5% VAT" />
                </Field>
                <div className="space-y-2">
                  <div className="lbl">Products quoted (up to 3)</div>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-6">
                      <select className="inp col-span-2 sm:col-span-2" name={`line_offer_${i}`} defaultValue="">
                        <option value="">Their product (optional)</option>
                        {offers.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.display_name}: {o.offer_name}
                          </option>
                        ))}
                      </select>
                      <input className="inp col-span-2 sm:col-span-1" name={`line_desc_${i}`} placeholder="Description" defaultValue={i === 0 ? c.title : ""} />
                      <input className="inp" name={`line_qty_${i}`} type="number" step="any" min={0} placeholder="Qty" defaultValue={i === 0 ? String(needed || "") : ""} />
                      <input className="inp" name={`line_price_${i}`} type="number" step="any" min={0} placeholder="Price each" />
                      <input className="inp" name={`line_moq_${i}`} type="number" step="any" min={0} placeholder="Min order" />
                    </div>
                  ))}
                </div>
                <Submit>Save supplier quote</Submit>
              </form>
            </Details>
          </div>
        </Card>

        {c.chosen_quote_id && (
          <Card title="Next steps">
            <ul className="space-y-2 text-sm">
              {reqs
                .filter((r) => ["finding_suppliers", "ready"].includes(r.status))
                .map((r) => (
                  <li key={r.id}>
                    <Link href={`/quotes/new?request=${r.id}`} className="text-brand">
                      Prepare the price for {r.trading_name} →
                    </Link>
                  </li>
                ))}
              {orderLines.length > 0 && (
                <li>
                  <Link href={`/purchase-orders/new?case=${id}`} className="btn-primary">
                    Order from the chosen supplier
                  </Link>
                  <span className="ml-2 text-muted">{orderLines.length} confirmed customer order {orderLines.length === 1 ? "line" : "lines"} waiting</span>
                </li>
              )}
              {orderLines.length === 0 && reqs.every((r) => !["finding_suppliers", "ready"].includes(r.status)) && (
                <li className="text-muted">Waiting for customers to confirm. Supplier orders can be made once at least one customer order is confirmed.</li>
              )}
            </ul>
            <div className="mt-2">
              <Chip>Chosen quote valid until {fmtDate(quotes.find((x) => x.id === c.chosen_quote_id)?.valid_until)}</Chip>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
