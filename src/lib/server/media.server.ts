// File storage on the app's own disk (a mounted folder, e.g. a Railway volume).
// Files are never world-readable: every link carries a short-lived signature.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export type Bucket = "media" | "receipts";

// Same limits the old storage buckets had: 200 MB for logos/videos, 10 MB for receipts.
export const BUCKET_LIMITS: Record<Bucket, number> = {
  media: 200 * 1024 * 1024,
  receipts: 10 * 1024 * 1024,
};

const DAY = 60 * 60 * 24;
const UPLOAD_TTL_SECONDS = 10 * 60;

function mediaRoot(): string {
  return process.env["MEDIA_DIR"] || "/data/media";
}

function signingSecret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not configured");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeSig(payload: string): string {
  return b64url(createHmac("sha256", signingSecret()).update(payload).digest());
}

function sigMatches(payload: string, sig: string): boolean {
  const a = Buffer.from(makeSig(payload));
  const b = Buffer.from(sig ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bucketOf(value: string | null | undefined): Bucket | null {
  return value === "media" || value === "receipts" ? value : null;
}

/** Only plain relative paths: no "..", no absolute paths, no query tricks. */
export function safeObjectPath(p: string | null | undefined): string | null {
  const raw = (p ?? "").trim().replace(/\\/g, "/");
  if (!raw || raw.length > 300) return null;
  if (raw.startsWith("/")) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(raw)) return null;
  const parts = raw.split("/").filter((x) => x !== "" && x !== ".");
  if (!parts.length || parts.some((x) => x === "..")) return null;
  return parts.join("/");
}

/** Absolute path of an object inside its bucket, or null when the path is not safe. */
export function filePath(bucket: Bucket, p: string): string | null {
  const rel = safeObjectPath(p);
  if (!rel) return null;
  const base = path.resolve(mediaRoot(), bucket);
  const full = path.resolve(base, rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function readPayload(bucket: Bucket, rel: string, exp: number) {
  return `read:${bucket}:${rel}:${exp}`;
}
function uploadPayload(bucket: Bucket, rel: string, exp: number) {
  return `upload:${bucket}:${rel}:${exp}`;
}

export type SignedLink = { exp: number; sig: string };

export function signRead(bucket: Bucket, rel: string, seconds: number): SignedLink {
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return { exp, sig: makeSig(readPayload(bucket, rel, exp)) };
}

export function signUpload(bucket: Bucket, rel: string, seconds = UPLOAD_TTL_SECONDS): SignedLink {
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return { exp, sig: makeSig(uploadPayload(bucket, rel, exp)) };
}

export function readUrl(bucket: Bucket, rel: string, link: SignedLink, base = ""): string {
  return `${base}/api/public/media/${bucket}/${rel}?exp=${link.exp}&sig=${link.sig}`;
}

export function uploadUrl(bucket: Bucket, rel: string, link: SignedLink): string {
  return `/api/public/upload/${bucket}/${rel}?exp=${link.exp}&sig=${link.sig}`;
}

/** True when the signature is valid and the link has not expired. */
export function verifyLink(payload: string, exp: string | number | null, sig: string | null): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < Date.now()) return false;
  if (!sig) return false;
  return sigMatches(payload, sig);
}

export function verifyRead(bucket: Bucket, rel: string, exp: string | null, sig: string | null): boolean {
  return verifyLink(readPayload(bucket, rel, Number(exp)), exp, sig);
}

export function verifyUpload(bucket: Bucket, rel: string, exp: string | null, sig: string | null): boolean {
  return verifyLink(uploadPayload(bucket, rel, Number(exp)), exp, sig);
}

// ---------- Public API used by the rest of the app ----------

/** A link that shows one file. Pass `base` (https://...) when a third party needs it. */
export async function signedUrl(
  bucket: Bucket,
  p: string | null | undefined,
  seconds = DAY,
  base = "",
): Promise<string | null> {
  const rel = safeObjectPath(p ?? "");
  if (!rel) return null;
  return readUrl(bucket, rel, signRead(bucket, rel, seconds), base);
}

/** Many links at once, keyed by object path. */
export async function signedUrls(
  bucket: Bucket,
  paths: string[],
  seconds = DAY,
  base = "",
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const raw of [...new Set(paths.filter(Boolean))]) {
    const rel = safeObjectPath(raw);
    if (!rel) continue;
    map[raw] = readUrl(bucket, rel, signRead(bucket, rel, seconds), base);
  }
  return map;
}

/** A one-shot link the browser PUTs a file to. */
export async function signedUploadUrl(bucket: Bucket, p: string) {
  const rel = safeObjectPath(p);
  if (!rel) throw new Error("invalid_path");
  const link = signUpload(bucket, rel);
  return { path: rel, token: "", signedUrl: uploadUrl(bucket, rel, link) };
}

export type MediaInfo = { full: string; size: number };

export async function statMedia(bucket: Bucket, p: string): Promise<MediaInfo | null> {
  const full = filePath(bucket, p);
  if (!full) return null;
  try {
    const s = await stat(full);
    return s.isFile() ? { full, size: s.size } : null;
  } catch {
    return null;
  }
}

export async function removeMedia(bucket: Bucket, p: string): Promise<void> {
  const full = filePath(bucket, p);
  if (!full) return;
  await unlink(full).catch(() => undefined);
}

/** Streams an uploaded request body to disk, refusing anything over the bucket limit. */
export async function writeMedia(
  bucket: Bucket,
  p: string,
  body: ReadableStream<Uint8Array> | null,
  maxBytes = BUCKET_LIMITS[bucket],
): Promise<{ size: number }> {
  const full = filePath(bucket, p);
  if (!full) throw new Error("invalid_path");
  if (!body) throw new Error("empty_body");
  await mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.${randomUUID().slice(0, 8)}.part`;
  let size = 0;
  const source = Readable.fromWeb(body as import("node:stream/web").ReadableStream);
  try {
    await new Promise<void>((resolve, reject) => {
      const out = createWriteStream(tmp);
      source.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          source.destroy();
          out.destroy();
          reject(new Error("too_large"));
        }
      });
      source.on("error", reject);
      out.on("error", reject);
      out.on("finish", () => resolve());
      source.pipe(out);
    });
    await rename(tmp, full);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
  return { size };
}

export { createReadStream };
