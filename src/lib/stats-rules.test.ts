import { describe, expect, it } from "vitest";
import { statsStart } from "./stats-rules";

describe("dashboard reset", () => {
  const period = new Date("2026-11-01T00:00:00Z");
  it("counts only from the reset moment after the admin resets", () => {
    expect(statsStart(period, "2026-11-22T18:00:00Z").toISOString()).toBe("2026-11-22T18:00:00.000Z");
  });
  it("keeps the chosen range when the reset is older or never happened", () => {
    expect(statsStart(period, "2026-10-01T00:00:00Z")).toBe(period);
    expect(statsStart(period, undefined)).toBe(period);
    expect(statsStart(period, "garbage")).toBe(period);
  });
});
