import { describe, expect, it } from "vitest";
import { bonusConfig, bonusWithdrawWaitMs, checkBonusWithdraw, msUntilNextDay, pickDailyBonus, splitWait, tashkentDay } from "./bonus-rules";

describe("daily bonus amount", () => {
  it("stays between 1000 and 3000 when the admin sets 1000–3000", () => {
    expect(pickDailyBonus(1000, 3000, () => 0)).toBe(1000);
    expect(pickDailyBonus(1000, 3000, () => 0.9999)).toBe(3000);
    for (let i = 0; i < 200; i++) {
      const v = pickDailyBonus(1000, 3000);
      expect(v).toBeGreaterThanOrEqual(1000);
      expect(v).toBeLessThanOrEqual(3000);
      expect(v % 100).toBe(0);
    }
  });
  it("is always the same sum when min equals max", () => {
    expect(pickDailyBonus(2000, 2000, () => 0.5)).toBe(2000);
  });
  it("is off (0) when max is 0", () => {
    expect(pickDailyBonus(1000, 0)).toBe(0);
  });
});

describe("daily bonus day", () => {
  it("a new day starts at Tashkent midnight (19:00 UTC)", () => {
    expect(tashkentDay(new Date("2026-11-15T18:59:00Z"))).toBe("2026-11-15");
    expect(tashkentDay(new Date("2026-11-15T19:00:00Z"))).toBe("2026-11-16");
    expect(msUntilNextDay(new Date("2026-11-15T18:00:00Z"))).toBe(3600_000);
  });
});

describe("bonus withdraw to LINEBET", () => {
  it("needs at least the admin's minimum", () => {
    expect(checkBonusWithdraw(9_999, 10_000)).toEqual({ ok: false, reason: "below_min", min: 10_000 });
    expect(checkBonusWithdraw(10_000, 10_000)).toEqual({ ok: true, amount: 10_000 });
    expect(checkBonusWithdraw(0, 10_000)).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("admin bonus settings", () => {
  it("reads the admin's values and defaults to admin approval", () => {
    expect(
      bonusConfig({ bonus_referral_reward: "1000", bonus_daily_min: "1000", bonus_daily_max: "3000", bonus_withdraw_min: "20 000" }),
    ).toEqual({ referralReward: 1000, dailyMin: 1000, dailyMax: 3000, withdrawMin: 20_000, withdrawAuto: false, withdrawEveryHours: 24 });
    expect(bonusConfig({ bonus_withdraw_mode: "auto" }).withdrawAuto).toBe(true);
  });
});

describe("bonus withdraw once per N hours", () => {
  const last = new Date("2026-11-22T10:00:00Z");
  it("defaults to once every 24 hours", () => {
    expect(bonusConfig({}).withdrawEveryHours).toBe(24);
  });
  it("uses the hours the admin sets, 0 = no limit", () => {
    expect(bonusConfig({ bonus_withdraw_hours: "12" }).withdrawEveryHours).toBe(12);
    expect(bonusConfig({ bonus_withdraw_hours: "0" }).withdrawEveryHours).toBe(0);
    expect(bonusWithdrawWaitMs(last, 0, new Date("2026-11-22T10:01:00Z"))).toBe(0);
  });
  it("blocks a second withdrawal within 24 hours and allows it after", () => {
    expect(bonusWithdrawWaitMs(last, 24, new Date("2026-11-23T09:00:00Z"))).toBe(3600_000);
    expect(bonusWithdrawWaitMs(last, 24, new Date("2026-11-23T10:00:00Z"))).toBe(0);
    expect(bonusWithdrawWaitMs(null, 24)).toBe(0);
  });
  it("shows the wait as hours and minutes", () => {
    expect(splitWait(3600_000 * 23 + 60_000 * 59 + 1)).toEqual({ h: 24, m: 0 });
    expect(splitWait(90 * 60_000)).toEqual({ h: 1, m: 30 });
    expect(splitWait(1)).toEqual({ h: 0, m: 1 });
  });
});
