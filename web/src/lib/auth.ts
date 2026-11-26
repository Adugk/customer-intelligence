// Single-owner authentication with server-side sessions.
// The browser only holds a random token; the database stores its SHA-256 hash.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one, q } from "./db";

const COOKIE = "cpis_session";
const SESSION_DAYS = 7;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hasAnyUser(): Promise<boolean> {
  const r = await one("select count(*)::int as n from app_user");
  return (r?.n ?? 0) > 0;
}

/** `pending2fa`: password was correct but the 6-digit code is still needed (valid 10 minutes, sees no data). */
export async function createSession(userId: string, pending2fa = false) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + (pending2fa ? 10 * 60000 : SESSION_DAYS * 86400000));
  await q("insert into user_session (id, user_id, expires_at, pending_2fa) values ($1, $2, $3, $4)", [hash(token), userId, expires.toISOString(), pending2fa]);
  await q("delete from user_session where expires_at < now()");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q("delete from user_session where id = $1", [hash(token)]);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const r = await one(
    "select u.id, u.email from user_session s join app_user u on u.id = s.user_id where s.id = $1 and s.expires_at > now() and not s.pending_2fa",
    [hash(token)],
  );
  return r ? { id: r.id, email: r.email } : null;
}

/** A session that passed the password step but still needs the 6-digit code. */
export async function getPendingUser(): Promise<{ id: string; email: string; sessionId: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const r = await one(
    "select u.id, u.email, s.id as sid from user_session s join app_user u on u.id = s.user_id where s.id = $1 and s.expires_at > now() and s.pending_2fa",
    [hash(token)],
  );
  return r ? { id: r.id, email: r.email, sessionId: r.sid } : null;
}

export async function requireUser() {
  const u = await getUser();
  if (!u) redirect("/login");
  return u;
}

// Simple in-memory brute-force protection (per server instance).
const attempts = new Map<string, { n: number; until: number }>();
export function loginBlocked(key: string): boolean {
  const a = attempts.get(key);
  return !!a && a.n >= 5 && a.until > Date.now();
}
export function recordFailedLogin(key: string) {
  const a = attempts.get(key);
  const n = a && a.until > Date.now() ? a.n + 1 : 1;
  attempts.set(key, { n, until: Date.now() + 15 * 60000 });
}
export function clearFailedLogins(key: string) {
  attempts.delete(key);
}
