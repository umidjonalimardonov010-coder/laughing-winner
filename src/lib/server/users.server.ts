import { countOf, maybeOne, sql, ts } from "./db.server";

export type TgFrom = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
};

// One shape for every user read: big numbers arrive as JS numbers, dates as text.
export type TgUser = {
  id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  phone: string | null;
  lang: string;
  lang_chosen: boolean;
  balance: number;
  referrer_id: number | null;
  referral_earned: number;
  is_blocked: boolean;
  created_at: string;
  last_seen_at: string;
};

export const USER_COLS = () => sql`id::float8 as id, username, first_name, last_name, photo_url, phone, lang, lang_chosen,
  balance::float8 as balance, referrer_id::float8 as referrer_id, referral_earned::float8 as referral_earned,
  is_blocked, ${ts("created_at")} as created_at, ${ts("last_seen_at")} as last_seen_at`;

// Creates the user on first contact (with optional referrer), refreshes names afterwards.
// One statement: insert, or update the name fields when the user already exists.
export async function upsertTgUser(from: TgFrom, refId?: number | null) {
  const username = from.username ?? null;
  const firstName = from.first_name ?? null;
  const lastName = from.last_name ?? null;
  const photoUrl = from.photo_url ?? null;
  const lang = from.language_code === "ru" ? "ru" : "uz";

  let referrer_id: number | null = null;
  if (refId && refId !== from.id) {
    const ref = await maybeOne(sql<{ id: string }[]>`select id from public.tg_users where id = ${refId}`);
    if (ref) referrer_id = refId;
  }

  const rows = await sql<(TgUser & { inserted: boolean })[]>`
    insert into public.tg_users (id, username, first_name, last_name, photo_url, lang, referrer_id, last_seen_at)
    values (${from.id}, ${username}, ${firstName}, ${lastName}, ${photoUrl}, ${lang}, ${referrer_id}, now())
    on conflict (id) do update set
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      photo_url = coalesce(excluded.photo_url, public.tg_users.photo_url),
      last_seen_at = now()
    returning ${USER_COLS()}, (xmax = 0) as inserted`;

  const user = rows[0];
  if (!user) throw new Error("user_save_failed");
  return { user, isNew: user.inserted === true };
}

/** Saves the user's own verified phone number (from a Telegram contact). */
export async function savePhone(userId: number, phone: string) {
  await sql`update public.tg_users set phone = ${phone} where id = ${userId}`;
}

export async function countReferrals(userId: number) {
  return countOf(sql`select count(*)::float8 as n from public.tg_users where referrer_id = ${userId}`);
}

export async function listReferrals(userId: number) {
  return sql<{ id: number; username: string | null; first_name: string | null; created_at: string }[]>`
    select id::float8 as id, username, first_name, ${ts("created_at")} as created_at
    from public.tg_users
    where referrer_id = ${userId}
    order by created_at desc
    limit 100`;
}
