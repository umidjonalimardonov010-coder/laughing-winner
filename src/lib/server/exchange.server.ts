// The chat bot's exchange: conversation state, saved card / bookmaker IDs, and the money requests
// it creates. Bot requests (transactions.source = 'bot') never touch the old wallet balance.
import { maybeOne, sql } from "./db.server";
import { getSettings, num, type Settings } from "./settings.server";
import { TX_COLS, type TxRow } from "./tx.server";
import { cashdeskDeposit, cashdeskPayout, depositSumma } from "./cashdesk.server";
import { loadCashdeskCreds } from "./cashdesk-config.server";
import { accountSuspicion, cardSuspicion } from "./safety.server";
import { inBackground, notifyAdminsNewRequest } from "./notify.server";
import { withdrawSplit } from "@/lib/exchange-rules";
import type { Bookmaker } from "./wallet-auth.server";

export type BotStep =
  | "dep_account"
  | "dep_card"
  | "dep_amount"
  | "dep_confirm"
  | "wd_card"
  | "wd_account"
  | "wd_code"
  | "set_card"
  | "set_acc"
  | "bonus_account"
  | "bonus_confirm";

export type StepData = {
  bk?: string;
  account?: string;
  card?: string;
  amount?: number;
  pay?: number;
  bonus?: number;
  fee?: number;
};

/** A step left untouched this long is forgotten (the user starts again from the menu). */
const STATE_TTL_MS = 2 * 3600_000;

export async function getState(userId: number): Promise<{ step: BotStep; data: StepData } | null> {
  const r = await maybeOne(
    sql<{ step: BotStep; data: StepData; age: number }[]>`
      select step, data, extract(epoch from now() - updated_at)::float8 * 1000 as age
      from public.bot_state where user_id = ${userId}`,
  );
  if (!r || r.age > STATE_TTL_MS) return null;
  return { step: r.step, data: r.data ?? {} };
}

export async function setState(userId: number, step: BotStep, data: StepData) {
  await sql`insert into public.bot_state (user_id, step, data, updated_at)
    values (${userId}, ${step}, ${sql.json(data)}, now())
    on conflict (user_id) do update set step = excluded.step, data = excluded.data, updated_at = now()`;
}

export async function clearState(userId: number) {
  await sql`delete from public.bot_state where user_id = ${userId}`;
}

/** Removes and returns the state only if it is at `step` — a double tap gets null the second time. */
export async function takeState(userId: number, step: BotStep): Promise<StepData | null> {
  const r = await maybeOne(
    sql<{ data: StepData }[]>`delete from public.bot_state where user_id = ${userId} and step = ${step}
      and updated_at > now() - make_interval(secs => ${STATE_TTL_MS / 1000}) returning data`,
  );
  return r ? (r.data ?? {}) : null;
}

/** Saved values: kind = 'card' or a bookmaker id. */
export async function savedAccounts(userId: number): Promise<Record<string, string>> {
  const rows = await sql<{ kind: string; value: string }[]>`select kind, value from public.user_accounts where user_id = ${userId}`;
  return Object.fromEntries(rows.map((r) => [r.kind, r.value]));
}

export async function saveAccount(userId: number, kind: string, value: string) {
  await sql`insert into public.user_accounts (user_id, kind, value, updated_at) values (${userId}, ${kind}, ${value}, now())
    on conflict (user_id, kind) do update set value = excluded.value, updated_at = now()`;
}

export async function listBookmakers(): Promise<Bookmaker[]> {
  const { BOOKMAKER_COLS } = await import("./wallet-auth.server");
  return [...(await sql<Bookmaker[]>`select ${BOOKMAKER_COLS()} from public.bookmakers where is_active order by sort_order`)];
}

/** Amounts already used by open deposits, so a new transfer sum is never ambiguous. */
export async function takenPayAmounts(from: number): Promise<number[]> {
  const rows = await sql<{ amount: number }[]>`
    select amount::float8 as amount from public.transactions
    where type = 'bk_deposit' and status = 'pending' and created_at > now() - interval '6 hours'
      and amount between ${from} and ${from + 1000}`;
  return rows.map((r) => Number(r.amount));
}

export type BotTx = TxRow & { source?: string | null; flag?: string | null };

/** "Paid" tapped: a pending deposit for the admin to check against the card. */
export async function createBotDeposit(
  userId: number,
  d: { bk: string; account: string; card: string; pay: number; bonus: number; fee: number },
): Promise<BotTx> {
  const rows = await sql<TxRow[]>`
    insert into public.transactions (user_id, type, bookmaker_id, account_id, card_number, amount, bonus, fee, source)
    values (${userId}, 'bk_deposit', ${d.bk}, ${d.account}, ${d.card}, ${d.pay}, ${d.bonus}, ${d.fee}, 'bot')
    returning ${TX_COLS()}`;
  const tx = rows[0];
  if (!tx) throw new Error("request_failed");
  const out: BotTx = { ...tx, source: "bot" };
  inBackground("alert", () => notifyAdminsNewRequest(out));
  return out;
}

export type WithdrawOutcome =
  | { kind: "done"; tx: BotTx; send: number }
  | { kind: "pending"; tx: BotTx }
  | { kind: "rejected"; tx: BotTx; message: string };

/**
 * Code entered: the cashdesk pays out (when connected and the request isn't suspicious), then the
 * request waits for an admin to send the money to the user's card. A clear refusal closes it at once.
 */
export async function createBotWithdraw(
  userId: number,
  bk: Bookmaker,
  d: { account: string; card: string; code: string },
  s?: Settings,
): Promise<WithdrawOutcome> {
  const settings = s ?? (await getSettings());
  const flag =
    (await accountSuspicion(userId, bk.id, d.account, settings)) ?? (await cardSuspicion(userId, d.card, settings));
  const rows = await sql<TxRow[]>`
    insert into public.transactions (user_id, type, bookmaker_id, account_id, withdraw_code, card_number, amount, flag, source)
    values (${userId}, 'bk_withdraw', ${bk.id}, ${d.account}, ${d.code}, ${d.card}, 0, ${flag}, 'bot')
    returning ${TX_COLS()}`;
  const tx: BotTx | undefined = rows[0] ? { ...rows[0], source: "bot", flag } : undefined;
  if (!tx) throw new Error("request_failed");

  const creds = flag ? null : await loadCashdeskCreds(bk.id);
  if (!creds) {
    inBackground("alert", () => notifyAdminsNewRequest(tx));
    return { kind: "pending", tx };
  }
  const r = await cashdeskPayout(creds, d.account, d.code);
  if (r.kind === "rejected") {
    const note = `${bk.name}: ${r.message}`.slice(0, 300);
    await sql`update public.transactions set status = 'rejected', processed_at = now(), admin_note = ${note} where id = ${tx.id}`;
    return { kind: "rejected", tx: { ...tx, status: "rejected", admin_note: note }, message: r.message };
  }
  if (r.kind === "ok" && r.summa > 0) {
    const summa = Math.round(r.summa);
    const { fee, send } = withdrawSplit(summa, Number(bk.withdraw_fee_percent));
    const note = `Avto: ${bk.name} kassadan ${summa} so'm yechildi — kartaga ${send} so'm o'tkazing`;
    const upd = await sql<TxRow[]>`update public.transactions set amount = ${summa}, fee = ${fee}, admin_note = ${note}
      where id = ${tx.id} returning ${TX_COLS()}`;
    const done: BotTx = { ...(upd[0] ?? tx), source: "bot", flag };
    inBackground("alert", () => notifyAdminsNewRequest(done));
    return { kind: "done", tx: done, send };
  }
  const note = `⚠️ Avto: ${bk.name} javobi noaniq — kassani tekshiring (${r.message})`.slice(0, 300);
  await sql`update public.transactions set admin_note = ${note} where id = ${tx.id}`;
  const pending: BotTx = { ...tx, admin_note: note };
  inBackground("alert", () => notifyAdminsNewRequest(pending));
  return { kind: "pending", tx: pending };
}

/** 'bot' for requests made in the chat bot; null for old wallet requests. */
export async function txSource(id: string): Promise<string | null> {
  const r = await maybeOne(sql<{ source: string | null }[]>`select to_jsonb(t) ->> 'source' as source from public.transactions t where id = ${id}`);
  return r?.source ?? null;
}

const UNCLEAR = "⚠️ Avto:";
const WORKING = "⏳ Avto: bukmekerga yuborilmoqda";

/**
 * Approves a bot request.
 * Deposit: sends the money to the bookmaker (cashdesk) first; a clear refusal keeps it pending with the
 * reason, an unclear answer keeps it pending too — the next ✅ (after checking the cashdesk) just closes it.
 * Withdraw: the admin has sent the money to the card.
 */
export async function approveBotRequest(id: string, amount = 0, note = ""): Promise<BotTx> {
  const tx = await maybeOne(sql<TxRow[]>`select ${TX_COLS()} from public.transactions where id = ${id}`);
  if (!tx) throw new Error("not_found");
  if (tx.status !== "pending") throw new Error("already_processed");
  const finish = async (finalNote: string | null, newAmount?: number, newFee?: number) => {
    const rows = await sql<TxRow[]>`
      update public.transactions set status = 'approved', processed_at = now(),
        admin_note = ${finalNote},
        amount = ${newAmount ?? tx.amount}, fee = ${newFee ?? tx.fee}
      where id = ${id} and status = 'pending' returning ${TX_COLS()}`;
    if (!rows[0]) throw new Error("already_processed");
    return { ...rows[0], source: "bot" } as BotTx;
  };

  if (tx.type === "bk_withdraw") {
    if (amount > 0) {
      const bk = await maybeOne(sql<{ f: number }[]>`select withdraw_fee_percent::float8 as f from public.bookmakers where id = ${tx.bookmaker_id}`);
      const { fee } = withdrawSplit(amount, Number(bk?.f ?? 0));
      return finish(note || null, amount, fee);
    }
    return finish(note || null);
  }

  // Deposit. Claim it so two admins tapping ✅ at once never send the money twice.
  const claimed = await maybeOne(
    sql<{ id: string }[]>`update public.transactions set admin_note = ${WORKING}
      where id = ${id} and status = 'pending'
        and (admin_note is null or (admin_note not like ${UNCLEAR + "%"} and admin_note not like ${"⏳ Avto%"}))
      returning id`,
  );
  if (!claimed) {
    const cur = await maybeOne(sql<{ admin_note: string | null }[]>`select admin_note from public.transactions where id = ${id}`);
    if (cur?.admin_note?.startsWith("⏳ Avto")) throw new Error("in_progress");
    // Earlier answer was unclear and the admin has checked the cashdesk: close it without sending again.
    return finish(note || "Admin tekshirdi (avto javobi noaniq edi)");
  }
  const bkName = (await maybeOne(sql<{ name: string }[]>`select name from public.bookmakers where id = ${tx.bookmaker_id}`))?.name ?? "BK";
  const creds = tx.bookmaker_id ? await loadCashdeskCreds(tx.bookmaker_id) : null;
  if (!creds) return finish(note || null);
  const r = await cashdeskDeposit(creds, tx.account_id ?? "", depositSumma(Number(tx.amount), Number(tx.bonus), Number(tx.fee)));
  if (r.kind === "ok") return finish(note || `Avto: ${bkName}`);
  if (r.kind === "rejected") {
    await sql`update public.transactions set admin_note = ${`${bkName} rad etdi: ${r.message}`.slice(0, 300)} where id = ${id}`;
    throw new Error(`bk_rejected: ${r.message}`);
  }
  await sql`update public.transactions set admin_note = ${`${UNCLEAR} ${bkName} javobi noaniq — kassani tekshiring, keyin yana ✅ (${r.message})`.slice(0, 300)} where id = ${id}`;
  throw new Error(`bk_unknown: ${r.message}`);
}

export async function rejectBotRequest(id: string, note = ""): Promise<BotTx> {
  const rows = await sql<TxRow[]>`
    update public.transactions set status = 'rejected', processed_at = now(), admin_note = ${note || null}
    where id = ${id} and status = 'pending' and coalesce(admin_note, '') not like ${"⏳ Avto%"}
    returning ${TX_COLS()}`;
  if (!rows[0]) {
    const cur = await maybeOne(sql<{ status: string }[]>`select status from public.transactions where id = ${id}`);
    if (!cur) throw new Error("not_found");
    throw new Error(cur.status === "pending" ? "in_progress" : "already_processed");
  }
  return { ...rows[0], source: "bot" };
}

export function minMax(bk: Bookmaker, s: Settings) {
  return {
    min: Number(bk.min_amount) || num(s.min_topup, 5000),
    max: Number(bk.max_amount) || num(s.max_topup, 10_000_000),
  };
}
