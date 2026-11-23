// Reusable record forms (server-rendered; submit to server actions).
import type { Row } from "@/lib/db";
import { addFollowUp } from "@/lib/actions/activity";
import { saveBranch, saveCondition, saveContact, savePurchasingProfile, saveProblem, saveSource } from "@/lib/actions/customers";
import { label, OPT } from "@/lib/options";
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
    <Field label="Applies to" hint="Leave as 'whole business' if it is not about one product.">
      <select className="inp" name="requirement_id" defaultValue={value ?? ""}>
        <option value="">Whole business</option>
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
        <Field label="Type of source *">
          <Select name="source_type" options={OPT.sourceType} defaultValue={s?.source_type} required />
        </Field>
        <Field label="Where is it?">
          <Select name="source_origin" options={OPT.sourceOrigin} defaultValue={s?.source_origin} />
        </Field>
        <Field label="Role for them">
          <Select name="role" options={OPT.sourceRole} defaultValue={s?.role} />
        </Field>
        <Field label="Their satisfaction (as they said it)">
          <Select name="satisfaction" options={OPT.satisfaction} defaultValue={s?.satisfaction} />
        </Field>
        <Field label="Supplier name" hint="Never pressure for this. Hidden by default and excluded from exports.">
          <Select name="name_disclosure" options={OPT.nameDisclosure} defaultValue={s?.name_disclosure ?? "not_asked"} blank={false} />
        </Field>
        <Field label="Name (only if disclosed)">
          <Text name="supplier_name" defaultValue={s?.supplier_name} />
        </Field>
        <Field label="How long they have used it">
          <Select name="relationship_length" options={OPT.relationshipLength} defaultValue={s?.relationship_length} />
        </Field>
      </div>
      <Field label="What this source does well">
        <Checks name="strengths" options={OPT.strengths} values={s?.strengths} />
      </Field>
      <p className="text-xs text-muted">Record weaknesses as problems, so each one has evidence and severity.</p>
      <BasisFields basis={s?.basis} verifiedAt={s?.verified_at} />
      <Submit>{s ? "Save source" : "Add source"}</Submit>
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
        <Field label="Problem category *">
          <Select name="category" options={OPT.problemCategory} defaultValue={p?.category} required />
        </Field>
        <Field label="Who says so? *" hint="Our inferences must be marked as estimate or assumption.">
          <Select name="basis" options={OPT.problemBasis} defaultValue={p?.basis ?? "confirmed"} blank={false} />
        </Field>
        <Field label="How often *">
          <Select name="frequency" options={OPT.problemFrequency} defaultValue={p?.frequency} required />
        </Field>
        <Field label="Severity *">
          <SeveritySelect name="severity" defaultValue={p?.severity} />
        </Field>
      </div>
      <Field label="What happens? *" hint="In the customer's words where possible.">
        <Area name="description" defaultValue={p?.description} required rows={2} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Impact" hint="e.g. 'Loses about 10 customers a week when out'">
          <Text name="impact_note" defaultValue={p?.impact_note} />
        </Field>
        <Field label="What they do about it now">
          <Text name="current_workaround" defaultValue={p?.current_workaround} />
        </Field>
        <Field label="Can we address it?">
          <Select name="addressable_by_us" options={OPT.addressable} defaultValue={p?.addressable_by_us ?? "unknown"} blank={false} />
        </Field>
        <Field label="Status">
          <Select name="status" options={OPT.problemStatus} defaultValue={p?.status ?? "active"} blank={false} />
        </Field>
        {sources.length > 0 && (
          <Field label="Caused by source">
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
      <Submit>{p ? "Save problem" : "Add problem"}</Submit>
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
        <Field label="Condition *">
          <Select name="condition_type" options={OPT.conditionType} defaultValue={c?.condition_type} required />
        </Field>
        <Field label="Importance *">
          <Select name="importance" options={OPT.importance} defaultValue={c?.importance ?? "important"} blank={false} />
        </Field>
      </div>
      <Field label="Detail *" hint="Specific and testable, e.g. 'At least 10% below current price', '30 days credit after third order'.">
        <Text name="detail" defaultValue={c?.detail} required />
      </Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Threshold">
          <NumberInput name="threshold_value" defaultValue={c?.threshold_value} />
        </Field>
        <Field label="Unit">
          <Text name="threshold_unit" defaultValue={c?.threshold_unit} placeholder="ETB, days, pcs" />
        </Field>
        <Field label="Can we meet it?" className="col-span-2">
          <Select name="our_position" options={OPT.ourPosition} defaultValue={c?.our_position} />
        </Field>
      </div>
      <Field label="Exclusivity scope (only for exclusivity)" hint="Product, area and duration they asked for.">
        <Text name="exclusivity_scope" defaultValue={c?.exclusivity_scope} />
      </Field>
      <BasisFields basis={c?.basis} verifiedAt={c?.verified_at} />
      <Submit>{c ? "Save condition" : "Add condition"}</Submit>
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
      <Field label="Role in buying decisions">
        <Checks name="decision_roles" options={OPT.decisionRoles} values={c?.decision_roles} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Can commit to buying?">
          <Select name="purchasing_authority" options={OPT.purchasingAuthority} defaultValue={c?.purchasing_authority ?? "unknown"} blank={false} />
        </Field>
        <Field label="Can approve payment?">
          <Select name="payment_authority" options={OPT.paymentAuthority} defaultValue={c?.payment_authority ?? "unknown"} blank={false} />
        </Field>
      </div>
      <BasisFields basis={c?.authority_basis} verifiedAt={c?.authority_verified_at} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contact permission" hint="'Asked not to contact' cancels open follow-ups.">
          <Select name="contact_permission" options={OPT.contactPermission} defaultValue={c?.contact_permission ?? "not_asked"} blank={false} />
        </Field>
        <Field label="Opt-out reason">
          <Text name="opt_out_reason" defaultValue={c?.opt_out_reason} />
        </Field>
      </div>
      <Field label="Permitted channels (if specific)">
        <Checks name="permitted_channels" options={OPT.channel} values={c?.permitted_channels} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_primary" defaultChecked={c?.is_primary ?? !c} className="h-5 w-5 accent-[var(--brand)]" /> Primary contact
      </label>
      <Field label="Notes">
        <Area name="notes" defaultValue={c?.notes} rows={2} />
      </Field>
      <Submit>{c ? "Save contact" : "Add contact"}</Submit>
    </form>
  );
}

export function BranchForm({ businessId, b }: { businessId: string; b?: Row }) {
  return (
    <form action={saveBranch} className="space-y-3">
      <input type="hidden" name="business_id" value={businessId} />
      {b && <input type="hidden" name="branch_id" value={b.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label">
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
        <Field label="Storage note" hint="Storage limits explain small orders.">
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
        <input type="checkbox" name="is_main" defaultChecked={b?.is_main ?? false} className="h-5 w-5 accent-[var(--brand)]" /> Main location
      </label>
      <Submit>{b ? "Save location" : "Add location"}</Submit>
    </form>
  );
}

export function PurchasingProfileForm({ businessId, p }: { businessId: string; p?: Row }) {
  return (
    <form action={savePurchasingProfile} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />
      <Field label="How does a typical restock happen?" hint="In their words.">
        <Area name="restock_process" defaultValue={p?.restock_process} rows={2} />
      </Field>
      <Field label="Where they buy (all that apply)">
        <Checks name="source_types_used" options={OPT.sourceType} values={p?.source_types_used} />
      </Field>
      <Field label="What triggers a restock">
        <Checks name="restock_trigger" options={OPT.restockTrigger} values={p?.restock_trigger} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Do they import directly?">
          <Select name="imports_directly" options={OPT.importsDirectly} defaultValue={p?.imports_directly} />
        </Field>
        <Field label="Typical purchase size (optional, sensitive)">
          <Select name="typical_purchase_value_band" options={OPT.purchaseValueBand} defaultValue={p?.typical_purchase_value_band} />
        </Field>
        <Field label="Payment timing">
          <Select name="payment_timing" options={OPT.paymentTiming} defaultValue={p?.payment_timing} />
        </Field>
        <Field label="Credit days expected">
          <NumberInput name="credit_days_expected" defaultValue={p?.credit_days_expected} />
        </Field>
        <Field label="Expected lead time (days)">
          <NumberInput name="expected_lead_time_days" defaultValue={p?.expected_lead_time_days} />
        </Field>
        <Field label="Needs formal receipt?">
          <Select name="needs_formal_receipt" options={OPT.formalReceipt} defaultValue={p?.needs_formal_receipt} />
        </Field>
      </div>
      <Field label="Payment methods used">
        <Checks name="payment_methods_used" options={OPT.paymentMethods} values={p?.payment_methods_used} />
      </Field>
      <Field label="How goods reach them">
        <Checks name="goods_receipt_method" options={OPT.goodsReceipt} values={p?.goods_receipt_method} />
      </Field>
      <Field label="Purchasing constraints">
        <Checks name="purchasing_constraints" options={OPT.constraints} values={p?.purchasing_constraints} />
      </Field>
      <Field label="Constraint details">
        <Text name="constraints_note" defaultValue={p?.constraints_note} />
      </Field>
      <BasisFields basis={p?.basis} verifiedAt={p?.verified_at} />
      <Submit>Save purchasing profile</Submit>
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
        <Field label="Action">
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
      <Field label="Purpose *">
        <Text name="purpose" required placeholder="What should happen in this follow-up?" />
      </Field>
      <Submit>Schedule follow-up</Submit>
    </form>
  );
}
