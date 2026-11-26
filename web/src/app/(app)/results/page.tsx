import { Card, Empty, PageHeader } from "@/components/ui";
import { q } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { label } from "@/lib/options";

// For each way of finding customers: how far they get, and how long until the first paid deal.
export default async function ResultsPage() {
  const rows = await q(`
    with c as (
      select b.id, coalesce(b.acquisition_source, 'not_recorded') as source, b.created_at, b.relationship_stage,
        exists (select 1 from interaction i where i.business_id = b.id) as talked,
        exists (select 1 from product_requirement r where r.business_id = b.id and r.archived_at is null and r.demand_status = 'qualified')
          or b.relationship_stage in ('qualified','active_opportunity','first_order_customer','repeat_customer') as ready,
        exists (select 1 from opportunity o where o.business_id = b.id) as deal,
        (select min(h.changed_at) from opportunity o join opportunity_stage_history h on h.opportunity_id = o.id
          where o.business_id = b.id and h.stage = 'closed_won') as first_win
      from business b
      where b.merged_into_business_id is null
    )
    select source,
      count(*)::int as customers,
      count(*) filter (where talked)::int as talked,
      count(*) filter (where ready)::int as ready,
      count(*) filter (where deal)::int as deals,
      count(*) filter (where first_win is not null)::int as buyers,
      count(*) filter (where relationship_stage = 'not_a_fit')::int as not_fit,
      percentile_cont(0.5) within group (order by extract(epoch from first_win - created_at) / 86400)
        filter (where first_win is not null) as median_days
    from c group by rollup(source)
    order by (source is null), count(*) desc`);
  const lost = await q("select coalesce(lost_reason, 'not_recorded') as reason, count(*)::int as n from opportunity where stage in ('closed_lost','cancelled') group by 1 order by 2 desc");
  const total = rows.find((r) => r.source == null);
  const bySource = rows.filter((r) => r.source != null);
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

  return (
    <>
      <PageHeader title="Results" subtitle="Which ways of finding customers turn into buyers. Use this to decide where to spend your time." />
      {!total || total.customers === 0 ? (
        <Empty>No customers yet.</Empty>
      ) : (
        <div className="space-y-4">
          <Card title="From first contact to buyer">
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 pr-2 font-medium">How we found them</th>
                    <th className="py-2 pr-2 text-right font-medium">Customers</th>
                    <th className="py-2 pr-2 text-right font-medium">Talked to</th>
                    <th className="py-2 pr-2 text-right font-medium">Ready to quote</th>
                    <th className="py-2 pr-2 text-right font-medium">Deal started</th>
                    <th className="py-2 pr-2 text-right font-medium">Bought</th>
                    <th className="py-2 text-right font-medium">Days to first sale</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bySource, total].map((r) => (
                    <tr key={r.source ?? "all"} className={`border-b border-line/60 ${r.source == null ? "font-semibold" : ""}`}>
                      <td className="py-2 pr-2">{r.source == null ? "All customers" : r.source === "not_recorded" ? "Not recorded" : label(r.source)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.customers}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.talked}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {r.ready} <span className="text-xs text-muted">{pct(r.ready, r.customers)}</span>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {r.deals} <span className="text-xs text-muted">{pct(r.deals, r.customers)}</span>
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {r.buyers} <span className="text-xs text-muted">{pct(r.buyers, r.customers)}</span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.median_days != null ? fmtNum(r.median_days) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              “Bought” means at least one deal won and fully paid. “Days to first sale” is the middle value from when the customer was added. Percentages are of the customers in that row. {total.not_fit > 0 && `${total.not_fit} customers are marked “Not a fit”.`}
            </p>
          </Card>
          <Card title="Why deals were lost">
            {lost.length ? (
              <ul className="space-y-1 text-sm">
                {lost.map((l) => (
                  <li key={l.reason} className="flex justify-between">
                    <span>{l.reason === "not_recorded" ? "Not recorded" : label(l.reason)}</span>
                    <span className="tabular-nums text-muted">{l.n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No lost deals yet.</Empty>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
