// VIP levels + cashback. Turnover = the customer's approved bot deposits (all time). Each approved
// bot deposit pays the level's % to the bonus balance once (guarded by public.cashback_paid).
import { maybeOne, sql } from "./db.server";
import { getSettings, type Settings } from "./settings.server";
import { escapeHtml, tg, telegramMode } from "./telegram.server";
import { cashbackFor, safeVipLevels, vipPosition, type VipLevel } from "@/lib/vip-rules";
import { formatSom } from "@/lib/format";

export function vipConfig(s: Settings): { enabled: boolean; levels: VipLevel[] } {
  const levels = safeVipLevels(s.vip_levels);
  return { enabled: s.vip_enabled === "on" && levels.length > 0, levels };
}

export async function turnoverOf(userId: number): Promise<number> {
  const r = await maybeOne(sql<{ t: number }[]>`select coalesce(sum(amount), 0)::float8 as t from public.transactions
    where user_id = ${userId} and type = 'bk_deposit' and status = 'approved' and source = 'bot'`);
  return Number(r?.t ?? 0);
}

export async function vipStatus(userId: number, s: Settings) {
  const c = vipConfig(s);
  const turnover = await turnoverOf(userId);
  return { ...c, turnover, pos: vipPosition(turnover, c.levels) };
}

/** Customers per level (for the admin panel). */
export async function vipLevelCounts(levels: VipLevel[]): Promise<number[]> {
  const rows = await sql<{ t: number }[]>`select sum(amount)::float8 as t from public.transactions
    where type = 'bk_deposit' and status = 'approved' and source = 'bot' group by user_id`;
  const counts = levels.map(() => 0);
  for (const r of rows) {
    const i = vipPosition(Number(r.t), levels).index;
    if (i >= 0) counts[i]! += 1;
  }
  return counts;
}

type DoneTx = { id: string; user_id: number; number: number; amount: number };

/** After an approved bot deposit: pay the cashback once and tell the customer (and about a new level). */
export async function payCashback(tx: DoneTx) {
  const s = await getSettings();
  const c = vipConfig(s);
  if (!c.enabled) return null;
  const turnover = await turnoverOf(tx.user_id);
  const pos = vipPosition(turnover, c.levels);
  const before = vipPosition(Math.max(0, turnover - Number(tx.amount)), c.levels);
  const cash = pos.level ? cashbackFor(Number(tx.amount), pos.level.pct) : 0;
  const levelUp = pos.index > before.index && pos.level;

  let balance: number | null = null;
  if (cash > 0 && pos.level) {
    balance = await sql.begin(async (q) => {
      const claimed = await q`insert into public.cashback_paid (tx_id, user_id, amount, level)
        values (${tx.id}, ${tx.user_id}, ${cash}, ${pos.level!.name}) on conflict do nothing returning tx_id`;
      if (!claimed.length) return null;
      const up = await q<{ balance: number }[]>`update public.tg_users set balance = balance + ${cash}
        where id = ${tx.user_id} returning balance::float8 as balance`;
      await q`insert into public.transactions (user_id, type, status, amount, admin_note, source, processed_at)
        values (${tx.user_id}, 'adjustment', 'approved', ${cash}, ${`Keshbek #${tx.number} (${pos.level!.name} ${pos.level!.pct}%)`}, 'cashback', now())`;
      return Number(up[0]?.balance ?? 0);
    });
    if (balance === null) return null; // already paid for this deposit
  }
  if (telegramMode() === "none" || (balance === null && !levelUp)) return { cash, levelUp: !!levelUp };

  const u = await maybeOne(sql<{ lang: string }[]>`select lang from public.tg_users where id = ${tx.user_id}`);
  const ru = u?.lang === "ru";
  const lines: string[] = [];
  if (levelUp && pos.level) {
    lines.push(
      ru
        ? `👑 <b>Поздравляем! Новый уровень: ${escapeHtml(pos.level.name)}</b>\n🎁 Кэшбэк теперь ${pos.level.pct}% с каждого пополнения.`
        : `👑 <b>Tabriklaymiz! Yangi daraja: ${escapeHtml(pos.level.name)}</b>\n🎁 Endi har to'ldirishdan ${pos.level.pct}% keshbek.`,
    );
  }
  if (balance !== null && pos.level) {
    lines.push(
      ru
        ? `🎁 <b>Кэшбэк +${formatSom(cash)} сум</b> (${escapeHtml(pos.level.name)}, ${pos.level.pct}%) за пополнение #${tx.number}\n💰 Бонусный баланс: <b>${formatSom(balance)} сум</b>`
        : `🎁 <b>Keshbek +${formatSom(cash)} so'm</b> (${escapeHtml(pos.level.name)}, ${pos.level.pct}%) — #${tx.number} to'ldirish uchun\n💰 Bonus balans: <b>${formatSom(balance)} so'm</b>`,
    );
  }
  await tg("sendMessage", { chat_id: tx.user_id, text: lines.join("\n\n"), parse_mode: "HTML" }).catch(() => undefined);
  return { cash, levelUp: !!levelUp };
}
