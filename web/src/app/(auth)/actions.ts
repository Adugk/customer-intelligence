"use server";

import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearFailedLogins, createSession, destroySession, hasAnyUser, loginBlocked, recordFailedLogin } from "@/lib/auth";
import { one } from "@/lib/db";
import { str } from "@/lib/forms";

/** In production the owner account can only be created with the SETUP_CODE set in the hosting settings. */
export async function setupRequiresCode(): Promise<"required" | "missing" | "not_required"> {
  if (process.env.SETUP_CODE) return "required";
  return process.env.NODE_ENV === "production" ? "missing" : "not_required";
}

function codeMatches(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setupOwner(fd: FormData) {
  if (await hasAnyUser()) redirect("/login");
  const mode = await setupRequiresCode();
  if (mode === "missing") redirect("/setup");
  if (mode === "required") {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (loginBlocked(`setup|${ip}`)) redirect("/setup?error=Too+many+attempts.+Try+again+in+15+minutes");
    if (!codeMatches(str(fd, "setup_code", 200) ?? "", process.env.SETUP_CODE!)) {
      recordFailedLogin(`setup|${ip}`);
      redirect("/setup?error=Wrong+setup+code");
    }
  }
  const email = str(fd, "email", 200)?.toLowerCase();
  const password = str(fd, "password", 200) ?? "";
  const confirm = str(fd, "confirm", 200) ?? "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) redirect("/setup?error=Enter+a+valid+email");
  if (password.length < 10) redirect("/setup?error=Password+must+be+at+least+10+characters");
  if (password !== confirm) redirect("/setup?error=Passwords+do+not+match");
  const hash = await bcrypt.hash(password, 12);
  // Only succeeds while no account exists, even if two setups are submitted at once.
  const u = await one(
    "insert into app_user (email, password_hash) select $1, $2 where not exists (select 1 from app_user) returning id",
    [email, hash],
  );
  if (!u) redirect("/login");
  await createSession(u.id);
  redirect("/");
}

export async function login(fd: FormData) {
  const email = str(fd, "email", 200)?.toLowerCase() ?? "";
  const password = str(fd, "password", 200) ?? "";
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${ip}|${email}`;
  if (loginBlocked(key)) redirect("/login?error=Too+many+attempts.+Try+again+in+15+minutes");
  const u = await one("select id, password_hash from app_user where email = $1", [email]);
  const ok = u ? await bcrypt.compare(password, u.password_hash) : false;
  if (!ok || !u) {
    recordFailedLogin(key);
    redirect("/login?error=Wrong+email+or+password");
  }
  clearFailedLogins(key);
  await createSession(u.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
