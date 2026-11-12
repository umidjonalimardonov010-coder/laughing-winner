import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ImagePlus, Loader2, MapPin, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { uploadToSignedUrl } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { formatSom, groupCard } from "@/lib/format";
import { LANGS, type Lang } from "@/lib/i18n";
import { VIDEO_SLOTS } from "@/lib/videos";
import {
  walletBkDeposit,
  walletBkWithdraw,
  walletCardWithdraw,
  walletCheckAccount,
  walletReceiptUploadUrl,
  walletReferrals,
  walletTopup,
} from "@/lib/wallet.functions";
import { errorText, useWallet, type Bookmaker } from "./context";
import { BkLogo, BottomSheet, inputCls, PrimaryButton, Step } from "./ui";

const digits = (s: string) => s.replace(/\D/g, "");
const amountFmt = (s: string) => formatSom(Number(digits(s) || 0)).replace(/^0$/, "");

function AmountInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder: string; disabled?: boolean }) {
  const { t } = useWallet();
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        disabled={disabled}
        value={value ? amountFmt(value) : ""}
        onChange={(e) => onChange(digits(e.target.value).slice(0, 10))}
        placeholder={placeholder}
        className={cn(inputCls, "pr-16 tabular")}
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">{t("som")}</span>
    </div>
  );
}

function useAfterSuccess() {
  const { refresh, t, haptic } = useWallet();
  const qc = useQueryClient();
  return async (number?: number) => {
    haptic("success");
    toast.success(t("requestSent"), { description: number ? `#${number}` : undefined });
    await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["wallet-history"] })]);
  };
}

export function BookmakerSheet({
  bk,
  initialMode,
  onClose,
}: {
  bk: Bookmaker | null;
  initialMode: "deposit" | "withdraw";
  onClose: () => void;
}) {
  const { t, initData, boot, haptic } = useWallet();
  const [mode, setMode] = useState(initialMode);
  const [account, setAccount] = useState("");
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const done = useAfterSuccess();

  useEffect(() => {
    if (!bk) return;
    setMode(initialMode === "deposit" && !bk.deposit_enabled ? "withdraw" : initialMode === "withdraw" && !bk.withdraw_enabled ? "deposit" : initialMode);
    setAccount("");
    setChecked(false);
    setAmount("");
    setCode("");
  }, [bk, initialMode]);

  if (!bk) return <BottomSheet open={false} onOpenChange={() => onClose()}>{null}</BottomSheet>;

  const fee = mode === "deposit" ? bk.deposit_fee_percent : bk.withdraw_fee_percent;
  const amt = Number(amount || 0);
  const range = { min: formatSom(bk.min_amount), max: formatSom(bk.max_amount) };

  const check = async () => {
    if (!/^\d{5,15}$/.test(account)) {
      toast.error(t("invalidAccount"));
      return;
    }
    setChecking(true);
    try {
      const r = await walletCheckAccount({ data: { initData, bookmakerId: bk.id, accountId: account } });
      if (r.ok) {
        setChecked(true);
        haptic("success");
        toast.success(t("accountChecked"), { description: t("checkNote") });
      } else toast.error(t("invalidAccount"));
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setChecking(false);
    }
  };

  const submit = async () => {
    if (!checked) {
      toast.error(t("checkFirst"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "deposit") {
        if (amt < bk.min_amount || amt > bk.max_amount) throw new Error("invalid_amount");
        if (amt > boot.user.balance) throw new Error("insufficient");
        const r = await walletBkDeposit({ data: { initData, bookmakerId: bk.id, accountId: account, amount: amt } });
        await done(r.number);
      } else {
        if (!/^[A-Za-z0-9]{4}$/.test(code)) {
          toast.error(t("invalidCode"));
          return;
        }
        const r = await walletBkWithdraw({ data: { initData, bookmakerId: bk.id, accountId: account, code } });
        await done(r.number);
      }
      onClose();
    } catch (e) {
      haptic("error");
      toast.error(errorText(t, e, range));
    } finally {
      setBusy(false);
    }
  };

  const both = bk.deposit_enabled && bk.withdraw_enabled;
  return (
    <BottomSheet
      open={!!bk}
      onOpenChange={(o) => !o && onClose()}
      headerLeft={<BkLogo bk={bk} size="sm" />}
      title={`🇺🇿 ${bk.name} | ⚡`}
    >
      <div className="space-y-4">
        {both && (
          <div className="grid grid-cols-2 rounded-2xl border border-border bg-secondary/40 p-1">
            {(["deposit", "withdraw"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn("h-12 rounded-xl font-semibold", mode === m ? "bg-accent text-foreground" : "text-muted-foreground")}
              >
                {m === "deposit" ? t("deposit") : t("withdrawBk")}
              </button>
            ))}
          </div>
        )}
        {mode === "withdraw" && (
          <div className="flex items-center gap-4 rounded-3xl border border-border bg-card/60 p-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/25 text-primary">
              <MapPin className="size-6" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("chooseAddress")}</div>
              <div className="text-lg">{bk.address}</div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-3xl border border-border bg-card/60 px-5 py-4">
          <span className="text-muted-foreground">{t("commission")}</span>
          <span className="font-semibold">{fee > 0 ? `${fee}%` : t("noCommission")}</span>
        </div>
        <Step n={1} title={t("accountNumber")}>
          <div className="flex gap-3">
            <input
              inputMode="numeric"
              value={account}
              onChange={(e) => {
                setAccount(digits(e.target.value).slice(0, 15));
                setChecked(false);
              }}
              placeholder="123456789"
              className={cn(inputCls, "flex-1 tabular")}
            />
            <button
              onClick={check}
              disabled={checking || !account}
              className={cn(
                "flex h-14 min-w-28 items-center justify-center gap-1 rounded-2xl border border-border px-4 font-semibold",
                checked ? "bg-primary/20 text-primary" : "bg-secondary/60 text-muted-foreground",
              )}
            >
              {checking ? <Loader2 className="size-5 animate-spin" /> : checked ? <><Check className="size-5" /> {t("checked")}</> : t("check")}
            </button>
          </div>
        </Step>
        {mode === "deposit" ? (
          <Step
            n={2}
            title={t("enterAmount")}
            disabled={!checked}
            right={
              <span className="flex items-center gap-1 rounded-xl border border-border bg-secondary/60 px-3 py-1 text-sm">
                <Wallet className="size-4 text-muted-foreground" /> {formatSom(boot.user.balance)} {t("som")}
              </span>
            }
          >
            <AmountInput value={amount} onChange={setAmount} disabled={!checked} placeholder={`${range.min} - ${range.max}`} />
            <div className="mt-2 text-center text-sm text-muted-foreground">
              {range.min} — {range.max} {t("som")}
              {boot.settings.deposit_bonus_percent > 0 && (
                <span className="ml-2 text-primary">{t("bonusNote", { p: boot.settings.deposit_bonus_percent })}</span>
              )}
            </div>
          </Step>
        ) : (
          <Step n={2} title={t("code4")} disabled={!checked}>
            <input
              value={code}
              disabled={!checked}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 4))}
              placeholder="A b C d"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(inputCls, "text-center font-mono text-2xl tracking-[0.5em]")}
            />
            <p className="mt-3 text-center text-sm italic text-muted-foreground">{t("codeHint")}</p>
          </Step>
        )}
        <PrimaryButton onClick={submit} disabled={busy || !checked || (mode === "deposit" ? !amt : code.length !== 4)}>
          {busy ? <Loader2 className="mx-auto size-6 animate-spin" /> : mode === "deposit" ? (amt ? `${t("deposit")} ${formatSom(amt)} ${t("som")}` : t("depositBtn")) : t("toBalance")}
        </PrimaryButton>
      </div>
    </BottomSheet>
  );
}

export function TopupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, initData, boot, haptic } = useWallet();
  const s = boot.settings;
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = useAfterSuccess();
  const amt = Number(amount || 0);
  const range = { min: formatSom(s.min_topup), max: formatSom(s.max_topup) };

  useEffect(() => {
    if (open) {
      setAmount("");
      setReceipt(null);
    }
  }, [open]);

  const upload = async (file: File) => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const allowed = ["jpg", "jpeg", "png", "webp", "heic", "pdf"];
    setUploading(true);
    try {
      const { path, signedUrl } = await walletReceiptUploadUrl({ data: { initData, ext: (allowed.includes(ext) ? ext : "jpg") as "jpg" } });
      await uploadToSignedUrl(signedUrl, file);
      setReceipt(path);
      haptic("success");
    } catch (e) {
      toast.error(errorText(t, e));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (amt < s.min_topup || amt > s.max_topup) throw new Error("invalid_amount");
      const r = await walletTopup({ data: { initData, amount: amt, receiptPath: receipt } });
      await done(r.number);
      onClose();
    } catch (e) {
      haptic("error");
      toast.error(errorText(t, e, range));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={t("topupTitle")}>
      {!s.card_number ? (
        <p className="py-8 text-center text-muted-foreground">{t("cardNotSet")}</p>
      ) : (
        <div className="space-y-4">
          <Step n={1} title={t("topupStep1")}>
            <div className="rounded-2xl bg-gradient-to-br from-primary/35 to-gold/25 p-5">
              <div className="tabular font-mono text-2xl tracking-wider">{groupCard(s.card_number)}</div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">{s.card_holder}</span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(s.card_number);
                    toast.success(t("copied"));
                  }}
                  className="flex items-center gap-1 rounded-xl bg-background/50 px-3 py-1.5 text-sm"
                >
                  <Copy className="size-4" /> {t("copied").split(" ")[0]}
                </button>
              </div>
            </div>
          </Step>
          <Step n={2} title={t("topupStep2")}>
            <AmountInput value={amount} onChange={setAmount} placeholder={`${range.min} - ${range.max}`} />
          </Step>
          <Step n={3} title={t("topupStep3")}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed font-medium",
                receipt ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {uploading ? <Loader2 className="size-5 animate-spin" /> : receipt ? <Check className="size-5" /> : <ImagePlus className="size-5" />}
              {receipt ? t("receiptUploaded") : t("uploadReceipt")}
            </button>
          </Step>
          <PrimaryButton onClick={submit} disabled={busy || uploading || !amt || !receipt}>
            {busy ? <Loader2 className="mx-auto size-6 animate-spin" /> : t("iPaid")}
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}

export function CardWithdrawSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, initData, boot, haptic } = useWallet();
  const s = boot.settings;
  const [card, setCard] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const done = useAfterSuccess();
  const amt = Number(amount || 0);
  const range = { min: formatSom(s.min_card_withdraw), max: formatSom(s.max_card_withdraw) };

  useEffect(() => {
    if (open) {
      setCard("");
      setAmount("");
    }
  }, [open]);

  const submit = async () => {
    if (card.length !== 16) {
      toast.error(t("invalidCard"));
      return;
    }
    setBusy(true);
    try {
      if (amt < s.min_card_withdraw || amt > s.max_card_withdraw) throw new Error("invalid_amount");
      if (amt > boot.user.balance) throw new Error("insufficient");
      const r = await walletCardWithdraw({ data: { initData, cardNumber: card, amount: amt } });
      await done(r.number);
      onClose();
    } catch (e) {
      haptic("error");
      toast.error(errorText(t, e, range));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={t("cardWithdrawTitle")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-3xl border border-border bg-card/60 px-5 py-4">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="size-5" /> {t("currentBalance")}
          </span>
          <span className="tabular font-semibold">
            {formatSom(boot.user.balance)} {t("som")}
          </span>
        </div>
        <Step n={1} title={t("cardNumber")}>
          <input
            inputMode="numeric"
            value={groupCard(card)}
            onChange={(e) => setCard(digits(e.target.value).slice(0, 16))}
            placeholder="8600 0000 0000 0000"
            className={cn(inputCls, "tabular font-mono tracking-wider")}
          />
        </Step>
        <Step n={2} title={t("enterAmount")}>
          <AmountInput value={amount} onChange={setAmount} placeholder={`${range.min} - ${range.max}`} />
          <div className="mt-2 text-center text-sm text-muted-foreground">
            {range.min} — {range.max} {t("som")}
          </div>
        </Step>
        <PrimaryButton onClick={submit} disabled={busy || card.length !== 16 || !amt}>
          {busy ? <Loader2 className="mx-auto size-6 animate-spin" /> : t("sendRequest")}
        </PrimaryButton>
      </div>
    </BottomSheet>
  );
}

export function ReferralsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, initData, boot } = useWallet();
  const q = useQuery({
    queryKey: ["wallet-refs", boot.user.id],
    queryFn: () => walletReferrals({ data: { initData } }),
    enabled: open,
  });
  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={t("myReferrals")}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="text-sm text-muted-foreground">{t("myReferrals")}</div>
          <div className="font-display text-2xl font-bold">{boot.user.referrals}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card/60 p-4">
          <div className="text-sm text-muted-foreground">Bonus</div>
          <div className="tabular font-display text-2xl font-bold text-primary">{formatSom(boot.user.referral_earned)}</div>
        </div>
      </div>
      {q.isLoading ? (
        <Loader2 className="mx-auto my-8 size-6 animate-spin text-muted-foreground" />
      ) : !q.data?.length ? (
        <p className="py-8 text-center text-muted-foreground">{t("noReferrals")}</p>
      ) : (
        <ul className="space-y-2">
          {q.data.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-card/60 p-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-secondary font-semibold">
                {(r.name || r.username || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate">{r.name || "—"}</div>
                {r.username && <div className="truncate text-sm text-muted-foreground">@{r.username}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}

export function LangSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, setLang } = useWallet();
  return (
    <BottomSheet open={open} onOpenChange={(o) => !o && onClose()} title={t("language")}>
      <div className="-mx-5 divide-y divide-border">
        {LANGS.map((l) => (
          <button
            key={l.id}
            onClick={() => {
              setLang(l.id as Lang);
              onClose();
            }}
            className={cn("flex w-full items-center gap-4 px-5 py-5", lang === l.id && "border-l-4 border-l-primary bg-accent/60")}
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/30 font-semibold">{l.short}</span>
            <span className={cn("flex-1 text-left text-lg", lang === l.id && "text-muted-foreground")}>{l.label}</span>
            {lang === l.id && <Check className="size-6 text-primary" />}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export function VideoModal({ slot, onClose }: { slot: string | null; onClose: () => void }) {
  const { boot, lang, t } = useWallet();
  if (!slot) return null;
  const meta = VIDEO_SLOTS.find((v) => v.slot === slot)!;
  const url = boot.videos[slot];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="relative bg-background">
          <button onClick={onClose} aria-label={t("close")} className="absolute right-3 top-3 z-10 flex size-11 items-center justify-center rounded-full bg-background/60 text-foreground">
            <X className="size-6" />
          </button>
          {url ? (
            <video src={url} controls playsInline autoPlay className="max-h-[65dvh] w-full" />
          ) : (
            <div className="flex aspect-video items-center justify-center text-muted-foreground">{t("videoMissing")}</div>
          )}
        </div>
        <div className="p-6">
          <div className="text-xl font-semibold">{meta.title[lang]}</div>
          <div className="mt-2 text-muted-foreground">{meta.description[lang]}</div>
        </div>
      </div>
    </div>
  );
}
