import { describe, expect, it } from "vitest";
import { bonusMenuFlags } from "./bonus-menu";

const LEVELS = "Bronza | 0 | 0.5\nOltin | 5000000 | 1.5";

describe("bonusMenuFlags", () => {
  it("hides both buttons when nothing is switched on", () => {
    expect(bonusMenuFlags({})).toEqual({ vip: false, contest: false });
  });
  it("hides VIP when it is off even if levels are saved", () => {
    expect(bonusMenuFlags({ vip_enabled: "off", vip_levels: LEVELS }).vip).toBe(false);
  });
  it("hides VIP when it is on but has no levels", () => {
    expect(bonusMenuFlags({ vip_enabled: "on", vip_levels: "" }).vip).toBe(false);
  });
  it("shows VIP when it is on and has levels", () => {
    expect(bonusMenuFlags({ vip_enabled: "on", vip_levels: LEVELS }).vip).toBe(true);
  });
  it("hides the contest when it is on but has no prizes", () => {
    expect(bonusMenuFlags({ contest_enabled: "on", contest_prizes: "" }).contest).toBe(false);
  });
  it("hides the contest when it is off even with prizes", () => {
    expect(bonusMenuFlags({ contest_enabled: "off", contest_prizes: "500000" }).contest).toBe(false);
  });
  it("shows the contest when it is on and has prizes", () => {
    expect(bonusMenuFlags({ contest_enabled: "on", contest_prizes: "500000" }).contest).toBe(true);
  });
});
