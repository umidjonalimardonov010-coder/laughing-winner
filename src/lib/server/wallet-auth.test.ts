import { describe, expect, it } from "vitest";
import { needsUserWrite } from "./wallet-auth.server";
import type { TgUser } from "./users.server";

const now = Date.parse("2026-11-14T03:00:00.000Z");
const user = {
  id: 1, username: "ali", first_name: "Ali", last_name: null, photo_url: null,
  last_seen_at: "2026-11-14T02:55:00.000Z",
} as TgUser;

describe("needsUserWrite", () => {
  it("writes a brand-new user", () => {
    expect(needsUserWrite(null, { id: 1 }, now)).toBe(true);
  });
  it("skips the write for a known user seen 5 minutes ago with same names", () => {
    expect(needsUserWrite(user, { id: 1, username: "ali", first_name: "Ali" }, now)).toBe(false);
  });
  it("writes when the user was last seen over 10 minutes ago", () => {
    expect(needsUserWrite({ ...user, last_seen_at: "2026-11-14T02:49:00.000Z" }, { id: 1, username: "ali", first_name: "Ali" }, now)).toBe(true);
  });
  it("writes when the username changed", () => {
    expect(needsUserWrite(user, { id: 1, username: "vali", first_name: "Ali" }, now)).toBe(true);
  });
});
