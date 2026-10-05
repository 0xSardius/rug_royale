"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Check, Copy, ExternalLink, LogOut } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { explorerUrl } from "@/lib/config";
import { truncateAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Disconnected → opens the wallet modal; connected → address with a copy/explorer/disconnect menu. */
export function WalletButton() {
  const { publicKey, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  if (!publicKey) {
    return (
      <Button onClick={() => setVisible(true)} loading={connecting}>
        {connecting ? "Connecting" : "Connect wallet"}
      </Button>
    );
  }

  const address = publicKey.toBase58();
  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div ref={root} className="relative">
      <button
        className={cn(buttonClasses("secondary"), "font-mono normal-case")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="h-2.5 w-2.5 border-2 border-border bg-win" aria-hidden />
        {truncateAddress(address)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 border-[3px] border-border bg-card shadow-brutal-lg"
        >
          <MenuItem onClick={copy} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>
            {copied ? "Copied" : "Copy address"}
          </MenuItem>
          <a
            role="menuitem"
            href={explorerUrl("address", address)}
            target="_blank"
            rel="noreferrer"
            className={menuItemClass}
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> View on explorer
          </a>
          <MenuItem
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            icon={<LogOut className="h-4 w-4" />}
          >
            Disconnect
          </MenuItem>
        </div>
      )}
    </div>
  );
}

const menuItemClass =
  "flex h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold hover:bg-primary focus-visible:bg-primary focus-visible:outline-none";

function MenuItem({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick} className={menuItemClass}>
      <span aria-hidden>{icon}</span>
      {children}
    </button>
  );
}
