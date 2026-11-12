import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminDeleteBookmaker, adminListBookmakers, adminSaveBookmaker } from "@/lib/admin.functions";
import { errMsg, PageTitle, Panel, uploadMedia } from "@/components/admin/shared";
import { BkLogo } from "@/components/wallet/ui";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/admin/bookmakers")({
  component: BookmakersPage,
});

type Bk = Awaited<ReturnType<typeof adminListBookmakers>>[number];

function BookmakersPage() {
  const q = useQuery({ queryKey: ["admin-bks"], queryFn: () => adminListBookmakers() });
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <PageTitle
        title="Bukmekerlar"
        sub="Ilovada ko'rinadigan bukmekerlar, ularning logotipi, komissiyasi, manzili va summa chegaralari."
        right={
          <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground">
            <Plus className="size-4" /> Qo'shish
          </button>
        }
      />
      {q.isLoading ? (
        <Loader2 className="mx-auto my-16 size-8 animate-spin text-primary" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {adding && (
            <BkEditor
              isNew
              onDone={() => setAdding(false)}
              bk={{
                id: "",
                name: "",
                logo_url: null,
                logo_preview: null,
                deposit_enabled: true,
                withdraw_enabled: true,
                deposit_fee_percent: 0,
                withdraw_fee_percent: 0,
                address: "Toshkent shahar",
                min_amount: 5000,
                max_amount: 10000000,
                sort_order: (q.data?.length ?? 0) + 1,
                is_active: true,
                created_at: "",
              }}
            />
          )}
          {q.data?.map((b) => <BkEditor key={b.id} bk={b} />)}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
const inp = "h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary";

function BkEditor({ bk, isNew, onDone }: { bk: Bk; isNew?: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(bk);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Bk>(k: K, v: Bk[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const id = (isNew ? f.id || f.name : f.id).toLowerCase().replace(/[^a-z0-9-]/g, "");
      await adminSaveBookmaker({
        data: {
          id,
          name: f.name,
          logo_url: f.logo_url,
          deposit_enabled: f.deposit_enabled,
          withdraw_enabled: f.withdraw_enabled,
          deposit_fee_percent: Number(f.deposit_fee_percent),
          withdraw_fee_percent: Number(f.withdraw_fee_percent),
          address: f.address,
          min_amount: Number(f.min_amount),
          max_amount: Number(f.max_amount),
          sort_order: Number(f.sort_order),
          is_active: f.is_active,
        },
      });
      toast.success("Saqlandi");
      await qc.invalidateQueries({ queryKey: ["admin-bks"] });
      onDone?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <div className="flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="group relative" title="Logotip yuklash">
          <BkLogo bk={{ id: f.id || f.name || "x", name: f.name || "LOGO", logo: f.logo_preview }} />
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/70 opacity-0 transition group-hover:opacity-100">
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              const path = await uploadMedia("logos", file);
              setF((p) => ({ ...p, logo_url: path, logo_preview: URL.createObjectURL(file) }));
              toast.success("Logotip yuklandi — \"Saqlash\" ni bosing");
            } catch (err) {
              toast.error(errMsg(err));
            } finally {
              setUploading(false);
            }
          }}
        />
        <div className="flex-1 space-y-2">
          <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nomi (masalan 1XBET)" className={inp} />
          {isNew && <input value={f.id} onChange={(e) => set("id", e.target.value)} placeholder="Qisqa kod (masalan 1xbet)" className={inp} />}
        </div>
        <label className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          <Switch checked={f.is_active} onCheckedChange={(v) => set("is_active", v)} />
          {f.is_active ? "Ko'rinadi" : "Yashirin"}
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Logotipni almashtirish uchun rasm ustiga bosing (kvadrat, 256×256 tavsiya).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
          <span>To'ldirish</span>
          <Switch checked={f.deposit_enabled} onCheckedChange={(v) => set("deposit_enabled", v)} />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2">
          <span>Chiqarish</span>
          <Switch checked={f.withdraw_enabled} onCheckedChange={(v) => set("withdraw_enabled", v)} />
        </div>
        <Field label="To'ldirish komissiyasi, %">
          <input type="number" step="0.1" min={0} value={f.deposit_fee_percent} onChange={(e) => set("deposit_fee_percent", Number(e.target.value))} className={inp} />
        </Field>
        <Field label="Chiqarish komissiyasi, %">
          <input type="number" step="0.1" min={0} value={f.withdraw_fee_percent} onChange={(e) => set("withdraw_fee_percent", Number(e.target.value))} className={inp} />
        </Field>
        <Field label="Minimal summa (so'm)">
          <input type="number" min={0} value={f.min_amount} onChange={(e) => set("min_amount", Number(e.target.value))} className={inp} />
        </Field>
        <Field label="Maksimal summa (so'm)">
          <input type="number" min={1} value={f.max_amount} onChange={(e) => set("max_amount", Number(e.target.value))} className={inp} />
        </Field>
        <Field label="Chiqarish manzili (kassa nomi)">
          <input value={f.address} onChange={(e) => set("address", e.target.value)} className={inp} />
        </Field>
        <Field label="Tartib raqami">
          <input type="number" min={0} value={f.sort_order} onChange={(e) => set("sort_order", Number(e.target.value))} className={inp} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !f.name} className="h-10 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Saqlash"}
        </button>
        {isNew ? (
          <button onClick={onDone} className="h-10 rounded-xl border border-border px-4">
            Bekor
          </button>
        ) : (
          <button
            onClick={async () => {
              if (!confirm(`${bk.name} o'chirilsinmi? Eski so'rovlar saqlanib qoladi.`)) return;
              try {
                await adminDeleteBookmaker({ data: { id: bk.id } });
                qc.invalidateQueries({ queryKey: ["admin-bks"] });
              } catch (e) {
                toast.error(errMsg(e));
              }
            }}
            className="flex h-10 items-center rounded-xl border border-border px-3 text-destructive"
            aria-label="O'chirish"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </Panel>
  );
}
