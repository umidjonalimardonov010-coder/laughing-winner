import { describe, expect, it } from "vitest";
import {
  parseLimitError,
  limitErrorCode,
  promoBonus,
  promoProblem,
  normalizePromo,
  suspicionReason,
  tashkentDayStart,
  weekStart,
  withdrawLimitBreach,
  type Promo,
} from "./money-rules";

describe("withdraw limits", () => {
  it("0 means no limit", () => {
    expect(withdrawLimitBreach(5_000_000, { today: 9_000_000, week: 9_000_000 }, { daily: 0, weekly: 0 })).toBeNull();
  });
  it("blocks a card withdrawal that would pass the daily limit and says how much is left", () => {
    expect(withdrawLimitBreach(300_000, { today: 800_000, week: 800_000 }, { daily: 1_000_000, weekly: 0 })).toEqual({
      kind: "daily",
      limit: 1_000_000,
      left: 200_000,
    });
  });
  it("allows exactly reaching the daily limit", () => {
    expect(withdrawLimitBreach(200_000, { today: 800_000, week: 800_000 }, { daily: 1_000_000, weekly: 0 })).toBeNull();
  });
  it("checks the weekly limit too", () => {
    expect(withdrawLimitBreach(500_000, { today: 0, week: 4_800_000 }, { daily: 1_000_000, weekly: 5_000_000 })?.kind).toBe("weekly");
  });
  it("error code round-trips", () => {
    expect(parseLimitError(`x ${limitErrorCode({ kind: "weekly", limit: 5, left: 1234 })}`)).toEqual({ kind: "weekly", left: 1234 });
  });
});

describe("Tashkent day", () => {
  it("daily window starts at Tashkent midnight (19:00 UTC the day before)", () => {
    expect(tashkentDayStart(new Date("2026-11-15T10:00:00Z")).toISOString()).toBe("2026-11-14T19:00:00.000Z");
    expect(tashkentDayStart(new Date("2026-11-15T19:30:00Z")).toISOString()).toBe("2026-11-15T19:00:00.000Z");
  });
  it("weekly window covers 7 days including today", () => {
    expect(weekStart(new Date("2026-11-15T10:00:00Z")).toISOString()).toBe("2026-11-08T19:00:00.000Z");
  });
});

describe("suspicious requests", () => {
  it("a card used by another person is suspicious", () => {
    expect(suspicionReason("card", { otherUsers: 1, recentCount: 1 }, 3)).toMatch(/boshqa 1 ta foydalanuvchida/);
  });
  it("the 3rd request with the same card within 24 hours is suspicious", () => {
    expect(suspicionReason("card", { otherUsers: 0, recentCount: 2 }, 3)).toBeNull();
    expect(suspicionReason("card", { otherUsers: 0, recentCount: 3 }, 3)).toMatch(/3-so'rov/);
  });
  it("threshold 0 turns the repeat check off", () => {
    expect(suspicionReason("account", { otherUsers: 0, recentCount: 50 }, 0)).toBeNull();
  });
});

describe("promo codes", () => {
  const base: Promo = { code: "BONUS10", bonus_percent: 10, max_uses: 0, used_count: 0, per_user: 1, expires_at: null, is_active: true };
  const now = new Date("2026-11-15T10:00:00Z");
  it("a valid code adds its percent, rounded down", () => {
    expect(promoProblem(base, 0, now)).toBeNull();
    expect(promoBonus(123_456, 10)).toBe(12_345);
  });
  it("one use per person by default", () => {
    expect(promoProblem(base, 1, now)).toBe("already_used");
  });
  it("stops when all uses are taken", () => {
    expect(promoProblem({ ...base, max_uses: 50, used_count: 50 }, 0, now)).toBe("used_up");
  });
  it("expired and switched-off codes are refused", () => {
    expect(promoProblem({ ...base, expires_at: "2026-11-15T09:59:59Z" }, 0, now)).toBe("expired");
    expect(promoProblem({ ...base, is_active: false }, 0, now)).toBe("inactive");
    expect(promoProblem(null, 0, now)).toBe("not_found");
  });
  it("codes ignore case and spaces", () => {
    expect(normalizePromo(" bonus 10 ")).toBe("BONUS10");
  });
});
