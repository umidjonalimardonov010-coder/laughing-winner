import { createFileRoute } from "@tanstack/react-router";

// HamyonAPI calls this (prepare). Trusted only after the md5 signature made with our shop key matches.
export const Route = createFileRoute("/api/public/hamyon/prepare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readHamyonBody } = await import("@/lib/server/hamyon-route.server");
        return readHamyonBody(request);
      },
    },
  },
});
