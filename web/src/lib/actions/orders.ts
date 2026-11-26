"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth";
import { one, q, tx } from "../db";
import { bool, choice, date, num, str, uuid } from "../forms";
import { fmtDate, todayISO } from "../format";
import { latestRate } from "../money";
import { OPT } from "../options";
import { allocationsWithReceipts, orderMoney, recalcOrderStatus, recalcPoStatus, setRequestStatus } from "../orders";

const go: (path: string, error?: string) => never = (path: string, error?: string) => {
  revalidatePath(path.split("?")[0]);
  redirect(`${path}${error ? `${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : ""}`);
};

// ---------- confirm an order from an accepted quote ----------

export async function createOrder(fd: FormData) {
  await requireUser();
  const qid = uuid(fd, "quote_id");
  if (!qid) redirect("/orders");
  const back: (m: string) => never = (m: string) => go(`/quotes/${qid}`, m);
  const qt = await one("select * from customer_quote where id = $1", [qid]);
  if (!qt) redirect("/orders");
  if (!["sent", "accepted"].includes(qt.status)) back("Only a quote that was sent to the customer can become an order.");
  if (qt.valid_until && String(qt.valid_until) < todayISO()) back("This price has expired. Make a new version and send it again.");
  if (await one("select 1 from customer_order where customer_quote_id = $1", [qid])) back("An order already exists for this quote.");
  const lines = await q("select l.*, r.use_type from customer_quote_line l left join sourcing_request r on r.id = l.request_id where l.quote_id = $1", [qid]);
  if (lines.some((l) => l.use_type === "unsure")) back("The use (personal or business) is not confirmed on the request. Record it before confirming the order.");
  const acceptance = choice(fd, "acceptance", OPT.acceptance);
  if (!acceptance) back("Please choose how the customer confirmed: in writing, with a deposit, or by paying in full. A verbal yes is not an order.");
  const payAmount = num(fd, "pay_amount", { min: 0 });
  if ((acceptance === "deposit" || acceptance === "full_payment") && (!payAmount || payAmount <= 0)) back("Please enter the amount the customer paid.");
  const rate = qt.currency === "ETB" ? 1 : ((await latestRate(qt.currency))?.rate ?? null);
  if (!rate) back(`Please add an exchange rate for ${qt.currency} → ETB first (Money page).`);
  const orderId = await tx(async (run) => {
    await run("update customer_quote set status = 'accepted', decided_at = now(), updated_at = now() where id = $1", [qid]);
    const o = (
      await run(
        `insert into customer_order (business_id, customer_quote_id, currency, rate_to_etb, service_fee, transport_charge, duty_charge, local_delivery_charge, other_charge, acceptance, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id, code`,
        [qt.business_id, qid, qt.currency, rate, qt.service_fee, qt.transport_charge, qt.duty_charge, qt.local_delivery_charge, qt.other_charge, acceptance, str(fd, "notes")],
      )
    )[0];
    // The agreed price and description are copied: later supplier price changes never alter a confirmed order.
    for (const l of lines) {
      await run("insert into customer_order_line (order_id, request_id, product_id, description, qty, unit_price, est_unit_cost) values ($1,$2,$3,$4,$5,$6,$7)", [
        o.id, l.request_id, l.product_id, l.description, l.qty, l.unit_price, l.est_unit_cost,
      ]);
      if (l.request_id) await setRequestStatus(run, l.request_id, "confirmed", `Order ${o.code}`);
    }
    await run("insert into order_status_history (order_id, status, note) values ($1,'confirmed',$2)", [o.id, `Confirmed: ${acceptance}`]);
    if (payAmount && payAmount > 0) {
      await run(
        `insert into payment (direction, kind, business_id, order_id, amount, currency, rate_to_etb, method, reference, paid_on, handled_by)
         values ('in',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [acceptance === "full_payment" ? "full" : "deposit", qt.business_id, o.id, payAmount, qt.currency, rate, choice(fd, "pay_method", OPT.paymentMethod),
          str(fd, "pay_reference", 120), date(fd, "pay_date") ?? todayISO(), str(fd, "handled_by", 120)],
      );
    }
    await run("update business set updated_at = now() where id = $1", [qt.business_id]);
    return o.id as string;
  });
  redirect(`/orders/${orderId}`);
}

// ---------- payments (money in from customers, money out to suppliers, refunds) ----------

export async function recordPayment(fd: FormData) {
  await requireUser();
  const orderId = uuid(fd, "order_id");
  const poId = uuid(fd, "po_id");
  const path = orderId ? `/orders/${orderId}` : poId ? `/purchase-orders/${poId}` : "/money";
  if (!orderId && !poId) redirect("/money");
  const direction = choice(fd, "direction", ["in", "out"]);
  const kind = choice(fd, "kind", OPT.paymentKind);
  const amount = num(fd, "amount", { min: 0 });
  const currency = choice(fd, "currency", OPT.currency);
  const rate = num(fd, "rate_to_etb", { min: 0 });
  const paidOn = date(fd, "paid_on") ?? todayISO();
  if (!direction || !kind || !currency) go(path, "Please fill in the kind of payment and the currency.");
  if (!amount || amount <= 0) go(path, "Please enter the amount.");
  if (!rate || rate <= 0) go(path, `Please enter the rate for ${currency} → ETB (1 if the payment is in ETB).`);
  if (paidOn > todayISO()) go(path, "The payment date can't be in the future.");
  const ref = str(fd, "reference", 120);
  const dup = await one(
    "select code from payment where coalesce(order_id::text,'') = coalesce($1,'') and coalesce(po_id::text,'') = coalesce($2,'') and amount = $3 and paid_on = $4 and coalesce(reference,'') = coalesce($5,'') and status = 'completed'",
    [orderId, poId, amount, paidOn, ref],
  );
  if (dup && !bool(fd, "allow_duplicate")) go(path, `This looks the same as payment ${dup.code} (same amount, date and reference). If it really is a second payment, tick “It is a separate payment”.`);
  let businessId: string | null = null;
  let supplierId: string | null = null;
  if (orderId) businessId = (await one("select business_id from customer_order where id = $1", [orderId]))?.business_id ?? null;
  if (poId) supplierId = (await one("select supplier_id from purchase_order where id = $1", [poId]))?.supplier_id ?? null;
  await q(
    `insert into payment (direction, kind, business_id, supplier_id, order_id, po_id, amount, currency, rate_to_etb, method, reference, paid_on, handled_by, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [direction, kind, businessId, supplierId, orderId, poId, amount, currency, rate, choice(fd, "method", OPT.paymentMethod), ref, paidOn, str(fd, "handled_by", 120), str(fd, "note", 500)],
  );
  go(path);
}

/** Payments are never deleted — a mistake is reversed and stays in the history. */
export async function reversePayment(fd: FormData) {
  await requireUser();
  const pid = uuid(fd, "payment_id");
  const ret = str(fd, "return_to");
  const pay = pid ? (await q("select p.status, o.status as order_status from payment p left join customer_order o on o.id = p.order_id where p.id = $1", [pid]))[0] : null;
  if (pay?.order_status === "closed") go(ret && ret.startsWith("/") ? ret : "/money", "This order is closed, so its payments can't be changed.");
  if (pid) await q("update payment set status = 'reversed', note = concat_ws(' · ', note, $2::text) where id = $1", [pid, `Reversed ${todayISO()}: ${str(fd, "reason", 200) ?? "no reason given"}`]);
  go(ret && ret.startsWith("/") ? ret : "/money");
}

// ---------- supplier orders (purchase orders) and allocation ----------

/**
 * Creates a supplier order from the chosen supplier quote of a sourcing case and
 * allocates units to each customer's confirmed order line. Buying without a confirmed
 * customer order needs an explicit reason (stock purchase).
 */
export async function createPurchaseOrder(fd: FormData) {
  await requireUser();
  const cid = uuid(fd, "case_id");
  if (!cid) redirect("/orders");
  const back: (m: string) => never = (m: string) => go(`/purchase-orders/new?case=${cid}`, m);
  const c = await one("select * from sourcing_case where id = $1", [cid]);
  if (!c?.chosen_quote_id) back("Choose a supplier quote in the sourcing case first.");
  const sq = await one("select * from supplier_quote where id = $1", [c.chosen_quote_id]);
  const qlines = await q("select * from supplier_quote_line where quote_id = $1 order by description", [sq!.id]);
  const orderLines = await q(
    `select ol.*, o.code as order_code, b.trading_name from customer_order_line ol join customer_order o on o.id = ol.order_id join business b on b.id = o.business_id join sourcing_request r on r.id = ol.request_id
     where r.sourcing_case_id = $1 and o.status not in ('cancelled','closed')`,
    [cid],
  );
  const already = await q("select order_line_id, sum(qty) as qty from purchase_allocation group by order_line_id");
  const allocatedBefore = new Map(already.map((a) => [a.order_line_id as string, Number(a.qty)]));
  const rate = sq!.currency === "ETB" ? 1 : (num(fd, "rate_to_etb", { min: 0 }) ?? (await latestRate(sq!.currency))?.rate ?? null);
  if (!rate) back(`Please enter the rate for ${sq!.currency} → ETB.`);
  const plan: { ql: (typeof qlines)[number]; qty: number; price: number; allocs: { olId: string; qty: number }[] }[] = [];
  for (const ql of qlines) {
    const qty = num(fd, `qty_${ql.id}`, { min: 0 }) ?? 0;
    if (qty <= 0) continue;
    const price = num(fd, `price_${ql.id}`, { min: 0 }) ?? Number(ql.unit_price);
    const allocs: { olId: string; qty: number }[] = [];
    for (const ol of orderLines) {
      const a = num(fd, `alloc_${ql.id}_${ol.id}`, { min: 0 }) ?? 0;
      if (a <= 0) continue;
      const remaining = Number(ol.qty) - (allocatedBefore.get(ol.id) ?? 0) - plan.reduce((s, p) => s + (p.allocs.find((x) => x.olId === ol.id)?.qty ?? 0), 0);
      if (a > remaining + 1e-9) back(`${ol.trading_name} (${ol.order_code}) needs only ${Math.max(0, remaining)} more, but you entered ${a}.`);
      allocs.push({ olId: ol.id, qty: a });
    }
    const total = allocs.reduce((s, x) => s + x.qty, 0);
    if (total > qty + 1e-9) back(`You allocated ${total} units but are only buying ${qty}. Allocate no more than you buy.`);
    plan.push({ ql, qty, price, allocs });
  }
  if (!plan.length) back("Please enter how many units to buy.");
  const totalAllocated = plan.reduce((s, p) => s + p.allocs.reduce((t, x) => t + x.qty, 0), 0);
  const stockReason = str(fd, "stock_reason", 300);
  if (totalAllocated === 0 && !stockReason) back("No customer order is allocated. A supplier order needs a confirmed customer order — or write why you are buying for stock.");
  const poId = await tx(async (run) => {
    const po = (
      await run(
        `insert into purchase_order (supplier_id, sourcing_case_id, supplier_quote_id, currency, rate_to_etb, expected_date, payment_terms, status, notes, order_date)
         values ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9) returning id`,
        [sq!.supplier_id, cid, sq!.id, sq!.currency, rate, date(fd, "expected_date"), sq!.payment_terms, [stockReason && `Bought for stock: ${stockReason}`, str(fd, "notes")].filter(Boolean).join("\n") || null, todayISO()],
      )
    )[0];
    const touchedOrders = new Set<string>();
    for (const p of plan) {
      const pl = (
        await run("insert into purchase_order_line (po_id, product_id, offer_id, description, qty, unit_price) values ($1,$2,$3,$4,$5,$6) returning id", [
          po.id, p.ql.product_id, p.ql.offer_id, p.ql.description, p.qty, p.price,
        ])
      )[0];
      for (const a of p.allocs) {
        await run("insert into purchase_allocation (po_line_id, order_line_id, qty) values ($1,$2,$3)", [pl.id, a.olId, a.qty]);
        touchedOrders.add(orderLines.find((o) => o.id === a.olId)!.order_id);
      }
    }
    for (const oid of touchedOrders) await recalcOrderStatus(oid, run, "Supplier order created");
    return po.id as string;
  });
  redirect(`/purchase-orders/${poId}`);
}

export async function setPoStatus(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "po_id");
  const to = choice(fd, "to", ["sent", "confirmed_by_supplier", "closed", "cancelled"]);
  if (!id || !to) redirect("/orders");
  const po = await one("select status from purchase_order where id = $1", [id]);
  const got = await one("select coalesce(sum(rl.qty_received),0) as n from receipt_line rl join purchase_order_line pl on pl.id = rl.po_line_id where pl.po_id = $1", [id]);
  if (to === "cancelled" && Number(got?.n) > 0) go(`/purchase-orders/${id}`, "Goods were already received on this order, so it can't be cancelled. Record a claim or return instead.");
  if (to === "closed" && !["received", "part_received"].includes(po?.status)) go(`/purchase-orders/${id}`, "Close a supplier order after the goods are received.");
  await tx(async (run) => {
    await run("update purchase_order set status = $2, updated_at = now() where id = $1", [id, to]);
    if (to === "cancelled") {
      const orders = await run("select distinct ol.order_id from purchase_allocation a join purchase_order_line pl on pl.id = a.po_line_id join customer_order_line ol on ol.id = a.order_line_id where pl.po_id = $1", [id]);
      await run("delete from purchase_allocation a using purchase_order_line pl where pl.id = a.po_line_id and pl.po_id = $1", [id]);
      for (const o of orders) await recalcOrderStatus(o.order_id, run, "Supplier order cancelled");
    }
  });
  go(`/purchase-orders/${id}`);
}

/** Change how many units of a supplier-order line go to a customer order line (0 removes). */
export async function saveAllocation(fd: FormData) {
  await requireUser();
  const poId = uuid(fd, "po_id");
  const plId = uuid(fd, "po_line_id");
  const olId = uuid(fd, "order_line_id");
  const qty = num(fd, "qty", { min: 0 }) ?? 0;
  if (!poId || !plId || !olId) redirect("/orders");
  const path = `/purchase-orders/${poId}`;
  const pl = await one("select * from purchase_order_line where id = $1 and po_id = $2", [plId, poId]);
  const ol = await one("select * from customer_order_line where id = $1", [olId]);
  if (!pl || !ol) go(path, "Not found.");
  const [others, olOthers, rec] = await Promise.all([
    one("select coalesce(sum(qty),0) as n from purchase_allocation where po_line_id = $1 and order_line_id <> $2", [plId, olId]),
    one("select coalesce(sum(qty),0) as n from purchase_allocation where order_line_id = $1 and po_line_id <> $2", [olId, plId]),
    one("select count(*)::int as receipts, coalesce(sum(qty_received - qty_damaged - qty_wrong),0) as good from receipt_line where po_line_id = $1", [plId]),
  ]);
  // Never allocate more than was bought — or, once goods are received, more than arrived in good condition.
  const limit = rec!.receipts > 0 ? Number(rec!.good) : Number(pl.qty);
  if (Number(others!.n) + qty > limit + 1e-9) go(path, `Only ${limit - Number(others!.n)} units are left to allocate on this line (${rec!.receipts > 0 ? "good units received" : "units ordered"}: ${limit}).`);
  if (Number(olOthers!.n) + qty > Number(ol.qty) + 1e-9) go(path, `The customer ordered ${ol.qty}; ${olOthers!.n} are already allocated from other supplier orders.`);
  await tx(async (run) => {
    if (qty > 0) await run("insert into purchase_allocation (po_line_id, order_line_id, qty) values ($1,$2,$3) on conflict (po_line_id, order_line_id) do update set qty = excluded.qty", [plId, olId, qty]);
    else await run("delete from purchase_allocation where po_line_id = $1 and order_line_id = $2", [plId, olId]);
    await recalcOrderStatus(ol.order_id, run, "Allocation changed");
  });
  go(path);
}

// ---------- receiving and inspection ----------

export async function recordReceipt(fd: FormData) {
  await requireUser();
  const poId = uuid(fd, "po_id");
  if (!poId) redirect("/orders");
  const path = `/purchase-orders/${poId}`;
  const po = await one("select status from purchase_order where id = $1", [poId]);
  if (!po || ["draft", "cancelled", "closed"].includes(po.status)) go(path, "Mark the supplier order as sent before recording goods received.");
  const lines = await q("select * from purchase_order_line where po_id = $1", [poId]);
  const entries = lines
    .map((l) => ({
      l, got: num(fd, `got_${l.id}`, { min: 0 }) ?? 0, damaged: num(fd, `damaged_${l.id}`, { min: 0 }) ?? 0, wrong: num(fd, `wrong_${l.id}`, { min: 0 }) ?? 0,
      inspection: choice(fd, `inspection_${l.id}`, OPT.inspection) ?? "passed", serial: str(fd, `serial_${l.id}`, 500), notes: str(fd, `notes_${l.id}`, 500),
    }))
    .filter((e) => e.got > 0 || e.damaged > 0 || e.wrong > 0);
  if (!entries.length) go(path, "Please enter how many units arrived.");
  for (const e of entries) if (e.damaged + e.wrong > e.got) go(path, `${e.l.description}: damaged + wrong can't be more than the units that arrived.`);
  const receivedOn = date(fd, "received_on") ?? todayISO();
  if (receivedOn > todayISO()) go(path, "The date received can't be in the future.");
  await tx(async (run) => {
    const gr = (await run("insert into goods_receipt (po_id, received_on, location, received_by, notes) values ($1,$2,$3,$4,$5) returning id", [
      poId, receivedOn, str(fd, "location", 200), str(fd, "received_by", 120), str(fd, "notes", 1000),
    ]))[0];
    for (const e of entries) {
      await run("insert into receipt_line (receipt_id, po_line_id, qty_received, qty_damaged, qty_wrong, inspection, serial_batch, notes) values ($1,$2,$3,$4,$5,$6,$7,$8)", [
        gr.id, e.l.id, e.got, e.damaged, e.wrong, e.inspection, e.serial, e.notes,
      ]);
    }
    await recalcPoStatus(poId, run);
    const orders = await run("select distinct ol.order_id from purchase_allocation a join purchase_order_line pl on pl.id = a.po_line_id join customer_order_line ol on ol.id = a.order_line_id where pl.po_id = $1", [poId]);
    for (const o of orders) await recalcOrderStatus(o.order_id, run, "Goods received");
  });
  go(path);
}

// ---------- delivery to the customer ----------

export async function recordDelivery(fd: FormData) {
  await requireUser();
  const oid = uuid(fd, "order_id");
  if (!oid) redirect("/orders");
  const path = `/orders/${oid}`;
  const o = await one("select * from customer_order where id = $1", [oid]);
  if (!o || ["cancelled", "closed"].includes(o.status)) go(path, "This order is closed or cancelled.");
  const lines = await q("select * from customer_order_line where order_id = $1", [oid]);
  const poLines = (await q("select distinct a.po_line_id from purchase_allocation a where a.order_line_id = any($1::uuid[])", [lines.map((l) => l.id)])).map((r) => r.po_line_id as string);
  const got = new Map<string, number>();
  for (const a of await allocationsWithReceipts(poLines)) if (a.order_id === oid) got.set(a.order_line_id, (got.get(a.order_line_id) ?? 0) + a.received);
  const day = date(fd, "delivered_on") ?? todayISO();
  if (day > todayISO()) go(path, "The delivery date can't be in the future.");
  const plan: { id: string; add: number }[] = [];
  for (const l of lines) {
    const add = num(fd, `deliver_${l.id}`, { min: 0 }) ?? 0;
    if (add <= 0) continue;
    if (Number(l.delivered_qty) + add > Number(l.qty) + 1e-9) go(path, `${l.description}: that is more than the customer ordered.`);
    if (Number(l.delivered_qty) + add > (got.get(l.id) ?? 0) + 1e-9) go(path, `${l.description}: only ${got.get(l.id) ?? 0} have arrived in good condition for this order, so you can't deliver more.`);
    plan.push({ id: l.id, add });
  }
  if (!plan.length) go(path, "Please enter how many units you delivered.");
  const note = [str(fd, "note", 500), bool(fd, "customer_confirmed") ? "Customer confirmed they received it" : null].filter(Boolean).join(" · ");
  await tx(async (run) => {
    for (const p of plan) await run("update customer_order_line set delivered_qty = delivered_qty + $2 where id = $1", [p.id, p.add]);
    await run("update customer_order set delivered_on = $2, delivery_note = concat_ws(E'\\n', delivery_note, $3::text), updated_at = now() where id = $1", [oid, day, `${fmtDate(day)}: ${note || "delivered"}`]);
    await recalcOrderStatus(oid, run, note || "Delivery recorded");
    const now = (await run("select status from customer_order where id = $1", [oid]))[0];
    if (now.status === "delivered") {
      for (const l of lines) if (l.request_id) await setRequestStatus(run, l.request_id, "completed", "Delivered");
      // A completed order updates the customer's purchase history on the matching product need.
      for (const l of lines) {
        const req = l.request_id ? (await run("select requirement_id from sourcing_request where id = $1", [l.request_id]))[0] : null;
        if (req?.requirement_id) {
          await run(
            "update product_requirement set last_purchase_date = $2, last_purchase_qty = $3, pattern_basis = coalesce(pattern_basis, 'documented'), next_purchase_date = null, updated_at = now() where id = $1",
            [req.requirement_id, day, l.qty],
          );
        }
      }
    }
  });
  go(path);
}

// ---------- cancel and close ----------

export async function cancelOrder(fd: FormData) {
  await requireUser();
  const oid = uuid(fd, "order_id");
  if (!oid) redirect("/orders");
  const path = `/orders/${oid}`;
  const reason = str(fd, "reason", 500);
  if (!reason) go(path, "Please write why the order is cancelled.");
  const o = await one("select * from customer_order where id = $1", [oid]);
  if (!o || ["cancelled", "closed", "delivered", "part_delivered"].includes(o.status)) go(path, "This order can't be cancelled at this stage. Record a return or claim instead.");
  const alloc = await one("select count(*)::int as n from purchase_allocation a join customer_order_line ol on ol.id = a.order_line_id where ol.order_id = $1", [oid]);
  if (alloc!.n > 0) go(path, "Units for this order are already allocated on a supplier order. Remove those allocations first (they become spare stock), then cancel.");
  const money = await orderMoney(oid);
  const keep = num(fd, "non_refundable_amount", { min: 0 }) ?? 0;
  const keepEtb = keep * money.rate;
  if (keepEtb > money.paidEtb + 0.5) go(path, "You can't keep more than the customer has paid.");
  if (keep > 0 && !str(fd, "non_refundable_reason", 300)) go(path, "Please write which agreed terms allow keeping that amount.");
  await tx(async (run) => {
    await run("update customer_order set status = 'cancelled', cancelled_reason = $2, non_refundable_amount = $3, non_refundable_reason = $4, updated_at = now() where id = $1", [
      oid, reason, keep, str(fd, "non_refundable_reason", 300),
    ]);
    await run("insert into order_status_history (order_id, status, note) values ($1,'cancelled',$2)", [oid, reason]);
    const reqs = await run("select request_id from customer_order_line where order_id = $1 and request_id is not null", [oid]);
    for (const r of reqs) await setRequestStatus(run, r.request_id, "cancelled", `Order cancelled: ${reason}`);
  });
  go(path);
}

export async function closeOrder(fd: FormData) {
  await requireUser();
  const oid = uuid(fd, "order_id");
  if (!oid) redirect("/orders");
  const path = `/orders/${oid}`;
  const o = await one("select status from customer_order where id = $1", [oid]);
  if (o?.status !== "delivered") go(path, "Close an order after it is fully delivered.");
  const m = await orderMoney(oid);
  if (m.owedEtb > 1) go(path, "The customer still owes money on this order. Record the payment first.");
  if (m.unknown.length && !bool(fd, "confirm_costs")) go(path, `Some costs are not recorded yet: ${m.unknown.join(", ")}. Record them, or tick that there were none.`);
  await tx(async (run) => {
    await run("update customer_order set status = 'closed', costs_final = true, feedback = $2, updated_at = now() where id = $1", [oid, str(fd, "feedback", 1000)]);
    await run("insert into order_status_history (order_id, status, note) values ($1,'closed',$2)", [oid, m.unknown.length ? `Closed; owner confirmed no further costs (${m.unknown.join(", ")})` : "Closed"]);
  });
  go(path);
}

// ---------- expenses and how they are shared between orders ----------

export async function addExpense(fd: FormData) {
  await requireUser();
  const poId = uuid(fd, "po_id");
  const orderId = uuid(fd, "order_id");
  const path = poId ? `/purchase-orders/${poId}` : orderId ? `/orders/${orderId}` : "/money";
  if (!poId && !orderId) redirect("/money");
  const category = choice(fd, "category", OPT.expenseCategory);
  const amount = num(fd, "amount", { min: 0 });
  const currency = choice(fd, "currency", OPT.currency);
  const rate = num(fd, "rate_to_etb", { min: 0 });
  const method = poId ? (choice(fd, "allocation_method", OPT.allocationMethod) ?? "quantity") : "manual";
  if (!category || !currency) go(path, "Please choose the kind of cost and currency.");
  if (!amount || amount <= 0) go(path, "Please enter the amount.");
  if (!rate || rate <= 0) go(path, `Please enter the rate for ${currency} → ETB (1 for ETB).`);
  const totalEtb = amount * rate;
  let shares: { order_id: string; etb: number; basis: string }[] = [];
  if (orderId) shares = [{ order_id: orderId, etb: totalEtb, basis: "This order only" }];
  else {
    const rows = await q(
      `select ol.order_id, sum(a.qty) as qty, sum(a.qty * pl.unit_price) as value from purchase_allocation a
       join purchase_order_line pl on pl.id = a.po_line_id join customer_order_line ol on ol.id = a.order_line_id
       where pl.po_id = $1 group by ol.order_id`,
      [poId],
    );
    if (!rows.length) go(path, "No customer orders are allocated on this supplier order, so the cost can't be shared out.");
    if (method === "manual") {
      shares = rows.map((r) => ({ order_id: r.order_id, etb: num(fd, `manual_${r.order_id}`, { min: 0 }) ?? 0, basis: "Typed in by hand" }));
      const sum = shares.reduce((s, x) => s + x.etb, 0);
      if (Math.abs(sum - totalEtb) > 1) go(path, `The amounts typed in add up to ${sum.toFixed(2)} ETB, but the cost is ${totalEtb.toFixed(2)} ETB.`);
    } else {
      const weight = (r: (typeof rows)[number]) => (method === "quantity" ? Number(r.qty) : method === "value" ? Number(r.value) : 1);
      const total = rows.reduce((s, r) => s + weight(r), 0) || 1;
      shares = rows.map((r) => ({ order_id: r.order_id, etb: (totalEtb * weight(r)) / total, basis: `${method}: ${weight(r)} of ${total}` }));
    }
  }
  await tx(async (run) => {
    const e = (
      await run(
        "insert into expense (category, description, amount, currency, rate_to_etb, incurred_on, po_id, order_id, allocation_method, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
        [category, str(fd, "description", 300), amount, currency, rate, date(fd, "incurred_on") ?? todayISO(), poId, orderId, method, str(fd, "note", 500)],
      )
    )[0];
    for (const s of shares) if (s.etb > 0) await run("insert into expense_allocation (expense_id, order_id, amount_etb, basis) values ($1,$2,$3,$4)", [e.id, s.order_id, s.etb, s.basis]);
  });
  go(path);
}

export async function deleteExpense(fd: FormData) {
  await requireUser();
  const id = uuid(fd, "expense_id");
  const ret = str(fd, "return_to");
  if (id) {
    const e = await one("select e.id, e.order_id, (select status from customer_order where id = e.order_id) as st from expense e where e.id = $1", [id]);
    if (e?.st === "closed") go(ret ?? "/money", "This order is closed; its costs can't be changed.");
    await q("delete from expense where id = $1", [id]);
  }
  go(ret && ret.startsWith("/") ? ret : "/money");
}
