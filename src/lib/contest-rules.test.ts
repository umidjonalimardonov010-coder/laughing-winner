import { describe, expect, it } from "vitest";
import { contestConfig, drawWinners, parsePrizes, previousWeek, ticketsFor, weekOf } from "./contest-rules";

describe("contest week", () => {
  it("starts on Monday 00:00 Tashkent (Sunday 19:00 UTC)", () => {
    // 2026-11-23 is a Monday.
    expect(weekOf(new Date("2026-11-22T18:59:00Z")).key).toBe("2026-11-16");
    expect(weekOf(new Date("2026-11-22T19:00:00Z")).key).toBe("2026-11-23");
    expect(weekOf(new Date("2026-11-22T19:00:00Z")).start.toISOString()).toBe("2026-11-22T19:00:00.000Z");
    expect(previousWeek(new Date("2026-11-23T10:00:00Z")).key).toBe("2026-11-16");
  });
});

describe("contest tickets", () => {
  const c = { ticketSom: 50_000, minSom: 50_000 };
  it("gives 1 ticket per 50 000 so'm", () => {
    expect(ticketsFor(149_999, c)).toBe(2);
    expect(ticketsFor(150_000, c)).toBe(3);
  });
  it("gives none below the weekly minimum", () => {
    expect(ticketsFor(49_999, c)).toBe(0);
  });
});

describe("contest prizes", () => {
  it("reads '100 000, 50000' as two prizes", () => {
    expect(parsePrizes("100 000, 50000")).toEqual([100_000, 50_000]);
  });
  it("is off without prizes even when switched on", () => {
    expect(contestConfig({ contest_enabled: "on", contest_prizes: "" }).enabled).toBe(false);
    expect(contestConfig({ contest_enabled: "on", contest_prizes: "1000" }).enabled).toBe(true);
  });
});

describe("contest draw", () => {
  it("never picks the same person twice", () => {
    const w = drawWinners([{ userId: 1, tickets: 100 }, { userId: 2, tickets: 1 }], 2, () => 0);
    expect(w).toEqual([1, 2]);
  });
  it("gives fewer winners when fewer people took part", () => {
    expect(drawWinners([{ userId: 7, tickets: 3 }], 3)).toEqual([7]);
  });
  it("follows ticket weight", () => {
    // 3 tickets for #1, 1 for #2: a roll in the last quarter picks #2.
    expect(drawWinners([{ userId: 1, tickets: 3 }, { userId: 2, tickets: 1 }], 1, () => 0.8)).toEqual([2]);
    expect(drawWinners([{ userId: 1, tickets: 3 }, { userId: 2, tickets: 1 }], 1, () => 0.7)).toEqual([1]);
  });
});
