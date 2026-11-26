import { notFound } from "next/navigation";
import { Area, BasisFields, Card, Checks, ErrorNote, Field, PageHeader, Select, Submit, Text } from "@/components/ui";
import { archiveBusiness, mergeBusiness, updateBusiness } from "@/lib/actions/customers";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { OPT } from "@/lib/options";

export default async function EditCustomerPage({ params, searchParams }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const b = await one("select * from business where id = $1", [id]);
  if (!b) notFound();
  const others = await q("select id, trading_name, code from business where id <> $1 and archived_at is null order by trading_name", [id]);
  const isPerson = b.customer_kind === "individual";

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${b.trading_name}`} back={{ href: `/customers/${id}`, label: "Back to profile" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={updateBusiness} className="space-y-4">
        <input type="hidden" name="business_id" value={id} />
        <Card title="Basic details">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *">
              <Text name="trading_name" defaultValue={b.trading_name} required />
            </Field>
            <Field label="Other names or spellings" hint="For example the Amharic name. Helps search and avoids duplicates.">
              <Text name="alternate_names" defaultValue={b.alternate_names} />
            </Field>
            <Field label="This customer is" hint="Change and save; the form then shows the matching questions.">
              <Select name="customer_kind" options={OPT.customerKind} defaultValue={b.customer_kind ?? "business"} blank={false} labels={{ business: "A business", individual: "A person (personal use)" }} />
            </Field>
            {!isPerson && (
              <>
                <Field label="Type *">
                  <Select name="business_type" options={OPT.businessType} defaultValue={b.business_type} required />
                </Field>
                <Field label="Registered name">
                  <Text name="legal_name" defaultValue={b.legal_name} />
                </Field>
              </>
            )}
          </div>
          {!isPerson && (
            <>
              <div className="mt-3">
                <Field label="What they sell">
                  <Checks name="sectors" options={OPT.sectors} values={b.sectors} />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Their products, in a sentence">
                  <Text name="product_range_summary" defaultValue={b.product_range_summary} />
                </Field>
              </div>
            </>
          )}
        </Card>

        <Card title={isPerson ? "How we found them" : "More about the business"}>
          <div className="grid gap-3 sm:grid-cols-2">
            {!isPerson && (
              <>
            <Field label="Price level">
              <Select name="price_positioning" options={OPT.pricePositioning} defaultValue={b.price_positioning} />
            </Field>
            <Field label="Number of staff (what you saw)">
              <Select name="staff_size_band" options={OPT.staffSize} defaultValue={b.staff_size_band} />
            </Field>
            <Field label="Years operating">
              <Select name="years_operating_band" options={OPT.yearsOperating} defaultValue={b.years_operating_band} />
            </Field>
              </>
            )}
            <Field label="How we found them">
              <Select name="acquisition_source" options={OPT.acquisitionSource} defaultValue={b.acquisition_source} />
            </Field>
            <Field label="Referred by">
              <select className="inp" name="referred_by_business_id" defaultValue={b.referred_by_business_id ?? ""}>
                <option value="">—</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.trading_name} ({o.code})
                  </option>
                ))}
              </select>
            </Field>
            {!isPerson && (
            <Field label="Business TIN" hint="Only needed for invoices. Never store personal ID numbers.">
              <Text name="tin" defaultValue={b.tin} inputMode="numeric" />
            </Field>
            )}
          </div>
          {!isPerson && (
          <div className="mt-3 space-y-3">
            <Field label="Who they sell to">
              <Checks name="customer_segment" options={OPT.customerSegment} values={b.customer_segment} />
            </Field>
            <Field label="Sales channels">
              <Checks name="sales_channels" options={OPT.salesChannels} values={b.sales_channels} />
            </Field>
          </div>
          )}
        </Card>

        <Card title="Happy with current suppliers?">
          <Field label="Overall, are they happy with where they buy now?">
            <Select name="sourcing_status" options={OPT.sourcingStatus} defaultValue={b.sourcing_status} blank={false} />
          </Field>
          <div className="mt-3">
            <BasisFields basis={b.sourcing_status_basis} verifiedAt={b.sourcing_status_verified_at} />
          </div>
        </Card>

        {!isPerson && (
        <Card title="Is this customer a good fit?">
          <div className="space-y-2 text-sm">
            {(
              [
                ["rel_categories", "Sells products we can get for them"],
                ["rel_recurring", "Buys those products again and again"],
                ["rel_imported", "Products are imported or hard to find in Addis"],
                ["rel_stock", "Has a good amount of stock or many customers"],
              ] as const
            ).map(([n, t]) => (
              <label key={n} className="flex items-start gap-2">
                <input type="checkbox" name={n} defaultChecked={!!b[n]} className="mt-0.5 h-5 w-5 accent-[var(--brand)]" /> {t}
              </label>
            ))}
          </div>
        </Card>
        )}

        <Card title="Privacy and status">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Privacy" hint="“Keep fully private” also leaves them out of demand totals.">
              <Select name="confidentiality_level" options={OPT.confidentiality} defaultValue={b.confidentiality_level} blank={false} />
            </Field>
            <Field label="Set status by hand" hint="Leave on “Automatic” and the app sets it for you.">
              <Select name="stage_override" options={OPT.stageOverride} defaultValue={b.stage_override} blank="Automatic" />
            </Field>
            <Field label="Why">
              <Text name="stage_override_reason" defaultValue={b.stage_override_reason} />
            </Field>
            <Field label="If not a fit: why">
              <Select name="not_a_fit_reason" options={OPT.notAFitReason} defaultValue={b.not_a_fit_reason} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Notes">
              <Area name="notes" defaultValue={b.notes} />
            </Field>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Submit>Save changes</Submit>
        </div>
      </form>

      <details className="mt-8 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-semibold">Is this customer a duplicate? Merge it</summary>
        <form action={mergeBusiness} className="mt-3 space-y-3">
          <input type="hidden" name="business_id" value={id} />
          <p className="text-sm text-muted">
            Everything recorded for <strong>{b.trading_name}</strong> — people, products, problems, conversations, follow-ups and deals — moves to the customer you choose below. <strong>{b.trading_name}</strong> is then hidden, and its name is kept as an &quot;other name&quot; so search still finds it. This can&apos;t be undone automatically.
          </p>
          <Field label="Keep this customer *">
            <select className="inp" name="target_business_id" defaultValue="" required>
              <option value="" disabled>
                — Choose —
              </option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.trading_name} ({o.code})
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirm_merge" required className="mt-0.5 h-5 w-5 accent-[var(--brand)]" /> I understand that {b.trading_name} will be merged into the customer above.
          </label>
          <button className="btn-danger">Merge</button>
        </form>
      </details>

      <form action={archiveBusiness} className="mt-6 border-t border-line pt-4">
        <input type="hidden" name="business_id" value={id} />
        <p className="mb-2 text-sm text-muted">Hiding removes this customer from your lists. Nothing is deleted.</p>
        <button className="btn-danger">Hide this customer</button>
      </form>
    </div>
  );
}
