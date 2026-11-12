import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { webhookSecret, safeEqual, telegramMode } = await import("@/lib/server/telegram.server");
        if (telegramMode() === "none") return new Response("Bot not configured", { status: 503 });
        const expected = await webhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        let update: unknown;
        try {
          update = await request.json();
        } catch {
          return Response.json({ ok: true, ignored: true });
        }
        try {
          const { handleUpdate } = await import("@/lib/server/bot.server");
          await handleUpdate(update, new URL(request.url).origin);
        } catch (e) {
          // Always 200 so Telegram doesn't retry the same update forever.
          console.error("telegram update failed", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
