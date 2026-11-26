import type { Row } from "@/lib/db";
import { label, OPT } from "@/lib/options";
import { Area, DateInput, Field, NumberInput, Select, Text } from "./ui";

/** The request form fields, shared by "new request" and "edit request". */
export function RequestFields({ r, products, contacts }: { r?: Row; products: Row[]; contacts: Row[] }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="What do they want? *" className="sm:col-span-2" hint="Exact product, e.g. iPhone 15 Pro 256GB, Natural Titanium">
          <Text name="description" defaultValue={r?.description} required />
        </Field>
        <Field label="How many? *">
          <NumberInput name="quantity" defaultValue={r?.quantity} />
        </Field>
      </div>
      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 text-sm font-semibold">What is it for? *</legend>
        <p className="mb-2 text-xs text-muted">This decides how it can be brought to Ethiopia. Goods for resale always need the commercial import route — they can never travel as personal baggage.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPT.useType.map((u) => (
            <label key={u} className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
              <input type="radio" name="use_type" value={u} defaultChecked={(r?.use_type ?? "unsure") === u} className="h-4 w-4 accent-[var(--brand)]" /> {label(u)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Needed by *">
          <DateInput name="needed_by" defaultValue={r?.needed_by} />
        </Field>
        <Field label="How urgent">
          <Select name="urgency" options={OPT.urgency} defaultValue={r?.urgency} />
        </Field>
        <Field label="Counted in">
          <Select name="unit" options={OPT.unit} defaultValue={r?.unit ?? "piece"} blank={false} />
        </Field>
        <Field label="Same as this product in your list" className="sm:col-span-2" hint="Needed to compare suppliers and combine customers.">
          <select className="inp" name="product_id" defaultValue={r?.product_id ?? ""}>
            <option value="">Not linked</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Person who asked">
          <select className="inp" name="contact_id" defaultValue={r?.contact_id ?? contacts[0]?.id ?? ""}>
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <details className="rounded-lg border border-line p-3" open={!!(r?.specification || r?.target_price || r?.reference_link)}>
        <summary className="cursor-pointer text-sm font-semibold">More details (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Details" className="sm:col-span-2" hint="Size, colour, version, original or not…">
            <Area name="specification" defaultValue={r?.specification} rows={2} />
          </Field>
          <Field label="Link or photo address">
            <Text name="reference_link" defaultValue={r?.reference_link} />
          </Field>
          <Field label="Would accept instead">
            <Text name="accept_alternatives" defaultValue={r?.accept_alternatives} />
          </Field>
          <Field label="Price they hope for (each)">
            <NumberInput name="target_price" defaultValue={r?.target_price} />
          </Field>
          <Field label="Currency">
            <Select name="target_currency" options={OPT.currency} defaultValue={r?.target_currency ?? "ETB"} blank={false} />
          </Field>
          <Field label="Deliver to">
            <Text name="delivery_place" defaultValue={r?.delivery_place} />
          </Field>
          <Field label="They asked by">
            <Select name="channel" options={OPT.interactionChannel} defaultValue={r?.channel} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Area name="notes" defaultValue={r?.notes} rows={2} />
          </Field>
        </div>
      </details>
    </div>
  );
}
