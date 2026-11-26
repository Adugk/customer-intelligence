"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { loadBusinessScoreData, recalcStage, recordHistory, syncPurchaseReminder } from "../data";
import { choice, date, multi, num, str, uuid } from "../forms";
import { todayISO } from "../format";
import { BASIS, OPT } from "../options";
import { qualificationGaps } from "../scoring";

function done(id: string, msg?: string): never {
  revalidatePath(`/requirements/${id}`);
  redirect(`/requirements/${id}${msg ? `?error=${encodeURIComponent(msg)}` : ""}`);
}

export async function addRequirement(fd: FormData) {
  await requireUser();
  const bid = uuid(fd, "business_id");
  const desc = str(fd, "customer_description", 300);
  if (!bid || !desc) redirect(bid ? `/customers/${bid}?tab=products` : "/customers");
  const r = await one(
    `insert into product_requirement (business_id, customer_description, category_id, demand_status, purchase_pattern)
     values ($1,$2,$3,$4,$5) returning id`,
    [bid, desc, uuid(fd, "category_id"), choice(fd, "demand_status", ["mentioned", "interested"]) ?? "mentioned", choice(fd, "purchase_pattern", OPT.purchasePattern)],
  );
  await recalcStage(bid);
  redirect(`/requirements/${r!.id}`);
}

type Group = "identity" | "pattern" | "price" | "stock" | "next";

const GROUP_PREFIX: Record<Exclude<Group, "identity">, string> = {
  pattern: "pattern",
  price: "price",
  stock: "stock",
  next: "next",
};

export async function saveRequirementGroup(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "requirement_id");
  const group = str(fd, "group") as Group | null;
  if (!id || !group) redirect("/customers");
  const before = await one("select * from product_requirement where id = $1", [id]);
  if (!before) redirect("/customers");

  let after: Record<string, unknown> = {};
  if (group === "identity") {
    const desc = str(fd, "customer_description", 300);
    if (!desc) done(id, "Please describe the product.");
    after = {
      customer_description: desc,
      category_id: uuid(fd, "category_id"),
      product_id: uuid(fd, "product_id"),
      brand_requirement: choice(fd, "brand_requirement", OPT.brandRequirement),
      accepted_alternatives: str(fd, "accepted_alternatives"),
      specification_notes: str(fd, "specification_notes"),
      condition_required: choice(fd, "condition_required", OPT.condition),
      authenticity_required: choice(fd, "authenticity_required", OPT.authenticity),
      reference_links: str(fd, "reference_links"),
    };
  } else if (group === "pattern") {
    after = {
      purchase_pattern: choice(fd, "purchase_pattern", OPT.purchasePattern),
      qty_per_order: num(fd, "qty_per_order", { min: 0 }),
      unit: choice(fd, "unit", OPT.unit) ?? "piece",
      order_interval_value: num(fd, "order_interval_value", { min: 0 }),
      order_interval_unit: choice(fd, "order_interval_unit", OPT.intervalUnit),
      monthly_demand: num(fd, "monthly_demand", { min: 0 }),
      last_purchase_date: date(fd, "last_purchase_date"),
      last_purchase_qty: num(fd, "last_purchase_qty", { min: 0 }),
      smallest_practical_order: num(fd, "smallest_practical_order", { min: 0 }),
      largest_possible_order: num(fd, "largest_possible_order", { min: 0 }),
      seasonality_months: multi(fd, "seasonality_months", OPT.months),
      seasonality_note: str(fd, "seasonality_note"),
    };
    const lp = after.last_purchase_date as string | null;
    if (lp && lp > todayISO()) done(id, "The last purchase date can't be in the future.");
    const s = after.smallest_practical_order as number | null;
    const l = after.largest_possible_order as number | null;
    if (s != null && l != null && l < s) done(id, "The biggest order can't be smaller than the smallest order.");
  } else if (group === "price") {
    after = {
      current_unit_price: num(fd, "current_unit_price", { min: 0 }),
      price_currency: choice(fd, "price_currency", OPT.currency) ?? "ETB",
      price_per_unit: choice(fd, "price_per_unit", OPT.unit),
      price_includes_vat: choice(fd, "price_includes_vat", OPT.yesNoUnknown),
      price_includes_delivery: choice(fd, "price_includes_delivery", OPT.yesNoUnknown),
      target_price: num(fd, "target_price", { min: 0 }),
      max_acceptable_price: num(fd, "max_acceptable_price", { min: 0 }),
    };
    const t = after.target_price as number | null;
    const m = after.max_acceptable_price as number | null;
    if (t != null && m != null && m < t) done(id, "The highest price they'd pay can't be lower than the price they want.");
  } else if (group === "stock") {
    after = {
      current_stock_status: choice(fd, "current_stock_status", OPT.stockStatus),
      stockout_frequency: choice(fd, "stockout_frequency", OPT.stockoutFrequency),
      typical_stockout_duration: choice(fd, "typical_stockout_duration", OPT.stockoutDuration),
      stockout_consequences: multi(fd, "stockout_consequences", OPT.stockoutConsequences),
      current_lead_time_days: num(fd, "current_lead_time_days", { min: 0, max: 365 }),
    };
  } else if (group === "next") {
    after = {
      next_purchase_date: date(fd, "next_purchase_date"),
      next_purchase_date_precision: choice(fd, "next_purchase_date_precision", OPT.datePrecision),
      next_purchase_qty: num(fd, "next_purchase_qty", { min: 0 }),
      customer_urgency: choice(fd, "customer_urgency", OPT.urgency),
    };
  } else {
    done(id);
  }

  const basis = group === "identity" ? null : choice(fd, "basis", BASIS);
  const verified = group === "identity" ? null : (date(fd, "verified_at") ?? todayISO());
  const cols = Object.keys(after);
  const vals = Object.values(after);
  const extra: string[] = [];
  if (group !== "identity") {
    const p = GROUP_PREFIX[group];
    extra.push(`${p}_basis = $${cols.length + 2}`, `${p}_verified_at = $${cols.length + 3}`);
    vals.push(basis, verified);
  }
  await tx(async (run) => {
    await run(
      `update product_requirement set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}${extra.length ? ", " + extra.join(", ") : ""}, updated_at = now() where id = $1`,
      [id, ...vals],
    );
    await recordHistory(run, "product_requirement", id, group, before, after, basis, verified);
    await syncPurchaseReminder(id, run);
  });
  done(id);
}

export async function saveRequirementStatus(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "requirement_id");
  if (!id) redirect("/customers");
  const r = await one("select * from product_requirement where id = $1", [id]);
  if (!r) redirect("/customers");
  const status = choice(fd, "demand_status", OPT.demandStatus) ?? r.demand_status;
  const willingness = choice(fd, "willingness_to_test", OPT.willingness) ?? "not_asked";
  const wBasis = willingness === "not_asked" ? null : choice(fd, "basis", BASIS);
  const npReason = choice(fd, "not_pursuing_reason", OPT.notPursuingReason);
  if (status === "not_pursuing" && !npReason) done(id, "Please choose why you're not following up.");

  // Rule checks (design §2.4-A): status can only advance when the evidence exists.
  if (status === "specified" || status === "qualified") {
    const ctxFor = await loadBusinessScoreData(r.business_id);
    const gaps = qualificationGaps({ ...r, willingness_to_test: willingness, willingness_basis: wBasis }, ctxFor(r));
    const missing = status === "specified" ? gaps.specified : gaps.qualified;
    if (missing.length) done(id, `Not yet — first fill in: ${missing.join(", ")}.`);
  }

  await tx(async (run) => {
    await run(
      `update product_requirement set demand_status=$2, willingness_to_test=$3, willingness_basis=$4, willingness_verified_at=$5,
        switching_trigger=$6, not_pursuing_reason=$7, not_pursuing_note=$8, updated_at=now() where id=$1`,
      [id, status, willingness, wBasis, wBasis ? (date(fd, "verified_at") ?? todayISO()) : null, str(fd, "switching_trigger"),
        status === "not_pursuing" ? npReason : null, status === "not_pursuing" ? str(fd, "not_pursuing_note") : null],
    );
    await recordHistory(run, "product_requirement", id, "status", r, { demand_status: status, willingness_to_test: willingness }, wBasis, null);
    await syncPurchaseReminder(id, run);
    await recalcStage(r.business_id, run);
  });
  done(id);
}

export async function archiveRequirement(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "requirement_id");
  if (!id) redirect("/customers");
  const r = await one("update product_requirement set archived_at = now() where id = $1 returning business_id", [id]);
  await q("delete from follow_up where requirement_id = $1 and status = 'open'", [id]);
  if (r) await recalcStage(r.business_id);
  redirect(`/customers/${r?.business_id}?tab=products`);
}

export async function saveVariant(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "requirement_id");
  const lbl = str(fd, "variant_label", 120);
  if (id && lbl) {
    await q(
      "insert into requirement_variant (requirement_id, variant_label, size, colour, other_attribute, share_pct) values ($1,$2,$3,$4,$5,$6)",
      [id, lbl, str(fd, "size", 60), str(fd, "colour", 60), str(fd, "other_attribute", 120), num(fd, "share_pct", { min: 0, max: 100 })],
    );
  }
  done(id!);
}

export async function deleteVariant(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "requirement_id");
  const vid = uuid(fd, "variant_id");
  if (id && vid) await q("delete from requirement_variant where id = $1 and requirement_id = $2", [vid, id]);
  done(id!);
}

/** Create a catalog product from a requirement and link it (design §7.3). */
export async function createProductFromRequirement(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "requirement_id");
  const name = str(fd, "name", 200);
  if (!id || !name) done(id!, "Please enter a product name.");
  await tx(async (run) => {
    const p = (
      await run(
        `insert into product (category_id, name, brand, model_sku, barcode_gtin, key_specifications, standard_unit)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [uuid(fd, "category_id"), name, str(fd, "brand", 120), str(fd, "model_sku", 120), str(fd, "barcode_gtin", 14), str(fd, "key_specifications"), choice(fd, "standard_unit", OPT.unit) ?? "piece"],
      )
    )[0];
    await run("update product_requirement set product_id = $2, category_id = coalesce($3, category_id), updated_at = now() where id = $1", [id, p.id, uuid(fd, "category_id")]);
  });
  done(id);
}
