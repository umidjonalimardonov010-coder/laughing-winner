import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Gift,
  Globe,
  Headphones,
  Link2,
  MessageCircle,
  MonitorPlay,
  Phone,
  Play,
  Sparkles,
  User,
  Users,
  ExternalLink,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDateTime, formatSom, txDirection, type TxType } from "@/lib/format";
import { FAQ, LANGS } from "@/lib/i18n";
import { VIDEO_SLOTS } from "@/lib/videos";
import { walletHistory } from "@/lib/wallet.functions";
import { referralLink } from "@/lib/referral";
import { useWallet, type Bookmaker } from "./context";
import heroWallet from "@/assets/hero-wallet.webp";
import banner from "@/assets/linebet-banner.jpg";
import { BkLogo, BrandMark, Glass, IconTile, StickyHeader, Wordmark } from "./ui";


export function Home({
  onTopup,
  onWithdraw,
  onProfile,
  onVideos,
  onHelp,
}: {
  onTopup: () => void;
  onWithdraw: () => void;
  onProfile: () => void;
  onVideos: () => void;
  onHelp: () => void;
}) {
  const { boot, t, haptic } = useWallet();
  const { user, settings } = boot;
  const link = referralLink(settings.bot_username, user.id);
  const videoCount = boot.videoSlots.length;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 items-center gap-2 rounded-2xl border border-primary/30 bg-background/70 px-3 shadow-[var(--shadow-glow)] backdrop-blur">
          <BrandMark size={26} />
          <Wordmark className="text-lg" />
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div className="truncate font-display text-base font-bold">{user.first_name || user.username || "—"}</div>
          {user.username && <div className="truncate text-xs text-muted-foreground">@{user.username}</div>}
        </div>
        <button onClick={onProfile} className="btn-ghost-pro flex size-12 items-center justify-center rounded-2xl" aria-label="profile">
          <User className="size-5" />
        </button>
      </div>

      <div className="relative isolate overflow-hidden rounded-[2rem] border border-primary/30 p-6 shadow-[0_24px_60px_-20px_oklch(0.74_0.22_142/0.55)]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_100%_at_100%_0%,oklch(0.6_0.2_142/0.55),transparent_60%),linear-gradient(160deg,oklch(0.26_0.07_146),oklch(0.12_0.03_150))]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <img
          src={heroWallet}
          alt=""
          width={480}
          height={480}
          className="animate-hero pointer-events-none absolute -right-6 -top-4 size-40 object-contain drop-shadow-[0_12px_24px_oklch(0_0_0/0.5)]"
        />
        <div className="relative max-w-[60%]">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t("balance")}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="tabular font-display text-4xl font-black drop-shadow-[0_2px_8px_oklch(0_0_0/0.5)]">{formatSom(user.balance)}</span>
            <span className="text-lg font-semibold text-gold">{t("som")}</span>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-3">
          <button onClick={onTopup} className="btn-pro flex h-14 items-center justify-center gap-2 rounded-2xl font-bold">
            <ArrowUpRight className="size-5" strokeWidth={2.6} /> {t("topup")}
          </button>
          <button onClick={onWithdraw} className="btn-gold flex h-14 items-center justify-center gap-2 rounded-2xl font-bold">
            <ArrowDownLeft className="size-5" strokeWidth={2.6} /> {t("withdraw")}
          </button>
        </div>
      </div>

      <Glass onClick={onVideos} className="flex items-center gap-4 p-4">
        <IconTile>
          <Play className="size-6" />
        </IconTile>
        <div className="flex-1">
          <div className="font-semibold">{t("howItWorks")}</div>
          <div className="text-sm text-muted-foreground">{t("videosCount", { n: videoCount })}</div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Glass>

      <h2 className="pt-2 text-lg font-semibold">{t("referralProgram")}</h2>
      <Glass className="flex items-center gap-4 p-5">
        <IconTile>
          <Gift className="size-6" />
        </IconTile>
        <div>
          <div className="text-lg font-semibold">{t("inviteFriends")}</div>
          <div className="text-sm text-muted-foreground">{t("inviteSub", { p: settings.referral_percent })}</div>
        </div>
      </Glass>
      <div className="flex gap-3">
        <div className="glass flex h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl px-4 text-sm">
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{link ? link.replace(/^https:\/\//, "") : "…"}</span>
        </div>
        <button
          aria-label="copy"
          disabled={!link}
          onClick={() => {
            if (!link) return;
            navigator.clipboard?.writeText(link);
            haptic("success");
            toast.success(t("copied"));
          }}
          className="btn-pro flex size-14 shrink-0 items-center justify-center rounded-2xl"
        >
          <Copy className="size-5" />
        </button>
      </div>

      <Glass onClick={onHelp} className="flex items-center gap-4 p-4">
        <IconTile>
          <Headphones className="size-6" />
        </IconTile>
        <div className="flex-1">
          <div className="font-semibold">{t("help")}</div>
          <div className="text-sm text-muted-foreground">{t("helpSub")}</div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Glass>
    </div>
  );
}

export function Services({ onOpen }: { onOpen: (bk: Bookmaker, mode: "deposit" | "withdraw") => void }) {
  const { boot, t } = useWallet();
  return (
    <div className="space-y-4">
      <StickyHeader>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold">{t("services")}</h1>
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm text-muted-foreground">{boot.bookmakers.length}</span>
        </div>
      </StickyHeader>
      <Glass className="flex items-center gap-3 border-l-4 border-l-primary px-5 py-5">
        <Wallet className="size-5 text-muted-foreground" />
        <span className="flex-1 text-muted-foreground">{t("currentBalance")}</span>
        <span className="tabular font-display text-2xl font-bold">{formatSom(boot.user.balance)}</span>
        <span className="text-muted-foreground">{t("som")}</span>
      </Glass>
      {boot.bookmakers.map((bk) => (
        <div key={bk.id} className="relative isolate overflow-hidden rounded-[1.75rem] border border-primary/25 shadow-[0_20px_50px_-24px_oklch(0.74_0.22_142/0.6)]">
          <img src={banner} alt="" width={900} height={456} loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover object-right" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-background/10" />
          <button onClick={() => onOpen(bk, bk.deposit_enabled ? "deposit" : "withdraw")} className="flex w-full items-center gap-4 p-4 pb-3 text-left">
            <BkLogo bk={bk} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-xl font-black italic">{bk.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <span className="size-2 animate-pulse rounded-full bg-primary" /> 24/7 · ⚡ {t("deposit")} / {t("withdrawBk")}
              </div>
            </div>
            <ChevronRight className="size-5 text-muted-foreground" />
          </button>
          <div className="grid grid-cols-2 gap-2 px-4 pb-4">
            {bk.deposit_enabled && (
              <button onClick={() => onOpen(bk, "deposit")} className="btn-pro flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold">
                <ArrowUpRight className="size-4" strokeWidth={2.6} /> {t("deposit")}
              </button>
            )}
            {bk.withdraw_enabled && (
              <button onClick={() => onOpen(bk, "withdraw")} className="btn-gold flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold">
                <ArrowDownLeft className="size-4" strokeWidth={2.6} /> {t("withdrawBk")}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function History() {
  const { initData, t, boot } = useWallet();
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const q = useQuery({
    queryKey: ["wallet-history", boot.user.id],
    queryFn: () => walletHistory({ data: { initData } }),
  });
  const bkName = (id: string | null) => boot.bookmakers.find((b) => b.id === id)?.name ?? id ?? "";
  const rows = (q.data ?? []).filter((r) => filter === "all" || txDirection(r.type as TxType, r.amount) === filter);
  const chips = [
    { id: "all" as const, label: t("all"), icon: null, active: "btn-ghost-pro" },
    { id: "in" as const, label: t("incomes"), icon: <ArrowDownCircle className="size-5" />, active: "btn-pro" },
    { id: "out" as const, label: t("expenses"), icon: <ArrowUpCircle className="size-5" />, active: "btn-gold" },
  ];
  return (
    <div className="space-y-4">
      <StickyHeader>
        <h1 className="mb-3 font-display text-3xl font-bold">{t("navHistory")}</h1>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 rounded-full px-5 font-medium",
              filter === c.id ? c.active : "glass text-muted-foreground",
            )}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
        </div>
      </StickyHeader>
      {q.isLoading ? (
        <Glass className="h-40 animate-pulse">{null}</Glass>
      ) : rows.length === 0 ? (
        <Glass className="flex flex-col items-center gap-4 px-6 py-14">
          <FileText className="size-16 text-muted-foreground/60" strokeWidth={1.5} />
          <div className="text-lg text-muted-foreground">{t("noTx")}</div>
        </Glass>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const dir = txDirection(r.type as TxType, r.amount);
            const typeKey = `type_${r.type}` as const;
            return (
              <Glass key={r.id} className="flex items-center gap-3 p-4">
                <div
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    dir === "in" ? "bg-primary/15 text-primary" : "bg-gold/15 text-gold",
                  )}
                >
                  {dir === "in" ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t(typeKey, { bk: bkName(r.bookmaker_id) })}</div>
                  <div className="text-xs text-muted-foreground">
                    #{r.number} · {formatDateTime(r.created_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn("tabular font-semibold", dir === "in" ? "text-primary" : "text-gold")}>
                    {r.amount ? `${dir === "in" ? "+" : "−"}${formatSom(Math.abs(r.amount))}` : "—"}
                  </div>
                  <div
                    className={cn(
                      "text-xs",
                      r.status === "approved" ? "text-primary" : r.status === "rejected" ? "text-destructive" : "text-warning",
                    )}
                  >
                    {t(`status_${r.status}` as const)}
                  </div>
                </div>
              </Glass>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NewTab() {
  const { t } = useWallet();
  return (
    <div className="flex min-h-[60dvh] items-center">
      <Glass className="flex flex-col items-center gap-5 px-8 py-12 text-center">
        <div className="flex size-24 items-center justify-center rounded-3xl bg-secondary/70">
          <Sparkles className="size-12 text-primary/70" strokeWidth={1.5} />
        </div>
        <div className="font-display text-4xl font-bold">{t("soon")}</div>
        <div className="text-lg text-muted-foreground">{t("soonSub")}</div>
      </Glass>
    </div>
  );
}

function Row({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <Glass onClick={onClick} className="flex items-center gap-4 p-5">
      <IconTile>{icon}</IconTile>
      <div className="flex-1 text-center">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-muted-foreground">{sub}</div>
      </div>
      <ChevronRight className="size-5 text-muted-foreground" />
    </Glass>
  );
}

export function Profile({ onReferrals, onLang, onHelp }: { onReferrals: () => void; onLang: () => void; onHelp: () => void }) {
  const { boot, t, lang } = useWallet();
  const u = boot.user;
  const L = LANGS.find((l) => l.id === lang)!;
  return (
    <div className="space-y-4">
      <Glass className="flex items-center gap-4 p-5">
        <div className="relative">
          {u.photo_url ? (
            <img src={u.photo_url} alt="" className="size-20 rounded-full object-cover ring-4 ring-primary" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full bg-secondary font-display text-2xl font-bold ring-4 ring-primary">
              {(u.first_name || u.username || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-xl font-bold">{u.username ? `@${u.username}` : u.first_name}</div>
          <div className="mt-1 flex items-center gap-2 italic text-muted-foreground">
            <Phone className="size-4 text-primary" /> {u.phone || t("phoneNotLinked")}
          </div>
        </div>
      </Glass>
      <Row
        icon={<Users className="size-6" />}
        title={t("myReferrals")}
        sub={u.referrals ? t("referralsCount", { n: u.referrals }) : t("noReferrals")}
        onClick={onReferrals}
      />
      <Row icon={<Globe className="size-6" />} title={t("language")} sub={`${L.short} ${L.label}`} onClick={onLang} />
      <Row icon={<Headphones className="size-6" />} title={t("help")} sub={t("team")} onClick={onHelp} />
    </div>
  );
}

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <StickyHeader>
      <div className="relative flex h-12 items-center justify-center">
        <button onClick={onBack} aria-label="back" className="btn-ghost-pro absolute left-0 flex size-12 items-center justify-center rounded-2xl">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="font-display text-xl font-bold">{title}</h1>
      </div>
    </StickyHeader>
  );
}

export function Help({ onBack }: { onBack: () => void }) {
  const { boot, t, lang, openLink } = useWallet();
  const [open, setOpen] = useState<number | null>(null);
  const { support_username, channel_username } = boot.settings;
  return (
    <div className="space-y-5">
      <PageHeader title={t("helpTitle")} onBack={onBack} />
      <div className="flex flex-col items-center gap-4 text-center">
        <IconTile solid className="size-20 rounded-3xl">
          <Headphones className="size-10" />
        </IconTile>
        <p className="text-lg text-muted-foreground">{t("helpIntro")}</p>
      </div>
      {[
        { show: !!support_username, icon: <MessageCircle className="size-6" />, title: t("personalHelp"), sub: t("personalHelpSub"), user: support_username, btn: t("contact") },
        { show: !!channel_username, icon: <Users className="size-6" />, title: t("ourChannel"), sub: t("ourChannelSub"), user: channel_username, btn: t("join") },
      ]
        .filter((c) => c.show)
        .map((c) => (
          <Glass key={c.title} className="space-y-4 p-5">
            <div className="flex gap-4">
              <IconTile solid>{c.icon}</IconTile>
              <div>
                <div className="text-lg font-semibold">{c.title}</div>
                <div className="text-muted-foreground">{c.sub}</div>
                <div className="mt-2 font-mono text-sm text-primary">@{c.user}</div>
              </div>
            </div>
            <button
              onClick={() => openLink(`https://t.me/${c.user}`)}
              className="btn-pro flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold"
            >
              {c.btn} <ExternalLink className="size-5" />
            </button>
          </Glass>
        ))}
      <div className="pt-2">
        <h2 className="font-display text-2xl font-bold">{t("faq")}</h2>
        <p className="text-muted-foreground">{t("faqSub")}</p>
      </div>
      <div className="space-y-3">
        {FAQ[lang].map((f, i) => (
          <Glass key={i} onClick={() => setOpen(open === i ? null : i)} className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex-1 font-semibold">{f.q}</span>
              <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition", open === i && "rotate-180")} />
            </div>
            {open === i && <p className="mt-3 text-muted-foreground">{f.a}</p>}
          </Glass>
        ))}
      </div>
    </div>
  );
}

export function Videos({ onBack, onPlay }: { onBack: () => void; onPlay: (slot: string) => void }) {
  const { t, lang } = useWallet();
  const slots = VIDEO_SLOTS.filter((v) => v.group === "wallet");
  return (
    <div className="space-y-5">
      <PageHeader title={t("videoGuides")} onBack={onBack} />
      <div className="flex flex-col items-center gap-4 text-center">
        <IconTile solid className="size-24 rounded-3xl">
          <MonitorPlay className="size-12" />
        </IconTile>
        <p className="text-lg text-muted-foreground">{t("videoGuidesSub")}</p>
      </div>
      {slots.map((v, i) => (
        <Glass key={v.slot} onClick={() => onPlay(v.slot)} className="flex items-center gap-4 p-5">
          <IconTile solid className="size-16 rounded-2xl">
            <Play className="size-7" />
          </IconTile>
          <div className="min-w-0 flex-1">
            <span className="rounded-md bg-primary/15 px-2 py-0.5 text-sm font-semibold text-primary">{i + 1}</span>
            <div className="mt-1 text-lg font-semibold">{v.title[lang]}</div>
            <div className="text-muted-foreground">{v.description[lang]}</div>
          </div>
        </Glass>
      ))}
    </div>
  );
}

export function NavBar({ tab, setTab }: { tab: string; setTab: (t: "home" | "services" | "history" | "new") => void }) {
  const { t } = useWallet();
  const items = [
    { id: "home" as const, label: t("navHome"), icon: HomeIcon },
    { id: "services" as const, label: t("navServices"), icon: Wallet },
    { id: "history" as const, label: t("navHistory"), icon: ClockIcon },
    { id: "new" as const, label: t("navNew"), icon: Sparkles },
  ];
  return (
    <nav className="tg-safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-3">
      <div className="grid grid-cols-4 rounded-[1.75rem] border border-primary/20 bg-background/85 p-2 shadow-[0_-10px_40px_-12px_oklch(0.74_0.22_142/0.35)] backdrop-blur-xl">
        {items.map((it) => {
          const active = tab === it.id;
          const Icon = it.icon;
          return (
            <button key={it.id} onClick={() => setTab(it.id)} className="flex flex-col items-center gap-1 py-1">
              <span className={cn("flex h-11 w-14 items-center justify-center rounded-2xl transition", active && "btn-pro")}>
                <Icon className={cn("size-6", active ? "text-primary-foreground" : "text-muted-foreground")} />
              </span>
              <span className={cn("text-xs", active ? "font-semibold text-primary" : "text-muted-foreground")}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function ClockIcon(p: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={p.className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
