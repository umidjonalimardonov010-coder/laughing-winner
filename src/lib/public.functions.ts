// Public, non-private info for the landing page (no auth needed).
import { createServerFn } from "@tanstack/react-start";
import { getSettings } from "./server/settings.server";

export const publicInfo = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const s = await getSettings();
    return { bot_username: s.bot_username.replace(/^@/, "") || null };
  } catch {
    return { bot_username: null as string | null };
  }
});
