import type { Row } from "@/lib/db";
import { OPT } from "@/lib/options";
import { Area, Card, DateInput, Field, NumberInput, Select, Text } from "./ui";

/** Customer-quote form fields (new quote and edit draft). */
export function QuoteFields({ qt, line, costCurrency, suggestedRate }: { qt?: Row; line?: Row; costCurrency?: string | null; suggestedRate?: number | null }) {
  const cc = qt?.cost_currency ?? costCurrency ?? null;
  return (
    <div className="space-y-4">
      <Card title="Price for the customer">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Description" className="col-span-2 sm:col-span-4">
            <Text name="description" defaultValue={line?.description} />
          </Field>
          <Field label="Quantity *">
            <NumberInput name="qty" defaultValue={line?.qty} />
          </Field>
          <Field label="Price each *">
            <NumberInput name="unit_price" defaultValue={line?.unit_price} />
          </Field>
          <Field label="Currency">
            <Select name="currency" options={OPT.currency} defaultValue={qt?.currency ?? "ETB"} blank={false} />
          </Field>
          <Field label="Valid until *">
            <DateInput name="valid_until" defaultValue={qt?.valid_until} />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Our service fee">
            <NumberInput name="service_fee" defaultValue={qt?.service_fee} />
          </Field>
          <Field label="Transport (estimate)">
            <NumberInput name="transport_charge" defaultValue={qt?.transport_charge} />
          </Field>
          <Field label="Customs, tax, clearance (estimate)">
            <NumberInput name="duty_charge" defaultValue={qt?.duty_charge} />
          </Field>
          <Field label="Local delivery">
            <NumberInput name="local_delivery_charge" defaultValue={qt?.local_delivery_charge} />
          </Field>
          <Field label="Other">
            <NumberInput name="other_charge" defaultValue={qt?.other_charge} />
          </Field>
          <Field label="Other is for">
            <Text name="other_charge_label" defaultValue={qt?.other_charge_label} />
          </Field>
        </div>
      </Card>
      <Card title="Terms the customer sees">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment terms" hint="e.g. 50% deposit to order, balance on delivery">
            <Text name="payment_terms" defaultValue={qt?.payment_terms} />
          </Field>
          <Field label="Delivery estimate" hint="e.g. 2–3 weeks after deposit">
            <Text name="delivery_estimate" defaultValue={qt?.delivery_estimate} />
          </Field>
          <Field label="What's included">
            <Area name="included" defaultValue={qt?.included} rows={2} />
          </Field>
          <Field label="What's not included">
            <Area name="exclusions" defaultValue={qt?.exclusions} rows={2} />
          </Field>
          <Field label="Not certain yet" className="sm:col-span-2" hint="Be honest about what may change, e.g. customs charges are an estimate">
            <Area name="uncertain" defaultValue={qt?.uncertain} rows={2} />
          </Field>
        </div>
      </Card>
      <Card title="Our cost (private — never shown to the customer)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Supplier price each (estimate)">
            <NumberInput name="est_unit_cost" defaultValue={line?.est_unit_cost} />
          </Field>
          <Field label="In currency">
            <Select name="cost_currency" options={OPT.currency} defaultValue={cc ?? "AED"} blank={false} />
          </Field>
          <Field label="Rate: 1 of that = ? quote currency" hint={suggestedRate ? `Latest recorded: ${suggestedRate}` : "Add rates on the Money page"}>
            <NumberInput name="cost_rate_to_quote" defaultValue={qt?.cost_rate_to_quote ?? suggestedRate ?? undefined} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
