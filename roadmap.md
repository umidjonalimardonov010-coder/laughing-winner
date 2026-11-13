# Kassa bot roadmap

- [x] Database: users, bookmakers, requests, settings, videos, storage
- [x] Telegram bot: /start, language, main menu (6 buttons), referral, rates, history, support
- [x] Wallet mini app: home, services + deposit/withdraw sheets, history, new, profile, help, videos, top-up, card withdraw
- [x] Admin panel: login, dashboard/reports, requests approve/reject, users, bookmakers, videos (labeled slots), settings, connect bot
- [x] Fix type errors, landing page at /, admin password + session secret
- [ ] Telegram bot: on Railway via TELEGRAM_BOT_TOKEN + "Botni ulash" — waiting for user's deploy
- [x] Bookmaker API: LINEBET cashdesk (ID check, auto deposit/withdraw) — live once LINEBET_* keys are in Railway
- [x] Railway: Dockerfile, start script, own-database setup SQL, RAILWAY.md guide (user deploys)
- [x] Put code on GitHub (laughing-winner repo, pushed via GitHub connector)
- [x] Telegram admin: 8787603995 manages everything — /admin opens the panel signed in, ✅/❌ under each alert, receipt photo, /karta sets the top-up card
- [ ] Top-up card number — owner enters it with /karta (wallet top-up is blocked until then)
- [x] Referral: real invite link (https://t.me/<bot>?start=<id>) + share button; bot name fetched from Telegram if not saved
- [x] LINEBET design: green/gold theme, new background, spinning coins, pro buttons, new pictures
- [x] Linebet API check explains 401 (wrong keys) / 403 (server IP not allowed) and shows server IP
- [ ] Linebet API live — waiting for: cashier password in admin panel + Linebet allowing Railway's server IP
