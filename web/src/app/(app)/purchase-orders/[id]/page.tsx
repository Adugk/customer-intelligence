import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm, ExpenseList, PaymentForm, PaymentList } from "@/components/money-forms";
import { Card, Chip, DateInput, Details, ErrorNote, Field, NumberInput, PageHeader, Select, StatusChip, Submit, Text } from "@/components/ui";
import { recordReceipt, saveAllocation, setPoStatus } from "@/lib/actions/orders";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtDate, fmtNum, todayISO } from "@/lib/format";
import { label, OPT } from "@/lib/options";
import { allocationsWithReceipts } from "@/lib/orders";

export default async function PurchaseOrderPage({ params, searchParams }: PageProps<"/purchase-orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const po = await one("select po.*, s.display_name, sq.code as quote_code from purchase_order po join supplier s on s.id = po.supplier_id left join supplier_quote sq on sq.id = po.supplier_quote_id where po.id = $1", [id]);
  if (!po) notFound();
  const [lines, receipts, rlines, payments, expenses] = await Promise.all([
    q("select * from purchase_order_line where po_id = $1 order by description", [id]),
    q("select * from goods_receipt where po_id = $1 order by received_on, created_at", [id]),
    q("select rl.* from receipt_line rl join goods_receipt gr on gr.id = rl.receipt_id where gr.po_id = $1", [id]),
    q("select * from payment where po_id = $1 order by paid_on, created_at", [id]),
    q("select e.*, null::double precision as share_etb from expense e where e.po_id = $1 order by e.incurred_on", [id]),
  ]);
  const allocs = await allocationsWithReceipts(lines.map((l) => l.id));
  const allocOrders = await q(
    `select ol.id, ol.order_id, ol.description, o.code, b.trading_name from customer_order_line ol join customer_order o on o.id = ol.order_id join business b on b.id = o.business_id
     where ol.id = any($1::uuid[])`,
    [allocs.map((a) => a.order_line_id)],
  );
  // Other confirmed customer order lines from the same sourcing case that still need units.
  const candidates = po.sourcing_case_id
    ? await q(
        `select ol.id, o.code, b.trading_name, ol.qty - coalesce((select sum(a.qty) from purchase_allocation a where a.order_line_id = ol.id), 0) as remaining
         from customer_order_line ol join customer_order o on o.id = ol.order_id join business b on b.id = o.business_id join sourcing_request r on r.id = ol.request_id
         where r.sourcing_case_id = $1 and o.status not in ('cancelled','closed')`,
        [po.sourcing_case_id],
      )
    : [];
  const orderShares = await q(
    `select ol.order_id, o.code from purchase_allocation a join purchase_order_line pl on pl.id = a.po_line_id join customer_order_line ol on ol.id = a.order_line_id
     join customer_order o on o.id = ol.order_id where pl.po_id = $1 group by ol.order_id, o.code`,
    [id],
  );
  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
  const paid = payments.filter((p) => p.status === "completed").reduce((s, p) => s + (p.direction === "out" ? 1 : -1) * Number(p.amount), 0);
  const cur = po.currency;
  const sum = (lid: string, k: string) => rlines.filter((r) => r.po_line_id === lid).reduce((s, r) => s + Number(r[k]), 0);
  const canReceive = !["draft", "cancelled", "closed"].includes(po.status);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Supplier order ${po.code}`}
        subtitle={
          <>
            <Link href={`/suppliers/${po.supplier_id}`} className="text-brand">{po.display_name}</Link>
            {po.quote_code && <> · from quote {po.quote_code}</>}
            {po.sourcing_case_id && <> · <Link href={`/cases/${po.sourcing_case_id}`} className="text-brand">sourcing case</Link></>} · ordered {fmtDate(po.order_date)}
          </>
        }
        back={{ href: "/orders?view=supplier", label: "Supplier orders" }}
      />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusChip status={po.status} />
        <Chip>Total {fmtNum(total, 2)} {cur}</Chip>
        <Chip tone={total - paid > 0.01 ? "warn" : "ok"}>{total - paid > 0.01 ? `To pay ${fmtNum(total - paid, 2)} ${cur}` : "Paid"}</Chip>
        <Chip>1 {cur} = {fmtNum(po.rate_to_etb, 4)} ETB</Chip>
        {po.status === "draft" && <StatusButton id={id} to="sent" text="Mark as sent to supplier" primary />}
        {po.status === "sent" && <StatusButton id={id} to="confirmed_by_supplier" text="Supplier confirmed" primary />}
        {["received", "part_received"].includes(po.status) && <StatusButton id={id} to="closed" text="Close supplier order" />}
        {["draft", "sent", "confirmed_by_supplier"].includes(po.status) && <StatusButton id={id} to="cancelled" text="Cancel" danger />}
      </div>
      {po.notes && <p className="mb-4 whitespace-pre-wrap text-sm text-muted">{po.notes}</p>}

      <div className="space-y-4">
        {lines.map((l) => {
          const got = sum(l.id, "qty_received");
          const bad = sum(l.id, "qty_damaged") + sum(l.id, "qty_wrong");
          const good = got - bad;
          const la = allocs.filter((a) => a.po_line_id === l.id);
          const allocated = la.reduce((s, a) => s + Number(a.qty), 0);
          const limit = rlines.some((r) => r.po_line_id === l.id) ? good : Number(l.qty);
          return (
            <Card key={l.id} title={l.description} action={<span className="text-sm tabular-nums">{fmtNum(l.qty)} × {fmtNum(l.unit_price, 2)} {cur}</span>}>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                <Mini label="Ordered" value={fmtNum(l.qty)} />
                <Mini label="Arrived" value={fmtNum(got)} />
                <Mini label="Damaged / wrong" value={fmtNum(bad)} warn={bad > 0} />
                <Mini label="For customers" value={fmtNum(allocated)} />
                {rlines.length > 0 && good < allocated ? (
                  <Mini label="Short for customers" value={fmtNum(allocated - good)} warn />
                ) : (
                  <Mini label="Spare" value={fmtNum(Math.max(0, (rlines.length ? good : Number(l.qty)) - allocated))} />
                )}
              </div>
              {rlines.length > 0 && got < Number(l.qty) && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{fmtNum(Number(l.qty) - got)} units have not arrived yet. They stay outstanding.</p>}
              {rlines.length > 0 && good < allocated && (
                <p className="mt-2 text-sm text-red-700 dark:text-red-300">More units are promised to customers ({fmtNum(allocated)}) than arrived in good condition ({fmtNum(good)}). {got < Number(l.qty) ? "Wait for the rest, or reduce an allocation below." : "Ask the supplier to replace the bad units, or reduce an allocation below."}</p>
              )}
              <div className="mt-3">
                <div className="lbl">Units for each customer</div>
                <ul className="space-y-2">
                  {la.map((a) => {
                    const ol = allocOrders.find((x) => x.id === a.order_line_id);
                    return (
                      <li key={a.id}>
                        <form action={saveAllocation} className="flex flex-wrap items-center gap-2 text-sm">
                          <input type="hidden" name="po_id" value={id} />
                          <input type="hidden" name="po_line_id" value={l.id} />
                          <input type="hidden" name="order_line_id" value={a.order_line_id} />
                          <Link href={`/orders/${ol?.order_id}`} className="min-w-40 text-brand">
                            {ol?.trading_name} · {ol?.code}
                          </Link>
                          <input className="inp w-24 py-1.5" type="number" step="any" min={0} name="qty" defaultValue={String(a.qty)} />
                          <span className="text-xs text-muted">arrived for them: {fmtNum(a.received)}</span>
                          <button className="btn-ghost min-h-9 px-3 text-xs">Save</button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
                {candidates.filter((c) => Number(c.remaining) > 0).length > 0 && !["cancelled", "closed"].includes(po.status) && (
                  <form action={saveAllocation} className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                    <input type="hidden" name="po_id" value={id} />
                    <input type="hidden" name="po_line_id" value={l.id} />
                    <select name="order_line_id" className="inp w-auto" required defaultValue="">
                      <option value="" disabled>
                        + Give units to another order…
                      </option>
                      {candidates
                        .filter((c) => Number(c.remaining) > 0)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.trading_name} · {c.code} (needs {fmtNum(c.remaining)})
                          </option>
                        ))}
                    </select>
                    <input className="inp w-24" type="number" step="any" min={0} name="qty" placeholder="Units" />
                    <button className="btn-ghost min-h-11 px-3 text-xs">Add</button>
                  </form>
                )}
                <p className="mt-1 text-xs text-muted">Limit: {fmtNum(limit)} ({rlines.some((r) => r.po_line_id === l.id) ? "good units that arrived" : "units ordered"}).</p>
              </div>
            </Card>
          );
        })}

        <Card title="Goods received and checked">
          {receipts.length ? (
            <ul className="space-y-2 text-sm">
              {receipts.map((g) => (
                <li key={g.id} className="rounded-lg bg-surface-2 p-2">
                  <div className="font-medium">
                    {g.code} · {fmtDate(g.received_on)}
                    {g.location && ` · ${g.location}`}
                    {g.received_by && ` · by ${g.received_by}`}
                  </div>
                  {rlines
                    .filter((r) => r.receipt_id === g.id)
                    .map((r) => (
                      <div key={r.id} className="text-muted">
                        {lines.find((l) => l.id === r.po_line_id)?.description}: {fmtNum(r.qty_received)} arrived
                        {Number(r.qty_damaged) > 0 && `, ${fmtNum(r.qty_damaged)} damaged`}
                        {Number(r.qty_wrong) > 0 && `, ${fmtNum(r.qty_wrong)} wrong`} · check: {label(r.inspection)}
                        {r.serial_batch && ` · ${r.serial_batch}`}
                        {r.notes && ` · ${r.notes}`}
                      </div>
                    ))}
                  {g.notes && <div className="text-muted">{g.notes}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing received yet. A supplier saying “sent” is not the same as received — record goods only when they are in your hands.</p>
          )}
          {canReceive && (
            <div className="mt-3">
              <Details summary="+ Record goods received">
                <form action={recordReceipt} className="space-y-3">
                  <input type="hidden" name="po_id" value={id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Received on">
                      <DateInput name="received_on" defaultValue={todayISO()} />
                    </Field>
                    <Field label="Where">
                      <Text name="location" placeholder="e.g. Dubai receiving point" />
                    </Field>
                    <Field label="Received by">
                      <Text name="received_by" />
                    </Field>
                  </div>
                  {lines.map((l) => (
                    <div key={l.id} className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-6">
                      <div className="col-span-2 text-sm font-medium sm:col-span-6">
                        {l.description} <span className="font-normal text-muted">(ordered {fmtNum(l.qty)}, arrived so far {fmtNum(sum(l.id, "qty_received"))})</span>
                      </div>
                      <Field label="Arrived now">
                        <NumberInput name={`got_${l.id}`} />
                      </Field>
                      <Field label="Of which damaged">
                        <NumberInput name={`damaged_${l.id}`} />
                      </Field>
                      <Field label="Of which wrong">
                        <NumberInput name={`wrong_${l.id}`} />
                      </Field>
                      <Field label="Check result">
                        <Select name={`inspection_${l.id}`} options={OPT.inspection} defaultValue="passed" blank={false} />
                      </Field>
                      <Field label="Serial / batch / expiry" className="col-span-2">
                        <Text name={`serial_${l.id}`} />
                      </Field>
                      <Field label="Notes" className="col-span-2 sm:col-span-6">
                        <Text name={`notes_${l.id}`} />
                      </Field>
                    </div>
                  ))}
                  <Field label="General notes">
                    <Text name="notes" />
                  </Field>
                  <Submit>Save goods received</Submit>
                </form>
              </Details>
            </div>
          )}
        </Card>

        <Card title="Payments to the supplier">
          <PaymentList payments={payments} returnTo={`/purchase-orders/${id}`} />
          {!["cancelled"].includes(po.status) && (
            <div className="mt-3">
              <Details summary="+ Record a payment">
                <PaymentForm poId={id} currency={cur} rate={Number(po.rate_to_etb)} kinds={["deposit", "part", "full", "refund"]} direction="out" />
              </Details>
            </div>
          )}
        </Card>

        <Card title="Costs shared by the customers on this order" action={<span className="text-xs text-muted">e.g. UAE delivery, packing, transport</span>}>
          <ExpenseList expenses={expenses} returnTo={`/purchase-orders/${id}`} />
          {orderShares.length > 0 ? (
            <div className="mt-3">
              <Details summary="+ Record a cost">
                <ExpenseForm poId={id} currency={cur} rate={Number(po.rate_to_etb)} orders={orderShares} />
              </Details>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Allocate units to customer orders first, so costs can be shared between them.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatusButton({ id, to, text, primary, danger }: { id: string; to: string; text: string; primary?: boolean; danger?: boolean }) {
  return (
    <form action={setPoStatus}>
      <input type="hidden" name="po_id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button className={`${danger ? "btn-danger" : primary ? "btn-primary" : "btn-ghost"} min-h-9 px-3 text-xs`}>{text}</button>
    </form>
  );
}

function Mini({ label: l, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 p-2">
      <div className={`font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{l}</div>
    </div>
  );
}
