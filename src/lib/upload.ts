// Uploads a file to a signed upload URL made by the server.
// The URL already points at whichever storage the server uses, so the browser
// never needs its own storage address.
export async function uploadToSignedUrl(signedUrl: string, file: File) {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload_failed [${res.status}] ${text.slice(0, 200)}`);
  }
}
