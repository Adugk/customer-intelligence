import Link from "next/link";
import { Card, Chip, Empty, PageHeader } from "@/components/ui";
import { q, type Row } from "@/lib/db";
import { daysBetween, fmtNum, todayISO } from "@/lib/format";
import { basisWeight, label } from "@/lib/options";
import { monthlyDemand, nextPurchase } from "@/lib/scoring";

type Agg = {
  key: string;
  title: string;
  sub: string;
  href?: string;
  unit: string;
  businesses: Set<string>;
  statuses: Record<string, number>;
  confirmed: number;
  estimated: number;
  unknown: number;
  d30: number;
  d60: number;
  d90: number;
  prices: number[];
  brand: Set<string>;
  auth: Set<string>;
  reqs: Row[];
};

export default async function DemandPage() {
  const today = todayISO();
  const [reqs, problems, statusRows, mustHaves] = await Promise.all([
    q(
      `select r.*, b.trading_name, p.code as product_code, p.name as product_name, p.standard_unit, c.name as category_name
       from product_requirement r
       join business b on b.id = r.business_id
       left join product p on p.id = r.product_id
       left join product_category c on c.id = coalesce(p.category_id, r.category_id)
       where r.archived_at is null and b.archived_at is null and b.confidentiality_level <> 'strict'
         and r.demand_status in ('interested','specified','qualified')`,
    ),
    q(
      `select category, severity, count(*)::int as n from sourcing_problem sp join business b on b.id = sp.business_id
       where sp.status = 'active' and b.archived_at is null and b.confidentiality_level <> 'strict'
       group by category, severity`,
    ),
    q(
      `select r.demand_status, count(*)::int as n from product_requirement r join business b on b.id = r.business_id
       where r.archived_at is null and b.archived_at is null group by r.demand_status`,
    ),
    q(
      `select condition_type, count(*)::int as n from buying_condition bc join business b on b.id = bc.business_id
       where bc.importance = 'must_have' and b.archived_at is null group by condition_type order by n desc limit 8`,
    ),
  ]);

  const groups = new Map<string, Agg>();
  for (const r of reqs) {
    const key = r.product_id ? `p:${r.product_id}` : `c:${r.category_id ?? "none"}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        title: r.product_id ? r.product_name : `Not linked to a product — ${r.category_name ?? "no category"}`,
        sub: r.product_id ? (r.category_name ?? "") : "Link these to your product list so they add up correctly",
        href: r.product_id ? undefined : undefined,
        unit: r.standard_unit ?? r.unit ?? "piece",
        businesses: new Set(),
        statuses: {},
        confirmed: 0,
        estimated: 0,
        unknown: 0,
        d30: 0,
        d60: 0,
        d90: 0,
        prices: [],
        brand: new Set(),
        auth: new Set(),
        reqs: [],
      };
      groups.set(key, g);
    }
    g.businesses.add(r.business_id);
    g.statuses[r.demand_status] = (g.statuses[r.demand_status] ?? 0) + 1;
    g.reqs.push(r);
    const md = monthlyDemand(r);
    if (md.value != null) {
      const w = basisWeight(md.basis);
      if (w >= 1) g.confirmed += md.value;
      else if (w > 0) g.estimated += md.value;
      else g.unknown += md.value;
    }
    const np = nextPurchase(r);
    if (np.date) {
      const d = daysBetween(today, np.date);
      const qty = Number(r.next_purchase_qty ?? r.qty_per_order ?? 0);
      if (d >= 0 && d <= 30) g.d30 += qty;
      if (d >= 0 && d <= 60) g.d60 += qty;
      if (d >= 0 && d <= 90) g.d90 += qty;
    }
    if (r.current_unit_price != null && r.price_currency === "ETB" && basisWeight(r.price_basis) > 0) g.prices.push(Number(r.current_unit_price));
    if (r.brand_requirement) g.brand.add(r.brand_requirement);
    if (r.authenticity_required) g.auth.add(r.authenticity_required);
  }
  const openGroups = (await q("select count(*)::int as n from buying_group where status in ('forming','ordering')"))[0]?.n ?? 0;
  const list = [...groups.values()].sort((a, b) => b.confirmed + b.estimated - (a.confirmed + a.estimated) || b.businesses.size - a.businesses.size);

  const probCats = new Map<string, { total: number; high: number }>();
  for (const p of problems) {
    const e = probCats.get(p.category) ?? { total: 0, high: 0 };
    e.total += p.n;
    if (p.severity === "high" || p.severity === "critical") e.high += p.n;
    probCats.set(p.category, e);
  }
  const probList = [...probCats.entries()].sort((a, b) => b[1].total - a[1].total);
  const totalReqs = statusRows.reduce((s, r) => s + r.n, 0);
  const wellServed = statusRows.find((r) => r.demand_status === "well_served")?.n ?? 0;

  return (
    <>
      <PageHeader
        title="Demand"
        subtitle="How much your customers need, added up by product. Customers marked “Keep fully private” are left out."
        actions={
          <Link href="/groups" className="btn-ghost">
            Buying groups{openGroups > 0 ? ` (${openGroups})` : ""}
          </Link>
        }
      />
      {list.length === 0 ? (
        <Empty>No customer has said they want a product from us yet.</Empty>
      ) : (
        <div className="space-y-3">
          {list.map((g) => {
            const mixed = g.brand.size > 1 || g.auth.size > 1;
            return (
              <Card key={g.key}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{g.title}</div>
                    <div className="text-xs text-muted">{g.sub}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip tone="info">{g.businesses.size === 1 ? "1 customer" : `${g.businesses.size} customers`}</Chip>
                    {Object.entries(g.statuses).map(([s, n]) => (
                      <Chip key={s}>
                        {label(s)} {n}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Metric label={`Per month, confirmed (${g.unit})`} value={fmtNum(g.confirmed, 1)} />
                  <Metric label="+ our estimates" value={fmtNum(g.estimated, 1)} muted />
                  <Metric label="Expected in 30 / 60 / 90 days" value={`${fmtNum(g.d30)} / ${fmtNum(g.d60)} / ${fmtNum(g.d90)}`} />
                  <Metric label="What they pay now (ETB)" value={g.prices.length ? `${fmtNum(Math.min(...g.prices))} – ${fmtNum(Math.max(...g.prices))}` : "—"} />
                </div>
                {g.unknown > 0 && <p className="mt-2 text-xs text-muted">{fmtNum(g.unknown, 1)} more based on guesses — not counted.</p>}
                {mixed && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    Check before buying for them together — they want different things: brand ({[...g.brand].map(label).join(", ")}), genuine or generic ({[...g.auth].map(label).join(", ")}).
                  </p>
                )}
                {g.key.startsWith("p:") && g.businesses.size > 0 && (
                  <Link href={`/groups/new?product=${g.key.slice(2)}`} className="btn-ghost mt-3 min-h-9 px-3 text-xs">
                    Start a buying group
                  </Link>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-brand">Which customers ({g.reqs.length})</summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {g.reqs.map((r) => (
                      <li key={r.id}>
                        <Link href={`/requirements/${r.id}`} className="text-brand">
                          {r.customer_description}
                        </Link>{" "}
                        <span className="text-muted">· {r.trading_name} · {label(r.demand_status)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card title="Most common problems">
          {probList.length ? (
            <ul className="space-y-1 text-sm">
              {probList.map(([cat, v]) => (
                <li key={cat} className="flex justify-between gap-2">
                  <span>{label(cat)}</span>
                  <span className="tabular-nums text-muted">
                    {v.total} {v.high > 0 && <span className="text-red-700 dark:text-red-300">({v.high} serious)</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No problems recorded.</Empty>
          )}
        </Card>
        <Card title="Most common “must have” conditions">
          {mustHaves.length ? (
            <ul className="space-y-1 text-sm">
              {mustHaves.map((m) => (
                <li key={m.condition_type} className="flex justify-between">
                  <span>{label(m.condition_type)}</span>
                  <span className="tabular-nums text-muted">{m.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>None recorded yet.</Empty>
          )}
        </Card>
        <Card title="Already happy with their supplier">
          <div className="text-2xl font-semibold tabular-nums">{totalReqs ? Math.round((wellServed / totalReqs) * 100) : 0}%</div>
          <p className="text-sm text-muted">
            {wellServed} of {totalReqs} products. These customers are unlikely to switch.
          </p>
        </Card>
      </div>
    </>
  );
}

function Metric({ label: l, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className={`text-base font-semibold tabular-nums ${muted ? "text-muted" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{l}</div>
    </div>
  );
}
