// Rules for who may move money: a saved own phone number, and a selfie for every withdrawal.

/** "+998 90 123-45-67" / "998901234567" → "+998901234567"; null when it can't be a phone number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 9 || d.length > 15) return null;
  return `+${d}`;
}

/** Only the sender's own contact counts — a forwarded contact of someone else is refused. */
export function isOwnContact(contact: { user_id?: number | null } | null | undefined, fromId: number): boolean {
  return !!contact && typeof contact.user_id === "number" && contact.user_id === fromId;
}

/** Deposits and withdrawals need a phone number (the local demo preview is exempt). */
export function assertPhone(user: { phone: string | null }, demo = false): void {
  if (!demo && !normalizePhone(user.phone)) throw new Error("phone_required");
}

/** A withdrawal selfie must be a photo this same user just uploaded. */
export function isOwnSelfiePath(path: string | null | undefined, userId: number): boolean {
  if (!path) return false;
  return new RegExp(`^${userId}/selfie-[0-9]+-[a-z0-9]{8}\\.jpg$`).test(path);
}

export function selfiePathFor(userId: number, now = Date.now(), rand = crypto.randomUUID().replace(/-/g, "").slice(0, 8)): string {
  return `${userId}/selfie-${now}-${rand}.jpg`;
}
