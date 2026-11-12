// Telegram Bot API client.
// - If TELEGRAM_BOT_TOKEN is set (e.g. on Railway), calls api.telegram.org directly.
// - Otherwise uses the Lovable Telegram connector gateway (LOVABLE_API_KEY + TELEGRAM_API_KEY).
const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export function telegramMode(): "token" | "gateway" | "none" {
  if (process.env["TELEGRAM_BOT_TOKEN"]) return "token";
  if (process.env["LOVABLE_API_KEY"] && process.env["TELEGRAM_API_KEY"]) return "gateway";
  return "none";
}

export class TelegramError extends Error {
  constructor(
    public method: string,
    public status: number,
    public description: string,
  ) {
    super(`Telegram ${method} [${status}]: ${description}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tg<T = any>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const mode = telegramMode();
  let url: string;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mode === "token") {
    url = `https://api.telegram.org/bot${process.env["TELEGRAM_BOT_TOKEN"]}/${method}`;
  } else if (mode === "gateway") {
    url = `${GATEWAY_URL}/${method}`;
    headers["Authorization"] = `Bearer ${process.env["LOVABLE_API_KEY"]}`;
    headers["X-Connection-Api-Key"] = process.env["TELEGRAM_API_KEY"]!;
  } else {
    throw new TelegramError(method, 0, "Telegram bot is not connected");
  }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: { ok?: boolean; result?: T; description?: string } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!res.ok || !json?.ok) {
    console.error(`Telegram ${method} failed [${res.status}]: ${text}`);
    throw new TelegramError(method, res.status, json?.description ?? text.slice(0, 200));
  }
  return json.result as T;
}

let botInfoCache: { id: number; username: string; first_name: string } | null = null;
export async function getBotInfo() {
  if (!botInfoCache) botInfoCache = await tg("getMe");
  return botInfoCache!;
}

function base64url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token on every webhook call.
export async function webhookSecret(): Promise<string> {
  const base = process.env["TELEGRAM_BOT_TOKEN"] ?? process.env["TELEGRAM_API_KEY"] ?? "";
  if (!base) throw new Error("Telegram bot is not connected");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`telegram-webhook:${base}`),
  );
  return base64url(digest);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
