// Linking the private selfie channel. Telegram invite links (t.me/+...) can't be turned into a chat id,
// so the bot learns the id itself: when an admin adds it to the channel, or forwards a channel post to it.

export type ChannelRef = { id: number; title: string };

/** Channel a forwarded message came from (Bot API 7+ forward_origin, or the older forward_from_chat). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function channelFromForward(msg: any): ChannelRef | null {
  const chat = msg?.forward_origin?.type === "channel" ? msg.forward_origin.chat : msg?.forward_from_chat;
  if (!chat || chat.type !== "channel" || typeof chat.id !== "number") return null;
  return { id: chat.id, title: String(chat.title ?? "") };
}

/** Channel/group where the bot was just made an administrator (my_chat_member update). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function channelFromBotPromotion(upd: any): ChannelRef | null {
  const chat = upd?.chat;
  if (!chat || typeof chat.id !== "number") return null;
  if (!["channel", "supergroup", "group"].includes(chat.type)) return null;
  if (upd?.new_chat_member?.status !== "administrator") return null;
  if (upd?.old_chat_member?.status === "administrator") return null;
  return { id: chat.id, title: String(chat.title ?? "") };
}

/** True for t.me invite links, which are not chat ids. */
export function isInviteLink(v: string): boolean {
  return /^(https?:\/\/)?(t\.me|telegram\.me)\/(\+|joinchat\/)/i.test(v.trim());
}
