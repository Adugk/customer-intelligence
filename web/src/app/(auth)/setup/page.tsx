import { redirect } from "next/navigation";
import { ErrorNote, Field } from "@/components/ui";
import { hasAnyUser } from "@/lib/auth";
import { setupOwner, setupRequiresCode } from "../actions";

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  if (await hasAnyUser()) redirect("/login");
  const sp = await searchParams;
  const mode = await setupRequiresCode();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Create the owner account</h1>
      <p className="mt-1 mb-6 text-sm text-muted">This only appears once. After this, the app is locked behind this login.</p>
      {mode === "missing" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Setup is locked. Add a <code>SETUP_CODE</code> environment variable in the hosting settings, redeploy, then come back here.
        </p>
      ) : (
        <>
          <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
          <form action={setupOwner} className="space-y-4">
            {mode === "required" && (
              <Field label="Setup code" hint="The SETUP_CODE you added in the hosting settings.">
                <input className="inp" name="setup_code" type="password" autoComplete="off" required />
              </Field>
            )}
            <Field label="Email">
              <input className="inp" name="email" type="email" autoComplete="username" required />
            </Field>
            <Field label="Password" hint="At least 10 characters.">
              <input className="inp" name="password" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="Confirm password">
              <input className="inp" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
            </Field>
            <button className="btn-primary w-full">Create account</button>
          </form>
        </>
      )}
    </main>
  );
}
