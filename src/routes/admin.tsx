import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { adminLogin, adminLogout, adminStatus, adminTelegramLogin } from "@/lib/admin.functions";
import { loadTelegram } from "@/components/admin/telegram";
import { AdminIcon, type IconName } from "@/components/admin/shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin panel — Kassa 24/7" },
      { name: "description", content: "Kassa bot boshqaruv paneli: so'rovlar, hisobotlar, bukmekerlar, videolar va sozlamalar." },
      { property: "og:title", content: "Admin panel — Kassa 24/7" },
      { property: "og:description", content: "Kassa bot boshqaruv paneli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

type AdminPath = "/admin" | "/admin/requests" | "/admin/users" | "/admin/messages" | "/admin/bookmakers" | "/admin/promos" | "/admin/replies" | "/admin/videos" | "/admin/settings";

const NAV: readonly { to: AdminPath; label: string; icon: IconName; exact?: boolean }[] = [
  { to: "/admin", label: "Hisobot", icon: "chart", exact: true },
  { to: "/admin/requests", label: "So'rovlar", icon: "inbox" },
  { to: "/admin/users", label: "Foydalanuvchilar", icon: "users" },
  { to: "/admin/messages", label: "Xabar yuborish", icon: "megaphone" },
  { to: "/admin/bookmakers", label: "Bukmekerlar", icon: "stadium" },
  { to: "/admin/promos", label: "Promo-kodlar", icon: "ticket" },
  { to: "/admin/replies", label: "Avto-javoblar", icon: "chat" },
  { to: "/admin/videos", label: "Videolar", icon: "video" },
  { to: "/admin/settings", label: "Sozlamalar", icon: "gear" },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="lb-tile flex size-11 items-center justify-center rounded-xl">
        <AdminIcon name="trophy" className="size-8" />
      </div>
      <div>
        <div className="font-display text-lg font-black uppercase leading-none tracking-wide">
          Kassa <span className="text-primary">24/7</span>
        </div>
        <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">LINEBET kassa</div>
      </div>
    </div>
  );
}

function AdminLayout() {
  const status = useQuery({ queryKey: ["admin-status"], queryFn: () => adminStatus() });
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tg = useTelegramAdminLogin(status.isSuccess && !status.data?.loggedIn);

  if (status.isLoading || tg.trying)
    return (
      <div className="lb-admin flex min-h-dvh items-center justify-center">
        <div className="lb-admin-bg" />
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  if (!status.data?.loggedIn) return <Login configured={status.data?.configured ?? false} telegramNote={tg.note} />;

  return (
    <div className="lb-admin relative isolate min-h-dvh md:flex">
      <div className="lb-admin-bg" />
      <aside className="lb-sidebar sticky top-0 z-20 border-b md:flex md:h-dvh md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-6">
          <Brand />
          <button
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-sidebar-accent md:hidden"
            onClick={async () => {
              await adminLogout();
              qc.invalidateQueries({ queryKey: ["admin-status"] });
            }}
          >
            <LogOut className="size-4" /> Chiqish
          </button>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {NAV.map((n) => {
            const active = n.exact ? path === n.to || path === `${n.to}/` : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "lb-nav flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm font-semibold transition md:gap-3 md:py-2",
                  active ? "lb-nav-active" : "text-sidebar-foreground/85",
                )}
              >
                <AdminIcon name={n.icon} className="size-7 md:size-8" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <button
          className="m-3 hidden items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:bg-sidebar-accent md:flex"
          onClick={async () => {
            await adminLogout();
            qc.invalidateQueries({ queryKey: ["admin-status"] });
          }}
        >
          <LogOut className="size-5" /> Chiqish
        </button>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

// Opened from the bot inside Telegram: sign in with the Telegram account instead of a password.
function useTelegramAdminLogin(enabled: boolean) {
  const qc = useQueryClient();
  const [trying, setTrying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const inTelegram = window.location.hash.includes("tgWebAppData") || Boolean(window.Telegram?.WebApp?.initData);
    if (!inTelegram) return;
    let cancelled = false;
    setTrying(true);
    (async () => {
      try {
        const app = await loadTelegram();
        app?.ready();
        app?.expand();
        const initData = app?.initData ?? "";
        if (!initData) return;
        const r = await adminTelegramLogin({ data: { initData } });
        if (cancelled) return;
        if (r.ok) await qc.invalidateQueries({ queryKey: ["admin-status"] });
        else if (r.error === "not_admin") setNote(`Telegram ID ${r.id ?? ""} admin ro'yxatida yo'q. Parol bilan kiring.`);
      } catch {
        if (!cancelled) setNote("Telegram orqali kirib bo'lmadi. Parol bilan kiring.");
      } finally {
        if (!cancelled) setTrying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, qc]);
  return { trying, note };
}

function Login({ configured, telegramNote }: { configured: boolean; telegramNote?: string | null }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  return (
    <div className="lb-admin relative isolate flex min-h-dvh items-center justify-center p-4">
      <div className="lb-admin-bg" />
      <form
        className="lb-panel w-full max-w-sm space-y-5 rounded-3xl p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await adminLogin({ data: { password } });
            if (r.ok) await qc.invalidateQueries({ queryKey: ["admin-status"] });
            else toast.error(r.error === "not_configured" ? "Admin paroli hali o'rnatilmagan" : "Parol noto'g'ri");
          } catch {
            toast.error("Xatolik yuz berdi");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Brand />
        <div>
          <div className="font-display text-2xl font-black uppercase tracking-wide">Admin panel</div>
          <p className="mt-1 text-sm text-muted-foreground">Kassa botini boshqarish uchun parolni kiriting.</p>
        </div>
        {telegramNote && <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning">{telegramNote}</p>}
        {!configured && (
          <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning">Admin paroli hali o'rnatilmagan. Uni sozlamalarda qo'shish kerak.</p>
        )}
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Parol"
          aria-label="Parol"
          className="h-12 w-full rounded-xl border border-input bg-secondary px-4 outline-none focus:border-primary"
        />
        <button
          disabled={busy || !password}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : "Kirish"}
        </button>
      </form>
    </div>
  );
}
