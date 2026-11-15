import { cn } from "@/lib/utils";

const HUES = [142, 220, 30, 280, 190, 60, 340];

/** Bookmaker logo, or a coloured name tile when no logo is uploaded. */
export function BkLogo({ bk, size = "md" }: { bk: { id: string; name: string; logo: string | null }; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-12 w-12 text-[9px]" : "h-16 w-[4.5rem] text-[11px]";
  if (bk.logo) return <img src={bk.logo} alt={bk.name} className={cn(dims, "shrink-0 rounded-2xl object-cover ring-1 ring-border")} />;
  const hue = bk.id === "linebet" ? 142 : HUES[[...bk.id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  return (
    <div
      className={cn(dims, "flex shrink-0 items-center justify-center rounded-2xl px-1 text-center font-display font-extrabold italic leading-none ring-1 ring-border")}
      style={{
        background: `radial-gradient(120% 90% at 50% 100%, oklch(0.55 0.2 ${hue} / 0.9), oklch(0.16 0.04 ${hue}) 70%)`,
        color: "oklch(0.98 0.01 0)",
      }}
    >
      {bk.name}
    </div>
  );
}
