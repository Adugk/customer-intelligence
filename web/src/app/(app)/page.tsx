import Link from "next/link";
import { Card, Chip, Empty, PageHeader, ScorePill, StatusChip } from "@/components/ui";
import { FollowUpRow } from "@/components/follow-up-row";
import { scoreAllActiveRequirements } from "@/lib/data";
import { q } from "@/lib/db";
import { addDays, daysBetween, fmtDate, relDays, todayISO } from "@/lib/format";
import { nextPurchase, staleGroups } from "@/lib/scoring";

export default async function Dashboard() {
  const today = todayISO();
  const [due, counts, orphans, scored] = await Promise.all([
    q(
      `select f.*, b.trading_name, b.code as business_code, r.customer_description, c.name as contact_name, c.phone_primary
       from follow_up f join business b on b.id = f.business_id
       left join product_requirement r on r.id = f.requirement_id
       left join contact c on c.id = f.contact_id
       where f.status = 'open' and f.due_date <= $1 and b.archived_at is null
       order by f.due_date, f.created_at limit 30`,
      [addDays(today, 0)],
    ),
    q(
      `select
        (select count(*)::int from business where archived_at is null) as businesses,
        (select count(*)::int from product_requirement r join business b on b.id = r.business_id where r.archived_at is null and b.archived_at is null and r.demand_status in ('interested','specified','qualified')) as active_reqs,
        (select count(*)::int from product_requirement r join business b on b.id = r.business_id where r.archived_at is null and b.archived_at is null and r.demand_status = 'qualified') as qualified,
        (select count(*)::int from opportunity where stage not in ('closed_won','closed_lost','cancelled')) as open_opps,
        (select count(*)::int from follow_up where status = 'open' and due_date > $1 and due_date <= $2) as upcoming`,
      [today, addDays(today, 7)],
    ),
    q(
      `select b.id, b.code, b.trading_name, b.relationship_stage,
         (select count(*)::int from product_requirement r where r.business_id = b.id and r.archived_at is null and r.demand_status in ('interested','specified','qualified')) as active_reqs,
         (select count(*)::int from opportunity o where o.business_id = b.id and o.stage not in ('closed_won','closed_lost','cancelled')) as open_opps
       from business b
       where b.archived_at is null and b.relationship_stage not in ('do_not_contact','not_a_fit')
         and not exists (select 1 from follow_up f where f.business_id = b.id and f.status = 'open')
         and (exists (select 1 from product_requirement r where r.business_id = b.id and r.archived_at is null and r.demand_status in ('interested','specified','qualified'))
              or exists (select 1 from opportunity o where o.business_id = b.id and o.stage not in ('closed_won','closed_lost','cancelled')))
       order by b.updated_at desc limit 20`,
    ),
    scoreAllActiveRequirements(),
  ]);
  const c = counts[0];
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 8);
  const upcoming = scored
    .map((s) => ({ ...s, np: nextPurchase(s.req) }))
    .filter((s) => s.np.date && s.np.date >= today && daysBetween(today, s.np.date) <= 30)
    .sort((a, b) => (a.np.date! < b.np.date! ? -1 : 1))
    .slice(0, 10);
  const stale = scored.map((s) => ({ ...s, stale: staleGroups(s.req) })).filter((s) => s.stale.length).slice(0, 10);
  const overdue = due.filter((f) => String(f.due_date) < today);

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={fmtDate(today)}
        actions={
          <Link href="/customers/new" className="btn-primary hidden md:inline-flex">
            + Add customer
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Customers" value={c.businesses} href="/customers" />
        <Stat label="Products customers want" value={c.active_reqs} href="/customers?has=active" />
        <Stat label="Ready to quote" value={c.qualified} href="/demand" />
        <Stat label="Open deals" value={c.open_opps} href="/pipeline" />
        <Stat label="Follow-ups this week" value={c.upcoming} href="/follow-ups" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={
            <>
              Follow-ups for today {overdue.length > 0 && <Chip tone="danger">{overdue.length} late</Chip>}
            </>
          }
          action={<Link href="/follow-ups" className="text-sm text-brand">All</Link>}
          className="lg:col-span-2"
        >
          {due.length ? (
            <ul className="divide-y divide-line">
              {due.map((f) => (
                <FollowUpRow key={f.id} f={f} returnTo="/" />
              ))}
            </ul>
          ) : (
            <Empty>Nothing to do today.</Empty>
          )}
        </Card>

        <Card title="Don't forget these customers" action={<span className="text-xs text-muted">Interested, but no follow-up planned</span>}>
          {orphans.length ? (
            <ul className="divide-y divide-line">
              {orphans.map((b) => (
                <li key={b.id} className="py-2.5">
                  <Link href={`/customers/${b.id}`} className="flex items-center justify-between gap-2">
                    <span className="font-medium">{b.trading_name}</span>
                    <span className="text-xs text-muted">
                      {b.active_reqs} products · {b.open_opps} deals
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Every interested customer has a follow-up planned.</Empty>
          )}
        </Card>

        <Card title="Customers buying in the next 30 days">
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.map((s) => (
                <li key={s.req.id} className="py-2.5">
                  <Link href={`/requirements/${s.req.id}`} className="block">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{s.req.customer_description}</span>
                      <span className="shrink-0 text-sm tabular-nums">{fmtDate(s.np.date)}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {s.req.trading_name} · {relDays(s.np.date)} {s.np.predicted && "· worked out from how often they buy"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No purchases expected in the next 30 days.</Empty>
          )}
        </Card>

        <Card title="Best chances to sell" action={<span className="text-xs text-muted">By priority score</span>}>
          {top.length ? (
            <ul className="divide-y divide-line">
              {top.map((s) => (
                <li key={s.req.id} className="py-2.5">
                  <Link href={`/requirements/${s.req.id}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.req.customer_description}</span>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {s.req.trading_name} <StatusChip status={s.req.demand_status} />
                      </span>
                    </span>
                    <ScorePill score={s.score} completeness={s.completeness} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Add products to your customers to see them here.</Empty>
          )}
        </Card>

        <Card title="Information to check again" action={<span className="text-xs text-muted">Prices and stock get old quickly</span>}>
          {stale.length ? (
            <ul className="divide-y divide-line">
              {stale.map((s) => (
                <li key={s.req.id} className="py-2.5">
                  <Link href={`/requirements/${s.req.id}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="font-medium">{s.req.customer_description}</span> <span className="text-xs text-muted">· {s.req.trading_name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">{s.stale.join(", ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Everything is up to date.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card block p-3 hover:bg-surface-2">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </Link>
  );
}
