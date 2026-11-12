// Single place where the app talks to the database with full rights.
// Uses the app's own PostgreSQL database (Railway: DATABASE_URL reference variable).
// All callers must verify who is calling (Telegram signature or admin session) first.
import postgres from "postgres";

export type Sql = postgres.Sql;

let client: postgres.Sql | undefined;

function dbClient(): postgres.Sql {
  if (!client) {
    const url = process.env["DATABASE_URL"];
    if (!url) {
      const message = "DATABASE_URL is not configured. Add the database connection variable.";
      console.error(`[db] ${message}`);
      throw new Error(message);
    }
    client = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      // Railway talks to the database over its private network.
      ssl: /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return client;
}

// Tagged-template entry point: `await sql\`select ...\`` — created on first use so
// importing this module never fails during a build or a prerender.
export const sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_target, _thisArg, args) => (dbClient() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_target, prop) => (dbClient() as unknown as Record<string | symbol, unknown>)[prop],
}) as postgres.Sql;

export type Rows<T> = PromiseLike<T[]>;

/** A timestamp column as a plain ISO string (the browser expects text, not a Date object). */
export const ts = (col: string) =>
  sql`to_char(${sql(col)} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** First row or null. */
export async function maybeOne<T>(query: Rows<T>): Promise<T | null> {
  const rows = await query;
  return rows[0] ?? null;
}

/** First row, or throw when nothing matched. */
export async function oneOrThrow<T>(query: Rows<T>, message = "not_found"): Promise<T> {
  const rows = await query;
  if (!rows[0]) throw new Error(message);
  return rows[0];
}

/** Single number from a `select count(*) ...` style query. */
export async function countOf(query: Rows<{ n: number | string }>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.n ?? 0);
}

/** Close the pool (used by tests and shutdown). */
export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
  }
}
