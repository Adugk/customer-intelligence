"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/", label: "Today" },
  { href: "/customers", label: "Customers" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/pipeline", label: "Deals" },
  { href: "/demand", label: "Demand" },
  { href: "/products", label: "Products" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/pipeline") return path.startsWith("/pipeline") || path.startsWith("/opportunities");
  if (href === "/customers") return (path === "/customers" || path.startsWith("/customers/") || path.startsWith("/requirements")) && path !== "/customers/new";
  return path === href || path.startsWith(href + "/");
}

export function Sidebar({ logout }: { logout: () => Promise<void> }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
      <div className="mb-6 px-2 text-sm font-semibold">Customer Intelligence</div>
      <Link href="/customers/new" className="btn-primary mb-4 w-full">
        + Add customer
      </Link>
      <nav className="flex flex-col gap-0.5">
        {MAIN.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${isActive(path, l.href) ? "bg-brand/10 text-brand" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
        <a href="/api/export/customers" className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
          Download customer list
        </a>
        <form action={logout}>
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-ink">Sign out</button>
        </form>
      </div>
    </aside>
  );
}

const MOBILE = [
  { href: "/", label: "Today" },
  { href: "/customers", label: "Customers" },
  { href: "/customers/new", label: "Add", primary: true },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/more", label: "More" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-5">
        {MOBILE.map((l) => {
          const active = l.href === "/more" ? ["/more", "/pipeline", "/opportunities", "/demand", "/products"].some((p) => path.startsWith(p)) : !l.primary && isActive(path, l.href);
          return (
            <Link key={l.href} href={l.href} className={`flex min-h-14 flex-col items-center justify-center text-xs font-medium ${active ? "text-brand" : "text-muted"}`}>
              {l.primary ? <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xl leading-none text-brand-ink" aria-label="Add customer">+</span> : l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
