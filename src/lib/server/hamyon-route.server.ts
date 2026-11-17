// Shared body of /api/public/hamyon/prepare and /complete.
import { parseHamyonCallback } from "@/lib/hamyon-rules";
import { ensureMigrations } from "./migrations.server";
import { handleHamyonCallback } from "./hamyon.server";

export async function readHamyonBody(request: Request): Promise<Response> {
  let fields: Record<string, string> = {};
  try {
    const raw = await request.text();
    if ((request.headers.get("content-type") ?? "").includes("json")) {
      const j = JSON.parse(raw) as Record<string, unknown>;
      fields = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, String(v ?? "")]));
    } else {
      fields = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  const cb = parseHamyonCallback(fields);
  if (!cb) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    await ensureMigrations();
    const status = await handleHamyonCallback(cb);
    return Response.json(status === 200 ? { result: "ok" } : { error: status === 403 ? "imzo" : "not configured" }, { status });
  } catch (e) {
    console.error("[hamyon] callback failed", e);
    // Non-2xx makes HamyonAPI send it again (3, 10, 30, 60 s) — safe, payments are handled once.
    return Response.json({ error: "server" }, { status: 500 });
  }
}
