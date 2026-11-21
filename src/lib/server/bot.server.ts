// Telegram bot (LordPay-style plain chat bot): language → phone → main keyboard.
// Deposit with HamyonAPI (KARVON PAY style): account ID → name check → amount → "✅ BARCHA ILOVALARDAN" → HamyonAPI card,
// paid automatically. Without HamyonAPI: account ID → card → amount → our card → "✅ To'lov qildim" → admin ✅ →
// the cashdesk tops up the account. Withdraw: bookmaker → card → account ID → cashdesk code → payout →
// admin sends the money to the card. Conversation steps live in public.bot_state.
import { ensureMigrations } from "./migrations.server";
import { maybeOne, sql } from "./db.server";
import { getSettings, num, publicBase, saveSettings, type Settings } from "./settings.server";
import { approveRequest, isTelegramAdmin, rejectRequest, requestFlag, setUserBlocked } from "./requests.server";
import { cleanCardNumber } from "./admins";
import { loadCashdeskCreds } from "./cashdesk-config.server";
import { cashdeskFindUser } from "./cashdesk.server";
import { escapeHtml, tg } from "./telegram.server";
import { savePhone, upsertTgUser, type TgFrom, type TgUser } from "./users.server";
import { isOwnContact, normalizePhone } from "@/lib/verification";
import { channelFromBotPromotion, channelFromForward, type ChannelRef } from "@/lib/channel-link";
import { resolveBotUsername } from "./bot-username.server";
import { formatSom, maskCard } from "@/lib/format";
import { matchReply, replyText, type AutoReply } from "@/lib/auto-reply";
import { cached } from "./memo.server";
import { adminKeyboard, inBackground, notifyAdminsNewRequest } from "./notify.server";
import { depositSplit, parseAccountId, parseAmount, parseUzCard, parseWithdrawCode, pickPayAmount } from "@/lib/exchange-rules";
import {
  clearState,
  createBotDeposit,
  createBotWithdraw,
  getState,
  listBookmakers,
  minMax,
  saveAccount,
  savedAccounts,
  setState,
  takeState,
  takenPayAmounts,
  type StepData,
} from "./exchange.server";
import type { Bookmaker } from "./wallet-auth.server";
import { BONUS_BK, autoSendBonus, bonusBalance, createBonusWithdraw } from "./bonus.server";
import { BONUS_TXT, balanceScreen, dailyScreen, inviteScreen } from "./bot-bonus.server";
import { bonusConfig, checkBonusWithdraw } from "@/lib/bonus-rules";
import { cancelByUser, cancelKeyboard, loadHamyonCreds, openPayment, savePayMessage, startHamyonDeposit, startHamyonWatcher } from "./hamyon.server";
import { paySummary } from "@/lib/hamyon-rules";
import { resumeBroadcasts } from "./broadcast.server";
import { missingChannels, requiredChannels, type MissingChannel } from "./subscription.server";
import { isRequiredChannel } from "@/lib/subscription-rules";

type L = "uz" | "ru";
const langOf = (v: string | null | undefined): L => (v === "ru" ? "ru" : "uz");

const MENU = {
  uz: {
    deposit: "📮 Hisob to'ldirish",
    accounts: "💳 Hisob raqamlar",
    withdraw: "📤 Yechib olish",
    ops: "📆 Amallar, 💰 Kurs-Zahira",
    contact: "📲 Bog'lanish",
    history: "📆 Amallar",
    rates: "🏧 Kurs | 💰 Zahira",
    back: "🔙 Bosh menyu",
    cancel: "<<< Ortga qaytish",
    cancelOld: "↪️ Bekor qilish",
    bonus: "💰 BONUS OLISH",
    balance: "💳 BALANS",
    invite: "👥 DO'STIMNI CHAQIRISH",
    daily: "🎁 KUNLIK BONUS",
  },
  ru: {
    deposit: "📮 Пополнить счёт",
    accounts: "💳 Мои счета",
    withdraw: "📤 Вывести",
    ops: "📆 Операции, 💰 Курс-Резерв",
    contact: "📲 Связаться",
    history: "📆 Операции",
    rates: "🏧 Курс | 💰 Резерв",
    back: "🔙 Главное меню",
    cancel: "<<< Назад",
    cancelOld: "↪️ Отмена",
    bonus: "💰 ПОЛУЧИТЬ БОНУС",
    balance: "💳 БАЛАНС",
    invite: "👥 ПРИГЛАСИТЬ ДРУГА",
    daily: "🎁 ЕЖЕДНЕВНЫЙ БОНУС",
  },
};
type MenuKey = keyof (typeof MENU)["uz"];

const CARD_HINT_UZ = "👉 Faqat UZCARD yoki HUMO kartangizni qo'shing boshqa turdagi kartalar to'g'ri kelmaydi";
const CARD_HINT_RU = "👉 Добавляйте только карту UZCARD или HUMO, другие карты не подходят";

const TXT = {
  uz: {
    phoneAsk: "Telefon raqamingizni pastdagi tugmani bosib yuboring",
    phoneBtn: "📱 Raqam yuborish",
    notOwn: "⚠️ Bu boshqa odamning kontakti. Pastdagi tugma orqali o'zingizning raqamingizni yuboring.",
    phoneSaved: "Telefon raqamingiz saqlandi botdan foydalanishingiz mumkin",
    langSaved: "🇺🇿 O'zbek tili tanlandi",
    mainMenu: "Bosh menyu",
    blocked: "⛔ Hisobingiz bloklangan. Bog'lanish uchun qo'llab-quvvatlashga yozing.",
    pick: "Tugmalardan kerakligini bosing",
    depPick: "Hisobingizga pul solmoqchi bo'lgan Kontorani bosing:",
    noDep: "Hozircha to'ldirish uchun kontoralar yo'q.",
    depOff: "Hisob to'ldirish vaqtincha ishlamayapti. Birozdan keyin urinib ko'ring.",
    askAccount: (bk: string) => `${bk} hisob raqamini kiriting:`,
    badAccount: "ID raqam faqat raqamlardan iborat bo'lishi kerak (5–15 ta). Qaytadan kiriting:",
    noAccount: "Bu hisob mavjud emas\nID raqamingizni kiring",
    askCard: `ℹ️ Karta raqamingizni tanlang yoki hisob to'ldirgan kartangizni kiriting, yechib olishda hisob to'ldirgan kartangizni kiritishingiz tavsiya qilinadi\n\n${CARD_HINT_UZ}`,
    badCard: `❗️ Karta raqami noto'g'ri. 16 xonali UZCARD (8600…) yoki HUMO (9860…) raqamini kiriting.\n\n${CARD_HINT_UZ}`,
    askAmount: (bk: string, min: number, max: number) => `To'ldirish miqdorini ${bk}'da kiriting\nmin: ${formatSom(min)} UZS\nmax: ${formatSom(max)} UZS`,
    badAmount: (min: number, max: number) => `❗️ Summa ${formatSom(min)} dan ${formatSom(max)} UZS gacha bo'lishi kerak. Qaytadan kiriting:`,
    summary: (bk: string, acc: string, pay: number, recv: number, card: string, holder: string) =>
      [
        `🆔 <b>${bk}</b>: <code>${acc}</code>`,
        `↗️ Berish: <b>${pay}</b> 🇺🇿 UZS`,
        `↙️ Olish: <b>${recv}</b> 🇺🇿 UZS`,
        "",
        "Almashinuvni amalga oshirish uchun:",
        `   👉 <b>${pay}</b> miqdoridagi so'mmani <code>${card}</code>${holder ? ` (${holder})` : ""} raqamiga to'lovni amalga oshiring.`,
        "",
        "To'lov qilganizdan so'ng <b>✅To'lov qildim</b> tugmasini bosing va o'tkazmangizni qabul qiling",
      ].join("\n"),
    paidBtn: "✅ To'lov qildim",
    paidSent: (n: number) => `✅ So'rovingiz #${n} qabul qilindi.\nTo'lov tekshirilgach hisobingiz to'ldiriladi va sizga xabar keladi.`,
    paidMark: (n: number) => `⏳ #${n} tekshirilmoqda`,
    expired: "⏳ Bu so'rov eskirgan. Qaytadan «📮 Hisob to'ldirish» ni bosing.",
    payCreated: (n: number, bk: string, acc: string) => `🧾 So'rov #${n} · ${bk}: <code>${acc}</code>`,
    payOpen: "⏳ Sizda to'lanmagan to'lov bor. Avval shuni to'lang yoki bekor qiling:",
    payFailed: "⚠️ To'lov yaratib bo'lmadi. Birozdan keyin qaytadan urinib ko'ring.",
    depAskId: (bk: string) => `${bk} UZS id raqamingizni kiriting...`,
    accInfo: (acc: string, name: string | null) => `🆔 Account ID: ${acc} UZS🇺🇿${name ? `\n👤F.I.O: ${name}` : ""}`,
    askSum: (min: number, max: number) => `⬇️minimal summa ${min} so\`m\n⬆️maksimal summa ${max} so\`m\n\nSummani kiriting...`,
    badSum: (min: number, max: number) => `❗️ Summa ${min} so\`m dan ${max} so\`m gacha bo'lishi kerak.\n\nSummani kiriting...`,
    methodAsk: "Qaysi to`lov usuli orqali to`lov qilmoqchisiz?",
    methodAll: "✅BARCHA ILOVALARDAN",
    methodHint: "Yuqoridagi «✅BARCHA ILOVALARDAN» tugmasini bosing yoki «<<< Ortga qaytish».",
    wdPick: "🔺 Pulingizni yechib olmoqchi bo'lgan kontorani tanlang:",
    noWd: "Hozircha yechib olish uchun kontoralar yo'q.",
    askCode: (bk: string, address: string) =>
      `${bk} ilovasida «Pul yechish» → «Naqd pul» bo'limida kassani tanlang:\n📍 <b>${address}</b>\n\nBerilgan 4 belgili kodni yozing:`,
    badCode: "❗️ Kod 4 ta harf yoki raqamdan iborat. Qaytadan kiriting:",
    checking: "⏳ Tekshirilmoqda...",
    wdDone: (n: number, amount: number, card: string) =>
      `✅ <b>SO‘ROV #${n} MUVAFFAQIYATLI QABUL QILINDI!</b>\n\n💰 <b>${formatSom(amount)} UZS</b> mablag‘ tez orada kartangizga o‘tkaziladi.\n\n💳 Karta: ${card}`,
    wdPending: (n: number) => `✅ So'rov #${n} qabul qilindi.\nOperator tekshirib, pulni kartangizga o'tkazadi.`,
    wdRejected: (msg: string) => `❌ Yechib bo'lmadi: ${msg}\nKodni tekshirib, qaytadan urinib ko'ring.`,
    accountsTitle: "🧰 UZCARD & HUMO:",
    cardAsk: `Karta raqamini yozing\nmasalan: 8600123456789000\n\n${CARD_HINT_UZ}`,
    cardSaved: "💳 Karta raqamingiz saqlandi",
    accAsk: (bk: string) => `${bk} hisobingiz raqamini kiriting:`,
    accSaved: (bk: string) => `${bk} hamyon raqamingiz kiritildi`,
    contact: "Savollaringizni ushbu bot orqali jo`nating:",
    chat: "💬 Chat",
    channel: "👥 Rasmiy kanal",
    contactMissing: "Aloqa hali sozlanmagan.",
    faqMore: "❓ Boshqa savollar",
    faqTitle: "❓ <b>Ko'p beriladigan savollar</b>\n\nSavolni tanlang:",
    faqEmpty: "Hozircha savol-javoblar qo'shilmagan.",
    faqBack: "⬅️ Savollarga qaytish",
    st: { pending: "⏳ kutilmoqda", approved: "✅ bajarildi", rejected: "❌ rad etildi" } as Record<string, string>,
    ty: { bk_deposit: "📥 To'ldirish", bk_withdraw: "📤 Yechish", wallet_topup: "Hamyon", card_withdraw: "Kartaga" } as Record<string, string>,
  },
  ru: {
    phoneAsk: "Отправьте свой номер телефона кнопкой ниже",
    phoneBtn: "📱 Отправить номер",
    notOwn: "⚠️ Это контакт другого человека. Отправьте свой номер кнопкой ниже.",
    phoneSaved: "Ваш номер сохранён, можете пользоваться ботом",
    langSaved: "🇷🇺 Выбран русский язык",
    mainMenu: "Главное меню",
    blocked: "⛔ Ваш аккаунт заблокирован. Напишите в поддержку.",
    pick: "Выберите нужную кнопку",
    depPick: "Выберите контору, счёт которой хотите пополнить:",
    noDep: "Пока нет контор для пополнения.",
    depOff: "Пополнение временно не работает. Попробуйте чуть позже.",
    askAccount: (bk: string) => `Введите номер счёта ${bk}:`,
    badAccount: "ID должен состоять только из цифр (5–15). Введите ещё раз:",
    noAccount: "Такого счёта нет\nВведите ваш ID",
    askCard: `ℹ️ Выберите номер карты или введите карту, с которой пополняете. При выводе рекомендуется указывать ту же карту\n\n${CARD_HINT_RU}`,
    badCard: `❗️ Неверный номер карты. Введите 16-значный номер UZCARD (8600…) или HUMO (9860…).\n\n${CARD_HINT_RU}`,
    askAmount: (bk: string, min: number, max: number) => `Введите сумму пополнения ${bk}\nmin: ${formatSom(min)} UZS\nmax: ${formatSom(max)} UZS`,
    badAmount: (min: number, max: number) => `❗️ Сумма должна быть от ${formatSom(min)} до ${formatSom(max)} UZS. Введите ещё раз:`,
    summary: (bk: string, acc: string, pay: number, recv: number, card: string, holder: string) =>
      [
        `🆔 <b>${bk}</b>: <code>${acc}</code>`,
        `↗️ Отдаёте: <b>${pay}</b> 🇺🇿 UZS`,
        `↙️ Получаете: <b>${recv}</b> 🇺🇿 UZS`,
        "",
        "Чтобы выполнить обмен:",
        `   👉 переведите <b>${pay}</b> сум на карту <code>${card}</code>${holder ? ` (${holder})` : ""}.`,
        "",
        "После оплаты нажмите <b>✅Я оплатил</b>",
      ].join("\n"),
    paidBtn: "✅ Я оплатил",
    paidSent: (n: number) => `✅ Заявка #${n} принята.\nПосле проверки оплаты счёт будет пополнен, придёт сообщение.`,
    paidMark: (n: number) => `⏳ #${n} на проверке`,
    expired: "⏳ Эта заявка устарела. Нажмите «📮 Пополнить счёт» ещё раз.",
    payCreated: (n: number, bk: string, acc: string) => `🧾 Заявка #${n} · ${bk}: <code>${acc}</code>`,
    payOpen: "⏳ У вас есть неоплаченный платёж. Сначала оплатите или отмените его:",
    payFailed: "⚠️ Не удалось создать платёж. Попробуйте чуть позже.",
    depAskId: (bk: string) => `Введите ваш ID ${bk} UZS...`,
    accInfo: (acc: string, name: string | null) => `🆔 Account ID: ${acc} UZS🇺🇿${name ? `\n👤Ф.И.О: ${name}` : ""}`,
    askSum: (min: number, max: number) => `⬇️минимальная сумма ${min} сум\n⬆️максимальная сумма ${max} сум\n\nВведите сумму...`,
    badSum: (min: number, max: number) => `❗️ Сумма должна быть от ${min} до ${max} сум.\n\nВведите сумму...`,
    methodAsk: "Каким способом хотите оплатить?",
    methodAll: "✅ИЗ ЛЮБОГО ПРИЛОЖЕНИЯ",
    methodHint: "Нажмите «✅ИЗ ЛЮБОГО ПРИЛОЖЕНИЯ» выше или «<<< Назад».",
    wdPick: "🔺 Выберите контору, из которой хотите вывести деньги:",
    noWd: "Пока нет контор для вывода.",
    askCode: (bk: string, address: string) =>
      `В приложении ${bk} откройте «Вывод» → «Наличные» и выберите кассу:\n📍 <b>${address}</b>\n\nНапишите полученный 4-значный код:`,
    badCode: "❗️ Код — 4 буквы или цифры. Введите ещё раз:",
    checking: "⏳ Проверяем...",
    wdDone: (n: number, amount: number, card: string) =>
      `✅ <b>ЗАЯВКА #${n} УСПЕШНО ПРИНЯТА!</b>\n\n💰 <b>${formatSom(amount)} UZS</b> скоро поступят на вашу карту.\n\n💳 Карта: ${card}`,
    wdPending: (n: number) => `✅ Заявка #${n} принята.\nОператор проверит и переведёт деньги на вашу карту.`,
    wdRejected: (msg: string) => `❌ Вывод не удался: ${msg}\nПроверьте код и попробуйте ещё раз.`,
    accountsTitle: "🧰 UZCARD & HUMO:",
    cardAsk: `Напишите номер карты\nнапример: 8600123456789000\n\n${CARD_HINT_RU}`,
    cardSaved: "💳 Номер карты сохранён",
    accAsk: (bk: string) => `Введите номер вашего счёта ${bk}:`,
    accSaved: (bk: string) => `Номер счёта ${bk} сохранён`,
    contact: "Отправляйте вопросы через этого бота:",
    chat: "💬 Чат",
    channel: "👥 Официальный канал",
    contactMissing: "Связь ещё не настроена.",
    faqMore: "❓ Другие вопросы",
    faqTitle: "❓ <b>Частые вопросы</b>\n\nВыберите вопрос:",
    faqEmpty: "Вопросы пока не добавлены.",
    faqBack: "⬅️ К вопросам",
    st: { pending: "⏳ в ожидании", approved: "✅ выполнено", rejected: "❌ отклонено" } as Record<string, string>,
    ty: { bk_deposit: "📥 Пополнение", bk_withdraw: "📤 Вывод", wallet_topup: "Кошелёк", card_withdraw: "На карту" } as Record<string, string>,
  },
};

const ADMIN_BUTTON = "🛠 Admin panel";

// Bot API 9.4+: `style` colours a button (older clients just ignore it).
function mainKeyboard(l: L, admin = false) {
  const m = MENU[l];
  return {
    keyboard: [
      [{ text: m.deposit, style: "success" }],
      [{ text: m.accounts }, { text: m.withdraw, style: "primary" }],
      [{ text: m.bonus, style: "success" }, { text: m.contact }],
      ...(admin ? [[{ text: ADMIN_BUTTON }]] : []),
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function bonusKeyboard(l: L) {
  const m = MENU[l];
  return {
    keyboard: [[{ text: m.balance, style: "primary" }], [{ text: m.invite }, { text: m.daily, style: "success" }], [{ text: m.back }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Bottom keyboard during a step: the saved value (one tap) and "Cancel". */
function stepKeyboard(l: L, saved?: string | null) {
  return {
    keyboard: [...(saved ? [[{ text: saved }]] : []), [{ text: MENU[l].cancel }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function matchMenu(text: string): MenuKey | null {
  for (const l of ["uz", "ru"] as L[]) {
    for (const [k, v] of Object.entries(MENU[l])) if (v === text) return k as MenuKey;
  }
  return null;
}

const say = (chatId: number, text: string, reply_markup?: unknown, replyTo?: number) =>
  tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(reply_markup ? { reply_markup } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  });

async function sendMainMenu(chatId: number, l: L, s: Settings, text = TXT[l].mainMenu) {
  const admin = chatId > 0 && (await isTelegramAdmin(chatId, s).catch(() => false));
  await say(chatId, text, mainKeyboard(l, admin));
}

/** Rows of `n` buttons. */
function rows<T>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

function tgLink(v: string) {
  const u = v.trim();
  if (!u) return null;
  if (/^https?:\/\//.test(u)) return u;
  return `https://t.me/${u.replace(/^@/, "").replace(/^t\.me\//, "")}`;
}

/** Links that Telegram opens must be https; behind Railway's proxy the request origin can arrive as http. */
function httpsBase(s: Settings, fallbackOrigin: string) {
  return publicBase(s, fallbackOrigin).replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, "https://");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Update = any;

// Admin home in the chat: what needs attention + buttons that open the panel already signed in.
async function sendAdminPanel(chatId: number, s: Settings, base: string) {
  const pending = await sql<{ n: number }[]>`select count(*)::float8 as n from public.transactions where status = 'pending'`;
  const lines = ["🛠 <b>Admin panel</b>", "", `⏳ Kutilayotgan so'rovlar: <b>${Number(pending[0]?.n ?? 0)}</b>`];
  if (s.card_number) lines.push(`💳 To'ldirish kartasi: <code>${maskCard(s.card_number)}</code> ${escapeHtml(s.card_holder)}`);
  else
    lines.push(
      "",
      "⚠️ <b>To'ldirish kartasi kiritilmagan</b> — mijozlar hisob to'ldira olmaydi.",
      "Kiritish: <code>/karta 8600123412341234 ISM FAMILIYA</code>",
    );
  if (!(await loadCashdeskCreds("linebet")))
    lines.push("", "⚠️ Linebet API kiritilmagan — so'rovlarni qo'lda tasdiqlaysiz. Kiritish: panel → Sozlamalar → Linebet API.");
  lines.push("", "Barcha boshqaruv (so'rovlar, foydalanuvchilar, bukmekerlar, sozlamalar) panelda:");
  await tg("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛠 Admin panelni ochish", web_app: { url: `${base}/admin` } }],
        [
          { text: "📥 So'rovlar", web_app: { url: `${base}/admin/requests` } },
          { text: "⚙️ Sozlamalar", web_app: { url: `${base}/admin/settings` } },
        ],
      ],
    },
  });
}

// "/kanal": how the private selfie channel gets linked — one tap adds the bot to a channel as admin.
async function sendChannelHelp(chatId: number, s: Settings) {
  const bot = await resolveBotUsername(s);
  const linked = s.selfie_channel_id.trim();
  const text = [
    "🤳 <b>Selfi kanali</b>",
    "",
    linked ? `✅ Ulangan: <code>${escapeHtml(linked)}</code>` : "⚠️ Hali ulanmagan — yuz suratlari hech qayerga yuborilmayapti.",
    "",
    "<b>Ulash:</b>",
    "1️⃣ Pastdagi tugmani bosing va yopiq kanalingizni tanlang",
    "2️⃣ Botga «Xabar yuborish» huquqini bering",
    "3️⃣ Bot kanalga «✅ Kanal ulandi» deb yozadi — tayyor",
    "",
    "Bot allaqachon kanalda bo'lsa: kanaldagi istalgan postni shu yerga <b>forward</b> qiling.",
  ].join("\n");
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(bot
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: "➕ Botni kanalga qo'shish", url: `https://t.me/${bot}?startchannel&admin=post_messages` }]],
          },
        }
      : {}),
  });
}

// "/karta 8600 1234 5678 9012 ISM FAMILIYA" → saves the wallet top-up card.
async function setCardFromChat(chatId: number, text: string) {
  const rest = text.replace(/^\/karta(@\w+)?/i, "").trim();
  const m = rest.match(/^([\d\s-]+)(.*)$/);
  const card = m ? cleanCardNumber(m[1] ?? "") : null;
  if (!card) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "Karta raqami 16 ta raqam bo'lishi kerak.\nMasalan: <code>/karta 8600123412341234 ISM FAMILIYA</code>",
      parse_mode: "HTML",
    });
    return;
  }
  const holder = (m?.[2] ?? "").trim().slice(0, 100);
  await saveSettings(holder ? { card_number: card, card_holder: holder } : { card_number: card });
  await tg("sendMessage", {
    chat_id: chatId,
    text: `✅ To'ldirish kartasi saqlandi: <code>${maskCard(card)}</code> ${escapeHtml(holder)}\nEndi mijozlar hisob to'ldira oladi.`,
    parse_mode: "HTML",
  });
}

const TX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Buttons under a new-request alert:
// ✅ ok (a suspicious request asks "are you sure?" first → ok2), ❌ no, 🚫 block / unblock the user.
async function handleAdminDecision(cq: Update, s: Settings) {
  const [, act, id] = String(cq.data).split(":");
  const answer = (text: string, alert = false) =>
    tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => undefined);
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const setButtons = (inline_keyboard: unknown[][]) =>
    chatId && messageId
      ? tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard } }).catch(() => undefined)
      : Promise.resolve(undefined);
  if (!(await isTelegramAdmin(cq.from.id, s))) return answer("⛔ Ruxsat yo'q", true);

  if (act === "block" || act === "unblock") {
    const userId = Number(id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return answer("Noto'g'ri tugma", true);
    try {
      await setUserBlocked(userId, act === "block");
    } catch {
      return answer("Foydalanuvchi topilmadi", true);
    }
    // Swap only this button; the rest of the alert stays as it was.
    const rows: { text: string; callback_data?: string }[][] = cq.message?.reply_markup?.inline_keyboard ?? [];
    await setButtons(
      rows.map((row) =>
        row.map((b) =>
          b.callback_data === `adm:${act}:${userId}`
            ? act === "block"
              ? { text: "✅ Blokdan chiqarish", callback_data: `adm:unblock:${userId}` }
              : { text: "🚫 Foydalanuvchini bloklash", callback_data: `adm:block:${userId}` }
            : b,
        ),
      ),
    );
    return answer(act === "block" ? `🚫 ${userId} bloklandi — bot unga yopiq` : `✅ ${userId} blokdan chiqarildi`, true);
  }

  if (!id || !TX_ID.test(id) || !["ok", "ok2", "no", "back"].includes(act ?? "")) return answer("Noto'g'ri tugma", true);

  if (act === "back") {
    const tx = await maybeOne(sql<{ user_id: number; status: string; type: string; amount: number; source: string | null }[]>`
      select user_id::float8 as user_id, status, type, amount::float8 as amount, to_jsonb(t) ->> 'source' as source
      from public.transactions t where id = ${id}`);
    if (tx) await setButtons(adminKeyboard({ id, ...tx }, chatId ?? 0, publicBase(s)));
    return answer("↩️");
  }
  // Suspicious request: the first ✅ only asks for a second, deliberate confirmation.
  if (act === "ok") {
    const flag = await requestFlag(id);
    if (flag) {
      await setButtons([
        [{ text: "⚠️ Ha, tekshirdim — tasdiqlayman", callback_data: `adm:ok2:${id}` }],
        [{ text: "↩️ Orqaga", callback_data: `adm:back:${id}` }],
      ]);
      return answer(`⚠️ Shubhali: ${flag}`.slice(0, 190), true);
    }
  }
  try {
    const done = act === "no" ? await rejectRequest(id) : await approveRequest(id);
    const label = act === "no" ? `❌ #${done.number} rad etildi` : `✅ #${done.number} tasdiqlandi`;
    await answer(label);
    const rows: { text: string; callback_data?: string }[][] = cq.message?.reply_markup?.inline_keyboard ?? [];
    const blockRow = rows.find((r) => r.some((b) => b.callback_data?.startsWith("adm:block:") || b.callback_data?.startsWith("adm:unblock:")));
    await setButtons([[{ text: label, callback_data: "noop" }], ...(blockRow ? [blockRow] : [])]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already_processed")) return answer("Bu so'rov allaqachon ko'rib chiqilgan", true);
    if (msg.includes("insufficient")) return answer("Mijoz balansida pul yetarli emas", true);
    if (msg.includes("amount_required")) return answer("Bu so'rovda summani admin panelda kiriting", true);
    if (msg.includes("in_progress")) return answer("⏳ Bukmekerga yuborilmoqda — biroz kuting", true);
    if (msg.includes("bk_rejected")) return answer(`❌ Bukmeker rad etdi: ${msg.replace(/^.*bk_rejected:\s*/, "")}`.slice(0, 190), true);
    if (msg.includes("bk_unknown"))
      return answer("⚠️ Bukmeker aniq javob bermadi. Kassani tekshiring: pul tushgan bo'lsa yana ✅ bosing (qayta yuborilmaydi).", true);
    console.error("admin decision failed", e);
    return answer(`Xatolik: ${msg.slice(0, 150)}`, true);
  }
}

/** Changes the message the button belongs to instead of sending a new one — nothing jumps or blinks. */
async function editInPlace(cq: Update, text: string, markup: unknown) {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const isText = typeof cq.message?.text === "string";
  if (chatId && messageId) {
    try {
      if (isText) await tg("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", reply_markup: markup });
      else await tg("editMessageCaption", { chat_id: chatId, message_id: messageId, caption: text, parse_mode: "HTML", reply_markup: markup });
      return;
    } catch (e) {
      // "message is not modified" means it already shows this — nothing to do.
      if (String(e).includes("not modified")) return;
    }
  }
  await tg("sendMessage", { chat_id: chatId ?? cq.from.id, text, parse_mode: "HTML", reply_markup: markup });
}

// Saves the private channel for withdrawal selfies and checks the bot can post there.
async function linkSelfieChannel(ch: ChannelRef, adminChatId: number) {
  const name = escapeHtml(ch.title || String(ch.id));
  try {
    await tg("sendMessage", {
      chat_id: ch.id,
      text: "✅ <b>Kanal ulandi.</b>\nPul chiqarishdagi yuz suratlari va so'rov ma'lumotlari shu yerga keladi.",
      parse_mode: "HTML",
    });
  } catch {
    await tg("sendMessage", {
      chat_id: adminChatId,
      text: `❌ <b>${name}</b> kanaliga yozib bo'lmadi.\n\nBotni kanalga <b>admin</b> qiling va «Xabar yuborish» huquqini yoqing, keyin kanaldagi istalgan postni botga qayta forward qiling.`,
      parse_mode: "HTML",
    }).catch(() => undefined);
    return;
  }
  await saveSettings({ selfie_channel_id: String(ch.id) });
  await tg("sendMessage", {
    chat_id: adminChatId,
    text: `✅ Yuz suratlari kanali ulandi: <b>${name}</b>\nID: <code>${ch.id}</code>\n\nEndi har bir pul chiqarish so'rovidagi selfi shu kanalga boradi.`,
    parse_mode: "HTML",
  }).catch(() => undefined);
}


const SUB_TXT = {
  uz: {
    ask: "❗️ <b>Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling.</b>\n\nObuna bo'lgach «✅ Tekshirish» tugmasini bosing.",
    join: "➕ Obuna bo'lish",
    check: "✅ Tekshirish",
    notYet: "❌ Hali barcha kanallarga obuna bo'lmadingiz.",
    ok: "✅ Rahmat! Obuna tasdiqlandi.",
  },
  ru: {
    ask: "❗️ <b>Чтобы пользоваться ботом, подпишитесь на каналы ниже.</b>\n\nПосле подписки нажмите «✅ Проверить».",
    join: "➕ Подписаться",
    check: "✅ Проверить",
    notYet: "❌ Вы ещё не подписались на все каналы.",
    ok: "✅ Спасибо! Подписка подтверждена.",
  },
};

function subKeyboard(l: L, miss: MissingChannel[]) {
  return {
    inline_keyboard: [
      ...miss.map((c, i) => [{ text: c.title ? `➕ ${c.title}` : `${SUB_TXT[l].join}${miss.length > 1 ? ` ${i + 1}` : ""}`, url: c.url }]),
      [{ text: SUB_TXT[l].check, callback_data: "sub:check", style: "success" }],
    ],
  };
}

/** Mandatory subscription: true when the user was shown the channel list and must stop here. Admins are never asked. */
async function subscriptionGate(chatId: number, l: L, s: Settings, userId: number): Promise<boolean> {
  if (!requiredChannels(s).length) return false;
  if (await isTelegramAdmin(userId, s).catch(() => false)) return false;
  const miss = await missingChannels(userId, s);
  if (!miss.length) return false;
  await say(chatId, SUB_TXT[l].ask, subKeyboard(l, miss));
  return true;
}

// «✅ Tekshirish»: still missing → alert and fresh buttons; all joined → continue where the user stopped.
async function handleSubCheck(cq: Update, from: TgFrom, chatId: number, s: Settings) {
  const { user } = await upsertTgUser(from);
  const l: L = langOf(user.lang);
  const answer = (text?: string, alert = false) =>
    tg("answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text, show_alert: alert } : {}) }).catch(() => undefined);
  if (user.is_blocked) {
    await answer();
    return void (await say(chatId, TXT[l].blocked).catch(() => undefined));
  }
  const miss = await missingChannels(user.id, s);
  if (miss.length) {
    await answer(SUB_TXT[l].notYet, true);
    await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message?.message_id, reply_markup: subKeyboard(l, miss) }).catch(() => undefined);
    return;
  }
  await answer(SUB_TXT[l].ok);
  await editInPlace(cq, SUB_TXT[l].ok, { inline_keyboard: [] });
  if (!user.lang_chosen) return sendLanguagePicker(chatId);
  if (!user.phone) return sendPhoneRequest(chatId, l);
  return sendMainMenu(chatId, l, s);
}

async function sendLanguagePicker(chatId: number) {
  await say(chatId, "Tilni tanlang / Выбрать язык", {
    inline_keyboard: [[
      { text: "🇺🇿 O'zbek", callback_data: "lang:uz" },
      { text: "🇷🇺 Русский", callback_data: "lang:ru" },
    ]],
  });
}

async function sendPhoneRequest(chatId: number, l: L) {
  await say(chatId, TXT[l].phoneAsk, {
    keyboard: [[{ text: TXT[l].phoneBtn, request_contact: true }]],
    resize_keyboard: true,
    is_persistent: true,
  });
}

// ---------- Questions & answers (admin panel → Avto-javoblar) ----------
function loadReplies(): Promise<AutoReply[]> {
  return cached("auto-replies", 30_000, async () => {
    const r = await sql<AutoReply[]>`
      select id::text as id, keywords, question_uz, answer_uz, question_ru, answer_ru, question_en, answer_en,
        sort_order, is_active
      from public.auto_replies where is_active order by sort_order, created_at`;
    return [...r];
  });
}

function faqList(l: L, replies: AutoReply[]) {
  const t = TXT[l];
  if (!replies.length) return { text: t.faqEmpty, markup: { inline_keyboard: [] as unknown[][] } };
  return {
    text: t.faqTitle,
    markup: { inline_keyboard: replies.slice(0, 30).map((r) => [{ text: replyText(r, l).q.slice(0, 60), callback_data: `faq:${r.id}` }]) },
  };
}

// ---------- Customer screens ----------
/** Deposits are open with HamyonAPI (automatic card) or with a manual top-up card set by the admin. */
async function depositReady(s: Settings): Promise<boolean> {
  return !!s.card_number.trim() || !!(await loadHamyonCreds());
}

const bkList = (s: Settings) => cached("bot-bookmakers", 15_000, listBookmakers).then((b) => (void s, b));

async function findBk(id: string | undefined, s: Settings): Promise<Bookmaker | null> {
  if (!id) return null;
  return (await bkList(s)).find((b) => b.id === id) ?? null;
}

async function showDeposit(chatId: number, l: L, s: Settings, user: TgUser) {
  const bks = (await bkList(s)).filter((b) => b.deposit_enabled);
  if (!bks.length) return say(chatId, TXT[l].noDep);
  if (!(await depositReady(s))) return say(chatId, TXT[l].depOff);
  // The customer always picks the bookmaker, even when only one is on (more are added later).
  await say(chatId, TXT[l].depPick, {
    inline_keyboard: rows(bks.map((b) => ({ text: `🚩 ${b.name}`, callback_data: `dep:${b.id}` })), 2),
  });
}

async function showWithdraw(chatId: number, l: L, s: Settings) {
  const bks = (await bkList(s)).filter((b) => b.withdraw_enabled);
  if (!bks.length) return say(chatId, TXT[l].noWd);
  const list = bks.map((b) => `<blockquote><b>${escapeHtml(b.name)}</b> - ${escapeHtml(b.address)}</blockquote>`).join("");
  await say(chatId, `${list}\n${TXT[l].wdPick}`, {
    inline_keyboard: rows(bks.map((b) => ({ text: `🔺 ${b.name}`, callback_data: `wd:${b.id}` })), 2),
  });
}

async function showAccounts(chatId: number, l: L, s: Settings, userId: number) {
  const [bks, saved] = await Promise.all([bkList(s), savedAccounts(userId)]);
  const lines = [
    `${TXT[l].accountsTitle} ${saved["card"] ? `<code>${saved["card"]}</code>` : ""}`,
    ...bks.map((b) => `<blockquote>📌 ${escapeHtml(b.name)}:   ${saved[b.id] ? `<code>${escapeHtml(saved[b.id])}</code>` : ""}</blockquote>`),
  ];
  await say(chatId, lines.join(""), {
    inline_keyboard: [
      [{ text: "UZCARD / HUMO", callback_data: "acc:card" }],
      ...rows(bks.map((b) => ({ text: b.name, callback_data: `acc:${b.id}` })), 3),
    ],
  });
}

async function showContact(chatId: number, l: L, s: Settings) {
  const chat = tgLink(s.support_username);
  const channel = tgLink(s.channel_username);
  const kb = [...(chat ? [[{ text: TXT[l].chat, url: chat }]] : []), ...(channel ? [[{ text: TXT[l].channel, url: channel }]] : [])];
  await say(chatId, kb.length ? TXT[l].contact : TXT[l].contactMissing, kb.length ? { inline_keyboard: kb } : undefined);
}

/** null = no cashdesk or no clear answer (let the user go on); false = the bookmaker says no such account. */
async function accountExists(bkId: string, account: string): Promise<boolean | null> {
  const creds = await loadCashdeskCreds(bkId);
  if (!creds) return null;
  const r = await cashdeskFindUser(creds, account);
  return r ? r.found : null;
}

/** The bookmaker's answer about an account: null when there is no cashdesk or no clear answer. */
async function lookupAccount(bkId: string, account: string): Promise<{ found: boolean; name: string | null } | null> {
  const creds = await loadCashdeskCreds(bkId);
  return creds ? cashdeskFindUser(creds, account) : null;
}

/** First deposit step for a chosen bookmaker; an unpaid automatic payment is shown again instead. */
async function beginDeposit(chatId: number, l: L, s: Settings, user: TgUser, bk: Bookmaker) {
  const t = TXT[l];
  const hamyon = await loadHamyonCreds();
  const open = hamyon ? await openPayment(user.id) : null;
  if (open) {
    await say(chatId, t.payOpen);
    return say(chatId, open.text, cancelKeyboard(l, open.tx.id));
  }
  await setState(user.id, "dep_account", { bk: bk.id });
  const saved = await savedAccounts(user.id);
  const name = escapeHtml(bk.name);
  return say(chatId, hamyon ? t.depAskId(name) : t.askAccount(name), stepKeyboard(l, saved[bk.id]));
}

// ---------- Step input ----------
async function handleStep(chatId: number, l: L, s: Settings, user: TgUser, st: { step: string; data: StepData }, text: string, msgId?: number) {
  const t = TXT[l];
  const d = st.data;
  const bk = await findBk(d.bk, s);
  if (st.step !== "set_card" && !bk) {
    await clearState(user.id);
    return sendMainMenu(chatId, l, s);
  }
  const bkName = escapeHtml(bk?.name ?? "");

  if (st.step === "bonus_account") {
    const acc = parseAccountId(text);
    if (!acc) return say(chatId, t.badAccount);
    if ((await accountExists(bk!.id, acc)) === false) return say(chatId, t.noAccount);
    await saveAccount(user.id, bk!.id, acc);
    const check = checkBonusWithdraw(await bonusBalance(user.id), bonusConfig(s).withdrawMin);
    if (!check.ok) {
      await clearState(user.id);
      return say(chatId, BONUS_TXT[l].belowMin(await bonusBalance(user.id), check.min), bonusKeyboard(l));
    }
    await setState(user.id, "bonus_confirm", { bk: bk!.id, account: acc });
    // Bonus keyboard back at the bottom; the confirm button sits under the summary.
    await say(chatId, t.accSaved(bkName), bonusKeyboard(l));
    return say(chatId, BONUS_TXT[l].confirm(escapeHtml(acc), check.amount), {
      inline_keyboard: [[{ text: BONUS_TXT[l].confirmBtn, callback_data: "bonus:ok", style: "success" }]],
    });
  }
  if (st.step === "bonus_confirm") {
    return say(chatId, l === "ru" ? "Нажмите «✅ Подтвердить» под сообщением выше." : "Yuqoridagi «✅ Tasdiqlash» tugmasini bosing.");
  }

  if (st.step === "dep_account" || st.step === "wd_account" || st.step === "set_acc") {
    const acc = parseAccountId(text);
    if (!acc) return say(chatId, t.badAccount);
    const found = await lookupAccount(bk!.id, acc);
    if (found?.found === false) return say(chatId, t.noAccount);
    await saveAccount(user.id, bk!.id, acc);
    if (st.step === "dep_account" && (await loadHamyonCreds())) {
      // HamyonAPI gives the card, so the customer's own card is not asked.
      await setState(user.id, "dep_amount", { ...d, account: acc, card: "" });
      const { min, max } = minMax(bk!, s);
      await say(chatId, t.accInfo(acc, found?.name ? escapeHtml(found.name) : null), undefined, msgId);
      return say(chatId, t.askSum(min, max), stepKeyboard(l));
    }
    if (st.step === "set_acc") {
      await clearState(user.id);
      return sendMainMenu(chatId, l, s, t.accSaved(bkName));
    }
    if (st.step === "wd_account") {
      await setState(user.id, "wd_code", { ...d, account: acc });
      return say(chatId, t.askCode(bkName, escapeHtml(bk!.address)), stepKeyboard(l));
    }
    await setState(user.id, "dep_card", { ...d, account: acc });
    const saved = await savedAccounts(user.id);
    return say(chatId, t.askCard, stepKeyboard(l, saved["card"]));
  }

  if (st.step === "dep_card" || st.step === "wd_card" || st.step === "set_card") {
    const card = parseUzCard(text);
    if (!card) return say(chatId, t.badCard);
    await saveAccount(user.id, "card", card);
    if (st.step === "set_card") {
      await clearState(user.id);
      return sendMainMenu(chatId, l, s, t.cardSaved);
    }
    if (st.step === "wd_card") {
      await setState(user.id, "wd_account", { ...d, card });
      const saved = await savedAccounts(user.id);
      return say(chatId, t.askAccount(bkName), stepKeyboard(l, saved[bk!.id]));
    }
    await setState(user.id, "dep_amount", { ...d, card });
    const { min, max } = minMax(bk!, s);
    return say(chatId, t.askAmount(bkName, min, max), stepKeyboard(l));
  }

  if (st.step === "dep_amount") {
    const { min, max } = minMax(bk!, s);
    const amount = parseAmount(text);
    if (await loadHamyonCreds()) {
      if (!amount || amount < min || amount > max) return say(chatId, t.badSum(min, max));
      await setState(user.id, "dep_method", { ...d, amount });
      return say(chatId, t.methodAsk, { inline_keyboard: [[{ text: t.methodAll, callback_data: "dep:hp", style: "success" }]] });
    }
    if (!amount || amount < min || amount > max) return say(chatId, t.badAmount(min, max));
    if (!s.card_number.trim()) {
      await clearState(user.id);
      return sendMainMenu(chatId, l, s, t.depOff);
    }
    const pay = pickPayAmount(amount, await takenPayAmounts(amount));
    const { bonus, fee, receive } = depositSplit(pay, num(s.deposit_bonus_percent, 0), Number(bk!.deposit_fee_percent));
    await setState(user.id, "dep_confirm", { ...d, amount, pay, bonus, fee });
    return say(
      chatId,
      t.summary(bkName, escapeHtml(d.account ?? ""), pay, receive, escapeHtml(s.card_number.replace(/\D/g, "")), escapeHtml(s.card_holder)),
      { inline_keyboard: [[{ text: t.paidBtn, callback_data: "dep:paid", style: "success" }]] },
    );
  }

  if (st.step === "dep_method") return say(chatId, t.methodHint);

  if (st.step === "dep_confirm") {
    // Waiting for the "paid" button; typed text just repeats the hint.
    return say(chatId, l === "ru" ? "Нажмите «✅ Я оплатил» под сообщением выше или «↪️ Отмена»." : "Yuqoridagi «✅ To'lov qildim» tugmasini bosing yoki «↪️ Bekor qilish».");
  }

  if (st.step === "wd_code") {
    const code = parseWithdrawCode(text);
    if (!code) return say(chatId, t.badCode);
    // Claim the step first so a repeated message never pays out twice.
    const data = await takeState(user.id, "wd_code");
    if (!data?.account || !data.card) return sendMainMenu(chatId, l, s);
    await say(chatId, t.checking);
    const r = await createBotWithdraw(user.id, bk!, { account: data.account, card: data.card, code }, s);
    if (r.kind === "rejected") return sendMainMenu(chatId, l, s, t.wdRejected(escapeHtml(r.message)));
    if (r.kind === "done") return sendMainMenu(chatId, l, s, t.wdDone(r.tx.number, r.send, maskCard(data.card)));
    return sendMainMenu(chatId, l, s, t.wdPending(r.tx.number));
  }
}

/** "✅ BARCHA ILOVALARDAN": HamyonAPI creates the payment; the customer gets the receipt and the card. */
async function payAllApps(cq: Update, chatId: number, l: L, s: Settings, user: TgUser) {
  const t = TXT[l];
  const hamyon = await loadHamyonCreds();
  // Claimed first, so a double tap never opens two payments.
  const data = await takeState(user.id, "dep_method");
  const bk = await findBk(data?.bk, s);
  if (!hamyon || !data?.account || !data.amount || !bk) return say(chatId, t.expired);
  if (cq.message?.message_id) await tg("deleteMessage", { chat_id: chatId, message_id: cq.message.message_id }).catch(() => undefined);
  const open = await openPayment(user.id);
  if (open) {
    await sendMainMenu(chatId, l, s, t.payOpen);
    return say(chatId, open.text, cancelKeyboard(l, open.tx.id));
  }
  const feePercent = Number(bk.deposit_fee_percent) || 0;
  const r = await startHamyonDeposit(hamyon, user.id, l, {
    bk: bk.id,
    account: data.account,
    card: data.card ?? "",
    amount: data.amount,
    bonusPercent: num(s.deposit_bonus_percent, 0),
    feePercent,
  });
  if (r.kind === "failed") return sendMainMenu(chatId, l, s, t.payFailed);
  await sendMainMenu(chatId, l, s, paySummary(l, { number: r.tx.number, bk: escapeHtml(bk.name), account: escapeHtml(data.account), pay: r.tx.amount, fee: r.tx.fee, feePercent, card: r.card }));
  const sent = await say(chatId, r.text, r.markup);
  if (sent?.message_id) await savePayMessage(r.tx.id, sent.message_id);
}

// ---------- Customer buttons under messages ----------
async function handleCustomerCallback(cq: Update, chatId: number, l: L, s: Settings, user: TgUser, data: string) {
  const t = TXT[l];
  if (data === "noop") return;
  if (data === "faq:list") {
    const f = faqList(l, await loadReplies());
    return editInPlace(cq, f.text, f.markup);
  }
  if (data.startsWith("faq:")) {
    const r = (await loadReplies()).find((x) => x.id === data.slice(4));
    if (!r) {
      const f = faqList(l, await loadReplies());
      return editInPlace(cq, f.text, f.markup);
    }
    const qa = replyText(r, l);
    return editInPlace(cq, `❓ <b>${escapeHtml(qa.q)}</b>\n\n${escapeHtml(qa.a)}`, {
      inline_keyboard: [[{ text: t.faqBack, callback_data: "faq:list" }]],
    });
  }

  if (data.startsWith("hp:x:")) {
    const note = await cancelByUser(user.id, data.slice(5));
    if (note) await say(chatId, note);
    return;
  }

  if (data === "dep:hp") return payAllApps(cq, chatId, l, s, user);

  if (data === "dep:paid") {
    const d = await takeState(user.id, "dep_confirm");
    if (!d?.bk || !d.account || !d.card || !d.pay) return say(chatId, t.expired);
    const tx = await createBotDeposit(user.id, { bk: d.bk, account: d.account, card: d.card, pay: d.pay, bonus: d.bonus ?? 0, fee: d.fee ?? 0 });
    if (cq.message?.message_id)
      await tg("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: t.paidMark(tx.number), callback_data: "noop" }]] },
      }).catch(() => undefined);
    return sendMainMenu(chatId, l, s, t.paidSent(tx.number));
  }

  if (data === "bonus:wd") {
    const b = BONUS_TXT[l];
    const bk = await findBk(BONUS_BK, s);
    if (!bk) return say(chatId, b.noBk);
    const bal = await bonusBalance(user.id);
    const check = checkBonusWithdraw(bal, bonusConfig(s).withdrawMin);
    if (!check.ok) return say(chatId, b.belowMin(bal, check.min));
    await setState(user.id, "bonus_account", { bk: bk.id });
    const saved = await savedAccounts(user.id);
    return say(chatId, b.askAccount, stepKeyboard(l, saved[bk.id]));
  }
  if (data === "bonus:ok") return confirmBonusWithdraw(cq, chatId, l, s, user);

  const [kind, id] = data.split(":");
  if (kind === "acc" && id === "card") {
    await setState(user.id, "set_card", {});
    return say(chatId, t.cardAsk, stepKeyboard(l));
  }
  const bk = await findBk(id, s);
  if (!bk) return;
  const name = escapeHtml(bk.name);
  if (kind === "acc") {
    await setState(user.id, "set_acc", { bk: bk.id });
    return say(chatId, t.accAsk(name), stepKeyboard(l));
  }
  if (kind === "dep" && bk.deposit_enabled) {
    if (!(await depositReady(s))) return say(chatId, t.depOff);
    return beginDeposit(chatId, l, s, user, bk);
  }
  if (kind === "wd" && bk.withdraw_enabled) {
    await setState(user.id, "wd_card", { bk: bk.id });
    const saved = await savedAccounts(user.id);
    return say(chatId, t.askCard, stepKeyboard(l, saved["card"]));
  }
}


/** "✅ Tasdiqlash" under the bonus summary: the whole bonus balance goes to the LINEBET account. */
async function confirmBonusWithdraw(cq: Update, chatId: number, l: L, s: Settings, user: TgUser) {
  const b = BONUS_TXT[l];
  const d = await takeState(user.id, "bonus_confirm");
  if (!d?.account) return say(chatId, TXT[l].expired, bonusKeyboard(l));
  const start = await createBonusWithdraw(user.id, d.account, s);
  if (start.kind === "refused") return say(chatId, b.belowMin(await bonusBalance(user.id), bonusConfig(s).withdrawMin), bonusKeyboard(l));
  const tx = start.tx;
  if (cq.message?.message_id)
    await tg("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: b.sending(tx.number), callback_data: "noop" }]] },
    }).catch(() => undefined);
  if (!bonusConfig(s).withdrawAuto) {
    inBackground("alert", () => notifyAdminsNewRequest(tx));
    return say(chatId, b.sent(tx.number), bonusKeyboard(l));
  }
  const r = await autoSendBonus(tx);
  if (r.kind === "refunded") return say(chatId, b.refunded(escapeHtml(r.message)), bonusKeyboard(l));
  // Admins see every bonus payout; a pending one keeps its ✅ / ❌ buttons.
  inBackground("alert", () => notifyAdminsNewRequest({ ...r.tx, source: "bonus" }));
  if (r.kind === "done") return say(chatId, b.done(r.tx.number, r.tx.amount, escapeHtml(d.account ?? "")), bonusKeyboard(l));
  return say(chatId, b.sent(tx.number), bonusKeyboard(l));
}

export async function handleUpdate(update: Update, fallbackOrigin: string) {
  await ensureMigrations();
  const s = await getSettings();
  const base = httpsBase(s, fallbackOrigin);
  startHamyonWatcher();
  resumeBroadcasts();

  // Bot made admin of a channel by one of our admins → that channel receives the selfies.
  if (update.my_chat_member) {
    const ch = channelFromBotPromotion(update.my_chat_member);
    const by = update.my_chat_member.from?.id;
    if (!ch || typeof by !== "number" || !(await isTelegramAdmin(by, s))) return;
    // A public channel or a mandatory-subscription channel is not the private selfie channel: never post there.
    const username: string | undefined = update.my_chat_member.chat?.username;
    if (username || isRequiredChannel(requiredChannels(s), { id: ch.id, username: username ?? null })) {
      await tg("sendMessage", {
        chat_id: by,
        text: `✅ Bot <b>${escapeHtml(ch.title || String(ch.id))}</b> kanaliga admin qilindi.\n\nMajburiy obuna uchun: panel → Sozlamalar → «📢 Majburiy obuna» ga ${
          username ? `<code>@${escapeHtml(username)}</code>` : `<code>${ch.id} https://t.me/+...</code>`
        } ni yozib saqlang.`,
        parse_mode: "HTML",
      }).catch(() => undefined);
      return;
    }
    await linkSelfieChannel(ch, by);
    return;
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    const from: TgFrom = cq.from;
    const chatId: number = cq.message?.chat?.id ?? from.id;
    const data: string = cq.data ?? "";
    if (data === "adm:channel") {
      void tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
      if (await isTelegramAdmin(from.id, s)) await sendChannelHelp(chatId, s);
      return;
    }
    if (data.startsWith("adm:")) return handleAdminDecision(cq, s);
    if (data === "sub:check") return handleSubCheck(cq, from, chatId, s);
    // Stop the button's spinner right away; the answer follows.
    const answered = tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
    const { user } = await upsertTgUser(from);
    await answered;
    if (user.is_blocked) {
      await say(chatId, TXT[langOf(user.lang)].blocked).catch(() => undefined);
      return;
    }
    if (data.startsWith("lang:")) {
      const l: L = langOf(data.slice(5));
      await sql`update public.tg_users set lang = ${l}, lang_chosen = true where id = ${user.id}`;
      await editInPlace(cq, TXT[l].langSaved, { inline_keyboard: [] });
      if (await subscriptionGate(chatId, l, s, user.id)) return;
      if (!user.phone) return sendPhoneRequest(chatId, l);
      return sendMainMenu(chatId, l, s);
    }
    const l: L = langOf(user.lang);
    if (await subscriptionGate(chatId, l, s, user.id)) return;
    if (!user.phone) return sendPhoneRequest(chatId, l);
    return handleCustomerCallback(cq, chatId, l, s, user, data);
  }

  const msg = update.message;
  if (!msg?.from || msg.chat?.type !== "private") return;
  const from: TgFrom = msg.from;
  const chatId: number = msg.chat.id;
  const text: string = (msg.text ?? "").trim();

  if (text.startsWith("/start")) {
    const arg = text.split(/\s+/)[1];
    const ref = arg && /^\d+$/.test(arg) ? Number(arg) : null;
    const { user } = await upsertTgUser(from, ref);
    if (user.is_blocked) return void (await say(chatId, TXT[langOf(user.lang)].blocked));
    await clearState(user.id);
    if (!user.lang_chosen) return sendLanguagePicker(chatId);
    if (await subscriptionGate(chatId, langOf(user.lang), s, user.id)) return;
    if (!user.phone) return sendPhoneRequest(chatId, langOf(user.lang));
    return sendMainMenu(chatId, langOf(user.lang), s);
  }

  const { user } = await upsertTgUser(from);
  const l: L = langOf(user.lang);
  const t = TXT[l];
  if (user.is_blocked) return void (await say(chatId, t.blocked));

  // Shared contact: only the sender's own number is accepted.
  if (msg.contact) {
    const phone = normalizePhone(msg.contact.phone_number);
    if (!isOwnContact(msg.contact, from.id) || !phone) {
      await say(chatId, t.notOwn);
      return sendPhoneRequest(chatId, l);
    }
    await savePhone(user.id, phone);
    if (!user.lang_chosen) return sendLanguagePicker(chatId);
    if (await subscriptionGate(chatId, l, s, user.id)) return;
    return sendMainMenu(chatId, l, s, t.phoneSaved);
  }

  if (text === "/lang") return sendLanguagePicker(chatId);

  // Admin forwards any post from the private channel → the bot links it for selfies.
  const fwdChannel = channelFromForward(msg);
  if (fwdChannel && (await isTelegramAdmin(from.id, s))) return linkSelfieChannel(fwdChannel, chatId);

  const isAdminCmd = text === ADMIN_BUTTON || /^\/admin(@\w+)?$/i.test(text);
  const isCardCmd = /^\/karta(@\w+)?(\s|$)/i.test(text);
  const isChannelCmd = /^\/kanal(@\w+)?$/i.test(text);
  if ((isAdminCmd || isCardCmd || isChannelCmd) && (await isTelegramAdmin(from.id, s))) {
    if (isCardCmd) return setCardFromChat(chatId, text);
    if (isChannelCmd) return sendChannelHelp(chatId, s);
    return sendAdminPanel(chatId, s, base);
  }

  // Not subscribed to the required channels → only the channel list shows.
  if (user.lang_chosen && (await subscriptionGate(chatId, l, s, user.id))) return;

  // No phone yet → nothing else opens.
  if (!user.phone) return sendPhoneRequest(chatId, l);

  const action = text === "/menu" ? "back" : matchMenu(text);
  if (action) {
    // Any menu button ends an unfinished step.
    await clearState(user.id);
    if (action === "cancel" || action === "cancelOld" || action === "back") return sendMainMenu(chatId, l, s);
    if (action === "deposit") return showDeposit(chatId, l, s, user);
    if (action === "withdraw") return showWithdraw(chatId, l, s);
    if (action === "accounts") return showAccounts(chatId, l, s, user.id);
    // The Amallar menu is gone; a tap on an old keyboard brings the new main menu.
    if (action === "ops" || action === "history" || action === "rates") return sendMainMenu(chatId, l, s);
    if (action === "contact") return showContact(chatId, l, s);
    if (action === "bonus") return say(chatId, BONUS_TXT[l].menu, bonusKeyboard(l));
    if (action === "balance" || action === "invite" || action === "daily") {
      const screen =
        action === "balance" ? await balanceScreen(l, s, user.id) : action === "invite" ? await inviteScreen(l, s, user.id) : await dailyScreen(l, s, user.id);
      return say(chatId, screen.text, screen.markup);
    }
    return;
  }

  const st = text ? await getState(user.id) : null;
  if (st) return handleStep(chatId, l, s, user, st, text, msg.message_id);

  // A typed question gets the matching ready answer; anything else points to the buttons.
  const hit = text ? matchReply(text, await loadReplies().catch(() => [])) : null;
  if (hit) {
    const qa = replyText(hit, l);
    return say(chatId, `💬 <b>${escapeHtml(qa.q)}</b>\n\n${escapeHtml(qa.a)}`, {
      inline_keyboard: [[{ text: t.faqMore, callback_data: "faq:list" }]],
    });
  }
  return say(chatId, t.pick);
}
