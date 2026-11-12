import { db } from "./db.server";

export type TgFrom = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
};

// Creates the user on first contact (with optional referrer), refreshes names afterwards.
export async function upsertTgUser(from: TgFrom, refId?: number | null) {
  const { data: existing } = await db.from("tg_users").select("*").eq("id", from.id).maybeSingle();
  const patch = {
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    last_seen_at: new Date().toISOString(),
    ...(from.photo_url ? { photo_url: from.photo_url } : {}),
  };
  if (existing) {
    const { data, error } = await db.from("tg_users").update(patch).eq("id", from.id).select("*").single();
    if (error) throw new Error(error.message);
    return { user: data, isNew: false };
  }
  let referrer_id: number | null = null;
  if (refId && refId !== from.id) {
    const { data: ref } = await db.from("tg_users").select("id").eq("id", refId).maybeSingle();
    if (ref) referrer_id = ref.id;
  }
  const lang = from.language_code === "ru" ? "ru" : "uz";
  const { data, error } = await db
    .from("tg_users")
    .insert({ id: from.id, ...patch, referrer_id, lang })
    .select("*")
    .single();
  if (error) {
    // Race: another request created it first.
    const { data: again } = await db.from("tg_users").select("*").eq("id", from.id).single();
    if (again) return { user: again, isNew: false };
    throw new Error(error.message);
  }
  return { user: data, isNew: true };
}

export async function countReferrals(userId: number) {
  const { count } = await db
    .from("tg_users")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId);
  return count ?? 0;
}

export async function listReferrals(userId: number) {
  const { data } = await db
    .from("tg_users")
    .select("id,username,first_name,created_at")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}
