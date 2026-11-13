// Bookmaker cashdesk API (1xBet-family "CashdeskBotAPI", used by LINEBET).
// Credentials come from the admin panel (Sozlamalar → Linebet API, stored server-side in
// app_settings) or from server environment variables (Railway → Variables):
//   LINEBET_CASHDESK_ID, LINEBET_CASHIER_PASS, LINEBET_HASH, optional LINEBET_API_URL, LINEBET_LNG.
// Panel values win over env. When neither is set the bookmaker stays in manual mode.
import { createHash } from "node:crypto";

const DEFAULT_API_URL = "https://partners.servcul.com/CashdeskBotAPI/";
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type CashdeskCreds = { apiUrl: string; cashdeskId: string; cashierPass: string; hash: string; lng: string };

/** Bookmakers that have an automatic cashdesk; key = bookmakers.id, value = env prefix. */
export const AUTO_BOOKMAKERS: Record<string, string> = { linebet: "LINEBET" };

/** Credential fields; env var = `<PREFIX>_<suffix>`, app_settings key = lowercase of that. */
export const CRED_SUFFIXES = ["CASHDESK_ID", "CASHIER_PASS", "HASH", "API_URL", "LNG"] as const;

/** Env overlaid with non-empty panel values (panel wins). Pure, unit-tested. */
export function mergeCredSources(
  env: Record<string, string | undefined>,
  panel: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...env };
  for (const [k, v] of Object.entries(panel)) if (v && v.trim()) out[k] = v;
  return out;
}

export function cashdeskCreds(bookmakerId: string, env: Record<string, string | undefined> = process.env): CashdeskCreds | null {
  const prefix = AUTO_BOOKMAKERS[bookmakerId];
  if (!prefix) return null;
  const cashdeskId = env[`${prefix}_CASHDESK_ID`]?.trim();
  const cashierPass = env[`${prefix}_CASHIER_PASS`]?.trim();
  const hash = env[`${prefix}_HASH`]?.trim();
  if (!cashdeskId || !cashierPass || !hash) return null;
  let apiUrl = env[`${prefix}_API_URL`]?.trim() || DEFAULT_API_URL;
  if (!apiUrl.endsWith("/")) apiUrl += "/";
  return { apiUrl, cashdeskId, cashierPass, hash, lng: env[`${prefix}_LNG`]?.trim() || "ru" };
}

// ---- Signatures (pure, unit-tested) ----
export const confirmFor = (userId: string, c: CashdeskCreds) => md5(`${userId}:${c.hash}`);

export function signFindUser(userId: string, c: CashdeskCreds) {
  return sha256(
    sha256(`hash=${c.hash}&userid=${userId}&cashdeskid=${c.cashdeskId}`) +
      md5(`userid=${userId}&cashierpass=${c.cashierPass}&hash=${c.hash}`),
  );
}
export function signDeposit(userId: string, summa: number, c: CashdeskCreds) {
  return sha256(
    sha256(`hash=${c.hash}&lng=${c.lng}&userid=${userId}`) +
      md5(`summa=${summa}&cashierpass=${c.cashierPass}&cashdeskid=${c.cashdeskId}`),
  );
}
export function signBalance(dt: string, c: CashdeskCreds) {
  return sha256(
    sha256(`hash=${c.hash}&cashierpass=${c.cashierPass}&dt=${dt}`) +
      md5(`dt=${dt}&cashierpass=${c.cashierPass}&cashdeskid=${c.cashdeskId}`),
  );
}
/** UTC time as the cashdesk API expects: yyyy.MM.dd HH:mm:ss */
export function cashdeskDt(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
export function signPayout(userId: string, code: string, c: CashdeskCreds) {
  return sha256(
    sha256(`hash=${c.hash}&lng=${c.lng}&userid=${userId}`) +
      md5(`code=${code}&cashierpass=${c.cashierPass}&cashdeskid=${c.cashdeskId}`),
  );
}

/** Money the player receives on the bookmaker side for a wallet debit of `amount`. */
export function depositSumma(amount: number, bonus: number, fee: number) {
  return Math.max(0, amount + bonus - fee);
}

// ---- HTTP ----
/** `ok` = API confirmed; `rejected` = API clearly said no (safe to refund);
 *  `unknown` = no clear answer (network/timeout/5xx) — money may have moved, an admin must check. */
export type CashdeskResult =
  | { kind: "ok"; summa: number; message: string }
  | { kind: "rejected"; message: string }
  | { kind: "unknown"; message: string };

type ApiBody = {
  Summa?: number | string;
  summa?: number | string;
  Success?: boolean;
  success?: boolean;
  Message?: string;
  message?: string;
  title?: string;
};

/** Plain-language reason for a failed cashdesk answer, shown in the admin panel. Pure, unit-tested. */
export function cashdeskErrorHint(status: number): string {
  if (status === 401) return "Kalitlar mos kelmadi: Kassa ID, kassir paroli yoki hash noto'g'ri.";
  if (status === 403) return "Linebet bu serverning IP manzilini ruxsat etmagan. Server IP manzilini Linebet menejeringizga yuborib, ruxsat so'rang.";
  if (status === 404) return "Kassa yoki manzil topilmadi: Kassa ID yoki API manzilini tekshiring.";
  if (status === 0) return "Linebet serveriga ulanib bo'lmadi (internet yoki API manzili).";
  if (status >= 500) return "Linebet serverida vaqtinchalik xato. Birozdan keyin qayta urinib ko'ring.";
  return "";
}

export function classifyResponse(status: number, body: ApiBody | null): CashdeskResult {
  const success = body?.Success ?? body?.success;
  const message = String(body?.Message ?? body?.message ?? body?.title ?? "").slice(0, 200);
  const summa = Math.abs(Number(body?.Summa ?? body?.summa ?? 0)) || 0;
  if (status >= 200 && status < 300 && success === true) return { kind: "ok", summa, message };
  if (status >= 200 && status < 500 && success === false) return { kind: "rejected", message: message || `HTTP ${status}` };
  if (status === 400 || status === 401 || status === 403 || status === 404) return { kind: "rejected", message: message || `HTTP ${status}` };
  return { kind: "unknown", message: message || `HTTP ${status}` };
}

async function call(c: CashdeskCreds, method: "GET" | "POST", path: string, sign: string, body?: unknown): Promise<{ status: number; json: ApiBody | null }> {
  const res = await fetch(c.apiUrl + path, {
    method,
    headers: { sign, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: ApiBody | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiBody) : null;
  } catch {
    json = null;
  }
  if (!res.ok) console.error(`[cashdesk] ${method} ${path} [${res.status}]: ${text.slice(0, 300)}`);
  return { status: res.status, json };
}

export async function cashdeskFindUser(c: CashdeskCreds, userId: string): Promise<{ found: boolean; name: string | null } | null> {
  try {
    const q = `Users/${encodeURIComponent(userId)}?confirm=${confirmFor(userId, c)}&cashdeskId=${encodeURIComponent(c.cashdeskId)}`;
    const r = await call(c, "GET", q, signFindUser(userId, c));
    if (r.status === 404) return { found: false, name: null };
    if (r.status < 200 || r.status >= 300 || !r.json) return null;
    const j = r.json as Record<string, unknown>;
    const id = j["UserId"] ?? j["userId"];
    if (!id || Number(id) === 0) return { found: false, name: null };
    const name = (j["Name"] ?? j["name"]) as string | undefined;
    return { found: true, name: name ? String(name).slice(0, 80) : null };
  } catch (e) {
    console.error("[cashdesk] find user failed", e);
    return null;
  }
}

export async function cashdeskDeposit(c: CashdeskCreds, userId: string, summa: number): Promise<CashdeskResult> {
  try {
    const r = await call(c, "POST", `Deposit/${encodeURIComponent(userId)}/Add`, signDeposit(userId, summa, c), {
      cashdeskId: Number(c.cashdeskId),
      lng: c.lng,
      summa,
      confirm: confirmFor(userId, c),
    });
    return classifyResponse(r.status, r.json);
  } catch (e) {
    return { kind: "unknown", message: e instanceof Error ? e.message.slice(0, 200) : "network" };
  }
}

export async function cashdeskPayout(c: CashdeskCreds, userId: string, code: string): Promise<CashdeskResult> {
  try {
    const r = await call(c, "POST", `Deposit/${encodeURIComponent(userId)}/Payout`, signPayout(userId, code, c), {
      cashdeskId: Number(c.cashdeskId),
      lng: c.lng,
      code,
      confirm: confirmFor(userId, c),
    });
    return classifyResponse(r.status, r.json);
  } catch (e) {
    return { kind: "unknown", message: e instanceof Error ? e.message.slice(0, 200) : "network" };
  }
}

export async function cashdeskBalance(
  c: CashdeskCreds,
): Promise<{ ok: true; balance: number; limit: number } | { ok: false; status: number; message: string; hint: string }> {
  try {
    const dt = cashdeskDt();
    const q = `Cashdesk/${encodeURIComponent(c.cashdeskId)}/Balance?confirm=${md5(`${c.cashdeskId}:${c.hash}`)}&dt=${encodeURIComponent(dt)}`;
    const r = await call(c, "GET", q, signBalance(dt, c));
    const j = (r.json ?? {}) as Record<string, unknown>;
    const bal = j["Balance"] ?? j["balance"];
    if (r.status >= 200 && r.status < 300 && bal !== undefined) {
      return { ok: true, balance: Number(bal) || 0, limit: Number(j["Limit"] ?? j["limit"] ?? 0) || 0 };
    }
    const message = String(j["Message"] ?? j["message"] ?? j["title"] ?? "").slice(0, 200);
    return { ok: false, status: r.status, message: `HTTP ${r.status}${message ? ` · ${message}` : ""}`, hint: cashdeskErrorHint(r.status) };
  } catch (e) {
    return { ok: false, status: 0, message: e instanceof Error ? e.message.slice(0, 200) : "network", hint: cashdeskErrorHint(0) };
  }
}

/** This server's public outbound IP — the address Linebet has to allow. */
export async function serverPublicIp(): Promise<string | null> {
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { ip?: string };
    return j.ip ?? null;
  } catch {
    return null;
  }
}

// ---- Safe connection check (read-only: balance + optional player lookup, never moves money) ----
export type CheckStepId = "keys" | "reach" | "ip" | "auth" | "player";
export type CheckStep = { id: CheckStepId; state: "ok" | "fail" | "skip"; note?: string };
export type CheckVerdict = { level: "ok" | "warn" | "error"; title: string; hint: string; steps: CheckStep[] };
type BalanceResult = Awaited<ReturnType<typeof cashdeskBalance>>;

const MISSING_LABEL: Record<string, string> = { CASHDESK_ID: "Kassa ID", CASHIER_PASS: "kassir paroli", HASH: "hash kaliti" };

/** Which of the three required credentials are empty. Pure. */
export function missingCreds(prefix: string, src: Record<string, string | undefined>): string[] {
  return (["CASHDESK_ID", "CASHIER_PASS", "HASH"] as const).filter((s) => !src[`${prefix}_${s}`]?.trim());
}

/** Turns a check into a plain-language verdict with a step list. Pure, unit-tested. */
export function cashdeskVerdict(input: {
  missing: string[];
  balance?: BalanceResult | undefined;
  player?: { found: boolean; name: string | null } | null | undefined;
}): CheckVerdict {
  const steps = (s: Partial<Record<CheckStepId, CheckStep["state"]>>, notes: Partial<Record<CheckStepId, string>> = {}): CheckStep[] =>
    (["keys", "reach", "ip", "auth", "player"] as const).map((id) => ({ id, state: s[id] ?? "skip", ...(notes[id] ? { note: notes[id] } : {}) }));

  if (input.missing.length) {
    const names = input.missing.map((m) => MISSING_LABEL[m] ?? m).join(", ");
    return { level: "error", title: "Kalitlar to'liq emas", hint: `Yetishmayapti: ${names}.`, steps: steps({ keys: "fail" }, { keys: names }) };
  }
  const b = input.balance;
  if (!b) return { level: "error", title: "Tekshirib bo'lmadi", hint: "", steps: steps({ keys: "ok" }) };
  if (b.ok) {
    const p = input.player;
    if (p === undefined)
      return { level: "ok", title: "Ulanish ishlayapti", hint: "Linebet kalitlarni qabul qildi. Avto to'ldirish va yechish tayyor.", steps: steps({ keys: "ok", reach: "ok", ip: "ok", auth: "ok" }) };
    if (p === null)
      return { level: "warn", title: "Kassa ulandi, o'yinchi tekshirilmadi", hint: "O'yinchi so'roviga javob kelmadi. Birozdan keyin qayta urinib ko'ring.", steps: steps({ keys: "ok", reach: "ok", ip: "ok", auth: "ok", player: "fail" }) };
    if (!p.found)
      return { level: "warn", title: "Kassa ulandi, o'yinchi topilmadi", hint: "Kalitlar to'g'ri. Kiritilgan o'yinchi ID Linebet'da topilmadi.", steps: steps({ keys: "ok", reach: "ok", ip: "ok", auth: "ok", player: "fail" }) };
    return { level: "ok", title: "Ulanish ishlayapti", hint: "Linebet kalitlarni qabul qildi va o'yinchi topildi.", steps: steps({ keys: "ok", reach: "ok", ip: "ok", auth: "ok", player: "ok" }, p.name ? { player: p.name } : {}) };
  }
  const hint = b.hint || b.message;
  if (b.status === 0) return { level: "error", title: "Linebet serveriga ulanib bo'lmadi", hint, steps: steps({ keys: "ok", reach: "fail" }) };
  if (b.status === 403) return { level: "error", title: "Server IP manziliga ruxsat yo'q", hint, steps: steps({ keys: "ok", reach: "ok", ip: "fail" }) };
  if (b.status === 401) return { level: "error", title: "Kalitlar mos kelmadi", hint, steps: steps({ keys: "ok", reach: "ok", ip: "ok", auth: "fail" }) };
  if (b.status === 404) return { level: "error", title: "Kassa topilmadi", hint, steps: steps({ keys: "ok", reach: "ok", ip: "ok", auth: "fail" }) };
  if (b.status >= 500) return { level: "warn", title: "Linebet serverida vaqtinchalik xato", hint, steps: steps({ keys: "ok", reach: "fail" }) };
  return { level: "error", title: `Kutilmagan javob (HTTP ${b.status})`, hint, steps: steps({ keys: "ok", reach: "ok", auth: "fail" }) };
}
