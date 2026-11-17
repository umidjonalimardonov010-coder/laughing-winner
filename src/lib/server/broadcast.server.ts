// Admin messages from the panel: to everyone (a background job, ~25 messages a second, resumable)
// or to one person (sent at once). Every send is stored in public.broadcasts for the history list.
import { randomUUID } from "node:crypto";
import { maybeOne, sql, ts } from "./db.server";
import { signedUrl } from "./media.server";
import { TelegramError, tg } from "./telegram.server";
import { inBackground } from "./notify.server";
import { classifySendError, toTelegramHtml, type MediaType } from "@/lib/broadcast-rules";

export type Audience = "all" | "uz" | "ru";

export type Message = {
  text: string;
  mediaPath: string | null;
  mediaType: MediaType | null;
  buttonText: string;
  buttonUrl: string;
};

export type BroadcastRow = {
  id: string;
  kind: "all" | "one";
  audience: string;
  target_user_id: number | null;
  target_name: string | null;
  text: string;
  media_type: string | null;
  button_text: string | null;
  status: "running" | "done" | "failed" | "cancelled";
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

const COLS = () => sql`id, kind, audience, target_user_id::float8 as target_user_id,
  (select coalesce(nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''), u.username) from public.tg_users u where u.id = b.target_user_id) as target_name,
  text, media_type, button_text, status, total, sent, failed, blocked, error,
  ${ts("created_at")} as created_at, ${ts("finished_at")} as finished_at`;

const audienceCond = (a: string) => (a === "uz" || a === "ru" ? sql`and lang = ${a}` : sql``);

export async function audienceCounts(): Promise<Record<Audience, number>> {
  const r = await maybeOne(sql<{ all: number; uz: number; ru: number }[]>`
    select count(*)::float8 as all, count(*) filter (where lang = 'uz')::float8 as uz, count(*) filter (where lang = 'ru')::float8 as ru
    from public.tg_users where is_blocked = false`);
  return { all: r?.all ?? 0, uz: r?.uz ?? 0, ru: r?.ru ?? 0 };
}

export async function listBroadcasts(limit = 30): Promise<BroadcastRow[]> {
  return sql<BroadcastRow[]>`select ${COLS()} from public.broadcasts b order by created_at desc limit ${limit}`;
}

// ---------- One message ----------
type Prepared = { html: string; markup: unknown; media: { type: MediaType; ref: string } | null };

async function prepare(m: Message, base: string, fileId: string | null): Promise<Prepared> {
  const html = toTelegramHtml(m.text);
  const markup = m.buttonText.trim() && m.buttonUrl.trim() ? { inline_keyboard: [[{ text: m.buttonText.trim(), url: m.buttonUrl.trim() }]] } : undefined;
  let media: Prepared["media"] = null;
  if (m.mediaType && m.mediaPath) {
    const ref = fileId ?? (await signedUrl("media", m.mediaPath, 60 * 60 * 24, base));
    if (!ref) throw new Error("media_missing");
    media = { type: m.mediaType, ref };
  }
  return { html, markup, media };
}

/** Sends to one chat. Returns the Telegram file_id of the media so the next sends reuse it. */
async function deliver(chatId: number, p: Prepared): Promise<string | null> {
  const common = { chat_id: chatId, parse_mode: "HTML", ...(p.markup ? { reply_markup: p.markup } : {}) };
  if (p.media?.type === "photo") {
    const r = await tg<{ photo?: { file_id: string }[] }>("sendPhoto", { ...common, photo: p.media.ref, ...(p.html ? { caption: p.html } : {}) });
    return r.photo?.[r.photo.length - 1]?.file_id ?? null;
  }
  if (p.media?.type === "video") {
    const r = await tg<{ video?: { file_id: string } }>("sendVideo", { ...common, video: p.media.ref, supports_streaming: true, ...(p.html ? { caption: p.html } : {}) });
    return r.video?.file_id ?? null;
  }
  await tg("sendMessage", { ...common, text: p.html, link_preview_options: { is_disabled: true } });
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One send with a single wait-and-retry on Telegram's "too many requests". */
async function sendWithRetry(chatId: number, p: Prepared): Promise<{ outcome: "sent" | "blocked" | "failed"; fileId: string | null; error?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return { outcome: "sent", fileId: await deliver(chatId, p) };
    } catch (e) {
      const status = e instanceof TelegramError ? e.status : 0;
      const desc = e instanceof TelegramError ? e.description : e instanceof Error ? e.message : String(e);
      const c = classifySendError(status, desc);
      if (c.outcome === "retry") {
        await sleep(c.waitSec * 1000);
        continue;
      }
      return { outcome: c.outcome === "blocked" ? "blocked" : "failed", fileId: null, error: desc.slice(0, 300) };
    }
  }
  return { outcome: "failed", fileId: null, error: "Too many requests" };
}

/** Test send or a message to one person. `record` = keep it in the history list. */
export async function sendOne(userId: number, m: Message, base: string, record: boolean): Promise<{ ok: boolean; error?: string | undefined; blocked?: boolean }> {
  const p = await prepare(m, base, null);
  const r = await sendWithRetry(userId, p);
  if (record) {
    await sql`insert into public.broadcasts (kind, audience, target_user_id, text, media_path, media_type, file_id, button_text, button_url,
        status, total, sent, failed, blocked, error, finished_at)
      values ('one', 'one', ${userId}, ${m.text}, ${m.mediaPath}, ${m.mediaType}, ${r.fileId}, ${m.buttonText || null}, ${m.buttonUrl || null},
        ${r.outcome === "sent" ? "done" : "failed"}, 1, ${r.outcome === "sent" ? 1 : 0}, ${r.outcome === "failed" ? 1 : 0}, ${r.outcome === "blocked" ? 1 : 0},
        ${r.error ?? null}, now())`;
  }
  return r.outcome === "sent" ? { ok: true } : { ok: false, error: r.error, blocked: r.outcome === "blocked" };
}

// ---------- Everyone ----------
export async function startBroadcast(m: Message, audience: Audience, base: string): Promise<BroadcastRow> {
  const total = (await audienceCounts())[audience];
  if (!total) throw new Error("no_users");
  const rows = await sql<{ id: string }[]>`insert into public.broadcasts (kind, audience, text, media_path, media_type, button_text, button_url, media_base, status, total)
    values ('all', ${audience}, ${m.text}, ${m.mediaPath}, ${m.mediaType}, ${m.buttonText || null}, ${m.buttonUrl || null}, ${base}, 'running', ${total})
    returning id`;
  const id = rows[0]!.id;
  inBackground("broadcast", () => runBroadcast(id));
  const row = await maybeOne(sql<BroadcastRow[]>`select ${COLS()} from public.broadcasts b where id = ${id}`);
  return row!;
}

export async function cancelBroadcast(id: string) {
  await sql`update public.broadcasts set status = 'cancelled', finished_at = now() where id = ${id} and status = 'running'`;
}

const BATCH = 25;
const GAP_MS = 40; // ~25 messages a second, under Telegram's 30/s limit
const STALE = "45 seconds";

type JobRow = {
  id: string;
  audience: string;
  text: string;
  media_path: string | null;
  media_type: MediaType | null;
  file_id: string | null;
  button_text: string | null;
  button_url: string | null;
  media_base: string | null;
  cursor_id: number | null;
};

/** Runs (or resumes) one job. A lease (runner + heartbeat) keeps two servers from sending twice. */
export async function runBroadcast(id: string) {
  const runner = randomUUID();
  const job = await maybeOne(sql<JobRow[]>`update public.broadcasts set runner = ${runner}, heartbeat = now()
    where id = ${id} and status = 'running' and (heartbeat is null or heartbeat < now() - ${STALE}::interval)
    returning id, audience, text, media_path, media_type, file_id, button_text, button_url, media_base, cursor_id::float8 as cursor_id`);
  if (!job) return;
  const m: Message = {
    text: job.text,
    mediaPath: job.media_path,
    mediaType: job.media_type,
    buttonText: job.button_text ?? "",
    buttonUrl: job.button_url ?? "",
  };
  let fileId = job.file_id;
  let cursor = Number(job.cursor_id ?? 0);
  let p: Prepared;
  try {
    p = await prepare(m, job.media_base ?? "", fileId);
  } catch (e) {
    await sql`update public.broadcasts set status = 'failed', error = ${String(e instanceof Error ? e.message : e)}, finished_at = now() where id = ${id}`;
    return;
  }
  for (;;) {
    const users = await sql<{ id: number }[]>`select id::float8 as id from public.tg_users
      where is_blocked = false and id > ${cursor} ${audienceCond(job.audience)} order by id limit ${BATCH}`;
    if (!users.length) break;
    let sent = 0;
    let failed = 0;
    let blocked = 0;
    let lastError: string | null = null;
    for (const u of users) {
      const r = await sendWithRetry(u.id, p);
      if (r.outcome === "sent") {
        sent++;
        if (r.fileId && !fileId && p.media) {
          fileId = r.fileId;
          p = { ...p, media: { ...p.media, ref: fileId } };
          await sql`update public.broadcasts set file_id = ${fileId} where id = ${id}`;
        }
      } else if (r.outcome === "blocked") blocked++;
      else {
        failed++;
        lastError = r.error ?? lastError;
      }
      cursor = u.id;
      await sleep(GAP_MS);
    }
    // Counts are kept even when the job was stopped during this batch — those messages did go out.
    const still = await maybeOne(sql<{ status: string }[]>`update public.broadcasts
      set sent = sent + ${sent}, failed = failed + ${failed}, blocked = blocked + ${blocked}, cursor_id = ${cursor}, heartbeat = now(),
        error = coalesce(${lastError}, error)
      where id = ${id} and runner = ${runner} returning status`);
    if (still?.status !== "running") return; // cancelled, or another server took over
    // The whole first batch failed with the same problem (e.g. a broken file): stop instead of failing everyone.
    if (failed === users.length && cursor === users[users.length - 1]!.id && sent === 0 && blocked === 0) {
      const first = await maybeOne(sql<{ sent: number }[]>`select sent::float8 as sent from public.broadcasts where id = ${id}`);
      if (!first?.sent) {
        await sql`update public.broadcasts set status = 'failed', finished_at = now() where id = ${id} and runner = ${runner}`;
        return;
      }
    }
  }
  await sql`update public.broadcasts set status = 'done', finished_at = now() where id = ${id} and runner = ${runner} and status = 'running'`;
}

let lastResume = 0;
/** Picks up jobs whose server stopped mid-way (deploy, restart). Cheap; called from the panel and the bot. */
export function resumeBroadcasts() {
  if (Date.now() - lastResume < 20_000) return;
  lastResume = Date.now();
  inBackground("broadcast-resume", async () => {
    const stale = await sql<{ id: string }[]>`select id from public.broadcasts
      where status = 'running' and (heartbeat is null or heartbeat < now() - ${STALE}::interval) limit 3`;
    for (const j of stale) inBackground("broadcast", () => runBroadcast(j.id));
  });
}
