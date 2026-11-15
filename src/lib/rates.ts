// Rate lines the admin types in the panel ("1 LINEBET UZS = 1 UZS"), shown in the bot's «Kurs | Zahira». Pure.

/** One rate per line; blank lines dropped, at most 20 lines of 80 characters. */
export function rateLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
}

/** Default line for a bookmaker when the admin hasn't typed any rates: 1 to 1 in UZS. */
export const defaultRateLine = (bookmaker: string) => `1 ${bookmaker} UZS = 1 UZS`;
