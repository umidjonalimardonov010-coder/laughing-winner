import { sql } from "./db.server";

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
  const rows = await sql<{ key: string; value: string }[]>`select key, value from public.app_settings`;
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ""])) as Settings;
  for (const row of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(row.key)) out[row.key as SettingKey] = row.value;
  }
  return out;
}

export async function saveSettings(values: Partial<Settings>) {
  const rows = Object.entries(values)
    .filter(([k, v]) => (SETTING_KEYS as readonly string[]).includes(k) && typeof v === "string")
    .map(([key, value]) => ({ key, value: value as string }));
  if (!rows.length) return;
  await sql.begin(async (tx) => {
    for (const { key, value } of rows) {
      await tx`insert into public.app_settings (key, value, updated_at)
        values (${key}, ${value}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()`;
    }
  });
}

export function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== "" ? n : fallback;
}

/** The site's public https address, for links that Telegram opens or downloads. */
export function publicBase(s: Settings, fallback = ""): string {
  const railway = process.env["RAILWAY_PUBLIC_DOMAIN"];
  const base = s.public_url || process.env["PUBLIC_URL"] || (railway ? `https://${railway}` : "") || fallback;
  return base.replace(/\/$/, "");
}
