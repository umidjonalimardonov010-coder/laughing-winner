import { describe, expect, it } from "vitest";
import { referralLink, shareLink } from "./referral";

describe("referral link", () => {
  it("is a full t.me link with the user's id", () => {
    expect(referralLink("kassa_bot", 8787603995)).toBe("https://t.me/kassa_bot?start=8787603995");
  });
  it("works when the bot name was saved with @", () => {
    expect(referralLink("@kassa_bot", 5)).toBe("https://t.me/kassa_bot?start=5");
  });
  it("is empty (not just the id) while the bot name is unknown", () => {
    expect(referralLink("", 5)).toBe("");
  });
  it("share link carries the invite link", () => {
    expect(shareLink("https://t.me/kassa_bot?start=5", "hi")).toContain(encodeURIComponent("https://t.me/kassa_bot?start=5"));
  });
});
