import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, Wallet } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminDashboard, adminResetBalances, adminResetStats } from "@/lib/admin.functions";
import { formatSom } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errMsg, PageTitle, Panel, TYPE_LABEL } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

const RANGES = [
  { d: 1, l: "Bugun" },
  { d: 7, l: "7 kun" },
  { d: 30, l: "30 kun" },
  { d: 90, l: "90 kun" },
];

function Dashboard() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["admin-dash", days], queryFn: () => adminDashboard({ data: { days } }) });
  const d = q.data;
  const sum = (k: string) => d?.byType[k]?.sum ?? 0;
  const cnt = (k: string) => d?.byType[k]?.count ?? 0;
  const kirim = sum("wallet_topup") + sum("bk_withdraw");
  const chiqim = sum("card_withdraw") + sum("bk_deposit");

  return (
    <div>
      <PageTitle
        icon="chart" title="Hisobot"
        sub="Kirim-chiqim va asosiy ko'rsatkichlar (faqat bajarilgan amallar)"
        right={
          <div className="flex rounded-xl border border-border bg-card p-1">
            {RANGES.map((r) => (
              <button
                key={r.d}
                onClick={() => setDays(r.d)}
                className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", days === r.d ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {r.l}
              </button>
            ))}
          </div>
        }
      />
      <ResetBar statsSince={d?.statsSince ?? null} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Kirim" value={`${formatSom(kirim)} so'm`} tone="in" />
        <Stat label="Chiqim" value={`${formatSom(chiqim)} so'm`} tone="out" />
        <Link to="/admin/requests" className="block">
          <Stat label="Kutilayotgan so'rovlar" value={String(d?.pending ?? 0)} tone={d?.pending ? "warn" : undefined} />
        </Link>
        <Stat label="Foydalanuvchilar" value={`${d?.users ?? 0}`} sub={`+${d?.newUsers ?? 0} yangi · ${d?.blocked ?? 0} bloklangan`} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="So'rovlar soni (davrda)" value={String(d?.requestCount ?? 0)} sub={days > 1 ? `kuniga o'rtacha ${Math.round((d?.requestCount ?? 0) / days)}` : undefined} />
        <Stat
          label="O'rtacha summa"
          value={`${formatSom(cnt("wallet_topup") + cnt("card_withdraw") + cnt("bk_deposit") + cnt("bk_withdraw") ? Math.round((kirim + chiqim) / (cnt("wallet_topup") + cnt("card_withdraw") + cnt("bk_deposit") + cnt("bk_withdraw"))) : 0)} so'm`}
        />
        <Link to="/admin/requests" className="block">
          <Stat label="Shubhali, kutilmoqda" value={String(d?.flagged ?? 0)} tone={d?.flagged ? "warn" : undefined} />
        </Link>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <div className="mb-4 font-semibold">Kunlik kirim-chiqim</div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={d?.series ?? []}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v: number) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : String(v))} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }}
                  formatter={(v: number) => `${formatSom(v)} so'm`}
                />
                <Legend />
                <Bar dataKey="kirim" name="Kirim" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="chiqim" name="Chiqim" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <div className="mb-4 font-semibold">Amallar bo'yicha</div>
          <ul className="space-y-3">
            {["wallet_topup", "card_withdraw", "bk_deposit", "bk_withdraw", "referral_bonus"].map((k) => (
              <li key={k} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{TYPE_LABEL[k]}</span>
                <span className="text-right">
                  <span className="tabular font-semibold">{formatSom(sum(k))}</span>
                  <span className="ml-2 text-muted-foreground">({cnt(k)})</span>
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted-foreground">Barcha hamyonlardagi qoldiq</span>
              <span className="tabular font-semibold">{formatSom(d?.totalBalance ?? 0)}</span>
            </li>
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel>
          <div className="mb-4 font-semibold">Kunlik so'rovlar soni</div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={d?.series ?? []}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Line type="monotone" dataKey="soni" name="So'rovlar" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <div className="mb-4 font-semibold">Eng faol foydalanuvchilar</div>
          <ol className="space-y-2 text-sm">
            {(d?.topUsers ?? []).map((u, i) => (
              <li key={u.user_id} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {u.first_name ?? "—"} {u.username ? <span className="text-muted-foreground">@{u.username}</span> : null}
                  {u.is_blocked && <span className="ml-1 rounded bg-destructive/15 px-1.5 text-xs text-destructive">bloklangan</span>}
                </span>
                <span className="text-muted-foreground">{u.count} ta</span>
                <span className="tabular w-28 text-right font-semibold">{formatSom(u.sum)}</span>
              </li>
            ))}
            {!d?.topUsers?.length && <li className="py-6 text-center text-muted-foreground">Bu davrda bajarilgan amallar yo'q</li>}
          </ol>
        </Panel>
      </div>

      <Panel className="mt-4">
        <div className="mb-4 font-semibold">Bukmekerlar bo'yicha</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2">Bukmeker</th>
                <th className="py-2 text-right">To'ldirildi</th>
                <th className="py-2 text-right">Chiqarildi</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(d?.byBk ?? {}).map(([id, v]) => (
                <tr key={id} className="border-t border-border">
                  <td className="py-2 uppercase">{id}</td>
                  <td className="tabular py-2 text-right">{formatSom(v.deposit)}</td>
                  <td className="tabular py-2 text-right">{formatSom(v.withdraw)}</td>
                </tr>
              ))}
              {!Object.keys(d?.byBk ?? {}).length && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">
                    Bu davrda bukmeker amallari yo'q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function ResetBar({ statsSince }: { statsSince: string | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"" | "stats" | "bal">("");
  const run = async (kind: "stats" | "bal") => {
    const ask =
      kind === "stats"
        ? "Hisobot 0 dan boshlansinmi? So'rovlar va tarix o'chmaydi, faqat hisobot shu daqiqadan hisoblanadi."
        : "Barcha mijozlarning bonus balansi 0 qilinsinmi? Buni ortga qaytarib bo'lmaydi.";
    if (!confirm(ask)) return;
    setBusy(kind);
    try {
      if (kind === "stats") {
        await adminResetStats();
        toast.success("Hisobot 0 qilindi");
      } else {
        const r = await adminResetBalances();
        toast.success(r.users ? `${r.users} ta mijozning balansi 0 qilindi (${formatSom(r.sum)} so'm)` : "Hamma balanslar allaqachon 0");
      }
      await qc.invalidateQueries({ queryKey: ["admin-dash"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <Panel className="mb-4 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 text-sm text-muted-foreground">
        {statsSince ? `Hisobot ${new Date(statsSince).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })} dan hisoblanmoqda` : "Hisobot boshidan hisoblanmoqda"}
      </div>
      <button
        onClick={() => run("stats")}
        disabled={!!busy}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-4 text-sm font-semibold disabled:opacity-60"
      >
        {busy === "stats" ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        Statistikani 0 qilish
      </button>
      <button
        onClick={() => run("bal")}
        disabled={!!busy}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 text-sm font-semibold text-destructive disabled:opacity-60"
      >
        {busy === "bal" ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
        Balanslarni 0 qilish
      </button>
    </Panel>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string | undefined; tone?: "in" | "out" | "warn" | undefined }) {
  return (
    <Panel className={cn(tone === "in" && "border-primary/40", tone === "out" && "border-gold/40", tone === "warn" && "border-warning/50")}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className={cn(
          "tabular mt-2 font-display text-2xl font-bold",
          tone === "in" && "text-primary",
          tone === "out" && "text-gold",
          tone === "warn" && "text-warning",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
    </Panel>
  );
}
