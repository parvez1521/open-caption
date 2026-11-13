import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { LegalNav } from "@/components/legal/LegalNav";
import { Footer } from "@/components/home/Sections";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-major text-obsidian">
      <header className="sticky top-0 z-30 border-b border-obsidian/10 bg-major">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" aria-label="Captionit home"><Logo height={26} /></Link>
          <Link href="/start" className="rounded-full bg-obsidian px-4 py-2 text-sm font-semibold text-major transition hover:bg-obsidian/85">Start free</Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-16">
        <LegalNav />
        <main id="main-content" className="min-w-0">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
