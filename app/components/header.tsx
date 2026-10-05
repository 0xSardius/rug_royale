"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/card";
import { WalletButton } from "@/components/wallet-button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Lobby" },
  { href: "/create", label: "Create duel" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="border-b-[3px] border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-4 py-3 md:px-6 lg:px-8">
        <Link
          href="/"
          className="border-[3px] border-border bg-rug px-2 py-1 text-lg font-black uppercase tracking-tight text-rug-foreground shadow-brutal-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
        >
          Rug Royale
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname === n.href ? "page" : undefined}
              className={cn(
                "flex h-10 items-center border-[3px] px-3 text-sm font-bold uppercase",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
                pathname === n.href ? "border-border bg-primary text-primary-foreground" : "border-transparent hover:border-border",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Badge tone="devnet">Devnet</Badge>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
