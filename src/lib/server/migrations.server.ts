// One-time data changes applied by the running app (Railway has no migration runner).
// Each step runs once, recorded in public.app_migrations; safe to call on every request.
import { sql } from "./db.server";
import { withOwnerAdmin } from "./admins";

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
