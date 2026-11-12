import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import marble from "@/assets/marble-bg.jpg";
import { translate, type Lang, type TKey } from "@/lib/i18n";
import { walletBootstrap, walletSetLang } from "@/lib/wallet.functions";
import { Ctx, type Bookmaker, type WalletCtx } from "./context";
import { loadTelegram, type TgWebApp } from "./telegram";
import { Help, History, Home, NavBar, NewTab, Profile, Services, Videos } from "./screens";
import { BookmakerSheet, CardWithdrawSheet, LangSheet, ReferralsSheet, TopupSheet, VideoModal } from "./sheets";

type Tab = "home" | "services" | "history" | "new";
type Page = "profile" | "help" | "videos" | null;
type Sheet = "topup" | "withdraw" | "refs" | "lang" | null;

function Splash({ brand }: { brand?: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 bg-[radial-gradient(circle_at_50%_45%,oklch(0.35_0.08_160),var(--background)_65%)]">
      <div className="flex size-32 items-center justify-center rounded-[2rem] bg-foreground font-display text-lg font-extrabold italic leading-tight text-background">
        <span className="px-3 text-center">{brand ?? "KASSA 24/7"}</span>
      </div>
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="animate-dot size-3 rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

export function WalletApp({ bk, mode }: { bk?: string | undefined; mode?: "deposit" | "withdraw" | undefined }) {
  const [tg, setTg] = useState<TgWebApp | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("home");
  const [page, setPage] = useState<Page>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [bkOpen, setBkOpen] = useState<{ bk: Bookmaker; mode: "deposit" | "withdraw" } | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [lang, setLangState] = useState<Lang>("uz");

  useEffect(() => {
    loadTelegram().then((w) => {
      if (w) {
        w.ready();
        w.expand();
        w.setHeaderColor?.("#173329");
        w.setBackgroundColor?.("#12241d");
        w.setBottomBarColor?.("#12241d");
        w.disableVerticalSwipes?.();
      }
      setTg(w);
    });
  }, []);

  const initData = tg?.initData ?? "";
  const q = useQuery({
    queryKey: ["wallet-boot", initData],
    queryFn: () => walletBootstrap({ data: { initData } }),
    enabled: tg !== undefined,
    retry: 1,
  });

  useEffect(() => {
    if (q.data) setLangState(q.data.user.lang);
  }, [q.data?.user.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link from the bot: /app?bk=1xbet&mode=deposit
  useEffect(() => {
    if (!q.data || !bk) return;
    const found = q.data.bookmakers.find((b) => b.id === bk);
    if (found) {
      setTab("services");
      setBkOpen({ bk: found, mode: mode ?? "deposit" });
    }
  }, [q.data?.user.id, bk]); // eslint-disable-line react-hooks/exhaustive-deps

  // Telegram back button for inner pages
  useEffect(() => {
    const bb = tg?.BackButton;
    if (!bb) return;
    const back = () => setPage((p) => (p === "help" || p === "videos" ? null : null));
    if (page) {
      bb.show();
      bb.onClick(back);
    } else bb.hide();
    return () => bb.offClick(back);
  }, [page, tg]);

  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const ctx: WalletCtx | null = useMemo(() => {
    if (!q.data) return null;
    return {
      initData,
      boot: q.data,
      lang,
      t,
      setLang: (l) => {
        setLangState(l);
        walletSetLang({ data: { initData, lang: l } }).catch(() => undefined);
      },
      refresh: () => q.refetch(),
      haptic: (kind = "light") => {
        const h = tg?.HapticFeedback;
        if (!h) return;
        if (kind === "light") h.impactOccurred("light");
        else h.notificationOccurred(kind);
      },
      openLink: (url) => {
        if (url.startsWith("https://t.me/") && tg?.openTelegramLink) tg.openTelegramLink(url);
        else if (tg?.openLink) tg.openLink(url);
        else window.open(url, "_blank", "noopener");
      },
    };
  }, [q.data, lang, t, initData, tg]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tg === undefined || q.isLoading) return <Splash />;

  if (q.isError || !ctx) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="font-display text-2xl font-bold">{translate(lang, "openInTelegram")}</div>
        <p className="text-muted-foreground">{translate(lang, "openInTelegramSub")}</p>
      </div>
    );
  }

  const goTab = (x: Tab) => {
    setPage(null);
    setTab(x);
    ctx.haptic();
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="relative min-h-dvh">
        <img
          src={marble}
          alt=""
          width={864}
          height={1536}
          className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="pointer-events-none fixed inset-0 -z-10 bg-background/25" />
        {ctx.boot.demo && (
          <div className="bg-gold/90 px-4 py-1.5 text-center text-xs font-medium text-gold-foreground">{t("demoBanner")}</div>
        )}
        <main className="mx-auto max-w-md px-4 pb-32 pt-5">
          {page === "profile" ? (
            <Profile onReferrals={() => setSheet("refs")} onLang={() => setSheet("lang")} onHelp={() => setPage("help")} />
          ) : page === "help" ? (
            <Help onBack={() => setPage(null)} />
          ) : page === "videos" ? (
            <Videos onBack={() => setPage(null)} onPlay={setVideo} />
          ) : tab === "home" ? (
            <Home
              onTopup={() => setSheet("topup")}
              onWithdraw={() => setSheet("withdraw")}
              onProfile={() => setPage("profile")}
              onVideos={() => setPage("videos")}
              onHelp={() => setPage("help")}
            />
          ) : tab === "services" ? (
            <Services onOpen={(b, m) => setBkOpen({ bk: b, mode: m })} />
          ) : tab === "history" ? (
            <History />
          ) : (
            <NewTab />
          )}
        </main>
        <NavBar tab={page ? "" : tab} setTab={goTab} />

        <BookmakerSheet bk={bkOpen?.bk ?? null} initialMode={bkOpen?.mode ?? "deposit"} onClose={() => setBkOpen(null)} />
        <TopupSheet open={sheet === "topup"} onClose={() => setSheet(null)} />
        <CardWithdrawSheet open={sheet === "withdraw"} onClose={() => setSheet(null)} />
        <ReferralsSheet open={sheet === "refs"} onClose={() => setSheet(null)} />
        <LangSheet open={sheet === "lang"} onClose={() => setSheet(null)} />
        <VideoModal slot={video} onClose={() => setVideo(null)} />
      </div>
    </Ctx.Provider>
  );
}
