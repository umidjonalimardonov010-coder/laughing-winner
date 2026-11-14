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
        const { handleUpdate } = await import("@/lib/server/bot.server");
        // Always 200 so Telegram doesn't retry the same update forever.
        const work = handleUpdate(update, new URL(request.url).origin).catch((e) => console.error("telegram update failed", e));
        // Answer Telegram within a few seconds even when a reply is slow (videos, photos), so the next
        // messages aren't held in Telegram's queue; the slow part finishes on its own (Railway runs Node).
        await Promise.race([work, new Promise((r) => setTimeout(r, 4000))]);
        return Response.json({ ok: true });
      },
    },
  },
});
