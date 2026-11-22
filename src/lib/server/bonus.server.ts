// Bonus menu money: daily bonus, referral reward (friend's first approved deposit) and sending the
// bonus balance (tg_users.balance) to the user's LINEBET account. Every balance change is one atomic
// statement, so a double tap or two admins at once never pay twice.
import { maybeOne, sql } from "./db.server";
import { getSettings, type Settings } from "./settings.server";
import { TX_COLS, type TxRow } from "./tx.server";
import { approveBotRequest, type BotTx } from "./exchange.server";
import { loadCashdeskCreds } from "./cashdesk-config.server";
import { escapeHtml, tg, telegramMode } from "./telegram.server";
import { bonusConfig, bonusWithdrawWaitMs, checkBonusWithdraw, msUntilNextDay, pickDailyBonus, tashkentDay, type WithdrawCheck } from "@/lib/bonus-rules";
import { formatSom } from "@/lib/format";

/** The bonus balance always goes to this bookmaker. */
export const BONUS_BK = "linebet";

export async function bonusBalance(userId: number): Promise<number> {
  const r = await maybeOne(sql<{ b: number }[]>`select balance::float8 as b from public.tg_users where id = ${userId}`);
  return Math.max(0, Number(r?.b ?? 0));
}

export type DailyResult =
  | { kind: "ok"; amount: number; balance: number }
  | { kind: "already"; waitMs: number }
  | { kind: "off" };

export async function claimDailyBonus(userId: number, s: Settings, now = new Date()): Promise<DailyResult> {
  const c = bonusConfig(s);
  const amount = pickDailyBonus(c.dailyMin, c.dailyMax);
  if (amount <= 0) return { kind: "off" };
  const today = tashkentDay(now);
  return sql.begin(async (tx) => {
    const rows = await tx<{ balance: number }[]>`
      update public.tg_users set balance = balance + ${amount}, last_daily_bonus = ${today}::date
      where id = ${userId} and (last_daily_bonus is null or last_daily_bonus < ${today}::date)
      returning balance::float8 as balance`;
    if (!rows[0]) return { kind: "already", waitMs: msUntilNextDay(now) } as const;
    await tx`insert into public.transactions (user_id, type, status, amount, admin_note, source, processed_at)
      values (${userId}, 'adjustment', 'approved', ${amount}, 'Kunlik bonus', 'daily_bonus', now())`;
    return { kind: "ok", amount, balance: Number(rows[0].balance) } as const;
  });
}

export async function referralStats(userId: number) {
  const r = await maybeOne(sql<{ invited: number; paid: number; earned: number }[]>`
    select (select count(*) from public.tg_users where referrer_id = ${userId})::float8 as invited,
      (select count(*) from public.tg_users where referrer_id = ${userId} and referral_paid)::float8 as paid,
      (select referral_earned from public.tg_users where id = ${userId})::float8 as earned`);
  return { invited: Number(r?.invited ?? 0), paid: Number(r?.paid ?? 0), earned: Number(r?.earned ?? 0) };
}

/**
 * Called after a bot deposit is approved: when it is this user's first one and someone invited
 * them, the inviter gets the admin's fixed reward — once per invited friend.
 */
export async function rewardReferrer(userId: number) {
  const s = await getSettings();
  const reward = bonusConfig(s).referralReward;
  const out = await sql.begin(async (tx) => {
    const marked = await tx<{ referrer_id: number; first_name: string | null; username: string | null }[]>`
      update public.tg_users set referral_paid = true
      where id = ${userId} and not referral_paid and referrer_id is not null
      returning referrer_id::float8 as referrer_id, first_name, username`;
    const m = marked[0];
    if (!m || reward <= 0) return null;
    const up = await tx<{ balance: number; lang: string }[]>`
      update public.tg_users set balance = balance + ${reward}, referral_earned = referral_earned + ${reward}
      where id = ${m.referrer_id} returning balance::float8 as balance, lang`;
    if (!up[0]) return null;
    await tx`insert into public.transactions (user_id, type, status, amount, admin_note, source, processed_at)
      values (${m.referrer_id}, 'referral_bonus', 'approved', ${reward}, ${`Referal: ${userId}`}, 'referral', now())`;
    return { referrerId: Number(m.referrer_id), friend: m.first_name || (m.username ? `@${m.username}` : String(userId)), balance: Number(up[0].balance), lang: up[0].lang };
  });
  if (!out || telegramMode() === "none") return out;
  const ru = out.lang === "ru";
  const text = ru
    ? `🎉 Ваш друг <b>${escapeHtml(out.friend)}</b> впервые пополнил счёт!\n🎁 Вам начислено <b>+${formatSom(reward)} сум</b>.\n💰 Бонусный баланс: <b>${formatSom(out.balance)} сум</b>`
    : `🎉 Do'stingiz <b>${escapeHtml(out.friend)}</b> birinchi marta hisob to'ldirdi!\n🎁 Sizga <b>+${formatSom(reward)} so'm</b> bonus berildi.\n💰 Bonus balans: <b>${formatSom(out.balance)} so'm</b>`;
  await tg("sendMessage", { chat_id: out.referrerId, text, parse_mode: "HTML" }).catch(() => undefined);
  return out;
}

export type BonusWithdrawStart =
  | { kind: "created"; tx: BotTx }
  | { kind: "refused"; check: WithdrawCheck }
  | { kind: "wait"; waitMs: number };

// Newest bonus withdrawal that was not refused (a refused one never blocks the next).
const toDate = (r: { at: number | null }[]) => (r[0]?.at ? new Date(Number(r[0].at)) : null);

/** How long this customer still waits before the next bonus withdrawal (ms, 0 = may withdraw). */
export async function bonusWithdrawWait(userId: number, s: Settings): Promise<number> {
  const hours = bonusConfig(s).withdrawEveryHours;
  if (hours <= 0) return 0;
  return bonusWithdrawWaitMs(toDate(await sql<{ at: number | null }[]>`
        select (extract(epoch from max(created_at)) * 1000)::float8 as at from public.transactions
        where user_id = ${userId} and source = 'bonus' and type = 'bk_deposit' and status <> 'rejected'`), hours);
}

/**
 * Takes the whole bonus balance off and opens a LINEBET top-up request for it (source 'bonus').
 * The once-per-N-hours rule is checked again under the user's row lock, so two taps can't pass it.
 */
export async function createBonusWithdraw(userId: number, account: string, s: Settings): Promise<BonusWithdrawStart> {
  const { withdrawMin: min, withdrawEveryHours: hours } = bonusConfig(s);
  return sql.begin(async (tx) => {
    const u = await tx<{ balance: number }[]>`select balance::float8 as balance from public.tg_users where id = ${userId} for update`;
    if (hours > 0) {
      const waitMs = bonusWithdrawWaitMs(toDate(await tx<{ at: number | null }[]>`
        select (extract(epoch from max(created_at)) * 1000)::float8 as at from public.transactions
        where user_id = ${userId} and source = 'bonus' and type = 'bk_deposit' and status <> 'rejected'`), hours);
      if (waitMs > 0) return { kind: "wait", waitMs } as const;
    }
    const check = checkBonusWithdraw(Number(u[0]?.balance ?? 0), min);
    if (!check.ok) return { kind: "refused", check } as const;
    await tx`update public.tg_users set balance = balance - ${check.amount} where id = ${userId}`;
    const rows = await tx<TxRow[]>`
      insert into public.transactions (user_id, type, bookmaker_id, account_id, amount, bonus, fee, source, admin_note)
      values (${userId}, 'bk_deposit', ${BONUS_BK}, ${account}, ${check.amount}, 0, 0, 'bonus', 'Bonus balansdan')
      returning ${TX_COLS()}`;
    if (!rows[0]) throw new Error("request_failed");
    return { kind: "created", tx: { ...rows[0], source: "bonus" } } as const;
  });
}

/** Refused bonus withdraw → the money goes back to the bonus balance (in the same statement). */
export async function rejectBonusWithdraw(id: string, note = ""): Promise<BotTx & { balance: number }> {
  const rows = await sql<(TxRow & { balance: number })[]>`
    with t as (
      update public.transactions set status = 'rejected', processed_at = now(), admin_note = ${note || null}
      where id = ${id} and status = 'pending' and source = 'bonus'
        and coalesce(admin_note, '') not like ${"⏳ Avto%"}
      returning *
    ), u as (
      update public.tg_users g set balance = g.balance + t.amount from t where g.id = t.user_id returning g.balance
    )
    select ${TX_COLS()}, (select balance::float8 from u) as balance from t`;
  if (!rows[0]) {
    const cur = await maybeOne(sql<{ status: string }[]>`select status from public.transactions where id = ${id}`);
    if (!cur) throw new Error("not_found");
    throw new Error(cur.status === "pending" ? "in_progress" : "already_processed");
  }
  return { ...rows[0], source: "bonus", balance: Number(rows[0].balance) };
}

export async function notifyBonusRefund(tx: BotTx & { balance: number }) {
  if (telegramMode() === "none") return;
  const u = await maybeOne(sql<{ lang: string }[]>`select lang from public.tg_users where id = ${tx.user_id}`);
  const ru = u?.lang === "ru";
  const reason = tx.admin_note ? `\n💬 ${ru ? "Причина" : "Sabab"}: ${escapeHtml(tx.admin_note)}` : "";
  const text = ru
    ? `❌ <b>Вывод бонуса #${tx.number} отклонён</b>${reason}\n↩️ ${formatSom(tx.amount)} сум вернулись на бонусный баланс (${formatSom(tx.balance)} сум).`
    : `❌ <b>Bonus yechish #${tx.number} rad etildi</b>${reason}\n↩️ ${formatSom(tx.amount)} so'm bonus balansingizga qaytdi (${formatSom(tx.balance)} so'm).`;
  await tg("sendMessage", { chat_id: tx.user_id, text, parse_mode: "HTML" }).catch(() => undefined);
}

export type AutoOutcome = { kind: "done"; tx: BotTx } | { kind: "refunded"; message: string } | { kind: "pending"; tx: BotTx };

/**
 * Automatic mode: the cashdesk sends the money right away. A clear refusal refunds the balance;
 * an unclear answer leaves the request for an admin (the money may already have moved).
 */
export async function autoSendBonus(tx: BotTx): Promise<AutoOutcome> {
  if (!(await loadCashdeskCreds(BONUS_BK))) return { kind: "pending", tx };
  try {
    return { kind: "done", tx: await approveBotRequest(tx.id) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("bk_rejected")) {
      const reason = msg.replace(/^.*bk_rejected:\s*/, "");
      await rejectBonusWithdraw(tx.id, `LINEBET rad etdi: ${reason}`.slice(0, 300));
      return { kind: "refunded", message: reason };
    }
    console.error("autoSendBonus", e);
    const cur = await maybeOne(sql<TxRow[]>`select ${TX_COLS()} from public.transactions where id = ${tx.id}`);
    return { kind: "pending", tx: { ...(cur ?? tx), source: "bonus" } };
  }
}

/**
 * Admin "Balanslarni 0 qilish": every bonus balance becomes 0. Each cleared balance is written as a
 * minus "Balans tuzatish" record, so the customer's history still explains where the money went.
 */
export async function resetAllBalances(): Promise<{ users: number; sum: number }> {
  // One statement: lock, log and clear together, so a bonus paid at the same moment is never lost.
  const rows = await sql<{ n: number; s: number }[]>`
    with z as (select id, balance from public.tg_users where balance <> 0 for update),
    u as (update public.tg_users t set balance = 0 from z where t.id = z.id),
    ins as (
      insert into public.transactions (user_id, type, status, amount, admin_note, source, processed_at)
      select id, 'adjustment', 'approved', -balance, 'Balans 0 qilindi', 'reset', now() from z
    )
    select count(*)::float8 as n, coalesce(sum(balance), 0)::float8 as s from z`;
  return { users: Number(rows[0]?.n ?? 0), sum: Number(rows[0]?.s ?? 0) };
}
