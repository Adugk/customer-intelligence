import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { CodeForm } from "@/components/two-step-forms";
import { confirmTwoStep } from "@/lib/actions/settings";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { otpauthUrl } from "@/lib/totp";

export default async function TwoStepSetupPage() {
  const user = await requireUser();
  const u = await one("select totp_secret, totp_enabled from app_user where id = $1", [user.id]);
  if (!u?.totp_secret) redirect("/settings");
  const url = otpauthUrl(u.totp_secret, user.email);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  const spaced = String(u.totp_secret).replace(/(.{4})/g, "$1 ").trim();

  return (
    <div className="max-w-xl">
      <PageHeader title="Turn on two-step sign-in" back={{ href: "/settings", label: "Settings" }} />
      <Card>
        <ol className="space-y-5 text-sm">
          <li>
            <div className="font-semibold">1. Install an authenticator app on your phone</div>
            <p className="text-muted">For example Google Authenticator or Microsoft Authenticator (both free).</p>
          </li>
          <li>
            <div className="font-semibold">2. In the app, add an account and scan this code</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="mt-2 rounded-lg bg-white p-2" />
            <p className="mt-2 text-muted">Can&apos;t scan? Type this key instead:</p>
            <p className="mt-1 font-mono text-base break-all">{spaced}</p>
          </li>
          <li>
            <div className="mb-2 font-semibold">3. Type the 6-digit code the app shows</div>
            {u.totp_enabled ? <p className="text-muted">Two-step sign-in is already on.</p> : <CodeForm action={confirmTwoStep} button="Turn on" />}
          </li>
        </ol>
      </Card>
    </div>
  );
}
