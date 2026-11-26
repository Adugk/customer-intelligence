import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ConditionForm, FollowUpQuickForm, ProblemForm, SourceForm } from "@/components/forms";
import { Area, BasisBadge, BasisFields, Card, Checks, Chip, DateInput, Details, ErrorNote, Field, KV, List, NumberInput, ScorePill, Select, StatusChip, Submit, Text } from "@/components/ui";
import { createOpportunity } from "@/lib/actions/opportunities";
import { archiveRequirement, createProductFromRequirement, deleteVariant, saveRequirementGroup, saveRequirementStatus, saveVariant } from "@/lib/actions/requirements";
import { loadBusinessScoreData } from "@/lib/data";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, fmtDate, fmtDateTime, fmtMoney, fmtNum, todayISO } from "@/lib/format";
import { label, OPT, SEVERITY_HELP } from "@/lib/options";
import { monthlyDemand, nextPurchase, qualificationGaps, scoreBand, scoreRequirement } from "@/lib/scoring";
import { SupplierComparison } from "@/components/supplier-comparison";

export default async function RequirementPage({ params, searchParams }: PageProps<"/requirements/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const r = await one(
    `select r.*, b.trading_name, b.code as business_code, c.name as category_name
     from product_requirement r join business b on b.id = r.business_id left join product_category c on c.id = r.category_id
     where r.id = $1`,
    [id],
  );
  if (!r) notFound();
  const bid = r.business_id as string;
  const [categories, products, variants, sources, problems, conditions, history, contacts, opps] = await Promise.all([
    q("select c.id, c.name, p.name as parent from product_category c left join product_category p on p.id = c.parent_id order by coalesce(p.sort_order, c.sort_order), (c.parent_id is not null), c.sort_order"),
    q("select id, code, name, brand, model_sku, key_specifications from product order by name"),
    q("select * from requirement_variant where requirement_id = $1 order by variant_label", [id]),
    q("select * from current_source where requirement_id = $1 order by created_at", [id]),
    q("select * from sourcing_problem where requirement_id = $1 order by created_at desc", [id]),
    q("select * from buying_condition where business_id = $1 and (requirement_id = $2 or requirement_id is null) order by importance, created_at", [bid, id]),
    q("select * from value_history where entity_type = 'product_requirement' and entity_id = $1 order by changed_at desc limit 30", [id]),
    q("select * from contact where business_id = $1 order by is_primary desc", [bid]),
    q(
      `select o.id, o.code, o.title, o.stage, o.commitment_level from opportunity o join opportunity_line l on l.opportunity_id = o.id
       where l.requirement_id = $1 order by o.created_at desc`,
      [id],
    ),
  ]);
  const ctx = (await loadBusinessScoreData(bid))(r);
  const score = scoreRequirement(r, ctx);
  const band = scoreBand(score.score);
  const gaps = qualificationGaps(r, ctx);
  const np = nextPurchase(r);
  const md = monthlyDemand(r);
  const product = products.find((p) => p.id === r.product_id);
  const today = todayISO();

  return (
    <div className="max-w-4xl">
      <Link href={`/customers/${bid}?tab=products`} className="mb-2 inline-flex text-sm text-muted hover:text-ink">
        ← {r.trading_name}
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{r.customer_description}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{r.code}</span>
            <StatusChip status={r.demand_status} />
            {r.category_name && <span>· {r.category_name}</span>}
            {product ? <span>· {product.name}</span> : <Chip tone="warn">Not linked to your product list</Chip>}
          </div>
        </div>
        <div className="text-right"><div className="text-xs text-muted">Priority score</div><ScorePill score={score.score} completeness={score.completeness} /></div>
      </div>
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card title="How promising is this?" action={<span className={`chip ${band.cls}`}>{band.label}</span>}>
          <p className="text-sm">{band.action}.</p>
          <details className="mt-2">
          <summary className="cursor-pointer text-sm text-brand">Why this score?</summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {score.components.map((c) => (
                <tr key={c.key} className="border-t border-line/60">
                  <td className="py-1.5 pr-2">
                    <div className="font-medium">{c.label}</div>
                    <div className="text-xs text-muted">{c.detail}</div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                    {c.points} / {c.max}
                    {c.raw > 0 && c.points < c.raw && <div className="text-xs text-amber-700 dark:text-amber-300">reduced from {c.raw} (not confirmed)</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Our estimates count half and guesses count nothing. “Backed by facts” shows how much of the score comes from things the customer told us, we saw, or have on paper.</p>
          </details>
        </Card>

        <Card title="Next step" action={<Link href={`/requests/new?customer=${bid}&need=${id}`} className="text-sm text-brand">+ Make a request from this</Link>}>
          {r.demand_status === "qualified" ? (
            <>
              <p className="mb-3 text-sm">This product is ready to quote. Start a deal to track the sale.</p>
              <form action={createOpportunity} className="space-y-3">
                <input type="hidden" name="requirement_id" value={id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity">
                    <NumberInput name="quantity" defaultValue={r.next_purchase_qty ?? r.qty_per_order} />
                  </Field>
                  <Field label="Price per unit we expect (ETB)">
                    <NumberInput name="expected_unit_price" />
                  </Field>
                </div>
                <Submit>Start a deal</Submit>
              </form>
            </>
          ) : (
            <>
              <GapList title="Still needed for “Details known”" items={gaps.specified} />
              <GapList title="Still needed for “Ready to quote”" items={gaps.qualified} />
            </>
          )}
          {opps.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1 text-xs font-semibold text-muted">Deals for this product</div>
              <ul className="space-y-1 text-sm">
                {opps.map((o) => (
                  <li key={o.id}>
                    <Link href={`/opportunities/${o.id}`} className="text-brand">
                      {o.code} {o.title}
                    </Link>{" "}
                    <span className="text-muted">
                      · {label(o.stage)} · {label(o.commitment_level)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-3">
        <Group
          title="Where this stands"
          summary={
            <KV
              items={[
                ["Status", label(r.demand_status)],
                ["Will they try us?", <span key="w" className="inline-flex flex-wrap items-center gap-1">{label(r.willingness_to_test)} {r.willingness_basis && <BasisBadge basis={r.willingness_basis} verifiedAt={r.willingness_verified_at} />}</span>],
                ["What would make them switch to us", r.switching_trigger],
                ["Why we stopped", r.not_pursuing_reason ? `${label(r.not_pursuing_reason)}${r.not_pursuing_note ? ` — ${r.not_pursuing_note}` : ""}` : null],
              ]}
            />
          }
        >
          <form action={saveRequirementStatus} className="space-y-3">
            <input type="hidden" name="requirement_id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status" hint="“Details known” and “Ready to quote” are only allowed when the needed facts are filled in.">
                <Select name="demand_status" options={OPT.demandStatus} defaultValue={r.demand_status} blank={false} />
              </Field>
              <Field label="Will they try us?">
                <Select name="willingness_to_test" options={OPT.willingness} defaultValue={r.willingness_to_test} blank={false} />
              </Field>
            </div>
            <Field label="What would make them switch to us?" hint="In their own words.">
              <Text name="switching_trigger" defaultValue={r.switching_trigger} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="If not following up: why?">
                <Select name="not_pursuing_reason" options={OPT.notPursuingReason} defaultValue={r.not_pursuing_reason} />
              </Field>
              <Field label="Note">
                <Text name="not_pursuing_note" defaultValue={r.not_pursuing_note} />
              </Field>
            </div>
            <BasisFields basis={r.willingness_basis} verifiedAt={r.willingness_verified_at} />
            <Submit>Save status</Submit>
          </form>
        </Group>

        <Group
          title="The product"
          summary={
            <KV
              items={[
                ["Category", r.category_name],
                ["In your product list as", product ? product.name : "Not linked yet"],
                ["Brand", label(r.brand_requirement)],
                ["Condition", label(r.condition_required)],
                ["Genuine or generic", label(r.authenticity_required)],
                ["Details (size, model…)", r.specification_notes],
                ["Would also accept", r.accepted_alternatives],
                ["Links", r.reference_links],
              ]}
            />
          }
        >
          <form action={saveRequirementGroup} className="space-y-3">
            <input type="hidden" name="requirement_id" value={id} />
            <input type="hidden" name="group" value="identity" />
            <Field label="Product, in the customer's words *">
              <Text name="customer_description" defaultValue={r.customer_description} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category">
                <select className="inp" name="category_id" defaultValue={r.category_id ?? ""}>
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent ? `${c.parent} › ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Link to your product list" hint="Needed before “Ready to quote”, and to add up demand across customers.">
                <select className="inp" name="product_id" defaultValue={r.product_id ?? ""}>
                  <option value="">Not linked yet</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Brand">
                <Select name="brand_requirement" options={OPT.brandRequirement} defaultValue={r.brand_requirement} />
              </Field>
              <Field label="Condition">
                <Select name="condition_required" options={OPT.condition} defaultValue={r.condition_required} />
              </Field>
              <Field label="Genuine or generic?" hint="We never source fake or copy products.">
                <Select name="authenticity_required" options={OPT.authenticity} defaultValue={r.authenticity_required} />
              </Field>
              <Field label="Would also accept">
                <Text name="accepted_alternatives" defaultValue={r.accepted_alternatives} />
              </Field>
            </div>
            <Field label="Details (size, model, colour…)" hint="Anything that makes sure we get exactly the right item.">
              <Area name="specification_notes" defaultValue={r.specification_notes} rows={2} />
            </Field>
            <Field label="Links (shop page, photo)">
              <Text name="reference_links" defaultValue={r.reference_links} />
            </Field>
            <Submit>Save</Submit>
          </form>
          {!product && (
            <div className="mt-4 border-t border-line pt-4">
              <Details summary="Not in your product list yet? Add it here">
                <form action={createProductFromRequirement} className="space-y-3">
                  <input type="hidden" name="requirement_id" value={id} />
                  <Field label="Product name *" hint="Example: Samsung – Charger – EP-TA800 – 25W">
                    <Text name="name" required defaultValue={r.customer_description} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Category">
                      <select className="inp" name="category_id" defaultValue={r.category_id ?? ""}>
                        <option value="">—</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.parent ? `${c.parent} › ${c.name}` : c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Brand">
                      <Text name="brand" />
                    </Field>
                    <Field label="Model / SKU">
                      <Text name="model_sku" />
                    </Field>
                    <Field label="Standard unit">
                      <Select name="standard_unit" options={OPT.unit} defaultValue={r.unit ?? "piece"} blank={false} />
                    </Field>
                  </div>
                  <Field label="Main details" hint="One per line, e.g. 'Power: 25W'">
                    <Area name="key_specifications" rows={3} />
                  </Field>
                  <Submit>Add and link</Submit>
                </form>
              </Details>
            </div>
          )}
        </Group>

        <Group
          title="How much and how often"
          badge={<BasisBadge basis={r.pattern_basis} verifiedAt={r.pattern_verified_at} staleAfterDays={120} />}
          summary={
            <KV
              items={[
                ["Buys it", label(r.purchase_pattern)],
                ["Each time they buy", r.qty_per_order != null ? `${fmtNum(r.qty_per_order)} ${r.unit}` : null],
                ["How often", r.order_interval_value ? Number(r.order_interval_value) === 1 ? `Every ${r.order_interval_unit}` : `Every ${fmtNum(r.order_interval_value)} ${r.order_interval_unit}s` : null],
                ["Per month", md.value != null ? `${fmtNum(md.value, 1)} ${r.unit}${md.calculated ? " (worked out)" : ""}` : null],
                ["Last bought", r.last_purchase_date ? `${fmtDate(r.last_purchase_date)}${r.last_purchase_qty ? ` — ${fmtNum(r.last_purchase_qty)} ${r.unit}` : ""}` : null],
                ["Smallest order they can manage", r.smallest_practical_order],
                ["Biggest order they can manage", r.largest_possible_order],
                ["Busy months", <List key="s" value={r.seasonality_months} />],
              ]}
            />
          }
        >
          <form action={saveRequirementGroup} className="space-y-3">
            <input type="hidden" name="requirement_id" value={id} />
            <input type="hidden" name="group" value="pattern" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Do they buy it…" className="col-span-2">
                <Select name="purchase_pattern" options={OPT.purchasePattern} defaultValue={r.purchase_pattern} />
              </Field>
              <Field label="Quantity each time">
                <NumberInput name="qty_per_order" defaultValue={r.qty_per_order} />
              </Field>
              <Field label="Unit">
                <Select name="unit" options={OPT.unit} defaultValue={r.unit} blank={false} />
              </Field>
              <Field label="Every">
                <NumberInput name="order_interval_value" defaultValue={r.order_interval_value} />
              </Field>
              <Field label="Period">
                <Select name="order_interval_unit" options={OPT.intervalUnit} defaultValue={r.order_interval_unit} />
              </Field>
              <Field label="Per month (if they said)" hint="Leave empty and the app works it out." className="col-span-2">
                <NumberInput name="monthly_demand" defaultValue={r.monthly_demand} />
              </Field>
              <Field label="Last bought on" className="col-span-2">
                <DateInput name="last_purchase_date" defaultValue={r.last_purchase_date} />
              </Field>
              <Field label="Quantity last time" className="col-span-2">
                <NumberInput name="last_purchase_qty" defaultValue={r.last_purchase_qty} />
              </Field>
              <Field label="Smallest order they can manage" hint="Limited by their cash or storage." className="col-span-2">
                <NumberInput name="smallest_practical_order" defaultValue={r.smallest_practical_order} />
              </Field>
              <Field label="Biggest order they can manage" className="col-span-2">
                <NumberInput name="largest_possible_order" defaultValue={r.largest_possible_order} />
              </Field>
            </div>
            <Field label="Busy months" hint="For example New Year (Meskerem), Meskel, Genna, Timket, Fasika, Eid, school opening.">
              <Checks name="seasonality_months" options={OPT.months} values={r.seasonality_months} />
            </Field>
            <Field label="Note about busy times">
              <Text name="seasonality_note" defaultValue={r.seasonality_note} />
            </Field>
            <BasisFields basis={r.pattern_basis} verifiedAt={r.pattern_verified_at} />
            <Submit>Save</Submit>
          </form>
        </Group>

        <Group
          title="What they pay now"
          badge={<BasisBadge basis={r.price_basis} verifiedAt={r.price_verified_at} staleAfterDays={60} />}
          summary={
            <KV
              items={[
                ["Price", r.current_unit_price != null ? `${fmtMoney(r.current_unit_price, r.price_currency)} per ${r.price_per_unit ?? "?"}` : r.price_basis === "not_disclosed" ? "🔒 Not disclosed" : null],
                ["Includes VAT", label(r.price_includes_vat)],
                ["Includes delivery", label(r.price_includes_delivery)],
                ["Price they want", r.target_price != null ? fmtMoney(r.target_price, r.price_currency) : null],
                ["Highest they would pay", r.max_acceptable_price != null ? fmtMoney(r.max_acceptable_price, r.price_currency) : null],
              ]}
            />
          }
        >
          <form action={saveRequirementGroup} className="space-y-3">
            <input type="hidden" name="requirement_id" value={id} />
            <input type="hidden" name="group" value="price" />
            <p className="text-xs text-muted">Only if they tell you. If they won&apos;t say, choose “Customer won&apos;t say” below and leave the prices empty.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Price" className="col-span-2">
                <NumberInput name="current_unit_price" defaultValue={r.current_unit_price} />
              </Field>
              <Field label="Currency">
                <Select name="price_currency" options={OPT.currency} defaultValue={r.price_currency} blank={false} />
              </Field>
              <Field label="Per">
                <Select name="price_per_unit" options={OPT.unit} defaultValue={r.price_per_unit ?? r.unit} />
              </Field>
              <Field label="Includes VAT?" className="col-span-2">
                <Select name="price_includes_vat" options={OPT.yesNoUnknown} defaultValue={r.price_includes_vat ?? "unknown"} blank={false} />
              </Field>
              <Field label="Includes delivery?" className="col-span-2">
                <Select name="price_includes_delivery" options={OPT.yesNoUnknown} defaultValue={r.price_includes_delivery ?? "unknown"} blank={false} />
              </Field>
              <Field label="Price they want" className="col-span-2">
                <NumberInput name="target_price" defaultValue={r.target_price} />
              </Field>
              <Field label="Highest they would pay" className="col-span-2">
                <NumberInput name="max_acceptable_price" defaultValue={r.max_acceptable_price} />
              </Field>
            </div>
            <BasisFields basis={r.price_basis} verifiedAt={r.price_verified_at} />
            <Submit>Save</Submit>
          </form>
        </Group>

        <Group
          title="Running out of stock"
          badge={<BasisBadge basis={r.stock_basis} verifiedAt={r.stock_verified_at} staleAfterDays={30} />}
          summary={
            <KV
              items={[
                ["Stock now", label(r.current_stock_status)],
                ["Runs out", label(r.stockout_frequency)],
                ["For how long", label(r.typical_stockout_duration)],
                ["What happens then", <List key="c" value={r.stockout_consequences} />],
                ["Current delivery time", r.current_lead_time_days != null ? `${r.current_lead_time_days} days` : null],
              ]}
            />
          }
        >
          <form action={saveRequirementGroup} className="space-y-3">
            <input type="hidden" name="requirement_id" value={id} />
            <input type="hidden" name="group" value="stock" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Stock now">
                <Select name="current_stock_status" options={OPT.stockStatus} defaultValue={r.current_stock_status} />
              </Field>
              <Field label="How often they run out">
                <Select name="stockout_frequency" options={OPT.stockoutFrequency} defaultValue={r.stockout_frequency} />
              </Field>
              <Field label="How long it lasts">
                <Select name="typical_stockout_duration" options={OPT.stockoutDuration} defaultValue={r.typical_stockout_duration} />
              </Field>
              <Field label="Current delivery time (days)">
                <NumberInput name="current_lead_time_days" defaultValue={r.current_lead_time_days} />
              </Field>
            </div>
            <Field label="What happens when they run out">
              <Checks name="stockout_consequences" options={OPT.stockoutConsequences} values={r.stockout_consequences} />
            </Field>
            <BasisFields basis={r.stock_basis} verifiedAt={r.stock_verified_at} />
            <Submit>Save</Submit>
          </form>
        </Group>

        <Group
          title="When they will buy next"
          badge={<BasisBadge basis={np.predicted ? "calculated" : r.next_basis} verifiedAt={np.predicted ? null : r.next_verified_at} />}
          summary={
            <KV
              items={[
                ["Next purchase", np.date ? `${fmtDate(np.date)}${np.predicted ? " (worked out from last purchase and how often they buy)" : r.next_purchase_date_precision ? ` (${label(r.next_purchase_date_precision)})` : ""}` : null],
                ["Quantity", r.next_purchase_qty],
                ["How urgent for them", label(r.customer_urgency)],
              ]}
            />
          }
        >
          <form action={saveRequirementGroup} className="space-y-3">
            <input type="hidden" name="requirement_id" value={id} />
            <input type="hidden" name="group" value="next" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Expected date">
                <DateInput name="next_purchase_date" defaultValue={r.next_purchase_date} />
              </Field>
              <Field label="How sure">
                <Select name="next_purchase_date_precision" options={OPT.datePrecision} defaultValue={r.next_purchase_date_precision} />
              </Field>
              <Field label="Quantity">
                <NumberInput name="next_purchase_qty" defaultValue={r.next_purchase_qty} />
              </Field>
              <Field label="How urgent for them">
                <Select name="customer_urgency" options={OPT.urgency} defaultValue={r.customer_urgency} />
              </Field>
            </div>
            <p className="text-xs text-muted">You&apos;ll get a reminder 14 days before this date.</p>
            <BasisFields basis={r.next_basis} verifiedAt={r.next_verified_at} />
            <Submit>Save</Submit>
          </form>
        </Group>

        <Group title={`Sizes and colours (${variants.length})`} summary={variants.length ? <ul className="text-sm">{variants.map((v) => <li key={v.id}>{v.variant_label}{v.share_pct != null && ` — ${v.share_pct}%`}</li>)}</ul> : <p className="text-sm text-muted">Only needed if they buy several sizes or colours.</p>}>
          <ul className="mb-3 divide-y divide-line">
            {variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {v.variant_label} {[v.size, v.colour, v.other_attribute].filter(Boolean).join(" · ")} {v.share_pct != null && `— ${v.share_pct}%`}
                </span>
                <form action={deleteVariant}>
                  <input type="hidden" name="requirement_id" value={id} />
                  <input type="hidden" name="variant_id" value={v.id} />
                  <button className="text-xs text-red-700 dark:text-red-300">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveVariant} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <input type="hidden" name="requirement_id" value={id} />
            <Field label="Name *" className="col-span-2 sm:col-span-1">
              <Text name="variant_label" required placeholder="Size 42 black" />
            </Field>
            <Field label="Size">
              <Text name="size" />
            </Field>
            <Field label="Colour">
              <Text name="colour" />
            </Field>
            <Field label="Other">
              <Text name="other_attribute" />
            </Field>
            <Field label="% of total">
              <NumberInput name="share_pct" />
            </Field>
            <Submit className="col-span-2 sm:col-span-5 sm:w-fit">Add</Submit>
          </form>
        </Group>

        {r.product_id ? (
          <SupplierComparison productId={r.product_id} neededQty={Number(r.next_purchase_qty ?? r.qty_per_order ?? 1)} unit={r.unit ?? "piece"} qtySource={r.next_purchase_qty != null ? "next purchase" : r.qty_per_order != null ? "usual order" : "no quantity yet"} />
        ) : (
          <Card title="Suppliers who sell this">
            <p className="text-sm text-muted">Link this product to your product list (under “The product”) to see and compare suppliers.</p>
          </Card>
        )}

        <Card title="Where they buy it now">
          {sources.length ? (
            <ul className="mb-3 space-y-1 text-sm">
              {sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{label(s.source_type)}</span>
                  <span className="text-muted">
                    {s.source_origin && label(s.source_origin)} · how happy: {label(s.satisfaction)}
                  </span>
                  <BasisBadge basis={s.basis} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted">Not recorded yet.</p>
          )}
          <Details summary="+ Add where they buy it">
            <SourceForm businessId={bid} fixedRequirement={id} />
          </Details>
        </Card>

        <Card title="Problems with this product">
          {problems.length ? (
            <ul className="mb-3 space-y-2 text-sm">
              {problems.map((p) => (
                <li key={p.id} className={p.status !== "active" ? "opacity-60" : ""}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={p.severity === "critical" || p.severity === "high" ? "danger" : "warn"}>{SEVERITY_HELP[p.severity]}</Chip>
                    <span className="font-medium">{label(p.category)}</span>
                    <BasisBadge basis={p.basis} verifiedAt={p.last_confirmed_at} />
                  </div>
                  <p>“{p.description}”</p>
                  <p className="text-xs text-muted">
                    How often: {label(p.frequency)} · can we help: {label(p.addressable_by_us)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted">No problems recorded yet.</p>
          )}
          <Details summary="+ Add a problem">
            <ProblemForm businessId={bid} fixedRequirement={id} sources={sources} />
          </Details>
        </Card>

        <Card title="Their conditions">
          {conditions.length ? (
            <ul className="mb-3 space-y-1 text-sm">
              {conditions.map((c) => (
                <li key={c.id}>
                  <Chip tone={c.importance === "must_have" ? "danger" : "neutral"}>{label(c.importance)}</Chip> <span className="font-medium">{label(c.condition_type)}:</span> {c.detail}
                  {!c.requirement_id && <span className="text-xs text-muted"> (all products)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-muted">No conditions recorded yet.</p>
          )}
          <Details summary="+ Add a condition">
            <ConditionForm businessId={bid} fixedRequirement={id} />
          </Details>
        </Card>

        <Details summary="+ Plan a follow-up about this product">
          <FollowUpQuickForm businessId={bid} contacts={contacts} requirementId={id} returnTo={`/requirements/${id}`} defaultDate={addDays(today, 3)} />
        </Details>

        <Card title="What changed">
          {history.length ? (
            <ul className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="border-b border-line/60 pb-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {fmtDateTime(h.changed_at)} · {GROUP_NAMES[h.field_group] ?? h.field_group} {h.basis && <BasisBadge basis={h.basis} />}
                  </div>
                  <div className="text-xs">
                    {Object.keys(h.new_values ?? {}).map((k) => (
                      <div key={k}>
                        <span className="text-muted">{k}:</span> {fmtVal(h.old_values?.[k])} → <span className="font-medium">{fmtVal(h.new_values[k])}</span>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No changes yet.</p>
          )}
        </Card>

        <form action={archiveRequirement} className="pt-2">
          <input type="hidden" name="requirement_id" value={id} />
          <button className="btn-danger">Remove this product from the customer</button>
        </form>
      </div>
    </div>
  );
}

const GROUP_NAMES: Record<string, string> = { identity: "Product", pattern: "How much and how often", price: "Price", stock: "Running out", next: "Next purchase", status: "Status" };

function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => label(String(x))).join(", ") : "—";
  return typeof v === "string" ? label(v) : String(v);
}

function GapList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-muted">{title}</div>
      {items.length ? (
        <ul className="mt-1 space-y-0.5 text-sm">
          {items.map((g) => (
            <li key={g}>○ {g}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">✔ Everything needed is filled in</p>
      )}
    </div>
  );
}

function Group({ title, summary, badge, children }: { title: string; summary: ReactNode; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {badge}
      </div>
      {summary}
      <details className="group mt-3">
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">
          <span className="group-open:hidden">Edit</span>
          <span className="hidden group-open:inline">Close</span>
        </summary>
        <div className="mt-3 border-t border-line pt-3">{children}</div>
      </details>
    </section>
  );
}
