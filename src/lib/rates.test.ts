import { describe, expect, it } from "vitest";
import { rateLines } from "./rates";

describe("admin rate lines", () => {
  it("shows each typed line as one rate, skipping empty lines", () => {
    expect(rateLines("1 1XBET UZB = 1 UZS\n\n 1 1XBET RUB = 160 UZS \r\n1 1XBET USD = 12500 UZS\n")).toEqual([
      "1 1XBET UZB = 1 UZS",
      "1 1XBET RUB = 160 UZS",
      "1 1XBET USD = 12500 UZS",
    ]);
  });
  it("empty text means no admin rates (the bot uses its default)", () => {
    expect(rateLines("  \n ")).toEqual([]);
  });
});
