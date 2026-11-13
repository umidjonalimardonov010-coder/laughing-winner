import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Clock, ShieldCheck, Users, Wallet } from "lucide-react";
import marble from "@/assets/linebet-bg.jpg";
import { publicInfo } from "@/lib/public.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kassa 24/7 — bukmeker hisobini tez to'ldirish va yechish" },
      {
        name: "description",
        content:
          "Telegram bot va WALLET ilovasi orqali 1XBET, LINEBET, MELBET va boshqa bukmeker hisoblarini 24/7 tez to'ldiring va yeching.",
      },
      { property: "og:title", content: "Kassa 24/7 — Telegram kassa bot" },
      {
        property: "og:description",
        content: "Bukmeker hisobini bir necha daqiqada to'ldirish va yechish. Referal dasturi va 24/7 yordam.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: () => publicInfo(),
  component: Index,
});

const features = [
  { icon: ArrowDownToLine, title: "Hisobni to'ldirish", text: "Bukmeker ID raqamini kiriting, summani tanlang — tamom." },
  { icon: ArrowUpFromLine, title: "Hisobdan yechish", text: "4 belgili kod bilan pulni hamyon balansiga chiqaring." },
  { icon: Wallet, title: "WALLET hamyon", text: "Kartadan to'ldiring, kartaga yeching, tarixni kuzating." },
  { icon: Users, title: "Hamkorlik dasturi", text: "Do'stlaringizni taklif qiling va bonus oling." },
  { icon: Clock, title: "24/7 ishlaydi", text: "So'rovlar kechayu kunduz ko'rib chiqiladi." },
  { icon: ShieldCheck, title: "Xavfsiz", text: "Har bir so'rov qayd etiladi, rad etilsa pul qaytadi." },
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
            1XBET, LINEBET, MELBET, XPARIBET, WINWIN — barchasi bitta botda. Telegram ichidagi WALLET ilovasi bilan bir necha daqiqada.
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
            <Link to="/app" search={{}} className="glass rounded-2xl px-6 py-3 font-semibold">
              WALLET'ni ko'rish
            </Link>
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
