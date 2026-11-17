// Admin messages to bot users (everyone or one person) — pure rules, covered by tests.
// The admin writes Telegram HTML with the toolbar; the text is always repaired into HTML Telegram accepts.

export const ALLOWED_TAGS = ["b", "i", "u", "s", "code", "pre", "a", "blockquote", "tg-spoiler"] as const;
export type Tag = (typeof ALLOWED_TAGS)[number];

const ALIASES: Record<string, Tag> = { strong: "b", em: "i", ins: "u", strike: "s", del: "s" };

export type Token = { kind: "text"; text: string } | { kind: "open"; tag: Tag; href?: string } | { kind: "close"; tag: Tag };

/** Telegram limits: 4096 characters for a text message, 1024 for a photo/video caption. */
export const TEXT_LIMIT = 4096;
export const CAPTION_LIMIT = 1024;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d{1,6});/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Splits text into allowed tags and plain text; unknown or broken tags become plain text. */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re = /<(\/?)([a-zA-Z-]+)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (t: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev?.kind === "text") prev.text += t;
    else out.push({ kind: "text", text: t });
  };
  while ((m = re.exec(src))) {
    const raw = m[2]!.toLowerCase();
    const tag = (ALIASES[raw] ?? raw) as Tag;
    if (!(ALLOWED_TAGS as readonly string[]).includes(tag)) continue;
    pushText(decode(src.slice(last, m.index)));
    last = re.lastIndex;
    if (m[1]) {
      out.push({ kind: "close", tag });
      continue;
    }
    if (tag === "a") {
      const href = /href\s*=\s*"([^"]*)"/i.exec(m[3] ?? "")?.[1]?.trim() ?? "";
      if (!isSafeUrl(decode(href))) {
        last = m.index; // keep the broken link as text
        continue;
      }
      out.push({ kind: "open", tag, href: decode(href) });
    } else out.push({ kind: "open", tag });
  }
  pushText(decode(src.slice(last)));
  return out;
}

/** Balanced tokens: stray closing tags are dropped, unclosed tags are closed at the end. */
export function balance(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const stack: Tag[] = [];
  for (const t of tokens) {
    if (t.kind === "open") {
      stack.push(t.tag);
      out.push(t);
    } else if (t.kind === "close") {
      const at = stack.lastIndexOf(t.tag);
      if (at < 0) continue;
      while (stack.length > at) out.push({ kind: "close", tag: stack.pop()! });
    } else out.push(t);
  }
  while (stack.length) out.push({ kind: "close", tag: stack.pop()! });
  return out;
}

/** The text exactly as it is sent to Telegram (always valid HTML). */
export function toTelegramHtml(src: string): string {
  return balance(tokenize(src))
    .map((t) => {
      if (t.kind === "text") return esc(t.text);
      if (t.kind === "close") return `</${t.tag}>`;
      return t.tag === "a" ? `<a href="${esc(t.href ?? "").replace(/"/g, "&quot;")}">` : `<${t.tag}>`;
    })
    .join("");
}

/** Characters Telegram counts (tags don't count). */
export function visibleLength(src: string): number {
  return tokenize(src).reduce((n, t) => n + (t.kind === "text" ? [...t.text].length : 0), 0);
}

export function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/[^\s<>"]+|tg:\/\/[^\s<>"]+)$/i.test(url.trim()) && url.length <= 500;
}

export type MediaType = "photo" | "video";

export type Draft = { text: string; mediaType: MediaType | null; buttonText: string; buttonUrl: string };

/** null when the message can be sent, otherwise a reason for the admin (Uzbek). */
export function draftProblem(d: Draft): string | null {
  const len = visibleLength(d.text);
  const blank = tokenize(d.text).every((t) => t.kind !== "text" || !t.text.trim());
  if (!d.mediaType && blank) return "Xabar matnini yozing";
  const limit = d.mediaType ? CAPTION_LIMIT : TEXT_LIMIT;
  if (len > limit) return `Matn juda uzun: ${len} / ${limit} belgi`;
  const bt = d.buttonText.trim();
  const bu = d.buttonUrl.trim();
  if (bt || bu) {
    if (!bt) return "Tugma nomini yozing";
    if ([...bt].length > 64) return "Tugma nomi 64 belgidan oshmasin";
    if (!isSafeUrl(bu)) return "Tugma havolasi https:// bilan boshlansin";
  }
  return null;
}

export type SendOutcome = "sent" | "blocked" | "retry" | "failed";

/** How one Telegram error counts: the user blocked the bot / wait and retry / other failure. */
export function classifySendError(status: number, description: string): { outcome: SendOutcome; waitSec: number } {
  const d = description.toLowerCase();
  if (status === 429) {
    const n = Number(/retry after (\d+)/.exec(d)?.[1]);
    return { outcome: "retry", waitSec: Number.isFinite(n) && n > 0 ? Math.min(n, 60) : 3 };
  }
  if (status === 403 || d.includes("bot was blocked") || d.includes("user is deactivated") || d.includes("chat not found"))
    return { outcome: "blocked", waitSec: 0 };
  return { outcome: "failed", waitSec: 0 };
}

/** Share of the job that is finished, 0–100. */
export function progressPercent(total: number, done: number): number {
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
}
