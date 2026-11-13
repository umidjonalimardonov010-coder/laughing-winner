import { Drawer as V } from "vaul";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Bookmaker } from "./context";
import coin from "@/assets/coin-gold.webp";

export function Glass({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("glass block w-full rounded-3xl text-left", onClick && "transition active:scale-[0.99]", className)}>
      {children}
    </Comp>
  );
}

export function IconTile({ children, solid, className }: { children: ReactNode; solid?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-2xl",
        solid
          ? "btn-pro"
          : "border border-primary/25 bg-gradient-to-br from-primary/25 to-primary/5 text-primary shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

const HUES = [142, 220, 30, 280, 190, 60, 340];
export function BkLogo({ bk, size = "md" }: { bk: Pick<Bookmaker, "id" | "name" | "logo">; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-12 w-12 text-[9px]" : "h-16 w-[4.5rem] text-[11px]";
  if (bk.logo)
    return <img src={bk.logo} alt={bk.name} className={cn(dims, "shrink-0 rounded-2xl object-cover ring-1 ring-border")} />;
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

export function BottomSheet({
  open,
  onOpenChange,
  children,
  title,
  headerLeft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: ReactNode;
  title?: ReactNode;
  headerLeft?: ReactNode;
}) {
  return (
    <V.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false} repositionInputs={false}>
      <V.Portal>
        <V.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <V.Content className="glass-solid fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-md flex-col rounded-t-[2rem] outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/40" />
          <div className="flex items-center gap-3 px-5 pb-3 pt-4">
            {headerLeft}
            <V.Title className="flex-1 truncate text-lg font-semibold">{title}</V.Title>
            <V.Close className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground" aria-label="close">
              <X className="size-5" />
            </V.Close>
          </div>
          <V.Description className="sr-only">{typeof title === "string" ? title : ""}</V.Description>
          <div className="no-scrollbar overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
        </V.Content>
      </V.Portal>
    </V.Root>
  );
}

export function Step({ n, title, right, disabled, children }: { n: number; title: string; right?: ReactNode; disabled?: boolean; children: ReactNode }) {
  return (
    <div className={cn("rounded-3xl border border-border bg-card/60 p-4", disabled && "opacity-50")}>
      <div className="mb-3 flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">{n}</span>
        <span className="flex-1 font-semibold">{title}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

export const inputCls =
  "h-14 w-full rounded-2xl border border-input bg-secondary/70 px-4 text-lg text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary disabled:opacity-60";

export function PrimaryButton({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn(
        "btn-pro flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold tracking-wide",
        className,
      )}
    />
  );
}

/** "LINE" + "BET" wordmark in Linebet colors. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-black italic tracking-tight", className)}>
      <span className="text-foreground">LINE</span>
      <span className="text-primary drop-shadow-[0_0_12px_var(--color-primary)]">BET</span>
    </span>
  );
}

export function Coin({ size, className, spin = 3.5, delay = 0 }: { size: number; className?: string; spin?: number; delay?: number }) {
  return (
    <span className={cn("inline-block [perspective:600px]", className)} style={{ width: size, height: size }}>
      <img
        src={coin}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className="coin-spin block size-full"
        style={{ ["--spin" as string]: `${spin}s`, ["--delay" as string]: `${-delay}s` }}
      />
    </span>
  );
}

// Coins floating and turning over the background; everything else stays still.
const COINS = [
  { top: "9%", left: "6%", size: 34, spin: 3.2, float: 6.5, delay: 0.2, tilt: -8, blur: false },
  { top: "16%", left: "82%", size: 58, spin: 4.2, float: 7.5, delay: 1.1, tilt: 10, blur: false },
  { top: "37%", left: "-3%", size: 64, spin: 4.8, float: 8, delay: 2.3, tilt: 12, blur: true },
  { top: "47%", left: "88%", size: 28, spin: 2.8, float: 5.5, delay: 0.7, tilt: -6, blur: false },
  { top: "64%", left: "10%", size: 40, spin: 3.6, float: 6.8, delay: 1.7, tilt: 6, blur: false },
  { top: "74%", left: "76%", size: 76, spin: 5.2, float: 9, delay: 3.1, tilt: -12, blur: true },
  { top: "88%", left: "40%", size: 24, spin: 2.6, float: 5, delay: 0.4, tilt: 4, blur: true },
];

export function CoinField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 mx-auto max-w-md overflow-hidden">
      {COINS.map((c, i) => (
        <span
          key={i}
          className={cn("coin-float absolute", c.blur && "opacity-70 blur-[1.5px]")}
          style={{
            top: c.top,
            left: c.left,
            ["--float" as string]: `${c.float}s`,
            ["--delay" as string]: `${-c.delay}s`,
            ["--tilt" as string]: `${c.tilt}deg`,
          }}
        >
          <Coin size={c.size} spin={c.spin} delay={c.delay} />
        </span>
      ))}
    </div>
  );
}
