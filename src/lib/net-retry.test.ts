import { describe, expect, it } from "vitest";
import { isConnectError } from "./net-retry";

describe("isConnectError", () => {
  it("retries the Railway connect timeout (fetch failed → AggregateError ETIMEDOUT)", () => {
    const agg = Object.assign(new Error(""), { code: "ETIMEDOUT", errors: [Object.assign(new Error(), { code: "ETIMEDOUT" })] });
    expect(isConnectError(new TypeError("fetch failed", { cause: agg }))).toBe(true);
  });
  it("does not retry a reset mid-request (message may already be sent)", () => {
    expect(isConnectError(new TypeError("fetch failed", { cause: Object.assign(new Error(), { code: "ECONNRESET" }) }))).toBe(false);
  });
  it("does not retry ordinary errors", () => {
    expect(isConnectError(new Error("boom"))).toBe(false);
  });
});
