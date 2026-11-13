import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PLAN_PRICING, PLANS } from "@capseasy/shared";
import { Footer, Nav } from "@/components/home/Sections";
import { currencyForCountry } from "@/lib/billing/cashfree";
import { priceLabel, projectCountLabel, uploadLimitLabel, type DisplayCurrency } from "@/lib/billing/pricingDisplay";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Captionit pricing: a free plan with the full editor, and 30-day paid passes for more projects, bigger uploads and longer videos. One price, shown in your currency — no auto-renewal, no surprise charges.",
  path: "/pricing",
});

/**
 * Public pricing. The owner's standing rules, enforced by construction:
 * monthly only (paid plans are 30-day passes — there is no annual price to
 * toggle to), ONE currency per visitor (INR for India, USD elsewhere,
 * never both on the page), Free first, and every limit printed here comes
 * from the same PLANS config the API routes enforce.
 */
export default async function PricingPage() {
  const country = (await headers()).get("x-vercel-ip-country");
  const currency: DisplayCurrency = currencyForCountry(country);

  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content" className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:pt-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Pricing</p>
        <h1 className="mt-3 max-w-2xl font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Free while you learn it. Paid when you outgrow it.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#FFFFEB]/70">
          Every plan includes the full editor, all 150 caption templates and every AI tool — paid plans raise the
          limits, they don&rsquo;t unlock features. Paid plans are 30-day passes: you pay once, nothing renews or
          charges you again automatically.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_PRICING.map((entry) => {
            const price = priceLabel(entry, currency);
            const limits = PLANS[entry.id];
            const isFree = entry.id === "free";
            return (
              <section
                key={entry.id}
                className={`flex flex-col rounded-2xl border p-6 ${
                  entry.id === "growth" ? "border-[#34D399]/60 bg-[#1C1C1A]" : "border-white/10 bg-[#1C1C1A]"
                }`}
                aria-label={`${entry.name} plan`}
              >
                <h2 className="font-sora text-[17px] font-bold">{entry.name}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#FFFFEB]/60">{entry.tagline}</p>
                <p className="mt-5">
                  <span className="font-serif text-4xl font-semibold">{price}</span>
                  <span className="ml-2 text-[13px] text-[#FFFFEB]/60">{isFree ? "forever" : "for 30 days"}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[13.5px] leading-relaxed text-[#FFFFEB]/85">
                  {entry.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-[#FFFFEB]/55">
                  Up to {projectCountLabel(limits.maxProjects)} projects · videos up to {uploadLimitLabel(limits.maxLocalBytes)}{" "}
                  on this device · videos to {Math.round(limits.maxDurationSec / 60)} min · exports kept {limits.exportRetentionDays}{" "}
                  days
                </p>
                <Link
                  href={isFree ? "/start" : "/settings/billing"}
                  className={`mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 font-sora text-[13.5px] font-semibold ${
                    entry.id === "growth"
                      ? "bg-[#34D399] text-[#0B1512]"
                      : "border border-white/25 text-[#FFFFEB]"
                  }`}
                >
                  {isFree ? "Start free" : `Get ${entry.name}`}
                </Link>
              </section>
            );
          })}
        </div>

        <div className="mt-14 max-w-3xl space-y-4 text-[14px] leading-relaxed text-[#FFFFEB]/70">
          <h2 className="font-sora text-[16px] font-bold text-[#FFFFEB]">How paid plans work</h2>
          <p>
            Pay once and the higher limits apply to your account for 30 days. When the 30 days end your account
            returns to Free — nothing is charged again, and your projects are never deleted for dropping back.
            Buying the same plan again while it&rsquo;s active adds 30 days to your current period; switching to a
            different plan starts a fresh 30 days on the new plan.
          </p>
          <p>
            Prices are shown in {currency === "INR" ? "Indian rupees" : "US dollars"}{" "}based on where you&rsquo;re
            visiting from. Payments are processed by Cashfree over UPI, cards and netbanking in India, and cards
            internationally.
          </p>
          <p>
            Questions about a payment? Write to{" "}
            <a className="underline decoration-[#34D399]/60 underline-offset-2" href="mailto:work.techhacksai@gmail.com">
              work.techhacksai@gmail.com
            </a>{" "}
            — plan changes, refunds and everything money-related are handled by a person, not a bot.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
