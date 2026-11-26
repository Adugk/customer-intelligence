// Exchange rates are entered by the owner and never overwritten. Records keep the rate they used.
import { one, q, type QueryFn } from "./db";

/** Latest rate to convert 1 unit of `from` into ETB (or `to`). Returns null if none recorded. */
export async function latestRate(from: string, to = "ETB", run: QueryFn = q): Promise<{ rate: number; rate_date: string; id: string | null } | null> {
  if (from === to) return { rate: 1, rate_date: "", id: null };
  const r = (await run("select id, rate, rate_date from exchange_rate where from_currency = $1 and to_currency = $2 order by rate_date desc, created_at desc limit 1", [from, to]))[0];
  if (r) return { rate: Number(r.rate), rate_date: String(r.rate_date), id: r.id };
  // Try the reverse direction (e.g. ETB→AED entered instead of AED→ETB).
  const rev = (await run("select id, rate, rate_date from exchange_rate where from_currency = $1 and to_currency = $2 order by rate_date desc, created_at desc limit 1", [to, from]))[0];
  return rev ? { rate: 1 / Number(rev.rate), rate_date: String(rev.rate_date), id: rev.id } : null;
}

/** Rate from one currency to another via ETB when there is no direct rate. */
export async function rateBetween(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const direct = await latestRate(from, to);
  if (direct) return direct.rate;
  const a = await latestRate(from, "ETB");
  const b = await latestRate(to, "ETB");
  return a && b ? a.rate / b.rate : null;
}

export async function allRates() {
  return q("select * from exchange_rate order by rate_date desc, created_at desc limit 50");
}

export async function hasRate(from: string) {
  return !!(await one("select 1 from exchange_rate where (from_currency = $1 and to_currency = 'ETB') or (from_currency = 'ETB' and to_currency = $1) limit 1", [from]));
}
