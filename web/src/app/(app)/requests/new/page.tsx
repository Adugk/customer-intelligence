import { notFound } from "next/navigation";
import { RequestFields } from "@/components/request-fields";
import { ErrorNote, PageHeader, Submit } from "@/components/ui";
import { createRequest } from "@/lib/actions/requests";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";

export default async function NewRequestPage({ searchParams }: PageProps<"/requests/new">) {
  const sp = await searchParams;
  const bid = typeof sp.customer === "string" && isUuid(sp.customer) ? sp.customer : null;
  if (!bid) notFound();
  const b = await one("select id, trading_name from business where id = $1", [bid]);
  if (!b) notFound();
  const reqId = typeof sp.need === "string" && isUuid(sp.need) ? sp.need : null;
  const [products, contacts, need] = await Promise.all([
    q("select id, name from product order by name"),
    q("select id, name from contact where business_id = $1 order by is_primary desc", [bid]),
    reqId ? one("select * from product_requirement where id = $1 and business_id = $2", [reqId, bid]) : Promise.resolve(undefined),
  ]);
  const prefill = need
    ? { description: need.customer_description, quantity: need.next_purchase_qty ?? need.qty_per_order, unit: need.unit, product_id: need.product_id, needed_by: need.next_purchase_date, use_type: "unsure" }
    : undefined;
  return (
    <div className="max-w-3xl">
      <PageHeader title="New request" subtitle={b.trading_name} back={{ href: `/customers/${bid}`, label: "Back to customer" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={createRequest} className="card space-y-4 p-4">
        <input type="hidden" name="business_id" value={bid} />
        {need && <input type="hidden" name="requirement_id" value={need.id} />}
        <RequestFields r={prefill} products={products} contacts={contacts} />
        <Submit>Save request</Submit>
      </form>
    </div>
  );
}
