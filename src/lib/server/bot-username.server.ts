// The bot's @username, needed for invite links. Saved by "Botni ulash"; if that was never
// pressed, ask Telegram once (getMe) and remember it.
import { cleanBotUsername } from "@/lib/referral";
import { saveSettings, type Settings } from "./settings.server";
import { getBotInfo } from "./telegram.server";

export async function resolveBotUsername(s: Settings): Promise<string> {
  const saved = cleanBotUsername(s.bot_username);
  if (saved) return saved;
  if (!process.env["TELEGRAM_BOT_TOKEN"] && !process.env["TELEGRAM_API_KEY"]) return "";
  try {
    const name = cleanBotUsername((await getBotInfo()).username);
    if (name) await saveSettings({ bot_username: name });
    return name;
  } catch (e) {
    console.error("Could not read the bot username from Telegram", e);
    return "";
  }
}
