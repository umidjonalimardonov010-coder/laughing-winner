// Server functions used by the WALLET mini app. Every call carries Telegram initData,
// which is verified on the server before any data is read or written.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./server/db.server";
import { friendlyError, getActiveBookmaker, walletAuth as auth } from "./server/wallet-auth.server";
import { getSettings, num } from "./server/settings.server";
import { countReferrals, listReferrals } from "./server/users.server";
import { signedUploadUrl, signedUrls } from "./server/media.server";
import { notifyAdminsNewRequest } from "./server/notify.server";
import { VIDEO_SLOTS } from "./videos";

const initSchema = z.object({ initData: z.string().max(8192) });

export const walletBootstrap = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.parse(d))
  .handler(async ({ data }) => {
    const { user, demo } = await auth(data.initData);
    const s = await getSettings();
    const [{ data: bks }, { data: vids }, refs] = await Promise.all([
      db.from("bookmakers").select("*").eq("is_active", true).order("sort_order"),
      db.from("videos").select("slot,storage_path"),
      countReferrals(user.id),
    ]);
    const logoMap = await signedUrls(
      "media",
      (bks ?? []).map((b) => b.logo_url ?? "").filter(Boolean),
    );
    const vidMap = await signedUrls(
      "media",
      (vids ?? []).map((v) => v.storage_path ?? "").filter(Boolean),
    );
    const videos: Record<string, string> = {};
    for (const v of vids ?? []) {
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
        bot_username: s.bot_username,
        deposit_bonus_percent: num(s.deposit_bonus_percent, 0),
        referral_percent: num(s.referral_percent, 0),
        min_topup: num(s.min_topup, 5000),
        max_topup: num(s.max_topup, 10000000),
        min_card_withdraw: num(s.min_card_withdraw, 10000),
        max_card_withdraw: num(s.max_card_withdraw, 10000000),
      },
      bookmakers: (bks ?? []).map((b) => ({
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
    const { data: txs } = await db
      .from("transactions")
      .select("id,number,type,status,amount,bonus,fee,bookmaker_id,account_id,card_number,admin_note,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return (txs ?? []).map((t) => ({ ...t, amount: Number(t.amount), bonus: Number(t.bonus), fee: Number(t.fee) }));
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
    await db.from("tg_users").update({ lang: data.lang, lang_chosen: true }).eq("id", user.id);
    return { ok: true };
  });

const accountSchema = z.string().trim().regex(/^\d{5,15}$/);

// No bookmaker API yet: only checks the format. Real lookup plugs in here later.
export const walletCheckAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => initSchema.extend({ bookmakerId: z.string().max(40), accountId: z.string().max(32) }).parse(d))
  .handler(async ({ data }) => {
    await auth(data.initData);
    const ok = accountSchema.safeParse(data.accountId).success;
    return { ok, name: null as string | null };
  });

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
    const { data: tx, error } = await db.rpc("create_debit_request", {
      p_user_id: user.id,
      p_type: "bk_deposit",
      p_amount: data.amount,
      p_bookmaker_id: bk.id,
      p_account_id: data.accountId,
      p_card_number: "",
      p_bonus: bonus,
      p_fee: fee,
    });
    if (error) friendlyError(new Error(error.message));
    await notifyAdminsNewRequest(tx!);
    return { ok: true, number: tx!.number };
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
    const { data: tx, error } = await db
      .from("transactions")
      .insert({
        user_id: user.id,
        type: "bk_withdraw",
        bookmaker_id: bk.id,
        account_id: data.accountId,
        withdraw_code: data.code,
        amount: 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await notifyAdminsNewRequest(tx);
    return { ok: true, number: tx.number };
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
    const { data: tx, error } = await db
      .from("transactions")
      .insert({ user_id: user.id, type: "wallet_topup", amount: data.amount, receipt_path: data.receiptPath })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
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
    const { data: tx, error } = await db.rpc("create_debit_request", {
      p_user_id: user.id,
      p_type: "card_withdraw",
      p_amount: data.amount,
      p_bookmaker_id: null as unknown as string,
      p_account_id: "",
      p_card_number: data.cardNumber,
      p_bonus: 0,
      p_fee: 0,
    });
    if (error) friendlyError(new Error(error.message));
    await notifyAdminsNewRequest(tx!);
    return { ok: true, number: tx!.number };
  });
