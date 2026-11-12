import type { ReactNode } from "react";
import { uploadToSignedUrl } from "@/lib/upload";
import { adminMediaUploadUrl } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const TYPE_LABEL: Record<string, string> = {
  wallet_topup: "Hamyonni to'ldirish (karta)",
  card_withdraw: "Kartaga yechish",
  bk_deposit: "Bukmekerga to'ldirish",
  bk_withdraw: "Bukmekerdan chiqarish (kod)",
  referral_bonus: "Referal bonus",
  adjustment: "Balans tuzatish",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Kutilmoqda",
  approved: "Bajarildi",
  rejected: "Rad etildi",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        status === "approved" && "bg-primary/15 text-primary",
        status === "rejected" && "bg-destructive/15 text-destructive",
        status === "pending" && "bg-warning/15 text-warning",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>{children}</div>;
}

export async function uploadMedia(folder: "logos" | "videos", file: File) {
  const ext = (file.name.split(".").pop() || (folder === "videos" ? "mp4" : "png")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const { path, signedUrl } = await adminMediaUploadUrl({ data: { folder, ext } });
  await uploadToSignedUrl(signedUrl, file);
  return path;
}

export function errMsg(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = {
    UNAUTHORIZED: "Sessiya tugagan. Qayta kiring.",
    insufficient_balance: "Foydalanuvchi balansida mablag' yetarli emas",
    already_processed: "Bu so'rov allaqachon ko'rib chiqilgan",
    amount_required: "Summani kiriting",
    negative_balance: "Balans manfiy bo'lib qolmaydi",
    bot_not_connected: "Telegram bot hali ulanmagan",
    https_required: "Manzil https:// bilan boshlanishi kerak",
    min_gt_max: "Minimal summa maksimaldan katta bo'lmasin",
  };
  for (const [k, v] of Object.entries(map)) if (m.includes(k)) return v;
  return m || "Xatolik yuz berdi";
}
