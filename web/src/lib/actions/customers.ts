"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { recalcStage, recordHistory } from "../data";
import { bool, choice, date, isUuid, multi, num, str, uuid } from "../forms";
import { normalizePhone, todayISO } from "../format";
import { BASIS, OPT } from "../options";

function cid(fd: FormData) {
  const id = uuid(fd, "business_id");
  if (!id) throw new Error("Missing business");
  return id;
}

function back(businessId: string, tab?: string): never {
  revalidatePath(`/customers/${businessId}`);
  redirect(`/customers/${businessId}${tab ? `?tab=${tab}` : ""}`);
}

// ---------- duplicate detection (design §6.4) ----------

export async function findDuplicates(name: string, phone: string) {
  await requireUser();
  const out: { id: string; code: string; trading_name: string; reason: string }[] = [];
  const p = normalizePhone(phone);
  if (p) {
    const rows = await q(
      `select distinct b.id, b.code, b.trading_name from contact c join business b on b.id = c.business_id
       where (c.phone_primary = $1 or c.phone_secondary = $1) and b.archived_at is null limit 5`,
      [p],
    );
    rows.forEach((r) => out.push({ id: r.id, code: r.code, trading_name: r.trading_name, reason: "Same phone number" }));
  }
  const n = name.trim();
  if (n.length >= 3) {
    const rows = await q(
      `select id, code, trading_name from business
       where archived_at is null and (trading_name ilike $1 or alternate_names ilike $1) limit 5`,
      [`%${n.replace(/[%_]/g, "")}%`],
    );
    rows.forEach((r) => {
      if (!out.some((o) => o.id === r.id)) out.push({ id: r.id, code: r.code, trading_name: r.trading_name, reason: "Similar name" });
    });
  }
  return out;
}

// ---------- quick capture (Stage 1) ----------

export async function quickCapture(_prev: { error?: string } | undefined, fd: FormData): Promise<{ error?: string }> {
  await requireUser();
  const name = str(fd, "trading_name", 120);
  const kind = choice(fd, "customer_kind", OPT.customerKind) ?? "business";
  const individual = kind === "individual";
  const type = individual ? "individual" : choice(fd, "business_type", OPT.businessType);
  if (!name || !type) return { error: individual ? "Please enter the person's name." : "Please enter the business name and choose a type." };
  const rawPhone = str(fd, "phone", 40);
  const phone = normalizePhone(rawPhone);
  const area = str(fd, "area", 120);
  const lat = num(fd, "gps_lat");
  const lng = num(fd, "gps_lng");
  if (!rawPhone && !area && lat == null) return { error: "Please add a phone number or a location, so you can find this customer again." };

  const today = todayISO();
  const permission = choice(fd, "contact_permission", OPT.contactPermission) ?? "not_asked";
  const followDate = date(fd, "follow_up_date");
  const products = (str(fd, "products", 2000) ?? "")
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const interested = bool(fd, "interested");
  const categoryId = uuid(fd, "category_id");

  const id = await tx(async (run) => {
    const b = (
      await run(
        `insert into business (trading_name, alternate_names, business_type, sectors, acquisition_source,
           rel_categories, rel_recurring, rel_imported, rel_stock, customer_kind)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [
          name,
          str(fd, "alternate_names", 300),
          type,
          multi(fd, "sectors", OPT.sectors),
          choice(fd, "acquisition_source", OPT.acquisitionSource),
          fd.get("rel_categories") ? true : null,
          fd.get("rel_recurring") ? true : null,
          fd.get("rel_imported") ? true : null,
          fd.get("rel_stock") ? true : null,
          kind,
        ],
      )
    )[0];
    await run(
      `insert into branch (business_id, is_main, sub_city, area, directions, gps_lat, gps_lng)
       values ($1, true, $2, $3, $4, $5, $6)`,
      [b.id, choice(fd, "sub_city", OPT.subCity), area, str(fd, "directions", 500), lat, lng],
    );
    let contactId: string | null = null;
    // An individual is their own contact and decides for themselves.
    const contactName = individual ? name : str(fd, "contact_name", 120);
    if (contactName || rawPhone) {
      const role = individual ? "owner" : choice(fd, "decision_role", OPT.decisionRoles);
      const authority = role === "owner" || role === "purchasing_decision_maker" ? "final" : role === "staff_user" ? "none" : "unknown";
      const c = (
        await run(
          `insert into contact (business_id, name, job_title, decision_roles, purchasing_authority, authority_basis, authority_verified_at,
             is_primary, phone_primary, whatsapp, telegram, contact_permission, permission_recorded_at, notes)
           values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11,$12,$13) returning id`,
          [
            b.id,
            contactName ?? "Unknown name",
            str(fd, "job_title", 120),
            JSON.stringify(role && role !== "unknown" && !individual ? [role] : []),
            individual ? "final" : authority,
            role && role !== "unknown" ? "confirmed" : null,
            role && role !== "unknown" ? today : null,
            phone,
            bool(fd, "whatsapp_same") && phone ? phone : null,
            str(fd, "telegram", 80),
            permission,
            permission !== "not_asked" ? today : null,
            rawPhone && !phone ? `Unverified phone as given: ${rawPhone}` : null,
          ],
        )
      )[0];
      contactId = c.id;
    }
    const reqIds: string[] = [];
    for (const p of products) {
      const r = (
        await run(
          "insert into product_requirement (business_id, customer_description, category_id, demand_status) values ($1,$2,$3,$4) returning id",
          [b.id, p, categoryId, interested ? "interested" : "mentioned"],
        )
      )[0];
      reqIds.push(r.id);
    }
    const note = str(fd, "note", 2000);
    const interaction = (
      await run(
        `insert into interaction (business_id, channel, initiated_by, purpose, summary, customer_statements, outcome)
         values ($1,$2,'us','introduction',$3,$4,'information_gathered') returning id`,
        [b.id, choice(fd, "channel", OPT.interactionChannel) ?? "visit", "First contact", note],
      )
    )[0];
    if (contactId) await run("insert into interaction_contact values ($1,$2)", [interaction.id, contactId]);
    for (const r of reqIds) await run("insert into interaction_requirement values ($1,$2)", [interaction.id, r]);
    if (followDate && permission !== "asked_not_to_contact") {
      await run(
        `insert into follow_up (business_id, contact_id, created_from_interaction_id, due_date, action_type, purpose)
         values ($1,$2,$3,$4,$5,$6)`,
        [b.id, contactId, interaction.id, followDate, choice(fd, "follow_up_action", OPT.followUpAction) ?? "call", str(fd, "follow_up_purpose", 300) ?? "Follow up after first contact"],
      );
    }
    await recalcStage(b.id, run);
    return b.id as string;
  });
  revalidatePath("/customers");
  redirect(`/customers/${id}`);
}

// ---------- business profile ----------

export async function updateBusiness(fd: FormData) {
  await requireUser();
  const id = cid(fd);
  const name = str(fd, "trading_name", 120);
  const kind = choice(fd, "customer_kind", OPT.customerKind) ?? "business";
  const before = await one("select * from business where id = $1", [id]);
  if (!before) redirect("/customers");
  // Switching back from "person" to "business": reuse the old business type if there was one.
  const priorType = (OPT.businessType as readonly string[]).includes(before.business_type) ? before.business_type : "other";
  const type = kind === "individual" ? "individual" : (choice(fd, "business_type", OPT.businessType) ?? priorType);
  if (!name) redirect(`/customers/${id}/edit?error=Please+enter+a+name.`);
  // For a person, business-only fields are hidden on the form — keep whatever was stored before.
  const keep = kind === "individual";
  const pick = <T,>(field: string, fromForm: T) => (keep ? (Array.isArray(before[field]) ? JSON.stringify(before[field]) : before[field]) : fromForm);
  const sourcingBasis = choice(fd, "basis", BASIS);
  const sourcingStatus = choice(fd, "sourcing_status", OPT.sourcingStatus) ?? "unknown";
  await tx(async (run) => {
    await run(
      `update business set trading_name=$2, alternate_names=$3, legal_name=$4, business_type=$5, sectors=$6,
        product_range_summary=$7, customer_segment=$8, price_positioning=$9, sales_channels=$10, staff_size_band=$11,
        years_operating_band=$12, acquisition_source=$13, sourcing_status=$14, sourcing_status_basis=$15,
        sourcing_status_verified_at=$16, confidentiality_level=$17, notes=$18, tin=$19,
        rel_categories=$20, rel_recurring=$21, rel_imported=$22, rel_stock=$23,
        stage_override=$24, stage_override_reason=$25, not_a_fit_reason=$26, referred_by_business_id=$27, customer_kind=$28, updated_at=now()
       where id=$1`,
      [
        id, name, str(fd, "alternate_names", 300), pick("legal_name", str(fd, "legal_name", 200)), type, pick("sectors", multi(fd, "sectors", OPT.sectors)),
        pick("product_range_summary", str(fd, "product_range_summary", 500)), pick("customer_segment", multi(fd, "customer_segment", OPT.customerSegment)),
        pick("price_positioning", choice(fd, "price_positioning", OPT.pricePositioning)), pick("sales_channels", multi(fd, "sales_channels", OPT.salesChannels)),
        pick("staff_size_band", choice(fd, "staff_size_band", OPT.staffSize)), pick("years_operating_band", choice(fd, "years_operating_band", OPT.yearsOperating)),
        choice(fd, "acquisition_source", OPT.acquisitionSource), sourcingStatus,
        sourcingStatus === "unknown" ? null : sourcingBasis, sourcingStatus === "unknown" ? null : (date(fd, "verified_at") ?? todayISO()),
        choice(fd, "confidentiality_level", OPT.confidentiality) ?? "standard", str(fd, "notes"), pick("tin", str(fd, "tin", 20)),
        pick("rel_categories", bool(fd, "rel_categories")), pick("rel_recurring", bool(fd, "rel_recurring")), pick("rel_imported", bool(fd, "rel_imported")), pick("rel_stock", bool(fd, "rel_stock")),
        choice(fd, "stage_override", OPT.stageOverride), str(fd, "stage_override_reason", 300),
        choice(fd, "not_a_fit_reason", OPT.notAFitReason), uuid(fd, "referred_by_business_id"), kind,
      ],
    );
    if (before.sourcing_status !== sourcingStatus) {
      await recordHistory(run, "business", id, "sourcing_status", before, { sourcing_status: sourcingStatus }, sourcingBasis, date(fd, "verified_at"));
    }
    if (before.stage_override && !fd.get("stage_override")) {
      await run("update business set stage_override = null where id = $1", [id]);
    }
    await recalcStage(id, run);
  });
  back(id);
}

/**
 * Merge a duplicate customer (source) into the one to keep (target).
 * Every linked record moves to the target in one transaction; the duplicate is hidden, never deleted.
 */
export async function mergeBusiness(fd: FormData) {
  await requireUser();
  const source = cid(fd);
  const target = uuid(fd, "target_business_id");
  const back2 = (m: string): never => redirect(`/customers/${source}/edit?error=${encodeURIComponent(m)}`);
  if (!target) back2("Please choose the customer to keep.");
  if (target === source) back2("Please choose a different customer.");
  if (!bool(fd, "confirm_merge")) back2("Please tick the box to confirm the merge.");
  const [s, t] = await Promise.all([one("select * from business where id = $1", [source]), one("select * from business where id = $1 and archived_at is null", [target])]);
  if (!s || !t || !target) back2("That customer could not be found.");
  const src = s as NonNullable<typeof s>;
  const tgt = t as NonNullable<typeof t>;
  const keepId = target as string;

  await tx(async (run) => {
    await run("update branch set business_id = $2, is_main = false where business_id = $1", [source, target]);
    await run("update contact set business_id = $2, is_primary = false where business_id = $1", [source, target]);
    for (const table of ["product_requirement", "current_source", "sourcing_problem", "buying_condition", "interaction", "follow_up", "opportunity"]) {
      await run(`update ${table} set business_id = $2 where business_id = $1`, [source, target]);
    }
    await run("insert into business_tag (business_id, tag_id) select $2, tag_id from business_tag where business_id = $1 on conflict do nothing", [source, target]);
    await run("delete from business_tag where business_id = $1", [source]);
    await run("update business set referred_by_business_id = $2 where referred_by_business_id = $1 and id <> $2", [source, target]);
    await run("update value_history set entity_id = $2 where entity_type = 'business' and entity_id = $1", [source, target]);
    // How-they-buy profile: move it if the kept customer has none; otherwise keep a copy in the history.
    const sp = (await run("select * from purchasing_profile where business_id = $1", [source]))[0];
    if (sp) {
      const tp = (await run("select 1 from purchasing_profile where business_id = $1", [target]))[0];
      if (tp) {
        await run(
          "insert into value_history (entity_type, entity_id, field_group, old_values, new_values, basis) values ('business', $1, 'merged_how_they_buy', $2, '{}', 'documented')",
          [target, JSON.stringify(sp)],
        );
        await run("delete from purchasing_profile where business_id = $1", [source]);
      } else {
        await run("update purchasing_profile set business_id = $2 where business_id = $1", [source, target]);
      }
    }
    const names = [tgt.alternate_names, src.trading_name, src.alternate_names].filter(Boolean).join(", ").slice(0, 300);
    const note = `Merged from ${src.trading_name} (${src.code}) on ${todayISO()}.`;
    await run("update business set alternate_names = $2, notes = concat_ws(E'\\n', notes, $3::text), updated_at = now() where id = $1", [target, names, note]);
    await run(
      "update business set archived_at = now(), merged_into_business_id = $2, notes = concat_ws(E'\\n', notes, $3::text), updated_at = now() where id = $1",
      [source, target, `Merged into ${tgt.trading_name} (${tgt.code}) on ${todayISO()}.`],
    );
    await recalcStage(keepId, run);
  });
  revalidatePath("/customers");
  redirect(`/customers/${keepId}?merged=1`);
}

export async function archiveBusiness(fd: FormData) {
  await requireUser();
  const id = cid(fd);
  await q("update business set archived_at = now() where id = $1", [id]);
  revalidatePath("/customers");
  redirect("/customers");
}

// ---------- contacts and branches ----------

export async function saveContact(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const id = uuid(fd, "contact_id");
  const raw = str(fd, "phone_primary", 40);
  const phone = normalizePhone(raw);
  const raw2 = str(fd, "phone_secondary", 40);
  const permission = choice(fd, "contact_permission", OPT.contactPermission) ?? "not_asked";
  const authorityBasis = choice(fd, "basis", BASIS);
  const vals = [
    str(fd, "name", 120) ?? "Unknown name", str(fd, "job_title", 120), multi(fd, "decision_roles", OPT.decisionRoles),
    choice(fd, "purchasing_authority", OPT.purchasingAuthority) ?? "unknown", choice(fd, "payment_authority", OPT.paymentAuthority) ?? "unknown",
    authorityBasis, date(fd, "verified_at") ?? todayISO(), bool(fd, "is_primary"), phone, normalizePhone(raw2),
    str(fd, "whatsapp", 40), str(fd, "telegram", 80), str(fd, "email", 200), choice(fd, "preferred_channel", OPT.channel),
    str(fd, "best_time_to_contact", 200), choice(fd, "language_preference", OPT.language), permission,
    multi(fd, "permitted_channels", OPT.channel), str(fd, "opt_out_reason", 300),
    [str(fd, "notes"), raw && !phone ? `Unverified phone as given: ${raw}` : null].filter(Boolean).join("\n") || null,
    uuid(fd, "branch_id"),
  ];
  await tx(async (run) => {
    if (vals[7]) await run("update contact set is_primary = false where business_id = $1", [bid]);
    if (id) {
      const before = (await run("select * from contact where id = $1 and business_id = $2", [id, bid]))[0];
      if (!before) return;
      await run(
        `update contact set name=$2, job_title=$3, decision_roles=$4, purchasing_authority=$5, payment_authority=$6,
          authority_basis=$7, authority_verified_at=$8, is_primary=$9, phone_primary=$10, phone_secondary=$11, whatsapp=$12,
          telegram=$13, email=$14, preferred_channel=$15, best_time_to_contact=$16, language_preference=$17,
          contact_permission=$18, permitted_channels=$19, opt_out_reason=$20, notes=$21, branch_id=$22,
          permission_recorded_at = case when contact_permission is distinct from $18 then current_date else permission_recorded_at end,
          updated_at=now()
         where id=$1`,
        [id, ...vals],
      );
      await recordHistory(run, "contact", id, "authority", before, { purchasing_authority: vals[3], payment_authority: vals[4] }, authorityBasis, vals[6] as string);
      if (permission === "asked_not_to_contact") {
        await run("update follow_up set status='cancelled' where contact_id=$1 and status='open'", [id]);
      }
    } else {
      await run(
        `insert into contact (business_id, name, job_title, decision_roles, purchasing_authority, payment_authority, authority_basis,
          authority_verified_at, is_primary, phone_primary, phone_secondary, whatsapp, telegram, email, preferred_channel,
          best_time_to_contact, language_preference, contact_permission, permitted_channels, opt_out_reason, notes, branch_id, permission_recorded_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, case when $18 = 'not_asked' then null else current_date end)`,
        [bid, ...vals],
      );
    }
  });
  back(bid, "contacts");
}

export async function deleteContact(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const id = uuid(fd, "contact_id");
  if (id) await q("delete from contact where id = $1 and business_id = $2", [id, bid]);
  back(bid, "contacts");
}

export async function saveBranch(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const id = uuid(fd, "branch_id");
  const isMain = bool(fd, "is_main");
  const vals = [
    str(fd, "branch_label", 120) ?? "Branch", isMain, str(fd, "city", 80) ?? "Addis Ababa", choice(fd, "sub_city", OPT.subCity),
    str(fd, "woreda", 20), str(fd, "area", 120), str(fd, "directions", 500), num(fd, "gps_lat"), num(fd, "gps_lng"),
    normalizePhone(str(fd, "branch_phone", 40)), str(fd, "opening_hours", 200), str(fd, "storage_note", 300),
  ];
  await tx(async (run) => {
    if (isMain) await run("update branch set is_main = false where business_id = $1", [bid]);
    if (id) {
      await run(
        `update branch set branch_label=$3, is_main=$4, city=$5, sub_city=$6, woreda=$7, area=$8, directions=$9, gps_lat=$10,
          gps_lng=$11, branch_phone=$12, opening_hours=$13, storage_note=$14 where id=$1 and business_id=$2`,
        [id, bid, ...vals],
      );
    } else {
      await run(
        `insert into branch (business_id, branch_label, is_main, city, sub_city, woreda, area, directions, gps_lat, gps_lng, branch_phone, opening_hours, storage_note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [bid, ...vals],
      );
    }
  });
  back(bid, "contacts");
}

export async function deleteBranch(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const id = uuid(fd, "branch_id");
  if (id) await q("delete from branch where id = $1 and business_id = $2", [id, bid]);
  back(bid, "contacts");
}

// ---------- purchasing profile (Stage 2) ----------

export async function savePurchasingProfile(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const basis = choice(fd, "basis", BASIS);
  const verified = date(fd, "verified_at") ?? todayISO();
  const after = {
    restock_process: str(fd, "restock_process"),
    source_types_used: multi(fd, "source_types_used", OPT.sourceType),
    imports_directly: choice(fd, "imports_directly", OPT.importsDirectly),
    restock_trigger: multi(fd, "restock_trigger", OPT.restockTrigger),
    typical_purchase_value_band: choice(fd, "typical_purchase_value_band", OPT.purchaseValueBand),
    payment_methods_used: multi(fd, "payment_methods_used", OPT.paymentMethods),
    payment_timing: choice(fd, "payment_timing", OPT.paymentTiming),
    credit_days_expected: num(fd, "credit_days_expected", { min: 0, max: 365 }),
    goods_receipt_method: multi(fd, "goods_receipt_method", OPT.goodsReceipt),
    expected_lead_time_days: num(fd, "expected_lead_time_days", { min: 0, max: 365 }),
    needs_formal_receipt: choice(fd, "needs_formal_receipt", OPT.formalReceipt),
    purchasing_constraints: multi(fd, "purchasing_constraints", OPT.constraints),
    constraints_note: str(fd, "constraints_note"),
  };
  await tx(async (run) => {
    const before = (await run("select * from purchasing_profile where business_id = $1", [bid]))[0];
    const cols = Object.keys(after);
    const values = Object.values(after);
    if (before) {
      await run(
        `update purchasing_profile set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, basis = $${cols.length + 2}, verified_at = $${cols.length + 3}, updated_at = now() where business_id = $1`,
        [bid, ...values, basis, verified],
      );
      await recordHistory(run, "purchasing_profile", bid, "profile", before, after, basis, verified);
    } else {
      await run(
        `insert into purchasing_profile (business_id, ${cols.join(", ")}, basis, verified_at) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, $${cols.length + 2}, $${cols.length + 3})`,
        [bid, ...values, basis, verified],
      );
    }
    await recalcStage(bid, run);
  });
  back(bid, "sourcing");
}

// ---------- current sources, problems, buying conditions ----------

function backTo(fd: FormData, bid: string, tab: string): never {
  const rid = uuid(fd, "return_requirement_id");
  if (rid) {
    revalidatePath(`/requirements/${rid}`);
    redirect(`/requirements/${rid}`);
  }
  back(bid, tab);
}

export async function saveSource(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const id = uuid(fd, "source_id");
  const type = choice(fd, "source_type", OPT.sourceType);
  if (!type) backTo(fd, bid, "sourcing");
  const disclosure = choice(fd, "name_disclosure", OPT.nameDisclosure) ?? "not_asked";
  const vals = [
    uuid(fd, "requirement_id"), type, choice(fd, "source_origin", OPT.sourceOrigin), choice(fd, "role", OPT.sourceRole), disclosure,
    disclosure === "disclosed" ? str(fd, "supplier_name", 200) : null, choice(fd, "relationship_length", OPT.relationshipLength),
    multi(fd, "strengths", OPT.strengths), choice(fd, "satisfaction", OPT.satisfaction), choice(fd, "basis", BASIS), date(fd, "verified_at") ?? todayISO(),
  ];
  if (id) {
    await q(
      `update current_source set requirement_id=$3, source_type=$4, source_origin=$5, role=$6, name_disclosure=$7, supplier_name=$8,
        relationship_length=$9, strengths=$10, satisfaction=$11, basis=$12, verified_at=$13 where id=$1 and business_id=$2`,
      [id, bid, ...vals],
    );
  } else {
    await q(
      `insert into current_source (business_id, requirement_id, source_type, source_origin, role, name_disclosure, supplier_name,
        relationship_length, strengths, satisfaction, basis, verified_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [bid, ...vals],
    );
  }
  backTo(fd, bid, "sourcing");
}

export async function saveProblem(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const id = uuid(fd, "problem_id");
  const category = choice(fd, "category", OPT.problemCategory);
  const description = str(fd, "description");
  const basis = choice(fd, "basis", OPT.problemBasis);
  const frequency = choice(fd, "frequency", OPT.problemFrequency);
  const severity = choice(fd, "severity", OPT.severity);
  if (!category || !description || !basis || !frequency || !severity) backTo(fd, bid, "sourcing");
  const vals = [
    uuid(fd, "requirement_id"), uuid(fd, "current_source_id"), category, description, basis, frequency, severity,
    str(fd, "impact_note"), str(fd, "current_workaround"), choice(fd, "addressable_by_us", OPT.addressable) ?? "unknown",
    choice(fd, "status", OPT.problemStatus) ?? "active",
  ];
  if (id) {
    await q(
      `update sourcing_problem set requirement_id=$3, current_source_id=$4, category=$5, description=$6, basis=$7, frequency=$8,
        severity=$9, impact_note=$10, current_workaround=$11, addressable_by_us=$12, status=$13, last_confirmed_at=current_date
       where id=$1 and business_id=$2`,
      [id, bid, ...vals],
    );
  } else {
    await q(
      `insert into sourcing_problem (business_id, requirement_id, current_source_id, category, description, basis, frequency, severity,
        impact_note, current_workaround, addressable_by_us, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [bid, ...vals],
    );
  }
  backTo(fd, bid, "sourcing");
}

export async function saveCondition(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const id = uuid(fd, "condition_id");
  const type = choice(fd, "condition_type", OPT.conditionType);
  const detail = str(fd, "detail", 1000);
  const importance = choice(fd, "importance", OPT.importance);
  if (!type || !detail || !importance) backTo(fd, bid, "conditions");
  const vals = [
    uuid(fd, "requirement_id"), type, detail, num(fd, "threshold_value"), str(fd, "threshold_unit", 40), importance,
    type === "exclusivity" ? str(fd, "exclusivity_scope", 500) : null, choice(fd, "our_position", OPT.ourPosition),
    choice(fd, "basis", BASIS), date(fd, "verified_at") ?? todayISO(),
  ];
  if (id) {
    await q(
      `update buying_condition set requirement_id=$3, condition_type=$4, detail=$5, threshold_value=$6, threshold_unit=$7, importance=$8,
        exclusivity_scope=$9, our_position=$10, basis=$11, verified_at=$12 where id=$1 and business_id=$2`,
      [id, bid, ...vals],
    );
  } else {
    await q(
      `insert into buying_condition (business_id, requirement_id, condition_type, detail, threshold_value, threshold_unit, importance,
        exclusivity_scope, our_position, basis, verified_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [bid, ...vals],
    );
  }
  backTo(fd, bid, "conditions");
}

const DELETABLE: Record<string, string> = { source: "current_source", problem: "sourcing_problem", condition: "buying_condition" };

export async function deleteItem(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const kind = str(fd, "kind");
  const id = uuid(fd, "item_id");
  const table = kind ? DELETABLE[kind] : undefined;
  if (table && id) await q(`delete from ${table} where id = $1 and business_id = $2`, [id, bid]);
  backTo(fd, bid, kind === "condition" ? "conditions" : "sourcing");
}

// ---------- tags ----------

export async function addTag(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const name = str(fd, "tag", 60);
  if (name) {
    await tx(async (run) => {
      const t = (await run("insert into tag (name) values ($1) on conflict (name) do update set name = excluded.name returning id", [name]))[0];
      await run("insert into business_tag values ($1, $2) on conflict do nothing", [bid, t.id]);
    });
  }
  back(bid);
}

export async function removeTag(fd: FormData) {
  await requireUser();
  const bid = cid(fd);
  const tid = uuid(fd, "tag_id");
  if (tid && isUuid(tid)) await q("delete from business_tag where business_id = $1 and tag_id = $2", [bid, tid]);
  back(bid);
}
