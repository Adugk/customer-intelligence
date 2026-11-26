import Link from "next/link";
import { Chip, Empty, PageHeader, StatusChip } from "@/components/ui";
import { q } from "@/lib/db";
import { fmtDate, fmtNum } from "@/lib/format";

export default async function GroupsPage() {
  const groups = await q(
    `select g.*, p.name as product_name, p.standard_unit,
       (select count(*)::int from buying_group_member m where m.group_id = g.id) as members,
       (select coalesce(sum(m.qty), 0) from buying_group_member m where m.group_id = g.id and m.commitment = 'confirmed') as confirmed_qty,
       (select coalesce(sum(m.qty), 0) from buying_group_member m where m.group_id = g.id) as total_qty
     from buying_group g join product p on p.id = g.product_id
     order by (g.status in ('done','cancelled')), g.created_at desc`,
  );
  return (
    <>
      <PageHeader
        title="Buying groups"
        subtitle="Several customers who want the same product, bought together. Each customer keeps their own quantity."
        back={{ href: "/demand", label: "Demand" }}
      />
      {groups.length === 0 ? (
        <Empty>No buying groups yet. Start one from the Demand page, on a product that several customers want.</Empty>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/groups/${g.id}`} className="card flex flex-col gap-2 p-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-sm text-muted">
                    {g.product_name} · {g.members} {g.members === 1 ? "customer" : "customers"}
                    {g.target_date && <> · by {fmtDate(g.target_date)}</>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip status={g.status} />
                  <Chip tone="ok">
                    {fmtNum(g.confirmed_qty)} confirmed
                  </Chip>
                  <Chip>
                    {fmtNum(g.total_qty)} in total{g.target_qty ? ` / ${fmtNum(g.target_qty)} needed` : ""}
                  </Chip>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
