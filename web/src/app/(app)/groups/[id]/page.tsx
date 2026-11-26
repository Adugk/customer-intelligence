import Link from "next/link";
import { notFound } from "next/navigation";
import { Area, Card, Chip, DateInput, Details, Empty, ErrorNote, Field, NumberInput, PageHeader, Select, StatusChip, Submit, Text } from "@/components/ui";
import { addGroupMember, updateGroup, updateGroupMember } from "@/lib/actions/groups";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { fmtDate, fmtNum } from "@/lib/format";
import { label, OPT } from "@/lib/options";

export default async function GroupPage({ params, searchParams }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const g = await one("select g.*, p.name as product_name, p.standard_unit from buying_group g join product p on p.id = g.product_id where g.id = $1", [id]);
  if (!g) notFound();
  const [members, candidates] = await Promise.all([
    q(
      `select m.*, r.customer_description, r.demand_status, r.brand_requirement, r.authenticity_required, r.business_id, b.trading_name
       from buying_group_member m join product_requirement r on r.id = m.requirement_id join business b on b.id = r.business_id
       where m.group_id = $1 order by b.trading_name`,
      [id],
    ),
    q(
      `select r.id, r.next_purchase_qty, r.qty_per_order, b.trading_name from product_requirement r join business b on b.id = r.business_id
       where r.product_id = $1 and r.archived_at is null and b.archived_at is null and b.confidentiality_level <> 'strict'
         and r.demand_status in ('interested','specified','qualified')
         and not exists (select 1 from buying_group_member m where m.group_id = $2 and m.requirement_id = r.id)
       order by b.trading_name`,
      [g.product_id, id],
    ),
  ]);
  const unit = g.standard_unit ?? "piece";
  const total = members.reduce((s, m) => s + Number(m.qty), 0);
  const confirmed = members.filter((m) => m.commitment === "confirmed").reduce((s, m) => s + Number(m.qty), 0);
  const target = g.target_qty != null ? Number(g.target_qty) : null;
  const short = target != null ? Math.max(0, target - confirmed) : null;
  const brands = new Set(members.map((m) => m.brand_requirement).filter(Boolean));
  const auth = new Set(members.map((m) => m.authenticity_required).filter(Boolean));

  return (
    <div className="max-w-4xl">
      <PageHeader title={g.name} subtitle={`${g.code} · ${g.product_name}`} back={{ href: "/groups", label: "Buying groups" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Confirmed (${unit}s)`} value={fmtNum(confirmed)} />
        <Stat label="Interested only" value={fmtNum(total - confirmed)} />
        <Stat label="Quantity needed" value={target != null ? fmtNum(target) : "—"} />
        <Stat label="Still missing (confirmed)" value={short != null ? fmtNum(short) : "—"} warn={short != null && short > 0} />
      </div>
      {(brands.size > 1 || auth.size > 1) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Check before ordering: these customers want different things — brand ({[...brands].map(label).join(", ")}){auth.size > 1 && <>, genuine or generic ({[...auth].map(label).join(", ")})</>}.
        </p>
      )}

      <Card title="Customers in this group" action={<StatusChip status={g.status} />}>
        {members.length === 0 ? (
          <Empty>No customers yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/customers/${m.business_id}`} className="font-medium text-brand">
                    {m.trading_name}
                  </Link>
                  <Chip tone={m.commitment === "confirmed" ? "ok" : "neutral"}>{m.commitment === "confirmed" ? "Confirmed order" : "Interested only"}</Chip>
                </div>
                <form action={updateGroupMember} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="group_id" value={id} />
                  <input type="hidden" name="member_id" value={m.id} />
                  <label className="text-sm">
                    <span className="lbl">Quantity</span>
                    <input className="inp w-28" type="number" min={0} step="any" name="qty" defaultValue={String(m.qty)} />
                  </label>
                  <label className="text-sm">
                    <span className="lbl">How firm?</span>
                    <select className="inp" name="commitment" defaultValue={m.commitment}>
                      <option value="interested">Interested only</option>
                      <option value="confirmed">Confirmed (written order or paid)</option>
                    </select>
                  </label>
                  <button className="btn-ghost" name="op" value="save">
                    Save
                  </button>
                  <button className="btn-danger" name="op" value="remove">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {candidates.length > 0 && (
          <div className="mt-3">
            <Details summary="+ Add a customer">
              <form action={addGroupMember} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="group_id" value={id} />
                <label className="text-sm">
                  <span className="lbl">Customer</span>
                  <select className="inp" name="requirement_id" required defaultValue="">
                    <option value="" disabled>
                      — Choose —
                    </option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.trading_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="lbl">Quantity</span>
                  <input className="inp w-28" type="number" min={0} step="any" name="qty" required />
                </label>
                <button className="btn-primary">Add</button>
              </form>
            </Details>
          </div>
        )}
      </Card>

      <div className="mt-4">
        <Details summary="Group details">
          <form action={updateGroup} className="space-y-3">
            <input type="hidden" name="group_id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Text name="name" defaultValue={g.name} />
              </Field>
              <Field label="Status">
                <Select name="status" options={OPT.groupStatus} defaultValue={g.status} blank={false} />
              </Field>
              <Field label="Quantity needed" hint="For example the supplier's minimum order.">
                <NumberInput name="target_qty" defaultValue={g.target_qty} />
              </Field>
              <Field label="Order by">
                <DateInput name="target_date" defaultValue={g.target_date} />
              </Field>
            </div>
            <Field label="Notes">
              <Area name="notes" defaultValue={g.notes} rows={2} />
            </Field>
            <Submit>Save</Submit>
          </form>
        </Details>
      </div>
      {g.target_date && <p className="mt-3 text-xs text-muted">Order by {fmtDate(g.target_date)}.</p>}
    </div>
  );
}

function Stat({ label: l, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card p-3">
      <div className={`text-lg font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{l}</div>
    </div>
  );
}
