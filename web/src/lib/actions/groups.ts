"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { choice, date, num, str, uuid } from "../forms";
import { OPT } from "../options";

// A customer's product can join a buying group only if it is the same product, still active,
// and the customer is not marked "Keep fully private".
const ELIGIBLE = `
  select r.id from product_requirement r join business b on b.id = r.business_id
  where r.id = $1 and r.product_id = $2 and r.archived_at is null and b.archived_at is null
    and b.confidentiality_level <> 'strict' and r.demand_status in ('interested','specified','qualified')`;

function back(id: string, msg?: string): never {
  revalidatePath(`/groups/${id}`);
  redirect(`/groups/${id}${msg ? `?error=${encodeURIComponent(msg)}` : ""}`);
}

export async function createGroup(fd: FormData) {
  await requireUser();
  const productId = uuid(fd, "product_id");
  const name = str(fd, "name", 150);
  if (!productId || !name) redirect(`/groups/new?product=${productId ?? ""}&error=${encodeURIComponent("Please give the group a name.")}`);
  const picked = fd.getAll("requirement_ids").filter((v): v is string => typeof v === "string");
  const id = await tx(async (run) => {
    const g = (
      await run("insert into buying_group (name, product_id, target_qty, target_date, notes) values ($1,$2,$3,$4,$5) returning id", [
        name, productId, num(fd, "target_qty", { min: 0 }), date(fd, "target_date"), str(fd, "notes"),
      ])
    )[0];
    for (const rid of picked) {
      const ok = (await run(ELIGIBLE, [rid, productId]))[0];
      const qty = num(fd, `qty_${rid}`, { min: 0 });
      if (ok && qty && qty > 0) await run("insert into buying_group_member (group_id, requirement_id, qty) values ($1,$2,$3)", [g.id, rid, qty]);
    }
    return g.id as string;
  });
  redirect(`/groups/${id}`);
}

export async function addGroupMember(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "group_id");
  const rid = uuid(fd, "requirement_id");
  const qty = num(fd, "qty", { min: 0 });
  if (!id) redirect("/groups");
  const g = await one("select product_id from buying_group where id = $1", [id]);
  if (!g || !rid) back(id, "Please choose a customer.");
  if (!qty || qty <= 0) back(id, "Please enter how many they want.");
  if (!(await one(ELIGIBLE, [rid, g.product_id]))) back(id, "This customer's product can't be added to this group.");
  await q("insert into buying_group_member (group_id, requirement_id, qty) values ($1,$2,$3) on conflict (group_id, requirement_id) do update set qty = excluded.qty", [id, rid, qty]);
  back(id);
}

export async function updateGroupMember(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "group_id");
  const mid = uuid(fd, "member_id");
  if (!id || !mid) redirect("/groups");
  if (str(fd, "op") === "remove") {
    await q("delete from buying_group_member where id = $1 and group_id = $2", [mid, id]);
    back(id);
  }
  const qty = num(fd, "qty", { min: 0 });
  if (!qty || qty <= 0) back(id, "Quantity must be more than zero.");
  await q("update buying_group_member set qty = $3, commitment = $4 where id = $1 and group_id = $2", [mid, id, qty, choice(fd, "commitment", OPT.groupCommitment) ?? "interested"]);
  back(id);
}

export async function updateGroup(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "group_id");
  if (!id) redirect("/groups");
  await q("update buying_group set name = coalesce($2, name), target_qty = $3, target_date = $4, status = $5, notes = $6, updated_at = now() where id = $1", [
    id, str(fd, "name", 150), num(fd, "target_qty", { min: 0 }), date(fd, "target_date"), choice(fd, "status", OPT.groupStatus) ?? "forming", str(fd, "notes"),
  ]);
  back(id);
}
