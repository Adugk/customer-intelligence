import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { logout } from "../../(auth)/actions";

const LINKS = [
  { href: "/follow-ups", label: "Follow-ups", desc: "Calls, visits and messages you planned" },
  { href: "/pipeline", label: "Deals", desc: "Possible sales you are working on" },
  { href: "/demand", label: "Demand", desc: "How much customers need, added up by product" },
  { href: "/groups", label: "Buying groups", desc: "Customers who want the same product, bought together" },
  { href: "/products", label: "Products", desc: "Your list of products" },
  { href: "/results", label: "Results", desc: "Which ways of finding customers turn into buyers" },
  { href: "/settings", label: "Settings and backup", desc: "Two-step sign-in, full backup, priority score levels" },
];

export default function MorePage() {
  return (
    <>
      <PageHeader title="More" />
      <ul className="card divide-y divide-line">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block px-4 py-3 hover:bg-surface-2">
              <div className="font-medium">{l.label}</div>
              <div className="text-sm text-muted">{l.desc}</div>
            </Link>
          </li>
        ))}
        <li>
          <a href="/api/export/customers" className="block px-4 py-3 hover:bg-surface-2">
            <div className="font-medium">Download customer list</div>
            <div className="text-sm text-muted">A spreadsheet file (CSV). Supplier names and private notes are left out.</div>
          </a>
        </li>
      </ul>
      <form action={logout}>
        <button className="btn-ghost mt-4 w-full">Sign out</button>
      </form>
    </>
  );
}
