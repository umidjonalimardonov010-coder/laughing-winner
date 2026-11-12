import { Drawer as V } from "vaul";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Bookmaker } from "./context";

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
        solid ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "bg-primary/15 text-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}

const HUES = [150, 220, 30, 280, 190, 60, 340];
export function BkLogo({ bk, size = "md" }: { bk: Pick<Bookmaker, "id" | "name" | "logo">; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-12 w-12 text-[9px]" : "h-16 w-[4.5rem] text-[11px]";
  if (bk.logo)
    return <img src={bk.logo} alt={bk.name} className={cn(dims, "shrink-0 rounded-2xl object-cover ring-1 ring-border")} />;
  const hue = HUES[[...bk.id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
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
        "h-14 w-full rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition active:scale-[0.99] disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
        className,
      )}
    />
  );
}
