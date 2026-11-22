// Bonus menu rules (balance → LINEBET, referral reward, daily bonus). Pure, so they are tested.

export type BonusConfig = {
  /** Som paid to the inviter when the invited friend's first deposit is approved. 0 = off. */
  referralReward: number;
  /** Daily bonus range in som; max 0 = daily bonus off. */
  dailyMin: number;
  dailyMax: number;
  /** Smallest bonus balance that can be sent to LINEBET. */
  withdrawMin: number;
  /** true = the cashdesk sends it at once; false = an admin approves each request. */
  withdrawAuto: boolean;
  /** A customer may send the bonus to LINEBET once per this many hours. 0 = no limit. */
  withdrawEveryHours: number;
};

const whole = (v: string | undefined, fallback: number) => {
  const n = Number(String(v ?? "").replace(/[\s,'_]/g, ""));
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export const BONUS_DEFAULTS = {
  bonus_referral_reward: "500",
  bonus_daily_min: "1000",
  bonus_daily_max: "3000",
  bonus_withdraw_min: "10000",
  bonus_withdraw_mode: "manual",
  bonus_withdraw_hours: "24",
} as const;

/** Longest gap the admin may set between two bonus withdrawals (30 days). */
export const MAX_WITHDRAW_HOURS = 720;

export function bonusConfig(s: Partial<Record<keyof typeof BONUS_DEFAULTS, string>>): BonusConfig {
  const d = BONUS_DEFAULTS;
  return {
    referralReward: whole(s.bonus_referral_reward, Number(d.bonus_referral_reward)),
    dailyMin: whole(s.bonus_daily_min, Number(d.bonus_daily_min)),
    dailyMax: whole(s.bonus_daily_max, Number(d.bonus_daily_max)),
    withdrawMin: whole(s.bonus_withdraw_min, Number(d.bonus_withdraw_min)),
    withdrawAuto: (s.bonus_withdraw_mode ?? d.bonus_withdraw_mode) === "auto",
    withdrawEveryHours: Math.min(MAX_WITHDRAW_HOURS, whole(s.bonus_withdraw_hours, Number(d.bonus_withdraw_hours))),
  };
}

/**
 * Today's daily bonus: a random sum from min to max (both included). Steps of 100 som when both
 * ends are round hundreds. 0 when the daily bonus is switched off (max 0).
 */
export function pickDailyBonus(min: number, max: number, rand: () => number = Math.random): number {
  let lo = Math.max(0, Math.floor(min));
  let hi = Math.max(0, Math.floor(max));
  if (hi <= 0) return 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  const step = lo % 100 === 0 && hi % 100 === 0 ? 100 : 1;
  const slots = Math.floor((hi - lo) / step) + 1;
  const i = Math.min(slots - 1, Math.floor(rand() * slots));
  return Math.max(lo, lo + i * step) || hi;
}

const TASHKENT_OFFSET_MS = 5 * 3600_000;

/** Calendar day in Tashkent (UTC+5) as YYYY-MM-DD — the daily bonus resets at Tashkent midnight. */
export function tashkentDay(now: Date = new Date()): string {
  return new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Milliseconds until the next Tashkent midnight. */
export function msUntilNextDay(now: Date = new Date()): number {
  const local = now.getTime() + TASHKENT_OFFSET_MS;
  const nextMidnight = Math.floor(local / 86_400_000) * 86_400_000 + 86_400_000;
  return nextMidnight - local;
}

export type WithdrawCheck = { ok: true; amount: number } | { ok: false; reason: "empty" | "below_min"; min: number };

/** The whole bonus balance goes to LINEBET, and only once it reaches the minimum. */
export function checkBonusWithdraw(balance: number, min: number): WithdrawCheck {
  const b = Math.floor(balance);
  if (b <= 0) return { ok: false, reason: "empty", min };
  if (b < Math.max(1, min)) return { ok: false, reason: "below_min", min };
  // Only the set amount ("faqat N so'm") goes out per withdrawal; the rest stays on the bonus balance.
  return { ok: true, amount: min > 0 ? Math.floor(min) : b };
}

/**
 * How long the customer still has to wait before the next bonus withdrawal (ms, 0 = may withdraw now).
 * `last` is the newest bonus withdrawal that was not refused; a refused one never blocks the next.
 */
export function bonusWithdrawWaitMs(last: Date | null, everyHours: number, now: Date = new Date()): number {
  if (!last || everyHours <= 0) return 0;
  return Math.max(0, last.getTime() + everyHours * 3600_000 - now.getTime());
}

/** Wait time split for the message: hours and minutes (at least 1 minute while waiting). */
export function splitWait(ms: number): { h: number; m: number } {
  if (ms <= 0) return { h: 0, m: 0 };
  const totalMin = Math.ceil(ms / 60_000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}
