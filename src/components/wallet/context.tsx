import { createContext, useContext } from "react";
import type { Lang, TKey } from "@/lib/i18n";
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
};

export const Ctx = createContext<WalletCtx | null>(null);

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside provider");
  return v;
}

export function errorText(t: WalletCtx["t"], e: unknown, vars?: Record<string, string | number>) {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes("insufficient")) return t("insufficient");
  if (m.includes("bk_rejected")) return t("bkRejected");
  if (m.includes("invalid_amount")) return t("invalidAmount", vars);
  return t("errorGeneric");
}
