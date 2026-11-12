import { createFileRoute } from "@tanstack/react-router";

// Serves one stored file (logo, video, receipt) through a short-lived signed link.
// Supports byte ranges so videos can start playing immediately.
export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { bucketOf, safeObjectPath, statMedia, verifyRead } = await import("@/lib/server/media.server");
        const { contentTypeFor } = await import("@/lib/server/media-types.server");
        const { createReadStream } = await import("node:fs");
        const { Readable } = await import("node:stream");

        const url = new URL(request.url);
        const prefix = "/api/public/media/";
        if (!url.pathname.startsWith(prefix)) return new Response("Not found", { status: 404 });
        const rest = decodeURIComponent(url.pathname.slice(prefix.length));
        const slash = rest.indexOf("/");
        if (slash < 0) return new Response("Not found", { status: 404 });
        const bucket = bucketOf(rest.slice(0, slash));
        const rel = safeObjectPath(rest.slice(slash + 1));
        if (!bucket || !rel) return new Response("Not found", { status: 404 });
        if (!verifyRead(bucket, rel, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
          return new Response("Forbidden", { status: 403 });
        }

        const info = await statMedia(bucket, rel);
        if (!info) return new Response("Not found", { status: 404 });

        const headers: Record<string, string> = {
          "content-type": contentTypeFor(rel),
          "accept-ranges": "bytes",
          "cache-control": "private, max-age=3600",
          "content-length": String(info.size),
        };
        const range = request.headers.get("range");
        const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
        if (m && (m[1] || m[2])) {
          const start = m[1] ? Number(m[1]) : Math.max(0, info.size - Number(m[2]));
          const end = m[1] && m[2] ? Math.min(Number(m[2]), info.size - 1) : info.size - 1;
          if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < info.size) {
            return new Response(Readable.toWeb(createReadStream(info.full, { start, end })) as ReadableStream, {
              status: 206,
              headers: {
                ...headers,
                "content-length": String(end - start + 1),
                "content-range": `bytes ${start}-${end}/${info.size}`,
              },
            });
          }
          return new Response(null, { status: 416, headers: { "content-range": `bytes */${info.size}` } });
        }
        if (request.method === "HEAD") return new Response(null, { status: 200, headers });
        return new Response(Readable.toWeb(createReadStream(info.full)) as ReadableStream, { status: 200, headers });
      },
    },
  },
});
