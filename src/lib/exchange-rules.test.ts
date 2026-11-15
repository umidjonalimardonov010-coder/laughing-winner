import { describe, expect, it } from "vitest";
import { depositSplit, parseAccountId, parseAmount, parseUzCard, parseWithdrawCode, pickPayAmount, withdrawSplit } from "./exchange-rules";

describe("card number", () => {
  it("accepts UZCARD and HUMO 16-digit numbers, with spaces", () => {
    expect(parseUzCard("8600 1234 5678 9000")).toBe("8600123456789000");
    expect(parseUzCard("9860606766730573")).toBe("9860606766730573");
    expect(parseUzCard("5614683014736615")).toBe("5614683014736615");
  });
  it("refuses Visa/Mastercard and wrong lengths", () => {
    expect(parseUzCard("4111111111111111")).toBeNull();
    expect(parseUzCard("860012345678900")).toBeNull();
  });
});

describe("account id and code", () => {
  it("account id is 5–15 digits", () => {
    expect(parseAccountId("284857585")).toBe("284857585");
    expect(parseAccountId("1234")).toBeNull();
    expect(parseAccountId("abc12345")).toBeNull();
  });
  it("withdraw code is exactly 4 letters or digits", () => {
    expect(parseWithdrawCode("aB3d")).toBe("aB3d");
    expect(parseWithdrawCode("abcde")).toBeNull();
  });
});

describe("amount", () => {
  it("reads spaces and a ,00 tail", () => {
    expect(parseAmount("50 000")).toBe(50000);
    expect(parseAmount("15 000 000,00")).toBe(15000000);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("50k")).toBeNull();
  });
});

describe("pay amount tail", () => {
  it("adds 100–999 so'm", () => {
    const p = pickPayAmount(50000, [], () => 0.6);
    expect(p).toBe(50640);
  });
  it("never repeats an amount another open deposit already uses", () => {
    expect(pickPayAmount(50000, [50640], () => 0.6)).not.toBe(50640);
  });
});

describe("splits", () => {
  it("deposit: bonus added, fee taken", () => {
    expect(depositSplit(100000, 1, 0)).toEqual({ bonus: 1000, fee: 0, receive: 101000 });
    expect(depositSplit(100000, 0, 2)).toEqual({ bonus: 0, fee: 2000, receive: 98000 });
  });
  it("withdraw: fee taken from the payout", () => {
    expect(withdrawSplit(200000, 1.5)).toEqual({ fee: 3000, send: 197000 });
    expect(withdrawSplit(200000, 0)).toEqual({ fee: 0, send: 200000 });
  });
});
