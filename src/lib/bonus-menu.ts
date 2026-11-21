// Which optional buttons the bot's bonus menu shows. Pure, so it is tested.
// VIP shows only when the admin switched it on and saved at least one level;
// the contest shows only when it is switched on and has at least one prize.
import { safeVipLevels } from "./vip-rules";
import { contestConfig } from "./contest-rules";

export type BonusMenuFlags = { vip: boolean; contest: boolean };

export function bonusMenuFlags(s: Partial<Record<string, string>>): BonusMenuFlags {
  return {
    vip: s["vip_enabled"] === "on" && safeVipLevels(s["vip_levels"]).length > 0,
    contest: contestConfig(s).enabled,
  };
}
