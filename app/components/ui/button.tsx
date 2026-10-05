import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger";

export const buttonClasses = (variant: Variant = "primary", size: "md" | "lg" = "md") =>
  cn(
    "inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wide",
    "border-[3px] border-border",
    size === "md" ? "min-h-10 px-4 py-1 text-sm" : "min-h-12 px-6 py-2 text-base",
    variant !== "ghost" && "shadow-brutal",
    // Press effect: lift on hover, sink on press. Transform/shadow only, never `all`.
    "transition-[transform,box-shadow] duration-100 motion-reduce:transition-none",
    variant !== "ghost" &&
      "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-brutal-lg active:translate-x-1 active:translate-y-1 active:shadow-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    variant === "primary" && "bg-primary text-primary-foreground",
    variant === "secondary" && "bg-card text-card-foreground",
    variant === "accent" && "bg-accent text-accent-foreground",
    variant === "danger" && "bg-rug text-rug-foreground",
    variant === "ghost" && "border-transparent bg-transparent hover:border-border",
  );

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size), className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
