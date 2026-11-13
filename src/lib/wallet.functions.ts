// Server functions used by the WALLET mini app. Every call carries Telegram initData,
// which is verified on the server before any data is read or written.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sql } from "./server/db.server";
import {
  BOOKMAKER_COLS,
  friendlyError,
  getActiveBookmaker,
  walletAuth as auth,
  type Bookmaker,
} from "./server/wallet-auth.server";
import { getSettings, num } from "./server/settings.server";
import { countReferrals, listReferrals } from "./server/users.server";
import { signedUploadUrl, signedUrls } from "./server/media.server";
import { notifyAdminsNewRequest, notifyUserStatus } from "./server/notify.server";
import {
  cashdeskDeposit,
  cashdeskFindUser,
  cashdeskPayout,
  depositSumma,
  type CashdeskResult,
} from "./server/cashdesk.server";
import { loadCashdeskCreds } from "./server/cashdesk-config.server";
import { TX_COLS, type TxRow } from "./server/tx.server";
import { VIDEO_SLOTS } from "./videos";
import { ensureMigrations } from "./server/migrations.server";
import { resolveBotUsername } from "./server/bot-username.server";

const initSchema = z.object({ initData: z.string().max(8192) });

export const walletBootstrap = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.parse(d))
  .handler(async ({ data }) => {
    await ensureMigrations();
    const { user, demo } = await auth(data.initData);
    const s = await getSettings();
    const [bks, vids, refs] = await Promise.all([
      sql<Bookmaker[]>`select ${BOOKMAKER_COLS()} from public.bookmakers where is_active order by sort_order`,
      sql<{ slot: string; storage_path: string | null }[]>`select slot, storage_path from public.videos`,
      countReferrals(user.id),
    ]);
    const logoMap = await signedUrls(
      "media",
      bks.map((b) => b.logo_url ?? "").filter(Boolean),
    );
    const vidMap = await signedUrls(
      "media",
      vids.map((v) => v.storage_path ?? "").filter(Boolean),
    );
    const videos: Record<string, string> = {};
    for (const v of vids) {
      const u = v.storage_path ? vidMap[v.storage_path] : undefined;
      if (u) videos[v.slot] = u;
    }
    return {
      demo,
      user: {
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        photo_url: user.photo_url,
        phone: user.phone,
        lang: (["uz", "ru", "en"].includes(user.lang) ? user.lang : "uz") as "uz" | "ru" | "en",
        balance: Number(user.balance),
        referral_earned: Number(user.referral_earned),
        referrals: refs,
      },
      settings: {
        brand_name: s.brand_name || "Kassa 24/7",
        card_number: s.card_number,
        card_holder: s.card_holder,
        support_username: s.support_username.replace(/^@/, ""),
        channel_username: s.channel_username.replace(/^@/, ""),
        bot_username: await resolveBotUsername(s),
        deposit_bonus_percent: num(s.deposit_bonus_percent, 0),
        referral_percent: num(s.referral_percent, 0),
        min_topup: num(s.min_topup, 5000),
        max_topup: num(s.max_topup, 10000000),
        min_card_withdraw: num(s.min_card_withdraw, 10000),
        max_card_withdraw: num(s.max_card_withdraw, 10000000),
      },
      bookmakers: bks.map((b) => ({
        id: b.id,
        name: b.name,
        logo: b.logo_url ? (logoMap[b.logo_url] ?? null) : null,
        deposit_enabled: b.deposit_enabled,
        withdraw_enabled: b.withdraw_enabled,
        deposit_fee_percent: Number(b.deposit_fee_percent),
        withdraw_fee_percent: Number(b.withdraw_fee_percent),
        address: b.address,
        min_amount: Number(b.min_amount),
        max_amount: Number(b.max_amount),
      })),
      videos,
      videoSlots: VIDEO_SLOTS.filter((v) => v.group === "wallet").map((v) => v.slot),
    };
  });

export const walletHistory = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.parse(d))
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    return sql<TxRow[]>`
      select ${TX_COLS()} from public.transactions
      where user_id = ${user.id}
      order by created_at desc
      limit 100`;
  });

export const walletReferrals = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.parse(d))
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    const refs = await listReferrals(user.id);
    return refs.map((r) => ({ id: r.id, name: r.first_name ?? "", username: r.username, created_at: r.created_at }));
  });

export const walletSetLang = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.extend({ lang: z.enum(["uz", "ru", "en"]) }).parse(d))
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    await sql`update public.tg_users set lang = ${data.lang}, lang_chosen = true where id = ${user.id}`;
    return { ok: true };
  });

const accountSchema = z.string().trim().regex(/^\d{5,15}$/);

// Bookmakers with a cashdesk API (LINEBET) look the player up; others only check the format.
export const walletCheckAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.extend({ bookmakerId: z.string().max(40), accountId: z.string().max(32) }).parse(d))
  .handler(async ({ data }) => {
    await auth(data.initData);
    const ok = accountSchema.safeParse(data.accountId).success;
    if (!ok) return { ok, name: null as string | null };
    const creds = await loadCashdeskCreds(data.bookmakerId);
    if (!creds) return { ok, name: null as string | null };
    const found = await cashdeskFindUser(creds, data.accountId.trim());
    // No clear answer from the API: let the user continue, the deposit call checks again.
    if (!found) return { ok: true, name: null as string | null };
    return { ok: found.found, name: found.name };
  });

type AutoOutcome = { ok: true; number: number; auto: "done" | "pending" | "manual"; amount: number };

// Applies the cashdesk answer to a pending request:
// ok → approve (balance/referral rules in approve_transaction); rejected → refund via reject;
// unknown → keep pending and alert admins, because the money may already have moved.
async function finishAuto(tx: TxRow, bkName: string, r: CashdeskResult, withdrawFeePercent: number): Promise<AutoOutcome> {
  const s = await getSettings();
  if (r.kind === "ok" && (tx.type === "bk_deposit" || r.summa > 0)) {
    const amount = tx.type === "bk_withdraw" ? Math.round(r.summa) : 0;
    const rows = await sql<TxRow[]>`
      select ${TX_COLS()} from approve_transaction(
        ${tx.id}, ${amount}, ${tx.type === "bk_withdraw" ? withdrawFeePercent : 0},
        ${num(s.referral_percent, 0)}, ${`Avto: ${bkName}`}
      )`;
    const done = rows[0] ?? tx;
    await notifyUserStatus(done);
    return { ok: true, number: tx.number, auto: "done", amount: Number(done.amount) };
  }
  if (r.kind === "rejected") {
    await sql`select 1 from reject_transaction(${tx.id}, ${`${bkName}: ${r.message}`.slice(0, 300)})`;
    throw new Error(`bk_rejected: ${r.message}`);
  }
  const rows = await sql<TxRow[]>`
    update public.transactions set admin_note = ${`⚠️ Avto: ${bkName} javob bermadi — kassani tekshiring (${r.message})`.slice(0, 300)}
    where id = ${tx.id} returning ${TX_COLS()}`;
  await notifyAdminsNewRequest(rows[0] ?? tx);
  return { ok: true, number: tx.number, auto: "pending", amount: Number(tx.amount) };
}

export const walletBkDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    initSchema
      .extend({ bookmakerId: z.string().max(40), accountId: accountSchema, amount: z.number().int().positive().max(1_000_000_000) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    const bk = await getActiveBookmaker(data.bookmakerId);
    if (!bk.deposit_enabled) throw new Error("not_available");
    if (data.amount < Number(bk.min_amount) || data.amount > Number(bk.max_amount)) throw new Error("invalid_amount");
    const s = await getSettings();
    const bonus = Math.floor((data.amount * num(s.deposit_bonus_percent, 0)) / 100);
    const fee = Math.floor((data.amount * Number(bk.deposit_fee_percent)) / 100);
    let tx: TxRow | undefined;
    try {
      const rows = await sql<TxRow[]>`
        select ${TX_COLS()} from create_debit_request(
          ${user.id}, 'bk_deposit', ${data.amount}, ${bk.id}, ${data.accountId}, '', ${bonus}, ${fee}
        )`;
      tx = rows[0];
    } catch (e) {
      friendlyError(e);
    }
    if (!tx) throw new Error("request_failed");
    const creds = await loadCashdeskCreds(bk.id);
    if (creds) {
      const r = await cashdeskDeposit(creds, data.accountId, depositSumma(Number(tx.amount), Number(tx.bonus), Number(tx.fee)));
      return finishAuto(tx, bk.name, r, 0);
    }
    await notifyAdminsNewRequest(tx);
    return { ok: true, number: tx.number, auto: "manual", amount: Number(tx.amount) } satisfies AutoOutcome;
  });

export const walletBkWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    initSchema
      .extend({ bookmakerId: z.string().max(40), accountId: accountSchema, code: z.string().trim().regex(/^[A-Za-z0-9]{4}$/) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    const bk = await getActiveBookmaker(data.bookmakerId);
    if (!bk.withdraw_enabled) throw new Error("not_available");
    const rows = await sql<TxRow[]>`
      insert into public.transactions (user_id, type, bookmaker_id, account_id, withdraw_code, amount)
      values (${user.id}, 'bk_withdraw', ${bk.id}, ${data.accountId}, ${data.code}, 0)
      returning ${TX_COLS()}`;
    const tx = rows[0];
    if (!tx) throw new Error("request_failed");
    const creds = await loadCashdeskCreds(bk.id);
    if (creds) {
      const r = await cashdeskPayout(creds, data.accountId, data.code);
      return finishAuto(tx, bk.name, r, Number(bk.withdraw_fee_percent));
    }
    await notifyAdminsNewRequest(tx);
    return { ok: true, number: tx.number, auto: "manual", amount: 0 } satisfies AutoOutcome;
  });

export const walletReceiptUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.extend({ ext: z.enum(["jpg", "jpeg", "png", "webp", "heic", "pdf"]) }).parse(d))
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${data.ext}`;
    return signedUploadUrl("receipts", path);
  });

export const walletTopup = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    initSchema
      .extend({ amount: z.number().int().positive().max(1_000_000_000), receiptPath: z.string().max(300).nullable() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    const s = await getSettings();
    if (data.amount < num(s.min_topup, 5000) || data.amount > num(s.max_topup, 10000000)) throw new Error("invalid_amount");
    if (data.receiptPath && !data.receiptPath.startsWith(`${user.id}/`)) throw new Error("invalid_receipt");
    const rows = await sql<TxRow[]>`
      insert into public.transactions (user_id, type, amount, receipt_path)
      values (${user.id}, 'wallet_topup', ${data.amount}, ${data.receiptPath})
      returning ${TX_COLS()}`;
    const tx = rows[0];
    if (!tx) throw new Error("request_failed");
    await notifyAdminsNewRequest(tx);
    return { ok: true, number: tx.number };
  });

export const walletCardWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    initSchema
      .extend({ cardNumber: z.string().regex(/^\d{16}$/), amount: z.number().int().positive().max(1_000_000_000) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { user } = await auth(data.initData);
    const s = await getSettings();
    if (data.amount < num(s.min_card_withdraw, 10000) || data.amount > num(s.max_card_withdraw, 10000000))
      throw new Error("invalid_amount");
    let tx: TxRow | undefined;
    try {
      const rows = await sql<TxRow[]>`
        select ${TX_COLS()} from create_debit_request(
          ${user.id}, 'card_withdraw', ${data.amount}, null, '', ${data.cardNumber}, 0, 0
        )`;
      tx = rows[0];
    } catch (e) {
      friendlyError(e);
    }
    if (!tx) throw new Error("request_failed");
    await notifyAdminsNewRequest(tx);
    return { ok: true, number: tx.number };
  });
