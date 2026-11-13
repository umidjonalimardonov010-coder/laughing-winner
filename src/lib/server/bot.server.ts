// Telegram bot conversation logic (chat side). Money operations happen in the WALLET mini app.
import { ensureMigrations } from "./migrations.server";
import { maybeOne, sql, ts } from "./db.server";
import { getSettings, publicBase, saveSettings, type Settings } from "./settings.server";
import { approveRequest, isTelegramAdmin, rejectRequest } from "./requests.server";
import { cleanCardNumber } from "./admins";
import { loadCashdeskCreds } from "./cashdesk-config.server";
import { escapeHtml, tg } from "./telegram.server";
import { listReferrals, upsertTgUser, type TgFrom } from "./users.server";
import { signedUrl } from "./media.server";
import { resolveBotUsername } from "./bot-username.server";
import { referralLink, shareLink } from "@/lib/referral";
import { formatDateTime, formatSom, maskCard } from "@/lib/format";

type L = "uz" | "ru";

const MENU: Record<L, { deposit: string; withdraw: string; history: string; support: string; referral: string; rates: string }> = {
  uz: {
    deposit: "📥 Hisobni to'ldirish 📥",
    withdraw: "📤 Hisobdan yechish 📤",
    history: "To'lovlar tarixi ⏳",
    support: "Aloqa markazi 👨‍💻",
    referral: "Hamkorlik dasturi 👥",
    rates: "Joriy kurslar 💸",
  },
  ru: {
    deposit: "📥 Пополнить счёт 📥",
    withdraw: "📤 Вывести со счёта 📤",
    history: "История платежей ⏳",
    support: "Центр поддержки 👨‍💻",
    referral: "Партнёрская программа 👥",
    rates: "Текущие курсы 💸",
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
};

const ADMIN_BUTTON = "🛠 Admin panel";

function mainKeyboard(l: L, admin = false) {
  const m = MENU[l];
  return {
    keyboard: [
      [{ text: m.deposit }, { text: m.withdraw }],
      [{ text: m.history }, { text: m.support }],
      [{ text: m.referral }],
      ...(admin ? [[{ text: ADMIN_BUTTON }]] : []),
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function matchMenu(text: string): keyof (typeof MENU)["uz"] | null {
  for (const l of ["uz", "ru"] as L[]) {
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
      ],
    },
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

// ✅ / ❌ under a new-request alert.
async function handleAdminDecision(cq: Update, s: Settings) {
  const [, act, id] = String(cq.data).split(":");
  const answer = (text: string, alert = false) =>
    tg("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => undefined);
  if (!(await isTelegramAdmin(cq.from.id, s))) return answer("⛔ Ruxsat yo'q", true);
  if (!id || !TX_ID.test(id) || (act !== "ok" && act !== "no")) return answer("Noto'g'ri tugma", true);
  try {
    const done = act === "ok" ? await approveRequest(id) : await rejectRequest(id);
    const label = act === "ok" ? `✅ #${done.number} tasdiqlandi` : `❌ #${done.number} rad etildi`;
    await answer(label);
    if (cq.message?.message_id)
      await tg("editMessageReplyMarkup", {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: label, callback_data: "noop" }]] },
      }).catch(() => undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already_processed")) return answer("Bu so'rov allaqachon ko'rib chiqilgan", true);
    if (msg.includes("insufficient")) return answer("Mijoz balansida pul yetarli emas", true);
    console.error("admin decision failed", e);
    return answer(`Xatolik: ${msg.slice(0, 150)}`, true);
  }
}

async function sendLanguagePicker(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "<b><i>Выберите язык\n🇷🇺🇺🇿\nTilni tanlang</i></b>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "Русский", callback_data: "lang:ru" }], [{ text: "O'zbek tili", callback_data: "lang:uz" }]],
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Update = any;

export async function handleUpdate(update: Update, fallbackOrigin: string) {
  await ensureMigrations();
  const s = await getSettings();
  const base = httpsBase(s, fallbackOrigin);
  const walletUrl = `${base}/app`;

  if (update.callback_query) {
    const cq = update.callback_query;
    const from: TgFrom = cq.from;
    const chatId: number = cq.message?.chat?.id ?? from.id;
    const data: string = cq.data ?? "";
    if (data.startsWith("adm:")) return handleAdminDecision(cq, s);
    const { user } = await upsertTgUser(from);
    await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
    if (data.startsWith("lang:")) {
      const l: L = data === "lang:ru" ? "ru" : "uz";
      await sql`update public.tg_users set lang = ${l}, lang_chosen = true where id = ${user.id}`;
      if (cq.message?.message_id)
        await tg("deleteMessage", { chat_id: chatId, message_id: cq.message.message_id }).catch(() => undefined);
      await sendWelcome(chatId, l, s);
      return;
    }
    const l: L = user.lang === "ru" ? "ru" : "uz";
    if (data === "menu") return sendMainMenu(chatId, l, s);
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
      await tg("sendMessage", { chat_id: chatId, text: TXT.uz.blocked });
      return;
    }
    if (!user.lang_chosen) return sendLanguagePicker(chatId);
    return sendWelcome(chatId, user.lang === "ru" ? "ru" : "uz", s);
  }

  const { user } = await upsertTgUser(from);
  const l: L = user.lang === "ru" ? "ru" : "uz";
  const t = TXT[l];
  if (user.is_blocked) {
    await tg("sendMessage", { chat_id: chatId, text: t.blocked });
    return;
  }
  if (text === "/lang") return sendLanguagePicker(chatId);
  if (text === "/menu") return sendMainMenu(chatId, l, s);

  const isAdminCmd = text === ADMIN_BUTTON || /^\/admin(@\w+)?$/i.test(text);
  const isCardCmd = /^\/karta(@\w+)?(\s|$)/i.test(text);
  if ((isAdminCmd || isCardCmd) && (await isTelegramAdmin(from.id, s))) {
    if (isCardCmd) return setCardFromChat(chatId, text);
    return sendAdminPanel(chatId, s, base);
  }

  const action = matchMenu(text);
  if (!action) return sendMainMenu(chatId, l, s);

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
