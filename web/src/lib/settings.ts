// Owner-editable settings stored in the database (table app_setting).
import { one, q } from "./db";

/** Monthly value (ETB) where the "How much money it's worth" score steps up: 4 → 10 → 16 → 20 points. */
export type ScoreBands = { b1: number; b2: number; b3: number };
export const DEFAULT_SCORE_BANDS: ScoreBands = { b1: 20000, b2: 100000, b3: 500000 };

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await one("select value from app_setting where key = $1", [key]);
  return r ? (r.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await q(
    `insert into app_setting (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getScoreBands(): Promise<ScoreBands> {
  const b = await getSetting<Partial<ScoreBands>>("score_bands", DEFAULT_SCORE_BANDS);
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  return ok(b.b1) && ok(b.b2) && ok(b.b3) ? (b as ScoreBands) : DEFAULT_SCORE_BANDS;
}
