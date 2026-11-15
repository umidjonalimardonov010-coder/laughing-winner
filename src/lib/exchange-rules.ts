// Rules for the chat bot's exchange flow (deposit by card transfer, withdraw by bookmaker code).
// Pure functions only, so every rule is covered by tests.

/** Card number starts the bot accepts: UZCARD (8600, 5614, 6262) and HUMO (9860). */
export const UZ_CARD_PREFIXES = ["8600", "5614", "6262", "9860"] as const;

const digits = (raw: string) => raw.replace(/[\s-]/g, "");

/** "8600 1234 5678 9000" → "8600123456789000"; null unless it is a 16-digit UZCARD/HUMO number. */
export function parseUzCard(raw: string): string | null {
  const d = digits(raw.trim());
  if (!/^\d{16}$/.test(d)) return null;
  return UZ_CARD_PREFIXES.some((p) => d.startsWith(p)) ? d : null;
}

/** Bookmaker account ID: 5–15 digits. */
export function parseAccountId(raw: string): string | null {
  const d = digits(raw.trim());
  return /^\d{5,15}$/.test(d) ? d : null;
}

/** Bookmaker withdrawal code: exactly 4 letters/digits, kept as typed. */
export function parseWithdrawCode(raw: string): string | null {
  const c = raw.trim();
  return /^[A-Za-z0-9]{4}$/.test(c) ? c : null;
}

/** "50 000", "50000,00", "50.000" → 50000; null when it is not a whole amount. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/[.,]0{1,2}$/, "").replace(/[\s.,]/g, "");
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/**
 * The exact sum the user transfers to our card: the amount plus a 100–999 so'm tail that no other
 * open deposit uses, so the admin can match the incoming transfer to the request.
 */
export function pickPayAmount(amount: number, taken: Iterable<number>, rand: () => number = Math.random): number {
  const used = new Set(taken);
  for (let i = 0; i < 40; i++) {
    const tail = 100 + Math.floor(rand() * 900);
    if (!used.has(amount + tail)) return amount + tail;
  }
  for (let tail = 100; tail <= 999; tail++) if (!used.has(amount + tail)) return amount + tail;
  return amount + 100 + Math.floor(rand() * 900);
}

/** What lands on the bookmaker account for a transfer of `pay`: + bonus %, − fee % (rounded down). */
export function depositSplit(pay: number, bonusPercent: number, feePercent: number) {
  const bonus = bonusPercent > 0 ? Math.floor((pay * bonusPercent) / 100) : 0;
  const fee = feePercent > 0 ? Math.floor((pay * feePercent) / 100) : 0;
  return { bonus, fee, receive: Math.max(0, pay + bonus - fee) };
}

/** What the user gets on the card for a bookmaker payout of `summa` (− fee %, rounded down). */
export function withdrawSplit(summa: number, feePercent: number) {
  const fee = feePercent > 0 ? Math.floor((summa * feePercent) / 100) : 0;
  return { fee, send: Math.max(0, summa - fee) };
}
