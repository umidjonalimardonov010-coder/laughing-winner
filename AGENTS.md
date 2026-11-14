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
- After each change, push to GitHub `umidjonalimardonov010-coder/laughing-winner` main with `python3 scripts/push-to-github.py "msg"` (Lovable GitHub connector); Railway auto-deploys from that branch — because Lovable Git sync cannot push to that existing repo.
- Browser uploads use the server-made signed URL (`src/lib/upload.ts`), never the browser storage client — so uploads hit the same storage as the server on Railway.
- Bookmaker cashdesk automation lives in `src/lib/server/cashdesk.server.ts` (credentials from the admin panel's app_settings keys `<prefix>_cashdesk_id/...`, falling back to `<PREFIX>_CASHDESK_ID/_CASHIER_PASS/_HASH` env vars; always load them via `loadCashdeskCreds`; secrets are never returned to the browser); the wallet approves on a clear success, refunds on a clear refusal and leaves the request pending for an admin on any unclear answer — because money may already have moved.
- One-time data changes go in `src/lib/server/migrations.server.ts` (recorded in `app_migrations`, run lazily from bootstrap/bot/admin) — because Railway has no migration runner.
- Data read on every wallet open (settings, active bookmakers, videos) goes through `cached()` in `src/lib/server/memo.server.ts` with a few-second TTL and `clearCache()` on admin saves; media links use rounded expiry so URLs stay stable — so many users opening at once don't flood the database or re-download images.
- Wallet UI avoids `backdrop-filter`/`filter: blur` over the animated backdrop and animates only transform/opacity — because blur over moving layers freezes cheap phones.
