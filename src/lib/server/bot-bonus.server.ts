// "💰 BONUS OLISH" screens in the chat bot: balance (→ LINEBET), invite friends, daily bonus, VIP level, weekly contest.
import type { Settings } from "./settings.server";
import { bonusBalance, bonusWithdrawWait, claimDailyBonus, referralStats } from "./bonus.server";
import { resolveBotUsername } from "./bot-username.server";
import { escapeHtml } from "./telegram.server";
import { bonusConfig, splitWait } from "@/lib/bonus-rules";
import { referralLink, shareLink } from "@/lib/referral";
import { formatSom } from "@/lib/format";
import { vipStatus } from "./vip.server";
import { myContest } from "./contest.server";

type L = "uz" | "ru";

type Wait = { h: number; m: number };
const waitUz = (w: Wait) => (w.h && w.m ? `${w.h} soat ${w.m} daqiqadan` : w.h ? `${w.h} soatdan` : `${w.m} daqiqadan`);
const waitRu = (w: Wait) => (w.h && w.m ? `${w.h} ч ${w.m} мин` : w.h ? `${w.h} ч` : `${w.m} мин`);
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
    wait: (ms: number, hours: number) => {
      const w = splitWait(ms);
      return `⏳ Bonusni <b>${hours} soatda 1 marta</b> yechish mumkin.\n\n🕒 Keyingi yechish: <b>${waitUz(w)}</b> keyin.`;
    },
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
    wait: (ms: number, hours: number) => {
      const w = splitWait(ms);
      return `⏳ Бонус можно выводить <b>1 раз в ${hours} ч</b>.\n\n🕒 Следующий вывод через <b>${waitRu(w)}</b>.`;
    },
  },
};

export async function balanceScreen(l: L, s: Settings, userId: number): Promise<Screen> {
  const [bal, waitMs] = await Promise.all([bonusBalance(userId), bonusWithdrawWait(userId, s)]);
  const { withdrawMin: min, withdrawEveryHours: hours } = bonusConfig(s);
  const som = l === "ru" ? "сум" : "so'm";
  const w = splitWait(waitMs);
  const rule =
    hours > 0
      ? l === "ru"
        ? `\n🕒 Вывод — 1 раз в ${hours} ч.${waitMs > 0 ? ` Следующий через <b>${waitRu(w)}</b>.` : ""}`
        : `\n🕒 Yechish — ${hours} soatda 1 marta.${waitMs > 0 ? ` Keyingisi <b>${waitUz(w)}</b> keyin.` : ""}`
      : "";
  const text =
    l === "ru"
      ? `💰 <b>Бонусный баланс:</b> ${formatSom(bal)} ${som}\n\n📤 Вывод — на ваш счёт LINEBET.\n❗️ Здесь можно вывести только <b>${formatSom(min)} ${som}</b>${rule}`
      : `💰 <b>Bonus balansingiz:</b> ${formatSom(bal)} ${som}\n\n📤 Yechib olish — LINEBET hisobingizga.\n❗️ Shu joyda faqat <b>${formatSom(min)} ${som}</b> yecha olasiz${rule}`;
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

// ---------- VIP level ----------
const LEVEL_MARK = ["🥉", "🥈", "🥇", "💎", "👑"];
const mark = (i: number) => LEVEL_MARK[Math.min(i, LEVEL_MARK.length - 1)] ?? "⭐️";

export async function vipScreen(l: L, s: Settings, userId: number): Promise<Screen> {
  const v = await vipStatus(userId, s);
  const som = l === "ru" ? "сум" : "so'm";
  if (!v.enabled) return { text: l === "ru" ? "👑 VIP-уровни скоро появятся." : "👑 VIP darajalar tez orada ishga tushadi." };
  const { pos } = v;
  const list = v.levels
    .map((lv, i) => `${i === pos.index ? "▶️" : mark(i)} ${escapeHtml(lv.name)} — ${l === "ru" ? `от ${formatSom(lv.from)} сум` : `${formatSom(lv.from)} so'mdan`} · <b>${lv.pct}%</b>`)
    .join("\n");
  const head =
    l === "ru"
      ? [
          pos.level ? `👑 <b>Ваш уровень: ${escapeHtml(pos.level.name)}</b>` : "👑 <b>У вас пока нет уровня</b>",
          pos.level ? `🎁 Кэшбэк: <b>${pos.level.pct}%</b> с каждого пополнения — на бонусный баланс` : "",
          `📊 Всего пополнено: <b>${formatSom(v.turnover)} ${som}</b>`,
          pos.next ? `⬆️ До уровня ${escapeHtml(pos.next.name)} (${pos.next.pct}%): ещё <b>${formatSom(pos.toNext)} ${som}</b>` : "🏁 У вас максимальный уровень!",
        ]
      : [
          pos.level ? `👑 <b>Darajangiz: ${escapeHtml(pos.level.name)}</b>` : "👑 <b>Hozircha darajangiz yo'q</b>",
          pos.level ? `🎁 Keshbek: har to'ldirishdan <b>${pos.level.pct}%</b> — bonus balansga` : "",
          `📊 Jami to'ldirgansiz: <b>${formatSom(v.turnover)} ${som}</b>`,
          pos.next ? `⬆️ ${escapeHtml(pos.next.name)} (${pos.next.pct}%) darajasigacha yana <b>${formatSom(pos.toNext)} ${som}</b>` : "🏁 Siz eng yuqori darajadasiz!",
        ];
  return { text: `${head.filter(Boolean).join("\n")}\n\n<b>${l === "ru" ? "Уровни" : "Darajalar"}:</b>\n${list}` };
}

// ---------- Weekly contest ----------
export async function contestScreen(l: L, s: Settings, userId: number): Promise<Screen> {
  const c = await myContest(userId, s);
  const ru = l === "ru";
  const som = ru ? "сум" : "so'm";
  if (!c.config.enabled) return { text: ru ? "🏆 Конкурс сейчас не проводится." : "🏆 Hozircha konkurs o'tkazilmayapti." };
  const medals = ["🥇", "🥈", "🥉"];
  const prizes = c.config.prizes.map((p, i) => `${medals[i] ?? `${i + 1}.`} ${formatSom(p)} ${som}`).join("\n");
  const ms = Math.max(0, c.week.end.getTime() - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3600_000);
  const chance = c.totalTickets && c.myTickets ? Math.max(1, Math.round((c.myTickets / c.totalTickets) * 100)) : 0;
  const last = c.last?.winners.length
    ? `\n\n${ru ? "🏅 Победители прошлой недели" : "🏅 O'tgan hafta g'oliblari"}:\n${c.last.winners.map((w) => `${medals[w.place - 1] ?? `${w.place}.`} ${escapeHtml(w.name)} — ${formatSom(w.prize)} ${som}`).join("\n")}`
    : "";
  const lines = ru
    ? [
        "🏆 <b>Недельный конкурс</b>",
        "",
        `Пополняйте счёт через бота: каждые <b>${formatSom(c.config.ticketSom)} ${som}</b> = 1 билет 🎟`,
        c.config.minSom > c.config.ticketSom ? `Участие — от ${formatSom(c.config.minSom)} ${som} за неделю.` : "",
        "",
        `<b>Призы:</b>\n${prizes}`,
        "",
        `💰 Вы пополнили за неделю: <b>${formatSom(c.mySum)} ${som}</b>`,
        `🎟 Ваши билеты: <b>${c.myTickets}</b> из ${c.totalTickets}${chance ? ` (~${chance}%)` : ""}`,
        `👥 Участников: ${c.entrants}`,
        c.closed ? "✅ Итоги этой недели уже подведены." : `⏳ Розыгрыш через <b>${d} д ${h} ч</b> (понедельник 00:00)`,
      ]
    : [
        "🏆 <b>Haftalik konkurs</b>",
        "",
        `Bot orqali hisob to'ldiring: har <b>${formatSom(c.config.ticketSom)} ${som}</b> = 1 chipta 🎟`,
        c.config.minSom > c.config.ticketSom ? `Qatnashish — haftasiga kamida ${formatSom(c.config.minSom)} ${som}.` : "",
        "",
        `<b>Sovrinlar:</b>\n${prizes}`,
        "",
        `💰 Shu hafta to'ldirganingiz: <b>${formatSom(c.mySum)} ${som}</b>`,
        `🎟 Chiptalaringiz: <b>${c.myTickets}</b> / ${c.totalTickets}${chance ? ` (~${chance}%)` : ""}`,
        `👥 Qatnashchilar: ${c.entrants}`,
        c.closed ? "✅ Bu hafta g'oliblar aniqlangan." : `⏳ G'oliblar <b>${d} kun ${h} soatdan</b> keyin aniqlanadi (dushanba 00:00)`,
      ];
  return { text: lines.filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n") + last };
}
