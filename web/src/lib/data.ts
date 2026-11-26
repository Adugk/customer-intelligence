// Shared data operations used by several screens.
import { one, q, type QueryFn, type Row } from "./db";
import { addDays, fmtDate, todayISO } from "./format";
import { nextPurchase, scoreRequirement, type ScoreContext } from "./scoring";
import { getScoreBands } from "./settings";

export const REMINDER_LEAD_DAYS = 14; // design §9.2 — remind 14 days before an expected purchase
const ACTIVE_STATUSES = ["interested", "specified", "qualified"];

/** Recalculate a business's relationship stage from recorded facts (design §4.1). */
export async function recalcStage(businessId: string, run: QueryFn = q) {
  const b = (await run("select stage_override from business where id = $1", [businessId]))[0];
  if (!b) return;
  if (b.stage_override) {
    await run("update business set relationship_stage = stage_override, updated_at = now() where id = $1", [businessId]);
    return;
  }
  const f = (
    await run(
      `select
        (select count(*)::int from opportunity where business_id = $1 and stage = 'closed_won') as won,
        (select count(*)::int from opportunity where business_id = $1 and stage not in ('closed_won','closed_lost','cancelled')) as open_opps,
        (select count(*)::int from product_requirement where business_id = $1 and archived_at is null and demand_status = 'qualified') as qualified,
        (select count(*)::int from product_requirement where business_id = $1 and archived_at is null and demand_status in ('interested','specified','well_served')) as discovering,
        (select count(*)::int from purchasing_profile where business_id = $1 and basis is not null) as profile,
        (select count(*)::int from interaction where business_id = $1) as interactions`,
      [businessId],
    )
  )[0];
  const stage =
    f.won >= 2 ? "repeat_customer"
    : f.won >= 1 ? "first_order_customer"
    : f.open_opps > 0 ? "active_opportunity"
    : f.qualified > 0 ? "qualified"
    : f.discovering > 0 || f.profile > 0 ? "in_discovery"
    : f.interactions > 0 ? "contacted"
    : "prospect";
  await run("update business set relationship_stage = $2, updated_at = now() where id = $1", [businessId, stage]);
}

/** Keep exactly one open "check purchase timing" reminder per active requirement. */
export async function syncPurchaseReminder(requirementId: string, run: QueryFn = q) {
  const r = (await run("select * from product_requirement where id = $1", [requirementId]))[0];
  if (!r) return;
  await run("delete from follow_up where requirement_id = $1 and origin = 'next_purchase_reminder' and status = 'open'", [requirementId]);
  if (r.archived_at || !ACTIVE_STATUSES.includes(r.demand_status)) return;
  const biz = (await run("select relationship_stage from business where id = $1", [r.business_id]))[0];
  if (biz?.relationship_stage === "do_not_contact") return;
  const np = nextPurchase(r);
  if (!np.date) return;
  const today = todayISO();
  let due = addDays(np.date, -REMINDER_LEAD_DAYS);
  if (due < today) due = today;
  await run(
    `insert into follow_up (business_id, requirement_id, due_date, action_type, purpose, origin)
     values ($1, $2, $3, 'check_purchase_timing', $4, 'next_purchase_reminder')`,
    [r.business_id, r.id, due, `Ask when they will next buy "${r.customer_description}" (${np.predicted ? "we expect about" : "they said"} ${fmtDate(np.date)})`],
  );
}

/** Record old → new values of a provenance group (design §2.3 history). */
export async function recordHistory(
  run: QueryFn,
  entityType: string,
  entityId: string,
  group: string,
  before: Row,
  after: Record<string, unknown>,
  basis: string | null,
  verifiedAt: string | null,
  interactionId: string | null = null,
) {
  const oldVals: Record<string, unknown> = {};
  const newVals: Record<string, unknown> = {};
  let changed = false;
  for (const k of Object.keys(after)) {
    const a = before[k] instanceof Date ? (before[k] as Date).toISOString() : before[k];
    const bRaw = after[k];
    const b = typeof bRaw === "string" && bRaw.startsWith("[") ? JSON.parse(bRaw) : bRaw;
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      oldVals[k] = a ?? null;
      newVals[k] = b ?? null;
      changed = true;
    }
  }
  if (!changed) return;
  await run(
    `insert into value_history (entity_type, entity_id, field_group, old_values, new_values, basis, verified_at, interaction_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [entityType, entityId, group, JSON.stringify(oldVals), JSON.stringify(newVals), basis, verifiedAt, interactionId],
  );
}

/** Score context for all requirements of one business. */
export async function loadBusinessScoreData(businessId: string) {
  const [contacts, problems, conds, products, bands] = await Promise.all([
    q("select * from contact where business_id = $1", [businessId]),
    q("select * from sourcing_problem where business_id = $1", [businessId]),
    q("select requirement_id from buying_condition where business_id = $1", [businessId]),
    q("select p.* from product p join product_requirement r on r.product_id = p.id where r.business_id = $1", [businessId]),
    getScoreBands(),
  ]);
  return (r: Row): ScoreContext => ({
    bands,
    contacts,
    problems: problems.filter((p) => p.requirement_id === r.id),
    product: products.find((p) => p.id === r.product_id) ?? null,
    conditionsCount: conds.filter((c) => c.requirement_id === r.id || c.requirement_id == null).length,
  });
}

/** Scores every active requirement in the database (fine for a single user's data volume). */
export async function scoreAllActiveRequirements() {
  const [reqs, contacts, problems, conds, products] = await Promise.all([
    q(`select r.*, b.trading_name, b.code as business_code, b.confidentiality_level
       from product_requirement r join business b on b.id = r.business_id
       where r.archived_at is null and b.archived_at is null and r.demand_status not in ('not_pursuing','well_served')`),
    q("select * from contact"),
    q("select * from sourcing_problem"),
    q("select business_id, requirement_id from buying_condition"),
    q("select * from product"),
  ]);
  const bands = await getScoreBands();
  return reqs.map((r) => {
    const ctx: ScoreContext = {
      bands,
      contacts: contacts.filter((c) => c.business_id === r.business_id),
      problems: problems.filter((p) => p.requirement_id === r.id),
      product: products.find((p) => p.id === r.product_id) ?? null,
      conditionsCount: conds.filter((c) => c.business_id === r.business_id && (c.requirement_id === r.id || c.requirement_id == null)).length,
    };
    return { req: r, ...scoreRequirement(r, ctx) };
  });
}

export async function getBusiness(id: string) {
  return one("select * from business where id = $1", [id]);
}
