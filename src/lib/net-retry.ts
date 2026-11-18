// Network errors where the request never reached the other side (safe to send again, no double message
// or double payment). Railway sometimes times out while connecting to api.telegram.org.
const CONNECT_CODES = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
]);

function codesOf(e: unknown, depth = 0): string[] {
  if (!e || typeof e !== "object" || depth > 4) return [];
  const o = e as { code?: unknown; cause?: unknown; errors?: unknown };
  const own = typeof o.code === "string" ? [o.code] : [];
  const inner = Array.isArray(o.errors) ? o.errors.flatMap((x) => codesOf(x, depth + 1)) : [];
  return [...own, ...codesOf(o.cause, depth + 1), ...inner];
}

/** True when fetch failed before the request was sent (connect timeout, DNS, refused). */
export function isConnectError(e: unknown): boolean {
  return codesOf(e).some((c) => CONNECT_CODES.has(c));
}

/** fetch that tries again (up to `tries` times) only on connect errors. */
export async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (i >= tries || !isConnectError(e)) throw e;
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
}
