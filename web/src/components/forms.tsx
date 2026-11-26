// Reusable record forms (server-rendered; submit to server actions).
import type { Row } from "@/lib/db";
import { addFollowUp } from "@/lib/actions/activity";
import { saveBranch, saveCondition, saveContact, savePurchasingProfile, saveProblem, saveSource } from "@/lib/actions/customers";
import { AUTHORITY_LABELS, BASIS_META, label, OPT } from "@/lib/options";

const BASIS_LABELS = Object.fromEntries(Object.entries(BASIS_META).map(([k, v]) => [k, v.label]));
import { Area, BasisFields, Checks, DateInput, Field, NumberInput, Select, SeveritySelect, Submit, Text } from "./ui";

type Req = { id: string; customer_description: string };

function Hidden({ businessId, returnRequirementId }: { businessId: string; returnRequirementId?: string }) {
  return (
    <>
      <input type="hidden" name="business_id" value={businessId} />
      {returnRequirementId && <input type="hidden" name="return_requirement_id" value={returnRequirementId} />}
    </>
  );
}

function ReqSelect({ requirements, value, fixed }: { requirements: Req[]; value?: string | null; fixed?: string }) {
  if (fixed) return <input type="hidden" name="requirement_id" value={fixed} />;
  return (
    <Field label="Which product?" hint="Choose 'All products' if it is not about one product.">
      <select className="inp" name="requirement_id" defaultValue={value ?? ""}>
        <option value="">All products</option>
        {requirements.map((r) => (
          <option key={r.id} value={r.id}>
            {r.customer_description}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function SourceForm({ businessId, s, requirements = [], fixedRequirement }: { businessId: string; s?: Row; requirements?: Req[]; fixedRequirement?: string }) {
  return (
    <form action={saveSource} className="space-y-3">
      <Hidden businessId={businessId} returnRequirementId={fixedRequirement} />
      {s && <input type="hidden" name="source_id" value={s.id} />}
      <ReqSelect requirements={requirements} value={s?.requirement_id} fixed={fixedRequirement} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type of supplier *">
          <Select name="source_type" options={OPT.sourceType} defaultValue={s?.source_type} required />
        </Field>
        <Field label="Where is the supplier?">
          <Select name="source_origin" options={OPT.sourceOrigin} defaultValue={s?.source_origin} />
        </Field>
        <Field label="How much do they use it?">
          <Select name="role" options={OPT.sourceRole} defaultValue={s?.role} />
        </Field>
        <Field label="How happy are they with it?">
          <Select name="satisfaction" options={OPT.satisfaction} defaultValue={s?.satisfaction} />
        </Field>
        <Field label="Did they tell you the supplier's name?" hint="Never push for this. The name stays hidden and is never exported.">
          <Select name="name_disclosure" options={OPT.nameDisclosure} defaultValue={s?.name_disclosure ?? "not_asked"} blank={false} />
        </Field>
        <Field label="Supplier name (only if they told you)">
          <Text name="supplier_name" defaultValue={s?.supplier_name} />
        </Field>
        <Field label="Used for how long">
          <Select name="relationship_length" options={OPT.relationshipLength} defaultValue={s?.relationship_length} />
        </Field>
      </div>
      <Field label="What this supplier does well">
        <Checks name="strengths" options={OPT.strengths} values={s?.strengths} />
      </Field>
      <p className="text-xs text-muted">Add what goes wrong with this supplier as a problem.</p>
      <BasisFields basis={s?.basis} verifiedAt={s?.verified_at} />
      <Submit>{s ? "Save" : "Add"}</Submit>
    </form>
  );
}

export function ProblemForm({ businessId, p, requirements = [], fixedRequirement, sources = [] }: { businessId: string; p?: Row; requirements?: Req[]; fixedRequirement?: string; sources?: Row[] }) {
  return (
    <form action={saveProblem} className="space-y-3">
      <Hidden businessId={businessId} returnRequirementId={fixedRequirement} />
      {p && <input type="hidden" name="problem_id" value={p.id} />}
      <ReqSelect requirements={requirements} value={p?.requirement_id} fixed={fixedRequirement} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type of problem *">
          <Select name="category" options={OPT.problemCategory} defaultValue={p?.category} required />
        </Field>
        <Field label="Where did this come from? *" hint="If it is only our opinion, choose 'Our estimate' or 'Our guess'.">
          <Select name="basis" options={OPT.problemBasis} defaultValue={p?.basis ?? "confirmed"} blank={false} labels={BASIS_LABELS} />
        </Field>
        <Field label="How often? *">
          <Select name="frequency" options={OPT.problemFrequency} defaultValue={p?.frequency} required />
        </Field>
        <Field label="How serious? *">
          <SeveritySelect name="severity" defaultValue={p?.severity} />
        </Field>
      </div>
      <Field label="What happens? *" hint="Use the customer's own words if you can.">
        <Area name="description" defaultValue={p?.description} required rows={2} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What it costs them" hint="e.g. 'Loses about 10 customers a week when out of stock'">
          <Text name="impact_note" defaultValue={p?.impact_note} />
        </Field>
        <Field label="What they do about it now">
          <Text name="current_workaround" defaultValue={p?.current_workaround} />
        </Field>
        <Field label="Can we help with this?">
          <Select name="addressable_by_us" options={OPT.addressable} defaultValue={p?.addressable_by_us ?? "unknown"} blank={false} />
        </Field>
        <Field label="Status">
          <Select name="status" options={OPT.problemStatus} defaultValue={p?.status ?? "active"} blank={false} />
        </Field>
        {sources.length > 0 && (
          <Field label="Caused by which supplier?">
            <select className="inp" name="current_source_id" defaultValue={p?.current_source_id ?? ""}>
              <option value="">—</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {label(s.source_type)}
                  {s.source_origin ? ` (${label(s.source_origin)})` : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Submit>{p ? "Save" : "Add problem"}</Submit>
    </form>
  );
}

export function ConditionForm({ businessId, c, requirements = [], fixedRequirement }: { businessId: string; c?: Row; requirements?: Req[]; fixedRequirement?: string }) {
  return (
    <form action={saveCondition} className="space-y-3">
      <Hidden businessId={businessId} returnRequirementId={fixedRequirement} />
      {c && <input type="hidden" name="condition_id" value={c.id} />}
      <ReqSelect requirements={requirements} value={c?.requirement_id} fixed={fixedRequirement} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What kind of condition? *">
          <Select name="condition_type" options={OPT.conditionType} defaultValue={c?.condition_type} required />
        </Field>
        <Field label="How important? *">
          <Select name="importance" options={OPT.importance} defaultValue={c?.importance ?? "important"} blank={false} />
        </Field>
      </div>
      <Field label="Details *" hint="Be specific, e.g. 'At least 10% cheaper than now' or '30 days to pay after the third order'.">
        <Text name="detail" defaultValue={c?.detail} required />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Number (optional)">
          <NumberInput name="threshold_value" defaultValue={c?.threshold_value} />
        </Field>
        <Field label="Unit">
          <Text name="threshold_unit" defaultValue={c?.threshold_unit} placeholder="ETB, days, pieces" />
        </Field>
        <Field label="Can we do this?" className="col-span-2">
          <Select name="our_position" options={OPT.ourPosition} defaultValue={c?.our_position} />
        </Field>
      </div>
      <Field label="Exclusive deal details (only if asked)" hint="Which product, which area and for how long.">
        <Text name="exclusivity_scope" defaultValue={c?.exclusivity_scope} />
      </Field>
      <BasisFields basis={c?.basis} verifiedAt={c?.verified_at} />
      <Submit>{c ? "Save" : "Add condition"}</Submit>
    </form>
  );
}

export function ContactForm({ businessId, c, branches = [] }: { businessId: string; c?: Row; branches?: Row[] }) {
  return (
    <form action={saveContact} className="space-y-3">
      <input type="hidden" name="business_id" value={businessId} />
      {c && <input type="hidden" name="contact_id" value={c.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <Text name="name" defaultValue={c?.name} required />
        </Field>
        <Field label="Job title">
          <Text name="job_title" defaultValue={c?.job_title} />
        </Field>
        <Field label="Phone">
          <Text name="phone_primary" type="tel" inputMode="tel" defaultValue={c?.phone_primary} />
        </Field>
        <Field label="Second phone">
          <Text name="phone_secondary" type="tel" inputMode="tel" defaultValue={c?.phone_secondary} />
        </Field>
        <Field label="WhatsApp">
          <Text name="whatsapp" type="tel" inputMode="tel" defaultValue={c?.whatsapp} />
        </Field>
        <Field label="Telegram">
          <Text name="telegram" defaultValue={c?.telegram} />
        </Field>
        <Field label="Email">
          <Text name="email" type="email" inputMode="email" defaultValue={c?.email} />
        </Field>
        <Field label="Preferred channel">
          <Select name="preferred_channel" options={OPT.channel} defaultValue={c?.preferred_channel} />
        </Field>
        <Field label="Best time to contact">
          <Text name="best_time_to_contact" defaultValue={c?.best_time_to_contact} />
        </Field>
        <Field label="Language">
          <Select name="language_preference" options={OPT.language} defaultValue={c?.language_preference} />
        </Field>
        {branches.length > 1 && (
          <Field label="Works at">
            <select className="inp" name="branch_id" defaultValue={c?.branch_id ?? ""}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.branch_label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Their role in buying">
        <Checks name="decision_roles" options={OPT.decisionRoles} values={c?.decision_roles} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Can they decide to buy?">
          <Select name="purchasing_authority" options={OPT.purchasingAuthority} defaultValue={c?.purchasing_authority ?? "unknown"} blank={false} labels={AUTHORITY_LABELS} />
        </Field>
        <Field label="Can they approve payment?">
          <Select name="payment_authority" options={OPT.paymentAuthority} defaultValue={c?.payment_authority ?? "unknown"} blank={false} labels={AUTHORITY_LABELS} />
        </Field>
      </div>
      <BasisFields basis={c?.authority_basis} verifiedAt={c?.authority_verified_at} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="May we contact them?" hint="If they asked not to be contacted, their planned follow-ups are cancelled.">
          <Select name="contact_permission" options={OPT.contactPermission} defaultValue={c?.contact_permission ?? "not_asked"} blank={false} />
        </Field>
        <Field label="Why they don't want contact">
          <Text name="opt_out_reason" defaultValue={c?.opt_out_reason} />
        </Field>
      </div>
      <Field label="Only through these (if they said)">
        <Checks name="permitted_channels" options={OPT.channel} values={c?.permitted_channels} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_primary" defaultChecked={c?.is_primary ?? !c} className="h-5 w-5 accent-[var(--brand)]" /> Main contact
      </label>
      <Field label="Notes">
        <Area name="notes" defaultValue={c?.notes} rows={2} />
      </Field>
      <Submit>{c ? "Save" : "Add person"}</Submit>
    </form>
  );
}

export function BranchForm({ businessId, b }: { businessId: string; b?: Row }) {
  return (
    <form action={saveBranch} className="space-y-3">
      <input type="hidden" name="business_id" value={businessId} />
      {b && <input type="hidden" name="branch_id" value={b.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name of this place">
          <Text name="branch_label" defaultValue={b?.branch_label ?? "Branch"} />
        </Field>
        <Field label="City">
          <Text name="city" defaultValue={b?.city ?? "Addis Ababa"} />
        </Field>
        <Field label="Sub-city">
          <Select name="sub_city" options={OPT.subCity} defaultValue={b?.sub_city} />
        </Field>
        <Field label="Woreda">
          <Text name="woreda" defaultValue={b?.woreda} inputMode="numeric" />
        </Field>
        <Field label="Area">
          <Text name="area" defaultValue={b?.area} list="areas" />
        </Field>
        <Field label="Shop phone">
          <Text name="branch_phone" type="tel" defaultValue={b?.branch_phone} />
        </Field>
        <Field label="Latitude">
          <NumberInput name="gps_lat" defaultValue={b?.gps_lat} />
        </Field>
        <Field label="Longitude">
          <NumberInput name="gps_lng" defaultValue={b?.gps_lng} />
        </Field>
        <Field label="Opening hours">
          <Text name="opening_hours" defaultValue={b?.opening_hours} />
        </Field>
        <Field label="Storage space" hint="Small storage often explains small orders.">
          <Text name="storage_note" defaultValue={b?.storage_note} />
        </Field>
      </div>
      <datalist id="areas">
        {OPT.areaSuggestions.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <Field label="Directions">
        <Text name="directions" defaultValue={b?.directions} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_main" defaultChecked={b?.is_main ?? false} className="h-5 w-5 accent-[var(--brand)]" /> Main shop
      </label>
      <Submit>{b ? "Save" : "Add"}</Submit>
    </form>
  );
}

export function PurchasingProfileForm({ businessId, p }: { businessId: string; p?: Row }) {
  return (
    <form action={savePurchasingProfile} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      <Field label="How do they usually restock?" hint="In their own words.">
        <Area name="restock_process" defaultValue={p?.restock_process} rows={2} />
      </Field>
      <Field label="Where they buy (tick all that apply)">
        <Checks name="source_types_used" options={OPT.sourceType} values={p?.source_types_used} />
      </Field>
      <Field label="What makes them restock">
        <Checks name="restock_trigger" options={OPT.restockTrigger} values={p?.restock_trigger} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Do they import directly?">
          <Select name="imports_directly" options={OPT.importsDirectly} defaultValue={p?.imports_directly} />
        </Field>
        <Field label="Usual spend per purchase (optional)">
          <Select name="typical_purchase_value_band" options={OPT.purchaseValueBand} defaultValue={p?.typical_purchase_value_band} />
        </Field>
        <Field label="Payment timing">
          <Select name="payment_timing" options={OPT.paymentTiming} defaultValue={p?.payment_timing} />
        </Field>
        <Field label="Days to pay (if on credit)">
          <NumberInput name="credit_days_expected" defaultValue={p?.credit_days_expected} />
        </Field>
        <Field label="How fast they expect delivery (days)">
          <NumberInput name="expected_lead_time_days" defaultValue={p?.expected_lead_time_days} />
        </Field>
        <Field label="Do they need a receipt or VAT invoice?">
          <Select name="needs_formal_receipt" options={OPT.formalReceipt} defaultValue={p?.needs_formal_receipt} />
        </Field>
      </div>
      <Field label="Payment methods used">
        <Checks name="payment_methods_used" options={OPT.paymentMethods} values={p?.payment_methods_used} />
      </Field>
      <Field label="How goods reach them">
        <Checks name="goods_receipt_method" options={OPT.goodsReceipt} values={p?.goods_receipt_method} />
      </Field>
      <Field label="What limits their buying">
        <Checks name="purchasing_constraints" options={OPT.constraints} values={p?.purchasing_constraints} />
      </Field>
      <Field label="More details">
        <Text name="constraints_note" defaultValue={p?.constraints_note} />
      </Field>
      <BasisFields basis={p?.basis} verifiedAt={p?.verified_at} />
      <Submit>Save</Submit>
    </form>
  );
}

export function FollowUpQuickForm({ businessId, contacts = [], requirementId, opportunityId, returnTo, defaultDate }: { businessId: string; contacts?: Row[]; requirementId?: string; opportunityId?: string; returnTo: string; defaultDate: string }) {
  return (
    <form action={addFollowUp} className="space-y-3">
      <input type="hidden" name="business_id" value={businessId} />
      {requirementId && <input type="hidden" name="requirement_id" value={requirementId} />}
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      <input type="hidden" name="return_to" value={returnTo} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date *">
          <DateInput name="due_date" defaultValue={defaultDate} />
        </Field>
        <Field label="How">
          <Select name="action_type" options={OPT.followUpAction} defaultValue="call" blank={false} />
        </Field>
        <Field label="With">
          <select className="inp" name="contact_id" defaultValue={contacts[0]?.id ?? ""}>
            <option value="">—</option>
            {contacts
              .filter((c) => c.contact_permission !== "asked_not_to_contact")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <Field label="What for? *">
        <Text name="purpose" required placeholder="e.g. Ask about monthly quantities" />
      </Field>
      <Submit>Plan follow-up</Submit>
    </form>
  );
}
