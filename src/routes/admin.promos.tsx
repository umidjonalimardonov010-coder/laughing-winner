import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminDeletePromo, adminListPromos, adminSavePromo } from "@/lib/admin.functions";
import { formatDateTime, formatSom } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errMsg, PageTitle, Panel } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/promos")({
  component: PromosPage,
});

type Promo = Awaited<ReturnType<typeof adminListPromos>>[number];

const inputCls = "h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary";
const empty = { code: "", bonus_percent: "5", max_uses: "0", per_user: "1", expires_at: "", note: "" };

function PromosPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-promos"], queryFn: () => adminListPromos() });
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async (p: Promo | null, patch?: Partial<Promo>) => {
    setBusy(true);
    try {
      const src = p
        ? { ...p, ...patch }
        : {
            code: form.code,
            bonus_percent: Number(form.bonus_percent.replace(",", ".")),
            max_uses: Number(form.max_uses || 0),
            per_user: Number(form.per_user || 0),
            expires_at: form.expires_at ? new Date(`${form.expires_at}T23:59:59+05:00`).toISOString() : null,
            is_active: true,
            note: form.note,
          };
      const r = await adminSavePromo({
        data: {
          code: src.code,
          bonus_percent: Number(src.bonus_percent),
          max_uses: Number(src.max_uses),
          per_user: Number(src.per_user),
          expires_at: src.expires_at,
          is_active: src.is_active,
          note: src.note ?? "",
        },
      });
      toast.success(p ? "Saqlandi" : `${r.code} promo-kodi yaratildi`);
      if (!p) setForm(empty);
      qc.invalidateQueries({ queryKey: ["admin-promos"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageTitle
        icon="ticket" title="Promo-kodlar"
        sub="Foydalanuvchi bukmekerga to'ldirishda promo-kod kiritsa, qo'shimcha bonus foiz BK hisobiga qo'shiladi."
      />
      <Panel className="space-y-4">
        <div className="font-semibold">Yangi promo-kod</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Kod</span>
            <input value={form.code} onChange={set("code")} placeholder="BONUS10" className={cn(inputCls, "font-mono uppercase")} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Bonus, %</span>
            <input value={form.bonus_percent} onChange={set("bonus_percent")} inputMode="decimal" className={inputCls} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Amal qilish muddati (ixtiyoriy)</span>
            <input type="date" value={form.expires_at} onChange={set("expires_at")} className={inputCls} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Jami necha marta (0 — cheksiz)</span>
            <input value={form.max_uses} onChange={set("max_uses")} inputMode="numeric" className={inputCls} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Bir kishi necha marta</span>
            <input value={form.per_user} onChange={set("per_user")} inputMode="numeric" className={inputCls} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Izoh (o'zingiz uchun)</span>
            <input value={form.note} onChange={set("note")} placeholder="Kanal aksiyasi" className={inputCls} />
          </label>
        </div>
        <button
          disabled={busy || form.code.trim().length < 2 || !Number(form.bonus_percent.replace(",", "."))}
          onClick={() => save(null)}
          className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Yaratish
        </button>
      </Panel>

      <div className="mt-4 space-y-3">
        {q.isLoading ? (
          <Loader2 className="mx-auto my-12 size-8 animate-spin text-primary" />
        ) : !q.data?.length ? (
          <Panel className="py-12 text-center text-muted-foreground">Hali promo-kodlar yo'q</Panel>
        ) : (
          q.data.map((p) => {
            const expired = p.expires_at ? Date.parse(p.expires_at) < Date.now() : false;
            const usedUp = p.max_uses > 0 && p.used_count >= p.max_uses;
            const live = p.is_active && !expired && !usedUp;
            return (
              <Panel key={p.code} className={cn("flex flex-wrap items-center gap-4", !live && "opacity-70")}>
                <div className="min-w-40 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold">{p.code}</span>
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold text-primary">+{p.bonus_percent}%</span>
                    {!live && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {!p.is_active ? "o'chirilgan" : expired ? "muddati tugagan" : "tugagan"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Ishlatildi: {p.used_count}
                    {p.max_uses ? ` / ${p.max_uses}` : ""} · bir kishiga {p.per_user || "cheksiz"} marta · berilgan bonus{" "}
                    {formatSom(p.bonus_total)} so'm
                    {p.expires_at ? ` · ${formatDateTime(p.expires_at)} gacha` : ""}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
                <button
                  disabled={busy}
                  onClick={() => save(p, { is_active: !p.is_active })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium",
                    p.is_active ? "bg-secondary" : "bg-primary text-primary-foreground",
                  )}
                >
                  {p.is_active ? "To'xtatish" : "Yoqish"}
                </button>
                <button
                  disabled={busy}
                  aria-label="O'chirib tashlash"
                  onClick={async () => {
                    if (!confirm(`${p.code} promo-kodini butunlay o'chirasizmi?`)) return;
                    try {
                      await adminDeletePromo({ data: { code: p.code } });
                      qc.invalidateQueries({ queryKey: ["admin-promos"] });
                    } catch (e) {
                      toast.error(errMsg(e));
                    }
                  }}
                  className="rounded-lg bg-destructive/15 p-2 text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </Panel>
            );
          })
        )}
      </div>
    </div>
  );
}
