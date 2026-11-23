"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { recalcStage } from "../data";
import { choice, date, num, str, uuid } from "../forms";
import { todayISO } from "../format";
import { OPT } from "../options";

// ---------- interactions (design §9.1) ----------

export async function logInteraction(fd: FormData) {
  await requireUser();
  const bid = uuid(fd, "business_id");
  if (!bid) redirect("/customers");
  const channel = choice(fd, "channel", OPT.interactionChannel);
  const purpose = choice(fd, "purpose", OPT.purpose);
  const outcome = choice(fd, "outcome", OPT.outcome);
  const summary = str(fd, "summary", 1000);
  const err = (m: string): never => redirect(`/customers/${bid}/log?error=${encodeURIComponent(m)}`);
  if (!channel || !purpose || !outcome || !summary) err("Channel, purpose, outcome and summary are required.");
  const nextDate = date(fd, "next_date");
  const noFollowReason = str(fd, "no_follow_up_reason", 300);
  if (!nextDate && !noFollowReason) err("Set a next follow-up date, or say why no follow-up is needed.");
  const occurredDate = date(fd, "occurred_date") ?? todayISO();
  if (occurredDate > todayISO()) err("The interaction date cannot be in the future.");
  const occurredTime = /^\d{2}:\d{2}$/.test(str(fd, "occurred_time") ?? "") ? str(fd, "occurred_time") : "12:00";
  const fromFollowUp = uuid(fd, "follow_up_id");

  await tx(async (run) => {
    const i = (
      await run(
        `insert into interaction (business_id, occurred_at, channel, initiated_by, purpose, summary, customer_statements, our_observations,
          our_interpretation, customer_commitments, our_commitments, outcome, opportunity_id, duration_minutes, no_follow_up_reason)
         values ($1, ($2::text || ' ' || $3::text || ':00+03')::timestamptz, $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
        [
          bid, occurredDate, occurredTime, channel, choice(fd, "initiated_by", OPT.initiatedBy), purpose, summary,
          str(fd, "customer_statements"), str(fd, "our_observations"), str(fd, "our_interpretation"),
          str(fd, "customer_commitments"), str(fd, "our_commitments"), outcome, uuid(fd, "opportunity_id"),
          num(fd, "duration_minutes", { min: 0, max: 600 }), nextDate ? null : noFollowReason,
        ],
      )
    )[0];
    const contacts = fd.getAll("contact_ids").filter((v): v is string => typeof v === "string");
    for (const c of contacts) {
      await run("insert into interaction_contact select $1, id from contact where id::text = $2 and business_id = $3 on conflict do nothing", [i.id, c, bid]);
    }
    const reqs = fd.getAll("requirement_ids").filter((v): v is string => typeof v === "string");
    for (const r of reqs) {
      await run("insert into interaction_requirement select $1, id from product_requirement where id::text = $2 and business_id = $3 on conflict do nothing", [i.id, r, bid]);
    }
    if (fromFollowUp) {
      await run("update follow_up set status='done', completed_at=now(), result_interaction_id=$2 where id=$1 and business_id=$3", [fromFollowUp, i.id, bid]);
    }
    if (nextDate) {
      const contact = contacts[0] ?? null;
      await run(
        `insert into follow_up (business_id, contact_id, requirement_id, opportunity_id, created_from_interaction_id, due_date, action_type, purpose, origin)
         values ($1, (select id from contact where id::text = $2 and business_id = $1), (select id from product_requirement where id::text = $3 and business_id = $1), $4, $5, $6, $7, $8, $9)`,
        [
          bid, contact, reqs.length === 1 ? reqs[0] : null, uuid(fd, "opportunity_id"), i.id, nextDate,
          choice(fd, "next_action", OPT.followUpAction) ?? "call",
          str(fd, "next_purpose", 300) ?? (str(fd, "our_commitments", 300) ? `Our commitment: ${str(fd, "our_commitments", 260)}` : "Follow up"),
          str(fd, "our_commitments") ? "our_commitment" : "manual",
        ],
      );
    }
    await recalcStage(bid, run);
  });
  revalidatePath(`/customers/${bid}`);
  redirect(`/customers/${bid}?tab=interactions`);
}

// ---------- follow-ups (design §9.2) ----------

export async function addFollowUp(fd: FormData) {
  await requireUser();
  const bid = uuid(fd, "business_id");
  const due = date(fd, "due_date");
  const purpose = str(fd, "purpose", 300);
  if (!bid) redirect("/follow-ups");
  if (!due || !purpose) redirect(`/customers/${bid}?tab=overview&error=Follow-up+needs+a+date+and+purpose`);
  const contactId = uuid(fd, "contact_id");
  if (contactId) {
    const c = await one("select contact_permission from contact where id = $1", [contactId]);
    if (c?.contact_permission === "asked_not_to_contact") redirect(`/customers/${bid}?error=This+contact+asked+not+to+be+contacted`);
  }
  await q(
    `insert into follow_up (business_id, contact_id, requirement_id, opportunity_id, due_date, due_time, action_type, purpose)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [bid, contactId, uuid(fd, "requirement_id"), uuid(fd, "opportunity_id"), due, str(fd, "due_time", 5), choice(fd, "action_type", OPT.followUpAction) ?? "call", purpose],
  );
  const ret = str(fd, "return_to");
  revalidatePath("/follow-ups");
  redirect(ret && ret.startsWith("/") ? ret : `/customers/${bid}`);
}

export async function updateFollowUp(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "follow_up_id");
  const op = str(fd, "op");
  const ret = str(fd, "return_to");
  if (id) {
    if (op === "cancel") await q("update follow_up set status='cancelled', completed_at=now() where id=$1", [id]);
    else if (op === "done") await q("update follow_up set status='done', completed_at=now() where id=$1", [id]);
    else if (op === "snooze") {
      const days = num(fd, "days", { min: 1, max: 90 }) ?? 3;
      await q("update follow_up set status='open', due_date = greatest(due_date, current_date) + $2::int where id=$1", [id, Math.round(days)]);
    }
  }
  revalidatePath("/follow-ups");
  revalidatePath("/");
  redirect(ret && ret.startsWith("/") ? ret : "/follow-ups");
}
