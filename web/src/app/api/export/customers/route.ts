// CSV export of customers. Supplier names and internal interpretation are deliberately excluded (design §11).
import { getUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { todayISO } from "@/lib/format";

function cell(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("; ") : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection and quote every cell.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const rows = await q(
    `select b.code, b.trading_name, b.alternate_names, b.customer_kind, b.business_type, b.sectors, b.relationship_stage, b.sourcing_status,
       b.acquisition_source, b.confidentiality_level,
       br.area, br.sub_city, br.directions,
       c.name as contact_name, c.job_title, c.phone_primary, c.contact_permission,
       (select count(*)::int from product_requirement r where r.business_id = b.id and r.archived_at is null) as requirements,
       (select count(*)::int from product_requirement r where r.business_id = b.id and r.archived_at is null and r.demand_status = 'qualified') as qualified,
       (select min(f.due_date) from follow_up f where f.business_id = b.id and f.status = 'open') as next_follow_up,
       b.created_at
     from business b
     left join lateral (select * from branch where business_id = b.id order by is_main desc limit 1) br on true
     left join lateral (select * from contact where business_id = b.id order by is_primary desc limit 1) c on true
     where b.archived_at is null order by b.trading_name`,
  );
  const headers = ["code", "trading_name", "alternate_names", "customer_kind", "business_type", "sectors", "relationship_stage", "sourcing_status", "acquisition_source", "confidentiality_level", "area", "sub_city", "directions", "contact_name", "job_title", "phone", "contact_permission", "requirements", "qualified", "next_follow_up", "created_at"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const vals = { ...r, phone: r.contact_permission === "asked_not_to_contact" ? "" : r.phone_primary };
    lines.push(headers.map((h) => cell((vals as Record<string, unknown>)[h])).join(","));
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
