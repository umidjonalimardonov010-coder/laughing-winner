import { db } from "./db.server";

const DAY = 60 * 60 * 24;

export async function signedUrl(bucket: "media" | "receipts", path: string | null | undefined, seconds = DAY) {
  if (!path) return null;
  const { data } = await db.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

export async function signedUrls(bucket: "media" | "receipts", paths: string[], seconds = DAY) {
  const list = [...new Set(paths.filter(Boolean))];
  const map: Record<string, string> = {};
  if (!list.length) return map;
  const { data } = await db.storage.from(bucket).createSignedUrls(list, seconds);
  for (const item of data ?? []) if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  return map;
}

export async function signedUploadUrl(bucket: "media" | "receipts", path: string) {
  const { data, error } = await db.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(error?.message ?? "upload_failed");
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}
