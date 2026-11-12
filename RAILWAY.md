# Kassa 24/7 — Railway'ga joylash yo'riqnomasi

Ilova endi **Railway'ning o'z bazasida** (PostgreSQL) ishlaydi. Supabase kerak emas.

## 1. Baza: Railway PostgreSQL
1. https://railway.com → loyihangiz → **New → Database → PostgreSQL**.
2. Railway avtomatik `DATABASE_URL` o'zgaruvchisini yaratadi va ilovaga beradi — o'zingiz yozmang.
3. Jadval va boshlang'ich ma'lumotlarni bir marta yuklang:
   - Postgres xizmati → **Shell** bo'limi (yoki o'z kompyuteringizdagi `psql`) →
     `psql "$DATABASE_URL" -f railway/setup.sql`
   - `railway/setup.sql` takror ishlatilsa ham xato bermaydi.

## 2. Telegram bot tokeni
@BotFather → `/newbot` (yoki mavjud bot) → tokenni oling → bu `TELEGRAM_BOT_TOKEN`.

## 3. Fayllar uchun joy (video, logotip, cheklar)
1. Ilova xizmati → **Settings → Volumes → New Volume**.
2. Mount path: `/data/media`
3. **Variables** bo'limiga: `MEDIA_DIR` = `/data/media`

## 4. Variables
| Nomi | Qiymati |
|---|---|
| `DATABASE_URL` | Railway o'zi beradi (Postgres xizmatini qo'shsangiz avtomatik) |
| `TELEGRAM_BOT_TOKEN` | BotFather bergan token |
| `ADMIN_PASSWORD` | Admin panelga kirish paroli (kuchli parol) |
| `SESSION_SECRET` | Kamida 32 ta tasodifiy belgi (64 belgi yaxshi) |
| `MEDIA_DIR` | `/data/media` (3-bosqichdagi volume yo'li) |
| `PUBLIC_URL` | (ixtiyoriy) saytingiz manzili, masalan `https://kassa.up.railway.app` |

## 5. Deploy
1. **Settings → Networking → Generate Domain** — https manzil chiqadi.
2. GitHub repo ulangan bo'lsa, push qilganda o'zi quradi (Dockerfile).
3. `https://<manzil>/admin` → parol bilan kiring.
4. **Sozlamalar** → karta raqami, karta egasi, support/kanal username, admin chat ID → Saqlash.
5. **Telegram bot → Botni ulash / yangilash** tugmasini bosing.
6. Telegram'da `/start` → menyu va pastda **📱 WALLET** tugmasi.
7. **Videolar** va **Bukmekerlar** bo'limlaridan MP4 va logotiplarni yuklang.

## Texnik ma'lumot (dasturchi uchun)
- Qurish: `bun run build` — `vite.config.ts` da `nitro: { preset: "node-server" }` qo'yilgan,
  shuning uchun `.output/server/index.mjs` chiqadi; Dockerfile o'shani ko'chiradi.
  Ishga tushirish: `node .output/server/index.mjs`, port `PORT` dan olinadi.
- Baza so'rovlari: `src/lib/server/db.server.ts` (`postgres` drayveri), barcha so'rovlar server tomonda.
- Fayllar diskda: `MEDIA_DIR` ichida `media/` (videolar/logotiplar) va `receipts/` (cheklar).
  Yuklash va o'qish faqat vaqtincha imzolangan havola orqali (`/api/public/upload/...`,
  `/api/public/media/...`) — havola `SESSION_SECRET` bilan imzolanadi, muddati o'tgach ishlamaydi.
- Bukmeker API (ID tekshirish, avtomatik to'ldirish) ulanadigan joy:
  `walletCheckAccount`, `walletBkDeposit`, `walletBkWithdraw` — `src/lib/wallet.functions.ts`.
