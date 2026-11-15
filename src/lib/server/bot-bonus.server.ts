// "💰 BONUS OLISH" screens in the chat bot: balance (→ LINEBET), invite friends, daily bonus.
import type { Settings } from "./settings.server";
import { bonusBalance, claimDailyBonus, referralStats } from "./bonus.server";
import { resolveBotUsername } from "./bot-username.server";
import { escapeHtml } from "./telegram.server";
import { bonusConfig } from "@/lib/bonus-rules";
import { referralLink, shareLink } from "@/lib/referral";
import { formatSom } from "@/lib/format";

type L = "uz" | "ru";
type Screen = { text: string; markup?: unknown };

export const BONUS_TXT = {
  uz: {
    menu: "💰 Bonus bo'limi — kerakli tugmani bosing",
    wdBtn: "📤 Yechib olish → LINEBET",
    askAccount: "LINEBET hisob raqamingizni (ID) kiriting — bonus shu hisobga tushadi:",
    confirm: (acc: string, amount: number) =>
      `🎁 <b>Bonusni yechish</b>\n\n🆔 LINEBET: <code>${acc}</code>\n💰 Summa: <b>${formatSom(amount)} so'm</b>\n\nTo'g'ri bo'lsa «✅ Tasdiqlash» ni bosing.`,
    confirmBtn: "✅ Tasdiqlash",
    belowMin: (bal: number, min: number) =>
      `💰 Bonus balansingiz: <b>${formatSom(bal)} so'm</b>\n\n❗️ Yechib olish uchun kamida <b>${formatSom(min)} so'm</b> kerak. Do'stlaringizni taklif qiling va kunlik bonusni oling!`,
    sent: (n: number) => `✅ So'rov #${n} qabul qilindi.\nTekshirilgach bonus LINEBET hisobingizga tushadi va sizga xabar keladi.`,
    done: (n: number, amount: number, acc: string) => `✅ #${n}: <b>${formatSom(amount)} so'm</b> LINEBET hisobingizga (<code>${acc}</code>) o'tkazildi!`,
    refunded: (msg: string) => `❌ LINEBET qabul qilmadi: ${msg}\n↩️ Pul bonus balansingizga qaytdi. ID ni tekshirib, qaytadan urinib ko'ring.`,
    sending: (n: number) => `⏳ #${n} yuborilmoqda`,
    noBk: "LINEBET hozircha ishlamayapti. Birozdan keyin urinib ko'ring.",
  },
  ru: {
    menu: "💰 Раздел бонусов — выберите кнопку",
    wdBtn: "📤 Вывести → LINEBET",
    askAccount: "Введите номер счёта LINEBET (ID) — бонус поступит на этот счёт:",
    confirm: (acc: string, amount: number) =>
      `🎁 <b>Вывод бонуса</b>\n\n🆔 LINEBET: <code>${acc}</code>\n💰 Сумма: <b>${formatSom(amount)} сум</b>\n\nЕсли всё верно, нажмите «✅ Подтвердить».`,
    confirmBtn: "✅ Подтвердить",
    belowMin: (bal: number, min: number) =>
      `💰 Ваш бонусный баланс: <b>${formatSom(bal)} сум</b>\n\n❗️ Для вывода нужно минимум <b>${formatSom(min)} сум</b>. Приглашайте друзей и получайте ежедневный бонус!`,
    sent: (n: number) => `✅ Заявка #${n} принята.\nПосле проверки бонус поступит на ваш счёт LINEBET, придёт сообщение.`,
    done: (n: number, amount: number, acc: string) => `✅ #${n}: <b>${formatSom(amount)} сум</b> зачислены на ваш счёт LINEBET (<code>${acc}</code>)!`,
    refunded: (msg: string) => `❌ LINEBET не принял: ${msg}\n↩️ Деньги вернулись на бонусный баланс. Проверьте ID и попробуйте снова.`,
    sending: (n: number) => `⏳ #${n} отправляется`,
    noBk: "LINEBET сейчас недоступен. Попробуйте чуть позже.",
  },
};

export async function balanceScreen(l: L, s: Settings, userId: number): Promise<Screen> {
  const bal = await bonusBalance(userId);
  const min = bonusConfig(s).withdrawMin;
  const som = l === "ru" ? "сум" : "so'm";
  const text =
    l === "ru"
      ? `💰 <b>Бонусный баланс:</b> ${formatSom(bal)} ${som}\n\n📤 Вывод — на ваш счёт LINEBET, от ${formatSom(min)} ${som}.`
      : `💰 <b>Bonus balansingiz:</b> ${formatSom(bal)} ${som}\n\n📤 Yechib olish — LINEBET hisobingizga, kamida ${formatSom(min)} ${som}.`;
  return { text, markup: { inline_keyboard: [[{ text: BONUS_TXT[l].wdBtn, callback_data: "bonus:wd", style: "success" }]] } };
}

export async function inviteScreen(l: L, s: Settings, userId: number): Promise<Screen> {
  const [bot, st] = await Promise.all([resolveBotUsername(s), referralStats(userId)]);
  const reward = bonusConfig(s).referralReward;
  const link = referralLink(bot, userId);
  const som = l === "ru" ? "сум" : "so'm";
  const lines =
    l === "ru"
      ? [
          "👥 <b>Приглашайте друзей!</b>",
          "",
          reward > 0
            ? `Когда друг впервые пополнит счёт, вы получите <b>${formatSom(reward)} ${som}</b> на бонусный баланс.`
            : "Реферальный бонус сейчас выключен.",
          "",
          link ? `🔗 Ваша ссылка:\n<code>${escapeHtml(link)}</code>` : "🔗 Ссылка скоро появится.",
          "",
          `👤 Приглашено: <b>${st.invited}</b>`,
          `✅ Пополнили: <b>${st.paid}</b>`,
          `💰 Заработано: <b>${formatSom(st.earned)} ${som}</b>`,
        ]
      : [
          "👥 <b>Do'stlaringizni taklif qiling!</b>",
          "",
          reward > 0
            ? `Do'stingiz birinchi marta hisob to'ldirganda bonus balansingizga <b>${formatSom(reward)} ${som}</b> tushadi.`
            : "Referal bonus hozircha o'chirilgan.",
          "",
          link ? `🔗 Sizning havolangiz:\n<code>${escapeHtml(link)}</code>` : "🔗 Havola tez orada paydo bo'ladi.",
          "",
          `👤 Taklif qilinganlar: <b>${st.invited}</b>`,
          `✅ Hisob to'ldirganlar: <b>${st.paid}</b>`,
          `💰 Ishlangan: <b>${formatSom(st.earned)} ${som}</b>`,
        ];
  const share = l === "ru" ? "Обменивай быстро и выгодно 👇" : "Tez va qulay almashuv — qo'shiling 👇";
  return {
    text: lines.join("\n"),
    markup: link
      ? { inline_keyboard: [[{ text: l === "ru" ? "📤 Отправить друзьям" : "📤 Do'stlarga yuborish", url: shareLink(link, share) }]] }
      : undefined,
  };
}

export async function dailyScreen(l: L, s: Settings, userId: number): Promise<Screen> {
  const r = await claimDailyBonus(userId, s);
  const som = l === "ru" ? "сум" : "so'm";
  if (r.kind === "off") return { text: l === "ru" ? "🎁 Ежедневный бонус сейчас выключен." : "🎁 Kunlik bonus hozircha o'chirilgan." };
  if (r.kind === "already") {
    const h = Math.floor(r.waitMs / 3600_000);
    const m = Math.max(1, Math.ceil((r.waitMs % 3600_000) / 60_000));
    return {
      text:
        l === "ru"
          ? `⏳ Сегодняшний бонус уже получен.\nСледующий — через <b>${h} ч ${m} мин</b>.`
          : `⏳ Bugungi bonusni oldingiz.\nKeyingisi <b>${h} soat ${m} daqiqadan</b> keyin.`,
    };
  }
  return {
    text:
      l === "ru"
        ? `🎉 <b>Ежедневный бонус: +${formatSom(r.amount)} ${som}</b>\n💰 Бонусный баланс: <b>${formatSom(r.balance)} ${som}</b>\n\nПриходите завтра снова!`
        : `🎉 <b>Kunlik bonus: +${formatSom(r.amount)} ${som}</b>\n💰 Bonus balans: <b>${formatSom(r.balance)} ${som}</b>\n\nErtaga yana keling!`,
  };
}
