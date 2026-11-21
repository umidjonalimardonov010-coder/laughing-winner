// Weekly contest. Tickets come from approved bot deposits inside a Tashkent week; after the week
// ends the draw runs once (public.contest_draws row claimed first, prizes paid in the same
// transaction) — so two servers or a restart never pay twice.
import { maybeOne, sql, ts } from "./db.server";
import { getSettings, publicBase, type Settings } from "./settings.server";
import { escapeHtml, tg, telegramMode } from "./telegram.server";
import { inBackground } from "./notify.server";
import { startBroadcast } from "./broadcast.server";
import { contestConfig, drawWinners, maskWinner, previousWeek, ticketsFor, weekOf, type ContestConfig, type Week } from "@/lib/contest-rules";
import { formatSom } from "@/lib/format";

export type EntryRow = { user_id: number; name: string | null; sum: number; tickets: number };
export type Winner = { place: number; user_id: number; name: string; prize: number };
export type DrawRow = { week_start: string; closed_at: string; entrants: number; tickets: number; winners: Winner[]; manual: boolean };

async function sums(start: Date, end: Date) {
  return sql<{ user_id: number; name: string | null; sum: number }[]>`
    select t.user_id::float8 as user_id, sum(t.amount)::float8 as sum,
      coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.username) as name
    from public.transactions t join public.tg_users u on u.id = t.user_id
    where t.type = 'bk_deposit' and t.status = 'approved' and t.source = 'bot' and not u.is_blocked
      and t.processed_at >= ${start} and t.processed_at < ${end}
    group by t.user_id, u.first_name, u.last_name, u.username`;
}

export async function weekEntries(week: Week, c: ContestConfig, until = week.end): Promise<EntryRow[]> {
  const rows = await sums(week.start, until);
  return rows
    .map((r) => ({ user_id: Number(r.user_id), name: r.name, sum: Number(r.sum), tickets: ticketsFor(Number(r.sum), c) }))
    .filter((r) => r.tickets > 0)
    .sort((a, b) => b.tickets - a.tickets || b.sum - a.sum);
}

const DRAW_COLS = () => sql`to_char(week_start, 'YYYY-MM-DD') as week_start, ${ts("closed_at")} as closed_at, entrants, tickets, winners, manual`;

export async function getDraw(key: string): Promise<DrawRow | null> {
  return maybeOne(sql<DrawRow[]>`select ${DRAW_COLS()} from public.contest_draws where week_start = ${key}::date`);
}

export async function listDraws(limit = 10): Promise<DrawRow[]> {
  return sql<DrawRow[]>`select ${DRAW_COLS()} from public.contest_draws order by week_start desc limit ${limit}`;
}

/** Draws `week` (entries until `until`) exactly once. Returns null when it was already drawn. */
export async function drawWeek(week: Week, s: Settings, opts: { manual?: boolean; until?: Date } = {}): Promise<DrawRow | null> {
  const c = contestConfig(s);
  const until = opts.until ?? week.end;
  const row = await sql.begin(async (q) => {
    const claimed = await q`insert into public.contest_draws (week_start, closed_at, manual)
      values (${week.key}::date, ${until}, ${!!opts.manual}) on conflict do nothing returning week_start`;
    if (!claimed.length) return null;
    const entries = await weekEntries(week, c, until);
    const ids = drawWinners(entries.map((e) => ({ userId: e.user_id, tickets: e.tickets })), c.prizes.length);
    const winners: Winner[] = [];
    for (const [i, id] of ids.entries()) {
      const prize = c.prizes[i]!;
      const e = entries.find((x) => x.user_id === id)!;
      await q`update public.tg_users set balance = balance + ${prize} where id = ${id}`;
      await q`insert into public.transactions (user_id, type, status, amount, admin_note, source, processed_at)
        values (${id}, 'adjustment', 'approved', ${prize}, ${`Konkurs ${week.key}: ${i + 1}-o'rin`}, 'contest', now())`;
      winners.push({ place: i + 1, user_id: id, name: maskWinner(e.name, id), prize });
    }
    const tickets = entries.reduce((a, e) => a + e.tickets, 0);
    await q`update public.contest_draws set entrants = ${entries.length}, tickets = ${tickets}, winners = ${q.json(winners)}
      where week_start = ${week.key}::date`;
    return true;
  });
  if (!row) return null;
  const draw = await getDraw(week.key);
  if (draw) inBackground("contest-notify", () => announce(draw, s));
  return draw;
}

const MEDAL = ["🥇", "🥈", "🥉"];
const place = (n: number) => MEDAL[n - 1] ?? `${n}.`;

function winnersText(d: DrawRow, ru: boolean) {
  const som = ru ? "сум" : "so'm";
  const list = d.winners.map((w) => `${place(w.place)} ${escapeHtml(w.name)} — <b>${formatSom(w.prize)} ${som}</b>`).join("\n");
  return ru
    ? `🏆 <b>Итоги недельного конкурса</b>\n\n${list}\n\n🎟 Участников: ${d.entrants} · билетов: ${d.tickets}\nНовая неделя уже началась — пополняйте счёт и получайте билеты!`
    : `🏆 <b>Haftalik konkurs g'oliblari</b>\n\n${list}\n\n🎟 Qatnashchilar: ${d.entrants} · chiptalar: ${d.tickets}\nYangi hafta boshlandi — hisob to'ldiring va chipta oling!`;
}

async function announce(d: DrawRow, s: Settings) {
  if (telegramMode() === "none") return;
  const c = contestConfig(s);
  for (const w of d.winners) {
    const u = await maybeOne(sql<{ lang: string; balance: number }[]>`select lang, balance::float8 as balance from public.tg_users where id = ${w.user_id}`);
    const ru = u?.lang === "ru";
    const text = ru
      ? `🎉 <b>Вы заняли ${w.place}-е место в недельном конкурсе!</b>\n🎁 Приз <b>${formatSom(w.prize)} сум</b> зачислен на бонусный баланс (${formatSom(u?.balance ?? 0)} сум).\n\nВывести: 💰 ПОЛУЧИТЬ БОНУС → 💳 БАЛАНС`
      : `🎉 <b>Haftalik konkursda ${w.place}-o'rinni oldingiz!</b>\n🎁 <b>${formatSom(w.prize)} so'm</b> sovrin bonus balansingizga tushdi (${formatSom(u?.balance ?? 0)} so'm).\n\nYechib olish: 💰 BONUS OLISH → 💳 BALANS`;
    await tg("sendMessage", { chat_id: w.user_id, text, parse_mode: "HTML" }).catch(() => undefined);
  }
  const adminText = d.winners.length
    ? `🏆 <b>Konkurs ${d.week_start} o'tkazildi</b>\n\n${d.winners.map((w) => `${place(w.place)} <code>${w.user_id}</code> ${escapeHtml(w.name)} — ${formatSom(w.prize)} so'm`).join("\n")}\n\n🎟 ${d.entrants} qatnashchi · ${d.tickets} chipta`
    : `🏆 Konkurs ${d.week_start}: qatnashchi bo'lmadi, sovrin berilmadi.`;
  for (const id of s.admin_chat_id.split(/[,\s]+/).filter(Boolean)) {
    await tg("sendMessage", { chat_id: id, text: adminText, parse_mode: "HTML" }).catch(() => undefined);
  }
  if (c.announce && d.winners.length) {
    await startBroadcast({ text: winnersText(d, false), mediaPath: null, mediaType: null, buttonText: "", buttonUrl: "" }, "uz", publicBase(s)).catch(() => undefined);
    await startBroadcast({ text: winnersText(d, true), mediaPath: null, mediaType: null, buttonText: "", buttonUrl: "" }, "ru", publicBase(s)).catch(() => undefined);
  }
}

/** Last week's draw, once the week is over — only for weeks that ended after the contest was switched on. */
export async function runDueDraw(now = new Date()) {
  const s = await getSettings();
  const c = contestConfig(s);
  if (!c.enabled) return null;
  const prev = previousWeek(now);
  const since = Date.parse(s.contest_since || "");
  if (!Number.isFinite(since) || prev.end.getTime() <= since) return null;
  if (await getDraw(prev.key)) return null;
  return drawWeek(prev, s);
}

/** Admin: finish this week now (deposits until this moment count; the week is not drawn again). */
export async function drawCurrentWeekNow() {
  const s = await getSettings();
  if (!contestConfig(s).enabled) throw new Error("contest_off");
  const now = new Date();
  const d = await drawWeek(weekOf(now), s, { manual: true, until: now });
  if (!d) throw new Error("contest_already_drawn");
  return d;
}

let lastCheck = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/** Checks for a due draw: every 5 minutes on Railway, and (throttled) on bot updates / panel opens. */
export function startContestWatcher() {
  if (!timer && process.env["RAILWAY_ENVIRONMENT"]) {
    timer = setInterval(() => void runDueDraw().catch((e) => console.error("[contest]", e)), 5 * 60_000);
  }
  if (Date.now() - lastCheck < 5 * 60_000) return;
  lastCheck = Date.now();
  inBackground("contest-draw", () => runDueDraw());
}

/** The customer's view of this week. */
export async function myContest(userId: number, s: Settings, now = new Date()) {
  const c = contestConfig(s);
  const week = weekOf(now);
  const [entries, draw, last] = await Promise.all([weekEntries(week, c, now), getDraw(week.key), getDraw(previousWeek(now).key)]);
  const me = entries.find((e) => e.user_id === userId);
  const mine = await maybeOne(sql<{ sum: number }[]>`select coalesce(sum(amount), 0)::float8 as sum from public.transactions
    where user_id = ${userId} and type = 'bk_deposit' and status = 'approved' and source = 'bot'
      and processed_at >= ${week.start} and processed_at < ${now}`);
  return {
    config: c,
    week,
    closed: !!draw,
    mySum: Number(mine?.sum ?? 0),
    myTickets: me?.tickets ?? 0,
    totalTickets: entries.reduce((a, e) => a + e.tickets, 0),
    entrants: entries.length,
    last,
  };
}
