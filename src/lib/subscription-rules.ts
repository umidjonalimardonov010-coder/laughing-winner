// Mandatory channel subscription ("majburiy obuna"): pure rules for the admin's channel list.
// One channel per line: "@kanal", "https://t.me/kanal", or for a private channel "-1001234567890 https://t.me/+invite".

export type RequiredChannel = { chat: string; url: string };

export const MAX_REQUIRED_CHANNELS = 5;

const INVITE = /^(https?:\/\/)?(t\.me|telegram\.me)\/(\+|joinchat\/)[\w-]+\/?$/i;
const PUBLIC_LINK = /^(https?:\/\/)?(t\.me|telegram\.me)\/([a-z][\w]{3,})\/?$/i;
const USERNAME = /^@([a-z][\w]{3,})$/i;
const CHAT_ID = /^-100\d{5,}$/;

function withHttps(link: string): string {
  return /^https?:\/\//i.test(link) ? link.replace(/^http:/i, "https:") : `https://${link}`;
}

/** Parses the admin's list; lines that can't be checked by the bot come back as errors. */
export function parseRequiredChannels(text: string): { channels: RequiredChannel[]; errors: string[] } {
  const channels: RequiredChannel[] = [];
  const errors: string[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[\s,]+/).filter(Boolean);
    const id = parts.find((p) => CHAT_ID.test(p));
    const invite = parts.find((p) => INVITE.test(p));
    if (id) {
      if (!invite && parts.length === 1) {
        errors.push(`${line} — yopiq kanal uchun ID dan keyin taklif havolasini ham yozing (https://t.me/+...)`);
        continue;
      }
      const link = invite ?? parts.find((p) => PUBLIC_LINK.test(p) || USERNAME.test(p));
      if (!link) {
        errors.push(`${line} — havola noto'g'ri`);
        continue;
      }
      const user = USERNAME.exec(link);
      channels.push({ chat: id, url: user ? `https://t.me/${user[1]}` : withHttps(link) });
      continue;
    }
    if (invite) {
      errors.push(`${line} — yopiq kanal havolasidan bot kanalni topa olmaydi, oldiga kanal ID sini yozing: -100... ${invite}`);
      continue;
    }
    const first = parts[0] ?? "";
    const name = USERNAME.exec(first)?.[1] ?? PUBLIC_LINK.exec(first)?.[3];
    if (!name) {
      errors.push(`${line} — kanal @username, t.me/... havola yoki ID bo'lishi kerak`);
      continue;
    }
    channels.push({ chat: `@${name}`, url: `https://t.me/${name}` });
  }
  const unique = channels.filter((c, i) => channels.findIndex((o) => o.chat.toLowerCase() === c.chat.toLowerCase()) === i);
  if (unique.length > MAX_REQUIRED_CHANNELS) errors.push(`Ko'pi bilan ${MAX_REQUIRED_CHANNELS} ta kanal qo'shish mumkin`);
  return { channels: unique.slice(0, MAX_REQUIRED_CHANNELS), errors };
}

/** getChatMember result → is the person in the channel. */
export function isSubscribed(member: { status?: string; is_member?: boolean } | null | undefined): boolean {
  const st = member?.status;
  if (st === "creator" || st === "administrator" || st === "member") return true;
  return st === "restricted" && member?.is_member === true;
}

/** True when a channel (by id or @username) is one of the required ones. */
export function isRequiredChannel(list: RequiredChannel[], chat: { id: number; username?: string | null }): boolean {
  const uname = chat.username ? `@${chat.username}`.toLowerCase() : "";
  return list.some((c) => c.chat === String(chat.id) || (uname !== "" && c.chat.toLowerCase() === uname));
}
