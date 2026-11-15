// Telegram bot conversation logic (chat side). Money operations happen in the WALLET mini app.
import { ensureMigrations } from "./migrations.server";
import { maybeOne, sql, ts } from "./db.server";
import { getSettings, publicBase, saveSettings, type Settings } from "./settings.server";
import { approveRequest, isTelegramAdmin, rejectRequest } from "./requests.server";
import { cleanCardNumber } from "./admins";
import { loadCashdeskCreds } from "./cashdesk-config.server";
import { escapeHtml, tg } from "./telegram.server";
import { listReferrals, savePhone, upsertTgUser, type TgFrom } from "./users.server";
import { isOwnContact, normalizePhone } from "@/lib/verification";
import { channelFromBotPromotion, channelFromForward, type ChannelRef } from "@/lib/channel-link";
import { signedUrl } from "./media.server";
import { resolveBotUsername } from "./bot-username.server";
import { referralLink, shareLink } from "@/lib/referral";
import { formatDateTime, formatSom, maskCard } from "@/lib/format";
import { matchReply, replyText, type AutoReply } from "@/lib/auto-reply";
import { cached } from "./memo.server";
import { adminKeyboard } from "./notify.server";
import { requestFlag, setUserBlocked } from "./requests.server";

type L = "uz" | "ru" | "en";
const langOf = (v: string | null | undefined): L => (v === "ru" ? "ru" : v === "en" ? "en" : "uz");

const MENU: Record<L, { deposit: string; withdraw: string; history: string; support: string; referral: string; faq: string; rates: string }> = {
  uz: {
    deposit: "📥 Hisobni to'ldirish 📥",
    withdraw: "📤 Hisobdan yechish 📤",
    history: "To'lovlar tarixi ⏳",
    support: "Aloqa markazi 👨‍💻",
    referral: "Hamkorlik dasturi 👥",
    faq: "Savol-javob ❓",
    rates: "Joriy kurslar 💸",
  },
  ru: {
    deposit: "📥 Пополнить счёт 📥",
    withdraw: "📤 Вывести со счёта 📤",
    history: "История платежей ⏳",
    support: "Центр поддержки 👨‍💻",
    referral: "Партнёрская программа 👥",
    faq: "Вопросы и ответы ❓",
    rates: "Текущие курсы 💸",
  },
  en: {
    deposit: "📥 Deposit 📥",
    withdraw: "📤 Withdraw 📤",
    history: "Payment history ⏳",
    support: "Support center 👨‍💻",
    referral: "Partner program 👥",
    faq: "Questions & answers ❓",
    rates: "Current rates 💸",
  },
};

const TXT = {
  uz: {
    welcome: (b: string) =>
      `🥇 <b><i>${escapeHtml(b)} xizmatiga xush kelibsiz!</i></b> <i>Bu yerda biz eng muhim narsalarni taqdim etamiz: xavfsizlik, qulaylik va tezkorlik. To'lovlaringizni oson va ishonchli tarzda amalga oshirishni biz bilan boshlang!</i>`,
    mainMenu: "<i>Asosiy menyu. Sizga qanday yordam bera olaman?</i>",
    depositIntro: "Iltimos, video bilan tanishing va\n\nHisobni to'ldirish usulini tanlang:",
    noBk: "Hozircha to'ldirish uchun bukmekerlar yo'q.",
    withdraw:
      "ℹ️ Mablag' yechish endi faqat Wallet platformasi orqali amalga oshiriladi.\n\nPlatformaga o'tish va mablag'ni yechish uchun quyidagi tugmani bosing.",
    toWallet: "💳 Wallet'ga o'tish",
    historyTitle: "Amaliyotlar tarixi:",
    historyEmpty: "Sizda hali amaliyotlar tarixi mavjud emas",
    support: "Xodimlarimiz bilan bog'lanish uchun, iltimos, quyidagi tugmani bosing.",
    supportBtn: "Qo'llab-quvvatlash bilan bog'lanish",
    supportMissing: "Qo'llab-quvvatlash hali sozlanmagan.",
    backMenu: "Asosiy menyuga qaytish",
    referral: (bal: number, link: string, p: string, earned: number) =>
      `Balans: ${formatSom(bal)} UZS\n\nSizning referal havolangiz:\n${link}\n\nDo'stlaringizni taklif qiling va ularning har bir hisobi to'ldirilganda ${p}% bonus oling!\n\n🎁 Referal ro'yxatdan o'tish bonusi: ${formatSom(earned)} UZS\n\nℹ️ Mablag'ni yechish faqat Mini App orqali mavjud.`,
    myRefs: "Mening referallarim",
    shareBtn: "📤 Do'stlarga yuborish",
    shareText: "Kassa 24/7 — bukmeker hisobini tez to'ldirish va yechish. Shu havola orqali qo'shiling:",
    refsEmpty: "Sizda hali referallar yo'q.",
    refsTitle: (n: number) => `👥 Sizning referallaringiz: ${n} ta`,
    ratesDeposit: "📊 To'ldirish kurslari:",
    ratesWithdraw: "📊 Yechish kurslari:",
    blocked: "⛔ Hisobingiz bloklangan. Qo'llab-quvvatlashga murojaat qiling.",
    askPhone:
      "🔐 <b>Hisobingizni tasdiqlang</b>\n\nXavfsizlik uchun telefon raqamingiz kerak. Pastdagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing.\n\n<i>Raqam yuborilmaguncha menyu ochilmaydi. Faqat o'zingizning raqamingiz qabul qilinadi.</i>",
    phoneBtn: "📱 Raqamni yuborish",
    notOwnContact: "⚠️ Bu boshqa odamning kontakti. Iltimos, pastdagi tugma orqali <b>o'zingizning</b> raqamingizni yuboring.",
    phoneSaved: (p: string) => `✅ Raqamingiz tasdiqlandi: <code>${p}</code>`,
    langSaved: "✅ Til: O'zbekcha",
    faqTitle: "❓ <b>Ko'p beriladigan savollar</b>\n\nSavolni tanlang:",
    faqEmpty: "Hozircha savol-javoblar qo'shilmagan. Qo'llab-quvvatlashga yozing.",
    faqBack: "⬅️ Savollarga qaytish",
    faqMore: "❓ Boshqa savollar",
    pickMenu: "<i>Pastdagi menyudan kerakli bo'limni tanlang 👇</i>",
    st: { pending: "⏳ kutilmoqda", approved: "✅ bajarildi", rejected: "❌ rad etildi" } as Record<string, string>,
    ty: {
      wallet_topup: "Hamyonni to'ldirish",
      card_withdraw: "Kartaga yechish",
      bk_deposit: "BK to'ldirish",
      bk_withdraw: "BK dan chiqarish",
      referral_bonus: "Referal bonus",
      adjustment: "Balans tuzatish",
    } as Record<string, string>,
  },
  ru: {
    welcome: (b: string) =>
      `🥇 <b><i>Добро пожаловать в ${escapeHtml(b)}!</i></b> <i>Здесь главное — безопасность, удобство и скорость. Начните проводить платежи легко и надёжно вместе с нами!</i>`,
    mainMenu: "<i>Главное меню. Чем могу помочь?</i>",
    depositIntro: "Пожалуйста, посмотрите видео и\n\nвыберите способ пополнения:",
    noBk: "Пока нет букмекеров для пополнения.",
    withdraw:
      "ℹ️ Вывод средств теперь доступен только через платформу Wallet.\n\nНажмите кнопку ниже, чтобы перейти и вывести средства.",
    toWallet: "💳 Перейти в Wallet",
    historyTitle: "История операций:",
    historyEmpty: "У вас пока нет истории операций",
    support: "Чтобы связаться с нашими сотрудниками, нажмите кнопку ниже.",
    supportBtn: "Связаться с поддержкой",
    supportMissing: "Поддержка ещё не настроена.",
    backMenu: "Вернуться в главное меню",
    referral: (bal: number, link: string, p: string, earned: number) =>
      `Баланс: ${formatSom(bal)} UZS\n\nВаша реферальная ссылка:\n${link}\n\nПриглашайте друзей и получайте ${p}% бонус с каждого их пополнения!\n\n🎁 Реферальный бонус: ${formatSom(earned)} UZS\n\nℹ️ Вывод средств доступен только через Mini App.`,
    myRefs: "Мои рефералы",
    shareBtn: "📤 Отправить друзьям",
    shareText: "Kassa 24/7 — быстрое пополнение и вывод в букмекерах. Присоединяйтесь по ссылке:",
    refsEmpty: "У вас пока нет рефералов.",
    refsTitle: (n: number) => `👥 Ваши рефералы: ${n}`,
    ratesDeposit: "📊 Курсы пополнения:",
    ratesWithdraw: "📊 Курсы вывода:",
    blocked: "⛔ Ваш аккаунт заблокирован. Обратитесь в поддержку.",
    askPhone:
      "🔐 <b>Подтвердите аккаунт</b>\n\nДля безопасности нужен ваш номер телефона. Нажмите кнопку <b>«📱 Отправить номер»</b> ниже.\n\n<i>Меню откроется только после отправки номера. Принимается только ваш собственный номер.</i>",
    phoneBtn: "📱 Отправить номер",
    notOwnContact: "⚠️ Это контакт другого человека. Отправьте, пожалуйста, <b>свой</b> номер кнопкой ниже.",
    phoneSaved: (p: string) => `✅ Ваш номер подтверждён: <code>${p}</code>`,
    langSaved: "✅ Язык: Русский",
    faqTitle: "❓ <b>Частые вопросы</b>\n\nВыберите вопрос:",
    faqEmpty: "Вопросы пока не добавлены. Напишите в поддержку.",
    faqBack: "⬅️ К вопросам",
    faqMore: "❓ Другие вопросы",
    pickMenu: "<i>Выберите нужный раздел в меню ниже 👇</i>",
    st: { pending: "⏳ в ожидании", approved: "✅ выполнено", rejected: "❌ отклонено" } as Record<string, string>,
    ty: {
      wallet_topup: "Пополнение кошелька",
      card_withdraw: "Вывод на карту",
      bk_deposit: "Пополнение БК",
      bk_withdraw: "Вывод из БК",
      referral_bonus: "Реферальный бонус",
      adjustment: "Корректировка",
    } as Record<string, string>,
  },
  en: {
    welcome: (b: string) =>
      `🥇 <b><i>Welcome to ${escapeHtml(b)}!</i></b> <i>What matters most here: safety, convenience and speed. Start making your payments easily and reliably with us!</i>`,
    mainMenu: "<i>Main menu. How can I help you?</i>",
    depositIntro: "Please watch the video and\n\nchoose how to deposit:",
    noBk: "No bookmakers available for deposits yet.",
    withdraw: "ℹ️ Withdrawals are now made only through the Wallet.\n\nTap the button below to open it and withdraw.",
    toWallet: "💳 Open Wallet",
    historyTitle: "Transaction history:",
    historyEmpty: "You have no transactions yet",
    support: "To contact our team, please tap the button below.",
    supportBtn: "Contact support",
    supportMissing: "Support is not set up yet.",
    backMenu: "Back to main menu",
    referral: (bal: number, link: string, p: string, earned: number) =>
      `Balance: ${formatSom(bal)} UZS\n\nYour referral link:\n${link}\n\nInvite friends and get ${p}% of each of their deposits!\n\n🎁 Referral bonus earned: ${formatSom(earned)} UZS\n\nℹ️ Withdrawals are available only in the Mini App.`,
    myRefs: "My referrals",
    shareBtn: "📤 Send to friends",
    shareText: "Kassa 24/7 — fast bookmaker deposits and withdrawals. Join with this link:",
    refsEmpty: "You have no referrals yet.",
    refsTitle: (n: number) => `👥 Your referrals: ${n}`,
    ratesDeposit: "📊 Deposit rates:",
    ratesWithdraw: "📊 Withdrawal rates:",
    blocked: "⛔ Your account is blocked. Please contact support.",
    askPhone:
      "🔐 <b>Verify your account</b>\n\nFor safety we need your phone number. Tap <b>«📱 Share number»</b> below.\n\n<i>The menu opens only after you share it. Only your own number is accepted.</i>",
    phoneBtn: "📱 Share number",
    notOwnContact: "⚠️ That is someone else's contact. Please share <b>your own</b> number with the button below.",
    phoneSaved: (p: string) => `✅ Your number is verified: <code>${p}</code>`,
    langSaved: "✅ Language: English",
    faqTitle: "❓ <b>Frequently asked questions</b>\n\nChoose a question:",
    faqEmpty: "No questions added yet. Please write to support.",
    faqBack: "⬅️ Back to questions",
    faqMore: "❓ Other questions",
    pickMenu: "<i>Choose a section in the menu below 👇</i>",
    st: { pending: "⏳ pending", approved: "✅ completed", rejected: "❌ rejected" } as Record<string, string>,
    ty: {
      wallet_topup: "Wallet top-up",
      card_withdraw: "Card withdrawal",
      bk_deposit: "Bookmaker deposit",
      bk_withdraw: "Bookmaker withdrawal",
      referral_bonus: "Referral bonus",
      adjustment: "Balance adjustment",
    } as Record<string, string>,
  },
};

const ADMIN_BUTTON = "🛠 Admin panel";

function mainKeyboard(l: L, admin = false) {
  const m = MENU[l];
  return {
    keyboard: [
      [{ text: m.deposit }, { text: m.withdraw }],
      [{ text: m.history }, { text: m.support }],
      [{ text: m.referral }, { text: m.faq }],
      ...(admin ? [[{ text: ADMIN_BUTTON }]] : []),
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function matchMenu(text: string): keyof (typeof MENU)["uz"] | null {
  for (const l of ["uz", "ru", "en"] as L[]) {
    for (const [k, v] of Object.entries(MENU[l])) if (v === text) return k as keyof (typeof MENU)["uz"];
  }
  return null;
}

function supportUrl(s: Settings) {
  const u = s.support_username.replace(/^@/, "").trim();
  return u ? `https://t.me/${u}` : null;
}

async function sendSlotVideo(chatId: number, slot: string, caption: string, replyMarkup?: unknown) {
  const v = await maybeOne(
    sql<{ storage_path: string | null; tg_file_id: string | null }[]>`
      select storage_path, tg_file_id from public.videos where slot = ${slot}`,
  );
  if (v?.storage_path || v?.tg_file_id) {
    try {
      const source = v.tg_file_id ?? (await signedUrl("media", v.storage_path, 60 * 60));
      if (source) {
        const msg = await tg("sendVideo", {
          chat_id: chatId,
          video: source,
          caption,
          parse_mode: "HTML",
          supports_streaming: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
        const fileId = msg?.video?.file_id ?? msg?.document?.file_id;
        if (fileId && fileId !== v.tg_file_id)
          await sql`update public.videos set tg_file_id = ${fileId} where slot = ${slot}`;
        return;
      }
    } catch (e) {
      console.error("sendVideo failed, falling back to text", e);
    }
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: caption,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendWelcome(chatId: number, l: L, s: Settings) {
  await tg("sendMessage", { chat_id: chatId, text: TXT[l].welcome(s.brand_name || "Kassa 24/7"), parse_mode: "HTML" });
  await sendMainMenu(chatId, l, s);
}

async function sendMainMenu(chatId: number, l: L, s?: Settings) {
  const admin = chatId > 0 && (await isTelegramAdmin(chatId, s).catch(() => false));
  await tg("sendMessage", {
    chat_id: chatId,
    text: TXT[l].mainMenu,
    parse_mode: "HTML",
    reply_markup: mainKeyboard(l, admin),
  });
}

/** Web App links must be https; behind Railway's proxy the request origin can arrive as http. */
function httpsBase(s: Settings, fallbackOrigin: string) {
  return publicBase(s, fallbackOrigin).replace(/^http:\/\/(?!localhost|127\.0\.0\.1)/, "https://");
}

// Admin home in the chat: what needs attention + buttons that open the panel already signed in.
async function sendAdminPanel(chatId: number, s: Settings, base: string) {
  const pending = await sql<{ n: number }[]>`select count(*)::float8 as n from public.transactions where status = 'pending'`;
  const lines = ["🛠 <b>Admin panel</b>", "", `⏳ Kutilayotgan so'rovlar: <b>${Number(pending[0]?.n ?? 0)}</b>`];
  if (s.card_number) lines.push(`💳 To'ldirish kartasi: <code>${maskCard(s.card_number)}</code> ${escapeHtml(s.card_holder)}`);
  else
    lines.push(
      "",
      "⚠️ <b>To'ldirish kartasi kiritilmagan</b> — mijozlar hamyonni to'ldira olmaydi.",
      "Kiritish: <code>/karta 8600123412341234 ISM FAMILIYA</code>",
    );
  if (!(await loadCashdeskCreds("linebet")))
    lines.push("", "⚠️ Linebet API kiritilmagan — so'rovlarni qo'lda tasdiqlaysiz. Kiritish: panel → Sozlamalar → Linebet API.");
  lines.push(
    "",
    s.selfie_channel_id.trim()
      ? "🤳 Selfi kanali: ✅ ulangan"
      : "⚠️ <b>Selfi kanali ulanmagan</b> — yuz suratlari yuborilmayapti. Ulash: /kanal",
  );
  lines.push("", "Barcha boshqaruv (so'rovlar, foydalanuvchilar, balans, bukmekerlar, videolar, sozlamalar) panelda:");
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
        [{ text: "🤳 Selfi kanali", callback_data: "adm:channel" }],
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
    text: `✅ To'ldirish kartasi saqlandi: <code>${maskCard(card)}</code> ${escapeHtml(holder)}\nEndi mijozlar hamyonni to'ldira oladi.`,
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
    return answer(act === "block" ? `🚫 ${userId} bloklandi — bot va hamyon unga yopiq` : `✅ ${userId} blokdan chiqarildi`, true);
  }

  if (!id || !TX_ID.test(id) || !["ok", "ok2", "no", "back"].includes(act ?? "")) return answer("Noto'g'ri tugma", true);

  if (act === "back") {
    const tx = await maybeOne(sql<{ user_id: number; status: string; type: string; amount: number }[]>`
      select user_id::float8 as user_id, status, type, amount::float8 as amount from public.transactions where id = ${id}`);
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
    console.error("admin decision failed", e);
    return answer(`Xatolik: ${msg.slice(0, 150)}`, true);
  }
}

// ---------- Questions & answers (admin panel → Avto-javoblar) ----------
function loadReplies(): Promise<AutoReply[]> {
  return cached("auto-replies", 30_000, async () => {
    const rows = await sql<AutoReply[]>`
      select id::text as id, keywords, question_uz, answer_uz, question_ru, answer_ru, question_en, answer_en,
        sort_order, is_active
      from public.auto_replies where is_active order by sort_order, created_at`;
    return [...rows];
  });
}

function faqList(l: L, replies: AutoReply[]) {
  const t = TXT[l];
  if (!replies.length) return { text: t.faqEmpty, markup: { inline_keyboard: [] as unknown[][] } };
  return {
    text: t.faqTitle,
    markup: {
      inline_keyboard: replies.slice(0, 30).map((r) => [{ text: replyText(r, l).q.slice(0, 60), callback_data: `faq:${r.id}` }]),
    },
  };
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

async function sendLanguagePicker(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "<b><i>Tilni tanlang\nВыберите язык\nChoose a language</i></b>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇺🇿 O'zbek tili", callback_data: "lang:uz" }],
        [{ text: "🇷🇺 Русский", callback_data: "lang:ru" }],
        [{ text: "🇬🇧 English", callback_data: "lang:en" }],
      ],
    },
  });
}

// Phone gate: a one-button keyboard that shares the user's own contact. The menu stays closed until then.
async function sendPhoneRequest(chatId: number, l: L, base: string) {
  const markup = {
    keyboard: [[{ text: TXT[l].phoneBtn, request_contact: true }]],
    resize_keyboard: true,
    is_persistent: true,
  };
  try {
    await tg("sendPhoto", {
      chat_id: chatId,
      photo: `${base}/images/phone-verify.jpg`,
      caption: TXT[l].askPhone,
      parse_mode: "HTML",
      reply_markup: markup,
    });
  } catch {
    await tg("sendMessage", { chat_id: chatId, text: TXT[l].askPhone, parse_mode: "HTML", reply_markup: markup });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Update = any;

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

export async function handleUpdate(update: Update, fallbackOrigin: string) {
  await ensureMigrations();
  const s = await getSettings();
  const base = httpsBase(s, fallbackOrigin);
  const walletUrl = `${base}/app`;

  // Bot made admin of a channel by one of our admins → that channel receives the selfies.
  if (update.my_chat_member) {
    const ch = channelFromBotPromotion(update.my_chat_member);
    const by = update.my_chat_member.from?.id;
    if (ch && typeof by === "number" && (await isTelegramAdmin(by, s))) await linkSelfieChannel(ch, by);
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
    // Stop the button's spinner right away; the answer follows.
    const answered = tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
    const { user } = await upsertTgUser(from);
    await answered;
    if (user.is_blocked) {
      await tg("sendMessage", { chat_id: chatId, text: TXT[langOf(user.lang)].blocked }).catch(() => undefined);
      return;
    }
    if (data.startsWith("lang:")) {
      const l: L = langOf(data.slice(5));
      await sql`update public.tg_users set lang = ${l}, lang_chosen = true where id = ${user.id}`;
      // The picker turns into "✅ Language: …" — it does not vanish.
      await editInPlace(cq, TXT[l].langSaved, { inline_keyboard: [] });
      if (!user.phone) return sendPhoneRequest(chatId, l, base);
      await sendWelcome(chatId, l, s);
      return;
    }
    const l: L = langOf(user.lang);
    if (!user.phone) return sendPhoneRequest(chatId, l, base);
    if (data === "menu") {
      // The bottom menu is always there; just close this message's buttons in place.
      if (typeof cq.message?.text === "string") return editInPlace(cq, TXT[l].pickMenu, { inline_keyboard: [] });
      if (cq.message?.message_id)
        await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
      return;
    }
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
        inline_keyboard: [[{ text: TXT[l].faqBack, callback_data: "faq:list" }]],
      });
    }
    if (data === "refs") {
      const refs = await listReferrals(user.id);
      const text = refs.length
        ? [TXT[l].refsTitle(refs.length), "", ...refs.slice(0, 30).map((r, i) => `${i + 1}. ${escapeHtml(r.first_name ?? "")} ${r.username ? "@" + escapeHtml(r.username) : ""}`)].join("\n")
        : TXT[l].refsEmpty;
      await tg("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: TXT[l].backMenu, callback_data: "menu" }]] },
      });
    }
    return;
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
    if (user.is_blocked) {
      await tg("sendMessage", { chat_id: chatId, text: TXT[langOf(user.lang)].blocked });
      return;
    }
    if (!user.lang_chosen) return sendLanguagePicker(chatId);
    if (!user.phone) return sendPhoneRequest(chatId, langOf(user.lang), base);
    return sendWelcome(chatId, langOf(user.lang), s);
  }

  const { user } = await upsertTgUser(from);
  const l: L = langOf(user.lang);
  const t = TXT[l];
  if (user.is_blocked) {
    await tg("sendMessage", { chat_id: chatId, text: t.blocked });
    return;
  }
  // Shared contact (from the bot button or the wallet): only the sender's own number is accepted.
  if (msg.contact) {
    const phone = normalizePhone(msg.contact.phone_number);
    if (!isOwnContact(msg.contact, from.id) || !phone) {
      await tg("sendMessage", { chat_id: chatId, text: t.notOwnContact, parse_mode: "HTML" });
      return sendPhoneRequest(chatId, l, base);
    }
    await savePhone(user.id, phone);
    await tg("sendMessage", { chat_id: chatId, text: t.phoneSaved(escapeHtml(phone)), parse_mode: "HTML" });
    if (!user.lang_chosen) return sendLanguagePicker(chatId);
    return sendWelcome(chatId, l, s);
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

  // No phone yet → nothing else opens.
  if (!user.phone) return sendPhoneRequest(chatId, l, base);
  if (text === "/menu") return sendMainMenu(chatId, l, s);

  const action = matchMenu(text);
  if (!action) {
    // A typed question gets the matching ready answer; anything else points to the menu
    // (without re-sending the bottom keyboard, so it doesn't jump).
    const hit = text ? matchReply(text, await loadReplies().catch(() => [])) : null;
    if (hit) {
      const qa = replyText(hit, l);
      await tg("sendMessage", {
        chat_id: chatId,
        text: `💬 <b>${escapeHtml(qa.q)}</b>\n\n${escapeHtml(qa.a)}`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: t.faqMore, callback_data: "faq:list" }]] },
      });
      return;
    }
    await tg("sendMessage", { chat_id: chatId, text: t.pickMenu, parse_mode: "HTML" });
    return;
  }

  if (action === "faq") {
    const f = faqList(l, await loadReplies().catch(() => []));
    await tg("sendMessage", { chat_id: chatId, text: f.text, parse_mode: "HTML", reply_markup: f.markup });
    return;
  }

  if (action === "deposit") {
    const bks = await sql<{ id: string; name: string }[]>`
      select id, name from public.bookmakers where is_active and deposit_enabled order by sort_order`;
    if (!bks.length) {
      await tg("sendMessage", { chat_id: chatId, text: t.noBk });
      return;
    }
    const kb = {
      inline_keyboard: bks.map((b) => [
        { text: `🇺🇿 ${b.name} | ⚡`, web_app: { url: `${walletUrl}?bk=${encodeURIComponent(b.id)}&mode=deposit` } },
      ]),
    };
    return sendSlotVideo(chatId, "bot_deposit", t.depositIntro, kb);
  }

  if (action === "withdraw") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: t.withdraw,
      reply_markup: { inline_keyboard: [[{ text: t.toWallet, web_app: { url: walletUrl } }]] },
    });
    return;
  }

  if (action === "history") {
    const txs = await sql<
      { number: number; type: string; status: string; amount: number; created_at: string }[]
    >`
      select number::float8 as number, type, status, amount::float8 as amount, ${ts("created_at")} as created_at
      from public.transactions
      where user_id = ${user.id}
      order by created_at desc
      limit 10`;
    if (!txs.length) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: t.historyTitle,
        reply_markup: { inline_keyboard: [[{ text: t.historyEmpty, callback_data: "menu" }]] },
      });
      return;
    }
    const lines = txs.map(
      (x) => `#${x.number} • ${t.ty[x.type] ?? x.type} • ${formatSom(x.amount)} • ${t.st[x.status] ?? x.status}\n<i>${formatDateTime(x.created_at)}</i>`,
    );
    await tg("sendMessage", { chat_id: chatId, text: `${t.historyTitle}\n\n${lines.join("\n\n")}`, parse_mode: "HTML" });
    return;
  }

  if (action === "support") {
    const url = supportUrl(s);
    await tg("sendMessage", {
      chat_id: chatId,
      text: url ? t.support : t.supportMissing,
      reply_markup: {
        inline_keyboard: [
          ...(url ? [[{ text: t.supportBtn, url }]] : []),
          [{ text: t.backMenu, callback_data: "menu" }],
        ],
      },
    });
    return;
  }

  if (action === "referral") {
    const link = referralLink(await resolveBotUsername(s), user.id);
    const caption = t.referral(user.balance, link || "—", s.referral_percent || "2", user.referral_earned);
    return sendSlotVideo(chatId, "bot_referral", escapeHtml(caption), {
      inline_keyboard: [
        ...(link ? [[{ text: t.shareBtn, url: shareLink(link, t.shareText) }]] : []),
        [{ text: t.myRefs, callback_data: "refs" }],
        [{ text: t.backMenu, callback_data: "menu" }],
      ],
    });
  }

  if (action === "rates") {
    const bks = await sql<
      {
        name: string;
        deposit_enabled: boolean;
        withdraw_enabled: boolean;
        deposit_fee_percent: number;
        withdraw_fee_percent: number;
      }[]
    >`
      select name, deposit_enabled, withdraw_enabled,
        deposit_fee_percent::float8 as deposit_fee_percent,
        withdraw_fee_percent::float8 as withdraw_fee_percent
      from public.bookmakers where is_active order by sort_order`;
    const dep = bks.filter((b) => b.deposit_enabled).map((b) => `🇺🇿 ${b.name} | ⚡: ${Number(b.deposit_fee_percent)} %`);
    const wd = bks.filter((b) => b.withdraw_enabled).map((b) => `🇺🇿 ${b.name} | ⚡: ${Number(b.withdraw_fee_percent)} %`);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `${t.ratesDeposit}\n\n${dep.join("\n") || "—"}\n\n${t.ratesWithdraw}\n\n${wd.join("\n") || "—"}`,
      reply_markup: { inline_keyboard: [[{ text: t.backMenu, callback_data: "menu" }]] },
    });
    return;
  }
}
