// Mandatory channel subscription: the bot asks getChatMember for each channel from the admin panel.
// A channel the bot can't check (not admin there, deleted) is skipped so customers are never locked out by a setup mistake.
import { getBotInfo, tg, TelegramError } from "./telegram.server";
import { cached } from "./memo.server";
import type { Settings } from "./settings.server";
import { isSubscribed, parseRequiredChannels, type RequiredChannel } from "@/lib/subscription-rules";

export type MissingChannel = RequiredChannel & { title: string | null };

// Users who passed recently: checked again after a couple of minutes, not on every message.
const PASS_MS = 120_000;
const passed = new Map<number, { list: string; until: number }>();

export function requiredChannels(s: Settings): RequiredChannel[] {
  return parseRequiredChannels(s.required_channels ?? "").channels;
}

function channelTitle(chat: string): Promise<string | null> {
  return cached(`chtitle:${chat}`, 600_000, () => tg<{ title?: string }>("getChat", { chat_id: chat }).then((c) => c.title ?? null)).catch(
    () => null,
  );
}

/** Channels the user still has to join (empty = all good). */
export async function missingChannels(userId: number, s: Settings): Promise<MissingChannel[]> {
  const list = requiredChannels(s);
  if (!list.length) return [];
  const key = s.required_channels;
  const hit = passed.get(userId);
  if (hit && hit.list === key && hit.until > Date.now()) return [];
  const results = await Promise.all(
    list.map(async (ch) => {
      try {
        const m = await tg<{ status?: string; is_member?: boolean }>("getChatMember", { chat_id: ch.chat, user_id: userId });
        return isSubscribed(m) ? null : ch;
      } catch (e) {
        if (!(e instanceof TelegramError && /user not found|participant_id_invalid/i.test(e.description))) {
          console.error(`[subscription] can't check ${ch.chat}:`, e instanceof Error ? e.message : e);
          return null;
        }
        return ch;
      }
    }),
  );
  const miss = results.filter((c): c is RequiredChannel => c !== null);
  if (!miss.length) {
    passed.set(userId, { list: key, until: Date.now() + PASS_MS });
    if (passed.size > 50_000) passed.clear();
    return [];
  }
  passed.delete(userId);
  return Promise.all(miss.map(async (c) => ({ ...c, title: await channelTitle(c.chat) })));
}

/** Admin save: every channel must be readable, and the bot must be its admin (Telegram only lets admins see members). */
export async function verifyRequiredChannels(text: string): Promise<string> {
  const { channels, errors } = parseRequiredChannels(text);
  if (errors.length) throw new Error(`Majburiy obuna: ${errors[0]}`);
  if (!channels.length) return "";
  const bot = await getBotInfo().catch(() => null);
  if (!bot) throw new Error("Majburiy obuna: avval botni ulang (Sozlamalar → Telegram bot)");
  for (const ch of channels) {
    let status = "";
    try {
      status = (await tg<{ status?: string }>("getChatMember", { chat_id: ch.chat, user_id: bot.id })).status ?? "";
    } catch {
      throw new Error(`Majburiy obuna: ${ch.chat} kanali topilmadi yoki bot unga qo'shilmagan. Botni kanalga admin qiling.`);
    }
    if (status !== "administrator" && status !== "creator")
      throw new Error(`Majburiy obuna: bot ${ch.chat} kanalida admin emas. Botni kanalga admin qiling, keyin qayta saqlang.`);
  }
  return channels.map((c) => (c.chat.startsWith("@") ? c.chat : `${c.chat} ${c.url}`)).join("\n");
}
