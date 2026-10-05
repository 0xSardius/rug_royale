import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A native radio input styled as a brutalist tile. Keyboard: arrows move within the group. */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  children,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center gap-3 border-[3px] border-border px-3 py-2",
        "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring",
        checked ? "bg-primary text-primary-foreground shadow-brutal" : "bg-card hover:bg-muted",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      {children}
    </label>
  );
}
