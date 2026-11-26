// Full backup: every business table as JSON. Excludes login data (passwords, sessions, 2-step secrets).
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { todayISO } from "@/lib/format";

const TABLES = [
  "business", "branch", "contact", "purchasing_profile", "product_category", "product", "product_requirement",
  "requirement_variant", "current_source", "sourcing_problem", "buying_condition", "interaction", "interaction_contact",
  "interaction_requirement", "follow_up", "opportunity", "opportunity_line", "opportunity_stage_history", "tag",
  "business_tag", "value_history", "buying_group", "buying_group_member", "app_setting",
  "supplier", "supplier_contact", "supplier_offer", "supplier_price",
];

export async function GET() {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await q(`select * from ${t}`);
  const body = JSON.stringify(
    {
      about: "Full backup of the Customer Intelligence app. Contains private customer and supplier information — store it safely.",
      created_at: new Date().toISOString(),
      schema_migrations: (await q("select id from schema_migrations order by id")).map((r) => r.id),
      tables: data,
    },
    null,
    1,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-intelligence-backup-${todayISO()}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
