import Link from "next/link";
import { Card, Chip, ErrorNote, Field, NumberInput, PageHeader, Submit } from "@/components/ui";
import { CodeForm } from "@/components/two-step-forms";
import { newBackupCodes, saveScoreBands, startTwoStep, turnOffTwoStep } from "@/lib/actions/settings";
import { requireUser } from "@/lib/auth";
import { scoreAllActiveRequirements } from "@/lib/data";
import { one } from "@/lib/db";
import { fmtNum } from "@/lib/format";
import { monthlyDemand } from "@/lib/scoring";
import { getScoreBands } from "@/lib/settings";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const user = await requireUser();
  const [u, bands, scored] = await Promise.all([
    one("select totp_enabled, jsonb_array_length(recovery_codes) as codes_left from app_user where id = $1", [user.id]),
    getScoreBands(),
    scoreAllActiveRequirements(),
  ]);
  // How today's products spread over the money levels — helps choose sensible amounts.
  const values = scored
    .map((s) => {
      const md = monthlyDemand(s.req);
      return md.value != null && s.req.current_unit_price != null && s.req.price_currency === "ETB" ? md.value * Number(s.req.current_unit_price) : null;
    })
    .filter((v): v is number => v != null);
  const count = (lo: number, hi: number) => values.filter((v) => v >= lo && v < hi).length;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Settings" />
      <ErrorNote message={typeof sp.error === "string" ? sp.error : null} />
      {sp.saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Saved.</p>}
      {sp.off && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">Two-step sign-in is now off.</p>}

      <Card title="Sign-in security" action={u?.totp_enabled ? <Chip tone="ok">Two-step sign-in is on</Chip> : <Chip tone="warn">Two-step sign-in is off</Chip>}>
        {u?.totp_enabled ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              When you sign in, you also type a code from your phone app. You have <strong>{u.codes_left}</strong> unused backup codes.
            </p>
            <details>
              <summary className="cursor-pointer text-sm text-brand">Get new backup codes</summary>
              <div className="mt-3">
                <CodeForm action={newBackupCodes} button="Make new backup codes" />
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-sm text-red-700 dark:text-red-300">Turn off two-step sign-in</summary>
              <div className="mt-3">
                <CodeForm action={turnOffTwoStep} button="Turn off" danger />
              </div>
            </details>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Adds a second step when you sign in: a 6-digit code from a free phone app such as Google Authenticator or Microsoft Authenticator. Someone who learns your password still can&apos;t get in.
            </p>
            <form action={startTwoStep}>
              <button className="btn-primary">Turn on two-step sign-in</button>
            </form>
          </div>
        )}
      </Card>

      <Card title="Back up your data">
        <p className="mb-3 text-sm text-muted">
          Downloads everything in the app — customers, people, products, problems, conversations, follow-ups and deals — as one file. Keep it somewhere safe, such as a private USB stick or private cloud folder. It contains private information, including supplier names. Do this about once a month.
        </p>
        <a href="/api/export/backup" className="btn-primary">
          Download full backup
        </a>
      </Card>

      <Card title="Priority score: money levels">
        <p className="mb-3 text-sm text-muted">
          Part of each product&apos;s priority score depends on how much money it is worth each month (quantity per month × price they pay, in ETB). Set the amounts where it counts as a bigger opportunity for your business.
        </p>
        <form action={saveScoreBands} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Small → medium (ETB a month)" hint={`Below this: 4 of 20 points. Now: ${count(0, bands.b1)} products`}>
              <NumberInput name="b1" defaultValue={bands.b1} step="1000" />
            </Field>
            <Field label="Medium → large" hint={`From small→medium: 10 points. Now: ${count(bands.b1, bands.b2)} products`}>
              <NumberInput name="b2" defaultValue={bands.b2} step="1000" />
            </Field>
            <Field label="Large → very large" hint={`From medium→large: 16 points; above this: 20. Now: ${count(bands.b2, bands.b3)} + ${count(bands.b3, Infinity)} products`}>
              <NumberInput name="b3" defaultValue={bands.b3} step="1000" />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Current levels: under {fmtNum(bands.b1)} · {fmtNum(bands.b1)}–{fmtNum(bands.b2)} · {fmtNum(bands.b2)}–{fmtNum(bands.b3)} · over {fmtNum(bands.b3)} ETB. Only products with a known price in ETB are counted ({values.length} now).
          </p>
          <Submit>Save money levels</Submit>
        </form>
      </Card>

      <p className="text-sm text-muted">
        See also: <Link href="/results" className="text-brand">Results</Link> — which ways of finding customers turn into buyers.
      </p>
    </div>
  );
}
