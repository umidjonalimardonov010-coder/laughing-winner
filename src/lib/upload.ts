// Uploads a file to a signed upload URL made by the server.
// The URL already points at whichever storage the server uses (Lovable Cloud or Railway's own),
// so the browser never needs its own storage address.
export async function uploadToSignedUrl(signedUrl: string, file: File) {
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "true" },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload_failed [${res.status}] ${text.slice(0, 200)}`);
  }
}
