import { describe, expect, it } from "vitest";
import { cashbackFor, parseVipLevels, safeVipLevels, VIP_DEFAULT_LEVELS, vipPosition } from "./vip-rules";

const levels = parseVipLevels(VIP_DEFAULT_LEVELS);

describe("VIP levels", () => {
  it("reads 'Name | from | %' lines, sorted by amount", () => {
    expect(parseVipLevels("Oltin | 5 000 000 | 1,5\nBronza | 0 | 0.5")).toEqual([
      { name: "Bronza", from: 0, pct: 0.5 },
      { name: "Oltin", from: 5_000_000, pct: 1.5 },
    ]);
  });
  it("refuses cashback above 20%", () => {
    expect(() => parseVipLevels("Bronza | 0 | 25")).toThrow("vip_bad_pct:1");
  });
  it("refuses a broken line", () => {
    expect(() => parseVipLevels("Bronza 0 1")).toThrow("vip_bad_line:1");
    expect(safeVipLevels("Bronza 0 1")).toEqual([]);
  });
  it("puts 999 999 so'm in Bronza and 1 000 000 in Kumush", () => {
    expect(vipPosition(999_999, levels).level?.name).toBe("Bronza");
    expect(vipPosition(999_999, levels).toNext).toBe(1);
    expect(vipPosition(1_000_000, levels).level?.name).toBe("Kumush");
  });
  it("has no next level at the top", () => {
    const p = vipPosition(50_000_000, levels);
    expect(p.level?.name).toBe("Platina");
    expect(p.next).toBeNull();
    expect(p.toNext).toBe(0);
  });
});

describe("cashback", () => {
  it("1.5% of 100 000 so'm is 1 500 so'm", () => {
    expect(cashbackFor(100_000, 1.5)).toBe(1500);
  });
  it("rounds down to whole so'm", () => {
    expect(cashbackFor(5_050, 0.5)).toBe(25);
  });
  it("is 0 when the level pays 0%", () => {
    expect(cashbackFor(100_000, 0)).toBe(0);
  });
});
