import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RequestFields } from "@/components/request-fields";
import { Card, Chip, Details, ErrorNote, Field, KV, StatusChip, Submit, Text } from "@/components/ui";
import { closeRequest, startCase, updateRequest } from "@/lib/actions/requests";
import { q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtDate, fmtDateTime, fmtNum, todayISO } from "@/lib/format";
import { label } from "@/lib/options";
import { requestReadyGaps } from "@/lib/orders";

export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const rows = await q(
    `select r.*, b.trading_name, b.customer_kind, p.name as product_name, pc.is_regulated, pc.name as category_name, c.name as contact_name
     from sourcing_request r join business b on b.id = r.business_id
     left join product p on p.id = r.product_id left join product_category pc on pc.id = p.category_id
     left join contact c on c.id = r.contact_id where r.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) notFound();
  const [products, contacts, caseRows, quotes, cquotes, orders, history] = await Promise.all([
    q("select id, name from product order by name"),
    q("select id, name from contact where business_id = $1 order by is_primary desc", [r.business_id]),
    r.sourcing_case_id ? q("select * from sourcing_case where id = $1", [r.sourcing_case_id]) : Promise.resolve([]),
    r.sourcing_case_id ? q("select sq.*, s.display_name from supplier_quote sq join supplier s on s.id = sq.supplier_id where sq.sourcing_case_id = $1 order by sq.created_at", [r.sourcing_case_id]) : Promise.resolve([]),
    q("select * from customer_quote where sourcing_request_id = $1 order by created_at desc", [id]),
    q("select distinct o.* from customer_order o join customer_order_line ol on ol.order_id = o.id where ol.request_id = $1", [id]),
    q("select * from request_status_history where request_id = $1 order by changed_at desc", [id]),
  ]);
  const kase = caseRows[0];
  const gaps = requestReadyGaps(r);
  const draft = cquotes.find((x) => x.status === "draft");
  const sent = cquotes.find((x) => x.status === "sent");
  const order = orders[0];
  const closed = ["cancelled", "declined", "completed"].includes(r.status);

  let next: ReactNode;
  if (order) next = <NextLink href={`/orders/${order.id}`} text={`Order ${order.code} — ${label(order.status)}. Open the order.`} />;
  else if (closed) next = <p className="text-sm text-muted">This request is {label(r.status).toLowerCase()}.</p>;
  else if (gaps.length) next = <p className="text-sm">Fill in: <strong>{gaps.join(", ")}</strong> (under “Edit request” below).</p>;
  else if (!kase)
    next = (
      <form action={startCase}>
        <input type="hidden" name="request_id" value={id} />
        <p className="mb-2 text-sm">Everything needed is recorded. Next: find suppliers and collect their prices.</p>
        <button className="btn-primary">Start finding suppliers</button>
      </form>
    );
  else if (!kase.chosen_quote_id) next = <NextLink href={`/cases/${kase.id}`} text={quotes.length ? `${quotes.length} supplier ${quotes.length === 1 ? "quote" : "quotes"} received — compare and choose one.` : "Ask suppliers for prices and record their quotes."} />;
  else if (draft) next = <NextLink href={`/quotes/${draft.id}`} text={`Price ${draft.code} is a draft — check it and send it to the customer.`} />;
  else if (sent) next = <NextLink href={`/quotes/${sent.id}`} text={`Price ${sent.code} sent — waiting for the customer. Confirm the order when they accept in writing or pay.`} />;
  else next = <NextLink href={`/quotes/new?request=${id}`} text="Supplier chosen — prepare the customer's price." />;

  return (
    <div className="max-w-4xl">
      <Link href={`/customers/${r.business_id}`} className="mb-2 inline-flex text-sm text-muted hover:text-ink">
        ← {r.trading_name}
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {fmtNum(r.quantity)} × {r.description}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {r.code} · asked {fmtDate(r.created_at)}
            {r.contact_name && <> by {r.contact_name}</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusChip status={r.status} />
            <Chip tone={r.use_type === "unsure" ? "warn" : "neutral"}>{label(r.use_type)}</Chip>
            {r.needed_by && <Chip tone={String(r.needed_by) < todayISO() && !closed ? "danger" : "neutral"}>Needed by {fmtDate(r.needed_by)}</Chip>}
          </div>
        </div>
      </div>
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />

      <div className="space-y-4">
        <Card title="Next step">{next}</Card>

        <ComplianceNote useType={r.use_type} regulated={!!r.is_regulated} category={r.category_name} />

        <Card title="The request">
          <KV
            items={[
              ["Product in your list", r.product_name ?? <span className="text-amber-700 dark:text-amber-300">Not linked yet</span>],
              ["Details", r.specification],
              ["Would accept instead", r.accept_alternatives],
              ["Price they hope for", r.target_price != null ? `${fmtNum(r.target_price, 2)} ${r.target_currency ?? ""} each` : null],
              ["How urgent", label(r.urgency)],
              ["Deliver to", r.delivery_place],
              ["Link", r.reference_link ? <a key="l" href={r.reference_link} target="_blank" rel="noreferrer" className="text-brand break-all">{r.reference_link}</a> : null],
              ["Notes", r.notes],
            ]}
          />
          {!closed && ["new", "needs_details", "ready", "finding_suppliers"].includes(r.status) && (
            <div className="mt-3">
              <Details summary="Edit request" open={gaps.length > 0}>
                <form action={updateRequest} className="space-y-3">
                  <input type="hidden" name="request_id" value={id} />
                  <RequestFields r={r} products={products} contacts={contacts} />
                  <Submit>Save</Submit>
                </form>
              </Details>
            </div>
          )}
        </Card>

        {kase && (
          <Card title="Finding suppliers" action={<Link href={`/cases/${kase.id}`} className="text-sm text-brand">Open {kase.code}</Link>}>
            {quotes.length ? (
              <ul className="space-y-1 text-sm">
                {quotes.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {x.display_name} <span className="text-muted">· {x.code}</span>
                    </span>
                    <StatusChip status={x.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No supplier quotes yet.</p>
            )}
            {kase.choice_reason && <p className="mt-2 text-sm text-muted">Why chosen: {kase.choice_reason}</p>}
          </Card>
        )}

        {cquotes.length > 0 && (
          <Card title="Prices sent to the customer">
            <ul className="space-y-1 text-sm">
              {cquotes.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/quotes/${x.id}`} className="text-brand">
                    {x.code} (version {x.revision_no})
                  </Link>
                  <StatusChip status={x.status} />
                </li>
              ))}
            </ul>
          </Card>
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

        {!closed && !order && (
          <Details summary="Cancel or decline this request">
            <form action={closeRequest} className="space-y-3">
              <input type="hidden" name="request_id" value={id} />
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="to" value="cancelled" defaultChecked className="accent-[var(--brand)]" /> The customer cancelled
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="to" value="declined" className="accent-[var(--brand)]" /> We can&apos;t or won&apos;t do it
                </label>
              </div>
              <Field label="Reason *">
                <Text name="reason" required />
              </Field>
              <button className="btn-danger">Close request</button>
            </form>
          </Details>
        )}
      </div>
    </div>
  );
}

function NextLink({ href, text }: { href: string; text: string }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-lg bg-brand/10 p-3 text-sm font-medium text-brand">
      <span>{text}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}

/** Records the route question; it never decides legality — a person checks before dispatch (Phase 5). */
function ComplianceNote({ useType, regulated, category }: { useType: string; regulated: boolean; category?: string }) {
  if (useType === "unsure")
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <strong>Use not confirmed.</strong> Ask whether this is for personal use or for a business. Until then the request can&apos;t get a quote or an order.
      </p>
    );
  return (
    <p className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
      {useType === "business_resale" || useType === "business_own_use" ? (
        <>
          <strong>Business goods:</strong> must come through the commercial import route with the right documents (invoice, packing list, import permits where needed). They can never travel as personal baggage.
        </>
      ) : (
        <>
          <strong>Personal use:</strong> this does <em>not</em> automatically mean it can travel as passenger baggage or duty-free. A person must check the customs rules before dispatch.
        </>
      )}
      {regulated && (
        <>
          {" "}
          <strong>{category}</strong> may need special approval (for example from the Ethiopian Food and Drug Authority) — check before buying.
        </>
      )}
    </p>
  );
}
