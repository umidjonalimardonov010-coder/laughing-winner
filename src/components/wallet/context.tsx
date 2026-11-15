import { createContext, useContext } from "react";
import type { Lang, TKey } from "@/lib/i18n";
import { parseLimitError } from "@/lib/money-rules";
import { formatSom } from "@/lib/format";
import type { walletBootstrap } from "@/lib/wallet.functions";

export type Boot = Awaited<ReturnType<typeof walletBootstrap>>;
export type Bookmaker = Boot["bookmakers"][number];

export type WalletCtx = {
  initData: string;
  boot: Boot;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  refresh: () => Promise<unknown>;
  haptic: (kind?: "light" | "success" | "error") => void;
  openLink: (url: string) => void;
  /** Opens Telegram's "share my phone number" prompt; null when this Telegram version has none. */
  requestContact: (() => Promise<boolean>) | null;
};

export const Ctx = createContext<WalletCtx | null>(null);

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside provider");
  return v;
}

export function errorText(t: WalletCtx["t"], e: unknown, vars?: Record<string, string | number>) {
  const m = e instanceof Error ? e.message : String(e);
  const limit = parseLimitError(m);
  if (limit) return t(limit.kind === "daily" ? "limitDaily" : "limitWeekly", { left: formatSom(limit.left) });
  const promo = m.match(/promo_(not_found|inactive|expired|used_up|already_used)/);
  if (promo) return t(`promo_${promo[1]}` as TKey);
  if (m.includes("BLOCKED")) return t("blockedTitle");
  if (m.includes("insufficient")) return t("insufficient");
  if (m.includes("bk_rejected")) return t("bkRejected");
  if (m.includes("invalid_amount")) return t("invalidAmount", vars);
  if (m.includes("phone_required")) return t("phoneRequired");
  if (m.includes("selfie_required")) return t("selfieRequired");
  return t("errorGeneric");
}
