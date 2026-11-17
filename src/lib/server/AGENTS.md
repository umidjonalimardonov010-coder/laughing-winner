# Server rules (bot)
- Bot auto-replies come from `public.auto_replies` (admin page "Avto-javoblar"), cached 30 s and cleared on save.
- Conversation steps live in `public.bot_state` (taken atomically with `takeState` before money moves); saved card/bookmaker IDs in `public.user_accounts`; input rules (UZCARD/HUMO, ID, code, amount) are pure in `src/lib/exchange-rules.ts` — so the flow survives restarts and the rules stay tested.
- Bot reply keyboards: main menu, an Amallar submenu, and per-step keyboards (saved value + Cancel); any menu button clears the current step — matching the reference bot the owner chose.
- Telegram alerts from server code run via `inBackground()` so the bot replies first.
