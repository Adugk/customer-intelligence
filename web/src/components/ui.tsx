import Link from "next/link";
import type { ReactNode } from "react";
import { daysBetween, fmtDate, todayISO, toISODate } from "@/lib/format";
import { BASIS, BASIS_META, label, SEVERITY_HELP } from "@/lib/options";

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">{children}</p>;
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "warn" | "danger" | "ok" | "info" }) {
  const cls = {
    neutral: "bg-surface-2 text-muted",
    brand: "bg-brand/15 text-brand",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  }[tone];
  return <span className={`chip ${cls}`}>{children}</span>;
}

/** Provenance badge: where a value came from and when it was last verified. */
export function BasisBadge({ basis, verifiedAt, staleAfterDays }: { basis?: string | null; verifiedAt?: unknown; staleAfterDays?: number }) {
  if (!basis) return <span className="chip bg-surface-2 text-muted">Not asked</span>;
  const m = BASIS_META[basis];
  const iso = toISODate(verifiedAt);
  const stale = iso && staleAfterDays != null ? daysBetween(iso, todayISO()) > staleAfterDays : false;
  return (
    <span className={`chip ${m?.cls ?? ""} ${stale ? "opacity-60" : ""}`} title={iso ? `Verified ${fmtDate(iso)}` : undefined}>
      <span aria-hidden>{m?.icon}</span> {m?.label ?? basis}
      {iso && <span className="font-normal opacity-80">· {fmtDate(iso)}</span>}
      {stale && <span className="font-semibold">· re-check</span>}
    </span>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 border-b border-line/60 pb-1.5 sm:block sm:border-0 sm:pb-0">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium sm:text-left">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function List({ value }: { value: unknown }) {
  const arr = Array.isArray(value) ? (value as string[]) : [];
  if (!arr.length) return <>—</>;
  return <>{arr.map(label).join(", ")}</>;
}

// ---------- form controls ----------

export function Field({ label: l, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="lbl">{l}</span>
      {children}
      {hint && <span className="hint block">{hint}</span>}
    </label>
  );
}

export function Text({ name, defaultValue, placeholder, required, type = "text", inputMode, list }: { name: string; defaultValue?: unknown; placeholder?: string; required?: boolean; type?: string; inputMode?: "numeric" | "decimal" | "tel" | "email" | "text"; list?: string }) {
  return (
    <input
      className="inp"
      name={name}
      type={type}
      inputMode={inputMode}
      list={list}
      defaultValue={defaultValue == null ? "" : String(defaultValue)}
      placeholder={placeholder}
      required={required}
    />
  );
}

export function NumberInput({ name, defaultValue, placeholder, step = "any" }: { name: string; defaultValue?: unknown; placeholder?: string; step?: string }) {
  return <input className="inp" name={name} type="number" step={step} min={0} inputMode="decimal" defaultValue={defaultValue == null ? "" : String(defaultValue)} placeholder={placeholder} />;
}

export function DateInput({ name, defaultValue }: { name: string; defaultValue?: unknown }) {
  return <input className="inp" name={name} type="date" defaultValue={toISODate(defaultValue) ?? ""} />;
}

export function Area({ name, defaultValue, placeholder, rows = 3, required }: { name: string; defaultValue?: unknown; placeholder?: string; rows?: number; required?: boolean }) {
  return <textarea className="inp" name={name} rows={rows} defaultValue={defaultValue == null ? "" : String(defaultValue)} placeholder={placeholder} required={required} />;
}

export function Select({ name, options, defaultValue, blank = "— Select —", required, labels }: { name: string; options: readonly string[]; defaultValue?: unknown; blank?: string | false; required?: boolean; labels?: Record<string, string> }) {
  return (
    <select className="inp" name={name} defaultValue={defaultValue == null ? "" : String(defaultValue)} required={required}>
      {blank !== false && <option value="">{blank}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? label(o)}
        </option>
      ))}
    </select>
  );
}

export function SeveritySelect({ name, defaultValue }: { name: string; defaultValue?: unknown }) {
  return <Select name={name} options={["low", "medium", "high", "critical"]} defaultValue={defaultValue} labels={SEVERITY_HELP} required />;
}

export function Checks({ name, options, values }: { name: string; options: readonly string[]; values?: unknown }) {
  const set = new Set(Array.isArray(values) ? (values as string[]) : []);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand">
          <input type="checkbox" name={name} value={o} defaultChecked={set.has(o)} className="sr-only" />
          {label(o)}
        </label>
      ))}
    </div>
  );
}

/** Provenance inputs for a field group: basis + verified date. */
export function BasisFields({ prefix = "", basis, verifiedAt, defaultBasis = "confirmed" }: { prefix?: string; basis?: string | null; verifiedAt?: unknown; defaultBasis?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2">
      <Field label="How do we know this?" hint="Estimates count half in scoring; assumptions count zero.">
        <select className="inp" name={`${prefix}basis`} defaultValue={basis ?? defaultBasis}>
          {BASIS.map((b) => (
            <option key={b} value={b}>
              {BASIS_META[b].icon} {BASIS_META[b].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Last verified" hint="Defaults to today.">
        <DateInput name={`${prefix}verified_at`} defaultValue={verifiedAt ?? todayISO()} />
      </Field>
    </div>
  );
}

export function Submit({ children = "Save", className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <button type="submit" className={`btn-primary ${className}`}>
      {children}
    </button>
  );
}

export function Details({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold">
        <span>{summary}</span>
        <span className="text-muted transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap ${t.key === current ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-muted">{t.count}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{message}</p>;
}

export function ScorePill({ score, completeness }: { score: number; completeness?: number }) {
  const cls = score >= 70 ? "bg-emerald-600 text-white" : score >= 45 ? "bg-sky-600 text-white" : score >= 20 ? "bg-amber-500 text-white" : "bg-slate-400 text-white dark:bg-slate-600";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex h-7 min-w-9 items-center justify-center rounded-md px-1.5 text-sm font-bold tabular-nums ${cls}`}>{score}</span>
      {completeness != null && <span className="text-xs text-muted tabular-nums">{completeness}% evidence</span>}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone = ({ qualified: "ok", specified: "info", interested: "brand", mentioned: "neutral", well_served: "neutral", not_pursuing: "neutral" } as const)[status as "qualified"] ?? "neutral";
  return <Chip tone={tone}>{label(status)}</Chip>;
}
