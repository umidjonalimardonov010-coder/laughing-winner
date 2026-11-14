import { describe, expect, it } from "vitest";
import { assertPhone, isOwnContact, isOwnSelfiePath, normalizePhone, selfiePathFor } from "./verification";

describe("phone number rules", () => {
  it("accepts only the sender's own contact", () => {
    expect(isOwnContact({ user_id: 555 }, 555)).toBe(true);
    expect(isOwnContact({ user_id: 777 }, 555)).toBe(false);
    expect(isOwnContact({}, 555)).toBe(false);
  });

  it("blocks deposits and withdrawals without a phone number", () => {
    expect(() => assertPhone({ phone: null })).toThrow("phone_required");
    expect(() => assertPhone({ phone: "" })).toThrow("phone_required");
    expect(() => assertPhone({ phone: "+998901234567" })).not.toThrow();
  });

  it("normalizes Telegram phone formats", () => {
    expect(normalizePhone("998901234567")).toBe("+998901234567");
    expect(normalizePhone("+998 90 123-45-67")).toBe("+998901234567");
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("withdrawal selfie", () => {
  it("only accepts a selfie uploaded by the same user", () => {
    const p = selfiePathFor(555, 1700000000000, "abcd1234");
    expect(isOwnSelfiePath(p, 555)).toBe(true);
    expect(isOwnSelfiePath(p, 556)).toBe(false);
    expect(isOwnSelfiePath("555/receipt.jpg", 555)).toBe(false);
    expect(isOwnSelfiePath(null, 555)).toBe(false);
  });
});
