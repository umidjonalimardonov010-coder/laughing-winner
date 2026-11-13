// Approve / reject a money request. Shared by the admin panel and the Telegram admin buttons.
// Callers must check that the caller is an admin first.
import { maybeOne, sql } from "./db.server";
import { getSettings, num, type Settings } from "./settings.server";
import { notifyUserStatus } from "./notify.server";
import { TX_COLS, type TxRow } from "./tx.server";
import { isAdminId } from "./admins";

export async function approveRequest(id: string, amount = 0, note = ""): Promise<TxRow> {
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
  const rows = await sql<TxRow[]>`select ${TX_COLS()} from reject_transaction(${id}, ${note || null})`;
  const done = rows[0];
  if (!done) throw new Error("not_found");
  await notifyUserStatus(done);
  return done;
}

/** Telegram user ids allowed to manage everything: the "admin_chat_id" setting plus ADMIN_TELEGRAM_IDS. */
export async function isTelegramAdmin(id: number, s?: Settings): Promise<boolean> {
  const settings = s ?? (await getSettings());
  return isAdminId(id, settings.admin_chat_id, process.env["ADMIN_TELEGRAM_IDS"] ?? "");
}
