import Link from "next/link";
import { Chip, Empty, PageHeader, StatusChip } from "@/components/ui";
import { q } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { isOneOf, label, OPT } from "@/lib/options";

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const search = get("q").trim();
  const check = get("check");
  const sector = get("sector");
  const country = get("country");

  const where = ["s.archived_at is null"];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (search) {
    const s = p(`%${search.replace(/[%_]/g, "")}%`);
    where.push(`(s.display_name ilike ${s} or s.legal_name ilike ${s} or s.brands ilike ${s} or s.code ilike ${s}
      or exists (select 1 from supplier_offer o left join product pr on pr.id = o.product_id where o.supplier_id = s.id and (o.offer_name ilike ${s} or o.brand ilike ${s} or o.model_sku ilike ${s} or pr.name ilike ${s}))
      or exists (select 1 from supplier_contact c where c.supplier_id = s.id and c.name ilike ${s}))`);
  }
  if (isOneOf(OPT.verification, check)) where.push(`s.verification_status = ${p(check)}`);
  if (isOneOf(OPT.sectors, sector)) where.push(`s.categories ? ${p(sector)}`);
  if (country) where.push(`s.country = ${p(country)}`);

  const rows = await q(
    `select s.*,
       (select count(*)::int from supplier_offer o where o.supplier_id = s.id and o.is_active) as offers,
       (select max(i.occurred_at) from interaction i where i.supplier_id = s.id) as last_contact,
       (select min(f.due_date) from follow_up f where f.supplier_id = s.id and f.status = 'open') as next_follow_up
     from supplier s where ${where.join(" and ")} order by s.updated_at desc limit 300`,
    params,
  );
  const countries = await q("select distinct country from supplier where archived_at is null order by country");
  const filtered = [check, sector, country].some(Boolean);

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle={`${rows.length} ${rows.length === 1 ? "supplier" : "suppliers"}${filtered || search ? " found" : ""}`}
        actions={
          <Link href="/suppliers/new" className="btn-primary">
            + Add supplier
          </Link>
        }
      />
      <form className="card mb-4 space-y-3 p-3" role="search">
        <input className="inp" name="q" defaultValue={search} placeholder="Search by name, brand, product or person…" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select name="check" defaultValue={check} className="inp">
            <option value="">Any check status</option>
            {OPT.verification.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
          <select name="sector" defaultValue={sector} className="inp">
            <option value="">Any products</option>
            {OPT.sectors.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
          <select name="country" defaultValue={country} className="inp">
            <option value="">Any country</option>
            {countries.map((c) => (
              <option key={c.country} value={c.country}>
                {c.country}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">Search</button>
          {(filtered || search) && (
            <Link href="/suppliers" className="btn-ghost">
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{filtered || search ? "No suppliers found. Try fewer filters." : "No suppliers yet. Tap “Add supplier” to add the first one."}</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.id}>
              <Link href={`/suppliers/${s.id}`} className="card flex flex-col gap-2 p-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.display_name}</span>
                    <span className="text-xs text-muted">{s.code}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted">
                    {label(s.supplier_type)} · {[s.city, s.country].filter(Boolean).join(", ")}
                    {s.brands && <> · {s.brands}</>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                  <StatusChip status={s.verification_status} />
                  <Chip>{s.offers} {s.offers === 1 ? "product" : "products"}</Chip>
                  {s.next_follow_up && <Chip tone="info">Follow-up {fmtDate(s.next_follow_up)}</Chip>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
