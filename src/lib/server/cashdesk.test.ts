import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cashdeskCreds, classifyResponse, confirmFor, depositSumma, signDeposit, signPayout } from "./cashdesk.server";

const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const env = { LINEBET_CASHDESK_ID: "1177830", LINEBET_CASHIER_PASS: "pass", LINEBET_HASH: "h4sh" };

describe("cashdesk", () => {
  it("only LINEBET is automatic, and only when all three credentials are set", () => {
    expect(cashdeskCreds("linebet", env)?.cashdeskId).toBe("1177830");
    expect(cashdeskCreds("1xbet", env)).toBeNull();
    expect(cashdeskCreds("linebet", { ...env, LINEBET_HASH: "" })).toBeNull();
  });

  it("signs deposit and payout as the cashdesk API expects", () => {
    const c = cashdeskCreds("linebet", env)!;
    expect(confirmFor("12345", c)).toBe(md5("12345:h4sh"));
    expect(signDeposit("12345", 50000, c)).toBe(
      sha256(sha256("hash=h4sh&lng=ru&userid=12345") + md5("summa=50000&cashierpass=pass&cashdeskid=1177830")),
    );
    expect(signPayout("12345", "ab12", c)).toBe(
      sha256(sha256("hash=h4sh&lng=ru&userid=12345") + md5("code=ab12&cashierpass=pass&cashdeskid=1177830")),
    );
  });

  it("player gets the amount plus bonus minus fee", () => {
    expect(depositSumma(100000, 5000, 2000)).toBe(103000);
  });

  it("refunds only on a clear refusal; unclear answers wait for an admin", () => {
    expect(classifyResponse(200, { Success: true, Summa: -75000 })).toMatchObject({ kind: "ok", summa: 75000 });
    expect(classifyResponse(200, { Success: false, Message: "wrong code" }).kind).toBe("rejected");
    expect(classifyResponse(502, null).kind).toBe("unknown");
    expect(classifyResponse(200, null).kind).toBe("unknown");
  });
});
