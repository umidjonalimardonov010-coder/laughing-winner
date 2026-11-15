// Bot auto-replies: admin-written answers to common questions.
// A free-text message gets the answer whose keywords match best.

export type AutoReply = {
  id: string;
  keywords: string;
  question_uz: string;
  answer_uz: string;
  question_ru: string;
  answer_ru: string;
  question_en: string;
  answer_en: string;
  sort_order: number;
  is_active: boolean;
};

export type ReplyLang = "uz" | "ru" | "en";

/** Lowercase, unify the different apostrophes used in Uzbek (o' / o‘ / oʻ), drop punctuation. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function keywordList(keywords: string): string[] {
  return keywords
    .split(/[,;\n]+/)
    .map((k) => normalizeText(k))
    .filter((k) => k.length >= 2);
}

/** The best matching active reply for a message, or null. Longer keyword hits win. */
export function matchReply<T extends Pick<AutoReply, "keywords" | "is_active" | "sort_order">>(text: string, replies: T[]): T | null {
  const msg = ` ${normalizeText(text)} `;
  if (msg.trim().length < 2) return null;
  let best: { r: T; score: number } | null = null;
  for (const r of replies) {
    if (!r.is_active) continue;
    let score = 0;
    for (const k of keywordList(r.keywords)) if (msg.includes(k)) score += k.length;
    if (score > 0 && (!best || score > best.score || (score === best.score && r.sort_order < best.r.sort_order)))
      best = { r, score };
  }
  return best?.r ?? null;
}

/** Question/answer in the user's language, falling back to Uzbek, then any filled language. */
export function replyText(r: AutoReply, lang: ReplyLang): { q: string; a: string } {
  const pick = (l: ReplyLang) => ({ q: r[`question_${l}`]?.trim() ?? "", a: r[`answer_${l}`]?.trim() ?? "" });
  for (const l of [lang, "uz", "ru", "en"] as ReplyLang[]) {
    const v = pick(l);
    if (v.q && v.a) return v;
  }
  return pick(lang);
}
