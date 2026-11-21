// VIP levels and cashback. Pure, so they are tested. A level is reached by the customer's total
// approved bot deposits (all time); each approved deposit pays `pct` % of it to the bonus balance.

export type VipLevel = { name: string; from: number; pct: number };

export const VIP_MAX_LEVELS = 10;
export const VIP_MAX_PCT = 20;

/** Starter levels shown in the admin panel (VIP stays off until the admin switches it on). */
export const VIP_DEFAULT_LEVELS = "Bronza | 0 | 0.5\nKumush | 1000000 | 1\nOltin | 5000000 | 1.5\nPlatina | 20000000 | 2";

const toNum = (v: string) => Number(v.replace(/[\s'_]/g, "").replace(",", "."));

/** Lines "Name | from som | cashback %" → levels sorted by `from`. Bad lines throw a clear error. */
export function parseVipLevels(text: string): VipLevel[] {
  const out: VipLevel[] = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("|").map((p) => p.trim());
    const [name = "", fromS = "", pctS = ""] = parts;
    const from = toNum(fromS);
    const pct = toNum(pctS);
    if (parts.length !== 3 || !name || name.length > 24) throw new Error(`vip_bad_line:${i + 1}`);
    if (!Number.isFinite(from) || from < 0) throw new Error(`vip_bad_from:${i + 1}`);
    if (!Number.isFinite(pct) || pct < 0 || pct > VIP_MAX_PCT) throw new Error(`vip_bad_pct:${i + 1}`);
    out.push({ name, from: Math.floor(from), pct: Math.round(pct * 100) / 100 });
  }
  if (out.length > VIP_MAX_LEVELS) throw new Error("vip_too_many");
  out.sort((a, b) => a.from - b.from);
  for (let i = 1; i < out.length; i++) if (out[i]!.from === out[i - 1]!.from) throw new Error("vip_same_from");
  return out;
}

/** Same as parseVipLevels but never throws (bad saved text = no levels). */
export function safeVipLevels(text: string | undefined): VipLevel[] {
  try {
    return parseVipLevels(text ?? "");
  } catch {
    return [];
  }
}

export function formatVipLevels(levels: VipLevel[]): string {
  return levels.map((l) => `${l.name} | ${l.from} | ${l.pct}`).join("\n");
}

export type VipPosition = {
  /** Index in `levels`, -1 = below the first level. */
  index: number;
  level: VipLevel | null;
  next: VipLevel | null;
  /** Som still needed for the next level (0 when at the top). */
  toNext: number;
};

export function vipPosition(turnover: number, levels: VipLevel[]): VipPosition {
  let index = -1;
  for (let i = 0; i < levels.length; i++) if (turnover >= levels[i]!.from) index = i;
  const next = levels[index + 1] ?? null;
  return { index, level: levels[index] ?? null, next, toNext: next ? Math.max(0, next.from - turnover) : 0 };
}

/** Cashback in whole som (rounded down). */
export function cashbackFor(amount: number, pct: number): number {
  if (!(amount > 0) || !(pct > 0)) return 0;
  return Math.floor((Math.floor(amount) * Math.round(pct * 100)) / 10_000);
}
