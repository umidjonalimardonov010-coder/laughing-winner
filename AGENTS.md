<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (Kassa 24/7)
- Self-hosting target is Railway via the root Dockerfile (NITRO_PRESET=node-server, `node .output/server/index.mjs`); keep server code Node- and Worker-compatible so both Lovable preview and Railway run it.
- Railway uses its own database set up from `railway/setup.sql`; regenerate that file from `drizzle/migrations/*.sql` (plus storage bucket inserts) whenever a migration is added — because Lovable Cloud's service key is not available outside Lovable.
- All database access goes through `src/lib/server/db.server.ts` after verifying the caller (Telegram initData or admin session); tables have RLS on with no public policies — so the database is never reachable from the browser.
- Telegram calls use TELEGRAM_BOT_TOKEN directly when set, else the Lovable connector gateway — so the same code runs on Railway and in the preview.
- Code reaches GitHub (`laughing-winner` main, which Railway auto-deploys) only via `python3 scripts/push-to-github.py "msg"` with the Lovable GitHub connector linked; it mirrors the project and deletes remote files missing locally (except `.env`, `supabase/config.toml`) — because Git sync cannot attach to an existing repo.
- Browser uploads use the server-made signed URL (`src/lib/upload.ts`), never the browser storage client — so uploads hit the same storage as the server on Railway.
- Bookmaker cashdesk automation lives in `src/lib/server/cashdesk.server.ts` (credentials from the admin panel's app_settings keys `<prefix>_cashdesk_id/...`, falling back to `<PREFIX>_CASHDESK_ID/_CASHIER_PASS/_HASH` env vars; always load them via `loadCashdeskCreds`; secrets are never returned to the browser); the wallet approves on a clear success, refunds on a clear refusal and leaves the request pending for an admin on any unclear answer — because money may already have moved.
- One-time data changes go in `src/lib/server/migrations.server.ts` (recorded in `app_migrations`, run lazily from bootstrap/bot/admin) — because Railway has no migration runner.
- Data read on every bot message (settings, active bookmakers, auto-replies) goes through `cached()` in `src/lib/server/memo.server.ts` with a few-second TTL and `clearCache()` on admin saves; media links use rounded expiry so URLs stay stable — so many users at once don't flood the database or re-download images.
- Columns added later by `migrations.server.ts` are read with `to_jsonb(t) ->> 'col'` in shared queries (e.g. `selfie_path`), not added to `TX_COLS` — so queries keep working before the migration has run.

- Money safety rules (card-withdraw limits, suspicious card/BK account, promo validity) are pure functions in `src/lib/money-rules.ts`; database reads for them live in `src/lib/server/safety.server.ts` — so wallet, bot and admin enforce one tested rule set.
- A flagged request (`transactions.flag`) never pays out automatically; Telegram ✅ asks a second time (`adm:ok` → `adm:ok2`) and the panel asks `confirm()` — because flagged money must be checked by a person.
- Promo use is claimed inside the same `sql.begin` as `create_debit_request` and released on reject — so a failed or refused deposit never eats a promo use.
- Bot auto-replies come from `public.auto_replies` (admin page "Avto-javoblar"), cached 30 s and cleared on save.
- The customer side is the chat bot only (LordPay style, `src/lib/server/bot.server.ts`); the WALLET mini app was removed — so there is no wallet balance for new requests.
- Bot requests carry `transactions.source = 'bot'` and are approved/rejected by `approveBotRequest`/`rejectBotRequest` in `src/lib/server/exchange.server.ts`, never by the SQL balance functions — so card ⇄ bookmaker money never touches `tg_users.balance`.
- Bot deposit: the user transfers an exact sum with a unique 100–999 tail (`pickPayAmount`) to `card_number`; admin ✅ then sends it to the bookmaker via the cashdesk, claimed with an `admin_note` marker so it is never sent twice; an unclear answer leaves it pending and the next ✅ closes it without resending.
- Conversation steps live in `public.bot_state` (taken atomically with `takeState` before money moves); saved card/bookmaker IDs in `public.user_accounts`; input rules (UZCARD/HUMO, ID, code, amount) are pure in `src/lib/exchange-rules.ts` — so the flow survives restarts and the rules stay tested.
- Bot reply keyboards: main menu, an Amallar submenu, and per-step keyboards (saved value + Cancel); any menu button clears the current step — matching the reference bot the owner chose.
- Telegram alerts from server code run via `inBackground()` so the bot replies first.
