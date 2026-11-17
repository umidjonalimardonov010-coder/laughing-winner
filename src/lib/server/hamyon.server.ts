// HamyonAPI automatic deposits: the bot creates a payment (HamyonAPI gives the card), HamyonAPI watches
// the card and calls /api/public/hamyon/complete with paid or cancel. Paid → the deposit goes to the
// bookmaker through the cashdesk (or to an admin when the cashdesk is not connected). A sweep asks
// /payment/status for open payments in case a callback never arrives.
import { createHash, timingSafeEqual } from "node:crypto";
import { maybeOne, sql } from "./db.server";
import { cached, clearCache } from "./memo.server";
import { getSettings } from "./settings.server";
import { TX_COLS, type TxRow } from "./tx.server";
import { escapeHtml, telegramMode, tg } from "./telegram.server";
import { inBackground, notifyAdminsNewRequest } from "./notify.server";
import { loadCashdeskCreds } from "./cashdesk-config.server";
import { approveRequest } from "./requests.server";
import { rejectBotRequest } from "./exchange.server";
import { depositSplit } from "@/lib/exchange-rules";
import { formatSom } from "@/lib/format";
import { cardDigits, isAmountBusyError, nextFreeAmount, payMinutes, payText, signSource, type HamyonCallback } from "@/lib/hamyon-rules";

const BASE = "https://hamyon-api.uz";
type L = "uz" | "ru";

export type HamyonCreds = { shopId: string; shopKey: string };

const KEY_ID = "hamyon_shop_id";
const KEY_KEY = "hamyon_shop_key";

/** Admin-panel values over HAMYON_SHOP_ID / HAMYON_SHOP_KEY env vars. Never sent to the browser. */
export async function hamyonPanelValues(): Promise<{ shopId: string; shopKey: string }> {
  const rows = await sql<{ key: string; value: string }[]>`select key, value from public.app_settings where key in (${KEY_ID}, ${KEY_KEY})`;
  const get = (k: string) => rows.find((r) => r.key === k)?.value?.trim() ?? "";
  return { shopId: get(KEY_ID), shopKey: get(KEY_KEY) };
}

export function loadHamyonCreds(): Promise<HamyonCreds | null> {
  return cached("hamyon-creds", 10_000, async () => {
    let panel = { shopId: "", shopKey: "" };
    try {
      panel = await hamyonPanelValues();
    } catch (e) {
      console.error("[hamyon] reading panel values failed", e);
    }
    const shopId = panel.shopId || process.env["HAMYON_SHOP_ID"]?.trim() || "";
    const shopKey = panel.shopKey || process.env["HAMYON_SHOP_KEY"]?.trim() || "";
    return shopId && shopKey ? { shopId, shopKey } : null;
  });
}

/** `undefined` keeps the stored value, "" clears it. */
export async function saveHamyonCreds(v: { shopId?: string | undefined; shopKey?: string | undefined }) {
  await sql.begin(async (tx) => {
    for (const [key, value] of [
      [KEY_ID, v.shopId],
      [KEY_KEY, v.shopKey],
    ] as const) {
      if (value === undefined) continue;
      await tx`insert into public.app_settings (key, value, updated_at) values (${key}, ${value.trim()}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()`;
    }
  });
  clearCache("hamyon-");
}

// ---------- HamyonAPI calls ----------
async function post(path: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: `HamyonAPI [${res.status}]: ${text.slice(0, 200)}` };
  }
  if (!res.ok && !json["error"]) json["error"] = `HamyonAPI [${res.status}]`;
  return json;
}

type Created = { paymentId: string; card: string; expiresIn: number };

export async function hamyonCreate(c: HamyonCreds, amount: number, orderId: string): Promise<Created | { error: string }> {
  const r = await post("/payment/create", { shop_id: c.shopId, shop_key: c.shopKey, amount: String(amount), order_id: orderId });
  if (r["error"] || !r["payment_id"] || !r["card"]) return { error: String(r["error"] ?? r["message"] ?? "no payment") };
  return { paymentId: String(r["payment_id"]), card: String(r["card"]), expiresIn: Number(r["expires_in"]) || 300 };
}

export async function hamyonStatus(paymentId: string): Promise<{ status: string; amount: number } | null> {
  try {
    const res = await fetch(`${BASE}/payment/status?payment_id=${encodeURIComponent(paymentId)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return j["status"] ? { status: String(j["status"]).toLowerCase(), amount: Number(j["amount"]) } : null;
  } catch {
    return null;
  }
}

export async function hamyonCancel(c: HamyonCreds, paymentId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await post("/payment/cancel", { payment_id: paymentId, shop_key: c.shopKey });
  return r["error"] ? { ok: false, error: String(r["error"]) } : { ok: true };
}

export function validSign(c: HamyonCreds, cb: HamyonCallback): boolean {
  const calc = createHash("md5").update(signSource(c.shopId, cb.paymentId, cb.amount, c.shopKey)).digest("hex");
  const a = Buffer.from(calc);
  const b = Buffer.from(cb.sign);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Deposit lifecycle ----------
type PayRow = TxRow & { pay_id: string | null; pay_card: string | null; pay_state: string | null; pay_msg_id: string | null; pay_expire_at: string | null; lang: string | null };

const PAY_COLS = () => sql`to_jsonb(t) ->> 'pay_id' as pay_id, to_jsonb(t) ->> 'pay_card' as pay_card,
  to_jsonb(t) ->> 'pay_state' as pay_state, to_jsonb(t) ->> 'pay_msg_id' as pay_msg_id,
  to_jsonb(t) ->> 'pay_expire_at' as pay_expire_at, (select lang from public.tg_users u where u.id = t.user_id) as lang`;

async function loadPay(where: { id?: string; payId?: string }): Promise<PayRow | null> {
  if (where.id) {
    if (!/^[0-9a-f-]{36}$/i.test(where.id)) return null;
    return maybeOne(sql<PayRow[]>`select ${TX_COLS()}, ${PAY_COLS()} from public.transactions t where t.id = ${where.id}`);
  }
  return maybeOne(sql<PayRow[]>`select ${TX_COLS()}, ${PAY_COLS()} from public.transactions t where to_jsonb(t) ->> 'pay_id' = ${where.payId ?? ""}`);
}

const TXT = {
  uz: {
    cancelBtn: "❌ Bekor qilish",
    paidMark: "✅ To'lov qabul qilindi",
    timeoutMark: "⌛ Vaqt tugadi",
    cancelMark: "❌ Bekor qilindi",
    paidWait: (n: number) => `✅ <b>To'lov qabul qilindi!</b>\nSo'rov #${n}. Hisobingiz tez orada to'ldiriladi va sizga xabar keladi.`,
    timeout: (n: number) => `⌛ <b>To'lov vaqti tugadi.</b>\nSo'rov #${n} bekor qilindi. Qaytadan «📮 Hisob to'ldirish» ni bosing.`,
    cancelled: (n: number) => `❌ So'rov #${n} bekor qilindi.`,
    alreadyPaid: "Bu to'lov allaqachon qabul qilingan.",
  },
  ru: {
    cancelBtn: "❌ Отменить",
    paidMark: "✅ Оплата получена",
    timeoutMark: "⌛ Время вышло",
    cancelMark: "❌ Отменено",
    paidWait: (n: number) => `✅ <b>Оплата получена!</b>\nЗаявка #${n}. Счёт скоро будет пополнен, придёт сообщение.`,
    timeout: (n: number) => `⌛ <b>Время оплаты истекло.</b>\nЗаявка #${n} отменена. Нажмите «📮 Пополнить счёт» ещё раз.`,
    cancelled: (n: number) => `❌ Заявка #${n} отменена.`,
    alreadyPaid: "Этот платёж уже получен.",
  },
};
const lang = (v: string | null | undefined): L => (v === "ru" ? "ru" : "uz");

export const cancelKeyboard = (l: L, txId: string) => ({ inline_keyboard: [[{ text: TXT[l].cancelBtn, callback_data: `hp:x:${txId}` }]] });

async function markMessage(p: PayRow, label: string) {
  if (!p.pay_msg_id) return;
  await tg("editMessageReplyMarkup", {
    chat_id: p.user_id,
    message_id: Number(p.pay_msg_id),
    reply_markup: { inline_keyboard: [[{ text: label, callback_data: "noop" }]] },
  }).catch(() => undefined);
}

async function tellAdmins(text: string) {
  if (telegramMode() === "none") return;
  const s = await getSettings();
  for (const id of s.admin_chat_id.split(/[,\s]+/).filter(Boolean)) {
    await tg("sendMessage", { chat_id: id, text, parse_mode: "HTML" }).catch(() => undefined);
  }
}

/** The customer's payment that is still waiting for money (shown again instead of opening a second one). */
export async function openPayment(userId: number): Promise<{ tx: PayRow; text: string } | null> {
  const p = await maybeOne(sql<PayRow[]>`select ${TX_COLS()}, ${PAY_COLS()} from public.transactions t
    where t.user_id = ${userId} and t.type = 'bk_deposit' and t.status = 'pending'
      and to_jsonb(t) ->> 'pay_state' = 'wait' and (to_jsonb(t) ->> 'pay_expire_at')::timestamptz > now()
    order by t.created_at desc limit 1`);
  if (!p?.pay_card) return null;
  const left = Math.floor((new Date(p.pay_expire_at ?? 0).getTime() - Date.now()) / 1000);
  return { tx: p, text: payText(lang(p.lang), p.amount, p.pay_card, payMinutes(left)) };
}

export type StartResult =
  | { kind: "ok"; tx: TxRow; text: string; markup: unknown; card: string }
  | { kind: "failed"; message: string };

/**
 * Creates the request and the HamyonAPI payment. A busy sum is moved up by 1 so'm and tried again.
 * The request is removed again when HamyonAPI refuses — no money has moved at that point.
 */
export async function startHamyonDeposit(
  c: HamyonCreds,
  userId: number,
  l: L,
  d: { bk: string; account: string; card: string; amount: number; bonusPercent: number; feePercent: number },
): Promise<StartResult> {
  const taken = await sql<{ amount: number }[]>`select amount::float8 as amount from public.transactions
    where type = 'bk_deposit' and status = 'pending' and created_at > now() - interval '1 day'
      and amount between ${d.amount} and ${d.amount + 100}`;
  const busy = taken.map((r) => Number(r.amount));
  let pay = nextFreeAmount(d.amount, busy);
  const rows = await sql<TxRow[]>`
    insert into public.transactions (user_id, type, bookmaker_id, account_id, card_number, amount, bonus, fee, source, pay_state)
    values (${userId}, 'bk_deposit', ${d.bk}, ${d.account}, ${d.card || null}, ${pay}, 0, 0, 'bot', 'creating')
    returning ${TX_COLS()}`;
  const tx = rows[0];
  if (!tx) throw new Error("request_failed");
  let created: Created | { error: string } = { error: "" };
  for (let i = 0; i < 25; i++) {
    created = await hamyonCreate(c, pay, tx.id).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    if ("paymentId" in created || !isAmountBusyError(created.error)) break;
    busy.push(pay);
    pay = nextFreeAmount(pay + 1, busy);
  }
  if (!("paymentId" in created)) {
    await sql`delete from public.transactions where id = ${tx.id} and status = 'pending'`;
    console.error("[hamyon] create failed", created.error);
    return { kind: "failed", message: created.error };
  }
  const { bonus, fee } = depositSplit(pay, d.bonusPercent, d.feePercent);
  const expireAt = new Date(Date.now() + created.expiresIn * 1000).toISOString();
  const upd = await sql<TxRow[]>`update public.transactions set amount = ${pay}, bonus = ${bonus}, fee = ${fee},
      pay_id = ${created.paymentId}, pay_card = ${created.card}, pay_state = 'wait', pay_expire_at = ${expireAt}
    where id = ${tx.id} returning ${TX_COLS()}`;
  return {
    kind: "ok",
    tx: upd[0] ?? tx,
    text: payText(l, pay, created.card, payMinutes(created.expiresIn)),
    markup: cancelKeyboard(l, tx.id),
    card: cardDigits(created.card),
  };
}

export async function savePayMessage(txId: string, messageId: number) {
  await sql`update public.transactions set pay_msg_id = ${messageId} where id = ${txId}`;
}

/** Money arrived. Runs once per payment (claimed by pay_state), however many callbacks come. */
async function onPaid(p: PayRow, paidAmount: number) {
  const claimed = await maybeOne(sql<{ id: string }[]>`update public.transactions set pay_state = 'paid'
    where id = ${p.id} and pay_state = 'wait' and status = 'pending' returning id`);
  if (!claimed) {
    if (p.pay_state === "cancel" || p.status === "rejected") {
      const late = await maybeOne(sql<{ id: string }[]>`update public.transactions set pay_state = 'paid_late'
        where id = ${p.id} and pay_state = 'cancel' returning id`);
      if (late)
        await tellAdmins(`⚠️ <b>HamyonAPI: #${p.number} uchun pul tushdi</b>, lekin so'rov bekor qilingan edi.\n💰 ${formatSom(paidAmount)} so'm · 👤 <code>${p.user_id}</code>\nTekshirib, mijoz bilan bog'laning.`);
    }
    return;
  }
  const l = lang(p.lang);
  await markMessage(p, TXT[l].paidMark);
  if (paidAmount && Math.round(paidAmount) !== Math.round(p.amount)) {
    const note = `⚠️ HamyonAPI: ${formatSom(paidAmount)} so'm tushdi, kutilgan ${formatSom(p.amount)} — tekshiring`;
    await sql`update public.transactions set admin_note = ${note} where id = ${p.id}`;
    await tg("sendMessage", { chat_id: p.user_id, text: TXT[l].paidWait(p.number), parse_mode: "HTML" }).catch(() => undefined);
    inBackground("alert", () => notifyAdminsNewRequest({ ...p, admin_note: note, source: "bot" }));
    return;
  }
  const creds = p.bookmaker_id ? await loadCashdeskCreds(p.bookmaker_id) : null;
  if (!creds) {
    const note = "💰 HamyonAPI: pul tushdi — bukmeker hisobini qo'lda to'ldiring, keyin ✅";
    await sql`update public.transactions set admin_note = ${note} where id = ${p.id}`;
    await tg("sendMessage", { chat_id: p.user_id, text: TXT[l].paidWait(p.number), parse_mode: "HTML" }).catch(() => undefined);
    inBackground("alert", () => notifyAdminsNewRequest({ ...p, admin_note: note, source: "bot" }));
    return;
  }
  try {
    // Sends to the bookmaker, tells the customer and pays the referral reward.
    const done = await approveRequest(p.id);
    await tellAdmins(`✅ <b>Avto: #${done.number} bajarildi</b>\n💰 ${formatSom(done.amount)} so'm (HamyonAPI) → 🎯 <code>${escapeHtml(done.account_id ?? "")}</code>`);
  } catch (e) {
    // The bookmaker refused or answered unclearly: the request waits for an admin with the reason.
    console.error("[hamyon] auto approve", e);
    await tg("sendMessage", { chat_id: p.user_id, text: TXT[l].paidWait(p.number), parse_mode: "HTML" }).catch(() => undefined);
    const fresh = await loadPay({ id: p.id });
    inBackground("alert", () => notifyAdminsNewRequest({ ...(fresh ?? p), source: "bot" }));
  }
}

/** No money in time (or the customer cancelled): the request closes and the customer is told. */
async function onCancel(p: PayRow, why: "timeout" | "user") {
  const claimed = await maybeOne(sql<{ id: string }[]>`update public.transactions set pay_state = 'cancel'
    where id = ${p.id} and pay_state = 'wait' and status = 'pending' returning id`);
  if (!claimed) return false;
  const note = why === "user" ? "Mijoz bekor qildi" : "To'lov vaqti tugadi (HamyonAPI)";
  await rejectBotRequest(p.id, note).catch((e) => console.error("[hamyon] reject", e));
  const l = lang(p.lang);
  await markMessage(p, why === "user" ? TXT[l].cancelMark : TXT[l].timeoutMark);
  await tg("sendMessage", { chat_id: p.user_id, text: why === "user" ? TXT[l].cancelled(p.number) : TXT[l].timeout(p.number), parse_mode: "HTML" }).catch(
    () => undefined,
  );
  return true;
}

/** prepare / complete from HamyonAPI. Returns the HTTP status to answer with. */
export async function handleHamyonCallback(cb: HamyonCallback): Promise<number> {
  const c = await loadHamyonCreds();
  if (!c) return 503;
  if (!validSign(c, cb)) return 403;
  if (cb.status === "prepare") return 200;
  const p = (await loadPay({ payId: cb.paymentId })) ?? (cb.orderId ? await loadPay({ id: cb.orderId }) : null);
  if (!p) {
    console.error("[hamyon] unknown payment", cb.paymentId);
    return 200;
  }
  if (cb.status === "paid") await onPaid(p, Number(cb.amount));
  else if (cb.status === "cancel") await onCancel(p, "timeout");
  return 200;
}

/** "❌ Bekor qilish" under the payment message. */
export async function cancelByUser(userId: number, txId: string): Promise<string | null> {
  const p = await loadPay({ id: txId });
  if (!p || p.user_id !== userId || p.status !== "pending" || p.pay_state !== "wait" || !p.pay_id) return null;
  const c = await loadHamyonCreds();
  if (c) {
    const r = await hamyonCancel(c, p.pay_id).catch((e) => ({ ok: false, error: String(e) }));
    if (!r.ok) {
      // Maybe the money has just arrived — never cancel a paid payment.
      const st = await hamyonStatus(p.pay_id);
      if (st?.status === "paid") {
        await onPaid(p, st.amount);
        return TXT[lang(p.lang)].alreadyPaid;
      }
      if (st?.status !== "cancel") return null;
    }
  }
  await onCancel(p, "user");
  return null;
}

// ---------- Safety net: ask HamyonAPI about open payments ----------
let lastSweep = 0;
let watcher: ReturnType<typeof setInterval> | undefined;

export async function sweepHamyon(force = false) {
  if (!force && Date.now() - lastSweep < 55_000) return;
  lastSweep = Date.now();
  const open = await sql<PayRow[]>`select ${TX_COLS()}, ${PAY_COLS()} from public.transactions t
    where t.type = 'bk_deposit' and t.status = 'pending' and to_jsonb(t) ->> 'pay_state' = 'wait'
      and t.created_at < now() - interval '60 seconds' and t.created_at > now() - interval '1 day'
    order by t.created_at limit 30`;
  for (const p of open) {
    if (!p.pay_id) continue;
    const st = await hamyonStatus(p.pay_id);
    if (st?.status === "paid") await onPaid(p, st.amount);
    else if (st?.status === "cancel") await onCancel(p, "timeout");
  }
}

/** Every minute while the server runs (Railway). In the preview each bot update runs it instead. */
export function startHamyonWatcher() {
  if (!watcher && process.env["RAILWAY_ENVIRONMENT"]) {
    watcher = setInterval(() => void sweepHamyon().catch((e) => console.error("[hamyon] sweep", e)), 60_000);
  }
  inBackground("hamyon-sweep", () => sweepHamyon());
}
