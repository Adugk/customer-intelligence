import Link from "next/link";
import { notFound } from "next/navigation";
import { BranchForm, ConditionForm, ContactForm, FollowUpQuickForm, ProblemForm, PurchasingProfileForm, SourceForm } from "@/components/forms";
import { FollowUpRow } from "@/components/follow-up-row";
import { BasisBadge, Card, Chip, Details, Empty, ErrorNote, KV, List, ScorePill, StatusChip, Tabs } from "@/components/ui";
import { addRequirement } from "@/lib/actions/requirements";
import { addTag, deleteBranch, deleteContact, deleteItem, removeTag } from "@/lib/actions/customers";
import { loadBusinessScoreData } from "@/lib/data";
import { q, type Row } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, daysBetween, displayPhone, fmtDate, fmtDateTime, fmtNum, relDays, todayISO } from "@/lib/format";
import { label, SEVERITY_HELP } from "@/lib/options";
import { monthlyDemand, nextPurchase, scoreRequirement } from "@/lib/scoring";

const TABS = ["overview", "products", "sourcing", "conditions", "contacts", "interactions", "opportunities"] as const;

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const tab = (TABS as readonly string[]).includes(sp.tab as string) ? (sp.tab as (typeof TABS)[number]) : "overview";

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
  const ctxFor = await loadBusinessScoreData(id);
  const scored = reqs.map((r) => ({ r, ...scoreRequirement(r, ctxFor(r)), np: nextPurchase(r), md: monthlyDemand(r) }));
  const best = scored.reduce((m, s) => (["not_pursuing", "well_served"].includes(s.r.demand_status) ? m : Math.max(m, s.score)), 0);
  const strongCount = scored.filter((s) => s.score >= 45).length;
  const primary = contacts[0];
  const main = branches[0];
  const today = todayISO();
  const reqList = reqs.map((r) => ({ id: r.id as string, customer_description: r.customer_description as string }));
  const reqName = (rid: string | null) => (rid ? (reqs.find((r) => r.id === rid)?.customer_description ?? "Archived product") : "Whole business");

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "products", label: "Products & demand", count: reqs.length },
    { key: "sourcing", label: "Sourcing & problems", count: problems.filter((p) => p.status === "active").length },
    { key: "conditions", label: "Buying conditions", count: conditions.length },
    { key: "contacts", label: "Contacts & locations", count: contacts.length },
    { key: "interactions", label: "Interactions", count: interactions.length },
    { key: "opportunities", label: "Opportunities", count: opps.length },
  ].map((t) => ({ ...t, href: `/customers/${id}?tab=${t.key}` }));

  return (
    <>
      {/* Header */}
      <div className="mb-4">
        <Link href="/customers" className="mb-2 inline-flex text-sm text-muted hover:text-ink">
          ← Customers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{b.trading_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span>{b.code}</span>·<span>{label(b.business_type)}</span>
              {main && (main.area || main.sub_city) && (
                <>
                  ·<span>{[main.area, main.sub_city].filter(Boolean).join(", ")}</span>
                </>
              )}
              {main?.gps_lat != null && (
                <a className="text-brand" href={`https://www.google.com/maps?q=${main.gps_lat},${main.gps_lng}`} target="_blank" rel="noreferrer">
                  Map
                </a>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip tone="brand">{label(b.relationship_stage)}</Chip>
              <Chip tone={b.sourcing_status === "underserved" ? "warn" : "neutral"}>Sourcing: {label(b.sourcing_status)}</Chip>
              {b.confidentiality_level !== "standard" && <Chip tone="danger">🔒 {label(b.confidentiality_level)}</Chip>}
              {tags.map((t) => (
                <form key={t.id} action={removeTag} className="inline">
                  <input type="hidden" name="business_id" value={id} />
                  <input type="hidden" name="tag_id" value={t.id} />
                  <button className="chip bg-surface-2 text-muted hover:line-through" title="Remove tag">
                    #{t.name}
                  </button>
                </form>
              ))}
              <form action={addTag} className="inline-flex">
                <input type="hidden" name="business_id" value={id} />
                <input name="tag" placeholder="+ tag" className="w-20 rounded-full border border-dashed border-line bg-transparent px-2 py-0.5 text-xs focus:w-32 focus:outline-none" />
              </form>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {reqs.length > 0 && (
              <Link href={`/customers/${id}?tab=products`} className="flex items-center gap-2 text-sm" title="Highest requirement score at this business">
                <span className="text-muted">Priority</span>
                <ScorePill score={best} />
                {strongCount > 0 && <span className="text-xs text-muted">{strongCount} ≥45</span>}
              </Link>
            )}
            <div className="flex gap-2">
              <Link href={`/customers/${id}/log`} className="btn-primary">
                Log interaction
              </Link>
              <Link href={`/customers/${id}/edit`} className="btn-ghost">
                Edit
              </Link>
            </div>
          </div>
        </div>
        {primary && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{primary.name}</span>
            {primary.job_title && <span className="text-muted">({primary.job_title})</span>}
            {primary.contact_permission === "asked_not_to_contact" ? (
              <Chip tone="danger">Asked not to be contacted</Chip>
            ) : (
              <>
                {primary.phone_primary && (
                  <a href={`tel:${primary.phone_primary}`} className="btn-ghost min-h-9 px-3 text-xs">
                    📞 {displayPhone(primary.phone_primary)}
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
      <Tabs tabs={tabs} current={tab} />

      {tab === "overview" && (
        <Overview
          b={b}
          id={id}
          scored={scored}
          problems={problems}
          conditions={conditions}
          contacts={contacts}
          opps={opps}
          interactions={interactions}
          followUps={followUps}
          profile={profile}
          reqName={reqName}
          today={today}
        />
      )}

      {tab === "products" && (
        <div className="space-y-3">
          {scored.length === 0 && <Empty>No product requirements yet.</Empty>}
          {scored.map(({ r, score, completeness, np, md }) => (
            <Link key={r.id} href={`/requirements/${r.id}`} className="card block p-4 hover:bg-surface-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{r.customer_description}</div>
                  <div className="text-xs text-muted">
                    {r.code}
                    {r.category_name && <> · {r.category_name}</>}
                    {r.product_code ? <> · {r.product_code} {r.product_name}</> : <> · not matched to catalog</>}
                  </div>
                </div>
                <ScorePill score={score} completeness={completeness} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <StatusChip status={r.demand_status} />
                {md.value != null && (
                  <Chip>
                    {fmtNum(md.value, 1)} {r.unit}/month {md.calculated && "(calc.)"}
                  </Chip>
                )}
                {np.date && <Chip tone="info">Next: {fmtDate(np.date)} {np.predicted && "(predicted)"}</Chip>}
                {r.willingness_to_test !== "not_asked" && <Chip>{label(r.willingness_to_test)}</Chip>}
              </div>
            </Link>
          ))}
          <Details summary="+ Add product requirement" open={scored.length === 0}>
            <form action={addRequirement} className="space-y-3">
              <input type="hidden" name="business_id" value={id} />
              <label className="block">
                <span className="lbl">Product, in the customer&apos;s words *</span>
                <input name="customer_description" className="inp" required maxLength={300} />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
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
                  <span className="lbl">Status</span>
                  <select name="demand_status" className="inp" defaultValue="mentioned">
                    <option value="mentioned">Mentioned</option>
                    <option value="interested">Interested in another source</option>
                  </select>
                </label>
                <label className="block">
                  <span className="lbl">Pattern</span>
                  <select name="purchase_pattern" className="inp" defaultValue="">
                    <option value="">Unknown</option>
                    <option value="recurring">Recurring</option>
                    <option value="seasonal">Seasonal</option>
                    <option value="project_or_one_off">Project / one-off</option>
                  </select>
                </label>
              </div>
              <button className="btn-primary">Add and open</button>
            </form>
          </Details>
        </div>
      )}

      {tab === "sourcing" && (
        <div className="space-y-4">
          <Card title="Purchasing profile" action={profile?.basis ? <BasisBadge basis={profile.basis} verifiedAt={profile.verified_at} staleAfterDays={365} /> : null}>
            {profile ? (
              <KV
                items={[
                  ["Restock process", profile.restock_process],
                  ["Sources used", <List key="s" value={profile.source_types_used} />],
                  ["Imports directly", label(profile.imports_directly)],
                  ["Restock trigger", <List key="t" value={profile.restock_trigger} />],
                  ["Payment methods", <List key="p" value={profile.payment_methods_used} />],
                  ["Payment timing", label(profile.payment_timing) + (profile.credit_days_expected ? ` (${profile.credit_days_expected} days)` : "")],
                  ["Goods received by", <List key="g" value={profile.goods_receipt_method} />],
                  ["Expected lead time", profile.expected_lead_time_days != null ? `${profile.expected_lead_time_days} days` : "—"],
                  ["Formal receipt", label(profile.needs_formal_receipt)],
                  ["Purchase size", label(profile.typical_purchase_value_band)],
                  ["Constraints", <List key="c" value={profile.purchasing_constraints} />],
                  ["Constraint details", profile.constraints_note],
                ]}
              />
            ) : (
              <Empty>Not discussed yet. This is usually the second conversation.</Empty>
            )}
            <div className="mt-3">
              <Details summary={profile ? "Edit purchasing profile" : "+ Record purchasing profile"}>
                <PurchasingProfileForm businessId={id} p={profile} />
              </Details>
            </div>
          </Card>

          <Card title="Current sources">
            {sources.length ? (
              <ul className="divide-y divide-line">
                {sources.map((s) => (
                  <li key={s.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{label(s.source_type)}</span>
                        <span className="text-sm text-muted">
                          {s.source_origin && ` · ${label(s.source_origin)}`}
                          {s.role && ` · ${label(s.role)}`} · {reqName(s.requirement_id)}
                        </span>
                      </div>
                      <BasisBadge basis={s.basis} verifiedAt={s.verified_at} />
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      Does well: <List value={s.strengths} /> · Satisfaction: {label(s.satisfaction)} · Name:{" "}
                      {s.name_disclosure === "disclosed" ? (
                        <details className="inline">
                          <summary className="inline cursor-pointer text-brand">🔒 reveal</summary> {s.supplier_name}
                        </details>
                      ) : (
                        label(s.name_disclosure)
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Details summary="Edit">
                        <SourceForm businessId={id} s={s} requirements={reqList} />
                      </Details>
                      <DeleteButton businessId={id} kind="source" itemId={s.id} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No sources recorded. The type of source is enough; names are optional.</Empty>
            )}
            <div className="mt-3">
              <Details summary="+ Add current source">
                <SourceForm businessId={id} requirements={reqList} />
              </Details>
            </div>
          </Card>

          <Card title="Problems">
            {problems.length ? (
              <ul className="divide-y divide-line">
                {problems.map((p) => (
                  <li key={p.id} className={`py-3 ${p.status !== "active" ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={p.severity === "critical" || p.severity === "high" ? "danger" : p.severity === "medium" ? "warn" : "neutral"}>{label(p.severity)}</Chip>
                        <span className="font-medium">{label(p.category)}</span>
                        <span className="text-sm text-muted">
                          · {label(p.frequency)} · {reqName(p.requirement_id)}
                        </span>
                      </div>
                      <BasisBadge basis={p.basis} verifiedAt={p.last_confirmed_at} />
                    </div>
                    <p className="mt-1 text-sm">“{p.description}”</p>
                    <div className="text-xs text-muted">
                      {SEVERITY_HELP[p.severity]}
                      {p.current_workaround && <> · Workaround: {p.current_workaround}</>}
                      {p.impact_note && <> · Impact: {p.impact_note}</>} · Addressable: {label(p.addressable_by_us)} · {label(p.status)}
                    </div>
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
              <Empty>No problems recorded. If they are well served, set sourcing status to &quot;well served&quot; in Edit.</Empty>
            )}
            <div className="mt-3">
              <Details summary="+ Add problem">
                <ProblemForm businessId={id} requirements={reqList} sources={sources} />
              </Details>
            </div>
          </Card>
        </div>
      )}

      {tab === "conditions" && (
        <div className="space-y-4">
          {(["must_have", "important", "nice_to_have"] as const).map((imp) => {
            const list = conditions.filter((c) => c.importance === imp);
            return (
              <Card key={imp} title={label(imp)}>
                {list.length ? (
                  <ul className="divide-y divide-line">
                    {list.map((c) => (
                      <li key={c.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-medium">{label(c.condition_type)}</span>
                            <span className="text-sm text-muted"> · {reqName(c.requirement_id)}</span>
                          </div>
                          <BasisBadge basis={c.basis} verifiedAt={c.verified_at} />
                        </div>
                        <p className="mt-1 text-sm">
                          {c.detail}
                          {c.threshold_value != null && ` (${c.threshold_value} ${c.threshold_unit ?? ""})`}
                        </p>
                        {c.exclusivity_scope && <p className="text-sm text-muted">Exclusivity scope: {c.exclusivity_scope}</p>}
                        <div className="text-xs text-muted">Our position: {label(c.our_position)}</div>
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
                  <p className="text-sm text-muted">None recorded.</p>
                )}
              </Card>
            );
          })}
          <Details summary="+ Add buying condition" open={conditions.length === 0}>
            <ConditionForm businessId={id} requirements={reqList} />
          </Details>
        </div>
      )}

      {tab === "contacts" && (
        <div className="space-y-4">
          <Card title="Contacts">
            {contacts.length ? (
              <ul className="divide-y divide-line">
                {contacts.map((c) => (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{c.name}</span>
                        {c.is_primary && <Chip tone="brand">Primary</Chip>}
                        <span className="text-sm text-muted"> {c.job_title && `· ${c.job_title}`}</span>
                      </div>
                      <BasisBadge basis={c.authority_basis} verifiedAt={c.authority_verified_at} staleAfterDays={365} />
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      Roles: <List value={c.decision_roles} /> · Buying: {label(c.purchasing_authority)} · Payment: {label(c.payment_authority)}
                    </div>
                    <div className="text-sm text-muted">
                      {displayPhone(c.phone_primary)} {c.telegram && `· Telegram ${c.telegram}`} {c.email && `· ${c.email}`} · Permission: {label(c.contact_permission)}
                    </div>
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
              <Empty>No contacts yet.</Empty>
            )}
            <div className="mt-3">
              <Details summary="+ Add contact">
                <ContactForm businessId={id} branches={branches} />
              </Details>
            </div>
          </Card>
          <Card title="Locations">
            <ul className="divide-y divide-line">
              {branches.map((br) => (
                <li key={br.id} className="py-3">
                  <div className="font-medium">
                    {br.branch_label} {br.is_main && <Chip tone="brand">Main</Chip>}
                  </div>
                  <div className="text-sm text-muted">
                    {[br.area, br.sub_city, br.woreda && `Woreda ${br.woreda}`, br.city].filter(Boolean).join(", ")}
                    {br.directions && ` — ${br.directions}`}
                  </div>
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
              <Details summary="+ Add location">
                <BranchForm businessId={id} />
              </Details>
            </div>
          </Card>
        </div>
      )}

      {tab === "interactions" && (
        <div className="space-y-3">
          <Link href={`/customers/${id}/log`} className="btn-primary">
            + Log interaction
          </Link>
          {interactions.length === 0 && <Empty>No interactions yet.</Empty>}
          <ol className="space-y-3">
            {interactions.map((i) => (
              <li key={i.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{fmtDateTime(i.occurred_at)}</span>
                    <Chip>{label(i.channel)}</Chip>
                    <Chip>{label(i.purpose)}</Chip>
                    <Chip tone={i.outcome === "progressed" ? "ok" : i.outcome === "setback" ? "danger" : "neutral"}>{label(i.outcome)}</Chip>
                  </div>
                  <span className="text-xs text-muted">{i.code}</span>
                </div>
                <p className="mt-2 font-medium">{i.summary}</p>
                {(i.contact_names || i.products) && (
                  <p className="text-xs text-muted">
                    {i.contact_names && <>With {i.contact_names}</>} {i.products && <>· Products: {i.products}</>}
                  </p>
                )}
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {i.customer_statements && <Evidence kind="said" text={i.customer_statements} />}
                  {i.our_observations && <Evidence kind="observed" text={i.our_observations} />}
                  {i.our_interpretation && <Evidence kind="internal" text={i.our_interpretation} />}
                </div>
                {(i.customer_commitments || i.our_commitments) && (
                  <div className="mt-2 text-sm">
                    {i.customer_commitments && <div>Customer will: {i.customer_commitments}</div>}
                    {i.our_commitments && <div>We will: {i.our_commitments}</div>}
                  </div>
                )}
                {i.no_follow_up_reason && <p className="mt-1 text-xs text-muted">No follow-up: {i.no_follow_up_reason}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === "opportunities" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Opportunities are created from a qualified product requirement (open the requirement → Create opportunity).</p>
          {opps.length === 0 && <Empty>No opportunities yet.</Empty>}
          {opps.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="card block p-4 hover:bg-surface-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{o.title}</span>
                <span className="text-xs text-muted">{o.code}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip tone="brand">{label(o.stage)}</Chip>
                <Chip>Commitment: {label(o.commitment_level)}</Chip>
                {Number(o.est_value) > 0 && <Chip>≈ {fmtNum(o.est_value)} ETB (estimate)</Chip>}
                {o.expected_purchase_date && <Chip tone="info">{fmtDate(o.expected_purchase_date)}</Chip>}
                {o.lost_reason && <Chip tone="danger">{label(o.lost_reason)}</Chip>}
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "overview" && (
        <div className="mt-4">
          <Details summary="+ Schedule a follow-up">
            <FollowUpQuickForm businessId={id} contacts={contacts} returnTo={`/customers/${id}`} defaultDate={addDays(today, 3)} />
          </Details>
        </div>
      )}
    </>
  );
}

function Evidence({ kind, text }: { kind: "said" | "observed" | "internal"; text: string }) {
  const meta = {
    said: { title: "✔ Customer said", cls: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30" },
    observed: { title: "👁 We observed", cls: "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30" },
    internal: { title: "Internal — our interpretation", cls: "border-amber-200 bg-internal dark:border-amber-900" },
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

type Scored = { r: Row; score: number; completeness: number; np: { date: string | null; predicted: boolean }; md: { value: number | null } };

function Overview(props: {
  b: Row; id: string; scored: Scored[]; problems: Row[]; conditions: Row[]; contacts: Row[]; opps: Row[]; interactions: Row[]; followUps: Row[];
  profile?: Row; reqName: (id: string | null) => string; today: string;
}) {
  const { b, id, scored, problems, conditions, contacts, opps, interactions, followUps, profile, reqName, today } = props;
  const statusCounts = ["mentioned", "interested", "specified", "qualified", "well_served", "not_pursuing"].map((s) => [s, scored.filter((x) => x.r.demand_status === s).length] as const);
  const topDemand = [...scored].filter((s) => s.md.value != null).sort((a, b2) => (b2.md.value ?? 0) - (a.md.value ?? 0)).slice(0, 3);
  const nextPurchases = scored.filter((s) => s.np.date && s.np.date >= today).sort((a, b2) => (a.np.date! < b2.np.date! ? -1 : 1));
  const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const activeProblems = problems.filter((p) => p.status === "active").sort((a, b2) => (sevRank[b2.severity] ?? 0) - (sevRank[a.severity] ?? 0)).slice(0, 3);
  const mustHaves = conditions.filter((c) => c.importance === "must_have");
  const deciders = contacts.filter((c) => ["final", "shared"].includes(c.purchasing_authority) || ["final", "shared"].includes(c.payment_authority));
  const openOpps = opps.filter((o) => !["closed_won", "closed_lost", "cancelled"].includes(o.stage));
  const last = interactions[0];

  // Completeness by stage (design §5) — essential items only.
  const has = (v: unknown) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
  const pct = (checks: boolean[]) => Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const completeness = [
    ["Identity", pct([has(b.trading_name), has(b.business_type), has(b.sectors), contacts.some((c) => has(c.phone_primary)), contacts.some((c) => c.contact_permission !== "not_asked")])],
    ["Discovery", pct([!!profile?.basis, b.sourcing_status !== "unknown", scored.some((s) => !!s.r.pattern_basis), problems.length > 0 || b.sourcing_status === "well_served", contacts.some((c) => c.purchasing_authority !== "unknown")])],
    ["Qualification", pct([scored.some((s) => !!s.r.product_id), scored.some((s) => !!s.r.price_basis), scored.some((s) => !!s.np.date), conditions.length > 0, scored.some((s) => s.r.willingness_to_test !== "not_asked")])],
    ["History", pct([interactions.length > 0, opps.length > 0, opps.some((o) => o.stage === "closed_won")])],
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card title="Demand snapshot" action={<Link href={`/customers/${id}?tab=products`} className="text-sm text-brand">Products</Link>}>
        <div className="flex flex-wrap gap-1.5">
          {statusCounts.filter(([, n]) => n > 0).map(([s, n]) => (
            <Chip key={s}>
              {label(s)}: {n}
            </Chip>
          ))}
          {scored.length === 0 && <span className="text-sm text-muted">No requirements yet.</span>}
        </div>
        {topDemand.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {topDemand.map((s) => (
              <li key={s.r.id} className="flex justify-between gap-2">
                <span className="truncate">{s.r.customer_description}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {fmtNum(s.md.value, 1)} {s.r.unit}/mo
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Next purchase">
        {nextPurchases.length ? (
          <div>
            <div className="text-lg font-semibold">{fmtDate(nextPurchases[0].np.date)}</div>
            <div className="text-sm text-muted">
              {nextPurchases[0].r.customer_description} · {relDays(nextPurchases[0].np.date)}
              {nextPurchases[0].np.predicted ? " · predicted from cycle" : nextPurchases[0].r.next_purchase_date_precision ? ` · ${label(nextPurchases[0].r.next_purchase_date_precision)}` : ""}
            </div>
            {nextPurchases.length > 1 && <div className="mt-1 text-xs text-muted">+{nextPurchases.length - 1} more expected</div>}
          </div>
        ) : (
          <p className="text-sm text-muted">Unknown. Ask when they last bought and how often.</p>
        )}
      </Card>

      <Card title="Key problems" action={<Link href={`/customers/${id}?tab=sourcing`} className="text-sm text-brand">All</Link>}>
        {activeProblems.length ? (
          <ul className="space-y-2 text-sm">
            {activeProblems.map((p) => (
              <li key={p.id}>
                <div className="flex items-center gap-2">
                  <Chip tone={sevRank[p.severity] >= 3 ? "danger" : "warn"}>{label(p.severity)}</Chip>
                  <span className="font-medium">{label(p.category)}</span>
                  <BasisBadge basis={p.basis} />
                </div>
                <div className="text-xs text-muted">{reqName(p.requirement_id)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{b.sourcing_status === "well_served" ? "Well served — no active problems." : "No problems recorded yet."}</p>
        )}
      </Card>

      <Card title="Must-have conditions" action={<Link href={`/customers/${id}?tab=conditions`} className="text-sm text-brand">All</Link>}>
        {mustHaves.length ? (
          <ul className="space-y-1 text-sm">
            {mustHaves.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{label(c.condition_type)}:</span> {c.detail}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None recorded.</p>
        )}
      </Card>

      <Card title="Decision-makers" action={<Link href={`/customers/${id}?tab=contacts`} className="text-sm text-brand">Contacts</Link>}>
        {deciders.length ? (
          <ul className="space-y-1 text-sm">
            {deciders.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted">
                  buys: {label(c.purchasing_authority)}, pays: {label(c.payment_authority)}
                </span>
                <BasisBadge basis={c.authority_basis} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Unknown — find out who decides and who pays.</p>
        )}
      </Card>

      <Card title="Pipeline" action={<Link href={`/customers/${id}?tab=opportunities`} className="text-sm text-brand">All</Link>}>
        {openOpps.length ? (
          <ul className="space-y-1 text-sm">
            {openOpps.map((o) => (
              <li key={o.id}>
                <Link href={`/opportunities/${o.id}`} className="flex justify-between gap-2">
                  <span className="truncate">{o.title}</span>
                  <span className="shrink-0 text-muted">
                    {label(o.stage)} · {label(o.commitment_level)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No open opportunities.</p>
        )}
      </Card>

      <Card title="Last contact" action={<Link href={`/customers/${id}?tab=interactions`} className="text-sm text-brand">History</Link>}>
        {last ? (
          <div className="text-sm">
            <div className="font-medium">
              {fmtDateTime(last.occurred_at)} · {label(last.channel)}
            </div>
            <p className="text-muted">{last.summary}</p>
            <p className="mt-1 text-xs text-muted">{daysBetween(String(last.occurred_at instanceof Date ? last.occurred_at.toISOString() : last.occurred_at).slice(0, 10), today)} days ago</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No interactions logged.</p>
        )}
      </Card>

      <Card title="Open follow-ups">
        {followUps.length ? (
          <ul className="divide-y divide-line">
            {followUps.map((f) => (
              <FollowUpRow key={f.id} f={{ ...f, trading_name: b.trading_name }} returnTo={`/customers/${id}`} showBusiness={false} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">None scheduled.</p>
        )}
      </Card>

      <Card title="Data health">
        <ul className="space-y-2">
          {completeness.map(([name, v]) => (
            <li key={name}>
              <div className="flex justify-between text-xs">
                <span>{name}</span>
                <span className="tabular-nums text-muted">{v}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${v}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {b.referred_by_name && <p className="mt-3 text-xs text-muted">Referred by {b.referred_by_name}</p>}
        <p className="mt-1 text-xs text-muted">Found via {label(b.acquisition_source)}</p>
      </Card>
    </div>
  );
}
