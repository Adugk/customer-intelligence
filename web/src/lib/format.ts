// Date, number and phone formatting. Dates are 'YYYY-MM-DD' strings in Addis Ababa time.

const TZ = "Africa/Addis_Ababa";

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000);
}

export function toISODate(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(v);
  }
  return null;
}

export function fmtDate(v: unknown): string {
  const iso = toISODate(v);
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(String(v));
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function relDays(iso: string | null): string {
  if (!iso) return "";
  const d = daysBetween(todayISO(), iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export function fmtNum(n: unknown, digits = 0): string {
  if (n == null || n === "") return "—";
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtMoney(n: unknown, currency = "ETB"): string {
  if (n == null || n === "") return "—";
  return `${fmtNum(n, 2)} ${currency}`;
}

/** Normalises Ethiopian mobile numbers to +2519XXXXXXXX / +2517XXXXXXXX. Returns null if invalid. */
export function normalizePhone(input: string | null): string | null {
  if (!input) return null;
  let s = input.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0[79]\d{8}$/.test(s)) s = "+251" + s.slice(1);
  else if (/^[79]\d{8}$/.test(s)) s = "+251" + s;
  else if (/^251[79]\d{8}$/.test(s)) s = "+" + s;
  return /^\+251[79]\d{8}$/.test(s) ? s : null;
}

export function displayPhone(p: string | null | undefined): string {
  if (!p) return "—";
  const m = /^\+251(\d{3})(\d{3})(\d{3})$/.exec(p);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : p;
}

/** Months covered by one order interval, e.g. 2 weeks → 0.46 months. */
export function intervalInMonths(value: number | null, unit: string | null): number | null {
  if (!value || value <= 0 || !unit) return null;
  if (unit === "day") return value / 30.44;
  if (unit === "week") return (value * 7) / 30.44;
  if (unit === "month") return value;
  return null;
}
