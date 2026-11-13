// Who counts as an admin in Telegram. Pure helpers (no database), unit-tested.
// The list lives in the "admin_chat_id" setting (admin panel → Sozlamalar), comma separated.

/** The owner's Telegram account, added to the admin list once by a data step. */
export const OWNER_ADMIN_ID = 8787603995;

/** "123, 456 789" → [123, 456, 789]; ignores anything that is not a whole number. */
export function parseAdminIds(raw: string | null | undefined): number[] {
  return (raw ?? "")
    .split(/[,\s;]+/)
    .map((x) => x.trim())
    .filter((x) => /^-?\d{3,20}$/.test(x))
    .map(Number)
    .filter((n) => Number.isSafeInteger(n));
}

export function isAdminId(id: number | null | undefined, raw: string | null | undefined, extra = ""): boolean {
  if (!id) return false;
  return [...parseAdminIds(raw), ...parseAdminIds(extra)].includes(Number(id));
}

/** Adds the owner to a stored list without duplicating or dropping anyone already there. */
export function withOwnerAdmin(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (parseAdminIds(value).includes(OWNER_ADMIN_ID)) return value;
  return value ? `${value}, ${OWNER_ADMIN_ID}` : String(OWNER_ADMIN_ID);
}

/** Card number for wallet top-up: digits only, 16 of them. */
export function cleanCardNumber(raw: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 16 ? d : null;
}
