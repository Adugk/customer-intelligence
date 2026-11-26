import Link from "next/link";
import { Chip, Empty, PageHeader, StatusChip } from "@/components/ui";
import { q } from "@/lib/db";
import { fmtDate, fmtNum, todayISO } from "@/lib/format";
import { isOneOf, label, OPT } from "@/lib/options";

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "open";
  const where =
    status === "open" ? "r.status in ('new','needs_details','ready','finding_suppliers','quote_sent')"
    : status === "all" ? "true"
    : isOneOf(OPT.requestStatus, status) ? "r.status = $1" : "true";
  const rows = await q(
    `select r.*, b.trading_name, b.customer_kind,
       (select count(*)::int from supplier_quote sq where sq.sourcing_case_id = r.sourcing_case_id) as supplier_quotes
     from sourcing_request r join business b on b.id = r.business_id
     where ${where} order by (r.needed_by is null), r.needed_by, r.created_at desc limit 300`,
    where.includes("$1") ? [status] : [],
  );
  const today = todayISO();
  const filters = [
    ["open", "Open"], ["needs_details", "Needs details"], ["finding_suppliers", "Finding suppliers"], ["quote_sent", "Price sent"], ["confirmed", "Ordered"], ["completed", "Completed"], ["all", "All"],
  ];
  return (
    <>
      <PageHeader title="Requests" subtitle="Specific products customers asked you to find. A request becomes an order once the customer confirms in writing or pays." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map(([k, l]) => (
          <Link key={k} href={`/requests?status=${k}`} className={`chip min-h-9 px-3 text-sm ${status === k ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
            {l}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>No requests here. Open a customer and tap “New request”.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const late = r.needed_by && String(r.needed_by) < today && !["completed", "cancelled", "declined"].includes(r.status);
            return (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="card flex flex-col gap-2 p-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {fmtNum(r.quantity)} × {r.description}
                    </div>
                    <div className="text-sm text-muted">
                      {r.trading_name} · {label(r.use_type)} · {r.code}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    <StatusChip status={r.status} />
                    {r.use_type === "unsure" && <Chip tone="warn">Use not confirmed</Chip>}
                    {r.needed_by && <Chip tone={late ? "danger" : "neutral"}>Needed by {fmtDate(r.needed_by)}</Chip>}
                    {r.supplier_quotes > 0 && <Chip>{r.supplier_quotes} supplier {r.supplier_quotes === 1 ? "quote" : "quotes"}</Chip>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
