"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEGAL_PAGES } from "@/lib/legal";

/** Sidebar on desktop, a swipeable chip row on phones. */
export function LegalNav() {
  const path = usePathname();
  return (
    <nav aria-label="Legal documents" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      <p className="mb-3 hidden text-xs font-semibold uppercase tracking-wider text-obsidian/50 lg:block">Legal</p>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
        {LEGAL_PAGES.map((p) => {
          const on = path === p.href;
          return (
            <li key={p.href} className="shrink-0">
              <Link
                href={p.href}
                aria-current={on ? "page" : undefined}
                className={`block whitespace-nowrap rounded-full border px-3 py-2 text-sm transition lg:rounded-lg lg:border-0 lg:px-3 lg:py-2 ${on ? "border-obsidian bg-obsidian text-major lg:bg-emerald-accent lg:text-[#141412]" : "border-obsidian/15 text-obsidian/70 hover:bg-muted-beige/60 hover:text-obsidian"}`}
              >
                {p.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
