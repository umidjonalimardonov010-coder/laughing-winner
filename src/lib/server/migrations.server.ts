// One-time data changes applied by the running app (Railway has no migration runner).
// Each step runs once, recorded in public.app_migrations; safe to call on every request.
import { sql } from "./db.server";
import { withOwnerAdmin } from "./admins";
import { tg, telegramMode, webhookSecret } from "./telegram.server";
import { FAQ } from "@/lib/i18n";
import { applyBotProfile } from "./bot-profile.server";
import { BONUS_DEFAULTS } from "@/lib/bonus-rules";

// Keywords for the starter bot auto-replies (one per built-in FAQ entry, same order).
const FAQ_KEYWORDS = [
  "bot nima, nima uchun kerak, для чего, что это за бот, what is this bot",
  "balansni to'ldir, hamyonni to'ldir, hamyon to'ldir, пополнить баланс, пополнить кошел, top up",
  "pul yech, pulni yech, kartaga yech, вывести деньги, вывод на карту, withdraw money",
  "bk to'ldir, bukmekerga, linebetga, пополнить букмекер, fund a bookmaker",
  "bk dan yech, bukmekerdan, chiqarish kodi, 4 belgili kod, вывести из букмекер, withdraw from a bookmaker",
  "qancha vaqt, necha daqiqa, qachon tushadi, сколько времени, когда придут, how long",
  "muvaffaqiyatsiz, rad etildi, tushmadi, не прошла, отклонен, failed, rejected",
];

const STEPS: { id: string; run: () => Promise<unknown> }[] = [
  {
    // Only LINEBET is offered (automatic cashdesk); the rest stay in the admin panel, hidden,
    // and can be switched back on there ("Ko'rinadi").
    id: "2026-11-13-linebet-only",
    run: async () => {
      await sql`update public.bookmakers set is_active = false where id <> 'linebet'`;
      await sql`update public.bookmakers set is_active = true, deposit_enabled = true, withdraw_enabled = true where id = 'linebet'`;
    },
  },
  {
    // The owner's Telegram account manages everything (admin panel + request alerts).
    id: "2026-11-13-owner-admin-8787603995",
    run: async () => {
      const rows = await sql<{ value: string }[]>`select value from public.app_settings where key = 'admin_chat_id'`;
      const value = withOwnerAdmin(rows[0]?.value ?? "");
      await sql`insert into public.app_settings (key, value, updated_at) values ('admin_chat_id', ${value}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()`;
    },
  },
  {
    // Withdrawal selfie (front camera photo) kept with the request.
    id: "2026-11-14-transactions-selfie",
    run: () => sql`alter table public.transactions add column if not exists selfie_path text`,
  },
  {
    // The bot also hears "added as channel admin" (my_chat_member) so the selfie channel links itself.
    // Keeps the current webhook address; a failure here must not block other steps.
    id: "2026-11-14-webhook-my-chat-member",
    run: async () => {
      if (telegramMode() === "none") return;
      try {
        const info = await tg<{ url?: string; allowed_updates?: string[] }>("getWebhookInfo");
        if (!info.url) return;
        await tg("setWebhook", {
          url: info.url,
          secret_token: await webhookSecret(),
          allowed_updates: ["message", "callback_query", "my_chat_member"],
          max_connections: 100,
          drop_pending_updates: false,
        });
      } catch (e) {
        console.error("[migrations] webhook my_chat_member", e);
      }
    },
  },
  {
    // Money safety (flags, limits), promo codes and bot auto-replies.
    id: "2026-11-15-safety-promo-replies",
    run: async () => {
      await sql`alter table public.transactions add column if not exists flag text`;
      await sql`alter table public.transactions add column if not exists promo_code text`;
      await sql`create index if not exists transactions_card_idx on public.transactions(card_number) where card_number is not null and card_number <> ''`;
      await sql`create index if not exists transactions_account_idx on public.transactions(bookmaker_id, account_id) where account_id is not null and account_id <> ''`;
      await sql`create table if not exists public.promo_codes (
        code text primary key,
        bonus_percent numeric(6,2) not null default 0,
        max_uses int not null default 0,
        used_count int not null default 0,
        per_user int not null default 1,
        expires_at timestamptz,
        is_active boolean not null default true,
        note text not null default '',
        created_at timestamptz not null default now()
      )`;
      await sql`create table if not exists public.promo_redemptions (
        id uuid primary key default gen_random_uuid(),
        code text not null references public.promo_codes(code) on delete cascade,
        user_id bigint not null references public.tg_users(id) on delete cascade,
        tx_id uuid,
        bonus bigint not null default 0,
        created_at timestamptz not null default now()
      )`;
      await sql`create index if not exists promo_redemptions_user_idx on public.promo_redemptions(code, user_id)`;
      await sql`create table if not exists public.auto_replies (
        id uuid primary key default gen_random_uuid(),
        keywords text not null default '',
        question_uz text not null default '',
        answer_uz text not null default '',
        question_ru text not null default '',
        answer_ru text not null default '',
        question_en text not null default '',
        answer_en text not null default '',
        sort_order int not null default 0,
        is_active boolean not null default true,
        created_at timestamptz not null default now()
      )`;
      // Same as every table here: RLS on, no public policies — only the server reaches them.
      await sql`alter table public.promo_codes enable row level security`;
      await sql`alter table public.promo_redemptions enable row level security`;
      await sql`alter table public.auto_replies enable row level security`;
      await sql`insert into public.app_settings (key, value) values
        ('daily_withdraw_limit', '0'), ('weekly_withdraw_limit', '0'), ('suspicious_repeat_count', '3')
        on conflict (key) do nothing`;
      // Starter Q&A = the wallet's built-in FAQ, so the bot answers the same way from day one.
      const existing = await sql<{ n: number }[]>`select count(*)::int as n from public.auto_replies`;
      if (!existing[0]?.n) {
        for (let i = 0; i < FAQ.uz.length; i++) {
          await sql`insert into public.auto_replies
            (keywords, question_uz, answer_uz, question_ru, answer_ru, question_en, answer_en, sort_order)
            values (${FAQ_KEYWORDS[i] ?? ""}, ${FAQ.uz[i]?.q ?? ""}, ${FAQ.uz[i]?.a ?? ""}, ${FAQ.ru[i]?.q ?? ""},
              ${FAQ.ru[i]?.a ?? ""}, ${FAQ.en[i]?.q ?? ""}, ${FAQ.en[i]?.a ?? ""}, ${i + 1})`;
        }
      }
    },
  },
  {
    // Plain chat bot (LordPay style): conversation steps, saved card / bookmaker IDs, request source.
    id: "2026-11-15-bot-exchange",
    run: async () => {
      await sql`alter table public.transactions add column if not exists source text`;
      await sql`create table if not exists public.bot_state (
        user_id bigint primary key references public.tg_users(id) on delete cascade,
        step text not null,
        data jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )`;
      await sql`create table if not exists public.user_accounts (
        user_id bigint not null references public.tg_users(id) on delete cascade,
        kind text not null,
        value text not null,
        updated_at timestamptz not null default now(),
        primary key (user_id, kind)
      )`;
      await sql`alter table public.bot_state enable row level security`;
      await sql`alter table public.user_accounts enable row level security`;
    },
  },
  {
    // The WALLET mini app is gone: drop its menu button, set the "what can this bot do" text.
    id: "2026-11-15-bot-profile",
    run: async () => {
      if (telegramMode() === "none") return;
      try {
        const rows = await sql<{ value: string }[]>`select value from public.app_settings where key = 'brand_name'`;
        await applyBotProfile(rows[0]?.value ?? "");
      } catch (e) {
        console.error("[migrations] bot profile", e);
      }
    },
  },
  {
    // Bonus menu: daily bonus day, "referral already paid" mark, admin defaults.
    // Friends who already had an approved deposit count as paid — the reward is for new first deposits.
    id: "2026-11-15-bonus-menu",
    run: async () => {
      await sql`alter table public.tg_users add column if not exists last_daily_bonus date`;
      await sql`alter table public.tg_users add column if not exists referral_paid boolean not null default false`;
      await sql`update public.tg_users u set referral_paid = true
        where exists (select 1 from public.transactions t where t.user_id = u.id and t.type = 'bk_deposit' and t.status = 'approved')`;
      for (const [key, value] of Object.entries(BONUS_DEFAULTS)) {
        await sql`insert into public.app_settings (key, value) values (${key}, ${value}) on conflict (key) do nothing`;
      }
    },
  },
  {
    // HamyonAPI automatic deposits: payment id, card, state and the customer's payment message.
    id: "2026-11-17-hamyon-payments",
    run: async () => {
      await sql`alter table public.transactions add column if not exists pay_id text`;
      await sql`alter table public.transactions add column if not exists pay_card text`;
      await sql`alter table public.transactions add column if not exists pay_state text`;
      await sql`alter table public.transactions add column if not exists pay_msg_id bigint`;
      await sql`alter table public.transactions add column if not exists pay_expire_at timestamptz`;
      await sql`create unique index if not exists transactions_pay_id_idx on public.transactions(pay_id) where pay_id is not null`;
      await sql`create index if not exists transactions_pay_wait_idx on public.transactions(created_at) where pay_state = 'wait'`;
    },
  },
];

let done: Promise<void> | undefined;

export function ensureMigrations(): Promise<void> {
  if (!done) {
    done = (async () => {
      await sql`create table if not exists public.app_migrations (id text primary key, applied_at timestamptz not null default now())`;
      for (const step of STEPS) {
        await sql.begin(async (tx) => {
          const claimed = await tx`insert into public.app_migrations (id) values (${step.id}) on conflict do nothing returning id`;
          if (claimed.length) await step.run();
        });
      }
    })().catch((e) => {
      done = undefined;
      console.error("[migrations]", e);
    });
  }
  return done;
}
