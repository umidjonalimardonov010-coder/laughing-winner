import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { adminApproveRequest, adminListRequests, adminRejectRequest } from "@/lib/admin.functions";
import { formatDateTime, formatSom, groupCard } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errMsg, PageTitle, Panel, StatusBadge, TYPE_LABEL } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/requests")({
  component: Requests,
});

type Row = Awaited<ReturnType<typeof adminListRequests>>["rows"][number];

const STATUSES = [
  { id: "pending", l: "Kutilmoqda" },
  { id: "approved", l: "Bajarildi" },
  { id: "rejected", l: "Rad etildi" },
  { id: "all", l: "Barchasi" },
] as const;
const TYPES = ["all", "wallet_topup", "bk_deposit", "bk_withdraw", "card_withdraw"] as const;

function Requests() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]["id"]>("pending");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["admin-requests", status, type, search, page],
    queryFn: () => adminListRequests({ data: { status, type, search, page } }),
    refetchInterval: 15000,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <div>
      <PageTitle title="So'rovlar" sub="Foydalanuvchilar yuborgan to'ldirish va yechish so'rovlari. Har 15 soniyada yangilanadi." />
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setStatus(s.id);
              setPage(0);
            }}
            className={cn("rounded-xl px-4 py-2 text-sm font-medium", status === s.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
          >
            {s.l}
          </button>
        ))}
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as (typeof TYPES)[number]);
            setPage(0);
          }}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
          aria-label="Turi"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "Barcha turlar" : TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Raqam, Telegram ID yoki BK ID"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      {q.isLoading ? (
        <Loader2 className="mx-auto my-16 size-8 animate-spin text-primary" />
      ) : !q.data?.rows.length ? (
        <Panel className="py-16 text-center text-muted-foreground">So'rovlar yo'q</Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data.rows.map((r) => (
            <RequestCard key={r.id} r={r} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg bg-card px-3 py-1.5 disabled:opacity-40">
            ←
          </button>
          <span className="text-sm text-muted-foreground">
            {page + 1} / {pages}
          </span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded-lg bg-card px-3 py-1.5 disabled:opacity-40">
            →
          </button>
        </div>
      )}
    </div>
  );
}

function CopyVal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <button
        className="flex items-center gap-1.5 font-mono font-semibold"
        onClick={() => {
          navigator.clipboard?.writeText(value.replace(/\s/g, ""));
          toast.success("Nusxa olindi");
        }}
      >
        {value} <Copy className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

function RequestCard({ r }: { r: Row }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(r.type === "wallet_topup" ? String(r.amount) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"ok" | "no" | null>(null);
  const user = r.tg_users as { id: number; username: string | null; first_name: string | null; balance: number } | null;
  const bk = r.bookmakers as { name: string } | null;
  const needsAmount = r.type === "bk_withdraw" || r.type === "wallet_topup";

  const act = async (kind: "ok" | "no") => {
    setBusy(kind);
    try {
      if (kind === "ok") {
        const a = Number(amount.replace(/\D/g, "") || 0);
        if (r.type === "bk_withdraw" && !a) throw new Error("amount_required");
        await adminApproveRequest({ data: { id: r.id, amount: needsAmount ? a : 0, note } });
        toast.success(`#${r.number} tasdiqlandi`);
      } else {
        await adminRejectRequest({ data: { id: r.id, note } });
        toast.success(`#${r.number} rad etildi`);
      }
      await qc.invalidateQueries({ queryKey: ["admin-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-dash"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className={cn("space-y-3", r.status === "pending" && "border-warning/40")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            #{r.number} · {formatDateTime(r.created_at)}
          </div>
          <div className="text-lg font-semibold">
            {TYPE_LABEL[r.type]}
            {bk ? ` — ${bk.name}` : ""}
          </div>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="text-sm">
        👤 {user?.first_name ?? "—"} {user?.username ? `@${user.username}` : ""} · <span className="font-mono">{r.user_id}</span> · balans{" "}
        <span className="tabular">{formatSom(user?.balance ?? 0)}</span>
      </div>
      <div className="space-y-2 text-sm">
        {r.phone && <CopyVal label="Telefon" value={r.phone} />}
        {r.account_id && <CopyVal label="BK hisob ID" value={r.account_id} />}
        {r.withdraw_code && <CopyVal label="Chiqarish kodi" value={r.withdraw_code} />}
        {r.card_number && <CopyVal label="Karta" value={groupCard(r.card_number)} />}
        {r.amount > 0 && (
          <div className="flex justify-between rounded-lg bg-secondary/60 px-3 py-2">
            <span className="text-muted-foreground">Summa</span>
            <span className="tabular font-semibold">{formatSom(r.amount)} so'm</span>
          </div>
        )}
        {r.type === "bk_deposit" && (
          <div className="rounded-lg bg-primary/10 px-3 py-2 text-primary">
            BK hisobiga tushiring: <b className="tabular">{formatSom(r.amount + r.bonus - r.fee)} so'm</b>
            {r.bonus ? ` (bonus +${formatSom(r.bonus)})` : ""}
            {r.fee ? ` (komissiya −${formatSom(r.fee)})` : ""}
          </div>
        )}
        {r.receipt_url && (
          <a href={r.receipt_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary underline-offset-4 hover:underline">
            <ExternalLink className="size-4" /> To'lov chekini ko'rish
          </a>
        )}
        {r.selfie_url && (
          <a href={r.selfie_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg bg-secondary/60 p-2">
            <img src={r.selfie_url} alt="Yuz surati" className="h-20 w-16 rounded-md object-cover" loading="lazy" />
            <span className="text-primary">🤳 Yuz surati</span>
          </a>
        )}
        {(r.type === "card_withdraw" || r.type === "bk_withdraw") && !r.selfie_url && (
          <div className="text-muted-foreground">Yuz surati yo'q (eski so'rov)</div>
        )}
        {r.type === "wallet_topup" && !r.receipt_url && <div className="text-warning">Chek yuklanmagan</div>}
        {r.admin_note && <div className="text-muted-foreground">💬 {r.admin_note}</div>}
      </div>
      {r.status === "pending" && (
        <div className="space-y-2 border-t border-border pt-3">
          {needsAmount && (
            <input
              inputMode="numeric"
              value={amount ? formatSom(Number(amount.replace(/\D/g, ""))) : ""}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              placeholder={r.type === "bk_withdraw" ? "Kod bo'yicha chiqqan summa (so'm)" : "Tushgan summa (so'm)"}
              className="h-11 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary"
            />
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Izoh (ixtiyoriy, foydalanuvchiga boradi)"
            className="h-11 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!!busy}
              onClick={() => act("no")}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-destructive/15 font-semibold text-destructive disabled:opacity-50"
            >
              {busy === "no" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Rad etish
            </button>
            <button
              disabled={!!busy}
              onClick={() => act("ok")}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy === "ok" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Tasdiqlash
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
