import { notFound } from "next/navigation";
import { Area, Card, DateInput, ErrorNote, Field, PageHeader, Select, Submit, Text } from "@/components/ui";
import { logSupplierConversation } from "@/lib/actions/suppliers";
import { one } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, todayISO } from "@/lib/format";
import { OPT } from "@/lib/options";

export default async function SupplierLogPage({ params, searchParams }: PageProps<"/suppliers/[id]/log">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const s = await one("select id, display_name from supplier where id = $1", [id]);
  if (!s) notFound();
  const fuId = typeof sp.follow_up === "string" && isUuid(sp.follow_up) ? sp.follow_up : null;
  const fu = fuId ? await one("select * from follow_up where id = $1 and supplier_id = $2", [fuId, id]) : undefined;
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Addis_Ababa" }).format(new Date());

  return (
    <div className="max-w-3xl">
      <PageHeader title="Record conversation" subtitle={s.display_name} back={{ href: `/suppliers/${id}`, label: "Back to supplier" }} />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      {fu && <p className="mb-4 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">Finishing follow-up: {fu.purpose}</p>}
      <form action={logSupplierConversation} className="space-y-4">
        <input type="hidden" name="supplier_id" value={id} />
        {fu && <input type="hidden" name="follow_up_id" value={fu.id} />}
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Date">
              <DateInput name="occurred_date" defaultValue={todayISO()} />
            </Field>
            <Field label="Time">
              <input className="inp" type="time" name="occurred_time" defaultValue={time} />
            </Field>
            <Field label="How did you talk? *">
              <Select name="channel" options={OPT.supplierChannel} defaultValue="whatsapp" blank={false} />
            </Field>
            <Field label="Who started it">
              <Select name="initiated_by" options={["us", "customer"]} labels={{ us: "We did", customer: "They did" }} defaultValue="us" blank={false} />
            </Field>
            <Field label="About *" className="col-span-2">
              <Select name="purpose" options={OPT.supplierPurpose} defaultValue={fu ? "price_request" : "price_request"} blank={false} />
            </Field>
            <Field label="How did it go? *" className="col-span-2">
              <Select name="outcome" options={OPT.outcome} defaultValue="information_gathered" blank={false} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Short summary *" hint="One to three sentences. Record prices on the Products & prices tab.">
              <Area name="summary" rows={2} required />
            </Field>
          </div>
        </Card>
        <Card title="What you learned" action={<span className="text-xs text-muted">Keep facts and opinions apart</span>}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Supplier said">
              <Area name="supplier_statements" rows={4} />
            </Field>
            <Field label="We saw">
              <Area name="our_observations" rows={4} />
            </Field>
            <div className="rounded-lg bg-internal p-2">
              <Field label="Our opinion (private)">
                <Area name="our_interpretation" rows={4} />
              </Field>
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="They promised to">
              <Text name="supplier_commitments" placeholder="e.g. Send price list by Friday" />
            </Field>
            <Field label="We promised to">
              <Text name="our_commitments" />
            </Field>
          </div>
        </Card>
        <Card title="Next step">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Follow up on">
              <DateInput name="next_date" defaultValue={addDays(todayISO(), 3)} />
            </Field>
            <Field label="How">
              <Select name="next_action" options={OPT.followUpAction} defaultValue="whatsapp" blank={false} />
            </Field>
            <Field label="What for">
              <Text name="next_purpose" placeholder="e.g. Get the 50-unit price" />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="No follow-up needed? Say why" hint="Clear the date above, then write the reason here.">
              <Text name="no_follow_up_reason" />
            </Field>
          </div>
        </Card>
        <Submit className="w-full sm:w-auto">Save conversation</Submit>
      </form>
    </div>
  );
}
