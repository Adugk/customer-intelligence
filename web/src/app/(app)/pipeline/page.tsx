import Link from "next/link";
import { Card, Chip, Empty, PageHeader } from "@/components/ui";
import { q } from "@/lib/db";
import { fmtDate, fmtNum } from "@/lib/format";
import { label, OPT } from "@/lib/options";

const OPEN = OPT.oppStage.filter((s) => !["closed_won", "closed_lost", "cancelled"].includes(s));

export default async function PipelinePage() {
  const rows = await q(
    `select o.*, b.trading_name,
       (select coalesce(sum(l.quantity * l.expected_unit_price), 0) from opportunity_line l where l.opportunity_id = o.id and l.currency = 'ETB') as est_value
     from opportunity o join business b on b.id = o.business_id
     order by o.updated_at desc`,
  );
  const lost = await q("select lost_reason, count(*)::int as n from opportunity where stage in ('closed_lost','cancelled') group by lost_reason order by n desc");
  const open = rows.filter((o) => OPEN.includes(o.stage));
  const verbal = open.filter((o) => o.commitment_level === "verbal");
  const confirmed = open.filter((o) => ["written", "deposit_paid", "fully_paid"].includes(o.commitment_level));
  const sum = (list: typeof rows) => list.reduce((s, o) => s + Number(o.est_value || 0), 0);

  return (
    <>
      <PageHeader title="Deals" subtitle="Possible sales you are working on. A deal only counts as confirmed with a written order or a payment." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open deals" value={String(open.length)} />
        <Stat label="Estimated value (ETB)" value={fmtNum(sum(open))} />
        <Stat label="Verbal yes only" value={`${verbal.length} · ${fmtNum(sum(verbal))}`} />
        <Stat label="Confirmed (written or paid)" value={`${confirmed.length} · ${fmtNum(sum(confirmed))}`} />
      </div>
      {rows.length === 0 ? (
        <Empty>No deals yet. When a customer&apos;s product is “Ready to quote”, start a deal from it.</Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex gap-3">
            {OPEN.map((stage) => {
              const list = open.filter((o) => o.stage === stage);
              return (
                <div key={stage} className="w-64 shrink-0">
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                    <span>{label(stage)}</span>
                    <span className="text-muted">{list.length}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map((o) => (
                      <Link key={o.id} href={`/opportunities/${o.id}`} className="card block p-3 text-sm hover:bg-surface-2">
                        <div className="font-medium">{o.title}</div>
                        <div className="text-xs text-muted">{o.trading_name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Chip tone={o.commitment_level === "none" ? "neutral" : o.commitment_level === "verbal" ? "warn" : "ok"}>{label(o.commitment_level)}</Chip>
                          {Number(o.est_value) > 0 && <Chip>≈{fmtNum(o.est_value)}</Chip>}
                          {o.expected_purchase_date && <Chip tone="info">{fmtDate(o.expected_purchase_date)}</Chip>}
                        </div>
                      </Link>
                    ))}
                    {list.length === 0 && <div className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Finished deals">
          {rows.filter((o) => !OPEN.includes(o.stage)).length ? (
            <ul className="divide-y divide-line text-sm">
              {rows
                .filter((o) => !OPEN.includes(o.stage))
                .map((o) => (
                  <li key={o.id} className="py-2">
                    <Link href={`/opportunities/${o.id}`} className="flex justify-between gap-2">
                      <span>
                        {o.title} <span className="text-muted">· {o.trading_name}</span>
                      </span>
                      <span className="text-muted">{label(o.stage)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty>No finished deals yet.</Empty>
          )}
        </Card>
        <Card title="Why deals were lost">
          {lost.length ? (
            <ul className="space-y-1 text-sm">
              {lost.map((l) => (
                <li key={l.lost_reason ?? "none"} className="flex justify-between">
                  <span>{label(l.lost_reason)}</span>
                  <span className="tabular-nums text-muted">{l.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No lost deals yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{l}</div>
    </div>
  );
}
