import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorNote, Field } from "@/components/ui";
import { getPendingUser, getUser } from "@/lib/auth";
import { verifyLoginCode } from "../../actions";

export default async function LoginCodePage({ searchParams }: PageProps<"/login/code">) {
  if (await getUser()) redirect("/");
  if (!(await getPendingUser())) redirect("/login");
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Enter your code</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Open your authenticator app and type the 6-digit code for Customer Intelligence.</p>
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={verifyLoginCode} className="space-y-4">
        <Field label="Code" hint="Lost your phone? Type one of your backup codes instead (like 7KQ4-M2XP).">
          <input className="inp text-center text-xl tracking-widest" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={12} />
        </Field>
        <button className="btn-primary w-full">Sign in</button>
      </form>
      <Link href="/login" className="mt-4 text-center text-sm text-muted">
        Start again
      </Link>
    </main>
  );
}
