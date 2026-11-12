import { db } from "./db.server";
import { verifyInitData } from "./initdata.server";
import { upsertTgUser } from "./users.server";

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

export async function getActiveBookmaker(id: string) {
  const { data } = await db.from("bookmakers").select("*").eq("id", id).eq("is_active", true).maybeSingle();
  if (!data) throw new Error("bookmaker_not_found");
  return data;
}
