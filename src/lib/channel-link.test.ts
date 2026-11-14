import { describe, expect, it } from "vitest";
import { channelFromBotPromotion, channelFromForward, isInviteLink } from "./channel-link";

describe("selfie channel linking", () => {
  it("reads the channel id from a forwarded channel post", () => {
    const msg = { forward_origin: { type: "channel", chat: { id: -1001234567890, type: "channel", title: "Selfi" } } };
    expect(channelFromForward(msg)).toEqual({ id: -1001234567890, title: "Selfi" });
  });

  it("ignores messages forwarded from a person", () => {
    expect(channelFromForward({ forward_origin: { type: "user", sender_user: { id: 5 } } })).toBeNull();
  });

  it("links the channel only when the bot becomes an administrator", () => {
    const base = { chat: { id: -1009, type: "channel", title: "K" }, old_chat_member: { status: "left" } };
    expect(channelFromBotPromotion({ ...base, new_chat_member: { status: "administrator" } })?.id).toBe(-1009);
    expect(channelFromBotPromotion({ ...base, new_chat_member: { status: "member" } })).toBeNull();
  });

  it("treats t.me/+ links as invite links, not ids", () => {
    expect(isInviteLink("https://t.me/+DVLK28ZgnFEyZGEy")).toBe(true);
    expect(isInviteLink("-1001234567890")).toBe(false);
  });
});
