import type { Row } from "./db";

export const CHARGE_LABELS: [string, string][] = [
  ["service_fee", "Service fee"],
  ["transport_charge", "Transport (estimate)"],
  ["duty_charge", "Customs, tax and clearance (estimate)"],
  ["local_delivery_charge", "Local delivery"],
  ["other_charge", "Other"],
];

/** Customer total and our private estimate for a quote. */
export function quoteTotals(qt: Row, lines: Row[]) {
  const goods = lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0);
  const charges = CHARGE_LABELS.reduce((s, [k]) => s + Number(qt[k] ?? 0), 0);
  const total = goods + charges;
  const rate = qt.cost_rate_to_quote != null ? Number(qt.cost_rate_to_quote) : null;
  const haveCost = lines.length > 0 && lines.every((l) => l.est_unit_cost != null) && rate != null;
  // Pass-through charges (transport, duty, delivery, other) are expected to cost about what we charge.
  const passThrough = Number(qt.transport_charge ?? 0) + Number(qt.duty_charge ?? 0) + Number(qt.local_delivery_charge ?? 0) + Number(qt.other_charge ?? 0);
  const estCost = haveCost ? lines.reduce((s, l) => s + Number(l.qty) * Number(l.est_unit_cost) * rate!, 0) + passThrough : null;
  return { goods, charges, total, estCost, estMargin: estCost != null ? total - estCost : null };
}
