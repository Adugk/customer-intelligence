import type { Row } from "@/lib/db";
import { addExpense, deleteExpense, recordPayment, reversePayment } from "@/lib/actions/orders";
import { fmtDate, fmtNum, todayISO } from "@/lib/format";
import { label, OPT } from "@/lib/options";
import { DateInput, Field, NumberInput, Select, Submit, Text } from "./ui";

/** Record a payment against a customer order (orderId) or a supplier order (poId). */
export function PaymentForm({ orderId, poId, currency, rate, kinds, direction }: { orderId?: string; poId?: string; currency: string; rate: number | null; kinds: readonly string[]; direction: "in" | "out" }) {
  return (
    <form action={recordPayment} className="space-y-3">
      {orderId && <input type="hidden" name="order_id" value={orderId} />}
      {poId && <input type="hidden" name="po_id" value={poId} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Money">
          <select className="inp" name="direction" defaultValue={direction}>
            <option value="in">{orderId ? "Received from customer" : "Refund from supplier"}</option>
            <option value="out">{orderId ? "Refund to customer" : "Paid to supplier"}</option>
          </select>
        </Field>
        <Field label="Kind">
          <Select name="kind" options={kinds} defaultValue={kinds[0]} blank={false} />
        </Field>
        <Field label="Amount *">
          <NumberInput name="amount" />
        </Field>
        <Field label="Currency">
          <Select name="currency" options={OPT.currency} defaultValue={currency} blank={false} />
        </Field>
        <Field label="Rate to ETB *" hint="1 if the payment is in ETB">
          <NumberInput name="rate_to_etb" defaultValue={currency === "ETB" ? 1 : (rate ?? undefined)} />
        </Field>
        <Field label="How">
          <Select name="method" options={OPT.paymentMethod} />
        </Field>
        <Field label="Receipt / reference">
          <Text name="reference" />
        </Field>
        <Field label="Date">
          <DateInput name="paid_on" defaultValue={todayISO()} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="allow_duplicate" /> It is a separate payment (same amount and date as another)
      </label>
      <Submit>Save payment</Submit>
    </form>
  );
}

export function PaymentList({ payments, returnTo, locked = false }: { payments: Row[]; returnTo: string; locked?: boolean }) {
  if (!payments.length) return <p className="text-sm text-muted">No payments yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {payments.map((p) => (
        <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${p.status === "reversed" ? "text-muted line-through" : ""}`}>
          <span>
            {fmtDate(p.paid_on)} · {label(p.kind)} · {p.direction === "in" ? "received" : "paid out"}
            {p.method && ` · ${label(p.method)}`}
            {p.reference && ` · ${p.reference}`} <span className="text-xs text-muted">({p.code})</span>
          </span>
          <span className="flex items-center gap-3">
            <span className="tabular-nums">
              {p.direction === "in" ? "+" : "−"}
              {fmtNum(p.amount, 2)} {p.currency}
              {p.currency !== "ETB" && <span className="text-xs text-muted"> × {fmtNum(p.rate_to_etb, 4)}</span>}
            </span>
            {p.status === "completed" && !locked && (
              <form action={reversePayment}>
                <input type="hidden" name="payment_id" value={p.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <input type="hidden" name="reason" value="Entered by mistake" />
                <button className="text-xs text-red-700 dark:text-red-300" title="Mark as reversed (kept in history)">
                  Reverse
                </button>
              </form>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Record a cost. On a supplier order it is shared between the customer orders on it. */
export function ExpenseForm({ orderId, poId, currency, rate, orders }: { orderId?: string; poId?: string; currency: string; rate: number | null; orders?: Row[] }) {
  return (
    <form action={addExpense} className="space-y-3">
      {orderId && <input type="hidden" name="order_id" value={orderId} />}
      {poId && <input type="hidden" name="po_id" value={poId} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Kind of cost *" className="col-span-2">
          <Select name="category" options={OPT.expenseCategory} required />
        </Field>
        <Field label="Amount *">
          <NumberInput name="amount" />
        </Field>
        <Field label="Currency">
          <Select name="currency" options={OPT.currency} defaultValue={currency} blank={false} />
        </Field>
        <Field label="Rate to ETB *" hint="1 for ETB">
          <NumberInput name="rate_to_etb" defaultValue={currency === "ETB" ? 1 : (rate ?? undefined)} />
        </Field>
        <Field label="Date">
          <DateInput name="incurred_on" defaultValue={todayISO()} />
        </Field>
        <Field label="Details" className="col-span-2">
          <Text name="description" placeholder="e.g. DHL invoice 12345" />
        </Field>
      </div>
      {poId && (
        <div className="rounded-lg bg-surface-2 p-3">
          <Field label="Share this cost between the customer orders">
            <Select name="allocation_method" options={OPT.allocationMethod} defaultValue="quantity" blank={false} />
          </Field>
          {orders && orders.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {orders.map((o) => (
                <Field key={o.order_id} label={`If by hand: ${o.code} (ETB)`}>
                  <NumberInput name={`manual_${o.order_id}`} />
                </Field>
              ))}
            </div>
          )}
        </div>
      )}
      <Submit>Save cost</Submit>
    </form>
  );
}

export function ExpenseList({ expenses, returnTo }: { expenses: Row[]; returnTo: string }) {
  if (!expenses.length) return <p className="text-sm text-muted">No costs recorded yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {expenses.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            {fmtDate(e.incurred_on)} · {label(e.category)}
            {e.description && ` · ${e.description}`}
            {e.po_id && <span className="text-xs text-muted"> · shared {label(e.allocation_method).toLowerCase()}</span>}
          </span>
          <span className="flex items-center gap-3">
            <span className="tabular-nums">
              {fmtNum(e.amount, 2)} {e.currency}
              {e.share_etb != null && <span className="text-xs text-muted"> (this order: {fmtNum(e.share_etb, 2)} ETB)</span>}
            </span>
            {(!e.po_id || returnTo.startsWith("/purchase-orders/")) && (
              <form action={deleteExpense}>
                <input type="hidden" name="expense_id" value={e.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button className="text-xs text-red-700 dark:text-red-300">Delete</button>
              </form>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
