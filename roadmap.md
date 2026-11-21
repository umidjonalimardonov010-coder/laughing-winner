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
- [x] Admin: safe "Ulanishni tekshirish" with step-by-step result (keys, server, IP, keys accepted, player)
- [x] Wallet: full screen on phones, pinned headers (Tarix), no page bounce, live stadium background instead of coins
- [x] Mandatory phone: bot asks own contact before menu; wallet asks too; no money ops without phone
- [x] Withdraw selfie: front camera step in card + Linebet withdraw; photo + details sent to private channel
- [x] Pro visuals/animations for the new steps; push to GitHub
- [x] Selfie channel links itself: admin adds bot as channel admin, or forwards a channel post to the bot (invite links can't give the ID)
- [x] Requests → bot only (pro layout with phone + time); selfies → channel only; /kanal + one-tap 'add bot to channel'
- [x] Bot/wallet speed: alerts sent after the reply, webhook answers Telegram within 4 s, buttons stop spinning at once
- [x] Selfie auto-shot when the full face is centred in the oval (face detection), manual button still works
- [x] Selfie channel — no longer used (wallet removed, bot has no selfie step)

## 2026-11-15 request: money safety, users, admin, comfort
- [x] Bot: nothing disappears/reappears — edit messages in place, stop re-sending the bottom keyboard; wallet screens don't blink
- [x] Status alerts to the user on approve/reject (already existed) — friendlier text, 3 languages
- [x] Daily / weekly card-withdraw limits (admin sets them in Sozlamalar)
- [x] Suspicious requests: same card / same BK account across users or too often → flagged, no auto payout, admin double-confirm
- [x] Promo codes: admin page + wallet input on BK deposit, extra bonus %
- [x] Referral: link, share, count and earned visible in wallet
- [x] Wallet history: show reject reason
- [x] Admin stats: requests per day, top active users
- [x] Block user in one tap (Telegram alert + requests page; users page already had it)
- [x] Bot auto-replies: admin-managed Q&A, "❓ Savol-javob" button + keyword answers
- [x] Bot gets English (wallet already had it)
- [x] Languages: bot is now O'zbek + Русский like the reference bot
- [x] Dark mode: wallet is already dark — tell user

## 2026-11-15 request: simple bot like the LordPay screenshots
- [x] Send the user the full WALLET code (wallet-kodi.zip in Files) before removing it
- [x] Remove the WALLET mini app; keep the admin panel
- [x] Rebuild the bot like the screenshots: language → phone → main keyboard (Hisob to'ldirish, Hisob raqamlar, Yechib olish, Amallar/Kurs-Zahira, Bog'lanish), BK list, saved BK account IDs
- [ ] Push to GitHub once the bot is done
- [ ] Bring over the per-bookmaker cashdesk keys work from the other Lovable project — waiting: user pushes it to GitHub from that project
- [x] railway/setup.sql: bot tables (bot_state etc.) are created by migrations.server.ts on Railway
- [ ] Finish the "withdraw request kept when keys are refused" check
- [x] Bot "💰 Bonus olish" menu: Balans (+ Yechib olish → Linebet), Do'stimni chaqirish (fixed som per referral, set in admin), Kunlik bonus (min–max som, set in admin)
- [x] Bot «Kurs | Zahira»: admin types sell/buy rate lines in Sozlamalar → Kurs
- [x] Push bonus menu + rates to GitHub
- [x] Main menu: Amallar (history, rates/reserve) removed; 💰 BONUS OLISH sits in its place

## 2026-11-17 request: HamyonAPI automatic deposits
- [x] Bot deposit through HamyonAPI: owner's payment text (uz + ru), card from HamyonAPI, ❌ Bekor qilish, busy sum +1 so'm
- [x] Paid → auto top-up via cashdesk (no keys → admin alert); timeout/cancel → request closed, customer told
- [x] Callback addresses (prepare/complete) + 1-minute status check as a safety net
- [x] Admin panel «HamyonAPI» section (Shop ID, Shop key, both addresses to copy)
- [x] Shop ID/key on Railway, push to GitHub
- [x] Deposit screens like KARVON PAY: ID → F.I.O → summa → «✅BARCHA ILOVALARDAN» → receipt + card (no customer card step)
- [ ] Owner pastes prepare/complete addresses into @HamyonAPIBot shop settings
- [x] 2026-11-18: bot retries when Telegram/HamyonAPI/LINEBET cashdesk can't be reached (Railway connect timeouts); every HamyonAPI callback logged
- [ ] First real customer payment through HamyonAPI (owner tests a small deposit; #30 was a test without money)

## 2026-11-17 request: admin messages
- [x] Admin panel «Xabar yuborish»: everyone (all / uz / ru) or one person, text formatting, photo/video, link button, Telegram preview, test to admin, progress + stop, history

## 2026-11-21 request: admin design + review
- [x] Admin panel LINEBET design: stadium background, 3D picture icons instead of emojis
- [x] Landing page no longer blanks when the connection drops
- [x] Owner question: are payments working / pro level, and what else to add to the bot (answered in chat)

## 2026-11-21 request: VIP + contest (admin panel)
- [x] VIP levels + cashback to bonus balance, level-up message, bot «👑 VIP DARAJA»
- [x] Weekly contest: tickets per som, auto draw Monday 00:00 Tashkent, prizes to bonus balance, winners told (+ optional announce to all), bot «🏆 KONKURS»
- [x] Admin page «VIP va Konkurs»: switches, levels editor, prizes, this week's tickets, draw now, history
- [ ] Owner switches VIP and contest on in the panel and sets the real levels / prizes (both off until then)
