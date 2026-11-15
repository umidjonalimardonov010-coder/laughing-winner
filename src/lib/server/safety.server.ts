// Server side of the money safety rules (src/lib/money-rules.ts): reads what the rules need.
import { maybeOne, sql } from "./db.server";
import { num, type Settings } from "./settings.server";
import {
  limitErrorCode,
  normalizePromo,
  promoBonus,
  promoProblem,
  suspicionReason,
  tashkentDayStart,
  weekStart,
  withdrawLimitBreach,
  type Promo,
} from "@/lib/money-rules";

export function withdrawLimits(s: Settings) {
  return { daily: num(s.daily_withdraw_limit, 0), weekly: num(s.weekly_withdraw_limit, 0) };
}

/** Pending + approved card withdrawals of this user today (Tashkent) and in the last 7 days. */
export async function cardWithdrawUsage(userId: number, now = new Date()) {
  const day = tashkentDayStart(now).toISOString();
  const week = weekStart(now).toISOString();
  const r = await maybeOne(
    sql<{ today: number; week: number }[]>`
      select
        coalesce(sum(amount) filter (where created_at >= ${day}), 0)::float8 as today,
        coalesce(sum(amount), 0)::float8 as week
      from public.transactions
      where user_id = ${userId} and type = 'card_withdraw' and status in ('pending', 'approved') and created_at >= ${week}`,
  );
  return { today: Number(r?.today ?? 0), week: Number(r?.week ?? 0) };
}

/** Throws "withdraw_limit:<daily|weekly>:<left>" when this card withdrawal would pass a limit. */
export async function assertWithdrawLimit(userId: number, amount: number, s: Settings) {
  const limits = withdrawLimits(s);
  if (limits.daily <= 0 && limits.weekly <= 0) return;
  const breach = withdrawLimitBreach(amount, await cardWithdrawUsage(userId), limits);
  if (breach) throw new Error(limitErrorCode(breach));
}

/** Suspicion check for a NEW withdrawal to a card (call before inserting it). */
export async function cardSuspicion(userId: number, card: string, s: Settings): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const r = await maybeOne(
    sql<{ others: number; recent: number }[]>`
      select
        count(distinct user_id) filter (where user_id <> ${userId})::int as others,
        count(*) filter (where created_at >= ${since})::int as recent
      from public.transactions
      where card_number = ${card} and type in ('card_withdraw', 'bk_withdraw')`,
  );
  return suspicionReason(
    "card",
    { otherUsers: Number(r?.others ?? 0), recentCount: Number(r?.recent ?? 0) + 1 },
    num(s.suspicious_repeat_count, 3),
  );
}

/** Suspicion check for a NEW bookmaker withdrawal: same BK account used by someone else, or too often. */
export async function accountSuspicion(userId: number, bookmakerId: string, accountId: string, s: Settings): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const r = await maybeOne(
    sql<{ others: number; recent: number }[]>`
      select
        count(distinct user_id) filter (where user_id <> ${userId})::int as others,
        count(*) filter (where created_at >= ${since} and type = 'bk_withdraw')::int as recent
      from public.transactions
      where bookmaker_id = ${bookmakerId} and account_id = ${accountId} and type in ('bk_deposit', 'bk_withdraw')`,
  );
  return suspicionReason(
    "account",
    { otherUsers: Number(r?.others ?? 0), recentCount: Number(r?.recent ?? 0) + 1 },
    num(s.suspicious_repeat_count, 3),
  );
}

const PROMO_COLS = () => sql`code, bonus_percent::float8 as bonus_percent, max_uses, used_count, per_user,
  case when expires_at is null then null else to_char(expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as expires_at,
  is_active`;

export async function findPromo(raw: string): Promise<Promo | null> {
  const code = normalizePromo(raw);
  if (!code) return null;
  return maybeOne(sql<Promo[]>`select ${PROMO_COLS()} from public.promo_codes where code = ${code}`);
}

async function userPromoUses(code: string, userId: number) {
  const r = await maybeOne(
    sql<{ n: number }[]>`select count(*)::int as n from public.promo_redemptions where code = ${code} and user_id = ${userId}`,
  );
  return Number(r?.n ?? 0);
}

/** Whether this user can use the code right now (for the wallet's "Apply" button). */
export async function checkPromo(raw: string, userId: number) {
  const p = await findPromo(raw);
  const problem = promoProblem(p, p ? await userPromoUses(p.code, userId) : 0);
  return problem ? { ok: false as const, problem } : { ok: true as const, code: p!.code, percent: Number(p!.bonus_percent) };
}

/**
 * Takes one use of a promo code inside the caller's database transaction and returns the extra bonus.
 * The row lock makes two simultaneous requests unable to use the same last slot.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function claimPromo(tx: any, raw: string, userId: number, amount: number) {
  const code = normalizePromo(raw);
  const rows = await tx`select ${PROMO_COLS()} from public.promo_codes where code = ${code} for update`;
  const p = (rows[0] as Promo | undefined) ?? null;
  const usesRows = await tx`select count(*)::int as n from public.promo_redemptions where code = ${code} and user_id = ${userId}`;
  const problem = promoProblem(p, Number(usesRows[0]?.n ?? 0));
  if (problem) throw new Error(`promo_${problem}`);
  await tx`update public.promo_codes set used_count = used_count + 1 where code = ${code}`;
  return { code, bonus: promoBonus(amount, Number(p!.bonus_percent)) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordPromo(tx: any, code: string, userId: number, txId: string, bonus: number) {
  await tx`insert into public.promo_redemptions (code, user_id, tx_id, bonus) values (${code}, ${userId}, ${txId}, ${bonus})`;
}

/** A rejected request gives its promo use back. */
export async function releasePromo(txId: string) {
  await sql.begin(async (tx) => {
    const r = await tx`delete from public.promo_redemptions where tx_id = ${txId} returning code`;
    for (const row of r) await tx`update public.promo_codes set used_count = greatest(used_count - 1, 0) where code = ${row["code"]}`;
  }).catch((e) => console.error("releasePromo", e));
}
