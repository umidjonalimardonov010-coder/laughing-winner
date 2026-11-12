import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Building2, Film, Inbox, Loader2, LogOut, Settings, Users } from "lucide-react";
import { toast } from "sonner";
import { adminLogin, adminLogout, adminStatus } from "@/lib/admin.functions";
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

const NAV = [
  { to: "/admin", label: "Hisobot", icon: BarChart3, exact: true },
  { to: "/admin/requests", label: "So'rovlar", icon: Inbox },
  { to: "/admin/users", label: "Foydalanuvchilar", icon: Users },
  { to: "/admin/bookmakers", label: "Bukmekerlar", icon: Building2 },
  { to: "/admin/videos", label: "Videolar", icon: Film },
  { to: "/admin/settings", label: "Sozlamalar", icon: Settings },
] as const;

function AdminLayout() {
  const status = useQuery({ queryKey: ["admin-status"], queryFn: () => adminStatus() });
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (status.isLoading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  if (!status.data?.loggedIn) return <Login configured={status.data?.configured ?? false} />;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-4 md:py-6">
          <div>
            <div className="font-display text-lg font-bold">KASSA 24/7</div>
            <div className="text-xs text-muted-foreground">Boshqaruv paneli</div>
          </div>
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
            const active = "exact" in n && n.exact ? path === n.to || path === `${n.to}/` : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
                )}
              >
                <n.icon className="size-5" /> {n.label}
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

function Login({ configured }: { configured: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_50%_30%,oklch(0.32_0.07_160),var(--background)_60%)] p-4">
      <form
        className="w-full max-w-sm space-y-5 rounded-3xl border border-border bg-card p-8"
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
        <div>
          <div className="font-display text-2xl font-bold">Admin panel</div>
          <p className="mt-1 text-sm text-muted-foreground">Kassa botini boshqarish uchun parolni kiriting.</p>
        </div>
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
