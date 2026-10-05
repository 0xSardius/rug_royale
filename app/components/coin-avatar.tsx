import type { Coin } from "@rug-royale/sdk";
import { cn } from "@/lib/utils";

export function CoinAvatar({ coin, size = "md" }: { coin: Coin | undefined; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-8 w-8" : size === "md" ? "h-12 w-12" : "h-16 w-16";
  if (!coin?.image) {
    return (
      <div className={cn(dim, "flex items-center justify-center border-[3px] border-border bg-muted text-xs font-black")}>
        ?
      </div>
    );
  }
  return (
    // Remote IPFS/Irys images; next/image would need per-gateway config for little gain here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coin.image}
      alt={`${coin.name} logo`}
      className={cn(dim, "border-[3px] border-border bg-muted object-cover")}
      loading="lazy"
    />
  );
}
