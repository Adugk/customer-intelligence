import { notFound } from "next/navigation";
import { Area, BasisFields, Card, Checks, ErrorNote, Field, PageHeader, Select, Submit, Text } from "@/components/ui";
import { archiveBusiness, updateBusiness } from "@/lib/actions/customers";
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

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${b.trading_name}`} back={{ href: `/customers/${id}`, label: "Back to profile" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={updateBusiness} className="space-y-4">
        <input type="hidden" name="business_id" value={id} />
        <Card title="Identity">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Trading name *">
              <Text name="trading_name" defaultValue={b.trading_name} required />
            </Field>
            <Field label="Other names / spellings" hint="Amharic or English variants; used for search and duplicate checks.">
              <Text name="alternate_names" defaultValue={b.alternate_names} />
            </Field>
            <Field label="Business type *">
              <Select name="business_type" options={OPT.businessType} defaultValue={b.business_type} required />
            </Field>
            <Field label="Legal name">
              <Text name="legal_name" defaultValue={b.legal_name} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Sectors">
              <Checks name="sectors" options={OPT.sectors} values={b.sectors} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="What they sell overall">
              <Text name="product_range_summary" defaultValue={b.product_range_summary} />
            </Field>
          </div>
        </Card>

        <Card title="Profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price positioning">
              <Select name="price_positioning" options={OPT.pricePositioning} defaultValue={b.price_positioning} />
            </Field>
            <Field label="Staff size (observed)">
              <Select name="staff_size_band" options={OPT.staffSize} defaultValue={b.staff_size_band} />
            </Field>
            <Field label="Years operating">
              <Select name="years_operating_band" options={OPT.yearsOperating} defaultValue={b.years_operating_band} />
            </Field>
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
            <Field label="Business TIN" hint="Only needed for formal invoices later. Never personal ID numbers.">
              <Text name="tin" defaultValue={b.tin} inputMode="numeric" />
            </Field>
          </div>
          <div className="mt-3 space-y-3">
            <Field label="Who they sell to">
              <Checks name="customer_segment" options={OPT.customerSegment} values={b.customer_segment} />
            </Field>
            <Field label="Sales channels">
              <Checks name="sales_channels" options={OPT.salesChannels} values={b.sales_channels} />
            </Field>
          </div>
        </Card>

        <Card title="Sourcing status">
          <Field label="Overall, is this business well served by its current sources?">
            <Select name="sourcing_status" options={OPT.sourcingStatus} defaultValue={b.sourcing_status} blank={false} />
          </Field>
          <div className="mt-3">
            <BasisFields basis={b.sourcing_status_basis} verifiedAt={b.sourcing_status_verified_at} />
          </div>
        </Card>

        <Card title="Relevance check">
          <div className="space-y-2 text-sm">
            {(
              [
                ["rel_categories", "Sells products in categories we can realistically source"],
                ["rel_recurring", "Those products are bought or sold repeatedly"],
                ["rel_imported", "Products are likely imported or hard to find locally"],
                ["rel_stock", "Holds meaningful stock or has repeat customer traffic"],
              ] as const
            ).map(([n, t]) => (
              <label key={n} className="flex items-start gap-2">
                <input type="checkbox" name={n} defaultChecked={!!b[n]} className="mt-0.5 h-5 w-5 accent-[var(--brand)]" /> {t}
              </label>
            ))}
          </div>
        </Card>

        <Card title="Confidentiality and status">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Confidentiality" hint="'Strict' also excludes them from demand totals.">
              <Select name="confidentiality_level" options={OPT.confidentiality} defaultValue={b.confidentiality_level} blank={false} />
            </Field>
            <Field label="Manual stage" hint="Leave empty to let the system calculate the stage.">
              <Select name="stage_override" options={OPT.stageOverride} defaultValue={b.stage_override} blank="Automatic" />
            </Field>
            <Field label="Reason for manual stage">
              <Text name="stage_override_reason" defaultValue={b.stage_override_reason} />
            </Field>
            <Field label="Not-a-fit reason">
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

      <form action={archiveBusiness} className="mt-8 border-t border-line pt-4">
        <input type="hidden" name="business_id" value={id} />
        <p className="mb-2 text-sm text-muted">Archiving hides the business from lists. Data is kept and nothing is deleted.</p>
        <button className="btn-danger">Archive business</button>
      </form>
    </div>
  );
}
