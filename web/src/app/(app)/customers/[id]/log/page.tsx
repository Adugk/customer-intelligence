import { notFound } from "next/navigation";
import { Area, Card, DateInput, ErrorNote, Field, PageHeader, Select, Submit, Text } from "@/components/ui";
import { logInteraction } from "@/lib/actions/activity";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, todayISO } from "@/lib/format";
import { OPT } from "@/lib/options";

export default async function LogInteractionPage({ params, searchParams }: PageProps<"/customers/[id]/log">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const b = await one("select id, trading_name from business where id = $1", [id]);
  if (!b) notFound();
  const followUpId = typeof sp.follow_up === "string" && isUuid(sp.follow_up) ? sp.follow_up : null;
  const [contacts, reqs, opps, fu] = await Promise.all([
    q("select id, name, contact_permission from contact where business_id = $1 order by is_primary desc, created_at", [id]),
    q("select id, customer_description from product_requirement where business_id = $1 and archived_at is null order by created_at", [id]),
    q("select id, title from opportunity where business_id = $1 and stage not in ('closed_won','closed_lost','cancelled')", [id]),
    followUpId ? one("select * from follow_up where id = $1 and business_id = $2", [followUpId, id]) : Promise.resolve(undefined),
  ]);
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Addis_Ababa" }).format(now);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Log interaction" subtitle={b.trading_name} back={{ href: `/customers/${id}`, label: "Back to profile" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      {fu && (
        <p className="mb-4 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
          Completing follow-up: {fu.purpose}
        </p>
      )}
      <form action={logInteraction} className="space-y-4">
        <input type="hidden" name="business_id" value={id} />
        {fu && <input type="hidden" name="follow_up_id" value={fu.id} />}
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Date">
              <DateInput name="occurred_date" defaultValue={todayISO()} />
            </Field>
            <Field label="Time">
              <input className="inp" type="time" name="occurred_time" defaultValue={time} />
            </Field>
            <Field label="Channel *">
              <Select name="channel" options={OPT.interactionChannel} defaultValue={fu?.action_type && (OPT.interactionChannel as readonly string[]).includes(fu.action_type) ? fu.action_type : "visit"} blank={false} />
            </Field>
            <Field label="Started by">
              <Select name="initiated_by" options={OPT.initiatedBy} defaultValue="us" blank={false} />
            </Field>
            <Field label="Purpose *" className="col-span-2">
              <Select name="purpose" options={OPT.purpose} defaultValue={fu ? "follow_up" : "discovery"} blank={false} />
            </Field>
            <Field label="Outcome *" className="col-span-2">
              <Select name="outcome" options={OPT.outcome} defaultValue="information_gathered" blank={false} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Summary *" hint="One to three sentences.">
              <Area name="summary" rows={2} required />
            </Field>
          </div>
        </Card>

        <Card title="What was learned — kept separate on purpose">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="✔ Customer said" hint="Their words. Counts as confirmed.">
              <Area name="customer_statements" rows={5} />
            </Field>
            <Field label="👁 We observed" hint="What we saw ourselves.">
              <Area name="our_observations" rows={5} />
            </Field>
            <div className="rounded-lg bg-internal p-2">
              <Field label="Internal — our interpretation" hint="Assumptions and opinions. Never shown to customers.">
                <Area name="our_interpretation" rows={5} />
              </Field>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Customer committed to">
              <Text name="customer_commitments" placeholder="e.g. Send photo of current charger" />
            </Field>
            <Field label="We committed to" hint="Creates a follow-up if a date is set below.">
              <Text name="our_commitments" placeholder="e.g. Send price for 50 units" />
            </Field>
          </div>
        </Card>

        {(contacts.length > 0 || reqs.length > 0 || opps.length > 0) && (
          <Card title="Who and what">
            {contacts.length > 0 && (
              <fieldset className="mb-3">
                <legend className="lbl">People involved</legend>
                <div className="flex flex-wrap gap-2">
                  {contacts.map((c, i) => (
                    <label key={c.id} className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand">
                      <input type="checkbox" name="contact_ids" value={c.id} defaultChecked={i === 0 || c.id === fu?.contact_id} className="sr-only" />
                      {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {reqs.length > 0 && (
              <fieldset className="mb-3">
                <legend className="lbl">Products discussed</legend>
                <div className="flex flex-wrap gap-2">
                  {reqs.map((r) => (
                    <label key={r.id} className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand">
                      <input type="checkbox" name="requirement_ids" value={r.id} defaultChecked={r.id === fu?.requirement_id} className="sr-only" />
                      {r.customer_description}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {opps.length > 0 && (
              <Field label="Opportunity">
                <select className="inp" name="opportunity_id" defaultValue={fu?.opportunity_id ?? ""}>
                  <option value="">—</option>
                  {opps.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Card>
        )}

        <Card title="Next step *">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Next follow-up date">
              <DateInput name="next_date" defaultValue={addDays(todayISO(), 7)} />
            </Field>
            <Field label="Action">
              <Select name="next_action" options={OPT.followUpAction} defaultValue="call" blank={false} />
            </Field>
            <Field label="Purpose">
              <Text name="next_purpose" placeholder="What should happen next?" />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="…or why no follow-up is needed" hint="Clear the date above and fill this in instead.">
              <Text name="no_follow_up_reason" placeholder="e.g. Not a fit — no recurring demand" />
            </Field>
          </div>
        </Card>

        <Submit className="w-full sm:w-auto">Save interaction</Submit>
      </form>
    </div>
  );
}
