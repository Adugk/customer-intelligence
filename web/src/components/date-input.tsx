"use client";

import { useState } from "react";
import { fmtEthiopian } from "@/lib/format";

/** Date picker that shows the Ethiopian calendar date under the box as you choose. */
export function EcDateInput({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [v, setV] = useState(defaultValue);
  return (
    <>
      <input className="inp" name={name} type="date" value={v} onChange={(e) => setV(e.target.value)} />
      <span className="hint block">{v ? `Ethiopian: ${fmtEthiopian(v)}` : " "}</span>
    </>
  );
}
