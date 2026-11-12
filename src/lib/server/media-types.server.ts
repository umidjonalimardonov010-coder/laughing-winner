// Content type of a stored file, decided by its extension.
const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  heic: "image/heic",
  pdf: "application/pdf",
};

export function contentTypeFor(p: string): string {
  const ext = (p.split(".").pop() ?? "").toLowerCase();
  return TYPES[ext] ?? "application/octet-stream";
}
