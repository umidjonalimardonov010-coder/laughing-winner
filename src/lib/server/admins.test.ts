import { describe, expect, it } from "vitest";
import { cleanCardNumber, isAdminId, parseAdminIds, withOwnerAdmin } from "./admins";

describe("telegram admins", () => {
  it("8787603995 becomes an admin when the list is empty", () => {
    expect(withOwnerAdmin("")).toBe("8787603995");
    expect(isAdminId(8787603995, withOwnerAdmin(""))).toBe(true);
  });

  it("existing admins are kept when the owner is added", () => {
    expect(withOwnerAdmin("123456789")).toBe("123456789, 8787603995");
    expect(isAdminId(123456789, withOwnerAdmin("123456789"))).toBe(true);
  });

  it("the owner is not added twice", () => {
    expect(withOwnerAdmin("8787603995, 555000111")).toBe("8787603995, 555000111");
  });

  it("someone not on the list is not an admin", () => {
    expect(isAdminId(100000001, "8787603995")).toBe(false);
    expect(isAdminId(0, "8787603995")).toBe(false);
  });

  it("reads ids separated by commas or spaces and skips junk", () => {
    expect(parseAdminIds("111222333, 444555666 abc, @user")).toEqual([111222333, 444555666]);
  });

  it("top-up card must have exactly 16 digits", () => {
    expect(cleanCardNumber("8600 1234 5678 9012")).toBe("8600123456789012");
    expect(cleanCardNumber("8600 1234")).toBeNull();
  });
});
