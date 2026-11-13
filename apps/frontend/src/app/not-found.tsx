import type { Metadata } from "next";
import Link from "next/link";

/**
 * Own title/description instead of inheriting the homepage's verbatim —
 * a 404 that reports the homepage title in search results looks like a
 * soft-404 duplicate. The route still returns a true 404 status (Next
 * renders not-found.tsx with a 404); metadata only changes the document
 * head.
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: "This page doesn't exist on Captionit. The link may be old or mistyped.",
};

export default function NotFound() {
  return (
    <main id="main-content" className="grid min-h-[100svh] place-items-center bg-[#141412] px-6 text-center text-[#FFFFEB]">
      <div>
        <p className="font-mono text-sm text-[#FFFFEB]/60">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-[15px] text-[#FFFFEB]/65">The link may be old or mistyped.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-[#FFFFEB] px-5 py-2.5 text-sm font-semibold text-[#141412]">Back to Captionit</Link>
      </div>
    </main>
  );
}
