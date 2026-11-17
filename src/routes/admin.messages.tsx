import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  CheckCheck,
  Code,
  EyeOff,
  FlaskConical,
  ImagePlus,
  Italic,
  Link2,
  Loader2,
  Megaphone,
  Quote,
  Search,
  Send,
  Strikethrough,
  Underline,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  adminBroadcastCancel,
  adminBroadcastOverview,
  adminBroadcastSend,
  adminBroadcastTest,
  adminListUsers,
  adminMessageUser,
} from "@/lib/admin.functions";
import { balance, CAPTION_LIMIT, draftProblem, progressPercent, TEXT_LIMIT, tokenize, visibleLength, type Token } from "@/lib/broadcast-rules";
import { formatDateTime, formatSom } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errMsg, PageTitle, Panel, uploadMedia } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/messages")({
  validateSearch: z.object({ to: z.coerce.number().int().positive().optional() }),
  component: MessagesPage,
});

type Overview = Awaited<ReturnType<typeof adminBroadcastOverview>>;
type HistoryRow = Overview["history"][number];
type UserRow = Awaited<ReturnType<typeof adminListUsers>>["rows"][number];
type Audience = "all" | "uz" | "ru";
type Media = { path: string | null; type: "photo" | "video"; preview: string; uploading: boolean; name: string };

const inputCls = "w-full rounded-xl border border-input bg-secondary px-3 outline-none transition focus:border-primary";
const PHOTO_MAX = 5 * 1024 * 1024; // Telegram fetches photos by link up to 5 MB
const VIDEO_MAX = 20 * 1024 * 1024; // ...and videos up to 20 MB

function MessagesPage() {
  const { to } = Route.useSearch();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"all" | "one">(to ? "one" : "all");
  const [audience, setAudience] = useState<Audience>("all");
  const [target, setTarget] = useState<UserRow | null>(null);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [confirming, setConfirming] = useState(false);

  const overview = useQuery({
    queryKey: ["admin-broadcasts"],
    queryFn: () => adminBroadcastOverview(),
    refetchInterval: (q) => (q.state.data?.history.some((h) => h.status === "running") ? 2000 : 15000),
  });

  // Opened from the users page with ?to=<id>: pick that person.
  useEffect(() => {
    if (!to) return;
    adminListUsers({ data: { search: String(to), page: 0 } })
      .then((r) => r.rows[0] && setTarget(r.rows[0]))
      .catch(() => undefined);
  }, [to]);

  const counts = overview.data?.counts ?? { all: 0, uz: 0, ru: 0 };
  const problem = draftProblem({ text, mediaType: media?.type ?? null, buttonText, buttonUrl });
  const limit = media ? CAPTION_LIMIT : TEXT_LIMIT;
  const length = visibleLength(text);
  const ready = !problem && !media?.uploading && (mode === "all" ? counts[audience] > 0 : !!target);
  const payload = () => ({ text, mediaPath: media?.path ?? null, mediaType: media?.type ?? null, buttonText, buttonUrl });

  const reset = () => {
    setText("");
    setMedia(null);
    setButtonText("");
    setButtonUrl("");
  };

  const test = async () => {
    setBusy("test");
    try {
      const r = await adminBroadcastTest({ data: payload() });
      toast.success(`Sinov xabari yuborildi (ID ${r.to}) — Telegram'da ko'ring`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setConfirming(false);
    setBusy("send");
    try {
      if (mode === "all") {
        await adminBroadcastSend({ data: { ...payload(), audience } });
        toast.success("Yuborish boshlandi — jarayonni pastda kuzating");
      } else if (target) {
        await adminMessageUser({ data: { ...payload(), userId: target.id } });
        toast.success(`${target.first_name ?? "Foydalanuvchi"}ga yuborildi`);
      }
      reset();
      qc.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    } catch (e) {
      toast.error(errMsg(e));
      qc.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-6xl">
      <PageTitle title="Xabar yuborish" sub="Bot foydalanuvchilariga matn, rasm yoki video yuboring — hammaga yoki bitta odamga." />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <ModeCard
          active={mode === "all"}
          onClick={() => setMode("all")}
          icon={<Megaphone className="size-6" />}
          title="Barchaga"
          sub={overview.isLoading ? "…" : `${formatSom(counts.all)} ta foydalanuvchi`}
        />
        <ModeCard
          active={mode === "one"}
          onClick={() => setMode("one")}
          icon={<User className="size-6" />}
          title="Bitta odamga"
          sub="ID, @username yoki ism bo'yicha"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel>
            <SectionLabel n={1}>Kimga</SectionLabel>
            {mode === "all" ? (
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["all", "Hammasi", "🌍"],
                    ["uz", "O'zbekcha", "🇺🇿"],
                    ["ru", "Ruscha", "🇷🇺"],
                  ] as const
                ).map(([id, label, flag]) => (
                  <button
                    key={id}
                    onClick={() => setAudience(id)}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition",
                      audience === id ? "border-primary bg-primary/10" : "border-border bg-secondary hover:border-primary/40",
                    )}
                  >
                    <div className="text-sm text-muted-foreground">
                      {flag} {label}
                    </div>
                    <div className="tabular mt-0.5 text-xl font-bold">{formatSom(counts[id])}</div>
                  </button>
                ))}
              </div>
            ) : (
              <UserPicker target={target} setTarget={setTarget} />
            )}
          </Panel>

          <Panel>
            <SectionLabel n={2}>Xabar</SectionLabel>
            <Composer text={text} setText={setText} />
            <div className="mt-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Belgilang va yuqoridagi tugmalar bilan qalin, qiya, havola qiling</span>
              <span className={cn("tabular", length > limit ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {length} / {limit}
              </span>
            </div>

            <div className="mt-4">
              <MediaField media={media} setMedia={setMedia} />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.4fr]">
              <input
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
                placeholder="Tugma nomi (ixtiyoriy)"
                className={cn(inputCls, "h-10 text-sm")}
              />
              <input
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="https://t.me/kanalingiz"
                className={cn(inputCls, "h-10 text-sm")}
              />
            </div>
          </Panel>

          <Panel className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-auto">
              {problem && (text || buttonText || buttonUrl || media) ? (
                <span className="text-warning">⚠️ {problem}</span>
              ) : mode === "one" && !target ? (
                <span className="text-muted-foreground">Avval foydalanuvchini tanlang</span>
              ) : (
                <span className="text-muted-foreground">
                  {mode === "all" ? (
                    <>
                      <b className="text-foreground">{formatSom(counts[audience])}</b> kishiga yuboriladi
                    </>
                  ) : (
                    <>
                      <b className="text-foreground">{target?.first_name ?? target?.id}</b>ga yuboriladi
                    </>
                  )}
                </span>
              )}
            </div>
            <button
              disabled={!!busy || !!problem || !!media?.uploading || !overview.data?.hasTestChat}
              onClick={test}
              title={overview.data?.hasTestChat ? "Admin Telegram ID'ga yuboradi" : "Sozlamalarda admin Telegram ID kiriting"}
              className="flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-secondary px-4 text-sm font-medium transition hover:border-primary/50 disabled:opacity-50 sm:flex-none"
            >
              {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />} O'zimga sinash
            </button>
            <button
              disabled={!!busy || !ready}
              onClick={() => (mode === "all" ? setConfirming(true) : send())}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold sm:flex-none text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
            >
              {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Yuborish
            </button>
          </Panel>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telegram'da ko'rinishi</div>
          <PhonePreview text={text} media={media} buttonText={buttonText} buttonUrl={buttonUrl} />
        </div>
      </div>

      <History rows={overview.data?.history ?? []} loading={overview.isLoading} />

      {confirming && (
        <ConfirmDialog
          count={counts[audience]}
          audience={audience}
          onCancel={() => setConfirming(false)}
          onConfirm={send}
        />
      )}
    </div>
  );
}

function ModeCard({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-3 text-left transition sm:gap-4 sm:p-4",
        active ? "border-primary bg-primary/10 shadow-glow" : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl transition sm:size-12",
          active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground group-hover:text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display font-bold sm:text-lg">{title}</span>
        <span className="block truncate text-xs text-muted-foreground sm:text-sm">{sub}</span>
      </span>
    </button>
  );
}

function SectionLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">{n}</span>
      {children}
    </div>
  );
}

// ---------- Who ----------
function UserPicker({ target, setTarget }: { target: UserRow | null; setTarget: (u: UserRow | null) => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const q = useQuery({
    queryKey: ["admin-users-pick", debounced],
    queryFn: () => adminListUsers({ data: { search: debounced, page: 0 } }),
    enabled: !target && debounced.length > 0,
  });

  if (target)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/50 bg-primary/10 p-3">
        <Avatar name={target.first_name ?? target.username ?? "?"} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {[target.first_name, target.last_name].filter(Boolean).join(" ") || "—"}
            {target.is_blocked && <span className="ml-2 rounded bg-destructive/15 px-1.5 text-xs text-destructive">bloklangan</span>}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {target.username ? `@${target.username} · ` : ""}
            <span className="font-mono">{target.id}</span> · {target.lang === "ru" ? "🇷🇺" : "🇺🇿"}
          </div>
        </div>
        <button onClick={() => setTarget(null)} aria-label="Boshqasini tanlash" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary">
          <X className="size-4" />
        </button>
      </div>
    );

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Telegram ID, @username yoki ism"
          className={cn(inputCls, "h-11 pl-9 text-sm")}
        />
      </div>
      {debounced && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-border">
          {q.isLoading ? (
            <Loader2 className="mx-auto my-6 size-5 animate-spin text-primary" />
          ) : !q.data?.rows.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Hech kim topilmadi</div>
          ) : (
            q.data.rows.slice(0, 12).map((u) => (
              <button
                key={u.id}
                onClick={() => setTarget(u)}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition last:border-0 hover:bg-secondary"
              >
                <Avatar name={u.first_name ?? u.username ?? "?"} small />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.username ? `@${u.username} · ` : ""}
                    <span className="font-mono">{u.id}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep font-bold text-primary-foreground",
        small ? "size-8 text-sm" : "size-11 text-lg",
      )}
    >
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

// ---------- What ----------
const TOOLS = [
  { icon: Bold, label: "Qalin", open: "<b>", close: "</b>" },
  { icon: Italic, label: "Qiya", open: "<i>", close: "</i>" },
  { icon: Underline, label: "Tagiga chizilgan", open: "<u>", close: "</u>" },
  { icon: Strikethrough, label: "Ustidan chizilgan", open: "<s>", close: "</s>" },
  { icon: Code, label: "Nusxa olinadigan (kod)", open: "<code>", close: "</code>" },
  { icon: Quote, label: "Iqtibos", open: "<blockquote>", close: "</blockquote>" },
  { icon: EyeOff, label: "Yashirin (spoiler)", open: "<tg-spoiler>", close: "</tg-spoiler>" },
] as const;

function Composer({ text, setText }: { text: string; setText: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (open: string, close: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = text.slice(0, a) + open + text.slice(a, b) + close + text.slice(b);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + open.length, b + open.length);
    });
  };
  const link = () => {
    const url = window.prompt("Havola (https://...)", "https://");
    if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return;
    wrap(`<a href="${url.trim().replace(/"/g, "")}">`, "</a>");
  };
  return (
    <div className="overflow-hidden rounded-xl border border-input bg-secondary transition focus-within:border-primary">
      <div className="flex flex-wrap gap-0.5 border-b border-border px-1.5 py-1">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.label}
            aria-label={t.label}
            onClick={() => wrap(t.open, t.close)}
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-card hover:text-foreground"
          >
            <t.icon className="size-4" />
          </button>
        ))}
        <button type="button" title="Havola" aria-label="Havola" onClick={link} className="rounded-lg p-2 text-muted-foreground transition hover:bg-card hover:text-foreground">
          <Link2 className="size-4" />
        </button>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={"Assalomu alaykum! 🎉\nBugun barcha to'ldirishlarga +5% bonus…"}
        className="block w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none"
      />
    </div>
  );
}

function MediaField({ media, setMedia }: { media: Media | null; setMedia: (m: Media | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File) => {
    const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "photo" : null;
    if (!type) return void toast.error("Faqat rasm yoki video");
    if (type === "photo" && file.size > PHOTO_MAX) return void toast.error("Rasm 5 MB dan oshmasin");
    if (type === "video" && file.size > VIDEO_MAX) return void toast.error("Video 20 MB dan oshmasin");
    const preview = URL.createObjectURL(file);
    setMedia({ path: null, type, preview, uploading: true, name: file.name });
    try {
      const path = await uploadMedia("broadcast", file);
      setMedia({ path, type, preview, uploading: false, name: file.name });
    } catch (e) {
      setMedia(null);
      toast.error(errMsg(e));
    }
  };
  if (media)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary p-2">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-card">
          {media.type === "photo" ? (
            <img src={media.preview} alt="" className="size-full object-cover" />
          ) : (
            <video src={media.preview} className="size-full object-cover" muted />
          )}
          {media.uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{media.name}</div>
          <div className="text-xs text-muted-foreground">
            {media.uploading ? "Yuklanmoqda…" : media.type === "photo" ? "Rasm · matn rasm ostida chiqadi" : "Video · matn video ostida chiqadi"}
          </div>
        </div>
        <button onClick={() => setMedia(null)} aria-label="Olib tashlash" className="rounded-lg p-2 text-muted-foreground hover:bg-card">
          <X className="size-4" />
        </button>
      </div>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) void pick(f);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-4 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
      >
        <ImagePlus className="size-5" /> Rasm yoki video qo'shish <span className="text-xs">(ixtiyoriy)</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void pick(f);
        }}
      />
    </>
  );
}

// ---------- Preview ----------
function renderTokens(tokens: Token[]): ReactNode[] {
  let i = 0;
  const walk = (until: string | null): ReactNode[] => {
    const out: ReactNode[] = [];
    while (i < tokens.length) {
      const t = tokens[i++]!;
      if (t.kind === "text") out.push(t.text);
      else if (t.kind === "close") {
        if (t.tag === until) return out;
      } else {
        const kids = walk(t.tag);
        const k = i;
        if (t.tag === "b") out.push(<b key={k}>{kids}</b>);
        else if (t.tag === "i") out.push(<i key={k}>{kids}</i>);
        else if (t.tag === "u") out.push(<u key={k}>{kids}</u>);
        else if (t.tag === "s") out.push(<s key={k}>{kids}</s>);
        else if (t.tag === "code" || t.tag === "pre")
          out.push(
            <code key={k} className="rounded bg-background/40 px-1 font-mono text-[0.9em] text-primary">
              {kids}
            </code>,
          );
        else if (t.tag === "blockquote")
          out.push(
            <span key={k} className="my-1 block rounded-md border-l-[3px] border-primary bg-primary/10 px-2 py-1">
              {kids}
            </span>,
          );
        else if (t.tag === "tg-spoiler")
          out.push(
            <span key={k} className="rounded bg-muted-foreground/40 text-transparent">
              {kids}
            </span>,
          );
        else if (t.tag === "a")
          out.push(
            <span key={k} className="text-primary underline underline-offset-2">
              {kids}
            </span>,
          );
      }
    }
    return out;
  };
  return walk(null);
}

function PhonePreview({ text, media, buttonText, buttonUrl }: { text: string; media: Media | null; buttonText: string; buttonUrl: string }) {
  const nodes = useMemo(() => renderTokens(balance(tokenize(text))), [text]);
  const empty = !text.trim() && !media;
  const time = new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="overflow-hidden rounded-[2rem] border-4 border-secondary bg-card shadow-glow">
      <div className="flex items-center gap-3 border-b border-border bg-secondary px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-sm font-bold text-primary-foreground">K</span>
        <div>
          <div className="text-sm font-semibold">KASSA 24/7</div>
          <div className="text-xs text-muted-foreground">bot</div>
        </div>
      </div>
      <div className="min-h-[420px] bg-[radial-gradient(circle_at_20%_10%,var(--secondary),transparent_55%),radial-gradient(circle_at_90%_90%,var(--secondary),transparent_50%)] p-3">
        {empty ? (
          <div className="flex h-[400px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Xabar yozing — bu yerda mijoz ko'radigan ko'rinish chiqadi
          </div>
        ) : (
          <div className="max-w-[88%]">
            <div className="overflow-hidden rounded-2xl rounded-bl-md bg-secondary shadow-sm">
              {media &&
                (media.type === "photo" ? (
                  <img src={media.preview} alt="" className="max-h-72 w-full object-cover" />
                ) : (
                  <video src={media.preview} className="max-h-72 w-full bg-background object-cover" muted controls />
                ))}
              {(text.trim() || !media) && (
                <div className="whitespace-pre-wrap break-words px-3 pb-1 pt-2 text-[14px] leading-snug">{nodes}</div>
              )}
              <div className="flex items-center justify-end gap-1 px-3 pb-1.5 text-[11px] text-muted-foreground">
                {time} <CheckCheck className="size-3.5 text-primary" />
              </div>
            </div>
            {buttonText.trim() && (
              <div
                className={cn(
                  "mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-secondary/80 py-2 text-sm font-medium backdrop-blur",
                  !buttonUrl.trim() && "opacity-60",
                )}
              >
                {buttonText} <Link2 className="size-3.5" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- History ----------
const AUD_LABEL: Record<string, string> = { all: "Hammaga", uz: "🇺🇿 O'zbekcha", ru: "🇷🇺 Ruscha" };
const STATUS: Record<string, { label: string; cls: string }> = {
  running: { label: "Yuborilmoqda", cls: "bg-warning/15 text-warning" },
  done: { label: "Yakunlandi", cls: "bg-primary/15 text-primary" },
  failed: { label: "Xato", cls: "bg-destructive/15 text-destructive" },
  cancelled: { label: "To'xtatildi", cls: "bg-muted text-muted-foreground" },
};

function plain(text: string) {
  return tokenize(text)
    .map((t) => (t.kind === "text" ? t.text : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function History({ rows, loading }: { rows: HistoryRow[]; loading: boolean }) {
  const qc = useQueryClient();
  return (
    <div className="mt-10">
      <h2 className="mb-3 font-display text-xl font-bold">Yuborilgan xabarlar</h2>
      {loading ? (
        <Loader2 className="mx-auto my-10 size-7 animate-spin text-primary" />
      ) : !rows.length ? (
        <Panel className="py-10 text-center text-muted-foreground">Hali xabar yuborilmagan</Panel>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const done = r.sent + r.failed + r.blocked;
            const pct = progressPercent(r.total, done);
            const st = STATUS[r.status] ?? STATUS["done"]!;
            return (
              <Panel key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", r.kind === "all" ? "bg-primary/15 text-primary" : "bg-secondary text-foreground")}>
                    {r.kind === "all" ? <Users className="size-5" /> : <User className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {r.kind === "all" ? AUD_LABEL[r.audience] ?? "Hammaga" : (r.target_name ?? "Foydalanuvchi")}
                        {r.kind === "one" && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.target_user_id}</span>}
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", st.cls)}>{st.label}</span>
                      {r.media_type && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{r.media_type === "photo" ? "🖼 Rasm" : "🎬 Video"}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{plain(r.text) || "—"}</p>

                    {r.kind === "all" && (
                      <>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn("h-full rounded-full transition-all duration-700", r.status === "running" ? "bg-gradient-to-r from-primary-deep to-primary" : "bg-primary")}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="tabular text-muted-foreground">
                            {formatSom(done)} / {formatSom(r.total)} · {pct}%
                          </span>
                          <span className="text-primary">✅ {formatSom(r.sent)} yetkazildi</span>
                          <span className="text-muted-foreground">🚫 {formatSom(r.blocked)} botni bloklagan</span>
                          {r.failed > 0 && <span className="text-destructive">⚠️ {formatSom(r.failed)} xato</span>}
                          {r.status === "running" && (
                            <button
                              onClick={async () => {
                                if (!confirm("Yuborishni to'xtatasizmi?")) return;
                                try {
                                  await adminBroadcastCancel({ data: { id: r.id } });
                                  qc.invalidateQueries({ queryKey: ["admin-broadcasts"] });
                                } catch (e) {
                                  toast.error(errMsg(e));
                                }
                              }}
                              className="ml-auto flex items-center gap-1 rounded-lg bg-destructive/15 px-2.5 py-1 font-medium text-destructive"
                            >
                              <XCircle className="size-3.5" /> To'xtatish
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    {r.kind === "one" && r.status !== "done" && (
                      <p className="mt-1 text-xs text-destructive">{r.blocked ? "Botni bloklagan" : r.error}</p>
                    )}
                    {r.kind === "all" && r.status === "failed" && r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({ count, audience, onCancel, onConfirm }: { count: number; audience: Audience; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-glow" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Megaphone className="size-7" />
        </div>
        <h3 className="mt-4 text-center font-display text-xl font-bold">
          {formatSom(count)} kishiga yuborilsinmi?
        </h3>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {AUD_LABEL[audience]} · Yuborilgan xabarni qaytarib bo'lmaydi. Jarayonni pastda kuzatib, kerak bo'lsa to'xtatishingiz mumkin.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="h-11 rounded-xl bg-secondary font-medium">
            Bekor qilish
          </button>
          <button autoFocus onClick={onConfirm} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground">
            <Send className="size-4" /> Ha, yuborish
          </button>
        </div>
      </div>
    </div>
  );
}
