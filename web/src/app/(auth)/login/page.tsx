import { redirect } from "next/navigation";
import { ErrorNote, Field } from "@/components/ui";
import { getUser, hasAnyUser } from "@/lib/auth";
import { login } from "../actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getUser()) redirect("/");
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Customer purchasing intelligence</p>
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      <form action={login} className="space-y-4">
        <Field label="Email">
          <input className="inp" name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label="Password">
          <input className="inp" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <button className="btn-primary w-full">Sign in</button>
      </form>
    </main>
  );
}
