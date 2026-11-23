"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/", label: "Today", icon: "◎" },
  { href: "/customers", label: "Customers", icon: "▤" },
  { href: "/follow-ups", label: "Follow-ups", icon: "◷" },
  { href: "/pipeline", label: "Pipeline", icon: "➜" },
  { href: "/demand", label: "Demand", icon: "∑" },
  { href: "/products", label: "Products", icon: "▦" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Sidebar({ logout }: { logout: () => Promise<void> }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold">Customer Intelligence</div>
        <div className="text-xs text-muted">Demand-first sourcing</div>
      </div>
      <Link href="/customers/new" className="btn-primary mb-4 w-full">
        + Quick capture
      </Link>
      <nav className="flex flex-col gap-0.5">
        {MAIN.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive(path, l.href) ? "bg-brand/10 text-brand" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
          >
            <span aria-hidden className="w-4 text-center">{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
        <a href="/api/export/customers" className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
          Export customers (CSV)
        </a>
        <form action={logout}>
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-ink">Sign out</button>
        </form>
      </div>
    </aside>
  );
}

const MOBILE = [
  { href: "/", label: "Today", icon: "◎" },
  { href: "/customers", label: "Customers", icon: "▤" },
  { href: "/customers/new", label: "Add", icon: "+" , primary: true },
  { href: "/follow-ups", label: "Follow-ups", icon: "◷" },
  { href: "/more", label: "More", icon: "≡" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {MOBILE.map((l) => {
          const active = l.href === "/customers" ? path === "/customers" || (path.startsWith("/customers/") && path !== "/customers/new") : isActive(path, l.href);
          return (
            <Link key={l.href} href={l.href} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}>
              {l.primary ? (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xl leading-none text-brand-ink">+</span>
              ) : (
                <span aria-hidden className="text-lg leading-none">{l.icon}</span>
              )}
              {!l.primary && l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
