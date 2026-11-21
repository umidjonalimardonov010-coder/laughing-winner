// Weekly contest: customers get tickets for their approved bot deposits in a Tashkent week
// (Monday 00:00 → next Monday 00:00, UTC+5); winners are drawn by ticket weight. Pure, so tested.

export type ContestConfig = { enabled: boolean; prizes: number[]; ticketSom: number; minSom: number; announce: boolean };

export const CONTEST_MAX_PRIZES = 10;
const OFFSET = 5 * 3600_000;
const DAY = 86_400_000;

const whole = (v: string | undefined, fallback: number) => {
  const n = Number(String(v ?? "").replace(/[\s,'_]/g, ""));
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/** "100 000, 50000; 25000" → [100000, 50000, 25000]. Throws on a bad entry. */
export function parsePrizes(text: string): number[] {
  const parts = text.split(/[,;\n]+/).map((p) => p.replace(/[\s'_]/g, "")).filter(Boolean);
  const out = parts.map((p) => {
    if (!/^\d+$/.test(p) || Number(p) <= 0) throw new Error("contest_bad_prize");
    return Number(p);
  });
  if (out.length > CONTEST_MAX_PRIZES) throw new Error("contest_too_many");
  return out;
}

export function contestConfig(s: Partial<Record<string, string>>): ContestConfig {
  let prizes: number[] = [];
  try {
    prizes = parsePrizes(s["contest_prizes"] ?? "");
  } catch {
    prizes = [];
  }
  const ticketSom = Math.max(1000, whole(s["contest_ticket_som"], 50_000));
  return {
    enabled: s["contest_enabled"] === "on" && prizes.length > 0,
    prizes,
    ticketSom,
    minSom: whole(s["contest_min_som"], ticketSom),
    announce: s["contest_announce"] === "on",
  };
}

export type Week = { key: string; start: Date; end: Date };

/** The Tashkent week (Mon–Sun) that contains `now`. `key` is its Monday as YYYY-MM-DD. */
export function weekOf(now: Date = new Date()): Week {
  const day = Math.floor((now.getTime() + OFFSET) / DAY);
  // 1970-01-01 was a Thursday: (day + 3) % 7 is 0 on Mondays.
  const monday = day - ((day + 3) % 7);
  const start = new Date(monday * DAY - OFFSET);
  return { key: new Date(monday * DAY).toISOString().slice(0, 10), start, end: new Date(start.getTime() + 7 * DAY) };
}

export function previousWeek(now: Date = new Date()): Week {
  return weekOf(new Date(weekOf(now).start.getTime() - 1));
}

export function ticketsFor(sum: number, c: Pick<ContestConfig, "ticketSom" | "minSom">): number {
  if (!(sum > 0) || sum < c.minSom) return 0;
  return Math.max(1, Math.floor(sum / c.ticketSom));
}

export type Entry = { userId: number; tickets: number };

/**
 * One winner per prize, picked by ticket weight; a person wins at most once. Fewer entrants than
 * prizes → only that many winners.
 */
export function drawWinners(entries: Entry[], places: number, rand: () => number = Math.random): number[] {
  const pool = entries.filter((e) => e.tickets > 0).map((e) => ({ ...e }));
  const winners: number[] = [];
  while (winners.length < places && pool.length) {
    const total = pool.reduce((a, e) => a + e.tickets, 0);
    let r = Math.min(total - 1, Math.floor(rand() * total));
    let i = 0;
    while (r >= pool[i]!.tickets) r -= pool[i++]!.tickets;
    winners.push(pool[i]!.userId);
    pool.splice(i, 1);
  }
  return winners;
}

/** "Jasur •••789" — enough for others to trust the draw, without showing the full ID. */
export function maskWinner(name: string | null | undefined, userId: number): string {
  const n = (name ?? "").trim().split(/\s+/)[0]?.slice(0, 16) || "Mijoz";
  return `${n} •••${String(userId).slice(-3)}`;
}
