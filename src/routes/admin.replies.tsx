import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminDeleteReply, adminListReplies, adminSaveReply } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";
import { errMsg, PageTitle, Panel } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/replies")({
  component: RepliesPage,
});

type Reply = Awaited<ReturnType<typeof adminListReplies>>[number];
type Draft = Omit<Reply, "id"> & { id: string | null };

const inputCls = "w-full rounded-xl border border-input bg-secondary px-3 py-2 outline-none focus:border-primary";
const blank: Draft = {
  id: null,
  keywords: "",
  question_uz: "",
  answer_uz: "",
  question_ru: "",
  answer_ru: "",
  question_en: "",
  answer_en: "",
  sort_order: 0,
  is_active: true,
};
const LANGS = [
  { id: "uz", l: "O'zbekcha (majburiy)" },
  { id: "ru", l: "Русский" },
  { id: "en", l: "English" },
] as const;

function RepliesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-replies"], queryFn: () => adminListReplies() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (d: Draft) => {
    setBusy(true);
    try {
      await adminSaveReply({ data: d });
      toast.success("Saqlandi");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-replies"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <PageTitle
        title="Avto-javoblar"
        sub="Botdagi «Savol-javob ❓» tugmasi shu ro'yxatni ko'rsatadi. Foydalanuvchi savolni o'zi yozsa, kalit so'zlar bo'yicha tayyor javob avtomatik boradi."
        right={
          <button
            onClick={() => setDraft({ ...blank, sort_order: (q.data?.length ?? 0) + 1 })}
            className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
          >
            <Plus className="size-4" /> Yangi savol
          </button>
        }
      />
      {draft && !draft.id && <Editor draft={draft} setDraft={setDraft} busy={busy} onSave={save} />}
      <div className="mt-4 space-y-3">
        {q.isLoading ? (
          <Loader2 className="mx-auto my-12 size-8 animate-spin text-primary" />
        ) : !q.data?.length ? (
          <Panel className="py-12 text-center text-muted-foreground">Hali savollar yo'q</Panel>
        ) : (
          q.data.map((r) =>
            draft?.id === r.id ? (
              <Editor key={r.id} draft={draft} setDraft={setDraft} busy={busy} onSave={save} />
            ) : (
              <Panel key={r.id} className={cn("space-y-2", !r.is_active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{r.sort_order}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{r.question_uz}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.answer_uz}</p>
                    {r.keywords && <p className="mt-2 text-xs text-primary">🔑 {r.keywords}</p>}
                    {!r.is_active && <p className="mt-1 text-xs text-muted-foreground">O'chirilgan — botda ko'rinmaydi</p>}
                  </div>
                  <button onClick={() => setDraft(r)} aria-label="Tahrirlash" className="rounded-lg bg-secondary p-2">
                    <Pencil className="size-4" />
                  </button>
                  <button
                    aria-label="O'chirish"
                    onClick={async () => {
                      if (!confirm("Bu savol-javobni o'chirasizmi?")) return;
                      try {
                        await adminDeleteReply({ data: { id: r.id } });
                        qc.invalidateQueries({ queryKey: ["admin-replies"] });
                      } catch (e) {
                        toast.error(errMsg(e));
                      }
                    }}
                    className="rounded-lg bg-destructive/15 p-2 text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Panel>
            ),
          )
        )}
      </div>
    </div>
  );
}

function Editor({
  draft,
  setDraft,
  busy,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  busy: boolean;
  onSave: (d: Draft) => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  return (
    <Panel className="space-y-4 border-primary/40">
      {LANGS.map((l) => (
        <div key={l.id} className="space-y-2">
          <div className="text-sm font-semibold">{l.l}</div>
          <input
            value={draft[`question_${l.id}`]}
            onChange={(e) => set(`question_${l.id}`, e.target.value)}
            placeholder="Savol"
            className={cn(inputCls, "h-10")}
          />
          <textarea
            value={draft[`answer_${l.id}`]}
            onChange={(e) => set(`answer_${l.id}`, e.target.value)}
            placeholder="Javob"
            rows={3}
            className={inputCls}
          />
        </div>
      ))}
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold">Kalit so'zlar (vergul bilan)</span>
        <input
          value={draft.keywords}
          onChange={(e) => set("keywords", e.target.value)}
          placeholder="qancha vaqt, necha daqiqa, сколько времени"
          className={cn(inputCls, "h-10")}
        />
        <span className="block text-xs text-muted-foreground">
          Foydalanuvchi xabarida shu so'zlardan biri bo'lsa, bot shu javobni yuboradi. Bo'sh qoldirsangiz — faqat ro'yxatda ko'rinadi.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          Tartib
          <input
            value={draft.sort_order}
            onChange={(e) => set("sort_order", Number(e.target.value.replace(/\D/g, "") || 0))}
            inputMode="numeric"
            className={cn(inputCls, "h-9 w-20")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} className="size-4 accent-primary" />
          Botda ko'rinadi
        </label>
        <div className="flex-1" />
        <button onClick={() => setDraft(null)} className="h-10 rounded-xl bg-secondary px-4 font-medium">
          Bekor qilish
        </button>
        <button
          disabled={busy || !draft.question_uz.trim() || !draft.answer_uz.trim()}
          onClick={() => onSave(draft)}
          className="flex h-10 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Saqlash
        </button>
      </div>
    </Panel>
  );
}
