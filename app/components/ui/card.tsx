import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-[3px] border-border bg-card p-5 text-card-foreground shadow-brutal", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "muted",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "muted" | "primary" | "accent" | "win" | "rug" | "devnet" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border-2 border-border px-2 py-0.5 text-xs font-bold uppercase tracking-wide",
        tone === "muted" && "bg-muted text-foreground",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "accent" && "bg-accent text-accent-foreground",
        tone === "win" && "bg-win text-win-foreground",
        tone === "rug" && "bg-rug text-rug-foreground",
        tone === "devnet" && "bg-devnet text-devnet-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse bg-muted motion-reduce:animate-none", className)} />;
}
