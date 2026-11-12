import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { adminBotStatus, adminConnectBot, adminGetSettings, adminSaveSettings } from "@/lib/admin.functions";
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
