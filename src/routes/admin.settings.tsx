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
  adminHamyonStatus,
  adminSaveCashdesk,
  adminSaveHamyon,
  adminCheckHamyon,
  adminSaveSettings,
  adminTestCashdesk,
} from "@/lib/admin.functions";
import { errMsg, PageTitle, Panel } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

type Field = {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Several lines (textarea). */
  multiline?: boolean;
};

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Umumiy",
    fields: [{ key: "brand_name", label: "Xizmat nomi", hint: "Bot xabarlarida va tavsifida ko'rinadi", placeholder: "Kassa 24/7" }],
  },
  {
    title: "To'lov qabul qilinadigan karta",
    fields: [
      { key: "card_number", label: "Karta raqami", hint: "Qo'lda rejim uchun: mijoz shu kartaga o'tkazadi, siz ✅ bosasiz. HamyonAPI ulangan bo'lsa kartani HamyonAPI beradi va bu ishlatilmaydi.", placeholder: "8600 0000 0000 0000" },
      { key: "card_holder", label: "Karta egasi", placeholder: "ISM FAMILIYA" },
      { key: "min_topup", label: "Minimal to'ldirish (so'm)", hint: "Bukmekerda min summa yozilmagan bo'lsa" },
      { key: "max_topup", label: "Maksimal to'ldirish (so'm)", hint: "Bukmekerda max summa yozilmagan bo'lsa" },
    ],
  },
  {
    title: "Xavfsizlik va limitlar",
    fields: [
      {
        key: "suspicious_repeat_count",
        label: "Shubhali so'rov: 24 soatda bir xil karta/BK hisob necha marta",
        hint: "Shuncha marta (yoki karta/BK hisob boshqa odamda ham ishlatilgan bo'lsa) yechish so'rovi ⚠️ shubhali deb belgilanadi: kassadan avto yechilmaydi, admin ikki bosqichda tasdiqlaydi. 0 — faqat boshqa odam tekshiruvi.",
        placeholder: "3",
      },
    ],
  },
  {
    title: "Bonuslar",
    fields: [
      { key: "deposit_bonus_percent", label: "Hisob to'ldirish bonusi, %", hint: "Mijoz BK hisobiga summa + shu foizni oladi («Olish» summasi). 0 — bonus yo'q, berish = olish." },
    ],
  },
  {
    title: "💰 Bonus olish (botdagi menyu)",
    fields: [
      {
        key: "bonus_referral_reward",
        label: "Har bir do'st uchun bonus (so'm)",
        hint: "Taklif qilingan do'st birinchi marta hisob to'ldirganda (admin tasdiqlagach) taklif qilganga shuncha so'm tushadi. 0 — o'chirilgan.",
        placeholder: "500",
      },
      { key: "bonus_daily_min", label: "Kunlik bonus — eng kam (so'm)", placeholder: "1000" },
      {
        key: "bonus_daily_max",
        label: "Kunlik bonus — eng ko'p (so'm)",
        hint: "Har kuni (Toshkent vaqti bilan) bir marta shu oraliqdagi tasodifiy summa beriladi. Ikkalasi teng bo'lsa — har kuni bir xil. 0 — o'chirilgan.",
        placeholder: "3000",
      },
      { key: "bonus_withdraw_min", label: "LINEBET'ga yechish — eng kam summa (so'm)", hint: "Bonus balans shundan kam bo'lsa yechib bo'lmaydi.", placeholder: "10000" },
      {
        key: "bonus_withdraw_mode",
        label: "LINEBET'ga yechish qanday bo'lsin",
        hint: "Avto — kassa orqali darhol o'tadi (kassa ulangan bo'lsa). Admin — har bir so'rovga siz ✅ bosasiz. ❌ bosilsa pul mijozning bonus balansiga qaytadi.",
        options: [
          { value: "manual", label: "Admin tasdiqlaydi" },
          { value: "auto", label: "Avtomatik (kassa orqali)" },
        ],
      },
    ],
  },
  {
    title: "Aloqa",
    fields: [
      { key: "support_username", label: "«💬 Chat» tugmasi — qo'llab-quvvatlash", hint: "Telegram username yoki havola. Bog'lanish bo'limida chiqadi.", placeholder: "@support" },
      { key: "channel_username", label: "«👥 Rasmiy kanal» tugmasi", hint: "Telegram username yoki havola (t.me/...).", placeholder: "@kanal" },
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
      <HamyonPanel />
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
              for (const g of GROUPS) for (const f of g.fields) out[f.key] = form[f.key] || (f.options?.[0]?.value ?? "");
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
                  <label
                    key={f.key}
                    className={f.multiline || (f.hint && f.hint.length > 60) ? "block space-y-1.5 sm:col-span-2" : "block space-y-1.5"}
                  >
                    <span className="text-sm font-medium">{f.label}</span>
                    {f.multiline ? (
                      <textarea
                        value={form[f.key] ?? ""}
                        placeholder={f.placeholder}
                        rows={4}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full rounded-xl border border-input bg-secondary px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                      />
                    ) : f.options ? (
                      <select
                        value={form[f.key] || f.options[0]?.value}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary"
                      >
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={form[f.key] ?? ""}
                        placeholder={f.placeholder}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-input bg-secondary px-3 outline-none focus:border-primary"
                      />
                    )}
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
              Bot shu manzil orqali ishlaydi. Railway'ga ko'chirganda yangi manzilni yozib, qayta bosing.
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

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        <input readOnly value={value} className={inputCls} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          aria-label={`${label} nusxalash`}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Nusxalandi"))}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary"
        >
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  );
}

function HamyonPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-hamyon"], queryFn: () => adminHamyonStatus() });
  const [shopId, setShopId] = useState("");
  const [shopKey, setShopKey] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "clear" | "check">("");
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const d = q.data;
  useEffect(() => {
    if (d) setShopId(d.shopId);
  }, [d]);

  const save = async (clear = false) => {
    setBusy(clear ? "clear" : "save");
    try {
      setCheck(null);
      const r = await adminSaveHamyon({ data: { shopId, shopKey, clear } });
      setShopKey("");
      if (clear) toast.success("HamyonAPI o'chirildi");
      else {
        const text = r.swapped ? "Ulandi ✓ (Shop ID va Shop key joyi almashgan edi — to'g'rilandi)" : "Ulandi ✓ HamyonAPI kalitlarni qabul qildi";
        setCheck({ ok: true, text });
        toast.success(text);
      }
      await qc.invalidateQueries({ queryKey: ["admin-hamyon"] });
    } catch (e) {
      const text = errMsg(e);
      if (!clear) setCheck({ ok: false, text });
      toast.error(text);
    } finally {
      setBusy("");
    }
  };

  const runCheck = async () => {
    setBusy("check");
    try {
      const r = await adminCheckHamyon();
      setCheck(r.ok ? { ok: true, text: "Ulangan ✓ HamyonAPI kalitlarni qabul qildi" } : { ok: false, text: r.error });
    } catch (e) {
      setCheck({ ok: false, text: errMsg(e) });
    } finally {
      setBusy("");
    }
  };

  return (
    <Panel className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-4" /> HamyonAPI (avto to'lov qabul qilish)
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
                <span>Avto to'lov yoqilgan: kartani HamyonAPI beradi, pul tushishi bilan so'rov o'zi tasdiqlanadi.</span>
              </>
            ) : (
              <>
                <XCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>Avto to'lov o'chiq: mijoz yuqoridagi kartaga o'tkazadi, siz ✅ bosasiz.</span>
              </>
            )}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Shop ID</span>
              <input value={shopId} onChange={(e) => setShopId(e.target.value)} placeholder="396" className={inputCls} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Shop key</span>
              <input
                type="password"
                autoComplete="new-password"
                value={shopKey}
                onChange={(e) => setShopKey(e.target.value)}
                placeholder={d?.hasKey ? "Saqlangan ✓ — almashtirish uchun yozing" : "Shop key"}
                className={inputCls}
              />
            </label>
          </div>
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
                onClick={runCheck}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 font-semibold disabled:opacity-60"
              >
                {busy === "check" ? <Loader2 className="size-4 animate-spin" /> : null} Tekshirish
              </button>
            )}
            {d?.configured && (
              <button
                disabled={!!busy}
                onClick={() => {
                  if (confirm("HamyonAPI o'chirilsinmi? Hisob to'ldirish qo'lda rejimga o'tadi.")) save(true);
                }}
                className="h-11 rounded-xl border border-destructive px-4 font-semibold text-destructive disabled:opacity-60"
              >
                {busy === "clear" ? <Loader2 className="mx-auto size-4 animate-spin" /> : "O'chirish"}
              </button>
            )}
          </div>
          {check && (
            <p className={`flex items-start gap-2 text-sm ${check.ok ? "text-primary" : "text-destructive"}`}>
              {check.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
              <span>{check.text}</span>
            </p>
          )}
          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="text-sm">
              @HamyonAPIBot → do'kon sozlamalariga shu ikki manzilni qo'ying (pul tushganini bot shu orqali biladi):
            </div>
            {d && <CopyRow label="prepare_url" value={d.prepareUrl} />}
            {d && <CopyRow label="complete_url" value={d.completeUrl} />}
            <p className="text-xs text-muted-foreground">
              Manzil Railway'dagi saytingiz bo'lishi kerak. Noto'g'ri bo'lsa, yuqoridagi «Saytning ochiq manzili»ni to'g'rilab, «Botni ulash» ni bosing.
            </p>
          </div>
        </>
      )}
    </Panel>
  );
}

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
