import Link from "next/link";
import { Chip, Empty, PageHeader } from "@/components/ui";
import { q } from "@/lib/db";
import { displayPhone, fmtDate, todayISO } from "@/lib/format";
import { isOneOf, label, OPT } from "@/lib/options";

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const search = get("q").trim();
  const type = get("type");
  const sector = get("sector");
  const stage = get("stage");
  const sourcing = get("sourcing");
  const subCity = get("sub_city");
  const has = get("has");
  const tag = get("tag");

  const where: string[] = ["b.archived_at is null"];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (search) {
    const s = p(`%${search.replace(/[%_]/g, "")}%`);
    const digits = search.replace(/\D/g, "");
    where.push(`(b.trading_name ilike ${s} or b.alternate_names ilike ${s} or b.code ilike ${s}
      or exists (select 1 from product_requirement r where r.business_id = b.id and r.customer_description ilike ${s})
      or exists (select 1 from contact c where c.business_id = b.id and c.name ilike ${s})
      ${digits.length >= 4 ? `or exists (select 1 from contact c where c.business_id = b.id and c.phone_primary like ${p(`%${digits.slice(-8)}%`)})` : ""})`);
  }
  if (isOneOf(OPT.businessType, type)) where.push(`b.business_type = ${p(type)}`);
  if (isOneOf(OPT.sectors, sector)) where.push(`b.sectors ? ${p(sector)}`);
  if (isOneOf(OPT.relationshipStage, stage)) where.push(`b.relationship_stage = ${p(stage)}`);
  if (isOneOf(OPT.sourcingStatus, sourcing)) where.push(`b.sourcing_status = ${p(sourcing)}`);
  if (isOneOf(OPT.subCity, subCity)) where.push(`exists (select 1 from branch br where br.business_id = b.id and br.sub_city = ${p(subCity)})`);
  if (has === "active") where.push(`exists (select 1 from product_requirement r where r.business_id = b.id and r.archived_at is null and r.demand_status in ('interested','specified','qualified'))`);
  if (has === "qualified") where.push(`exists (select 1 from product_requirement r where r.business_id = b.id and r.archived_at is null and r.demand_status = 'qualified')`);
  if (tag) where.push(`exists (select 1 from business_tag bt join tag t on t.id = bt.tag_id where bt.business_id = b.id and t.name = ${p(tag)})`);

  const rows = await q(
    `select b.id, b.code, b.trading_name, b.business_type, b.relationship_stage, b.sourcing_status, b.sectors,
       (select concat_ws(', ', br.area, br.sub_city) from branch br where br.business_id = b.id order by br.is_main desc limit 1) as location,
       (select c.name from contact c where c.business_id = b.id order by c.is_primary desc, c.created_at limit 1) as contact_name,
       (select c.phone_primary from contact c where c.business_id = b.id order by c.is_primary desc, c.created_at limit 1) as phone,
       (select count(*)::int from product_requirement r where r.business_id = b.id and r.archived_at is null) as reqs,
       (select min(f.due_date) from follow_up f where f.business_id = b.id and f.status = 'open') as next_follow_up,
       (select max(i.occurred_at) from interaction i where i.business_id = b.id) as last_contact
     from business b where ${where.join(" and ")}
     order by b.updated_at desc limit 300`,
    params,
  );
  const tags = await q("select name from tag order by name");
  const today = todayISO();
  const filtered = [type, sector, stage, sourcing, subCity, has, tag].some(Boolean);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${rows.length} ${rows.length === 1 ? "business" : "businesses"}${filtered || search ? " matching" : ""}`}
        actions={
          <Link href="/customers/new" className="btn-primary">
            + Quick capture
          </Link>
        }
      />
      <form className="card mb-4 space-y-3 p-3" role="search">
        <input className="inp" name="q" defaultValue={search} placeholder="Search name, phone, contact or product…" />
        <details open={filtered}>
          <summary className="cursor-pointer text-sm font-medium text-muted">Filters</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Sel name="type" value={type} options={OPT.businessType} placeholder="Any type" />
            <Sel name="sector" value={sector} options={OPT.sectors} placeholder="Any sector" />
            <Sel name="stage" value={stage} options={OPT.relationshipStage} placeholder="Any stage" />
            <Sel name="sourcing" value={sourcing} options={OPT.sourcingStatus} placeholder="Any sourcing status" />
            <Sel name="sub_city" value={subCity} options={OPT.subCity} placeholder="Any sub-city" />
            <Sel name="has" value={has} options={["active", "qualified"]} placeholder="Any requirements" labels={{ active: "Has active requirement", qualified: "Has qualified requirement" }} />
            <Sel name="tag" value={tag} options={tags.map((t) => t.name as string)} placeholder="Any tag" />
          </div>
        </details>
        <div className="flex gap-2">
          <button className="btn-primary">Apply</button>
          {(filtered || search) && (
            <Link href="/customers" className="btn-ghost">
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>
          {filtered || search ? "No businesses match these filters." : "No customers yet. Use Quick capture to add the first business."}
        </Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((b) => {
            const nf = b.next_follow_up ? String(b.next_follow_up) : null;
            return (
              <li key={b.id}>
                <Link href={`/customers/${b.id}`} className="card flex flex-col gap-2 p-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{b.trading_name}</span>
                      <span className="text-xs text-muted">{b.code}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-muted">
                      {label(b.business_type)}
                      {b.location && <> · {b.location}</>}
                      {b.contact_name && <> · {b.contact_name}</>}
                      {b.phone && <> · {displayPhone(b.phone)}</>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <Chip tone="brand">{label(b.relationship_stage)}</Chip>
                    {b.sourcing_status !== "unknown" && <Chip tone={b.sourcing_status === "underserved" ? "warn" : "neutral"}>{label(b.sourcing_status)}</Chip>}
                    <Chip>{b.reqs} req</Chip>
                    {nf ? <Chip tone={nf < today ? "danger" : "info"}>Next: {fmtDate(nf)}</Chip> : <Chip>No follow-up</Chip>}
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

function Sel({ name, value, options, placeholder, labels }: { name: string; value: string; options: readonly string[]; placeholder: string; labels?: Record<string, string> }) {
  return (
    <select name={name} defaultValue={value} className="inp">
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? label(o)}
        </option>
      ))}
    </select>
  );
}
