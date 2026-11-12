import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Bot, Loader2, MapPin, Smartphone, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { adminListVideos, adminSaveVideo } from "@/lib/admin.functions";
import { formatDateTime } from "@/lib/format";
import { VIDEO_SLOTS, type VideoSlot } from "@/lib/videos";
import { errMsg, PageTitle, Panel, uploadMedia } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/videos")({
  component: VideosPage,
});

function VideosPage() {
  const q = useQuery({ queryKey: ["admin-videos"], queryFn: () => adminListVideos() });
  const groups: { id: VideoSlot["group"]; title: string; icon: React.ReactNode; sub: string }[] = [
    { id: "wallet", title: "WALLET ilovasidagi videolar", icon: <Smartphone className="size-5" />, sub: "\"Bu qanday ishlaydi\" bo'limida ketma-ket chiqadi" },
    { id: "bot", title: "Bot chatidagi videolar", icon: <Bot className="size-5" />, sub: "Foydalanuvchi bot menyusidagi tugmani bosganda yuboriladi" },
  ];
  return (
    <div>
      <PageTitle
        title="Videolar"
        sub="Har bir joyga bitta video qo'ying. Kartada video qayerda chiqishi yozilgan. MP4 format, 50 MB gacha tavsiya etiladi (bot chatida 20 MB dan kichik bo'lsin)."
      />
      {q.isLoading ? (
        <Loader2 className="mx-auto my-16 size-8 animate-spin text-primary" />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.id}>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">{g.icon}</span>
                <div>
                  <h2 className="font-semibold">{g.title}</h2>
                  <p className="text-sm text-muted-foreground">{g.sub}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {VIDEO_SLOTS.filter((v) => v.group === g.id).map((v) => (
                  <SlotCard key={v.slot} slot={v} current={q.data?.[v.slot]} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function SlotCard({ slot, current }: { slot: VideoSlot; current?: { url: string | null; updated_at: string } | undefined }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast.error("Video fayl tanlang (MP4)");
      return;
    }
    setBusy(true);
    try {
      const path = await uploadMedia("videos", file);
      await adminSaveVideo({ data: { slot: slot.slot, path } });
      toast.success("Video joylandi");
      await qc.invalidateQueries({ queryKey: ["admin-videos"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold">
        <MapPin className="mt-0.5 size-4 shrink-0" />
        <span>
          <b>Bu yerga qo'ying:</b> {slot.where}
        </span>
      </div>
      <div className="font-semibold">
        {slot.group === "wallet" ? `${slot.order}. ` : ""}
        {slot.title.uz}
      </div>
      {slot.description.uz && <p className="-mt-2 text-sm text-muted-foreground">{slot.description.uz}</p>}
      {current?.url ? (
        <video src={current.url} controls playsInline className="aspect-video w-full rounded-xl bg-background object-contain" />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          Video hali qo'yilmagan
        </div>
      )}
      {current?.updated_at && <div className="text-xs text-muted-foreground">Yangilangan: {formatDateTime(current.updated_at)}</div>}
      <input ref={ref} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <div className="mt-auto flex gap-2">
        <button
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? "Yuklanmoqda..." : current?.url ? "Almashtirish" : "Video yuklash"}
        </button>
        {current?.url && (
          <button
            disabled={busy}
            aria-label="O'chirish"
            onClick={async () => {
              if (!confirm("Video o'chirilsinmi?")) return;
              try {
                await adminSaveVideo({ data: { slot: slot.slot, path: null } });
                qc.invalidateQueries({ queryKey: ["admin-videos"] });
              } catch (e) {
                toast.error(errMsg(e));
              }
            }}
            className="flex h-10 items-center rounded-xl border border-border px-3 text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </Panel>
  );
}
