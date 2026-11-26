"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { choice, date, num, str, uuid } from "../forms";
import { todayISO } from "../format";
import { OPT } from "../options";
import { setRequestStatus } from "../orders";

const goQuote: (id: string, error?: string) => never = (id: string, error?: string) => {
  revalidatePath(`/quotes/${id}`);
  redirect(`/quotes/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
};

// ---------- exchange rates (never overwritten; a new rate is a new row) ----------

export async function addRate(fd: FormData) {
  await requireUser();
  const from = choice(fd, "from_currency", OPT.currency);
  const to = choice(fd, "to_currency", OPT.currency) ?? "ETB";
  const rate = num(fd, "rate", { min: 0 });
  const ret = str(fd, "return_to");
  const back: (m?: string) => never = (m?: string) => redirect(`${ret && ret.startsWith("/") ? ret : "/money"}${m ? `${ret?.includes("?") ? "&" : "?"}error=${encodeURIComponent(m)}` : ""}`);
  if (!from || from === to) back("Choose two different currencies.");
  if (!rate || rate <= 0) back("Please enter the rate, e.g. how many ETB for 1 AED.");
  const d = date(fd, "rate_date") ?? todayISO();
  if (d > todayISO()) back("The rate date can't be in the future.");
  await q("insert into exchange_rate (from_currency, to_currency, rate, rate_date, source, note) values ($1,$2,$3,$4,$5,$6)", [from, to, rate, d, str(fd, "source", 120), str(fd, "note", 300)]);
  revalidatePath("/money");
  back();
}

// ---------- customer quotes ----------

function quoteFields(fd: FormData) {
  return {
    currency: choice(fd, "currency", OPT.currency) ?? "ETB",
    valid_until: date(fd, "valid_until"),
    payment_terms: str(fd, "payment_terms", 500),
    delivery_estimate: str(fd, "delivery_estimate", 300),
    included: str(fd, "included", 1000),
    exclusions: str(fd, "exclusions", 1000),
    uncertain: str(fd, "uncertain", 1000),
    service_fee: num(fd, "service_fee", { min: 0 }) ?? 0,
    transport_charge: num(fd, "transport_charge", { min: 0 }) ?? 0,
    duty_charge: num(fd, "duty_charge", { min: 0 }) ?? 0,
    local_delivery_charge: num(fd, "local_delivery_charge", { min: 0 }) ?? 0,
    other_charge: num(fd, "other_charge", { min: 0 }) ?? 0,
    other_charge_label: str(fd, "other_charge_label", 120),
    cost_currency: choice(fd, "cost_currency", OPT.currency),
    cost_rate_to_quote: num(fd, "cost_rate_to_quote", { min: 0 }),
  };
}

export async function createCustomerQuote(fd: FormData) {
  await requireUser();
  const rid = uuid(fd, "request_id");
  if (!rid) redirect("/requests");
  const r = await one("select * from sourcing_request where id = $1", [rid]);
  if (!r) redirect("/requests");
  const back: (m: string) => never = (m: string) => redirect(`/quotes/new?request=${rid}&error=${encodeURIComponent(m)}`);
  if (r.use_type === "unsure") back("First record whether this is for personal use or business (on the request).");
  const f = quoteFields(fd);
  const qty = num(fd, "qty", { min: 0 });
  const price = num(fd, "unit_price", { min: 0 });
  const estCost = num(fd, "est_unit_cost", { min: 0 });
  if (!qty || qty <= 0) back("Please enter the quantity.");
  if (!price || price <= 0) back("Please enter the price per unit for the customer.");
  if (!f.valid_until) back("Please give a date until which this price is valid.");
  if (f.valid_until < todayISO()) back("The “valid until” date is already past.");
  if (estCost != null && f.cost_currency && f.cost_currency !== f.currency && !f.cost_rate_to_quote) back(`Please enter the exchange rate from ${f.cost_currency} to ${f.currency}.`);
  const id = await tx(async (run) => {
    const qt = (
      await run(
        `insert into customer_quote (business_id, sourcing_request_id, currency, valid_until, payment_terms, delivery_estimate, included, exclusions, uncertain,
           service_fee, transport_charge, duty_charge, local_delivery_charge, other_charge, other_charge_label, cost_currency, cost_rate_to_quote)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
        [r.business_id, rid, f.currency, f.valid_until, f.payment_terms, f.delivery_estimate, f.included, f.exclusions, f.uncertain, f.service_fee,
          f.transport_charge, f.duty_charge, f.local_delivery_charge, f.other_charge, f.other_charge_label, f.cost_currency,
          f.cost_currency === f.currency ? 1 : f.cost_rate_to_quote],
      )
    )[0];
    await run(
      "insert into customer_quote_line (quote_id, request_id, product_id, supplier_quote_line_id, description, qty, unit_price, est_unit_cost) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [qt.id, rid, r.product_id, uuid(fd, "supplier_quote_line_id"), str(fd, "description", 300) ?? r.description, qty, price, estCost],
    );
    return qt.id as string;
  });
  redirect(`/quotes/${id}`);
}

export async function updateCustomerQuote(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "quote_id");
  if (!id) redirect("/requests");
  const qt = await one("select status from customer_quote where id = $1", [id]);
  if (qt?.status !== "draft") goQuote(id, "Only a draft can be changed. Make a new version instead.");
  const f = quoteFields(fd);
  if (!f.valid_until || f.valid_until < todayISO()) goQuote(id, "Please give a future “valid until” date.");
  const lid = uuid(fd, "line_id");
  const qty = num(fd, "qty", { min: 0 });
  const price = num(fd, "unit_price", { min: 0 });
  if (!qty || !price) goQuote(id, "Quantity and price must be more than zero.");
  await tx(async (run) => {
    await run(
      `update customer_quote set currency=$2, valid_until=$3, payment_terms=$4, delivery_estimate=$5, included=$6, exclusions=$7, uncertain=$8, service_fee=$9,
         transport_charge=$10, duty_charge=$11, local_delivery_charge=$12, other_charge=$13, other_charge_label=$14, cost_currency=$15,
         cost_rate_to_quote=$16, updated_at=now() where id=$1`,
      [id, f.currency, f.valid_until, f.payment_terms, f.delivery_estimate, f.included, f.exclusions, f.uncertain, f.service_fee, f.transport_charge,
        f.duty_charge, f.local_delivery_charge, f.other_charge, f.other_charge_label, f.cost_currency, f.cost_currency === f.currency ? 1 : f.cost_rate_to_quote],
    );
    if (lid) {
      await run("update customer_quote_line set description = coalesce($3, description), qty=$4, unit_price=$5, est_unit_cost=$6 where id=$1 and quote_id=$2", [
        lid, id, str(fd, "description", 300), qty, price, num(fd, "est_unit_cost", { min: 0 }),
      ]);
    }
  });
  goQuote(id);
}

export async function sendQuote(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "quote_id");
  if (!id) redirect("/requests");
  const qt = await one("select * from customer_quote where id = $1", [id]);
  if (qt?.status !== "draft") goQuote(id, "This quote was already sent.");
  if (qt.valid_until && String(qt.valid_until) < todayISO()) goQuote(id, "The “valid until” date has passed. Change it first.");
  await tx(async (run) => {
    await run("update customer_quote set status = 'sent', sent_at = now(), updated_at = now() where id = $1", [id]);
    if (qt.sourcing_request_id) await setRequestStatus(run, qt.sourcing_request_id, "quote_sent", `Price ${qt.code} sent`);
  });
  goQuote(id);
}

/** A change after sending is a new version; the old one is kept and marked "replaced". */
export async function reviseQuote(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "quote_id");
  if (!id) redirect("/requests");
  const qt = await one("select * from customer_quote where id = $1", [id]);
  if (!qt || ["accepted", "replaced"].includes(qt.status)) goQuote(id, "An accepted or already-replaced quote can't be revised.");
  const newId = await tx(async (run) => {
    const n = (
      await run(
        `insert into customer_quote (business_id, sourcing_request_id, revision_of_id, revision_no, currency, valid_until, payment_terms, delivery_estimate,
           included, exclusions, uncertain, service_fee, transport_charge, duty_charge, local_delivery_charge, other_charge, other_charge_label, cost_currency, cost_rate_to_quote)
         select business_id, sourcing_request_id, id, revision_no + 1, currency, greatest(valid_until, current_date + 7), payment_terms, delivery_estimate,
           included, exclusions, uncertain, service_fee, transport_charge, duty_charge, local_delivery_charge, other_charge, other_charge_label, cost_currency, cost_rate_to_quote
         from customer_quote where id = $1 returning id`,
        [id],
      )
    )[0];
    await run(
      `insert into customer_quote_line (quote_id, request_id, product_id, supplier_quote_line_id, description, qty, unit_price, est_unit_cost)
       select $2, request_id, product_id, supplier_quote_line_id, description, qty, unit_price, est_unit_cost from customer_quote_line where quote_id = $1`,
      [id, n.id],
    );
    await run("update customer_quote set status = 'replaced', updated_at = now() where id = $1", [id]);
    return n.id as string;
  });
  redirect(`/quotes/${newId}`);
}

export async function decideQuote(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "quote_id");
  const to = choice(fd, "to", ["rejected", "expired"]);
  if (!id || !to) redirect("/requests");
  const qt = await one("select * from customer_quote where id = $1", [id]);
  if (qt?.status !== "sent") goQuote(id, "Only a sent quote can be marked rejected or expired.");
  const note = str(fd, "note", 500);
  if (to === "rejected" && !note) goQuote(id, "Please write why the customer said no — it helps you learn.");
  await q("update customer_quote set status = $2, decided_at = now(), decision_note = $3, updated_at = now() where id = $1", [id, to, note]);
  goQuote(id);
}
