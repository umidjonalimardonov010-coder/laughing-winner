// Loads bookmaker cashdesk credentials: admin-panel values (app_settings) over env vars.
// Values never leave the server; the panel only learns whether each one is set.
import { sql } from "./db.server";
import { AUTO_BOOKMAKERS, CRED_SUFFIXES, cashdeskCreds, mergeCredSources, missingCreds, type CashdeskCreds } from "./cashdesk.server";

const settingKey = (prefix: string, suffix: string) => `${prefix}_${suffix}`.toLowerCase();

export async function panelCredValues(prefix: string): Promise<Record<string, string>> {
  const keys = CRED_SUFFIXES.map((s) => settingKey(prefix, s));
  const rows = await sql<{ key: string; value: string }[]>`select key, value from public.app_settings where key in ${sql(keys)}`;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key.toUpperCase()] = r.value;
  return out;
}

export async function loadCashdeskCreds(bookmakerId: string): Promise<CashdeskCreds | null> {
  return (await loadCashdeskDraft(bookmakerId, {})).creds;
}

/** Saved credentials with unsaved form values (`draft`, keyed by suffix) on top — used by the admin "check" button. */
export async function loadCashdeskDraft(
  bookmakerId: string,
  draft: Partial<Record<(typeof CRED_SUFFIXES)[number], string | undefined>>,
): Promise<{ creds: CashdeskCreds | null; missing: string[] }> {
  const prefix = AUTO_BOOKMAKERS[bookmakerId];
  if (!prefix) return { creds: null, missing: ["CASHDESK_ID", "CASHIER_PASS", "HASH"] };
  let panel: Record<string, string> = {};
  try {
    panel = await panelCredValues(prefix);
  } catch (e) {
    console.error("[cashdesk] reading panel credentials failed", e);
  }
  const overlay: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(draft)) overlay[`${prefix}_${k}`] = v;
  const src = mergeCredSources(mergeCredSources(process.env, panel), overlay);
  return { creds: cashdeskCreds(bookmakerId, src), missing: missingCreds(prefix, src) };
}

/** Saves panel values; `undefined` keeps the stored value, "" clears it. */
export async function savePanelCreds(prefix: string, values: Partial<Record<(typeof CRED_SUFFIXES)[number], string | undefined>>) {
  await sql.begin(async (tx) => {
    for (const [suffix, value] of Object.entries(values)) {
      if (value === undefined) continue;
      await tx`insert into public.app_settings (key, value, updated_at)
        values (${settingKey(prefix, suffix)}, ${value.trim()}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()`;
    }
  });
}
