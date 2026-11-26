import Link from "next/link";
import { notFound } from "next/navigation";
import { BranchForm, ConditionForm, ContactForm, FollowUpQuickForm, ProblemForm, PurchasingProfileForm, SourceForm } from "@/components/forms";
import { FollowUpRow } from "@/components/follow-up-row";
import { BasisBadge, Card, Chip, Details, Empty, ErrorNote, KV, List, ScorePill, StatusChip, Tabs } from "@/components/ui";
import { addRequirement } from "@/lib/actions/requirements";
import { addTag, deleteBranch, deleteContact, deleteItem, removeTag } from "@/lib/actions/customers";
import { linkCurrentSource } from "@/lib/actions/suppliers";
import { loadBusinessScoreData } from "@/lib/data";
import { q, type Row } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, displayPhone, fmtDate, fmtDateTime, fmtNum, relDays, todayISO } from "@/lib/format";
import { authorityLabel, label, SEVERITY_HELP } from "@/lib/options";
import { monthlyDemand, nextPurchase, scoreRequirement } from "@/lib/scoring";

const TABS = ["summary", "products", "problems", "people", "history"] as const;
type Tab = (typeof TABS)[number];
// Older links used these tab names; they still work.
const ALIASES: Record<string, Tab> = { overview: "summary", sourcing: "problems", conditions: "problems", contacts: "people", interactions: "history", opportunities: "history" };

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const raw = typeof sp.tab === "string" ? sp.tab : "summary";
  const tab: Tab = (TABS as readonly string[]).includes(raw) ? (raw as Tab) : (ALIASES[raw] ?? "summary");

  const [bizRows, branches, contacts, profileRows, reqs, sources, problems, conditions, interactions, followUps, opps, tags, categories] = await Promise.all([
    q("select b.*, r.trading_name as referred_by_name from business b left join business r on r.id = b.referred_by_business_id where b.id = $1", [id]),
    q("select * from branch where business_id = $1 order by is_main desc, created_at", [id]),
    q("select * from contact where business_id = $1 order by is_primary desc, created_at", [id]),
    q("select * from purchasing_profile where business_id = $1", [id]),
    q(
      `select r.*, c.name as category_name, p.code as product_code, p.name as product_name
       from product_requirement r left join product_category c on c.id = r.category_id left join product p on p.id = r.product_id
       where r.business_id = $1 and r.archived_at is null order by r.created_at`,
      [id],
    ),
    q("select * from current_source where business_id = $1 order by created_at", [id]),
    q("select * from sourcing_problem where business_id = $1 order by status, created_at desc", [id]),
    q("select * from buying_condition where business_id = $1 order by created_at", [id]),
    q(
      `select i.*,
         (select string_agg(c.name, ', ') from interaction_contact ic join contact c on c.id = ic.contact_id where ic.interaction_id = i.id) as contact_names,
         (select string_agg(r.customer_description, ', ') from interaction_requirement ir join product_requirement r on r.id = ir.requirement_id where ir.interaction_id = i.id) as products
       from interaction i where i.business_id = $1 order by i.occurred_at desc`,
      [id],
    ),
    q(
      `select f.*, c.name as contact_name, c.phone_primary from follow_up f left join contact c on c.id = f.contact_id
       where f.business_id = $1 and f.status = 'open' order by f.due_date`,
      [id],
    ),
    q(
      `select o.*, (select coalesce(sum(l.quantity * l.expected_unit_price), 0) from opportunity_line l where l.opportunity_id = o.id and l.currency = 'ETB') as est_value
       from opportunity o where o.business_id = $1 order by o.created_at desc`,
      [id],
    ),
    q("select t.id, t.name from business_tag bt join tag t on t.id = bt.tag_id where bt.business_id = $1 order by t.name", [id]),
    q("select id, name from product_category where parent_id is null order by sort_order"),
  ]);
  const b = bizRows[0];
  if (!b) notFound();
  const profile = profileRows[0];
  const work = await q(
    `select 'request' as kind, r.id, r.code, r.description as title, r.status, r.created_at from sourcing_request r where r.business_id = $1 and r.status in ('new','needs_details','ready','finding_suppliers','quote_sent')
     union all
     select 'order', o.id, o.code, (select string_agg(description, ', ') from customer_order_line where order_id = o.id), o.status, o.created_at from customer_order o where o.business_id = $1
     order by created_at desc limit 12`,
    [id],
  );
  const supplierList = tab === "problems" && sources.length ? await q("select id, display_name from supplier where archived_at is null order by display_name") : [];
  const ctxFor = await loadBusinessScoreData(id);
  const scored = reqs.map((r) => ({ r, ...scoreRequirement(r, ctxFor(r)), np: nextPurchase(r), md: monthlyDemand(r) }));
  const best = scored.reduce((m, s) => (["not_pursuing", "well_served"].includes(s.r.demand_status) ? m : Math.max(m, s.score)), 0);
  const primary = contacts[0];
  const main = branches[0];
  const today = todayISO();
  const reqList = reqs.map((r) => ({ id: r.id as string, customer_description: r.customer_description as string }));
  const reqName = (rid: string | null) => (rid ? (reqs.find((r) => r.id === rid)?.customer_description ?? "Removed product") : "All products");

  const tabs = [
    { key: "summary", label: "Summary" },
    { key: "products", label: "Products", count: reqs.length },
    { key: "problems", label: "Problems & suppliers", count: problems.filter((p) => p.status === "active").length },
    { key: "people", label: "People & places", count: contacts.length },
    { key: "history", label: "Conversations & deals", count: interactions.length },
  ].map((t) => ({ ...t, href: `/customers/${id}?tab=${t.key}` }));

  return (
    <>
      <div className="mb-4">
        <Link href="/customers" className="mb-2 inline-flex text-sm text-muted hover:text-ink">
          ← Customers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{b.trading_name}</h1>
            <p className="mt-1 text-sm text-muted">
              {label(b.business_type)}
              {main && (main.area || main.sub_city) && <> · {[...new Set([main.area, main.sub_city].filter(Boolean))].join(", ")}</>}
              {main?.gps_lat != null && (
                <>
                  {" · "}
                  <a className="text-brand" href={`https://www.google.com/maps?q=${main.gps_lat},${main.gps_lng}`} target="_blank" rel="noreferrer">
                    Map
                  </a>
                </>
              )}
              {" · "}
              {b.code}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusChip status={b.relationship_stage} />
              {b.confidentiality_level !== "standard" && <Chip tone="warn">🔒 {label(b.confidentiality_level)}</Chip>}
              {reqs.length > 0 && (
                <Link href={`/customers/${id}?tab=products`} className="inline-flex items-center gap-1.5 text-sm text-muted" title="The highest priority score among this customer's products">
                  Priority <ScorePill score={best} />
                </Link>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/customers/${id}/log`} className="btn-primary">
              Record conversation
            </Link>
            <Link href={`/requests/new?customer=${id}`} className="btn-ghost">
              New request
            </Link>
            <Link href={`/customers/${id}/edit`} className="btn-ghost">
              Edit
            </Link>
          </div>
        </div>
        {primary && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{primary.name}</span>
            {primary.job_title && <span className="text-muted">{primary.job_title}</span>}
            {primary.contact_permission === "asked_not_to_contact" ? (
              <Chip tone="danger">Asked us not to contact them</Chip>
            ) : (
              <>
                {primary.phone_primary && (
                  <a href={`tel:${primary.phone_primary}`} className="btn-ghost min-h-9 px-3 text-xs">
                    Call {displayPhone(primary.phone_primary)}
                  </a>
                )}
                {(primary.whatsapp || primary.phone_primary) && (
                  <a href={`https://wa.me/${String(primary.whatsapp || primary.phone_primary).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="btn-ghost min-h-9 px-3 text-xs">
                    WhatsApp
                  </a>
                )}
                {primary.telegram && (
                  <a href={`https://t.me/${String(primary.telegram).replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="btn-ghost min-h-9 px-3 text-xs">
                    Telegram
                  </a>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      {sp.merged && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Merged. Everything from the duplicate is now on this customer.</p>}
      {b.merged_into_business_id && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This customer was merged into another one.{" "}
          <Link href={`/customers/${b.merged_into_business_id}`} className="underline">
            Open the customer that was kept
          </Link>
        </p>
      )}
      <Tabs tabs={tabs} current={tab} />

      {tab === "summary" && (
        <>
          <Card title="Requests and orders" className="mb-4" action={<Link href={`/requests/new?customer=${id}`} className="text-sm text-brand">+ New request</Link>}>
            {work.length ? (
              <ul className="divide-y divide-line text-sm">
                {work.map((w) => (
                  <li key={w.id}>
                    <Link href={w.kind === "order" ? `/orders/${w.id}` : `/requests/${w.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="text-muted">{w.kind === "order" ? "Order" : "Request"} {w.code}</span> · {w.title}
                      </span>
                      <StatusChip status={w.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No requests or orders yet.</p>
            )}
          </Card>
          <Summary b={b} id={id} scored={scored} problems={problems} contacts={contacts} interactions={interactions} followUps={followUps} reqName={reqName} today={today} tags={tags} />
        </>
      )}

      {tab === "products" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Products this customer buys or wants regularly. Open one to add how much and how often they buy.</p>
          {scored.length === 0 && <Empty>No products yet.</Empty>}
          {scored.map(({ r, score, np, md }) => (
            <Link key={r.id} href={`/requirements/${r.id}`} className="card block p-4 hover:bg-surface-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{r.customer_description}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                    <StatusChip status={r.demand_status} />
                    {md.value != null && (
                      <span>
                        {fmtNum(md.value, 1)} {r.unit} a month
                      </span>
                    )}
                    {np.date && <span>Next purchase {fmtDate(np.date)}</span>}
                    {!r.product_code && <span className="text-amber-700 dark:text-amber-300">Not linked to your product list</span>}
                  </div>
                </div>
                <ScorePill score={score} />
              </div>
            </Link>
          ))}
          <Details summary="+ Add a product" open={scored.length === 0}>
            <form action={addRequirement} className="space-y-3">
              <input type="hidden" name="business_id" value={id} />
              <label className="block">
                <span className="lbl">Product, in the customer&apos;s words *</span>
                <input name="customer_description" className="inp" required maxLength={300} placeholder="e.g. 25W USB-C chargers" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="lbl">Category</span>
                  <select name="category_id" className="inp" defaultValue="">
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="lbl">Would they buy it from us?</span>
                  <select name="demand_status" className="inp" defaultValue="mentioned">
                    <option value="mentioned">Not sure yet (just mentioned)</option>
                    <option value="interested">Yes, interested</option>
                  </select>
                </label>
              </div>
              <button className="btn-primary">Add product</button>
            </form>
          </Details>
        </div>
      )}

      {tab === "problems" && (
        <div className="space-y-4">
          <Card title="Problems they have">
            {problems.length ? (
              <ul className="divide-y divide-line">
                {problems.map((p) => (
                  <li key={p.id} className={`py-3 ${p.status !== "active" ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={p.severity === "critical" || p.severity === "high" ? "danger" : p.severity === "medium" ? "warn" : "neutral"}>{SEVERITY_HELP[p.severity]?.split(" –")[0] ?? label(p.severity)}</Chip>
                        <span className="font-medium">{label(p.category)}</span>
                        <span className="text-sm text-muted">· {reqName(p.requirement_id)}</span>
                      </div>
                      <BasisBadge basis={p.basis} verifiedAt={p.last_confirmed_at} />
                    </div>
                    <p className="mt-1 text-sm">“{p.description}”</p>
                    <p className="text-xs text-muted">
                      How often: {label(p.frequency)}
                      {p.current_workaround && <> · What they do now: {p.current_workaround}</>} · Can we help: {label(p.addressable_by_us)}
                      {p.status !== "active" && <> · {label(p.status)}</>}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Details summary="Edit">
                        <ProblemForm businessId={id} p={p} requirements={reqList} sources={sources} />
                      </Details>
                      <DeleteButton businessId={id} kind="problem" itemId={p.id} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No problems recorded. If they are happy with their suppliers, say so under Edit.</Empty>
            )}
            <div className="mt-3">
              <Details summary="+ Add a problem">
                <ProblemForm businessId={id} requirements={reqList} sources={sources} />
              </Details>
            </div>
          </Card>

          <Card title="Their conditions" action={<span className="text-xs text-muted">What we must meet to win the sale</span>}>
            {conditions.length ? (
              <ul className="divide-y divide-line">
                {conditions.map((c) => (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={c.importance === "must_have" ? "warn" : "neutral"}>{label(c.importance)}</Chip>
                        <span className="font-medium">{label(c.condition_type)}</span>
                        <span className="text-sm text-muted">· {reqName(c.requirement_id)}</span>
                      </div>
                      <BasisBadge basis={c.basis} verifiedAt={c.verified_at} />
                    </div>
                    <p className="mt-1 text-sm">
                      {c.detail}
                      {c.exclusivity_scope && <span className="text-muted"> — {c.exclusivity_scope}</span>}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Details summary="Edit">
                        <ConditionForm businessId={id} c={c} requirements={reqList} />
                      </Details>
                      <DeleteButton businessId={id} kind="condition" itemId={c.id} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No conditions recorded yet.</Empty>
            )}
            <div className="mt-3">
              <Details summary="+ Add a condition">
                <ConditionForm businessId={id} requirements={reqList} />
              </Details>
            </div>
          </Card>

          <Card title="Where they buy now">
            {sources.length ? (
              <ul className="divide-y divide-line">
                {sources.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{label(s.source_type)}</span>
                        <span className="text-sm text-muted">
                          {s.source_origin && ` · ${label(s.source_origin)}`} · {reqName(s.requirement_id)}
                        </span>
                      </div>
                      <BasisBadge basis={s.basis} verifiedAt={s.verified_at} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Good at: <List value={s.strengths} /> · How happy: {label(s.satisfaction)} · Supplier name:{" "}
                      {s.name_disclosure === "disclosed" ? (
                        <details className="inline">
                          <summary className="inline cursor-pointer text-brand">show</summary> {s.supplier_name}
                        </details>
                      ) : (
                        label(s.name_disclosure)
                      )}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Details summary="Edit">
                        <SourceForm businessId={id} s={s} requirements={reqList} />
                      </Details>
                      <DeleteButton businessId={id} kind="source" itemId={s.id} />
                    </div>
                    {supplierList.length > 0 && (
                      <form action={linkCurrentSource} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <input type="hidden" name="business_id" value={id} />
                        <input type="hidden" name="source_id" value={s.id} />
                        <span className="text-muted">Same as a supplier in your list?</span>
                        <select name="supplier_id" defaultValue={s.supplier_id ?? ""} className="inp w-auto py-1.5">
                          <option value="">No / don&apos;t know</option>
                          {supplierList.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.display_name}
                            </option>
                          ))}
                        </select>
                        <button className="btn-ghost min-h-9 px-3 text-xs">Save</button>
                        {s.supplier_id && (
                          <Link href={`/suppliers/${s.supplier_id}`} className="text-brand">
                            Open supplier
                          </Link>
                        )}
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Not recorded. The type of supplier is enough — names are optional.</Empty>
            )}
            <div className="mt-3">
              <Details summary="+ Add where they buy">
                <SourceForm businessId={id} requirements={reqList} />
              </Details>
            </div>
          </Card>

          <Card title="How they buy" action={profile?.basis ? <BasisBadge basis={profile.basis} verifiedAt={profile.verified_at} staleAfterDays={365} /> : null}>
            {profile ? (
              <KV
                items={[
                  ["How they restock", profile.restock_process],
                  ["Buys from", <List key="s" value={profile.source_types_used} />],
                  ["Pays by", <List key="p" value={profile.payment_methods_used} />],
                  ["Payment timing", label(profile.payment_timing) + (profile.credit_days_expected ? ` (${profile.credit_days_expected} days)` : "")],
                  ["Gets goods by", <List key="g" value={profile.goods_receipt_method} />],
                  ["Needs receipt", label(profile.needs_formal_receipt)],
                  ["What limits them", <List key="c" value={profile.purchasing_constraints} />],
                ]}
              />
            ) : (
              <Empty>Not asked yet. This is usually the second conversation.</Empty>
            )}
            <div className="mt-3">
              <Details summary={profile ? "Edit" : "+ Record how they buy"}>
                <PurchasingProfileForm businessId={id} p={profile} />
              </Details>
            </div>
          </Card>
        </div>
      )}

      {tab === "people" && (
        <div className="space-y-4">
          <Card title="People">
            {contacts.length ? (
              <ul className="divide-y divide-line">
                {contacts.map((c) => (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.is_primary && <Chip tone="info">Main contact</Chip>}
                        {c.job_title && <span className="text-sm text-muted">{c.job_title}</span>}
                      </div>
                      <BasisBadge basis={c.authority_basis} verifiedAt={c.authority_verified_at} staleAfterDays={365} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      Can decide to buy: {authorityLabel(c.purchasing_authority)} · Can approve payment: {authorityLabel(c.payment_authority)}
                    </p>
                    <p className="text-sm text-muted">
                      {displayPhone(c.phone_primary)} {c.telegram && `· Telegram ${c.telegram}`} {c.email && `· ${c.email}`} · May we contact them: {label(c.contact_permission)}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Details summary="Edit">
                        <ContactForm businessId={id} c={c} branches={branches} />
                      </Details>
                      <form action={deleteContact}>
                        <input type="hidden" name="business_id" value={id} />
                        <input type="hidden" name="contact_id" value={c.id} />
                        <button className="btn-danger min-h-12">Delete</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No people yet.</Empty>
            )}
            <div className="mt-3">
              <Details summary="+ Add a person">
                <ContactForm businessId={id} branches={branches} />
              </Details>
            </div>
          </Card>
          <Card title="Shops and branches">
            <ul className="divide-y divide-line">
              {branches.map((br) => (
                <li key={br.id} className="py-3">
                  <div className="flex items-center gap-2 font-medium">
                    {br.branch_label} {br.is_main && <Chip tone="info">Main</Chip>}
                  </div>
                  <p className="text-sm text-muted">
                    {[br.area, br.sub_city, br.woreda && `Woreda ${br.woreda}`, br.city].filter(Boolean).join(", ")}
                    {br.directions && ` — ${br.directions}`}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Details summary="Edit">
                      <BranchForm businessId={id} b={br} />
                    </Details>
                    {!br.is_main && (
                      <form action={deleteBranch}>
                        <input type="hidden" name="business_id" value={id} />
                        <input type="hidden" name="branch_id" value={br.id} />
                        <button className="btn-danger min-h-12">Delete</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Details summary="+ Add a shop or branch">
                <BranchForm businessId={id} />
              </Details>
            </div>
          </Card>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          <Card title="Deals" action={<span className="text-xs text-muted">Start a deal from a product marked “Ready to quote”</span>}>
            {opps.length ? (
              <ul className="divide-y divide-line">
                {opps.map((o) => (
                  <li key={o.id}>
                    <Link href={`/opportunities/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span className="font-medium">{o.title}</span>
                      <span className="flex flex-wrap gap-1.5">
                        <StatusChip status={o.stage} />
                        {Number(o.est_value) > 0 && <Chip>about {fmtNum(o.est_value)} ETB</Chip>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No deals yet.</p>
            )}
          </Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <Link href={`/customers/${id}/log`} className="btn-primary">
              + Record conversation
            </Link>
          </div>
          {interactions.length === 0 && <Empty>No conversations recorded yet.</Empty>}
          <ol className="space-y-3">
            {interactions.map((i) => (
              <li key={i.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{fmtDateTime(i.occurred_at)}</span>
                  <span className="text-muted">
                    {label(i.channel)} · {label(i.outcome)}
                  </span>
                </div>
                <p className="mt-1 font-medium">{i.summary}</p>
                {(i.contact_names || i.products) && (
                  <p className="text-xs text-muted">
                    {i.contact_names && <>With {i.contact_names}</>} {i.products && <>· About {i.products}</>}
                  </p>
                )}
                {(i.customer_statements || i.our_observations || i.our_interpretation) && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {i.customer_statements && <Evidence kind="said" text={i.customer_statements} />}
                    {i.our_observations && <Evidence kind="observed" text={i.our_observations} />}
                    {i.our_interpretation && <Evidence kind="internal" text={i.our_interpretation} />}
                  </div>
                )}
                {(i.customer_commitments || i.our_commitments) && (
                  <div className="mt-2 text-sm">
                    {i.customer_commitments && <div>They will: {i.customer_commitments}</div>}
                    {i.our_commitments && <div>We will: {i.our_commitments}</div>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function Evidence({ kind, text }: { kind: "said" | "observed" | "internal"; text: string }) {
  const meta = {
    said: { title: "Customer said", cls: "border-line bg-surface-2" },
    observed: { title: "We saw", cls: "border-line bg-surface-2" },
    internal: { title: "Our opinion (private)", cls: "border-amber-200 bg-internal dark:border-amber-900" },
  }[kind];
  return (
    <div className={`rounded-lg border p-2 text-sm ${meta.cls}`}>
      <div className="text-xs font-semibold text-muted">{meta.title}</div>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function DeleteButton({ businessId, kind, itemId }: { businessId: string; kind: string; itemId: string }) {
  return (
    <form action={deleteItem}>
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="item_id" value={itemId} />
      <button className="btn-danger min-h-12">Delete</button>
    </form>
  );
}

type Scored = { r: Row; score: number; np: { date: string | null; predicted: boolean }; md: { value: number | null } };

function Summary(props: {
  b: Row; id: string; scored: Scored[]; problems: Row[]; contacts: Row[]; interactions: Row[]; followUps: Row[];
  reqName: (id: string | null) => string; today: string; tags: Row[];
}) {
  const { b, id, scored, problems, contacts, interactions, followUps, reqName, today, tags } = props;
  const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const activeProblems = problems.filter((p) => p.status === "active").sort((a, c) => (sevRank[c.severity] ?? 0) - (sevRank[a.severity] ?? 0)).slice(0, 3);
  const deciders = contacts.filter((c) => ["final", "shared"].includes(c.purchasing_authority) || ["final", "shared"].includes(c.payment_authority));
  const last = interactions[0];
  const upcoming = scored.filter((s) => s.np.date && s.np.date >= today).sort((a, c) => (a.np.date! < c.np.date! ? -1 : 1));
  const top = [...scored].filter((s) => !["not_pursuing", "well_served"].includes(s.r.demand_status)).sort((a, c) => c.score - a.score).slice(0, 4);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Next step" className="md:col-span-2">
        {followUps.length ? (
          <ul className="divide-y divide-line">
            {followUps.map((f) => (
              <FollowUpRow key={f.id} f={{ ...f, trading_name: b.trading_name }} returnTo={`/customers/${id}`} showBusiness={false} />
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-sm text-amber-700 dark:text-amber-300">No follow-up planned. Plan one so this customer isn&apos;t forgotten.</p>
        )}
        <div className="mt-2">
          <Details summary="+ Plan a follow-up">
            <FollowUpQuickForm businessId={id} contacts={contacts} returnTo={`/customers/${id}`} defaultDate={addDays(today, 3)} />
          </Details>
        </div>
      </Card>

      <Card title="Products they need" action={<Link href={`/customers/${id}?tab=products`} className="text-sm text-brand">All products</Link>}>
        {top.length ? (
          <ul className="space-y-2 text-sm">
            {top.map((s) => (
              <li key={s.r.id}>
                <Link href={`/requirements/${s.r.id}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.r.customer_description}</span>
                    <span className="text-xs text-muted">
                      {label(s.r.demand_status)}
                      {s.md.value != null && ` · ${fmtNum(s.md.value, 1)} ${s.r.unit} a month`}
                    </span>
                  </span>
                  <ScorePill score={s.score} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No products recorded yet.</p>
        )}
        {upcoming[0] && (
          <p className="mt-3 border-t border-line pt-2 text-sm">
            <span className="text-muted">Next purchase:</span> <span className="font-medium">{fmtDate(upcoming[0].np.date)}</span> ({relDays(upcoming[0].np.date)}) — {upcoming[0].r.customer_description}
            {upcoming[0].np.predicted && <span className="text-muted"> · worked out from how often they buy</span>}
          </p>
        )}
      </Card>

      <Card title="Main problems" action={<Link href={`/customers/${id}?tab=problems`} className="text-sm text-brand">All</Link>}>
        {activeProblems.length ? (
          <ul className="space-y-2 text-sm">
            {activeProblems.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{label(p.category)}</span> <span className="text-muted">— {SEVERITY_HELP[p.severity]?.split("– ")[1] ?? label(p.severity)}</span>
                <div className="text-xs text-muted">{reqName(p.requirement_id)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{b.sourcing_status === "well_served" ? "They are happy with their current suppliers." : "No problems recorded yet."}</p>
        )}
      </Card>

      <Card title="Who decides" action={<Link href={`/customers/${id}?tab=people`} className="text-sm text-brand">People</Link>}>
        {deciders.length ? (
          <ul className="space-y-1 text-sm">
            {deciders.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.name}</span>
                <span className="text-muted">
                  {" "}
                  — decides to buy: {authorityLabel(c.purchasing_authority)}, approves payment: {authorityLabel(c.payment_authority)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Not known yet. Find out who decides and who pays.</p>
        )}
      </Card>

      <Card title="Last conversation" action={<Link href={`/customers/${id}?tab=history`} className="text-sm text-brand">History</Link>}>
        {last ? (
          <div className="text-sm">
            <div className="font-medium">
              {fmtDateTime(last.occurred_at)} · {label(last.channel)}
            </div>
            <p className="text-muted">{last.summary}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No conversations recorded yet.</p>
        )}
        <TagLine id={id} tags={tags} />
      </Card>
    </div>
  );
}

function TagLine({ id, tags }: { id: string; tags: Row[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
      <span className="text-xs text-muted">Tags:</span>
      {tags.map((t) => (
        <form key={t.id} action={removeTag} className="inline">
          <input type="hidden" name="business_id" value={id} />
          <input type="hidden" name="tag_id" value={t.id} />
          <button className="chip bg-surface-2 text-muted hover:line-through" title="Remove tag">
            {t.name} ✕
          </button>
        </form>
      ))}
      <form action={addTag} className="inline-flex">
        <input type="hidden" name="business_id" value={id} />
        <input name="tag" placeholder="+ add tag" aria-label="Add tag" className="w-24 rounded-full border border-dashed border-line bg-transparent px-2 py-0.5 text-xs focus:w-36 focus:outline-none" />
      </form>
    </div>
  );
}
