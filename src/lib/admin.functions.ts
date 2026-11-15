// Server functions for the admin panel. Every handler checks the admin session first.
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { countOf, maybeOne, sql, ts } from "./server/db.server";
import { adminConfigured, adminSession, isAdmin, passwordMatches, requireAdmin } from "./server/admin-session.server";
import { getSettings, saveSettings, SETTING_KEYS } from "./server/settings.server";
import { clearCache } from "./server/memo.server";
import { removeMedia, signedUploadUrl, signedUrl, signedUrls } from "./server/media.server";
import { ensureMigrations } from "./server/migrations.server";
import { TX_COLS, type TxRow } from "./server/tx.server";
import { BOOKMAKER_COLS, type Bookmaker } from "./server/wallet-auth.server";
import { applyBotProfile } from "./server/bot-profile.server";
import { USER_COLS, type TgUser } from "./server/users.server";
import { getBotInfo, telegramMode, tg, webhookSecret } from "./server/telegram.server";
import { VIDEO_SLOT_IDS } from "./videos";
import { verifyInitData } from "./server/initdata.server";
import { parseAdminIds } from "./server/admins";
import { approveRequest, isTelegramAdmin, rejectRequest, setUserBlocked } from "./server/requests.server";
import { normalizePromo } from "./money-rules";
import { cashdeskBalance, cashdeskFindUser, cashdeskVerdict, serverPublicIp } from "./server/cashdesk.server";
import { loadCashdeskCreds, loadCashdeskDraft, panelCredValues, savePanelCreds } from "./server/cashdesk-config.server";

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

// Opening the admin panel from the bot (inside Telegram): the signed Telegram data proves who it is.
export const adminTelegramLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(8192) }).parse(d))
  .handler(async ({ data }) => {
    await ensureMigrations();
    let v: Awaited<ReturnType<typeof verifyInitData>>;
    try {
      v = await verifyInitData(data.initData);
    } catch {
      return { ok: false as const, error: "bad_telegram" as const, id: null };
    }
    if (v.demo || !(await isTelegramAdmin(v.user.id))) return { ok: false as const, error: "not_admin" as const, id: v.user.id };
    const s = await adminSession();
    await s.update({ admin: true, at: Date.now() });
    return { ok: true as const, error: null, id: v.user.id };
  });

// ---------- Dashboard / reports ----------
export const adminDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(366).default(30) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (data.days - 1));
    const sinceIso = since.toISOString();

    const txs = await sql<
      {
        type: string;
        status: string;
        amount: number;
        bonus: number;
        fee: number;
        created_at: string;
        processed_at: string | null;
        bookmaker_id: string | null;
      }[]
    >`
      select type, status, amount::float8 as amount, bonus::float8 as bonus, fee::float8 as fee,
        ${ts("created_at")} as created_at, ${ts("processed_at")} as processed_at, bookmaker_id
      from public.transactions
      where created_at >= ${sinceIso}
      limit 20000`;
    const [users, pending, balances] = await Promise.all([
      countOf(sql`select count(*)::float8 as n from public.tg_users`),
      countOf(sql`select count(*)::float8 as n from public.transactions where status = 'pending'`),
      sql<{ balance: number }[]>`select balance::float8 as balance from public.tg_users limit 50000`,
    ]);
    const totalBalance = balances.reduce((a, b) => a + Number(b.balance), 0);

    const byType: Record<string, { count: number; sum: number }> = {};
    const byBk: Record<string, { deposit: number; withdraw: number }> = {};
    const days: Record<string, { date: string; kirim: number; chiqim: number; soni: number }> = {};
    for (let i = 0; i < data.days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { date: key, kirim: 0, chiqim: 0, soni: 0 };
    }
    let requestCount = 0;
    for (const t of txs) {
      if (t.type !== "referral_bonus" && t.type !== "adjustment") {
        requestCount++;
        const created = days[t.created_at.slice(0, 10)];
        if (created) created.soni++;
      }
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
    await ensureMigrations();
    const [newUsers, flagged, blocked, topUsers] = await Promise.all([
      countOf(sql`select count(*)::float8 as n from public.tg_users where created_at >= ${sinceIso}`),
      countOf(sql`select count(*)::float8 as n from public.transactions t where status = 'pending' and (to_jsonb(t) ->> 'flag') is not null`),
      countOf(sql`select count(*)::float8 as n from public.tg_users where is_blocked`),
      // Most active people in the period: completed money requests, by total amount.
      sql<{ user_id: number; first_name: string | null; username: string | null; phone: string | null; is_blocked: boolean; count: number; sum: number }[]>`
        select t.user_id::float8 as user_id, u.first_name, u.username, u.phone, u.is_blocked,
          count(*)::float8 as count, coalesce(sum(t.amount), 0)::float8 as sum
        from public.transactions t join public.tg_users u on u.id = t.user_id
        where t.created_at >= ${sinceIso} and t.status = 'approved'
          and t.type in ('wallet_topup', 'card_withdraw', 'bk_deposit', 'bk_withdraw')
        group by t.user_id, u.first_name, u.username, u.phone, u.is_blocked
        order by sum desc
        limit 10`,
    ]);
    return {
      users,
      newUsers,
      flagged,
      blocked,
      requestCount,
      topUsers: [...topUsers],
      pending,
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

    const statusCond = data.status === "all" ? sql`` : sql`and t.status = ${data.status}`;
    const typeCond =
      data.type === "all"
        ? sql`and t.type in ('wallet_topup','card_withdraw','bk_deposit','bk_withdraw')`
        : sql`and t.type = ${data.type}`;
    const needle = data.search.trim();
    let searchCond = sql``;
    if (needle) {
      if (/^\d+$/.test(needle)) {
        searchCond = sql`and (t.user_id = ${needle} or t.number = ${needle} or t.account_id = ${needle})`;
      } else {
        const clean = needle.replace(/[%,()]/g, "");
        searchCond = sql`and (t.account_id ilike ${`%${clean}%`} or t.withdraw_code = ${clean})`;
      }
    }

    const total = await countOf(
      sql`select count(*)::float8 as n from public.transactions t where true ${statusCond} ${typeCond} ${searchCond}`,
    );
    const rows = await sql<
      (TxRow & {
        username: string | null;
        first_name: string | null;
        user_balance: number | null;
        bk_name: string | null;
        phone: string | null;
        selfie_path: string | null;
        flag: string | null;
        promo_code: string | null;
        source: string | null;
        user_blocked: boolean | null;
      })[]
    >`
      select ${TX_COLS()},
        to_jsonb(t) ->> 'flag' as flag,
        to_jsonb(t) ->> 'promo_code' as promo_code,
        to_jsonb(t) ->> 'source' as source,
        (select u.is_blocked from public.tg_users u where u.id = t.user_id) as user_blocked,
        (select u.phone from public.tg_users u where u.id = t.user_id) as phone,
        to_jsonb(t) ->> 'selfie_path' as selfie_path,
        (select u.username from public.tg_users u where u.id = t.user_id) as username,
        (select u.first_name from public.tg_users u where u.id = t.user_id) as first_name,
        (select u.balance::float8 from public.tg_users u where u.id = t.user_id) as user_balance,
        (select b.name from public.bookmakers b where b.id = t.bookmaker_id) as bk_name
      from public.transactions t
      where true ${statusCond} ${typeCond} ${searchCond}
      order by t.created_at desc
      limit ${pageSize} offset ${data.page * pageSize}`;

    const receiptMap = await signedUrls(
      "receipts",
      rows.map((r) => r.receipt_path ?? "").filter(Boolean),
      60 * 60,
    );
    const selfieMap = await signedUrls(
      "receipts",
      rows.map((r) => r.selfie_path ?? "").filter(Boolean),
      60 * 60,
    );
    return {
      total,
      pageSize,
      rows: rows.map((r) => ({
        ...r,
        tg_users:
          r.user_id === null
            ? null
            : { id: r.user_id, username: r.username, first_name: r.first_name, balance: Number(r.user_balance ?? 0) },
        bookmakers: r.bk_name ? { name: r.bk_name } : null,
        receipt_url: r.receipt_path ? (receiptMap[r.receipt_path] ?? null) : null,
        selfie_url: r.selfie_path ? (selfieMap[r.selfie_path] ?? null) : null,
      })),
    };
  });

export const adminApproveRequest = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), amount: z.number().int().min(0).max(1_000_000_000).default(0), note: z.string().max(300).default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await approveRequest(data.id, data.amount, data.note);
    return { ok: true };
  });

export const adminRejectRequest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid(), note: z.string().max(300).default("") }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    await rejectRequest(data.id, data.note);
    return { ok: true };
  });

// ---------- Users ----------
export const adminListUsers = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ search: z.string().max(64).default(""), page: z.number().int().min(0).default(0) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const pageSize = 30;
    const needle = data.search.trim().replace(/^@/, "").replace(/[%,()]/g, "");
    const cond = !needle
      ? sql``
      : /^\d+$/.test(needle)
        ? sql`and id = ${Number(needle)}`
        : sql`and (username ilike ${`%${needle}%`} or first_name ilike ${`%${needle}%`})`;

    const [total, rows] = await Promise.all([
      countOf(sql`select count(*)::float8 as n from public.tg_users where true ${cond}`),
      sql<TgUser[]>`
        select ${USER_COLS()} from public.tg_users
        where true ${cond}
        order by created_at desc
        limit ${pageSize} offset ${data.page * pageSize}`,
    ]);
    return { total, pageSize, rows };
  });

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ userId: z.number().int(), delta: z.number().int().min(-1_000_000_000).max(1_000_000_000), note: z.string().max(300).default("") }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (data.delta === 0) throw new Error("invalid_amount");
    const rows = await sql<{ v: number | string }[]>`
      select adjust_balance(${data.userId}, ${data.delta}, ${data.note || "Admin"}) as v`;
    const bal = rows[0];
    if (!bal) throw new Error("user_not_found");
    return { balance: Number(bal.v) };
  });

export const adminSetBlocked = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ userId: z.number().int(), blocked: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    await setUserBlocked(data.userId, data.blocked);
    return { ok: true };
  });

// ---------- Bookmakers ----------
export const adminListBookmakers = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  await ensureMigrations();
  const rows = await sql<Bookmaker[]>`select ${BOOKMAKER_COLS()} from public.bookmakers order by sort_order`;
  const logos = await signedUrls(
    "media",
    rows.map((b) => b.logo_url ?? "").filter(Boolean),
    60 * 60,
  );
  return rows.map((b) => ({
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
    await sql`insert into public.bookmakers
        (id, name, logo_url, deposit_enabled, withdraw_enabled, deposit_fee_percent, withdraw_fee_percent,
         address, min_amount, max_amount, sort_order, is_active)
      values
        (${data.id}, ${data.name}, ${data.logo_url}, ${data.deposit_enabled}, ${data.withdraw_enabled},
         ${data.deposit_fee_percent}, ${data.withdraw_fee_percent}, ${data.address}, ${data.min_amount},
         ${data.max_amount}, ${data.sort_order}, ${data.is_active})
      on conflict (id) do update set
        name = excluded.name,
        logo_url = excluded.logo_url,
        deposit_enabled = excluded.deposit_enabled,
        withdraw_enabled = excluded.withdraw_enabled,
        deposit_fee_percent = excluded.deposit_fee_percent,
        withdraw_fee_percent = excluded.withdraw_fee_percent,
        address = excluded.address,
        min_amount = excluded.min_amount,
        max_amount = excluded.max_amount,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active`;
    clearCache("wallet-");
    return { ok: true };
  });

export const adminDeleteBookmaker = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    await sql`delete from public.bookmakers where id = ${data.id}`;
    clearCache("wallet-");
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
  const rows = await sql<{ slot: string; storage_path: string | null; updated_at: string }[]>`
    select slot, storage_path, ${ts("updated_at")} as updated_at from public.videos`;
  const out: Record<string, { url: string | null; updated_at: string }> = {};
  for (const v of rows) {
    out[v.slot] = { url: await signedUrl("media", v.storage_path, 60 * 60), updated_at: v.updated_at };
  }
  return out;
});

export const adminSaveVideo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ slot: z.string().max(40), path: z.string().max(300).nullable() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (!VIDEO_SLOT_IDS.includes(data.slot)) throw new Error("unknown_slot");
    const old = await maybeOne(
      sql<{ storage_path: string | null }[]>`select storage_path from public.videos where slot = ${data.slot}`,
    );
    if (data.path === null) {
      await sql`delete from public.videos where slot = ${data.slot}`;
    } else {
      if (!data.path.startsWith("videos/")) throw new Error("invalid_path");
      await sql`insert into public.videos (slot, storage_path, tg_file_id, url, updated_at)
        values (${data.slot}, ${data.path}, null, null, now())
        on conflict (slot) do update set
          storage_path = excluded.storage_path,
          tg_file_id = null,
          url = null,
          updated_at = now()`;
    }
    clearCache("wallet-");
    if (old?.storage_path && old.storage_path !== data.path) await removeMedia("media", old.storage_path);
    return { ok: true };
  });

// ---------- Settings ----------
export const adminGetSettings = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  return getSettings();
});

export const adminSaveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.record(z.string(), z.string().max(2000)).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const clean: Record<string, string> = {};
    for (const k of SETTING_KEYS) {
      const v = data[k];
      if (v !== undefined) clean[k] = v.trim();
    }
    const card = clean["card_number"];
    if (card) clean["card_number"] = card.replace(/\D/g, "");
    // "1 000 000" → "1000000": a limit typed with spaces must not silently turn into "no limit".
    for (const k of [
      "daily_withdraw_limit",
      "weekly_withdraw_limit",
      "suspicious_repeat_count",
      "bonus_referral_reward",
      "bonus_daily_min",
      "bonus_daily_max",
      "bonus_withdraw_min",
    ] as const) {
      const v = clean[k];
      if (v !== undefined) clean[k] = v.replace(/[\s,'_]/g, "") || "0";
      if (clean[k] !== undefined && !/^\d+$/.test(clean[k]!)) throw new Error(`Faqat raqam kiriting: ${k}`);
    }
    const mode = clean["bonus_withdraw_mode"];
    if (mode !== undefined && mode !== "auto" && mode !== "manual") clean["bonus_withdraw_mode"] = "manual";
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
      allowed_updates: ["message", "callback_query", "my_chat_member"],
      // Telegram delivers up to this many updates at once (default 40) — busy hours need more.
      max_connections: 100,
      drop_pending_updates: false,
    });
    await applyBotProfile(s.brand_name).catch((e) => console.error("bot profile", e));
    // Admins also see /admin and /karta in their own command list.
    for (const id of parseAdminIds(s.admin_chat_id).filter((x) => x > 0)) {
      await tg("setMyCommands", {
        scope: { type: "chat", chat_id: id },
        commands: [
          { command: "admin", description: "🛠 Admin panel" },
          { command: "karta", description: "To'ldirish kartasini o'zgartirish" },
          { command: "start", description: "Boshlash / Начать" },
          { command: "menu", description: "Bosh menyu / Главное меню" },
          { command: "lang", description: "Til / Язык" },
        ],
      }).catch(() => undefined);
    }
    await saveSettings({ public_url: base, bot_username: bot.username });
    return { ok: true, bot: bot.username };
  });

// ---------- Linebet cashdesk API (automatic deposit / withdraw) ----------
// Secret values (cashier password, hash) are never sent back to the browser.
export const adminCashdeskStatus = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const panel = await panelCredValues("LINEBET");
  const pick = (k: string) => panel[k]?.trim() || process.env[k]?.trim() || "";
  const creds = await loadCashdeskCreds("linebet");
  return {
    configured: !!creds,
    cashdeskId: pick("LINEBET_CASHDESK_ID"),
    apiUrl: pick("LINEBET_API_URL"),
    lng: pick("LINEBET_LNG"),
    hasPass: !!pick("LINEBET_CASHIER_PASS"),
    hasHash: !!pick("LINEBET_HASH"),
  };
});

export const adminSaveCashdesk = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        cashdeskId: z.string().trim().regex(/^\d{0,15}$/, "Kassa ID faqat raqam"),
        cashierPass: z.string().max(200).optional(),
        hash: z.string().max(300).optional(),
        apiUrl: z.union([z.literal(""), z.string().trim().url().max(300)]),
        lng: z.string().trim().max(5),
        clear: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    if (data.clear) {
      await savePanelCreds("LINEBET", { CASHDESK_ID: "", CASHIER_PASS: "", HASH: "", API_URL: "", LNG: "" });
      return { ok: true };
    }
    await savePanelCreds("LINEBET", {
      CASHDESK_ID: data.cashdeskId,
      // Empty secret field = keep the saved one.
      CASHIER_PASS: data.cashierPass?.trim() ? data.cashierPass : undefined,
      HASH: data.hash?.trim() ? data.hash : undefined,
      API_URL: data.apiUrl,
      LNG: data.lng,
    });
    return { ok: true };
  });

export const adminTestCashdesk = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        playerId: z.string().trim().regex(/^\d{0,15}$/),
        // Unsaved form values; empty = use the saved one. Never echoed back.
        cashdeskId: z.string().trim().regex(/^\d{0,15}$/).optional(),
        cashierPass: z.string().max(200).optional(),
        hash: z.string().max(300).optional(),
        apiUrl: z.union([z.literal(""), z.string().trim().url().startsWith("https://").max(300)]).optional(),
        lng: z.string().trim().max(5).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    // Read-only check: asks the cashdesk balance and (optionally) looks a player up. No money moves.
    const { creds, missing } = await loadCashdeskDraft("linebet", {
      CASHDESK_ID: data.cashdeskId,
      CASHIER_PASS: data.cashierPass,
      HASH: data.hash,
      API_URL: data.apiUrl,
      LNG: data.lng,
    });
    if (!creds) return { verdict: cashdeskVerdict({ missing }), serverIp: await serverPublicIp(), balance: null, checkedAt: Date.now() };
    const [balance, serverIp] = await Promise.all([cashdeskBalance(creds), serverPublicIp()]);
    const player = data.playerId && balance.ok ? await cashdeskFindUser(creds, data.playerId) : undefined;
    return {
      verdict: cashdeskVerdict({ missing, balance, player }),
      serverIp,
      balance: balance.ok ? { balance: balance.balance, limit: balance.limit } : null,
      checkedAt: Date.now(),
    };
  });

// ---------- Promo codes ----------
export const adminListPromos = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  await ensureMigrations();
  return sql<
    {
      code: string;
      bonus_percent: number;
      max_uses: number;
      used_count: number;
      per_user: number;
      expires_at: string | null;
      is_active: boolean;
      note: string;
      bonus_total: number;
      created_at: string;
    }[]
  >`
    select p.code, p.bonus_percent::float8 as bonus_percent, p.max_uses, p.used_count, p.per_user,
      case when p.expires_at is null then null else ${ts("p.expires_at")} end as expires_at,
      p.is_active, p.note, ${ts("p.created_at")} as created_at,
      coalesce((select sum(r.bonus) from public.promo_redemptions r where r.code = p.code), 0)::float8 as bonus_total
    from public.promo_codes p
    order by p.created_at desc`;
});

export const adminSavePromo = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        code: z.string().trim().min(2).max(32),
        bonus_percent: z.number().min(0.1).max(100),
        max_uses: z.number().int().min(0).max(1_000_000),
        per_user: z.number().int().min(0).max(1000),
        expires_at: z.string().max(40).nullable(),
        is_active: z.boolean(),
        note: z.string().max(200).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await ensureMigrations();
    const code = normalizePromo(data.code);
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw new Error("promo_bad_code");
    const expires = data.expires_at ? new Date(data.expires_at) : null;
    if (expires && Number.isNaN(expires.getTime())) throw new Error("promo_bad_date");
    await sql`insert into public.promo_codes (code, bonus_percent, max_uses, per_user, expires_at, is_active, note)
      values (${code}, ${data.bonus_percent}, ${data.max_uses}, ${data.per_user}, ${expires ? expires.toISOString() : null}, ${data.is_active}, ${data.note})
      on conflict (code) do update set
        bonus_percent = excluded.bonus_percent,
        max_uses = excluded.max_uses,
        per_user = excluded.per_user,
        expires_at = excluded.expires_at,
        is_active = excluded.is_active,
        note = excluded.note`;
    return { ok: true, code };
  });

export const adminDeletePromo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    await sql`delete from public.promo_codes where code = ${normalizePromo(data.code)}`;
    return { ok: true };
  });

// ---------- Bot auto-replies ----------
export const adminListReplies = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  await ensureMigrations();
  return sql<
    {
      id: string;
      keywords: string;
      question_uz: string;
      answer_uz: string;
      question_ru: string;
      answer_ru: string;
      question_en: string;
      answer_en: string;
      sort_order: number;
      is_active: boolean;
    }[]
  >`
    select id::text as id, keywords, question_uz, answer_uz, question_ru, answer_ru, question_en, answer_en, sort_order, is_active
    from public.auto_replies order by sort_order, created_at`;
});

const replySchema = z.object({
  id: z.string().uuid().nullable(),
  keywords: z.string().max(1000),
  question_uz: z.string().trim().min(1).max(200),
  answer_uz: z.string().trim().min(1).max(3000),
  question_ru: z.string().trim().max(200),
  answer_ru: z.string().trim().max(3000),
  question_en: z.string().trim().max(200),
  answer_en: z.string().trim().max(3000),
  sort_order: z.number().int().min(0).max(1000),
  is_active: z.boolean(),
});

export const adminSaveReply = createServerFn({ method: "POST" })
  .inputValidator((d) => replySchema.parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    await ensureMigrations();
    if (data.id) {
      await sql`update public.auto_replies set
          keywords = ${data.keywords}, question_uz = ${data.question_uz}, answer_uz = ${data.answer_uz},
          question_ru = ${data.question_ru}, answer_ru = ${data.answer_ru}, question_en = ${data.question_en},
          answer_en = ${data.answer_en}, sort_order = ${data.sort_order}, is_active = ${data.is_active}
        where id = ${data.id}`;
    } else {
      await sql`insert into public.auto_replies
          (keywords, question_uz, answer_uz, question_ru, answer_ru, question_en, answer_en, sort_order, is_active)
        values (${data.keywords}, ${data.question_uz}, ${data.answer_uz}, ${data.question_ru}, ${data.answer_ru},
          ${data.question_en}, ${data.answer_en}, ${data.sort_order}, ${data.is_active})`;
    }
    clearCache("auto-replies");
    return { ok: true };
  });

export const adminDeleteReply = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    await sql`delete from public.auto_replies where id = ${data.id}`;
    clearCache("auto-replies");
    return { ok: true };
  });
