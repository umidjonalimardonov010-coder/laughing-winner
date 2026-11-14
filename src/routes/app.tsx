import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WalletApp } from "@/components/wallet/WalletApp";

export const Route = createFileRoute("/app")({
  ssr: false,
  validateSearch: z.object({
    bk: z.string().max(40).optional(),
    mode: z.enum(["deposit", "withdraw"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "WALLET — Kassa 24/7" },
      { name: "description", content: "Hamyon: balans, bukmeker hisobini to'ldirish va yechish, tarix va referal dasturi." },
      { property: "og:title", content: "WALLET — Kassa 24/7" },
      { property: "og:description", content: "Bukmeker hisobini tez to'ldirish va yechish uchun Telegram hamyoni." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    // Start downloading Telegram's script together with the page so the wallet opens sooner.
    links: [
      { rel: "preconnect", href: "https://telegram.org" },
      { rel: "preload", as: "script", href: "https://telegram.org/js/telegram-web-app.js" },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const { bk, mode } = Route.useSearch();
  return <WalletApp bk={bk} mode={mode} />;
}
