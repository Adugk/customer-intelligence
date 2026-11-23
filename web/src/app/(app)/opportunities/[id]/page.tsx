import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowUpQuickForm } from "@/components/forms";
import { Area, Card, Chip, DateInput, Details, ErrorNote, Field, NumberInput, PageHeader, Select, Submit, Text } from "@/components/ui";
import { updateOpportunity, updateOpportunityLine } from "@/lib/actions/opportunities";
import { one, q } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { addDays, fmtDate, fmtDateTime, fmtMoney, fmtNum, todayISO } from "@/lib/format";
import { label, OPT } from "@/lib/options";

export default async function OpportunityPage({ params, searchParams }: PageProps<"/opportunities/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const o = await one("select o.*, b.trading_name from opportunity o join business b on b.id = o.business_id where o.id = $1", [id]);
  if (!o) notFound();
  const [lines, history, contacts] = await Promise.all([
    q("select l.*, r.customer_description, r.code as req_code from opportunity_line l join product_requirement r on r.id = l.requirement_id where l.opportunity_id = $1", [id]),
    q("select * from opportunity_stage_history where opportunity_id = $1 order by changed_at desc", [id]),
    q("select * from contact where business_id = $1 order by is_primary desc", [o.business_id]),
  ]);
  const total = lines.reduce((s, l) => s + (l.expected_unit_price != null ? Number(l.quantity) * Number(l.expected_unit_price) : 0), 0);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={o.title}
        subtitle={
          <>
            {o.code} ·{" "}
            <Link href={`/customers/${o.business_id}?tab=opportunities`} className="text-brand">
              {o.trading_name}
            </Link>
          </>
        }
        back={{ href: "/pipeline", label: "Pipeline" }}
      />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip tone="brand">{label(o.stage)}</Chip>
        <Chip tone={o.commitment_level === "none" ? "neutral" : o.commitment_level === "verbal" ? "warn" : "ok"}>Commitment: {label(o.commitment_level)}</Chip>
        {total > 0 && <Chip>≈ {fmtNum(total)} ETB (estimate)</Chip>}
      </div>

      <div className="space-y-4">
        <Card title="Products">
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.id} className="py-3">
                <Link href={`/requirements/${l.requirement_id}`} className="font-medium text-brand">
                  {l.customer_description}
                </Link>
                <span className="text-xs text-muted"> {l.req_code}</span>
                <div className="text-sm text-muted">
                  {fmtNum(l.quantity)} {l.unit} × {l.expected_unit_price != null ? fmtMoney(l.expected_unit_price, l.currency) : "price not set"}
                </div>
                <form action={updateOpportunityLine} className="mt-2 grid grid-cols-3 gap-2">
                  <input type="hidden" name="opportunity_id" value={id} />
                  <input type="hidden" name="line_id" value={l.id} />
                  <NumberInput name="quantity" defaultValue={l.quantity} />
                  <NumberInput name="expected_unit_price" defaultValue={l.expected_unit_price} placeholder="Unit price" />
                  <Select name="currency" options={OPT.currency} defaultValue={l.currency} blank={false} />
                  <button className="btn-ghost col-span-3 sm:col-span-1">Update line</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Stage and commitment">
          <form action={updateOpportunity} className="space-y-3">
            <input type="hidden" name="opportunity_id" value={id} />
            <Field label="Title">
              <Text name="title" defaultValue={o.title} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Stage" hint="Reserved = verbal yes, no payment.">
                <Select name="stage" options={OPT.oppStage} defaultValue={o.stage} blank={false} />
              </Field>
              <Field label="Commitment level" hint="Confirmed needs written order, deposit or payment.">
                <Select name="commitment_level" options={OPT.commitment} defaultValue={o.commitment_level} blank={false} />
              </Field>
              <Field label="Expected purchase date">
                <DateInput name="expected_purchase_date" defaultValue={o.expected_purchase_date} />
              </Field>
              <Field label="Lost / cancelled reason">
                <Select name="lost_reason" options={OPT.lostReason} defaultValue={o.lost_reason} />
              </Field>
            </div>
            <Field label="Lost reason detail">
              <Text name="lost_reason_detail" defaultValue={o.lost_reason_detail} />
            </Field>
            <Field label="Note about this change">
              <Text name="change_note" placeholder="e.g. Customer paid 30% deposit by telebirr" />
            </Field>
            <Field label="Notes">
              <Area name="notes" defaultValue={o.notes} rows={2} />
            </Field>
            <Submit>Save</Submit>
            <p className="text-xs text-muted">Marking “Closed – won” (fully paid) records the purchase date and quantity on each product requirement.</p>
          </form>
        </Card>

        <Details summary="+ Schedule a follow-up for this opportunity">
          <FollowUpQuickForm businessId={o.business_id} contacts={contacts} opportunityId={id} returnTo={`/opportunities/${id}`} defaultDate={addDays(todayISO(), 3)} />
        </Details>

        <Card title="Stage history">
          <ul className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-muted">{fmtDateTime(h.changed_at)}</span> — {label(h.stage)}
                {h.commitment_level && <> · {label(h.commitment_level)}</>}
                {h.note && <span className="text-muted"> · {h.note}</span>}
              </li>
            ))}
          </ul>
          {o.expected_purchase_date && <p className="mt-2 text-xs text-muted">Expected purchase: {fmtDate(o.expected_purchase_date)}</p>}
        </Card>
      </div>
    </div>
  );
}
