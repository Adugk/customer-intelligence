"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { recordHistory } from "../data";
import { bool, choice, date, multi, num, str, uuid } from "../forms";
import { todayISO } from "../format";
import { OPT } from "../options";

const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

function sid(fd: FormData) {
  const id = uuid(fd, "supplier_id");
  if (!id) throw new Error("Missing supplier");
  return id;
}

function back(id: string, tab?: string, error?: string): never {
  revalidatePath(`/suppliers/${id}`);
  const qs = new URLSearchParams();
  if (tab) qs.set("tab", tab);
  if (error) qs.set("error", error);
  redirect(`/suppliers/${id}${qs.size ? `?${qs}` : ""}`);
}

// ---------- duplicates ----------

export async function findSupplierDuplicates(name: string, phone: string) {
  await requireUser();
  const out: { id: string; code: string; display_name: string; reason: string }[] = [];
  const d = digits(phone);
  if (d.length >= 7) {
    for (const r of await q(
      `select id, code, display_name from supplier where archived_at is null
         and (right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 9) = right($1, 9) or right(regexp_replace(coalesce(whatsapp,''), '\\D', '', 'g'), 9) = right($1, 9)) limit 5`,
      [d],
    )) out.push({ ...(r as { id: string; code: string; display_name: string }), reason: "Same phone number" });
  }
  const n = name.trim();
  if (n.length >= 3) {
    for (const r of await q("select id, code, display_name from supplier where archived_at is null and (display_name ilike $1 or legal_name ilike $1) limit 5", [`%${n.replace(/[%_]/g, "")}%`])) {
      if (!out.some((o) => o.id === r.id)) out.push({ ...(r as { id: string; code: string; display_name: string }), reason: "Similar name" });
    }
  }
  return out;
}

// ---------- create / update ----------

export async function createSupplier(_prev: { error?: string } | undefined, fd: FormData): Promise<{ error?: string }> {
  await requireUser();
  const name = str(fd, "display_name", 150);
  const type = choice(fd, "supplier_type", OPT.supplierType);
  const country = str(fd, "country", 80);
  if (!name || !type || !country) return { error: "Please enter the supplier's name, type and country." };
  const r = await one(
    `insert into supplier (display_name, supplier_type, country, city, phone, whatsapp, email, website, categories, brands, currency, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [
      name, type, country, str(fd, "city", 80), str(fd, "phone", 40), str(fd, "whatsapp", 40), str(fd, "email", 200), str(fd, "website", 300),
      multi(fd, "categories", OPT.sectors), str(fd, "brands", 500), choice(fd, "currency", OPT.currency) ?? "AED", str(fd, "notes"),
    ],
  );
  const contact = str(fd, "contact_name", 120);
  if (contact) {
    await q("insert into supplier_contact (supplier_id, name, position, phone, whatsapp, is_primary) values ($1,$2,$3,$4,$5,true)", [
      r!.id, contact, str(fd, "contact_position", 120), str(fd, "phone", 40), str(fd, "whatsapp", 40),
    ]);
  }
  await q(
    `insert into interaction (supplier_id, channel, initiated_by, purpose, summary, outcome) values ($1,$2,'us','introduction','First contact','information_gathered')`,
    [r!.id, choice(fd, "channel", OPT.supplierChannel) ?? "call"],
  );
  revalidatePath("/suppliers");
  redirect(`/suppliers/${r!.id}`);
}

export async function updateSupplier(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const name = str(fd, "display_name", 150);
  const type = choice(fd, "supplier_type", OPT.supplierType);
  const country = str(fd, "country", 80);
  if (!name || !type || !country) redirect(`/suppliers/${id}/edit?error=${encodeURIComponent("Please enter the name, type and country.")}`);
  await q(
    `update supplier set display_name=$2, legal_name=$3, supplier_type=$4, country=$5, city=$6, address=$7, website=$8, email=$9, phone=$10,
       whatsapp=$11, licence_number=$12, tax_number=$13, categories=$14, brands=$15, capabilities=$16, currency=$17, vat_note=$18,
       payment_terms=$19, deposit_terms=$20, credit_terms=$21, min_order_value=$22, typical_lead_time_days=$23, delivery_charges=$24,
       delivery_areas=$25, sample_policy=$26, return_policy=$27, warranty_terms=$28, export_capable=$29, linked_business_id=$30, notes=$31, updated_at=now()
     where id=$1`,
    [
      id, name, str(fd, "legal_name", 200), type, country, str(fd, "city", 80), str(fd, "address", 300), str(fd, "website", 300),
      str(fd, "email", 200), str(fd, "phone", 40), str(fd, "whatsapp", 40), str(fd, "licence_number", 80), str(fd, "tax_number", 80),
      multi(fd, "categories", OPT.sectors), str(fd, "brands", 500), str(fd, "capabilities", 1000), choice(fd, "currency", OPT.currency) ?? "AED",
      str(fd, "vat_note", 200), str(fd, "payment_terms", 500), str(fd, "deposit_terms", 300), str(fd, "credit_terms", 300),
      num(fd, "min_order_value", { min: 0 }), num(fd, "typical_lead_time_days", { min: 0, max: 365 }), str(fd, "delivery_charges", 300),
      str(fd, "delivery_areas", 300), str(fd, "sample_policy", 300), str(fd, "return_policy", 500), str(fd, "warranty_terms", 500),
      choice(fd, "export_capable", OPT.yesNoUnknown) ?? "unknown", uuid(fd, "linked_business_id"), str(fd, "notes"),
    ],
  );
  back(id);
}

/** Verification rules (Part 6.1): "verified" is never set from a phone call alone. */
export async function saveVerification(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const before = await one("select * from supplier where id = $1", [id]);
  if (!before) redirect("/suppliers");
  const status = choice(fd, "verification_status", OPT.verification) ?? "unverified";
  const after = {
    verification_status: status,
    licence_checked: bool(fd, "licence_checked"),
    identity_checked: bool(fd, "identity_checked"),
    address_checked: bool(fd, "address_checked"),
    authenticity_evidence: bool(fd, "authenticity_evidence"),
    bank_checked: bool(fd, "bank_checked"),
    documents_collected: str(fd, "documents_collected", 1000),
    verified_at: date(fd, "verified_at"),
    verified_by: str(fd, "verified_by", 120),
    verification_notes: str(fd, "verification_notes", 2000),
  };
  const err = (m: string): never => back(id, "check", m);
  if (status === "verified") {
    const missing: string[] = [];
    if (!after.licence_checked) missing.push("trade licence checked");
    if (!after.identity_checked) missing.push("legal identity checked");
    if (!after.verified_at) missing.push("date checked");
    if (!after.verified_by) missing.push("who checked");
    if (missing.length) err(`To mark as Verified, first fill in: ${missing.join(", ")}. A phone call alone is not enough.`);
  }
  if ((status === "conditional" || status === "rejected") && !after.verification_notes) err("Please write down the conditions or the reason.");
  if (after.verified_at && after.verified_at > todayISO()) err("The date checked can't be in the future.");
  await tx(async (run) => {
    await run(
      `update supplier set verification_status=$2, licence_checked=$3, identity_checked=$4, address_checked=$5, authenticity_evidence=$6,
         bank_checked=$7, documents_collected=$8, verified_at=$9, verified_by=$10, verification_notes=$11, updated_at=now() where id=$1`,
      [id, ...Object.values(after)],
    );
    await recordHistory(run, "supplier", id, "verification", before, after, "documented", after.verified_at);
  });
  back(id, "check");
}

export async function archiveSupplier(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  await q("update supplier set archived_at = now() where id = $1", [id]);
  revalidatePath("/suppliers");
  redirect("/suppliers");
}

// ---------- contacts ----------

export async function saveSupplierContact(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const cid = uuid(fd, "contact_id");
  const name = str(fd, "name", 120);
  if (!name) back(id, "people", "Please enter the person's name.");
  const primary = bool(fd, "is_primary");
  const vals = [
    name, str(fd, "position", 120), choice(fd, "role", OPT.supplierContactRole), str(fd, "phone", 40), str(fd, "whatsapp", 40),
    str(fd, "email", 200), choice(fd, "preferred_channel", OPT.supplierChannel), bool(fd, "is_active") || !cid, primary, str(fd, "notes"),
  ];
  await tx(async (run) => {
    if (primary) await run("update supplier_contact set is_primary = false where supplier_id = $1", [id]);
    if (cid) {
      await run(
        `update supplier_contact set name=$3, position=$4, role=$5, phone=$6, whatsapp=$7, email=$8, preferred_channel=$9, is_active=$10, is_primary=$11, notes=$12
         where id=$1 and supplier_id=$2`,
        [cid, id, ...vals],
      );
    } else {
      await run(
        `insert into supplier_contact (supplier_id, name, position, role, phone, whatsapp, email, preferred_channel, is_active, is_primary, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, ...vals],
      );
    }
  });
  back(id, "people");
}

export async function deleteSupplierContact(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const cid = uuid(fd, "contact_id");
  if (cid) await q("delete from supplier_contact where id = $1 and supplier_id = $2", [cid, id]);
  back(id, "people");
}

// ---------- product offers and prices ----------

export async function saveOffer(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const oid = uuid(fd, "offer_id");
  const name = str(fd, "offer_name", 200);
  if (!name) back(id, "products", "Please enter the product name as the supplier calls it.");
  const vals = [
    uuid(fd, "product_id"), name, str(fd, "brand", 120), str(fd, "model_sku", 120), str(fd, "variant", 200), str(fd, "specification", 1000),
    choice(fd, "unit", OPT.unit) ?? "piece", str(fd, "origin_country", 80), choice(fd, "condition", OPT.condition) ?? "new",
    choice(fd, "stock_status", OPT.offerStock) ?? "unknown", num(fd, "moq", { min: 0 }), num(fd, "available_qty", { min: 0 }),
    num(fd, "lead_time_days", { min: 0, max: 365 }), num(fd, "local_delivery_charge", { min: 0 }), str(fd, "return_terms", 500), str(fd, "warranty", 500),
    oid ? bool(fd, "is_active") : true, todayISO(),
  ];
  let offerId = oid;
  if (oid) {
    await q(
      `update supplier_offer set product_id=$3, offer_name=$4, brand=$5, model_sku=$6, variant=$7, specification=$8, unit=$9, origin_country=$10,
         condition=$11, stock_status=$12, moq=$13, available_qty=$14, lead_time_days=$15, local_delivery_charge=$16, return_terms=$17, warranty=$18,
         is_active=$19, last_checked_at=$20, updated_at=now() where id=$1 and supplier_id=$2`,
      [oid, id, ...vals],
    );
  } else {
    const r = await one(
      `insert into supplier_offer (supplier_id, product_id, offer_name, brand, model_sku, variant, specification, unit, origin_country, condition,
         stock_status, moq, available_qty, lead_time_days, local_delivery_charge, return_terms, warranty, is_active, last_checked_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning id`,
      [id, ...vals],
    );
    offerId = r!.id;
    // Optional first price straight from the "add product" form.
    const price = num(fd, "unit_price", { min: 0 });
    if (price != null) {
      await q("insert into supplier_price (offer_id, min_qty, unit_price, currency, source, valid_from) values ($1,$2,$3,$4,$5,$6)", [
        offerId, num(fd, "min_qty", { min: 0 }) || 1, price, choice(fd, "currency", OPT.currency) ?? "AED", choice(fd, "source", OPT.priceSource), todayISO(),
      ]);
    }
  }
  revalidatePath("/products");
  back(id, "products");
}

/** A new price never replaces an old one — it is added with the date it starts. */
export async function addPrice(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const oid = uuid(fd, "offer_id");
  const price = num(fd, "unit_price", { min: 0 });
  const minQty = num(fd, "min_qty", { min: 0 }) || 1;
  const from = date(fd, "valid_from") ?? todayISO();
  const until = date(fd, "valid_until");
  if (!oid) back(id, "products");
  if (price == null) back(id, "products", "Please enter the price per unit.");
  if (until && until < from) back(id, "products", "“Valid until” can't be before “valid from”.");
  const offer = await one("select id from supplier_offer where id = $1 and supplier_id = $2", [oid, id]);
  if (!offer) back(id, "products");
  await q(
    "insert into supplier_price (offer_id, min_qty, unit_price, currency, tax_note, valid_from, valid_until, source, source_reference) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [oid, minQty, price, choice(fd, "currency", OPT.currency) ?? "AED", str(fd, "tax_note", 200), from, until, choice(fd, "source", OPT.priceSource), str(fd, "source_reference", 120)],
  );
  await q("update supplier_offer set last_checked_at = $2, updated_at = now() where id = $1", [oid, todayISO()]);
  back(id, "products");
}

/** Ends a price level (e.g. the supplier no longer offers the 100-unit price). History is kept. */
export async function endPrice(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const pid = uuid(fd, "price_id");
  if (pid) {
    await q(
      `update supplier_price p set valid_until = greatest(p.valid_from, current_date - 1)
       from supplier_offer o where p.id = $1 and o.id = p.offer_id and o.supplier_id = $2 and (p.valid_until is null or p.valid_until >= current_date)`,
      [pid, id],
    );
  }
  back(id, "products");
}

// ---------- conversations and follow-ups ----------

export async function logSupplierConversation(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const err = (m: string): never => redirect(`/suppliers/${id}/log?error=${encodeURIComponent(m)}`);
  const channel = choice(fd, "channel", OPT.supplierChannel);
  const purpose = choice(fd, "purpose", OPT.supplierPurpose);
  const outcome = choice(fd, "outcome", OPT.outcome);
  const summary = str(fd, "summary", 1000);
  if (!channel || !purpose || !outcome || !summary) err("Please fill in how you talked, why, how it went, and a short summary.");
  const nextDate = date(fd, "next_date");
  const noFollow = str(fd, "no_follow_up_reason", 300);
  if (!nextDate && !noFollow) err("Please choose a date for the next follow-up, or write why none is needed.");
  const day = date(fd, "occurred_date") ?? todayISO();
  if (day > todayISO()) err("The date can't be in the future.");
  const time = /^\d{2}:\d{2}$/.test(str(fd, "occurred_time") ?? "") ? str(fd, "occurred_time") : "12:00";
  const fromFollowUp = uuid(fd, "follow_up_id");
  await tx(async (run) => {
    const i = (
      await run(
        `insert into interaction (supplier_id, occurred_at, channel, initiated_by, purpose, summary, customer_statements, our_observations,
           our_interpretation, customer_commitments, our_commitments, outcome, no_follow_up_reason)
         values ($1, ($2::text || ' ' || $3::text || ':00+03')::timestamptz, $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [
          id, day, time, channel, choice(fd, "initiated_by", OPT.initiatedBy), purpose, summary, str(fd, "supplier_statements"), str(fd, "our_observations"),
          str(fd, "our_interpretation"), str(fd, "supplier_commitments"), str(fd, "our_commitments"), outcome, nextDate ? null : noFollow,
        ],
      )
    )[0];
    if (fromFollowUp) await run("update follow_up set status='done', completed_at=now(), result_interaction_id=$2 where id=$1 and supplier_id=$3", [fromFollowUp, i.id, id]);
    if (nextDate) {
      await run(
        "insert into follow_up (supplier_id, created_from_interaction_id, due_date, action_type, purpose, origin) values ($1,$2,$3,$4,$5,$6)",
        [id, i.id, nextDate, choice(fd, "next_action", OPT.followUpAction) ?? "call", str(fd, "next_purpose", 300) ?? "Follow up with supplier", str(fd, "our_commitments") ? "our_commitment" : "manual"],
      );
    }
    await run("update supplier set updated_at = now() where id = $1", [id]);
  });
  back(id, "history");
}

export async function addSupplierFollowUp(fd: FormData) {
  await requireUser();
  const id = sid(fd);
  const due = date(fd, "due_date");
  const purpose = str(fd, "purpose", 300);
  if (!due || !purpose) back(id, undefined, "Please give the follow-up a date and say what it is for.");
  await q("insert into follow_up (supplier_id, due_date, action_type, purpose) values ($1,$2,$3,$4)", [id, due, choice(fd, "action_type", OPT.followUpAction) ?? "call", purpose]);
  revalidatePath("/follow-ups");
  back(id);
}

// ---------- link a customer's "where they buy now" to a supplier in our list ----------

export async function linkCurrentSource(fd: FormData) {
  await requireUser();
  const sourceId = uuid(fd, "source_id");
  const bid = uuid(fd, "business_id");
  if (sourceId && bid) await q("update current_source set supplier_id = $3 where id = $1 and business_id = $2", [sourceId, bid, uuid(fd, "supplier_id")]);
  revalidatePath(`/customers/${bid}`);
  redirect(`/customers/${bid}?tab=problems`);
}
