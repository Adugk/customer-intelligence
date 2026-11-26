import { notFound } from "next/navigation";
import { Card, DateInput, Empty, ErrorNote, Field, NumberInput, PageHeader, StatusChip, Submit, Text } from "@/components/ui";
import { createGroup } from "@/lib/actions/groups";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { label } from "@/lib/options";

export default async function NewGroupPage({ searchParams }: PageProps<"/groups/new">) {
  const sp = await searchParams;
  const productId = typeof sp.product === "string" && isUuid(sp.product) ? sp.product : null;
  if (!productId) notFound();
  const product = await one("select * from product where id = $1", [productId]);
  if (!product) notFound();
  const candidates = await q(
    `select r.*, b.trading_name from product_requirement r join business b on b.id = r.business_id
     where r.product_id = $1 and r.archived_at is null and b.archived_at is null and b.confidentiality_level <> 'strict'
       and r.demand_status in ('interested','specified','qualified')
     order by r.demand_status = 'qualified' desc, b.trading_name`,
    [productId],
  );
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Start a buying group" subtitle={product.name} back={{ href: "/demand", label: "Demand" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={createGroup} className="space-y-4">
        <input type="hidden" name="product_id" value={productId} />
        <Card>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Group name *" className="sm:col-span-3">
              <Text name="name" required defaultValue={`${product.name} — ${month}`} />
            </Field>
            <Field label="Quantity needed (optional)" hint="For example the supplier's minimum order.">
              <NumberInput name="target_qty" />
            </Field>
            <Field label="Order by (optional)">
              <DateInput name="target_date" />
            </Field>
          </div>
        </Card>
        <Card title="Which customers?">
          {candidates.length === 0 ? (
            <Empty>No customer wants this product yet, or they are all marked “Keep fully private”.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {candidates.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" name="requirement_ids" value={r.id} defaultChecked className="h-5 w-5 accent-[var(--brand)]" />
                    <span className="min-w-0">
                      <span className="block font-medium">{r.trading_name}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <StatusChip status={r.demand_status} />
                        {r.brand_requirement && <span>Brand: {label(r.brand_requirement)}</span>}
                        {r.authenticity_required && <span>· {label(r.authenticity_required)}</span>}
                      </span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    Quantity
                    <input className="inp w-24" type="number" min={0} step="any" name={`qty_${r.id}`} defaultValue={String(r.next_purchase_qty ?? r.qty_per_order ?? "")} />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Everyone starts as “Interested”. Mark them confirmed on the group page once they place a written order or pay.</p>
        </Card>
        <Submit>Start group</Submit>
      </form>
    </div>
  );
}
