// The bot's profile in Telegram: "What can this bot do?" text, the menu button and commands.
import { tg } from "./telegram.server";

export function botDescription(brand: string, lang: "uz" | "ru") {
  const b = brand.trim() || "Kassa 24/7";
  return lang === "ru"
    ? [
        "🙋‍♂️ Здравствуйте! 💥",
        `📣 Добро пожаловать в бот ${b}.`,
        "🤖 Бот работает в автоматическом режиме",
        "📤 Вывод денег — АВТО",
        "📥 Пополнение счёта — АВТО",
        "⚡️ Быстро 24/7",
        "🧮 Комиссия — 0%",
        "🛡 Надёжная и удобная платёжная система 🔥",
      ].join("\n")
    : [
        "🙋‍♂️ Assalomu aleykum! 💥",
        `📣 ${b} botimizga hush kelibsiz.`,
        "🤖 Bot avtomatik rejimda ishlaydi",
        "📤 Pul chiqarish — AVTO",
        "📥 Hisob to'ldirish — AVTO",
        "⚡️ Tezkor 24/7",
        "🧮 Komissiya — 0%",
        "🛡 Ishonchli va qulay to'lov tizimi 🔥",
      ].join("\n");
}

/** Plain chat bot: no mini-app menu button, short command list, description in both languages. */
export async function applyBotProfile(brand: string) {
  await tg("setChatMenuButton", { menu_button: { type: "commands" } });
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Boshlash / Начать" },
      { command: "menu", description: "Bosh menyu / Главное меню" },
      { command: "lang", description: "Til / Язык" },
    ],
  });
  await tg("setMyDescription", { description: botDescription(brand, "uz") });
  await tg("setMyDescription", { description: botDescription(brand, "ru"), language_code: "ru" });
  await tg("setMyShortDescription", { short_description: `${brand.trim() || "Kassa 24/7"} — bukmeker hisobini to'ldirish va yechish 24/7` }).catch(() => undefined);
}
