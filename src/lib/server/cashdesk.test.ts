import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cashdeskCreds, cashdeskDt, classifyResponse, confirmFor, depositSumma, mergeCredSources, signBalance, signDeposit, signPayout } from "./cashdesk.server";

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

  it("admin panel keys turn on auto mode and win over env; empty panel values keep env", () => {
    expect(cashdeskCreds("linebet", mergeCredSources({}, env))?.cashdeskId).toBe("1177830");
    const merged = mergeCredSources(env, { LINEBET_CASHDESK_ID: "999", LINEBET_HASH: "" });
    expect(cashdeskCreds("linebet", merged)?.cashdeskId).toBe("999");
    expect(cashdeskCreds("linebet", merged)?.hash).toBe("h4sh");
  });

  it("signs the balance check and formats the time in UTC", () => {
    const c = cashdeskCreds("linebet", env)!;
    expect(cashdeskDt(new Date(Date.UTC(2026, 0, 5, 3, 4, 9)))).toBe("2026.01.05 03:04:09");
    const dt = "2026.01.05 03:04:09";
    expect(signBalance(dt, c)).toBe(
      sha256(sha256(`hash=h4sh&cashierpass=pass&dt=${dt}`) + md5(`dt=${dt}&cashierpass=pass&cashdeskid=1177830`)),
    );
  });
});
