import { describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "./memo.server";
import { signRead } from "./media.server";

describe("wallet speed helpers", () => {
  it("reuses a cached value instead of asking the database again", async () => {
    clearCache();
    const load = vi.fn(async () => 42);
    expect(await cached("k", 10_000, load)).toBe(42);
    expect(await cached("k", 10_000, load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
    clearCache("k");
    await cached("k", 10_000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("gives the same picture link on repeated opens so phones can cache it", () => {
    process.env["SESSION_SECRET"] = "x".repeat(40);
    const a = signRead("media", "logos/a.png", 86400);
    const b = signRead("media", "logos/a.png", 86400);
    expect(a).toEqual(b);
    expect(a.exp * 1000).toBeGreaterThanOrEqual(Date.now() + 86400 * 1000 - 1000);
  });
});
