import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowUpRow } from "@/components/follow-up-row";
import { Area, Card, Chip, DateInput, Details, Empty, ErrorNote, Field, KV, NumberInput, Select, StatusChip, Submit, Tabs, Text } from "@/components/ui";
import { addPrice, addSupplierFollowUp, deleteSupplierContact, endPrice, saveOffer, saveSupplierContact, saveVerification } from "@/lib/actions/suppliers";
import { q, type Row } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, fmtDate, fmtDateTime, fmtNum, todayISO, toISODate } from "@/lib/format";
import { label, OPT } from "@/lib/options";
import { currentTiers } from "@/lib/suppliers";

const TABS = ["summary", "products", "people", "check", "history"] as const;
type Tab = (typeof TABS)[number];

export default async function SupplierPage({ params, searchParams }: PageProps<"/suppliers/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab as string) ? (sp.tab as Tab) : "summary";

  const [sRows, contacts, offers, prices, interactions, followUps, products, verifHistory] = await Promise.all([
    q("select s.*, b.trading_name as linked_customer from supplier s left join business b on b.id = s.linked_business_id where s.id = $1", [id]),
    q("select * from supplier_contact where supplier_id = $1 order by is_primary desc, is_active desc, created_at", [id]),
    q("select o.*, p.name as product_name, p.code as product_code from supplier_offer o left join product p on p.id = o.product_id where o.supplier_id = $1 order by o.is_active desc, o.updated_at desc", [id]),
    q("select pr.* from supplier_price pr join supplier_offer o on o.id = pr.offer_id where o.supplier_id = $1 order by pr.valid_from desc, pr.recorded_at desc", [id]),
    q("select * from interaction where supplier_id = $1 order by occurred_at desc", [id]),
    q("select f.*, $2::text as supplier_name from follow_up f where f.supplier_id = $1 and f.status = 'open' order by f.due_date", [id, ""]),
    q("select id, code, name from product order by name"),
    q("select * from value_history where entity_type = 'supplier' and entity_id = $1 order by changed_at desc limit 10", [id]),
  ]);
  const s = sRows[0];
  if (!s) notFound();
  const productIds = offers.map((o) => o.product_id).filter(Boolean);
  // Customers whose products match what this supplier offers (excluding customers marked "Keep fully private").
  const demand = productIds.length
    ? await q(
        `select r.id, r.product_id, r.customer_description, r.demand_status, r.qty_per_order, r.next_purchase_qty, b.id as business_id, b.trading_name
         from product_requirement r join business b on b.id = r.business_id
         where r.product_id = any($1::uuid[]) and r.archived_at is null and b.archived_at is null and b.confidentiality_level <> 'strict'
           and r.demand_status in ('interested','specified','qualified')
         order by r.demand_status = 'qualified' desc, b.trading_name`,
        [productIds],
      )
    : [];
  const primary = contacts.find((c) => c.is_active) ?? contacts[0];
  const today = todayISO();
  const pricesFor = (oid: string) => prices.filter((p) => p.offer_id === oid);
  const tabs = [
    { key: "summary", label: "Summary" },
    { key: "products", label: "Products & prices", count: offers.filter((o) => o.is_active).length },
    { key: "people", label: "People", count: contacts.length },
    { key: "check", label: "Checks" },
    { key: "history", label: "Conversations", count: interactions.length },
  ].map((t) => ({ ...t, href: `/suppliers/${id}?tab=${t.key}` }));

  return (
    <>
      <div className="mb-4">
        <Link href="/suppliers" className="mb-2 inline-flex text-sm text-muted hover:text-ink">
          ← Suppliers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{s.display_name}</h1>
            <p className="mt-1 text-sm text-muted">
              {label(s.supplier_type)} · {[s.city, s.country].filter(Boolean).join(", ")} · prices in {s.currency} · {s.code}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusChip status={s.verification_status} />
              {s.linked_business_id && (
                <Link href={`/customers/${s.linked_business_id}`} className="chip bg-surface-2 text-muted">
                  Also a customer: {s.linked_customer}
                </Link>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/suppliers/${id}/log`} className="btn-primary">
              Record conversation
            </Link>
            <Link href={`/suppliers/${id}/edit`} className="btn-ghost">
              Edit
            </Link>
          </div>
        </div>
        {(primary || s.phone || s.whatsapp) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {primary && <span className="font-medium">{primary.name}</span>}
            {primary?.position && <span className="text-muted">{primary.position}</span>}
            {(primary?.phone || s.phone) && (
              <a href={`tel:${String(primary?.phone || s.phone).replace(/[^\d+]/g, "")}`} className="btn-ghost min-h-9 px-3 text-xs">
                Call {primary?.phone || s.phone}
              </a>
            )}
            {(primary?.whatsapp || s.whatsapp) && (
              <a href={`https://wa.me/${String(primary?.whatsapp || s.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="btn-ghost min-h-9 px-3 text-xs">
                WhatsApp
              </a>
            )}
          </div>
        )}
      </div>

      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <Tabs tabs={tabs} current={tab} />

      {tab === "summary" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Next step" className="md:col-span-2">
            {followUps.length ? (
              <ul className="divide-y divide-line">
                {followUps.map((f) => (
                  <FollowUpRow key={f.id} f={{ ...f, supplier_name: s.display_name }} returnTo={`/suppliers/${id}`} showBusiness={false} />
                ))}
              </ul>
            ) : (
              <p className="mb-2 text-sm text-muted">No follow-up planned.</p>
            )}
            <div className="mt-2">
              <Details summary="+ Plan a follow-up">
                <form action={addSupplierFollowUp} className="space-y-3">
                  <input type="hidden" name="supplier_id" value={id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Date *">
                      <DateInput name="due_date" defaultValue={addDays(today, 3)} />
                    </Field>
                    <Field label="How">
                      <Select name="action_type" options={OPT.followUpAction} defaultValue="call" blank={false} />
                    </Field>
                  </div>
                  <Field label="What for? *">
                    <Text name="purpose" required placeholder="e.g. Ask for prices for 50 units" />
                  </Field>
                  <Submit>Plan follow-up</Submit>
                </form>
              </Details>
            </div>
          </Card>

          <Card title="What they sell" action={<Link href={`/suppliers/${id}?tab=products`} className="text-sm text-brand">All products</Link>}>
            {offers.filter((o) => o.is_active).length ? (
              <ul className="space-y-2 text-sm">
                {offers
                  .filter((o) => o.is_active)
                  .slice(0, 5)
                  .map((o) => {
                    const t = currentTiers(pricesFor(o.id));
                    return (
                      <li key={o.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{o.offer_name}</span>
                        <span className="shrink-0 tabular-nums text-muted">{t.length ? `from ${fmtNum(t[t.length - 1].unit_price, 2)} ${t[0].currency}` : "no current price"}</span>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="text-sm text-muted">No products recorded yet.</p>
            )}
            {s.brands && <p className="mt-3 border-t border-line pt-2 text-sm text-muted">Brands: {s.brands}</p>}
          </Card>

          <Card title="Customers who want their products">
            {demand.length ? (
              <ul className="space-y-1 text-sm">
                {demand.slice(0, 8).map((d) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <Link href={`/requirements/${d.id}`} className="min-w-0 truncate text-brand">
                      {d.trading_name} — {d.customer_description}
                    </Link>
                    <StatusChip status={d.demand_status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None yet. Link their products to your product list to see matches.</p>
            )}
          </Card>

          <Card title="Terms">
            <KV
              items={[
                ["Payment", s.payment_terms],
                ["Deposit", s.deposit_terms],
                ["Minimum order", s.min_order_value != null ? `${fmtNum(s.min_order_value)} ${s.currency}` : null],
                ["Usual delivery time", s.typical_lead_time_days != null ? `${s.typical_lead_time_days} days` : null],
                ["Returns", s.return_policy],
                ["Exports", label(s.export_capable)],
              ]}
            />
          </Card>

          <Card title="Last conversation" action={<Link href={`/suppliers/${id}?tab=history`} className="text-sm text-brand">History</Link>}>
            {interactions[0] ? (
              <div className="text-sm">
                <div className="font-medium">
                  {fmtDateTime(interactions[0].occurred_at)} · {label(interactions[0].channel)}
                </div>
                <p className="text-muted">{interactions[0].summary}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">No conversations recorded yet.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "products" && (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Each product can have several prices by quantity (for example 1+, 10+, 50+). A new price never deletes the old one — the history stays, so you can see when prices changed.
          </p>
          {offers.length === 0 && <Empty>No products yet.</Empty>}
          {offers.map((o) => (
            <OfferCard key={o.id} supplierId={id} o={o} prices={pricesFor(o.id)} products={products} currency={s.currency} demand={demand.filter((d) => d.product_id && d.product_id === o.product_id)} />
          ))}
          <Details summary="+ Add a product they sell" open={offers.length === 0}>
            <OfferForm supplierId={id} products={products} currency={s.currency} />
          </Details>
        </div>
      )}

      {tab === "people" && (
        <Card title="People at this supplier">
          {contacts.length ? (
            <ul className="divide-y divide-line">
              {contacts.map((c) => (
                <li key={c.id} className={`py-3 ${c.is_active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.is_primary && <Chip tone="info">Main contact</Chip>}
                    {!c.is_active && <Chip>No longer there</Chip>}
                    <span className="text-sm text-muted">
                      {c.position}
                      {c.role && ` · ${label(c.role)}`}
                    </span>
                  </div>
                  <p className="text-sm text-muted">{[c.phone, c.whatsapp && `WhatsApp ${c.whatsapp}`, c.email].filter(Boolean).join(" · ") || "No contact details"}</p>
                  <div className="mt-2 flex gap-2">
                    <Details summary="Edit">
                      <ContactForm supplierId={id} c={c} />
                    </Details>
                    <form action={deleteSupplierContact}>
                      <input type="hidden" name="supplier_id" value={id} />
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
              <ContactForm supplierId={id} />
            </Details>
          </div>
        </Card>
      )}

      {tab === "check" && (
        <div className="space-y-4">
          <Card title="Is this supplier checked?" action={<StatusChip status={s.verification_status} />}>
            <p className="mb-3 text-sm text-muted">
              Only mark a supplier <strong>Verified</strong> after you have checked their trade licence and legal identity — a phone call is not enough. Write down who checked and when.
            </p>
            <form action={saveVerification} className="space-y-3">
              <input type="hidden" name="supplier_id" value={id} />
              <Field label="Status">
                <Select name="verification_status" options={OPT.verification} defaultValue={s.verification_status} blank={false} />
              </Field>
              <fieldset className="space-y-2 text-sm">
                <legend className="lbl">What has been checked</legend>
                {(
                  [
                    ["licence_checked", "Trade licence seen and valid"],
                    ["identity_checked", "Legal company identity confirmed"],
                    ["address_checked", "Physical address checked (visit or reliable proof)"],
                    ["authenticity_evidence", "Proof that products are genuine (e.g. brand distributor letter)"],
                    ["bank_checked", "Bank account name matches the company"],
                  ] as const
                ).map(([n, t]) => (
                  <label key={n} className="flex items-start gap-2">
                    <input type="checkbox" name={n} defaultChecked={!!s[n]} className="mt-0.5 h-5 w-5 accent-[var(--brand)]" /> {t}
                  </label>
                ))}
              </fieldset>
              <Field label="Documents collected" hint="e.g. Trade licence copy, VAT certificate">
                <Text name="documents_collected" defaultValue={s.documents_collected} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Date checked">
                  <DateInput name="verified_at" defaultValue={s.verified_at} />
                </Field>
                <Field label="Checked by">
                  <Text name="verified_by" defaultValue={s.verified_by} />
                </Field>
              </div>
              <Field label="Notes and open concerns" hint="Required for “Approved with conditions” and “Rejected”.">
                <Area name="verification_notes" defaultValue={s.verification_notes} rows={2} />
              </Field>
              <Submit>Save checks</Submit>
            </form>
          </Card>
          {verifHistory.length > 0 && (
            <Card title="Earlier changes">
              <ul className="space-y-1 text-sm">
                {verifHistory.map((h) => (
                  <li key={h.id}>
                    <span className="text-muted">{fmtDateTime(h.changed_at)}</span> — {h.old_values?.verification_status ? `${label(h.old_values.verification_status)} → ` : ""}
                    {label(h.new_values?.verification_status ?? s.verification_status)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <Link href={`/suppliers/${id}/log`} className="btn-primary">
            + Record conversation
          </Link>
          {interactions.length === 0 && <Empty>No conversations recorded yet.</Empty>}
          <ol className="space-y-3">
            {interactions.map((i) => (
              <li key={i.id} className="card p-4">
                <div className="text-sm">
                  <span className="font-semibold">{fmtDateTime(i.occurred_at)}</span>{" "}
                  <span className="text-muted">
                    · {label(i.channel)} · {label(i.purpose)} · {label(i.outcome)}
                  </span>
                </div>
                <p className="mt-1 font-medium">{i.summary}</p>
                {(i.customer_statements || i.our_observations || i.our_interpretation) && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {i.customer_statements && <Box title="Supplier said" text={i.customer_statements} />}
                    {i.our_observations && <Box title="We saw" text={i.our_observations} />}
                    {i.our_interpretation && <Box title="Our opinion (private)" text={i.our_interpretation} internal />}
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

function Box({ title, text, internal }: { title: string; text: string; internal?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 text-sm ${internal ? "border-amber-200 bg-internal dark:border-amber-900" : "border-line bg-surface-2"}`}>
      <div className="text-xs font-semibold text-muted">{title}</div>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function OfferCard({ supplierId, o, prices, products, currency, demand }: { supplierId: string; o: Row; prices: Row[]; products: Row[]; currency: string; demand: Row[] }) {
  const tiers = currentTiers(prices);
  const today = todayISO();
  return (
    <section className={`card p-4 ${o.is_active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{o.offer_name}</div>
          <div className="text-xs text-muted">
            {[o.brand, o.model_sku, o.variant].filter(Boolean).join(" · ")}
            {o.product_id ? <> · In your list as {o.product_name}</> : <span className="text-amber-700 dark:text-amber-300"> · Not linked to your product list</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {!o.is_active && <Chip>No longer offered</Chip>}
          <Chip tone={o.stock_status === "out_of_stock" ? "danger" : o.stock_status === "in_stock" ? "ok" : "neutral"}>{label(o.stock_status)}</Chip>
        </div>
      </div>
      <div className="mt-2 text-sm text-muted">
        Minimum order: {o.moq != null ? `${fmtNum(o.moq)} ${o.unit}` : "—"} · Delivery time: {o.lead_time_days != null ? `${o.lead_time_days} days` : "—"} · Local delivery: {o.local_delivery_charge != null ? `${fmtNum(o.local_delivery_charge, 2)} ${currency}` : "—"}
        {o.warranty && <> · Warranty: {o.warranty}</>}
        {o.last_checked_at && <> · Checked {fmtDate(o.last_checked_at)}</>}
      </div>

      <div className="mt-3">
        <div className="mb-1 text-xs font-semibold text-muted">Prices today</div>
        {tiers.length ? (
          <table className="w-full max-w-md text-sm">
            <tbody>
              {tiers.map((t) => (
                <tr key={t.min_qty} className="border-t border-line/60">
                  <td className="py-1 pr-2">{fmtNum(t.min_qty)}+ {o.unit}s</td>
                  <td className="py-1 pr-2 text-right font-medium tabular-nums">
                    {fmtNum(t.unit_price, 2)} {t.currency} each
                  </td>
                  <td className="py-1 text-xs text-muted">{t.valid_until ? `until ${fmtDate(t.valid_until)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">No valid price today. Add one below.</p>
        )}
      </div>

      {demand.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="text-muted">Customers who want this:</span>{" "}
          {demand.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/requirements/${d.id}`} className="text-brand">
                {d.trading_name}
              </Link>
            </span>
          ))}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Details summary="+ Add or change a price">
          <form action={addPrice} className="space-y-3">
            <input type="hidden" name="supplier_id" value={supplierId} />
            <input type="hidden" name="offer_id" value={o.id} />
            <p className="text-xs text-muted">To change a price, add the new one with the date it starts. The old price stays in the history.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="From quantity">
                <NumberInput name="min_qty" defaultValue={1} />
              </Field>
              <Field label="Price each *">
                <NumberInput name="unit_price" />
              </Field>
              <Field label="Currency">
                <Select name="currency" options={OPT.currency} defaultValue={currency} blank={false} />
              </Field>
              <Field label="Where from">
                <Select name="source" options={OPT.priceSource} defaultValue="message" blank={false} />
              </Field>
              <Field label="Valid from" className="col-span-2">
                <DateInput name="valid_from" defaultValue={today} />
              </Field>
              <Field label="Valid until (if known)" className="col-span-2">
                <DateInput name="valid_until" />
              </Field>
              <Field label="Tax note" className="col-span-2" hint="e.g. VAT 5% included">
                <Text name="tax_note" />
              </Field>
              <Field label="Quote number (if any)" className="col-span-2">
                <Text name="source_reference" />
              </Field>
            </div>
            <Submit>Save price</Submit>
          </form>
        </Details>
        {prices.length > 0 && (
          <Details summary={`Price history (${prices.length})`}>
            <ul className="space-y-1 text-sm">
              {prices.map((p) => {
                const until = toISODate(p.valid_until);
                const ended = until != null && until < today;
                return (
                  <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 ${ended ? "text-muted" : ""}`}>
                    <span>
                      {fmtNum(p.min_qty)}+ : <span className="font-medium tabular-nums">{fmtNum(p.unit_price, 2)} {p.currency}</span> · from {fmtDate(p.valid_from)}
                      {until && <> to {fmtDate(until)}</>}
                      {p.source && <> · {label(p.source)}</>}
                      {p.source_reference && <> ({p.source_reference})</>}
                    </span>
                    {!ended && (
                      <form action={endPrice}>
                        <input type="hidden" name="supplier_id" value={supplierId} />
                        <input type="hidden" name="price_id" value={p.id} />
                        <button className="text-xs text-red-700 dark:text-red-300">End this price</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </Details>
        )}
        <Details summary="Edit product">
          <OfferForm supplierId={supplierId} o={o} products={products} currency={currency} />
        </Details>
      </div>
    </section>
  );
}

function OfferForm({ supplierId, o, products, currency }: { supplierId: string; o?: Row; products: Row[]; currency: string }) {
  return (
    <form action={saveOffer} className="space-y-3">
      <input type="hidden" name="supplier_id" value={supplierId} />
      {o && <input type="hidden" name="offer_id" value={o.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product, as the supplier calls it *">
          <Text name="offer_name" defaultValue={o?.offer_name} required />
        </Field>
        <Field label="Same as this product in your list" hint="Needed to compare suppliers and to match customers.">
          <select className="inp" name="product_id" defaultValue={o?.product_id ?? ""}>
            <option value="">Not linked yet</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand">
          <Text name="brand" defaultValue={o?.brand} />
        </Field>
        <Field label="Model / SKU">
          <Text name="model_sku" defaultValue={o?.model_sku} />
        </Field>
        <Field label="Size, colour or version">
          <Text name="variant" defaultValue={o?.variant} />
        </Field>
        <Field label="Made in">
          <Text name="origin_country" defaultValue={o?.origin_country} />
        </Field>
        <Field label="Counted in">
          <Select name="unit" options={OPT.unit} defaultValue={o?.unit ?? "piece"} blank={false} />
        </Field>
        <Field label="Condition">
          <Select name="condition" options={OPT.condition} defaultValue={o?.condition ?? "new"} blank={false} />
        </Field>
        <Field label="Stock">
          <Select name="stock_status" options={OPT.offerStock} defaultValue={o?.stock_status ?? "unknown"} blank={false} />
        </Field>
        <Field label="Quantity available">
          <NumberInput name="available_qty" defaultValue={o?.available_qty} />
        </Field>
        <Field label="Minimum order quantity">
          <NumberInput name="moq" defaultValue={o?.moq} />
        </Field>
        <Field label="Delivery time (days)">
          <NumberInput name="lead_time_days" defaultValue={o?.lead_time_days} />
        </Field>
        <Field label={`Local delivery charge (${currency})`}>
          <NumberInput name="local_delivery_charge" defaultValue={o?.local_delivery_charge} />
        </Field>
        <Field label="Warranty">
          <Text name="warranty" defaultValue={o?.warranty} />
        </Field>
      </div>
      <Field label="Details">
        <Area name="specification" defaultValue={o?.specification} rows={2} />
      </Field>
      <Field label="Returns and replacements">
        <Text name="return_terms" defaultValue={o?.return_terms} />
      </Field>
      {!o && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-4">
          <Field label="First price each">
            <NumberInput name="unit_price" />
          </Field>
          <Field label="From quantity">
            <NumberInput name="min_qty" defaultValue={1} />
          </Field>
          <Field label="Currency">
            <Select name="currency" options={OPT.currency} defaultValue={currency} blank={false} />
          </Field>
          <Field label="Where from">
            <Select name="source" options={OPT.priceSource} defaultValue="message" blank={false} />
          </Field>
        </div>
      )}
      {o && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={o.is_active} className="h-5 w-5 accent-[var(--brand)]" /> Still offered by this supplier
        </label>
      )}
      <Submit>{o ? "Save" : "Add product"}</Submit>
    </form>
  );
}

function ContactForm({ supplierId, c }: { supplierId: string; c?: Row }) {
  return (
    <form action={saveSupplierContact} className="space-y-3">
      <input type="hidden" name="supplier_id" value={supplierId} />
      {c && <input type="hidden" name="contact_id" value={c.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <Text name="name" defaultValue={c?.name} required />
        </Field>
        <Field label="Position">
          <Text name="position" defaultValue={c?.position} />
        </Field>
        <Field label="Handles">
          <Select name="role" options={OPT.supplierContactRole} defaultValue={c?.role} />
        </Field>
        <Field label="Best way to reach">
          <Select name="preferred_channel" options={OPT.supplierChannel} defaultValue={c?.preferred_channel} />
        </Field>
        <Field label="Phone">
          <Text name="phone" type="tel" defaultValue={c?.phone} />
        </Field>
        <Field label="WhatsApp">
          <Text name="whatsapp" type="tel" defaultValue={c?.whatsapp} />
        </Field>
        <Field label="Email">
          <Text name="email" type="email" defaultValue={c?.email} />
        </Field>
      </div>
      <Field label="Notes">
        <Text name="notes" defaultValue={c?.notes} />
      </Field>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="is_primary" defaultChecked={c?.is_primary ?? !c} className="h-5 w-5 accent-[var(--brand)]" /> Main contact
        </label>
        {c && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_active" defaultChecked={c.is_active} className="h-5 w-5 accent-[var(--brand)]" /> Still works there
          </label>
        )}
      </div>
      <Submit>{c ? "Save" : "Add person"}</Submit>
    </form>
  );
}
