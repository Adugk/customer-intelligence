"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clearFailedLogins, createSession, destroySession, hasAnyUser, loginBlocked, recordFailedLogin } from "@/lib/auth";
import { one } from "@/lib/db";
import { str } from "@/lib/forms";

export async function setupOwner(fd: FormData) {
  if (await hasAnyUser()) redirect("/login");
  const email = str(fd, "email", 200)?.toLowerCase();
  const password = str(fd, "password", 200) ?? "";
  const confirm = str(fd, "confirm", 200) ?? "";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) redirect("/setup?error=Enter+a+valid+email");
  if (password.length < 10) redirect("/setup?error=Password+must+be+at+least+10+characters");
  if (password !== confirm) redirect("/setup?error=Passwords+do+not+match");
  const hash = await bcrypt.hash(password, 12);
  const u = await one("insert into app_user (email, password_hash) values ($1, $2) returning id", [email, hash]);
  await createSession(u!.id);
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
