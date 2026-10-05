import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";

const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rug Royale",
  description: "1v1 trading duels on Solana. Same coin, same pool, one winner.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 lg:px-8">{children}</main>
          <footer className="border-t-[3px] border-border px-4 py-4 text-xs text-muted-foreground md:px-6 lg:px-8">
            Devnet demo. Entries are devnet SOL; coins and bankrolls are program-minted demo tokens.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
