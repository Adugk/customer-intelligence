// Helpers that read and validate HTML form values on the server.
// Invalid or unexpected values become null instead of being stored.

export function str(fd: FormData, name: string, max = 4000): string | null {
  const v = fd.get(name);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function num(fd: FormData, name: string, opts: { min?: number; max?: number } = {}): number | null {
  const s = str(fd, name);
  if (s == null) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (opts.min != null && n < opts.min) return null;
  if (opts.max != null && n > opts.max) return null;
  return n;
}

export function date(fd: FormData, name: string): string | null {
  const s = str(fd, name);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function choice<T extends readonly string[]>(fd: FormData, name: string, list: T): T[number] | null {
  const s = str(fd, name);
  return s && (list as readonly string[]).includes(s) ? (s as T[number]) : null;
}

/** Multi-select checkboxes → JSON array string (for jsonb columns). */
export function multi<T extends readonly string[]>(fd: FormData, name: string, list: T): string {
  const vals = fd
    .getAll(name)
    .filter((v): v is string => typeof v === "string" && (list as readonly string[]).includes(v));
  return JSON.stringify([...new Set(vals)]);
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}

export function uuid(fd: FormData, name: string): string | null {
  const s = str(fd, name);
  return s && /^[0-9a-f-]{36}$/i.test(s) ? s : null;
}

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
