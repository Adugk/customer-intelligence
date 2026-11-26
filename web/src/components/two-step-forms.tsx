"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { CodesState } from "@/lib/actions/settings";

function Codes({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Your backup codes — write them down now. They will not be shown again.</p>
      <p className="text-sm text-muted">Each code works once. Use one if you lose your phone.</p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3 font-mono text-base">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Link href="/settings" className="btn-primary">
        I&apos;ve written them down
      </Link>
    </div>
  );
}

export function CodeForm({ action, button, danger }: { action: (s: CodesState, fd: FormData) => Promise<CodesState>; button: string; danger?: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (state?.codes) return <Codes codes={state.codes} />;
  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{state.error}</p>}
      <label className="block">
        <span className="lbl">6-digit code from your app</span>
        <input className="inp max-w-48 text-center text-lg tracking-widest" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={7} />
      </label>
      <button className={danger ? "btn-danger" : "btn-primary"} disabled={pending}>
        {pending ? "Checking…" : button}
      </button>
    </form>
  );
}
