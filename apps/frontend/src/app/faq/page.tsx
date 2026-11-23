import type { Metadata } from "next";
import Link from "next/link";
import { FAQS } from "@/components/home/faqs";
import { faqPageJsonLd, pageMetadata } from "@/lib/seo";
import { Footer, Nav } from "@/components/home/Sections";
import { LEGAL } from "@/lib/legal";

/**
 * Minimal help centre (production-pages audit): the same 8 Q&As as the
 * homepage FAQ section, on their own route so support can link to them
 * and the Studio shell can link here. Content is reused from
 * src/components/home/faqs.ts, never rewritten — the FAQPage schema below
 * is built from the same array, so the two cannot diverge.
 */
export const metadata: Metadata = pageMetadata({
  title: "Frequently Asked Questions",
  description: "Answers to the most common Captionit questions: pricing, privacy, vertical video, exports and languages.",
  path: "/faq",
});

const structuredData = faqPageJsonLd(FAQS);

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <main id="main-content" className="mx-auto max-w-3xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Help centre</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Frequently asked questions
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-[#FFFFEB]/80">
          The short answers to the questions we get most. Anything else, write to{" "}
          <a className="underline decoration-[#34D399]/60 underline-offset-2" href={`mailto:${LEGAL.email}`}>
            {LEGAL.email}
          </a>{" "}
          — you will get a person, not a ticket queue.
        </p>
        <div className="mt-12 space-y-8">
          {FAQS.map((faq, i) => (
            <section key={faq.q} aria-labelledby={`faq-q-${i}`}>
              <h2 id={`faq-q-${i}`} className="text-xl font-bold tracking-tight">{faq.q}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-[#FFFFEB]/75">{faq.a}</p>
            </section>
          ))}
        </div>
        <p className="mt-14 rounded-2xl border border-[#FFFFEB]/10 bg-[#1E1E1B] p-5 text-sm leading-relaxed text-[#FFFFEB]/70">
          Still stuck? Write to <a className="font-medium text-[#FFFFEB] underline decoration-[#34D399]/60 underline-offset-2" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> or
          open the <Link className="font-medium text-[#FFFFEB] underline decoration-[#34D399]/60 underline-offset-2" href="/pricing">pricing page</Link> for
          plan questions.
        </p>
      </main>
      <Footer />
    </div>
  );
}
