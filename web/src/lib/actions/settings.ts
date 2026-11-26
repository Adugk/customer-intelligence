"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q } from "../db";
import { num, str } from "../forms";
import { setSetting } from "../settings";
import { hashRecoveryCode, newRecoveryCodes, newSecret, verifyCode } from "../totp";

export async function saveScoreBands(fd: FormData) {
  await requireUser();
  const b1 = num(fd, "b1", { min: 1 });
  const b2 = num(fd, "b2", { min: 1 });
  const b3 = num(fd, "b3", { min: 1 });
  if (b1 == null || b2 == null || b3 == null) redirect("/settings?error=Please+fill+in+all+three+amounts.");
  if (!(b1 < b2 && b2 < b3)) redirect("/settings?error=Each+amount+must+be+bigger+than+the+one+before+it.");
  await setSetting("score_bands", { b1, b2, b3 });
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}

/** Step 1: create a secret (not active until a correct code confirms it). */
export async function startTwoStep() {
  const u = await requireUser();
  const row = await one("select totp_enabled from app_user where id = $1", [u.id]);
  if (!row?.totp_enabled) await q("update app_user set totp_secret = $2 where id = $1", [u.id, newSecret()]);
  redirect("/settings/two-step");
}

export type CodesState = { error?: string; codes?: string[] } | undefined;

/** Step 2: confirm with a code from the app → turn on, and show backup codes once. */
export async function confirmTwoStep(_prev: CodesState, fd: FormData): Promise<CodesState> {
  const u = await requireUser();
  const row = await one("select totp_secret, totp_enabled from app_user where id = $1", [u.id]);
  if (!row?.totp_secret) return { error: "Please start again." };
  const step = verifyCode(row.totp_secret, str(fd, "code", 12) ?? "");
  if (step == null) return { error: "That code didn't work. Type the newest 6-digit code from your app." };
  const codes = newRecoveryCodes();
  await q("update app_user set totp_enabled = true, totp_last_step = $2, recovery_codes = $3 where id = $1", [u.id, step, JSON.stringify(codes.map(hashRecoveryCode))]);
  return { codes };
}

export async function newBackupCodes(_prev: CodesState, fd: FormData): Promise<CodesState> {
  const u = await requireUser();
  const row = await one("select totp_secret, totp_enabled from app_user where id = $1", [u.id]);
  if (!row?.totp_enabled) return { error: "Two-step sign-in is off." };
  if (verifyCode(row.totp_secret, str(fd, "code", 12) ?? "") == null) return { error: "That code didn't work." };
  const codes = newRecoveryCodes();
  await q("update app_user set recovery_codes = $2 where id = $1", [u.id, JSON.stringify(codes.map(hashRecoveryCode))]);
  return { codes };
}

export async function turnOffTwoStep(_prev: CodesState, fd: FormData): Promise<CodesState> {
  const u = await requireUser();
  const row = await one("select totp_secret, totp_enabled from app_user where id = $1", [u.id]);
  if (!row?.totp_enabled) redirect("/settings");
  if (verifyCode(row.totp_secret, str(fd, "code", 12) ?? "") == null) return { error: "That code didn't work." };
  await q("update app_user set totp_enabled = false, totp_secret = null, recovery_codes = '[]', totp_last_step = null where id = $1", [u.id]);
  redirect("/settings?off=1");
}
