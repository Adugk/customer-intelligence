import { notFound } from "next/navigation";
import { Area, Card, Checks, ErrorNote, Field, NumberInput, PageHeader, Select, Submit, Text } from "@/components/ui";
import { archiveSupplier, updateSupplier } from "@/lib/actions/suppliers";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { OPT } from "@/lib/options";

export default async function EditSupplierPage({ params, searchParams }: PageProps<"/suppliers/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const s = await one("select * from supplier where id = $1", [id]);
  if (!s) notFound();
  const customers = await q("select id, trading_name, code from business where archived_at is null and customer_kind = 'business' order by trading_name");

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${s.display_name}`} back={{ href: `/suppliers/${id}`, label: "Back to supplier" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={updateSupplier} className="space-y-4">
        <input type="hidden" name="supplier_id" value={id} />
        <Card title="Basic details">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *">
              <Text name="display_name" defaultValue={s.display_name} required />
            </Field>
            <Field label="Registered name">
              <Text name="legal_name" defaultValue={s.legal_name} />
            </Field>
            <Field label="Type *">
              <Select name="supplier_type" options={OPT.supplierType} defaultValue={s.supplier_type} required />
            </Field>
            <Field label="Country *">
              <Text name="country" defaultValue={s.country} required list="countries" />
            </Field>
            <Field label="City">
              <Text name="city" defaultValue={s.city} />
            </Field>
            <Field label="Address">
              <Text name="address" defaultValue={s.address} />
            </Field>
            <Field label="Phone">
              <Text name="phone" type="tel" defaultValue={s.phone} />
            </Field>
            <Field label="WhatsApp">
              <Text name="whatsapp" type="tel" defaultValue={s.whatsapp} />
            </Field>
            <Field label="Email">
              <Text name="email" type="email" defaultValue={s.email} />
            </Field>
            <Field label="Website or online shop">
              <Text name="website" defaultValue={s.website} />
            </Field>
            <Field label="Trade licence number">
              <Text name="licence_number" defaultValue={s.licence_number} />
            </Field>
            <Field label="Tax (TRN / VAT) number">
              <Text name="tax_number" defaultValue={s.tax_number} />
            </Field>
          </div>
          <datalist id="countries">
            {OPT.supplierCountry.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Card>

        <Card title="What they sell">
          <Field label="Product groups">
            <Checks name="categories" options={OPT.sectors} values={s.categories} />
          </Field>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Brands">
              <Text name="brands" defaultValue={s.brands} />
            </Field>
            <Field label="Can they export to Ethiopia?">
              <Select name="export_capable" options={OPT.yesNoUnknown} defaultValue={s.export_capable} blank={false} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="What else they can do" hint="e.g. custom packaging, own brand, large quantities">
              <Area name="capabilities" defaultValue={s.capabilities} rows={2} />
            </Field>
          </div>
        </Card>

        <Card title="Terms">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prices in">
              <Select name="currency" options={OPT.currency} defaultValue={s.currency} blank={false} />
            </Field>
            <Field label="Tax / VAT" hint="e.g. Prices include 5% VAT">
              <Text name="vat_note" defaultValue={s.vat_note} />
            </Field>
            <Field label="Payment terms" hint="e.g. Full payment before collection">
              <Text name="payment_terms" defaultValue={s.payment_terms} />
            </Field>
            <Field label="Deposit">
              <Text name="deposit_terms" defaultValue={s.deposit_terms} />
            </Field>
            <Field label="Credit (if any)">
              <Text name="credit_terms" defaultValue={s.credit_terms} />
            </Field>
            <Field label={`Minimum order value (${s.currency})`}>
              <NumberInput name="min_order_value" defaultValue={s.min_order_value} />
            </Field>
            <Field label="Usual delivery time (days)">
              <NumberInput name="typical_lead_time_days" defaultValue={s.typical_lead_time_days} />
            </Field>
            <Field label="Delivery charges">
              <Text name="delivery_charges" defaultValue={s.delivery_charges} />
            </Field>
            <Field label="Delivers to">
              <Text name="delivery_areas" defaultValue={s.delivery_areas} />
            </Field>
            <Field label="Samples">
              <Text name="sample_policy" defaultValue={s.sample_policy} />
            </Field>
            <Field label="Returns and replacements">
              <Text name="return_policy" defaultValue={s.return_policy} />
            </Field>
            <Field label="Warranty">
              <Text name="warranty_terms" defaultValue={s.warranty_terms} />
            </Field>
          </div>
        </Card>

        <Card title="Other">
          <Field label="Also one of our customers?" hint="If this company also buys from us, link it so it isn't entered twice.">
            <select className="inp" name="linked_business_id" defaultValue={s.linked_business_id ?? ""}>
              <option value="">No</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trading_name} ({c.code})
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-3">
            <Field label="Notes">
              <Area name="notes" defaultValue={s.notes} />
            </Field>
          </div>
        </Card>
        <Submit>Save changes</Submit>
      </form>

      <form action={archiveSupplier} className="mt-8 border-t border-line pt-4">
        <input type="hidden" name="supplier_id" value={id} />
        <p className="mb-2 text-sm text-muted">Hiding removes this supplier from your lists. Nothing is deleted.</p>
        <button className="btn-danger">Hide this supplier</button>
      </form>
    </div>
  );
}
