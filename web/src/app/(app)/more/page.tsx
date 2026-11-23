import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { logout } from "../../(auth)/actions";

const LINKS = [
  { href: "/pipeline", label: "Opportunity pipeline", desc: "Open opportunities by stage and commitment" },
  { href: "/demand", label: "Demand view", desc: "Demand added up across customers, by product" },
  { href: "/products", label: "Product catalog", desc: "Shared products that requirements match to" },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="card block p-4 hover:bg-surface-2">
            <div className="font-medium">{l.label}</div>
            <div className="text-sm text-muted">{l.desc}</div>
          </Link>
        ))}
        <a href="/api/export/customers" className="card block p-4 hover:bg-surface-2">
          <div className="font-medium">Export customers (CSV)</div>
          <div className="text-sm text-muted">Supplier names and internal notes are excluded</div>
        </a>
        <form action={logout}>
          <button className="btn-ghost mt-4 w-full">Sign out</button>
        </form>
      </div>
    </>
  );
}
