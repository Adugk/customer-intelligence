import Link from "next/link";
import type { Row } from "@/lib/db";
import { updateFollowUp } from "@/lib/actions/activity";
import { displayPhone, fmtDate, relDays, todayISO } from "@/lib/format";
import { label } from "@/lib/options";

export function FollowUpRow({ f, returnTo, showBusiness = true }: { f: Row; returnTo: string; showBusiness?: boolean }) {
  const today = todayISO();
  const overdue = f.status === "open" && String(f.due_date) < today;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`font-semibold tabular-nums ${overdue ? "text-red-700 dark:text-red-300" : ""}`}>{fmtDate(f.due_date)}</span>
          <span className="text-xs text-muted">{relDays(String(f.due_date))}</span>
          <span className="chip bg-surface-2 text-muted">{label(f.action_type)}</span>
          {f.origin !== "manual" && <span className="chip bg-brand/10 text-brand">{label(f.origin)}</span>}
        </div>
        <div className="mt-0.5 text-sm">{f.purpose}</div>
        <div className="text-xs text-muted">
          {showBusiness && (
            <Link href={`/customers/${f.business_id}`} className="font-medium text-ink hover:underline">
              {f.trading_name}
            </Link>
          )}
          {f.contact_name && <> · {f.contact_name}</>}
          {f.phone_primary && (
            <>
              {" "}
              · <a href={`tel:${f.phone_primary}`} className="text-brand">{displayPhone(f.phone_primary)}</a>
            </>
          )}
        </div>
      </div>
      {f.status === "open" && (
        <div className="flex shrink-0 gap-2">
          <Link href={`/customers/${f.business_id}/log?follow_up=${f.id}`} className="btn-primary min-h-9 px-3 text-xs">
            Done — record it
          </Link>
          <form action={updateFollowUp}>
            <input type="hidden" name="follow_up_id" value={f.id} />
            <input type="hidden" name="op" value="snooze" />
            <input type="hidden" name="days" value="3" />
            <input type="hidden" name="return_to" value={returnTo} />
            <button className="btn-ghost min-h-9 px-3 text-xs">+3 days</button>
          </form>
          <form action={updateFollowUp}>
            <input type="hidden" name="follow_up_id" value={f.id} />
            <input type="hidden" name="op" value="cancel" />
            <input type="hidden" name="return_to" value={returnTo} />
            <button className="btn-ghost min-h-9 px-3 text-xs" title="Cancel this follow-up" aria-label="Cancel this follow-up">
              ✕
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
