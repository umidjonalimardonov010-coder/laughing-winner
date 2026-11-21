import { describe, expect, it } from "vitest";
import { isRequiredChannel, isSubscribed, parseRequiredChannels } from "./subscription-rules";

describe("mandatory subscription channel list", () => {
  it("accepts @username and t.me links for public channels", () => {
    const { channels, errors } = parseRequiredChannels("@kassa_news\nhttps://t.me/linebet_uz");
    expect(errors).toEqual([]);
    expect(channels).toEqual([
      { chat: "@kassa_news", url: "https://t.me/kassa_news" },
      { chat: "@linebet_uz", url: "https://t.me/linebet_uz" },
    ]);
  });

  it("needs the channel id together with the invite link for a private channel", () => {
    const ok = parseRequiredChannels("-1001234567890 https://t.me/+AbC123xyz");
    expect(ok.channels).toEqual([{ chat: "-1001234567890", url: "https://t.me/+AbC123xyz" }]);
    expect(parseRequiredChannels("https://t.me/+AbC123xyz").errors).toHaveLength(1);
    expect(parseRequiredChannels("-1001234567890").errors).toHaveLength(1);
  });

  it("allows at most 5 channels", () => {
    const text = ["@aaaa1", "@aaaa2", "@aaaa3", "@aaaa4", "@aaaa5", "@aaaa6"].join("\n");
    const r = parseRequiredChannels(text);
    expect(r.channels).toHaveLength(5);
    expect(r.errors).toHaveLength(1);
  });

  it("counts only real members as subscribed", () => {
    expect(isSubscribed({ status: "member" })).toBe(true);
    expect(isSubscribed({ status: "creator" })).toBe(true);
    expect(isSubscribed({ status: "left" })).toBe(false);
    expect(isSubscribed({ status: "kicked" })).toBe(false);
    expect(isSubscribed({ status: "restricted", is_member: false })).toBe(false);
    expect(isSubscribed({ status: "restricted", is_member: true })).toBe(true);
  });

  it("recognises a required channel by id or username", () => {
    const list = parseRequiredChannels("@Kassa_News\n-1001234567890 https://t.me/+abcdef").channels;
    expect(isRequiredChannel(list, { id: -1009, username: "kassa_news" })).toBe(true);
    expect(isRequiredChannel(list, { id: -1001234567890 })).toBe(true);
    expect(isRequiredChannel(list, { id: -1005 })).toBe(false);
  });
});
