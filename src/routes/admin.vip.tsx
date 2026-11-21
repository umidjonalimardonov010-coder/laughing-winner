import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminDrawContestNow, adminSaveContest, adminSaveVip, adminVipOverview } from "@/lib/admin-vip.functions";
import { formatDateTime, formatSom } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { AdminIcon, errMsg, PageTitle, Panel, SectionTitle } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/vip")({
  component: VipPage,
});

type Overview = Awaited<ReturnType<typeof adminVipOverview>>;
type Row = { name: string; from: string; pct: string };

const inputCls = "h-10 w-full min-w-0 rounded-xl border border-input bg-secondary px-2.5 outline-none focus:border-primary sm:px-3";

function VipPage() {
  const q = useQuery({ queryKey: ["admin-vip"], queryFn: () => adminVipOverview() });
  return (
    <div className="max-w-5xl">
      <PageTitle icon="coins" title="VIP va Konkurs" sub="Ko'p to'ldirgan mijozlarga keshbek va har hafta sovrinli o'yin." />
      {q.isLoading || !q.data ? (
        q.isError ? (
          <Panel className="text-destructive">{errMsg(q.error)}</Panel>
        ) : (
          <Loader2 className="mx-auto my-16 size-8 animate-spin text-primary" />
        )
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <VipPanel data={q.data} />
          <ContestPanel data={q.data} />
        </div>
      )}
    </div>
  );
}

function parseRows(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p.length === 3 && p[0])
    .map(([name = "", from = "", pct = ""]) => ({ name, from, pct }));
}

function VipPanel({ data }: { data: Overview }) {
  const qc = useQueryClient();
  const [on, setOn] = useState(data.vip.on);
  const [rows, setRows] = useState<Row[]>(() => parseRows(data.vip.levelsText));
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(data.vip.on), [data.vip.on]);
  const setRow = (i: number, k: keyof Row) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));

  const save = async () => {
    setBusy(true);
    try {
      const levels = rows
        .filter((r) => r.name.trim())
        .map((r) => `${r.name.trim()} | ${r.from.replace(/\s/g, "") || "0"} | ${r.pct.replace(",", ".") || "0"}`)
        .join("\n");
      await adminSaveVip({ data: { on, levels } });
      toast.success(on ? "VIP darajalar yoqildi" : "Saqlandi (VIP o'chiq)");
      qc.invalidateQueries({ queryKey: ["admin-vip"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle icon="trophy">VIP darajalar va keshbek</SectionTitle>
        <Switch checked={on} onCheckedChange={setOn} aria-label="VIP yoqish" />
      </div>
      <p className="text-sm text-muted-foreground">
        Mijoz bot orqali jami qancha to'ldirgan bo'lsa, shu darajaga chiqadi. Har tasdiqlangan to'ldirishdan foizi bonus balansiga o'zi tushadi
        (keyin LINEBET'ga yechib oladi). Yangi darajaga chiqqanda bot tabrik yuboradi.
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1.15fr_4.5rem_2.5rem] sm:grid-cols-[1fr_1fr_5.5rem_2.5rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
          <span>Daraja nomi</span>
          <span>Jami to'ldirish (so'mdan)</span>
          <span>Keshbek %</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.15fr_4.5rem_2.5rem] sm:grid-cols-[1fr_1fr_5.5rem_2.5rem] items-center gap-2">
            <input value={r.name} onChange={setRow(i, "name")} placeholder="Oltin" className={inputCls} />
            <input value={r.from} onChange={setRow(i, "from")} inputMode="numeric" placeholder="5000000" className={cn(inputCls, "tabular")} />
            <input value={r.pct} onChange={setRow(i, "pct")} inputMode="decimal" placeholder="1.5" className={cn(inputCls, "tabular")} />
            <button
              onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
              aria-label="O'chirish"
              className="flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {rows.length < 10 && (
          <button
            onClick={() => setRows((p) => [...p, { name: "", from: "", pct: "" }])}
            className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="size-4" /> Daraja qo'shish
          </button>
        )}
      </div>
      {data.vip.levels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.vip.levels.map((l, i) => (
            <span key={l.name} className="lb-tile rounded-xl px-3 py-1.5 text-xs">
              <b>{l.name}</b> · {l.pct}% · <span className="text-primary">{data.vip.counts[i] ?? 0} mijoz</span>
            </span>
          ))}
        </div>
      )}
      <button disabled={busy} onClick={save} className="flex h-11 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
        {busy ? <Loader2 className="size-5 animate-spin" /> : "Saqlash"}
      </button>
    </Panel>
  );
}

function ContestPanel({ data }: { data: Overview }) {
  const qc = useQueryClient();
  const c = data.contest;
  const [form, setForm] = useState({ on: c.on, prizes: c.prizes || "100000, 50000, 25000", ticketSom: c.ticketSom, minSom: c.minSom, announce: c.announce });
  const [busy, setBusy] = useState<"save" | "draw" | null>(null);
  const set = (k: "prizes" | "ticketSom" | "minSom") => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setBusy("save");
    try {
      await adminSaveContest({ data: form });
      toast.success(form.on ? "Konkurs yoqildi" : "Saqlandi (konkurs o'chiq)");
      qc.invalidateQueries({ queryKey: ["admin-vip"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const drawNow = async () => {
    if (!confirm("Shu haftani hozir yakunlab, g'oliblarni aniqlaysizmi?\nSovrinlar darhol bonus balansga tushadi va bu hafta qayta o'tkazilmaydi.")) return;
    setBusy("draw");
    try {
      const d = await adminDrawContestNow();
      toast.success(d.winners.length ? `G'oliblar aniqlandi: ${d.winners.length} kishi` : "Qatnashchi yo'q — sovrin berilmadi");
      qc.invalidateQueries({ queryKey: ["admin-vip"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle icon="gift">Haftalik konkurs</SectionTitle>
          <Switch checked={form.on} onCheckedChange={(v) => setForm((p) => ({ ...p, on: v }))} aria-label="Konkursni yoqish" />
        </div>
        <p className="text-sm text-muted-foreground">
          Hafta davomida (dushanba–yakshanba) bot orqali to'ldirgan mijozlar chipta oladi. Dushanba 00:00 da bot g'oliblarni o'zi tanlaydi — chiptasi
          ko'p bo'lganning imkoniyati katta. Sovrin bonus balansga tushadi.
        </p>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Sovrinlar (1-o'rin, 2-o'rin, ... vergul bilan)</span>
          <input value={form.prizes} onChange={set("prizes")} placeholder="100000, 50000, 25000" className={cn(inputCls, "tabular")} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">1 chipta (so'm)</span>
            <input value={form.ticketSom} onChange={set("ticketSom")} inputMode="numeric" className={cn(inputCls, "tabular")} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Haftalik minimum (so'm)</span>
            <input value={form.minSom} onChange={set("minSom")} inputMode="numeric" className={cn(inputCls, "tabular")} />
          </label>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 px-3 py-2.5 text-sm">
          <span>G'oliblarni barcha foydalanuvchilarga e'lon qilish</span>
          <Switch checked={form.announce} onCheckedChange={(v) => setForm((p) => ({ ...p, announce: v }))} aria-label="Hammaga e'lon" />
        </label>
        <button disabled={!!busy} onClick={save} className="flex h-11 w-full items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
          {busy === "save" ? <Loader2 className="size-5 animate-spin" /> : "Saqlash"}
        </button>
      </Panel>

      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle icon="ticket">Shu hafta</SectionTitle>
          <span className="text-xs text-muted-foreground">
            {c.week.closed ? "G'oliblar aniqlangan" : `Yakun: ${formatDateTime(c.week.endsAt)}`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="lb-tile rounded-xl p-3">
            <div className="text-xs text-muted-foreground">Qatnashchilar</div>
            <div className="tabular text-xl font-bold">{c.entrants}</div>
          </div>
          <div className="lb-tile rounded-xl p-3">
            <div className="text-xs text-muted-foreground">Chiptalar</div>
            <div className="tabular text-xl font-bold">{c.tickets}</div>
          </div>
        </div>
        {c.top.length > 0 ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {c.top.map((e, i) => (
              <div key={e.user_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 text-center text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {e.name || "—"} <span className="font-mono text-xs text-muted-foreground">{e.user_id}</span>
                </span>
                <span className="tabular text-muted-foreground">{formatSom(e.sum)} so'm</span>
                <span className="tabular flex w-16 items-center justify-end gap-1 font-semibold text-primary">{e.tickets} <AdminIcon name="ticket" className="size-4" /></span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">Bu hafta hali chipta olgan mijoz yo'q</p>
        )}
        {!c.week.closed && (
          <button
            disabled={!!busy || !c.on}
            onClick={drawNow}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-gold/40 text-sm font-semibold text-gold hover:bg-gold/10 disabled:opacity-50"
          >
            {busy === "draw" ? <Loader2 className="size-4 animate-spin" /> : <AdminIcon name="trophy" className="size-5" />} G'oliblarni hozir aniqlash
          </button>
        )}
      </Panel>

      <Panel className="space-y-3">
        <SectionTitle icon="coins">O'tgan konkurslar</SectionTitle>
        {c.draws.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Hali konkurs o'tkazilmagan</p>
        ) : (
          c.draws.map((d) => (
            <div key={d.week_start} className="rounded-xl bg-secondary/50 p-3 text-sm">
              <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {d.week_start} hafta{d.manual ? " · qo'lda" : ""}
                </span>
                <span>
                  {d.entrants} qatnashchi · {d.tickets} chipta
                </span>
              </div>
              {d.winners.length ? (
                d.winners.map((w) => (
                  <div key={w.place} className="flex justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn("lb-tile flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-black", w.place === 1 && "text-gold")}>{w.place}</span>
                      <span className="truncate">{w.name}</span> <span className="font-mono text-xs text-muted-foreground">{w.user_id}</span>
                    </span>
                    <span className="tabular font-semibold text-primary">{formatSom(w.prize)} so'm</span>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">Qatnashchi bo'lmadi</div>
              )}
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
