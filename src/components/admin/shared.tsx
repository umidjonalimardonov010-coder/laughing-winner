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

export type IconName =
  | "chart" | "inbox" | "users" | "megaphone" | "stadium" | "ticket" | "chat" | "video" | "gear"
  | "trophy" | "bell" | "card" | "shield" | "gift" | "coins" | "support" | "wallet" | "key";

/** 3D LINEBET-style picture icon (files in public/admin/icons). */
export function AdminIcon({ name, className }: { name: IconName; className?: string }) {
  return <img src={`/admin/icons/${name}.webp`} alt="" aria-hidden draggable={false} className={cn("size-6 shrink-0 select-none object-contain drop-shadow-[0_4px_8px_oklch(0_0_0/0.45)]", className)} />;
}

export function PageTitle({ title, sub, right, icon }: { title: string; sub?: string; right?: ReactNode; icon?: IconName }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-4">
        {icon && (
          <div className="lb-tile flex size-14 shrink-0 items-center justify-center rounded-2xl md:size-16">
            <AdminIcon name={icon} className="size-10 md:size-12" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-black uppercase tracking-wide md:text-3xl">{title}</h1>
          {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Section heading inside a panel: picture icon + bold title. */
export function SectionTitle({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 font-display text-base font-bold">
      <AdminIcon name={icon} className="size-8" />
      <span>{children}</span>
    </div>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("lb-panel rounded-2xl p-5", className)}>{children}</div>;
}

export async function uploadMedia(folder: "logos" | "videos" | "broadcast", file: File) {
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
    promo_bad_code: "Promo-kod faqat lotin harflari, raqam, - va _ dan iborat bo'lsin (2–32 belgi)",
    promo_bad_date: "Muddat sanasi noto'g'ri",
    user_not_found: "Foydalanuvchi topilmadi",
    no_users: "Bu guruhda foydalanuvchi yo'q",
    bonus_hours_too_big: "Yechish oralig'i ko'pi bilan 720 soat (30 kun)",
    vip_bad_line: "Daraja qatori noto'g'ri. Shunday yozing: Nomi | summadan | foiz",
    vip_bad_from: "Daraja summasi noto'g'ri",
    vip_bad_pct: "Keshbek 0 dan 20% gacha bo'lsin",
    vip_too_many: "Ko'pi bilan 10 ta daraja",
    vip_same_from: "Ikki daraja bir xil summadan boshlanmasin",
    vip_no_levels: "Yoqishdan oldin kamida bitta daraja qo'shing",
    contest_bad_prize: "Sovrin summasi faqat raqam bo'lsin",
    contest_too_many: "Ko'pi bilan 10 ta sovrin",
    contest_no_prizes: "Yoqishdan oldin kamida bitta sovrin kiriting",
    contest_bad_ticket: "1 chipta narxi kamida 1 000 so'm bo'lsin",
    contest_bad_min: "Minimal summa faqat raqam bo'lsin",
    contest_off: "Avval konkursni yoqing va saqlang",
    contest_already_drawn: "Bu hafta g'oliblar allaqachon aniqlangan",
  };
  for (const [k, v] of Object.entries(map)) if (m.includes(k)) return v;
  return m || "Xatolik yuz berdi";
}
