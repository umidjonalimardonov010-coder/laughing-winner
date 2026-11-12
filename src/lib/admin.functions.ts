// Server functions for the admin panel. Every handler checks the admin session first.
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "./server/db.server";
import { adminConfigured, adminSession, isAdmin, passwordMatches, requireAdmin } from "./server/admin-session.server";
import { getSettings, num, saveSettings, SETTING_KEYS } from "./server/settings.server";
import { signedUploadUrl, signedUrl, signedUrls } from "./server/media.server";
import { notifyUserStatus } from "./server/notify.server";
import { getBotInfo, telegramMode, tg, webhookSecret } from "./server/telegram.server";
import { VIDEO_SLOT_IDS } from "./videos";

export const adminStatus = createServerFn({ method: "POST" }).handler(async () => {
  return { configured: adminConfigured(), loggedIn: await isAdmin() };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    if (!adminConfigured()) return { ok: false, error: "not_configured" as const };
    if (!(await passwordMatches(data.password))) return { ok: false, error: "wrong_password" as const };
    const s = await adminSession();
    await s.update({ admin: true, at: Date.now() });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const s = await adminSession();
  await s.clear();
  return { ok: true };
});

// ---------- Dashboard / reports ----------
export const adminDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(366).default(30) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (data.days - 1));
    const { data: txs, error } = await db
      .from("transactions")
      .select("type,status,amount,bonus,fee,created_at,processed_at,bookmaker_id")
      .gte("created_at", since.toISOString())
      .limit(20000);
    if (error) throw new Error(error.message);
    const [{ count: users }, { count: pending }, { data: balances }] = await Promise.all([
      db.from("tg_users").select("id", { count: "exact", head: true }),
      db.from("transactions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db.from("tg_users").select("balance").limit(50000),
    ]);
    const totalBalance = (balances ?? []).reduce((a, b) => a + Number(b.balance), 0);

    const byType: Record<string, { count: number; sum: number }> = {};
    const byBk: Record<string, { deposit: number; withdraw: number }> = {};
    const days: Record<string, { date: string; kirim: number; chiqim: number }> = {};
    for (let i = 0; i < data.days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { date: key, kirim: 0, chiqim: 0 };
    }
    let newUsersStart = since.toISOString();
    for (const t of txs ?? []) {
      if (t.status !== "approved") continue;
      const amt = Number(t.amount);
      const bt = (byType[t.type] ??= { count: 0, sum: 0 });
      bt.count++;
      bt.sum += amt;
      const key = (t.processed_at ?? t.created_at).slice(0, 10);
      const isIn = t.type === "wallet_topup" || t.type === "bk_withdraw";
      const isOut = t.type === "card_withdraw" || t.type === "bk_deposit";
      const day = days[key];
      if (day) {
        if (isIn) day.kirim += amt;
        if (isOut) day.chiqim += amt;
      }
      if (t.bookmaker_id) {
        const b = (byBk[t.bookmaker_id] ??= { deposit: 0, withdraw: 0 });
        if (t.type === "bk_deposit") b.deposit += amt;
        if (t.type === "bk_withdraw") b.withdraw += amt;
      }
    }
    const { count: newUsers } = await db
      .from("tg_users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", newUsersStart);
    newUsersStart = "";
    return {
      users: users ?? 0,
      newUsers: newUsers ?? 0,
      pending: pending ?? 0,
      totalBalance,
      byType,
      byBk,
      series: Object.values(days),
    };
  });

// ---------- Requests ----------
const typeEnum = z.enum(["wallet_topup", "card_withdraw", "bk_deposit", "bk_withdraw", "referral_bonus", "adjustment"]);

export const adminListRequests = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
        type: z.union([typeEnum, z.literal("all")]).default("all"),
        search: z.string().max(64).default(""),
        page: z.number().int().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const pageSize = 30;
    let q = db
      .from("transactions")
      .select("*, tg_users!transactions_user_id_fkey(id,username,first_name,balance), bookmakers(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.page * pageSize, data.page * pageSize + pageSize - 1);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.type !== "all") q = q.eq("type", data.type);
    else q = q.in("type", ["wallet_topup", "card_withdraw", "bk_deposit", "bk_withdraw"]);
    const s = data.search.trim();
    if (s) {
      if (/^\d+$/.test(s)) q = q.or(`user_id.eq.${s},number.eq.${s},account_id.eq.${s}`);
      else q = q.or(`account_id.ilike.%${s.replace(/[%,()]/g, "")}%,withdraw_code.eq.${s.replace(/[%,()]/g, "")}`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    const receiptMap = await signedUrls(
      "receipts",
      (rows ?? []).map((r) => r.receipt_path ?? "").filter(Boolean),
      60 * 60,
    );
    return {
      total: count ?? 0,
      pageSize,
      rows: (rows ?? []).map((r) => ({
        ...r,
        amount: Number(r.amount),
        bonus: Number(r.bonus),
        fee: Number(r.fee),
        receipt_url: r.receipt_path ? (receiptMap[r.receipt_path] ?? null) : null,
      })),
    };
  });

export const adminApproveRequest = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), amount: z.number().int().min(0).max(1_000_000_000).default(0), note: z.string().max(300).default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const { data: tx } = await db.from("transactions").select("bookmaker_id,type").eq("id", data.id).single();
    let feePercent = 0;
    if (tx?.bookmaker_id && tx.type === "bk_withdraw") {
      const { data: bk } = await db.from("bookmakers").select("withdraw_fee_percent").eq("id", tx.bookmaker_id).single();
      feePercent = Number(bk?.withdraw_fee_percent ?? 0);
    }
    const s = await getSettings();
    const { data: done, error } = await db.rpc("approve_transaction", {
      p_tx_id: data.id,
      p_amount: data.amount,
      p_fee_percent: feePercent,
      p_referral_percent: num(s.referral_percent, 0),
      p_note: data.note || (null as unknown as string),
    });
    if (error) throw new Error(error.message);
    await notifyUserStatus(done!);
    return { ok: true };
  });

export const adminRejectRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), note: z.string().max(300).default("") }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { data: done, error } = await db.rpc("reject_transaction", {
      p_tx_id: data.id,
      p_note: data.note || (null as unknown as string),
    });
    if (error) throw new Error(error.message);
    await notifyUserStatus(done!);
    return { ok: true };
  });

// ---------- Users ----------
export const adminListUsers = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ search: z.string().max(64).default(""), page: z.number().int().min(0).default(0) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const pageSize = 30;
    let q = db
      .from("tg_users")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.page * pageSize, data.page * pageSize + pageSize - 1);
    const s = data.search.trim().replace(/^@/, "").replace(/[%,()]/g, "");
    if (s) q = /^\d+$/.test(s) ? q.eq("id", Number(s)) : q.or(`username.ilike.%${s}%,first_name.ilike.%${s}%`);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      total: count ?? 0,
      pageSize,
      rows: (rows ?? []).map((r) => ({ ...r, balance: Number(r.balance), referral_earned: Number(r.referral_earned) })),
    };
  });

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ userId: z.number().int(), delta: z.number().int().min(-1_000_000_000).max(1_000_000_000), note: z.string().max(300).default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (data.delta === 0) throw new Error("invalid_amount");
    const { data: bal, error } = await db.rpc("adjust_balance", {
      p_user_id: data.userId,
      p_delta: data.delta,
      p_note: data.note || "Admin",
    });
    if (error) throw new Error(error.message);
    return { balance: Number(bal) };
  });

export const adminSetBlocked = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: z.number().int(), blocked: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { error } = await db.from("tg_users").update({ is_blocked: data.blocked }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Bookmakers ----------
export const adminListBookmakers = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { data, error } = await db.from("bookmakers").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  const logos = await signedUrls("media", (data ?? []).map((b) => b.logo_url ?? "").filter(Boolean), 60 * 60);
  return (data ?? []).map((b) => ({
    ...b,
    deposit_fee_percent: Number(b.deposit_fee_percent),
    withdraw_fee_percent: Number(b.withdraw_fee_percent),
    min_amount: Number(b.min_amount),
    max_amount: Number(b.max_amount),
    logo_preview: b.logo_url ? (logos[b.logo_url] ?? null) : null,
  }));
});

const bkSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9-]{2,30}$/),
  name: z.string().trim().min(1).max(40),
  logo_url: z.string().max(300).nullable(),
  deposit_enabled: z.boolean(),
  withdraw_enabled: z.boolean(),
  deposit_fee_percent: z.number().min(0).max(100),
  withdraw_fee_percent: z.number().min(0).max(100),
  address: z.string().trim().max(120),
  min_amount: z.number().int().min(0),
  max_amount: z.number().int().min(1),
  sort_order: z.number().int().min(0).max(1000),
  is_active: z.boolean(),
});

export const adminSaveBookmaker = createServerFn({ method: "POST" })
  .inputValidator((d) => bkSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (data.min_amount > data.max_amount) throw new Error("min_gt_max");
    const { error } = await db.from("bookmakers").upsert(data, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteBookmaker = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { error } = await db.from("bookmakers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminMediaUploadUrl = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ folder: z.enum(["logos", "videos"]), ext: z.string().regex(/^[a-z0-9]{2,5}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const path = `${data.folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${data.ext}`;
    return signedUploadUrl("media", path);
  });

// ---------- Videos ----------
export const adminListVideos = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const { data } = await db.from("videos").select("*");
  const out: Record<string, { url: string | null; updated_at: string }> = {};
  for (const v of data ?? []) {
    out[v.slot] = { url: await signedUrl("media", v.storage_path, 60 * 60), updated_at: v.updated_at };
  }
  return out;
});

export const adminSaveVideo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slot: z.string().max(40), path: z.string().max(300).nullable() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!VIDEO_SLOT_IDS.includes(data.slot)) throw new Error("unknown_slot");
    const { data: old } = await db.from("videos").select("storage_path").eq("slot", data.slot).maybeSingle();
    if (data.path === null) {
      await db.from("videos").delete().eq("slot", data.slot);
    } else {
      if (!data.path.startsWith("videos/")) throw new Error("invalid_path");
      const { error } = await db
        .from("videos")
        .upsert({ slot: data.slot, storage_path: data.path, tg_file_id: null, url: null, updated_at: new Date().toISOString() }, { onConflict: "slot" });
      if (error) throw new Error(error.message);
    }
    if (old?.storage_path && old.storage_path !== data.path) await db.storage.from("media").remove([old.storage_path]);
    return { ok: true };
  });

// ---------- Settings ----------
export const adminGetSettings = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  return getSettings();
});

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.record(z.string(), z.string().max(2000)).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const clean: Record<string, string> = {};
    for (const k of SETTING_KEYS) {
      const v = data[k];
      if (v !== undefined) clean[k] = v.trim();
    }
    const card = clean["card_number"];
    if (card) clean["card_number"] = card.replace(/\D/g, "");
    await saveSettings(clean);
    return { ok: true };
  });

// ---------- Telegram bot connection ----------
function publicOrigin(origin: string): string {
  // The editor preview address asks visitors to sign in to Lovable; Telegram needs the open one.
  const m = origin.match(/^https:\/\/id-preview--([a-z0-9-]+)\.(.+)$/i);
  if (m) return `https://project--${m[1]}-dev.${m[2]}`;
  // Own hosting (e.g. Railway): PUBLIC_URL wins; behind a proxy the origin can arrive as http.
  const fixed = process.env["PUBLIC_URL"];
  if (fixed) return fixed.replace(/\/$/, "");
  return origin.replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, "https://").replace(/\/$/, "");
}

export const adminBotStatus = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const mode = telegramMode();
  if (mode === "none") return { mode, bot: null, webhook: null, suggestedUrl: publicOrigin(getRequestUrl().origin) };
  try {
    const [bot, webhook] = await Promise.all([getBotInfo(), tg("getWebhookInfo")]);
    return {
      mode,
      bot: { username: bot.username, name: bot.first_name },
      webhook: { url: webhook.url as string, pending: webhook.pending_update_count as number, lastError: (webhook.last_error_message as string) ?? null },
      suggestedUrl: publicOrigin(getRequestUrl().origin),
    };
  } catch (e) {
    return { mode, bot: null, webhook: null, error: e instanceof Error ? e.message : String(e), suggestedUrl: publicOrigin(getRequestUrl().origin) };
  }
});

export const adminConnectBot = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ url: z.string().url().max(300) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (telegramMode() === "none") throw new Error("bot_not_connected");
    const base = data.url.replace(/\/$/, "");
    if (!base.startsWith("https://")) throw new Error("https_required");
    const s = await getSettings();
    const bot = await getBotInfo();
    await tg("setWebhook", {
      url: `${base}/api/public/telegram/webhook`,
      secret_token: await webhookSecret(),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
    await tg("setChatMenuButton", {
      menu_button: { type: "web_app", text: "📱 WALLET", web_app: { url: `${base}/app` } },
    });
    await tg("setMyCommands", {
      commands: [
        { command: "start", description: "Boshlash / Начать" },
        { command: "menu", description: "Asosiy menyu / Главное меню" },
        { command: "lang", description: "Tilni o'zgartirish / Сменить язык" },
      ],
    });
    await tg("setMyDescription", {
      description: `${s.brand_name || "Kassa 24/7"}: bukmeker hisobini tez to'ldirish va yechish. 24/7.`,
    }).catch(() => undefined);
    await saveSettings({ public_url: base, bot_username: bot.username });
    return { ok: true, bot: bot.username };
  });
