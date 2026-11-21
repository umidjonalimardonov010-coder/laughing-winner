// Approve / reject a money request. Shared by the admin panel and the Telegram admin buttons.
// Callers must check that the caller is an admin first.
import { maybeOne, sql } from "./db.server";
import { getSettings, num, type Settings } from "./settings.server";
import { notifyUserStatus } from "./notify.server";
import { TX_COLS, type TxRow } from "./tx.server";
import { isAdminId } from "./admins";
import { releasePromo } from "./safety.server";
import { approveBotRequest, rejectBotRequest, txSource } from "./exchange.server";
import { notifyBonusRefund, rejectBonusWithdraw, rewardReferrer } from "./bonus.server";
import { inBackground } from "./notify.server";
import { payCashback } from "./vip.server";

export async function approveRequest(id: string, amount = 0, note = ""): Promise<TxRow> {
  // Chat-bot requests move money between the card and the bookmaker directly (no wallet balance).
  // 'bonus' = bonus balance sent to LINEBET: same cashdesk top-up as a bot deposit.
  const source = await txSource(id);
  if (source === "bot" || source === "bonus") {
    const done = await approveBotRequest(id, amount, note);
    await notifyUserStatus(done);
    // A friend's first approved deposit pays the inviter's referral reward (once).
    if (source === "bot" && done.type === "bk_deposit") {
      inBackground("referral", () => rewardReferrer(done.user_id));
      // VIP cashback for this deposit (once) and a level-up message.
      inBackground("cashback", () => payCashback(done));
    }
    return done;
  }
  const t = await maybeOne(
    sql<{ bookmaker_id: string | null; type: string }[]>`select bookmaker_id, type from public.transactions where id = ${id}`,
  );
  let feePercent = 0;
  if (t?.bookmaker_id && t.type === "bk_withdraw") {
    const bk = await maybeOne(
      sql<{ withdraw_fee_percent: number }[]>`
        select withdraw_fee_percent::float8 as withdraw_fee_percent from public.bookmakers where id = ${t.bookmaker_id}`,
    );
    feePercent = Number(bk?.withdraw_fee_percent ?? 0);
  }
  const s = await getSettings();
  const rows = await sql<TxRow[]>`
    select ${TX_COLS()} from approve_transaction(
      ${id}, ${amount}, ${feePercent}, ${num(s.referral_percent, 0)}, ${note || null}
    )`;
  const done = rows[0];
  if (!done) throw new Error("not_found");
  await notifyUserStatus(done);
  return done;
}

export async function rejectRequest(id: string, note = ""): Promise<TxRow> {
  const source = await txSource(id);
  if (source === "bonus") {
    const done = await rejectBonusWithdraw(id, note);
    await notifyBonusRefund(done);
    return done;
  }
  if (source === "bot") {
    const done = await rejectBotRequest(id, note);
    await notifyUserStatus(done);
    return done;
  }
  const rows = await sql<TxRow[]>`select ${TX_COLS()} from reject_transaction(${id}, ${note || null})`;
  const done = rows[0];
  if (!done) throw new Error("not_found");
  await releasePromo(id);
  await notifyUserStatus(done);
  return done;
}

/** Telegram user ids allowed to manage everything: the "admin_chat_id" setting plus ADMIN_TELEGRAM_IDS. */
export async function isTelegramAdmin(id: number, s?: Settings): Promise<boolean> {
  const settings = s ?? (await getSettings());
  return isAdminId(id, settings.admin_chat_id, process.env["ADMIN_TELEGRAM_IDS"] ?? "");
}

/** Why a request was flagged as suspicious (null when it wasn't). */
export async function requestFlag(id: string): Promise<string | null> {
  const r = await maybeOne(sql<{ flag: string | null }[]>`select to_jsonb(t) ->> 'flag' as flag from public.transactions t where id = ${id}`);
  return r?.flag ?? null;
}

/** Blocks (or unblocks) a user: the bot and the wallet refuse them from then on. */
export async function setUserBlocked(userId: number, blocked: boolean) {
  const rows = await sql<{ id: number }[]>`update public.tg_users set is_blocked = ${blocked} where id = ${userId} returning id::float8 as id`;
  if (!rows[0]) throw new Error("user_not_found");
}
