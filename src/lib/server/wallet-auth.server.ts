import { maybeOne, sql, ts } from "./db.server";
import { verifyInitData } from "./initdata.server";
import { USER_COLS, upsertTgUser, type TgFrom, type TgUser } from "./users.server";

// A known user whose names are unchanged and who was seen recently needs no write.
const SEEN_REFRESH_MS = 10 * 60_000;
export function needsUserWrite(u: TgUser | null, from: TgFrom, now = Date.now()): boolean {
  if (!u) return true;
  if ((from.username ?? null) !== u.username) return true;
  if ((from.first_name ?? null) !== u.first_name) return true;
  if ((from.last_name ?? null) !== u.last_name) return true;
  if (from.photo_url && from.photo_url !== u.photo_url) return true;
  const seen = Date.parse(u.last_seen_at);
  return !Number.isFinite(seen) || now - seen > SEEN_REFRESH_MS;
}

export type Bookmaker = {
  id: string;
  name: string;
  logo_url: string | null;
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  deposit_fee_percent: number;
  withdraw_fee_percent: number;
  address: string;
  min_amount: number;
  max_amount: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export const BOOKMAKER_COLS = () => sql`id, name, logo_url, deposit_enabled, withdraw_enabled,
  deposit_fee_percent::float8 as deposit_fee_percent, withdraw_fee_percent::float8 as withdraw_fee_percent,
  address, min_amount::float8 as min_amount, max_amount::float8 as max_amount,
  sort_order::float8 as sort_order, is_active, ${ts("created_at")} as created_at`;

export async function walletAuth(initData: string) {
  const v = await verifyInitData(initData);
  const ref = v.startParam && /^\d+$/.test(v.startParam) ? Number(v.startParam) : null;
  // Read first: most wallet actions come from a known user, so skip the write (fewer locks at peak).
  const known = await maybeOne(sql<TgUser[]>`select ${USER_COLS()} from public.tg_users where id = ${v.user.id}`);
  const user = needsUserWrite(known, v.user) ? (await upsertTgUser(v.user, ref)).user : known!;
  if (user.is_blocked) throw new Error("BLOCKED");
  return { user, demo: v.demo };
}

export function friendlyError(e: unknown): never {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes("insufficient_balance")) throw new Error("insufficient");
  throw e instanceof Error ? e : new Error(m);
}

export async function getActiveBookmaker(id: string): Promise<Bookmaker> {
  const rows = await sql<Bookmaker[]>`select ${BOOKMAKER_COLS()} from public.bookmakers where id = ${id} and is_active`;
  const data = rows[0];
  if (!data) throw new Error("bookmaker_not_found");
  return data;
}
