// Admin panel «VIP va Konkurs»: VIP levels + cashback and the weekly contest. Admin session first.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./server/admin-session.server";
import { getSettings, saveSettings } from "./server/settings.server";
import { ensureMigrations } from "./server/migrations.server";
import { vipConfig, vipLevelCounts } from "./server/vip.server";
import { drawCurrentWeekNow, getDraw, listDraws, startContestWatcher, weekEntries } from "./server/contest.server";
import { formatVipLevels, parseVipLevels, VIP_DEFAULT_LEVELS } from "./vip-rules";
import { contestConfig, parsePrizes, weekOf } from "./contest-rules";

export const adminVipOverview = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  await ensureMigrations();
  startContestWatcher();
  const s = await getSettings();
  const vip = vipConfig(s);
  const c = contestConfig(s);
  const now = new Date();
  const week = weekOf(now);
  const [counts, entries, current, draws] = await Promise.all([
    vipLevelCounts(vip.levels),
    weekEntries(week, c, now),
    getDraw(week.key),
    listDraws(10),
  ]);
  return {
    vip: {
      on: s.vip_enabled === "on",
      levelsText: s.vip_levels || VIP_DEFAULT_LEVELS,
      levels: vip.levels,
      counts,
    },
    contest: {
      on: s.contest_enabled === "on",
      prizes: s.contest_prizes || "",
      ticketSom: String(c.ticketSom),
      minSom: String(c.minSom),
      announce: s.contest_announce === "on",
      week: { key: week.key, endsAt: week.end.toISOString(), closed: !!current },
      entrants: entries.length,
      tickets: entries.reduce((a, e) => a + e.tickets, 0),
      top: entries.slice(0, 20),
      draws,
    },
  };
});

export const adminSaveVip = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ on: z.boolean(), levels: z.string().max(2000) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const levels = parseVipLevels(data.levels);
    if (data.on && !levels.length) throw new Error("vip_no_levels");
    await saveSettings({ vip_enabled: data.on ? "on" : "off", vip_levels: formatVipLevels(levels) });
    return { ok: true };
  });

export const adminSaveContest = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        on: z.boolean(),
        prizes: z.string().max(300),
        ticketSom: z.string().max(20),
        minSom: z.string().max(20),
        announce: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const prizes = parsePrizes(data.prizes);
    if (data.on && !prizes.length) throw new Error("contest_no_prizes");
    const digits = (v: string) => v.replace(/[\s,'_]/g, "");
    const ticket = digits(data.ticketSom);
    const min = digits(data.minSom) || ticket;
    if (!/^\d+$/.test(ticket) || Number(ticket) < 1000) throw new Error("contest_bad_ticket");
    if (!/^\d+$/.test(min)) throw new Error("contest_bad_min");
    const s = await getSettings();
    // Switching on starts the count: weeks that ended before this moment are never drawn.
    const since = data.on && s.contest_enabled !== "on" ? new Date().toISOString() : s.contest_since || (data.on ? new Date().toISOString() : "");
    await saveSettings({
      contest_enabled: data.on ? "on" : "off",
      contest_prizes: prizes.join(", "),
      contest_ticket_som: ticket,
      contest_min_som: min,
      contest_announce: data.announce ? "on" : "off",
      contest_since: since,
    });
    return { ok: true };
  });

export const adminDrawContestNow = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  return drawCurrentWeekNow();
});
