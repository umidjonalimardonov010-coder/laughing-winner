import { describe, expect, it } from "vitest";
import { cashdeskVerdict, missingCreds } from "./cashdesk.server";

const fail = (status: number) => ({ ok: false as const, status, message: `HTTP ${status}`, hint: "" });
const state = (v: ReturnType<typeof cashdeskVerdict>, id: string) => v.steps.find((s) => s.id === id)?.state;

describe("cashdesk connection check verdict", () => {
  it("names the missing cashier password and does not call Linebet", () => {
    const src = { LINEBET_CASHDESK_ID: "1517742", LINEBET_HASH: "h" };
    expect(missingCreds("LINEBET", src)).toEqual(["CASHIER_PASS"]);
    const v = cashdeskVerdict({ missing: ["CASHIER_PASS"] });
    expect(v.level).toBe("error");
    expect(v.hint).toContain("kassir paroli");
    expect(state(v, "keys")).toBe("fail");
    expect(state(v, "reach")).toBe("skip");
  });

  it("reports working connection when the balance answers", () => {
    const v = cashdeskVerdict({ missing: [], balance: { ok: true, balance: 100, limit: 0 } });
    expect(v.level).toBe("ok");
    expect(v.steps.filter((s) => s.state === "ok").map((s) => s.id)).toEqual(["keys", "reach", "ip", "auth"]);
  });

  it("points at the IP allow-list on 403 and at the keys on 401", () => {
    expect(state(cashdeskVerdict({ missing: [], balance: fail(403) }), "ip")).toBe("fail");
    const v401 = cashdeskVerdict({ missing: [], balance: fail(401) });
    expect(state(v401, "ip")).toBe("ok");
    expect(state(v401, "auth")).toBe("fail");
  });

  it("warns when keys work but the player ID is unknown", () => {
    const v = cashdeskVerdict({ missing: [], balance: { ok: true, balance: 0, limit: 0 }, player: { found: false, name: null } });
    expect(v.level).toBe("warn");
    expect(state(v, "player")).toBe("fail");
  });

  it("network failure marks the server as unreachable", () => {
    expect(state(cashdeskVerdict({ missing: [], balance: fail(0) }), "reach")).toBe("fail");
  });
});
