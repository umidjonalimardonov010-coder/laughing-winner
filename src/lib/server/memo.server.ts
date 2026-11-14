// Tiny in-process cache for data every wallet open reads (settings, bookmaker list, videos).
// Keeps the database calm when many users open the bot at once; entries expire after a few seconds.
type Entry = { at: number; value: Promise<unknown> };
const store = new Map<string, Entry>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load().catch((e) => {
    store.delete(key);
    throw e;
  });
  store.set(key, { at: Date.now(), value });
  return value;
}

/** Forget cached entries (all, or those whose key starts with `prefix`). */
export function clearCache(prefix = "") {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
