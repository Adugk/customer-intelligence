import { redirect } from "next/navigation";
import { ErrorNote, Field } from "@/components/ui";
import { hasAnyUser } from "@/lib/auth";
import { setupOwner } from "../actions";

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  if (await hasAnyUser()) redirect("/login");
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Create the owner account</h1>
      <p className="mt-1 mb-6 text-sm text-muted">This only appears once. After this, the app is locked behind this login.</p>
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={setupOwner} className="space-y-4">
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
    </main>
  );
}
