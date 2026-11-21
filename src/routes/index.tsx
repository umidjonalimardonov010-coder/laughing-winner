import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Clock, CreditCard, Percent, ShieldCheck } from "lucide-react";
import marble from "@/assets/linebet-bg.jpg";
import { publicInfo } from "@/lib/public.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kassa 24/7 — bukmeker hisobini tez to'ldirish va yechish" },
      {
        name: "description",
        content:
          "Telegram bot orqali LINEBET va boshqa bukmeker hisoblarini UZCARD/HUMO karta bilan 24/7 tez to'ldiring va yeching.",
      },
      { property: "og:title", content: "Kassa 24/7 — Telegram kassa bot" },
      {
        property: "og:description",
        content: "Bukmeker hisobini bir necha daqiqada to'ldirish va yechish. Komissiya 0%, 24/7 yordam.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // A dropped connection must not blank the landing page: fall back to "no bot link".
  loader: async () => {
    try {
      return await publicInfo();
    } catch {
      return { bot_username: null as string | null };
    }
  },
  component: Index,
});

const features = [
  { icon: ArrowDownToLine, title: "Hisob to'ldirish", text: "Kontorani tanlang, ID va summani kiriting, kartaga o'tkazing — tamom." },
  { icon: ArrowUpFromLine, title: "Yechib olish", text: "Kassa kodini yuboring — pul UZCARD yoki HUMO kartangizga tushadi." },
  { icon: CreditCard, title: "Hisob raqamlar", text: "Karta va ID raqamlaringiz saqlanadi, keyingi safar bir bosishda." },
  { icon: Clock, title: "24/7 ishlaydi", text: "So'rovlar kechayu kunduz ko'rib chiqiladi." },
  { icon: ShieldCheck, title: "Xavfsiz", text: "Har bir so'rov qayd etiladi va operator tomonidan tekshiriladi." },
  { icon: Percent, title: "Komissiya 0%", text: "Berish va olish kursi bir xil — yashirin to'lovlar yo'q." },
];

function Index() {
  const { bot_username } = Route.useLoaderData();
  const botUrl = bot_username ? `https://t.me/${bot_username}` : null;
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <img src={marble} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />

      <div className="relative mx-auto flex max-w-5xl flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-foreground font-display text-[10px] font-extrabold italic text-background">
              KASSA
            </div>
            <span className="font-display text-lg font-bold">Kassa 24/7</span>
          </div>
          <Link to="/admin" className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            Admin
          </Link>
        </header>

        <section className="py-16 sm:py-24">
          <p className="mb-4 inline-flex rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold">Telegram kassa bot</p>
          <h1 className="max-w-2xl font-display text-4xl font-bold leading-tight sm:text-6xl">
            Bukmeker hisobini <span className="text-gold">tez</span> to'ldiring va yeching
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            LINEBET va boshqa kontoralar — barchasi bitta Telegram botda. Oddiy tugmalar, bir necha daqiqada.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {botUrl && (
              <a
                href={botUrl}
                className="rounded-2xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-[1.02]"
              >
                Botni ochish
              </a>
            )}
          </div>
        </section>

        <section className="grid gap-3 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="glass rounded-3xl p-5">
              <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <f.icon className="size-5" />
              </div>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>

        <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Kassa 24/7
        </footer>
      </div>
    </div>
  );
}
