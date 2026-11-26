import Link from "next/link";
import { Chip, Empty, PageHeader, StatusChip } from "@/components/ui";
import { q } from "@/lib/db";
import { fmtDate, fmtNum } from "@/lib/format";

export default async function OrdersPage({ searchParams }: PageProps<"/orders">) {
  const sp = await searchParams;
  const view = sp.view === "supplier" ? "supplier" : "customer";
  const showDone = sp.done === "1";
  const orders =
    view === "customer"
      ? await q(
          `select o.*, b.trading_name,
             (select string_agg(ol.description, ', ') from customer_order_line ol where ol.order_id = o.id) as products,
             (select sum(ol.qty * ol.unit_price) from customer_order_line ol where ol.order_id = o.id) as goods
           from customer_order o join business b on b.id = o.business_id
           ${showDone ? "" : "where o.status not in ('closed','cancelled')"} order by o.created_at desc limit 300`,
        )
      : await q(
          `select po.*, s.display_name,
             (select string_agg(pl.description, ', ') from purchase_order_line pl where pl.po_id = po.id) as products,
             (select sum(pl.qty * pl.unit_price) from purchase_order_line pl where pl.po_id = po.id) as total
           from purchase_order po join supplier s on s.id = po.supplier_id
           ${showDone ? "" : "where po.status not in ('closed','cancelled')"} order by po.created_at desc limit 300`,
        );
  return (
    <>
      <PageHeader title="Orders" subtitle="Customer orders are what customers confirmed. Supplier orders are what you buy to fill them." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/orders?view=customer" className={`chip min-h-9 px-3 text-sm ${view === "customer" ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
          Customer orders
        </Link>
        <Link href="/orders?view=supplier" className={`chip min-h-9 px-3 text-sm ${view === "supplier" ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
          Supplier orders
        </Link>
        <Link href={`/orders?view=${view}${showDone ? "" : "&done=1"}`} className="chip min-h-9 bg-surface-2 px-3 text-sm text-muted">
          {showDone ? "Hide finished" : "Show finished too"}
        </Link>
      </div>
      {orders.length === 0 ? (
        <Empty>{view === "customer" ? "No customer orders yet. An order starts when a customer accepts a price in writing or pays." : "No supplier orders yet. Create one from a sourcing case once a customer order is confirmed."}</Empty>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={view === "customer" ? `/orders/${o.id}` : `/purchase-orders/${o.id}`} className="card flex flex-col gap-2 p-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold">{view === "customer" ? o.trading_name : o.display_name}</div>
                  <div className="truncate text-sm text-muted">
                    {o.code} · {o.products}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  <StatusChip status={o.status} />
                  <Chip>
                    {fmtNum(view === "customer" ? o.goods : o.total, 2)} {o.currency}
                  </Chip>
                  <Chip>{fmtDate(view === "customer" ? o.confirmed_at : o.order_date)}</Chip>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
