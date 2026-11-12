import { db } from "./db.server";

export const SETTING_KEYS = [
  "brand_name",
  "card_number",
  "card_holder",
  "support_username",
  "channel_username",
  "admin_chat_id",
  "deposit_bonus_percent",
  "referral_percent",
  "min_topup",
  "max_topup",
  "min_card_withdraw",
  "max_card_withdraw",
  "public_url",
  "bot_username",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db.from("app_settings").select("key,value");
  if (error) throw new Error(error.message);
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ""])) as Settings;
  for (const row of data ?? []) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) out[row.key as SettingKey] = row.value;
  }
  return out;
}

export async function saveSettings(values: Partial<Settings>) {
  const rows = Object.entries(values)
    .filter(([k, v]) => (SETTING_KEYS as readonly string[]).includes(k) && typeof v === "string")
    .map(([key, value]) => ({ key, value: value as string, updated_at: new Date().toISOString() }));
  if (!rows.length) return;
  const { error } = await db.from("app_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== "" ? n : fallback;
}
