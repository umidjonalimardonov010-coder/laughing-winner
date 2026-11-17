import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { isAmountBusyError, nextFreeAmount, parseHamyonCallback, payMinutes, paySummary, payText, signSource } from "./hamyon-rules";

describe("HamyonAPI rules", () => {
  it("keeps the sum when it is free", () => {
    expect(nextFreeAmount(500000, [])).toBe(500000);
  });
  it("adds 1 so'm when the same sum is already open", () => {
    expect(nextFreeAmount(500000, [500000])).toBe(500001);
    expect(nextFreeAmount(500000, [500000, 500001, 500002])).toBe(500003);
  });
  it("recognises the 'open payment with this sum' error", () => {
    expect(isAmountBusyError("Bu summada ochiq to'lov mavjud...")).toBe(true);
    expect(isAmountBusyError("Do'kon topilmadi!")).toBe(false);
  });
  it("shows the real HamyonAPI time: 300 s = 5 minutes, never rounded up", () => {
    expect(payMinutes(300)).toBe(5);
    expect(payMinutes(359)).toBe(5);
    expect(payMinutes(undefined)).toBe(5);
  });
  it("signature source is shop_id + payment_id + amount + shop_key", () => {
    const sign = createHash("md5").update(signSource("12", "a1b2c3d4e5f6", "50000", "sk_x")).digest("hex");
    expect(sign).toBe(createHash("md5").update("12a1b2c3d4e5f650000sk_x").digest("hex"));
  });
  it("rejects a callback without a valid signature", () => {
    expect(parseHamyonCallback({ payment_id: "abc", amount: "50000", sign: "nope" })).toBeNull();
    const ok = parseHamyonCallback({ payment_id: "abc", amount: "50000", status: "PAID", sign: "a".repeat(32) });
    expect(ok?.status).toBe("paid");
  });
  it("payment text has the sum, the card digits and the warning", () => {
    const t = payText("uz", 500001, "9860 3401 0172 3997", 5);
    expect(t).toContain("O'tkazish kerak: <code>500001</code> so'm");
    expect(t).toContain("<code>9860340101723997</code>");
    expect(t).toContain("5 DAQIQA ICHIDA OTKAZISH SHART");
    expect(t).toContain("PULINGIZGA KUYASIZ!");
  });
  it("receipt shows the request number, ID, sum, commission and the card", () => {
    const t = paySummary("uz", { number: 688496, bk: "LINEBET", account: "533597531", pay: 70000, fee: 0, feePercent: 0, card: "5614 6810 7637 1107" });
    expect(t).toContain("#688496");
    expect(t).toContain("LINEBET ID: 533597531");
    expect(t).toContain("Summa: 70000 so`m");
    expect(t).toContain("Komissiya: 0 so`m (0%)");
    expect(t).toContain("<b>70000</b> summani <code>5614681076371107</code> kartaga");
  });
});
