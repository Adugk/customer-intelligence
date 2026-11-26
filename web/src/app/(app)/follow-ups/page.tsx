import { FollowUpRow } from "@/components/follow-up-row";
import { Card, Empty, PageHeader } from "@/components/ui";
import { q } from "@/lib/db";
import { addDays, todayISO } from "@/lib/format";

export default async function FollowUpsPage() {
  const today = todayISO();
  const rows = await q(
    `select f.*, b.trading_name, s.display_name as supplier_name, c.name as contact_name, c.phone_primary
     from follow_up f left join business b on b.id = f.business_id left join supplier s on s.id = f.supplier_id
     left join contact c on c.id = f.contact_id
     where f.status = 'open' and coalesce(b.archived_at, s.archived_at) is null
     order by f.due_date, f.created_at`,
  );
  const recent = await q(
    `select f.*, coalesce(b.trading_name, s.display_name) as trading_name from follow_up f left join business b on b.id = f.business_id left join supplier s on s.id = f.supplier_id
     where f.status in ('done','cancelled') order by f.completed_at desc nulls last limit 15`,
  );
  const weekEnd = addDays(today, 7);
  const groups = [
    { title: "Late", items: rows.filter((f) => String(f.due_date) < today) },
    { title: "Today", items: rows.filter((f) => String(f.due_date) === today) },
    { title: "Next 7 days", items: rows.filter((f) => String(f.due_date) > today && String(f.due_date) <= weekEnd) },
    { title: "Later", items: rows.filter((f) => String(f.due_date) > weekEnd) },
  ];
  return (
    <>
      <PageHeader title="Follow-ups" subtitle={`${rows.length} planned`} />
      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.title} title={`${g.title} (${g.items.length})`}>
            {g.items.length ? (
              <ul className="divide-y divide-line">
                {g.items.map((f) => (
                  <FollowUpRow key={f.id} f={f} returnTo="/follow-ups" />
                ))}
              </ul>
            ) : (
              <Empty>None.</Empty>
            )}
          </Card>
        ))}
        {recent.length > 0 && (
          <Card title="Recently finished">
            <ul className="divide-y divide-line text-sm">
              {recent.map((f) => (
                <li key={f.id} className="py-2 text-muted">
                  <span className={f.status === "cancelled" ? "line-through" : ""}>{f.purpose}</span> · {f.trading_name} · {f.status === "done" ? "done" : "cancelled"}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
