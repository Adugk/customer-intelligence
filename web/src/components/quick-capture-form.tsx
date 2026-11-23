"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { findDuplicates, quickCapture } from "@/lib/actions/customers";
import { label, OPT } from "@/lib/options";

type Dup = { id: string; code: string; trading_name: string; reason: string };

function Opt({ list }: { list: readonly string[] }) {
  return (
    <>
      {list.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </>
  );
}

export function QuickCaptureForm({ categories, defaultFollowUp }: { categories: { id: string; name: string }[]; defaultFollowUp: string }) {
  const [state, action, pending] = useActionState(quickCapture, undefined);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function checkDups() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const n = nameRef.current?.value ?? "";
      const p = phoneRef.current?.value ?? "";
      if (n.trim().length < 3 && p.replace(/\D/g, "").length < 9) return setDups([]);
      setDups(await findDuplicates(n, p));
    }, 400);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function captureGps() {
    if (!navigator.geolocation) return setGpsMsg("Location is not available on this device.");
    setGpsMsg("Getting location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsMsg(`Saved (±${Math.round(pos.coords.accuracy)} m)`);
      },
      () => setGpsMsg("Could not get location. Check permission."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get("phone") ?? "").trim() && !String(fd.get("area") ?? "").trim() && !gps) {
      e.preventDefault();
      setClientError("Add a phone number or a location so you can find this business again.");
      return;
    }
    setClientError(null);
  }

  const error = clientError ?? state?.error;

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-4">
      {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Business</h2>
        <label className="block">
          <span className="lbl">Business name or description *</span>
          <input ref={nameRef} onChange={checkDups} name="trading_name" required maxLength={120} className="inp" placeholder="e.g. Selam Cosmetics, or 'Phone shop opposite Tana Market'" />
        </label>
        {dups.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
            <div className="font-medium text-amber-900 dark:text-amber-200">Possible duplicate — check before saving:</div>
            <ul className="mt-1 space-y-1">
              {dups.map((d) => (
                <li key={d.id}>
                  <Link href={`/customers/${d.id}`} className="text-brand underline">
                    {d.trading_name} ({d.code})
                  </Link>{" "}
                  <span className="text-muted">— {d.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="lbl">Business type *</span>
            <select name="business_type" required className="inp" defaultValue="">
              <option value="" disabled>
                — Select —
              </option>
              <Opt list={OPT.businessType} />
            </select>
          </label>
          <label className="block">
            <span className="lbl">How did we find them?</span>
            <select name="acquisition_source" className="inp" defaultValue="cold_visit">
              <Opt list={OPT.acquisitionSource} />
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="lbl">Sectors</legend>
          <div className="flex flex-wrap gap-2">
            {OPT.sectors.map((s) => (
              <label key={s} className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-brand">
                <input type="checkbox" name="sectors" value={s} className="sr-only" />
                {label(s)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Location</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="lbl">Area</span>
            <input name="area" list="areas" className="inp" placeholder="e.g. Merkato" />
            <datalist id="areas">
              {OPT.areaSuggestions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="lbl">Sub-city</span>
            <select name="sub_city" className="inp" defaultValue="">
              <option value="">— Select —</option>
              <Opt list={OPT.subCity} />
            </select>
          </label>
        </div>
        <label className="block">
          <span className="lbl">Directions</span>
          <input name="directions" className="inp" placeholder="Building, floor, shop number, landmark" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={captureGps} className="btn-ghost">
            📍 Use my current location
          </button>
          {gpsMsg && <span className="text-sm text-muted">{gpsMsg}</span>}
          <input type="hidden" name="gps_lat" value={gps?.lat ?? ""} />
          <input type="hidden" name="gps_lng" value={gps?.lng ?? ""} />
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Contact person</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="lbl">Name</span>
            <input name="contact_name" className="inp" placeholder="Name as known, e.g. Ato Dawit" />
          </label>
          <label className="block">
            <span className="lbl">Role / title</span>
            <input name="job_title" className="inp" placeholder="e.g. Owner, Manager" />
          </label>
          <label className="block">
            <span className="lbl">Phone</span>
            <input ref={phoneRef} onChange={checkDups} name="phone" type="tel" inputMode="tel" className="inp" placeholder="09… or 07…" />
            <span className="hint flex items-center gap-2">
              <input type="checkbox" name="whatsapp_same" defaultChecked id="wa" /> <label htmlFor="wa">Same number on WhatsApp</label>
            </span>
          </label>
          <label className="block">
            <span className="lbl">Telegram</span>
            <input name="telegram" className="inp" placeholder="@handle or number" />
          </label>
          <label className="block">
            <span className="lbl">Who are they in buying decisions?</span>
            <select name="decision_role" className="inp" defaultValue="unknown">
              <option value="owner">Owner</option>
              <option value="purchasing_decision_maker">Decides purchases</option>
              <option value="influencer">Influences / recommends</option>
              <option value="staff_user">Staff only</option>
              <option value="unknown">Don&apos;t know yet</option>
            </select>
          </label>
          <label className="block">
            <span className="lbl">May we follow up?</span>
            <select name="contact_permission" className="inp" defaultValue="allowed_all">
              <Opt list={OPT.contactPermission} />
            </select>
          </label>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Products they mentioned</h2>
        <label className="block">
          <span className="lbl">One product per line</span>
          <textarea name="products" rows={3} className="inp" placeholder={"e.g. 25W USB-C chargers\nPhone cases for iPhone 15"} />
          <span className="hint">Each line becomes a product requirement. Add details later.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="lbl">Category (optional, applies to all)</span>
            <select name="category_id" className="inp" defaultValue="">
              <option value="">— Select —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="interested" className="h-5 w-5 accent-[var(--brand)]" />
            They said they would consider another source
          </label>
        </div>
        <label className="block">
          <span className="lbl">What did they say? (optional)</span>
          <textarea name="note" rows={2} className="inp" placeholder="Their words, briefly" />
        </label>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Next step</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="lbl">Follow up on</span>
            <input type="date" name="follow_up_date" defaultValue={defaultFollowUp} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">How</span>
            <select name="follow_up_action" className="inp" defaultValue="call">
              <Opt list={OPT.followUpAction} />
            </select>
          </label>
          <label className="block">
            <span className="lbl">This contact was by</span>
            <select name="channel" className="inp" defaultValue="visit">
              <Opt list={OPT.interactionChannel} />
            </select>
          </label>
        </div>
        <label className="block">
          <span className="lbl">Purpose of follow-up</span>
          <input name="follow_up_purpose" className="inp" placeholder="e.g. Ask about monthly quantities" />
        </label>
      </section>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Relevance check (optional)</summary>
        <div className="mt-3 space-y-2 text-sm">
          {[
            ["rel_categories", "Sells products in categories we can realistically source"],
            ["rel_recurring", "Those products are bought or sold repeatedly"],
            ["rel_imported", "Products are likely imported or hard to find locally"],
            ["rel_stock", "Holds meaningful stock or has repeat customer traffic"],
          ].map(([n, t]) => (
            <label key={n} className="flex items-start gap-2">
              <input type="checkbox" name={n} className="mt-0.5 h-5 w-5 accent-[var(--brand)]" /> {t}
            </label>
          ))}
        </div>
      </details>

      <div className="sticky bottom-16 z-10 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button className="btn-primary w-full sm:w-auto" disabled={pending}>
          {pending ? "Saving…" : "Save business"}
        </button>
      </div>
    </form>
  );
}
