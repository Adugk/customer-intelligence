"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { createSupplier, findSupplierDuplicates } from "@/lib/actions/suppliers";
import { label, OPT } from "@/lib/options";

type Dup = { id: string; code: string; display_name: string; reason: string };

export function NewSupplierForm() {
  const [state, action, pending] = useActionState(createSupplier, undefined);
  const [dups, setDups] = useState<Dup[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function checkDups() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const n = nameRef.current?.value ?? "";
      const p = phoneRef.current?.value ?? "";
      if (n.trim().length < 3 && p.replace(/\D/g, "").length < 7) return setDups([]);
      setDups(await findSupplierDuplicates(n, p));
    }, 400);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <form action={action} className="space-y-4">
      {state?.error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{state.error}</p>}
      <section className="card space-y-3 p-4">
        <label className="block">
          <span className="lbl">Supplier name *</span>
          <input ref={nameRef} onChange={checkDups} name="display_name" required maxLength={150} className="inp" placeholder="The name you use every day, e.g. Al Noor Electronics" />
        </label>
        {dups.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
            <div className="font-medium text-amber-900 dark:text-amber-200">This supplier may already exist:</div>
            <ul className="mt-1 space-y-1">
              {dups.map((d) => (
                <li key={d.id}>
                  <Link href={`/suppliers/${d.id}`} className="text-brand underline">
                    {d.display_name} ({d.code})
                  </Link>{" "}
                  <span className="text-muted">— {d.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="lbl">Type *</span>
            <select name="supplier_type" required className="inp" defaultValue="">
              <option value="" disabled>
                — Select —
              </option>
              {OPT.supplierType.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="lbl">Country *</span>
            <input name="country" required className="inp" list="countries" defaultValue="United Arab Emirates" />
            <datalist id="countries">
              {OPT.supplierCountry.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="lbl">City</span>
            <input name="city" className="inp" placeholder="e.g. Dubai — Deira" />
          </label>
        </div>
        <fieldset>
          <legend className="lbl">What they sell</legend>
          <div className="flex flex-wrap gap-2">
            {OPT.sectors.map((s) => (
              <label key={s} className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand">
                <input type="checkbox" name="categories" value={s} className="sr-only" />
                {label(s)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="lbl">Brands they sell</span>
          <input name="brands" className="inp" placeholder="e.g. Samsung, Anker, Baseus" />
        </label>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">How to reach them</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="lbl">Person you spoke to</span>
            <input name="contact_name" className="inp" />
          </label>
          <label className="block">
            <span className="lbl">Their position</span>
            <input name="contact_position" className="inp" placeholder="e.g. Sales manager" />
          </label>
          <label className="block">
            <span className="lbl">Phone</span>
            <input ref={phoneRef} onChange={checkDups} name="phone" type="tel" inputMode="tel" className="inp" placeholder="+971 …" />
          </label>
          <label className="block">
            <span className="lbl">WhatsApp</span>
            <input name="whatsapp" type="tel" inputMode="tel" className="inp" placeholder="+971 …" />
          </label>
          <label className="block">
            <span className="lbl">Email</span>
            <input name="email" type="email" className="inp" />
          </label>
          <label className="block">
            <span className="lbl">Website or online shop</span>
            <input name="website" className="inp" />
          </label>
          <label className="block">
            <span className="lbl">Their prices are in</span>
            <select name="currency" className="inp" defaultValue="AED">
              {OPT.currency.map((c) => (
                <option key={c} value={c}>
                  {c === "other" ? "Other" : c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="lbl">Today you talked by</span>
            <select name="channel" className="inp" defaultValue="call">
              {OPT.supplierChannel.map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="lbl">Notes</span>
          <textarea name="notes" rows={2} className="inp" placeholder="Anything worth remembering" />
        </label>
      </section>
      <p className="text-sm text-muted">The supplier starts as “Not checked”. Mark them verified only after checking their licence and identity.</p>
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>
        {pending ? "Saving…" : "Save supplier"}
      </button>
    </form>
  );
}
