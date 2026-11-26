import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteFields } from "@/components/quote-fields";
import { ErrorNote, PageHeader, Submit } from "@/components/ui";
import { createCustomerQuote } from "@/lib/actions/quotes";
import { one } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, fmtNum, todayISO } from "@/lib/format";
import { rateBetween } from "@/lib/money";

export default async function NewQuotePage({ searchParams }: PageProps<"/quotes/new">) {
  const sp = await searchParams;
  const rid = typeof sp.request === "string" && isUuid(sp.request) ? sp.request : null;
  if (!rid) notFound();
  const r = await one("select r.*, b.trading_name from sourcing_request r join business b on b.id = r.business_id where r.id = $1", [rid]);
  if (!r) notFound();
  // Start from the chosen supplier quote of the request's sourcing case.
  const chosen = r.sourcing_case_id
    ? await one(
        `select l.*, sq.currency, s.display_name from sourcing_case c join supplier_quote sq on sq.id = c.chosen_quote_id
         join supplier_quote_line l on l.quote_id = sq.id join supplier s on s.id = sq.supplier_id
         where c.id = $1 order by (l.product_id = $2) desc nulls last limit 1`,
        [r.sourcing_case_id, r.product_id],
      )
    : undefined;
  const rate = chosen ? await rateBetween(chosen.currency, "ETB") : null;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Prepare the customer's price" subtitle={`${r.trading_name} · ${fmtNum(r.quantity)} × ${r.description}`} back={{ href: `/requests/${rid}`, label: "Back to request" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      {chosen ? (
        <p className="mb-4 rounded-lg bg-surface-2 p-3 text-sm">
          Chosen supplier: <strong>{chosen.display_name}</strong> — {fmtNum(chosen.unit_price, 2)} {chosen.currency} each
          {rate ? <> ≈ {fmtNum(Number(chosen.unit_price) * rate, 2)} ETB at your latest rate.</> : <> · <Link href="/money" className="text-brand">add a {chosen.currency} → ETB rate</Link> to see it in ETB.</>}
        </p>
      ) : (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">No supplier chosen yet. You can still prepare a price, but your cost will be a guess.</p>
      )}
      <form action={createCustomerQuote} className="space-y-4">
        <input type="hidden" name="request_id" value={rid} />
        {chosen && <input type="hidden" name="supplier_quote_line_id" value={chosen.id} />}
        <QuoteFields
          qt={{ currency: "ETB", valid_until: addDays(todayISO(), 7) }}
          line={{ description: r.description, qty: r.quantity, est_unit_cost: chosen?.unit_price }}
          costCurrency={chosen?.currency}
          suggestedRate={rate}
        />
        <Submit>Save as draft</Submit>
      </form>
    </div>
  );
}
