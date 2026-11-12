import { sql, ts } from "./db.server";
import { verifyInitData } from "./initdata.server";
import { upsertTgUser } from "./users.server";

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
  const { user } = await upsertTgUser(v.user, ref);
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
