// Invite link a user shares with friends. Pure, shared by the bot and the mini app.
export function cleanBotUsername(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
}

/** https://t.me/<bot>?start=<id>; empty string when the bot's name is still unknown. */
export function referralLink(bot: string | null | undefined, userId: number): string {
  const name = cleanBotUsername(bot);
  return name ? `https://t.me/${name}?start=${userId}` : "";
}

/** Telegram "share" screen with the invite link pre-filled. */
export function shareLink(link: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
}
