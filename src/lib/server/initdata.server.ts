// Verifies Telegram Mini App initData so we know which Telegram user is calling.
import { getBotInfo } from "./telegram.server";

export type TgWebUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
};

const TG_PROD_PUBLIC_KEY = "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d";
const MAX_AGE_SECONDS = 60 * 60 * 24;

export const DEMO_USER: TgWebUser = { id: 100000001, first_name: "Demo", username: "demo_user" };

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmac(key: Uint8Array<ArrayBuffer>, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

export type VerifiedInit = { user: TgWebUser; startParam: string | null; demo: boolean };

export async function verifyInitData(raw: string): Promise<VerifiedInit> {
  if (!raw) {
    // Only the local preview (dev server) may open the wallet outside Telegram.
    if (import.meta.env.DEV) return { user: DEMO_USER, startParam: null, demo: true };
    throw new Error("UNAUTHORIZED");
  }
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  const signature = params.get("signature");
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) throw new Error("UNAUTHORIZED");

  const token = process.env["TELEGRAM_BOT_TOKEN"];
  let ok = false;
  if (token && hash) {
    const dcs = [...params.entries()]
      .filter(([k]) => k !== "hash")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = await hmac(new TextEncoder().encode("WebAppData"), token);
    const calc = bytesToHex(await hmac(new Uint8Array(secret), dcs));
    ok = calc === hash;
  } else if (signature) {
    const bot = await getBotInfo();
    const dcs =
      `${bot.id}:WebAppData\n` +
      [...params.entries()]
        .filter(([k]) => k !== "hash" && k !== "signature")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(TG_PROD_PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    ok = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      b64urlToBytes(signature),
      new TextEncoder().encode(dcs),
    );
  }
  if (!ok) throw new Error("UNAUTHORIZED");
  const userRaw = params.get("user");
  if (!userRaw) throw new Error("UNAUTHORIZED");
  const user = JSON.parse(userRaw) as TgWebUser;
  if (!user?.id) throw new Error("UNAUTHORIZED");
  return { user, startParam: params.get("start_param"), demo: false };
}
