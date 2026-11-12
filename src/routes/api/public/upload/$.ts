import { createFileRoute } from "@tanstack/react-router";

// Accepts a file PUT to a short-lived signed upload link made by the server.
// The link already proves who may write this exact path, so no session is needed here.
export const Route = createFileRoute("/api/public/upload/$")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const { BUCKET_LIMITS, bucketOf, safeObjectPath, verifyUpload, writeMedia } = await import(
          "@/lib/server/media.server"
        );

        const url = new URL(request.url);
        const prefix = "/api/public/upload/";
        if (!url.pathname.startsWith(prefix)) return new Response("Not found", { status: 404 });
        const rest = decodeURIComponent(url.pathname.slice(prefix.length));
        const slash = rest.indexOf("/");
        if (slash < 0) return new Response("Not found", { status: 404 });
        const bucket = bucketOf(rest.slice(0, slash));
        const rel = safeObjectPath(rest.slice(slash + 1));
        if (!bucket || !rel) return new Response("Not found", { status: 404 });
        if (!verifyUpload(bucket, rel, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
          return new Response("Forbidden", { status: 403 });
        }

        try {
          const { size } = await writeMedia(bucket, rel, request.body, BUCKET_LIMITS[bucket]);
          return Response.json({ ok: true, path: rel, size });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "too_large") return Response.json({ ok: false, error: "too_large" }, { status: 413 });
          console.error("upload failed", e);
          return Response.json({ ok: false, error: "upload_failed" }, { status: 400 });
        }
      },
    },
  },
});
