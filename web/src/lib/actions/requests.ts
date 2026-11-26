"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { choice, date, num, str, uuid } from "../forms";
import { todayISO } from "../format";
import { OPT } from "../options";
import { requestReadyGaps, setRequestStatus } from "../orders";

const goReq: (id: string, error?: string) => never = (id: string, error?: string) => {
  revalidatePath(`/requests/${id}`);
  redirect(`/requests/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
};
const goCase: (id: string, error?: string) => never = (id: string, error?: string) => {
  revalidatePath(`/cases/${id}`);
  redirect(`/cases/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
};

function requestFields(fd: FormData) {
  return {
    description: str(fd, "description", 300),
    specification: str(fd, "specification", 2000),
    reference_link: str(fd, "reference_link", 500),
    quantity: num(fd, "quantity", { min: 0 }),
    unit: choice(fd, "unit", OPT.unit) ?? "piece",
    use_type: choice(fd, "use_type", OPT.useType) ?? "unsure",
    accept_alternatives: str(fd, "accept_alternatives", 500),
    target_price: num(fd, "target_price", { min: 0 }),
    target_currency: choice(fd, "target_currency", OPT.currency),
    needed_by: date(fd, "needed_by"),
    urgency: choice(fd, "urgency", OPT.urgency),
    delivery_place: str(fd, "delivery_place", 300),
    channel: choice(fd, "channel", OPT.interactionChannel),
    notes: str(fd, "notes"),
    product_id: uuid(fd, "product_id"),
    contact_id: uuid(fd, "contact_id"),
  };
}

export async function createRequest(fd: FormData) {
  await requireUser();
  const bid = uuid(fd, "business_id");
  if (!bid) redirect("/requests");
  const f = requestFields(fd);
  const back: (m: string) => never = (m: string) => redirect(`/requests/new?customer=${bid}&error=${encodeURIComponent(m)}`);
  if (!f.description) back("Please describe the product.");
  if (!f.quantity || f.quantity <= 0) back("Please enter how many they want.");
  if (f.needed_by && f.needed_by < todayISO()) back("The “needed by” date is already past.");
  const requirementId = uuid(fd, "requirement_id");
  let productId = f.product_id;
  if (!productId && requirementId) productId = (await one("select product_id from product_requirement where id = $1", [requirementId]))?.product_id ?? null;
  const gaps = requestReadyGaps(f);
  const status = gaps.length ? (f.use_type === "unsure" || !f.needed_by ? "needs_details" : "new") : "ready";
  const id = await tx(async (run) => {
    const r = (
      await run(
        `insert into sourcing_request (business_id, contact_id, requirement_id, product_id, description, specification, reference_link, quantity, unit,
           use_type, accept_alternatives, target_price, target_currency, needed_by, urgency, delivery_place, channel, notes, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
        [bid, f.contact_id, requirementId, productId, f.description, f.specification, f.reference_link, f.quantity, f.unit, f.use_type,
          f.accept_alternatives, f.target_price, f.target_currency, f.needed_by, f.urgency, f.delivery_place, f.channel, f.notes, status],
      )
    )[0];
    await run("insert into request_status_history (request_id, status, note) values ($1,$2,'Request recorded')", [r.id, status]);
    return r.id as string;
  });
  revalidatePath("/requests");
  redirect(`/requests/${id}`);
}

export async function updateRequest(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "request_id");
  if (!id) redirect("/requests");
  const before = await one("select * from sourcing_request where id = $1", [id]);
  if (!before) redirect("/requests");
  if (!["new", "needs_details", "ready", "finding_suppliers"].includes(before.status)) goReq(id, "This request already has a price sent or an order. Make changes on the quote or order instead.");
  const f = requestFields(fd);
  if (!f.description || !f.quantity) goReq(id, "Please keep a description and a quantity.");
  await tx(async (run) => {
    await run(
      `update sourcing_request set description=$2, specification=$3, reference_link=$4, quantity=$5, unit=$6, use_type=$7, accept_alternatives=$8,
         target_price=$9, target_currency=$10, needed_by=$11, urgency=$12, delivery_place=$13, channel=$14, notes=$15, product_id=$16, contact_id=$17, updated_at=now()
       where id=$1`,
      [id, f.description, f.specification, f.reference_link, f.quantity, f.unit, f.use_type, f.accept_alternatives, f.target_price, f.target_currency,
        f.needed_by, f.urgency, f.delivery_place, f.channel, f.notes, f.product_id ?? before.product_id, f.contact_id],
    );
    if (["new", "needs_details", "ready"].includes(before.status)) {
      const gaps = requestReadyGaps(f);
      await setRequestStatus(run, id, gaps.length ? "needs_details" : "ready", gaps.length ? `Still needed: ${gaps.join(", ")}` : "All details recorded");
    }
  });
  goReq(id);
}

export async function closeRequest(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "request_id");
  const to = choice(fd, "to", ["cancelled", "declined"]);
  const reason = str(fd, "reason", 500);
  if (!id || !to) redirect("/requests");
  if (!reason) goReq(id, "Please write the reason.");
  const r = await one("select status from sourcing_request where id = $1", [id]);
  if (r && ["confirmed", "completed"].includes(r.status)) goReq(id, "This request already has an order. Cancel the order instead.");
  await tx((run) => setRequestStatus(run, id, to, reason));
  goReq(id);
}

// ---------- sourcing cases ----------

export async function startCase(fd: FormData) {
  await requireUser();
  const rid = uuid(fd, "request_id");
  if (!rid) redirect("/requests");
  const r = await one("select * from sourcing_request where id = $1", [rid]);
  if (!r) redirect("/requests");
  if (r.sourcing_case_id) redirect(`/cases/${r.sourcing_case_id}`);
  const gaps = requestReadyGaps(r);
  if (gaps.length) goReq(rid, `First fill in: ${gaps.join(", ")}.`);
  const id = await tx(async (run) => {
    const c = (await run("insert into sourcing_case (title, product_id) values ($1,$2) returning id", [r.description, r.product_id]))[0];
    await run("update sourcing_request set sourcing_case_id = $2, updated_at = now() where id = $1", [rid, c.id]);
    await setRequestStatus(run, rid, "finding_suppliers", "Started finding suppliers");
    return c.id as string;
  });
  redirect(`/cases/${id}`);
}

/** Add another customer's compatible request to the same search (Part 9 — never mixes incompatible requests). */
export async function addRequestToCase(fd: FormData) {
  await requireUser();
  const cid = uuid(fd, "case_id");
  const rid = uuid(fd, "request_id");
  if (!cid) redirect("/requests");
  if (!rid) goCase(cid, "Please choose a request.");
  const [c, r] = await Promise.all([one("select * from sourcing_case where id = $1", [cid]), one("select * from sourcing_request where id = $1", [rid])]);
  if (!c || !r) goCase(cid, "Not found.");
  if (r.sourcing_case_id) goCase(cid, "That request is already in a sourcing case.");
  if (!["ready", "finding_suppliers", "new", "needs_details"].includes(r.status)) goCase(cid, "Only open requests can be added.");
  if (requestReadyGaps(r).length) goCase(cid, "That request is missing details (use, quantity or date). Complete it first.");
  if (c.product_id && r.product_id !== c.product_id) goCase(cid, "Only requests for the same product (linked to the same product in your list) can share a case.");
  const members = await q("select distinct business_id from sourcing_request where sourcing_case_id = $1", [cid]);
  const ids = [...new Set([...members.map((m) => m.business_id as string), r.business_id as string])];
  const excl = await q(
    `select b.trading_name from buying_condition bc join business b on b.id = bc.business_id
     where bc.condition_type = 'exclusivity' and bc.business_id = any($1::uuid[]) limit 1`,
    [ids],
  );
  if (excl.length && ids.length > 1) goCase(cid, `${excl[0].trading_name} asked for exclusivity. Handle their request in its own case.`);
  await tx(async (run) => {
    await run("update sourcing_request set sourcing_case_id = $2, updated_at = now() where id = $1", [rid, cid]);
    await setRequestStatus(run, rid, "finding_suppliers", "Added to a shared sourcing case");
  });
  goCase(cid);
}

export async function removeRequestFromCase(fd: FormData) {
  await requireUser();
  const cid = uuid(fd, "case_id");
  const rid = uuid(fd, "request_id");
  if (!cid || !rid) redirect("/requests");
  const r = await one("select status from sourcing_request where id = $1 and sourcing_case_id = $2", [rid, cid]);
  if (r && !["ready", "finding_suppliers", "needs_details", "new"].includes(r.status)) goCase(cid, "A price was already sent for that request — it can't be removed from the case.");
  await tx(async (run) => {
    await run("update sourcing_request set sourcing_case_id = null, updated_at = now() where id = $1", [rid]);
    await setRequestStatus(run, rid, "ready", "Removed from sourcing case");
  });
  goCase(cid);
}

// ---------- supplier quotes ----------

export async function addSupplierQuote(fd: FormData) {
  await requireUser();
  const cid = uuid(fd, "case_id");
  const sid = uuid(fd, "supplier_id");
  if (!cid) redirect("/requests");
  if (!sid) goCase(cid, "Please choose the supplier.");
  const currency = choice(fd, "currency", OPT.currency) ?? "AED";
  const lines: { offer: string | null; desc: string; qty: number; price: number; moq: number | null }[] = [];
  for (let i = 0; i < 3; i++) {
    const desc = str(fd, `line_desc_${i}`, 300);
    const qty = num(fd, `line_qty_${i}`, { min: 0 });
    const price = num(fd, `line_price_${i}`, { min: 0 });
    if (!desc && qty == null && price == null) continue;
    if (!desc || !qty || qty <= 0 || price == null) goCase(cid, `Line ${i + 1}: please give a description, a quantity and a price each.`);
    lines.push({ offer: uuid(fd, `line_offer_${i}`), desc, qty, price, moq: num(fd, `line_moq_${i}`, { min: 0 }) });
  }
  if (!lines.length) goCase(cid, "Please enter at least one product line with its price.");
  const validUntil = date(fd, "valid_until");
  const reference = str(fd, "reference", 120);
  await tx(async (run) => {
    const qt = (
      await run(
        `insert into supplier_quote (sourcing_case_id, supplier_id, reference, received_on, valid_until, currency, delivery_charge, tax_note, payment_terms, lead_time_days, return_terms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, code`,
        [cid, sid, reference, date(fd, "received_on") ?? todayISO(), validUntil, currency, num(fd, "delivery_charge", { min: 0 }) ?? 0,
          str(fd, "tax_note", 200), str(fd, "payment_terms", 300), num(fd, "lead_time_days", { min: 0 }), str(fd, "return_terms", 300)],
      )
    )[0];
    for (const l of lines) {
      const offer = l.offer ? (await run("select id, product_id from supplier_offer where id = $1 and supplier_id = $2", [l.offer, sid]))[0] : null;
      await run("insert into supplier_quote_line (quote_id, offer_id, product_id, description, qty, unit_price, moq) values ($1,$2,$3,$4,$5,$6,$7)", [
        qt.id, offer?.id ?? null, offer?.product_id ?? null, l.desc, l.qty, l.price, l.moq,
      ]);
      // Keep the supplier's price history complete: a quoted price is also a dated price for that quantity level.
      if (offer) {
        await run(
          "insert into supplier_price (offer_id, min_qty, unit_price, currency, valid_from, valid_until, source, source_reference) values ($1,$2,$3,$4,$5,$6,'supplier_quote',$7)",
          [offer.id, l.qty, l.price, currency, todayISO(), validUntil && validUntil >= todayISO() ? validUntil : null, reference ?? qt.code],
        );
      }
    }
  });
  goCase(cid);
}

/** The owner chooses — the app never picks the cheapest automatically — and must say why. */
export async function chooseSupplierQuote(fd: FormData) {
  await requireUser();
  const cid = uuid(fd, "case_id");
  const qid = uuid(fd, "quote_id");
  const reason = str(fd, "reason", 1000);
  if (!cid || !qid) redirect("/requests");
  if (!reason) goCase(cid, "Please write why you chose this supplier.");
  const qt = await one("select sq.*, s.verification_status from supplier_quote sq join supplier s on s.id = sq.supplier_id where sq.id = $1 and sq.sourcing_case_id = $2", [qid, cid]);
  if (!qt) goCase(cid, "Quote not found.");
  if (qt.verification_status === "rejected") goCase(cid, "This supplier was rejected in their checks and can't be chosen.");
  await tx(async (run) => {
    await run("update supplier_quote set status = 'not_chosen' where sourcing_case_id = $1 and id <> $2 and status in ('received','chosen')", [cid, qid]);
    await run("update supplier_quote set status = 'chosen', decision_reason = $2 where id = $1", [qid, reason]);
    await run("update sourcing_case set chosen_quote_id = $2, choice_reason = $3, updated_at = now() where id = $1", [cid, qid, reason]);
  });
  goCase(cid);
}

export async function expireSupplierQuote(fd: FormData) {
  await requireUser();
  const cid = uuid(fd, "case_id");
  const qid = uuid(fd, "quote_id");
  if (!cid || !qid) redirect("/requests");
  await tx(async (run) => {
    await run("update supplier_quote set status = 'expired' where id = $1 and sourcing_case_id = $2", [qid, cid]);
    await run("update sourcing_case set chosen_quote_id = null where id = $1 and chosen_quote_id = $2", [cid, qid]);
  });
  goCase(cid);
}
