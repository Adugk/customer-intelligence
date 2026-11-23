"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { recalcStage } from "../data";
import { choice, date, num, str, uuid } from "../forms";
import { OPT } from "../options";
import { nextPurchase } from "../scoring";

const CLOSED = ["closed_won", "closed_lost", "cancelled"];
// Commitment levels allowed at each stage (design §2.4-B: reserved ≠ confirmed).
const NEEDS_FINANCIAL_OR_WRITTEN = ["confirmed", "in_fulfilment", "delivered", "closed_won"];

export async function createOpportunity(fd: FormData) {
  await requireUser();
  const rid = uuid(fd, "requirement_id");
  if (!rid) redirect("/pipeline");
  const r = await one("select * from product_requirement where id = $1", [rid]);
  if (!r) redirect("/pipeline");
  if (r.demand_status !== "qualified") redirect(`/requirements/${rid}?error=Only+qualified+requirements+can+become+opportunities`);
  const qty = num(fd, "quantity", { min: 0 }) ?? r.next_purchase_qty ?? r.qty_per_order;
  if (!qty) redirect(`/requirements/${rid}?error=Enter+a+quantity+for+the+opportunity`);
  const id = await tx(async (run) => {
    const o = (
      await run(
        `insert into opportunity (business_id, title, expected_purchase_date, repeat_of_opportunity_id) values ($1,$2,$3,$4) returning id`,
        [r.business_id, str(fd, "title", 200) ?? r.customer_description, date(fd, "expected_purchase_date") ?? nextPurchase(r).date, uuid(fd, "repeat_of_opportunity_id")],
      )
    )[0];
    await run(
      "insert into opportunity_line (opportunity_id, requirement_id, quantity, unit, expected_unit_price, currency) values ($1,$2,$3,$4,$5,$6)",
      [o.id, rid, qty, r.unit ?? "piece", num(fd, "expected_unit_price", { min: 0 }), choice(fd, "currency", OPT.currency) ?? "ETB"],
    );
    await run("insert into opportunity_stage_history (opportunity_id, stage, commitment_level, note) values ($1,'identified','none','Created from requirement')", [o.id]);
    await recalcStage(r.business_id, run);
    return o.id as string;
  });
  redirect(`/opportunities/${id}`);
}

export async function updateOpportunity(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "opportunity_id");
  if (!id) redirect("/pipeline");
  const o = await one("select * from opportunity where id = $1", [id]);
  if (!o) redirect("/pipeline");
  const stage = choice(fd, "stage", OPT.oppStage) ?? o.stage;
  const commitment = choice(fd, "commitment_level", OPT.commitment) ?? o.commitment_level;
  const err = (m: string): never => redirect(`/opportunities/${id}?error=${encodeURIComponent(m)}`);
  if (NEEDS_FINANCIAL_OR_WRITTEN.includes(stage) && !["written", "deposit_paid", "fully_paid"].includes(commitment)) {
    err("A confirmed order needs a written order, a deposit or full payment. Use 'Reserved' for verbal commitments.");
  }
  if (stage === "closed_won" && commitment !== "fully_paid") err("Closed – won requires full payment.");
  const lost = choice(fd, "lost_reason", OPT.lostReason);
  if ((stage === "closed_lost" || stage === "cancelled") && !lost) err("Choose a reason when an opportunity is lost or cancelled.");
  await tx(async (run) => {
    await run(
      `update opportunity set title=$2, stage=$3, commitment_level=$4, expected_purchase_date=$5, lost_reason=$6, lost_reason_detail=$7, notes=$8, updated_at=now() where id=$1`,
      [id, str(fd, "title", 200) ?? o.title, stage, commitment, date(fd, "expected_purchase_date"), CLOSED.includes(stage) && stage !== "closed_won" ? lost : null, str(fd, "lost_reason_detail"), str(fd, "notes")],
    );
    if (stage !== o.stage || commitment !== o.commitment_level) {
      await run("insert into opportunity_stage_history (opportunity_id, stage, commitment_level, note) values ($1,$2,$3,$4)", [id, stage, commitment, str(fd, "change_note", 300)]);
    }
    // Delivered and paid → record the purchase on each requirement (design §12).
    if (stage === "closed_won" && o.stage !== "closed_won") {
      const lines = await run("select * from opportunity_line where opportunity_id = $1", [id]);
      for (const l of lines) {
        await run(
          `update product_requirement set last_purchase_date = current_date, last_purchase_qty = $2, pattern_basis = coalesce(pattern_basis, 'documented'),
             next_purchase_date = null, updated_at = now() where id = $1`,
          [l.requirement_id, l.quantity],
        );
      }
    }
    await recalcStage(o.business_id, run);
  });
  revalidatePath("/pipeline");
  redirect(`/opportunities/${id}`);
}

export async function updateOpportunityLine(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "opportunity_id");
  const lid = uuid(fd, "line_id");
  if (id && lid) {
    await q("update opportunity_line set quantity = coalesce($3, quantity), expected_unit_price = $4, currency = $5 where id = $1 and opportunity_id = $2", [
      lid, id, num(fd, "quantity", { min: 0 }), num(fd, "expected_unit_price", { min: 0 }), choice(fd, "currency", OPT.currency) ?? "ETB",
    ]);
  }
  redirect(`/opportunities/${id}`);
}
