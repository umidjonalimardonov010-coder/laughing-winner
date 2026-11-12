import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { adminAdjustBalance, adminListUsers, adminSetBlocked } from "@/lib/admin.functions";
import { formatDateTime, formatSom } from "@/lib/format";
import { errMsg, PageTitle, Panel } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

type U = Awaited<ReturnType<typeof adminListUsers>>["rows"][number];

function UsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState<U | null>(null);
  const q = useQuery({
    queryKey: ["admin-users", search, page],
    queryFn: () => adminListUsers({ data: { search, page } }),
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <div>
      <PageTitle title="Foydalanuvchilar" sub={`Jami: ${q.data?.total ?? 0}`} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Ism, @username yoki Telegram ID"
          className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>
      <Panel className="overflow-x-auto p-0">
        {q.isLoading ? (
          <Loader2 className="mx-auto my-12 size-8 animate-spin text-primary" />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Foydalanuvchi</th>
                <th className="px-4 py-3">Telegram ID</th>
                <th className="px-4 py-3 text-right">Balans</th>
                <th className="px-4 py-3 text-right">Referal bonus</th>
                <th className="px-4 py-3">Qo'shilgan</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {q.data?.rows.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {u.first_name ?? "—"} {u.is_blocked && <span className="ml-1 rounded bg-destructive/15 px-1.5 text-xs text-destructive">bloklangan</span>}
                    </div>
                    {u.username && <div className="text-muted-foreground">@{u.username}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono">{u.id}</td>
                  <td className="tabular px-4 py-3 text-right font-semibold">{formatSom(u.balance)}</td>
                  <td className="tabular px-4 py-3 text-right">{formatSom(u.referral_earned)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(u.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEdit(u)} className="rounded-lg bg-secondary px-3 py-1.5 font-medium">
                      Boshqarish
                    </button>
                  </td>
                </tr>
              ))}
              {!q.data?.rows.length && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    Hali foydalanuvchilar yo'q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Panel>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
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
      {edit && <UserDialog u={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserDialog({ u, onClose }: { u: U; onClose: () => void }) {
  const qc = useQueryClient();
  const [delta, setDelta] = useState("");
  const [sign, setSign] = useState<1 | -1>(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-lg font-semibold">
            {u.first_name} {u.username ? `@${u.username}` : ""}
          </div>
          <div className="text-sm text-muted-foreground">
            ID {u.id} · balans {formatSom(u.balance)} so'm
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Balansni o'zgartirish</div>
          <div className="flex gap-2">
            <div className="flex rounded-xl border border-border p-1">
              <button onClick={() => setSign(1)} className={`rounded-lg px-3 ${sign === 1 ? "bg-primary text-primary-foreground" : ""}`}>
                +
              </button>
              <button onClick={() => setSign(-1)} className={`rounded-lg px-3 ${sign === -1 ? "bg-destructive text-destructive-foreground" : ""}`}>
                −
              </button>
            </div>
            <input
              inputMode="numeric"
              value={delta ? formatSom(Number(delta)) : ""}
              onChange={(e) => setDelta(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Summa"
              className="h-11 flex-1 rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary"
            />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Sabab (masalan: naqd to'lov)"
            className="h-11 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary"
          />
          <button
            disabled={busy || !delta}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await adminAdjustBalance({ data: { userId: u.id, delta: sign * Number(delta), note } });
                toast.success(`Yangi balans: ${formatSom(r.balance)} so'm`);
                await refresh();
                onClose();
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
            className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
          >
            Saqlash
          </button>
        </div>
        <button
          onClick={async () => {
            try {
              await adminSetBlocked({ data: { userId: u.id, blocked: !u.is_blocked } });
              toast.success(u.is_blocked ? "Blokdan chiqarildi" : "Bloklandi");
              await refresh();
              onClose();
            } catch (e) {
              toast.error(errMsg(e));
            }
          }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border font-medium"
        >
          {u.is_blocked ? <ShieldCheck className="size-4" /> : <Ban className="size-4" />}
          {u.is_blocked ? "Blokdan chiqarish" : "Bloklash"}
        </button>
      </div>
    </div>
  );
}
