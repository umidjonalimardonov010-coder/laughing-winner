import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Copy, KeyRound, Loader2, Plug, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  adminBotStatus,
  adminCashdeskStatus,
  adminConnectBot,
  adminGetSettings,
  adminSaveCashdesk,
  adminSaveSettings,
  adminTestCashdesk,
} from "@/lib/admin.functions";
import { errMsg, PageTitle, Panel } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

const GROUPS: { title: string; fields: { key: string; label: string; hint?: string; placeholder?: string }[] }[] = [
  {
    title: "Umumiy",
    fields: [{ key: "brand_name", label: "Xizmat nomi", hint: "Bot xabarlarida va ilovada ko'rinadi", placeholder: "Kassa 24/7" }],
  },
  {
    title: "Hamyonni to'ldirish kartasi",
    fields: [
      { key: "card_number", label: "Karta raqami", hint: "Foydalanuvchi shu kartaga pul o'tkazadi", placeholder: "8600 0000 0000 0000" },
      { key: "card_holder", label: "Karta egasi", placeholder: "ISM FAMILIYA" },
      { key: "min_topup", label: "Minimal to'ldirish (so'm)" },
      { key: "max_topup", label: "Maksimal to'ldirish (so'm)" },
    ],
  },
  {
    title: "Kartaga yechish",
    fields: [
      { key: "min_card_withdraw", label: "Minimal yechish (so'm)" },
      { key: "max_card_withdraw", label: "Maksimal yechish (so'm)" },
    ],
  },
  {
    title: "Bonuslar",
    fields: [
      { key: "deposit_bonus_percent", label: "Bukmekerga to'ldirish bonusi, %", hint: "Admin BK hisobiga summa + bonusni tushiradi" },
      { key: "referral_percent", label: "Referal bonusi, %", hint: "Taklif qilgan odam do'stining har bir to'ldirishidan oladi" },
    ],
  },
  {
    title: "Aloqa",
    fields: [
      { key: "support_username", label: "Qo'llab-quvvatlash (Telegram username)", placeholder: "@support" },
      { key: "channel_username", label: "Kanal (Telegram username)", placeholder: "@kanal" },
      {
        key: "admin_chat_id",
        label: "Adminlarning Telegram ID raqamlari",
        hint: "Yangi so'rov kelganda shu odamlarga xabar boradi. Bir nechta bo'lsa vergul bilan yozing. ID ni @userinfobot dan bilish mumkin.",
        placeholder: "123456789, 987654321",
      },
    ],
  },
];

function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => adminGetSettings() });
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);

  return (
    <div className="max-w-3xl">
      <PageTitle title="Sozlamalar" sub="Bot va ilova ishlashi uchun kerakli ma'lumotlar." />
      <BotPanel />
      <CashdeskPanel />
      {q.isLoading ? (
        <Loader2 className="mx-auto my-16 size-8 animate-spin text-primary" />
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const out: Record<string, string> = {};
              for (const g of GROUPS) for (const f of g.fields) out[f.key] = form[f.key] ?? "";
              await adminSaveSettings({ data: out });
              toast.success("Sozlamalar saqlandi");
              qc.invalidateQueries({ queryKey: ["admin-settings"] });
            } catch (err) {
              toast.error(errMsg(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {GROUPS.map((g) => (
            <Panel key={g.title} className="space-y-4">
              <div className="font-semibold">{g.title}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <label key={f.key} className={f.hint && f.hint.length > 60 ? "block space-y-1.5 sm:col-span-2" : "block space-y-1.5"}>
                    <span className="text-sm font-medium">{f.label}</span>
                    <input
                      value={form[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary"
                    />
                    {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
                  </label>
                ))}
              </div>
            </Panel>
          ))}
          <button disabled={busy} className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="mx-auto size-5 animate-spin" /> : "Saqlash"}
          </button>
        </form>
      )}
    </div>
  );
}

function BotPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-bot"], queryFn: () => adminBotStatus() });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data && !url) setUrl(q.data.suggestedUrl);
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = q.data;
  const connected = !!d?.webhook?.url;

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">Telegram bot</div>
        <button onClick={() => q.refetch()} className="text-muted-foreground" aria-label="Yangilash">
          <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : d?.mode === "none" ? (
        <p className="flex items-center gap-2 text-warning">
          <XCircle className="size-5" /> Bot hali ulanmagan. Avval Telegram botni loyihaga ulash kerak.
        </p>
      ) : (
        <>
          <div className="space-y-1 text-sm">
            <div>
              Bot: {d?.bot ? <b>@{d.bot.username}</b> : <span className="text-destructive">{"error" in (d ?? {}) ? String((d as { error?: string }).error) : "—"}</span>}
            </div>
            <div className="flex items-center gap-2">
              {connected ? <CheckCircle2 className="size-4 text-primary" /> : <XCircle className="size-4 text-warning" />}
              {connected ? `Ulangan: ${d?.webhook?.url}` : "Xabarlarni qabul qilish hali yoqilmagan"}
            </div>
            {d?.webhook?.lastError && <div className="text-destructive">Oxirgi xato: {d.webhook.lastError}</div>}
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Saytning ochiq manzili</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-secondary px-3 font-mono text-sm outline-none focus:border-primary"
            />
            <span className="block text-xs text-muted-foreground">
              Bot va WALLET tugmasi shu manzil orqali ishlaydi. Railway'ga ko'chirganda yangi manzilni yozib, qayta bosing.
            </span>
          </label>
          <button
            disabled={busy || !url}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await adminConnectBot({ data: { url } });
                toast.success(`@${r.bot} ulandi`);
                qc.invalidateQueries({ queryKey: ["admin-bot"] });
                qc.invalidateQueries({ queryKey: ["admin-settings"] });
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Botni ulash / yangilash
          </button>
        </>
      )}
    </Panel>
  );
}

const inputCls = "h-10 w-full rounded-xl border border-input bg-secondary px-3 font-mono text-sm outline-none focus:border-primary";

function CashdeskPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-cashdesk"], queryFn: () => adminCashdeskStatus() });
  const [cashdeskId, setCashdeskId] = useState("");
  const [cashierPass, setCashierPass] = useState("");
  const [hash, setHash] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [lng, setLng] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test" | "clear">("");
  const [test, setTest] = useState<Awaited<ReturnType<typeof adminTestCashdesk>> | null>(null);
  const d = q.data;
  useEffect(() => {
    if (!d) return;
    setCashdeskId(d.cashdeskId);
    setApiUrl(d.apiUrl);
    setLng(d.lng);
  }, [d]);

  const save = async (clear = false) => {
    setBusy(clear ? "clear" : "save");
    setTest(null);
    try {
      await adminSaveCashdesk({ data: { cashdeskId, cashierPass, hash, apiUrl, lng, clear } });
      setCashierPass("");
      setHash("");
      toast.success(clear ? "Linebet API o'chirildi" : "Linebet API saqlandi");
      await qc.invalidateQueries({ queryKey: ["admin-cashdesk"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4" /> Linebet API (avto to'ldirish va yechish)
        </div>
        <button onClick={() => q.refetch()} className="text-muted-foreground" aria-label="Yangilash">
          <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : (
        <>
          <p className="flex items-start gap-2 text-sm">
            {d?.configured ? (
              <>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Avto rejim yoqilgan: Linebet'ga to'ldirish va yechish so'rovlari o'zi bajariladi.</span>
              </>
            ) : (
              <>
                <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>Qo'lda rejim: kalitlar kiritilmagan, Linebet so'rovlarini o'zingiz tasdiqlaysiz.</span>
              </>
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Kassa ID (cashdeskid)</span>
              <input value={cashdeskId} onChange={(e) => setCashdeskId(e.target.value)} inputMode="numeric" placeholder="1234567" className={inputCls} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Kassir paroli (cashierpass)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={cashierPass}
                onChange={(e) => setCashierPass(e.target.value)}
                placeholder={d?.hasPass ? "Saqlangan ✓ — almashtirish uchun yozing" : "Parol"}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium">Hash kaliti</span>
              <input
                type="password"
                autoComplete="off"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                placeholder={d?.hasHash ? "Saqlangan ✓ — almashtirish uchun yozing" : "Hash"}
                className={inputCls}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">API manzili (ixtiyoriy)</span>
              <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://partners.servcul.com/CashdeskBotAPI/" className={inputCls} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Til (ixtiyoriy)</span>
              <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="ru" className={inputCls} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Kalitlarni Linebet kassa (agent) menejeringizdan olasiz. Parol va hash faqat serverda saqlanadi va bu yerda qayta ko'rsatilmaydi.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              disabled={!!busy}
              onClick={() => save(false)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : null} Saqlash
            </button>
            {d?.configured && (
              <button
                disabled={!!busy}
                onClick={() => {
                  if (confirm("Linebet API o'chirilsinmi? So'rovlar qo'lda rejimga o'tadi.")) save(true);
                }}
                className="h-11 rounded-xl border border-destructive px-4 font-semibold text-destructive disabled:opacity-60"
              >
                {busy === "clear" ? <Loader2 className="mx-auto size-4 animate-spin" /> : "O'chirish"}
              </button>
            )}
          </div>
          <CashdeskCheck
            busy={busy === "test"}
            disabled={!!busy}
            canTest={!!(cashierPass.trim() || d?.hasPass)}
            playerId={playerId}
            setPlayerId={setPlayerId}
            result={test}
            unsaved={!!(cashierPass.trim() || hash.trim() || cashdeskId !== (d?.cashdeskId ?? ""))}
            onTest={async () => {
              setBusy("test");
              setTest(null);
              try {
                setTest(await adminTestCashdesk({ data: { playerId, cashdeskId, cashierPass, hash, apiUrl, lng } }));
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setBusy("");
              }
            }}
          />
        </>
      )}
    </Panel>
  );
}

type TestResult = Awaited<ReturnType<typeof adminTestCashdesk>>;

const STEP_LABEL: Record<TestResult["verdict"]["steps"][number]["id"], string> = {
  keys: "Kalitlar to'liq (Kassa ID, parol, hash)",
  reach: "Linebet serveri javob berdi",
  ip: "Server IP manziliga ruxsat bor",
  auth: "Linebet kalitlarni qabul qildi",
  player: "O'yinchi topildi",
};

function CashdeskCheck({
  busy,
  disabled,
  canTest,
  playerId,
  setPlayerId,
  result,
  unsaved,
  onTest,
}: {
  busy: boolean;
  disabled: boolean;
  canTest: boolean;
  playerId: string;
  setPlayerId: (v: string) => void;
  result: TestResult | null;
  unsaved: boolean;
  onTest: () => void;
}) {
  const v = result?.verdict;
  const tone =
    v?.level === "ok"
      ? "border-primary/50 bg-primary/10"
      : v?.level === "warn"
        ? "border-warning/50 bg-warning/10"
        : "border-destructive/50 bg-destructive/10";
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <div className="text-sm font-medium">Ulanishni xavfsiz tekshirish</div>
          <div className="text-xs text-muted-foreground">Faqat kassa balansi so'raladi, hech qanday pul o'tkazilmaydi. Yozilgan (hali saqlanmagan) qiymatlar bilan ham tekshiradi.</div>
        </div>
      </div>
      <input
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value.replace(/\D/g, ""))}
        inputMode="numeric"
        placeholder="Linebet o'yinchi ID (ixtiyoriy)"
        className={inputCls}
      />
      <button
        disabled={disabled || !canTest}
        onClick={onTest}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary font-semibold disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} {busy ? "Tekshirilmoqda…" : "Ulanishni tekshirish"}
      </button>
      {!canTest && <p className="text-xs text-warning">Avval kassir parolini kiriting, keyin tekshirish mumkin.</p>}

      {v && (
        <div className={`space-y-3 rounded-xl border p-3 ${tone}`} role="status">
          <div className="flex items-start gap-2">
            {v.level === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
            ) : v.level === "warn" ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0">
              <div className="font-semibold">{v.title}</div>
              {v.hint && <div className="text-sm text-muted-foreground">{v.hint}</div>}
            </div>
          </div>
          <ul className="space-y-1.5 text-sm">
            {v.steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                {s.state === "ok" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                ) : s.state === "fail" ? (
                  <XCircle className="size-4 shrink-0 text-destructive" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground/50" />
                )}
                <span className={s.state === "skip" ? "text-muted-foreground" : ""}>
                  {STEP_LABEL[s.id]}
                  {s.note ? <span className="text-muted-foreground"> · {s.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {result?.balance && (
            <div className="rounded-lg bg-background/60 px-3 py-2 text-sm">
              Kassa balansi: <b className="tabular">{result.balance.balance.toLocaleString("ru-RU")}</b>
              {result.balance.limit ? ` · Limit: ${result.balance.limit.toLocaleString("ru-RU")}` : ""}
            </div>
          )}
          {result?.serverIp && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Server IP (Linebet ruxsat berishi kerak):</span>
              <button
                className="flex items-center gap-1 font-mono font-semibold text-primary"
                onClick={() => {
                  navigator.clipboard?.writeText(result.serverIp ?? "");
                  toast.success("IP nusxalandi");
                }}
              >
                {result.serverIp} <Copy className="size-3.5" />
              </button>
            </div>
          )}
          {unsaved && v.level === "ok" && <p className="text-xs font-medium text-primary">Hammasi to'g'ri — endi «Saqlash» tugmasini bosing.</p>}
          {result && <p className="text-[11px] text-muted-foreground">Tekshirildi: {new Date(result.checkedAt).toLocaleTimeString("ru-RU")}</p>}
        </div>
      )}
    </div>
  );
}
