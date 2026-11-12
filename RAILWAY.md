# Kassa 24/7 — Railway'ga joylash yo'riqnomasi

Railway'da ilova **o'zining alohida ma'lumotlar bazasi** bilan ishlaydi (Lovable'dagi bazaga tashqaridan to'liq kirish kaliti berilmaydi).

## 1. Ma'lumotlar bazasini yaratish (bepul)
1. https://supabase.com da ro'yxatdan o'ting → **New project** (region: Frankfurt yoki yaqinroq).
2. Chap menyu → **SQL Editor** → **New query**.
3. `railway/setup.sql` faylining hammasini nusxalab qo'ying → **Run**. (Jadvallar, bukmekerlar, sozlamalar va fayl joylari yaratiladi.)
4. **Project Settings → API** (yoki **API Keys**) bo'limidan oling:
   - `Project URL` → bu `SUPABASE_URL`
   - `service_role` (yoki `secret`) kalit → bu `SUPABASE_SERVICE_ROLE_KEY` (hech kimga ko'rsatmang!)

## 2. Telegram bot tokeni
@BotFather → `/newbot` (yoki mavjud bot) → tokenni oling → bu `TELEGRAM_BOT_TOKEN`.

## 3. Railway
1. https://railway.com → **New Project → Deploy from GitHub repo** → shu loyihaning reposini tanlang.
2. Railway `Dockerfile` ni o'zi topadi va quradi.
3. **Variables** bo'limiga qo'shing:

| Nomi | Qiymati |
|---|---|
| `SUPABASE_URL` | 1-bosqichdagi Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 1-bosqichdagi service_role kalit |
| `TELEGRAM_BOT_TOKEN` | BotFather bergan token |
| `ADMIN_PASSWORD` | Admin panelga kirish paroli (kuchli parol) |
| `SESSION_SECRET` | Kamida 32 ta tasodifiy belgi (masalan, parol generatoridan 64 belgi) |
| `PUBLIC_URL` | (ixtiyoriy) saytingiz manzili, masalan `https://kassa.up.railway.app` |

4. **Settings → Networking → Generate Domain** — sayt manzili chiqadi (https).
5. Qayta deploy bo'lishini kuting.

## 4. Botni ishga tushirish
1. `https://<sizning-manzil>/admin` → parol bilan kiring.
2. **Sozlamalar** → karta raqami, karta egasi, support/kanal username, **admin chat ID** (yangi so'rovlar xabari keladigan Telegram ID) ni kiriting → Saqlash.
3. **Telegram bot → Botni ulash / yangilash** tugmasini bosing. Manzil Railway domeni bo'lishi kerak.
4. Telegram'da botga `/start` yozing — til tanlash va menyu chiqadi, pastda **📱 WALLET** tugmasi bo'ladi.
5. **Videolar** bo'limida har bir kartada video qayerda chiqishi yozilgan — MP4 yuklang.
6. **Bukmekerlar** bo'limida logotiplarni yuklang.

## Texnik ma'lumot (dasturchi uchun)
- Qurish: `NITRO_PRESET=node-server bun run build` (`bun run build:node`), ishga tushirish: `node .output/server/index.mjs` (`bun run start`). Port `PORT` o'zgaruvchisidan olinadi.
- Barcha ma'lumotlar bazasi so'rovlari `src/lib/server/db.server.ts` orqali, server tomonda.
- Bukmeker API (ID tekshirish, avtomatik to'ldirish/yechish) ulanadigan joy: `walletCheckAccount` va `walletBkDeposit`/`walletBkWithdraw` — `src/lib/wallet.functions.ts`.
