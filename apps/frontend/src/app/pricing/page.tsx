import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { FREE_LOOKS_COUNT, PLAN_PRICING, PLANS, TOTAL_LOOKS_COUNT, WATERMARK_REMOVAL_PRICE_INR, type PlanId } from "@capseasy/shared";
import { Footer, Nav } from "@/components/home/Sections";
import { currencyForCountry } from "@/lib/billing/cashfree";
import { USD_PRICE_UNSET_NOTE, hasUsdPrice, minutesLabel, priceLabel, projectCountLabel, uploadLimitLabel, type DisplayCurrency } from "@/lib/billing/pricingDisplay";
import { pageMetadata, productJsonLd } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Captionit pricing: Free gives 5 processing minutes once. Paid plans are monthly, with 40, 100 or 250 processing minutes. One price, shown in your currency.",
  path: "/pricing",
});

/**
 * Public pricing. The owner's standing rules, enforced by construction:
 * monthly only (there is no annual price to toggle to), ONE currency per
 * visitor (INR for India, USD elsewhere, never both on the page), Free
 * first, and every limit printed here comes from the same PLANS config
 * the API routes enforce.
 *
 * New minutes model (owner brief 2026-11-14): Free gets 5 processing
 * minutes once, ever. Paid plans get minutes per billing cycle, and
 * unused minutes never roll over. USD prices are not set yet, so a
 * non-India visitor sees INR prices with a plain note — never a guessed
 * conversion. MOV means the ProRes overlay export (mov_alpha). There is
 * no plain MOV file export. There is no separate premium-templates list:
 * the 125 premium looks ARE the premium templates story.
 */
export default async function PricingPage() {
  const country = (await headers()).get("x-vercel-ip-country");
  const currency: DisplayCurrency = currencyForCountry(country);
  const usdUnset = currency === "USD" && PLAN_PRICING.some((p) => !hasUsdPrice(p));

  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      {/* Product/Offer structured data from the same PLAN_PRICING config the
          cards render, so crawlers see the prices even when the visitor's
          geo currency differs. One currency per Offer; visible display is
          still one currency per visitor. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd()).replace(/</g, "\\u003c") }} />
      <Nav />
      <main id="main-content" className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:pt-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Pricing</p>
        <h1 className="mt-3 max-w-2xl font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
          Free while you learn it. Paid when you outgrow it.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#FFFFEB]/70">
          Every plan includes the full editor. Paid plans add processing minutes, all 150 caption looks and
          watermark-free exports. Free gets {FREE_LOOKS_COUNT} looks. Minutes reset each billing cycle. Unused
          minutes do not roll over. Paid plans bill monthly and renew each month. Cancel anytime — your plan runs
          to the end of the paid month.
        </p>
        {usdUnset ? (
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[#FFFFEB]/70">{USD_PRICE_UNSET_NOTE}</p>
        ) : null}

        <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_PRICING.map((entry) => {
            const price = priceLabel(entry, currency);
            const limits = PLANS[entry.id as PlanId];
            const isFree = entry.id === "free";
            return (
              <section
                key={entry.id}
                className={`flex flex-col rounded-2xl border p-6 ${
                  entry.isMostPopular ? "border-[#34D399]/60 bg-[#1C1C1A]" : "border-white/10 bg-[#1C1C1A]"
                }`}
                aria-label={`${entry.name} plan`}
              >
                {entry.isMostPopular ? (
                  <p className="mb-3 inline-flex w-fit rounded-full bg-[#34D399] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#0B1512]">
                    Most Popular
                  </p>
                ) : null}
                <h2 className="font-sora text-[17px] font-bold">{entry.name}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#FFFFEB]/60">{entry.tagline}</p>
                <p className="mt-5">
                  <span className="font-serif text-4xl font-semibold">{price}</span>
                  <span className="ml-2 text-[13px] text-[#FFFFEB]/60">{isFree ? "one-time" : "per month"}</span>
                </p>
                <p className="mt-2 text-[13px] font-semibold text-[#34D399]">
                  {minutesLabel(limits.minutesPerCycle, limits.minutesOneTime)}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[13.5px] leading-relaxed text-[#FFFFEB]/85">
                  {entry.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {isFree ? (
                    <li className="flex gap-2">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" />
                      <span>Remove the watermark from one video for ₹{WATERMARK_REMOVAL_PRICE_INR}, once</span>
                    </li>
                  ) : null}
                </ul>
                <p className="mt-6 border-t border-white/10 pt-4 text-[12px] leading-relaxed text-[#FFFFEB]/55">
                  Up to {projectCountLabel(limits.maxProjects)} projects · videos up to {uploadLimitLabel(limits.maxLocalBytes)}{" "}
                  on this device · videos to {Math.round(limits.maxDurationSec / 60)} min · exports kept {limits.exportRetentionDays}{" "}
                  days
                </p>
                <Link
                  href={isFree ? "/start" : "/settings/billing"}
                  className={`mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 font-sora text-[13.5px] font-semibold ${
                    entry.isMostPopular
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
          <h2 className="font-sora text-[16px] font-bold text-[#FFFFEB]">Compare plans</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-white/10 text-[#FFFFEB]/60">
                  <th className="py-3 pr-4 font-sora text-[12px] font-semibold">What you get</th>
                  {PLAN_PRICING.map((p) => (
                    <th key={p.id} className="px-3 py-3 font-sora text-[12px] font-semibold text-[#FFFFEB]">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">Processing minutes</td>
                  {PLAN_PRICING.map((p) => (
                    <td key={p.id} className="px-3 py-3">{minutesLabel(PLANS[p.id as PlanId].minutesPerCycle, PLANS[p.id as PlanId].minutesOneTime)}</td>
                  ))}
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">Watermark on exports</td>
                  <td className="px-3 py-3">With watermark</td>
                  <td className="px-3 py-3">None</td>
                  <td className="px-3 py-3">None</td>
                  <td className="px-3 py-3">None</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">Watermark removal</td>
                  <td className="px-3 py-3">₹{WATERMARK_REMOVAL_PRICE_INR} once per video</td>
                  <td className="px-3 py-3">Not needed</td>
                  <td className="px-3 py-3">Not needed</td>
                  <td className="px-3 py-3">Not needed</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">Caption looks</td>
                  <td className="px-3 py-3">{FREE_LOOKS_COUNT} free looks</td>
                  <td className="px-3 py-3">All {TOTAL_LOOKS_COUNT} looks</td>
                  <td className="px-3 py-3">All {TOTAL_LOOKS_COUNT} looks</td>
                  <td className="px-3 py-3">All {TOTAL_LOOKS_COUNT} looks</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">ProRes overlay export (MOV)</td>
                  <td className="px-3 py-3">No</td>
                  <td className="px-3 py-3">Yes</td>
                  <td className="px-3 py-3">Yes</td>
                  <td className="px-3 py-3">Yes</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="py-3 pr-4">Projects</td>
                  {PLAN_PRICING.map((p) => (
                    <td key={p.id} className="px-3 py-3">{projectCountLabel(PLANS[p.id as PlanId].maxProjects)}</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 pr-4">Exports kept</td>
                  {PLAN_PRICING.map((p) => (
                    <td key={p.id} className="px-3 py-3">{PLANS[p.id as PlanId].exportRetentionDays} days</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Free gives 5 processing minutes once. It does not reset each month. Paid plans get fresh minutes each
            billing cycle. Unused minutes do not roll over.
          </p>
          <p>
            The ₹{WATERMARK_REMOVAL_PRICE_INR} payment removes the watermark from one Free video project. Re-exports
            of that same project stay watermark-free. It buys no minutes and no looks. Watermark removal checkout is
            not live yet.
          </p>
          <p>
            MOV here means the ProRes overlay export. There is no plain MOV file export. The 125 premium looks are
            the premium templates. There is no separate premium template list.
          </p>
        </div>

        <div className="mt-14 max-w-3xl space-y-4 text-[14px] leading-relaxed text-[#FFFFEB]/70">
          <h2 className="font-sora text-[16px] font-bold text-[#FFFFEB]">How paid plans work</h2>
          <p>
            Paid plans are monthly. Your minutes reset at the start of each billing cycle. When a cycle ends your
            unused minutes are gone. Your projects are never deleted for dropping back to Free.
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
