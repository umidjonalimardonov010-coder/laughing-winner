// Money safety rules shared by the wallet server functions, the bot and the admin panel.
// Pure functions only, so every rule is covered by tests.

const TASHKENT_OFFSET_MS = 5 * 3600_000;

/** Start of "today" in Tashkent (UTC+5), as a UTC Date — daily limits reset at Tashkent midnight. */
export function tashkentDayStart(now = new Date()): Date {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - TASHKENT_OFFSET_MS);
}

/** Weekly window: the last 7 days, today included (today's Tashkent midnight minus 6 days). */
export function weekStart(now = new Date()): Date {
  return new Date(tashkentDayStart(now).getTime() - 6 * 24 * 3600_000);
}

export type LimitBreach = { kind: "daily" | "weekly"; limit: number; left: number };

/**
 * Card withdrawal limits. A limit of 0 (or less) means "no limit".
 * `usedToday` / `usedWeek` are pending + approved card withdrawals in those windows.
 */
export function withdrawLimitBreach(
  amount: number,
  usage: { today: number; week: number },
  limits: { daily: number; weekly: number },
): LimitBreach | null {
  if (limits.daily > 0 && usage.today + amount > limits.daily)
    return { kind: "daily", limit: limits.daily, left: Math.max(0, limits.daily - usage.today) };
  if (limits.weekly > 0 && usage.week + amount > limits.weekly)
    return { kind: "weekly", limit: limits.weekly, left: Math.max(0, limits.weekly - usage.week) };
  return null;
}

/** "withdraw_limit:daily:250000" — the wallet turns this into a readable message. */
export function limitErrorCode(b: LimitBreach): string {
  return `withdraw_limit:${b.kind}:${b.left}`;
}

export function parseLimitError(message: string): { kind: "daily" | "weekly"; left: number } | null {
  const m = message.match(/withdraw_limit:(daily|weekly):(\d+)/);
  return m ? { kind: m[1] as "daily" | "weekly", left: Number(m[2]) } : null;
}

/**
 * Why a withdrawal looks suspicious, or null.
 * - otherUsers: how many OTHER Telegram users already used this card / bookmaker account
 * - recentCount: requests with this card / account in the last 24 hours, this one included
 * - threshold: that many requests in 24 hours count as suspicious (0 = off)
 */
export function suspicionReason(
  what: "card" | "account",
  stats: { otherUsers: number; recentCount: number },
  threshold: number,
): string | null {
  const name = what === "card" ? "karta" : "BK hisob";
  if (stats.otherUsers > 0) return `Bu ${name} boshqa ${stats.otherUsers} ta foydalanuvchida ham ishlatilgan`;
  if (threshold > 0 && stats.recentCount >= threshold) return `24 soatda shu ${name} bilan ${stats.recentCount}-so'rov`;
  return null;
}

export type Promo = {
  code: string;
  bonus_percent: number;
  max_uses: number;
  used_count: number;
  per_user: number;
  expires_at: string | null;
  is_active: boolean;
};

/** Promo codes are typed by people: compare without case or spaces. */
export function normalizePromo(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().slice(0, 32);
}

/** Null when this user may use the code now, otherwise the reason. */
export function promoProblem(
  p: Promo | null,
  userUses: number,
  now = new Date(),
): "not_found" | "inactive" | "expired" | "used_up" | "already_used" | null {
  if (!p) return "not_found";
  if (!p.is_active) return "inactive";
  if (p.expires_at && Date.parse(p.expires_at) <= now.getTime()) return "expired";
  if (p.max_uses > 0 && p.used_count >= p.max_uses) return "used_up";
  if (p.per_user > 0 && userUses >= p.per_user) return "already_used";
  return null;
}

/** Extra bonus (so'm, rounded down) a promo code adds to a bookmaker deposit. */
export function promoBonus(amount: number, percent: number): number {
  if (!(amount > 0) || !(percent > 0)) return 0;
  return Math.floor((amount * percent) / 100);
}
