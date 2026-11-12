import { useSession } from "@tanstack/react-start/server";

type AdminSession = { admin?: boolean; at?: number };

function sessionConfig() {
  const password = process.env["SESSION_SECRET"];
  if (!password || password.length < 32) throw new Error("SESSION_SECRET is not configured");
  return {
    password,
    name: "kassa-admin",
    maxAge: 60 * 60 * 24 * 7,
    // "none" so the session also works inside the editor preview frame.
    cookie: { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" },
  };
}

export async function adminSession() {
  return useSession<AdminSession>(sessionConfig());
}

export async function isAdmin(): Promise<boolean> {
  try {
    const s = await adminSession();
    return s.data.admin === true;
  } catch {
    return false;
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("UNAUTHORIZED");
}

async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

export async function passwordMatches(input: string): Promise<boolean> {
  const expected = process.env["ADMIN_PASSWORD"];
  if (!expected) return false;
  const [a, b] = await Promise.all([sha256(input), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function adminConfigured() {
  return Boolean(process.env["ADMIN_PASSWORD"] && process.env["SESSION_SECRET"]);
}
