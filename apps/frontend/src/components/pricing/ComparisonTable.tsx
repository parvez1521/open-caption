"use client";
// Client component on purpose: comparisonRows() reads LOOKS from the
// @capseasy/templates barrel, which needs the browser (createContext +
// Remotion in videoFrame/fonts). A Server Component importing it fails the
// production build. The table is presentational; no server data is involved.
import { PLAN_PRICING } from "@capseasy/shared";
import { Check } from "@/components/ui/icons";
import { comparisonRows } from "@/lib/billing/pricingComparison";
import type { DisplayCurrency } from "@/lib/billing/pricingDisplay";

/**
 * Plan comparison table on /pricing, below the plan cards. Every cell comes
 * from pricingComparison.ts, which reads PLAN_PRICING / PLANS, the looks
 * registry and CREATABLE_EXPORT_KINDS — nothing here is typed twice.
 *
 * No upload-size row and no Clipper anywhere: the row builder strips the
 * Clipper clause from the studio label at render time (see
 * pricingComparison.ts). Full dark, house Check icon only, no hover
 * animation, no glass, no purple.
 */
export default function ComparisonTable({ currency }: { currency: DisplayCurrency }) {
  const rows = comparisonRows(currency);
  return (
    <section aria-labelledby="compare-plans-heading" className="mt-16">
      <h2 id="compare-plans-heading" className="font-sora text-[20px] font-bold text-[#FFFFEB]">
        Compare plans
      </h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#FFFFEB]/70">
        The same editor on every plan. Paid plans raise the limits — more videos a month, longer videos, more
        projects, longer export storage.
      </p>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#1C1C1A]">
        <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px] leading-relaxed">
          <caption className="sr-only">Plan comparison: price, limits and included features for Free, Starter, Plus and Pro</caption>
          <thead>
            <tr className="border-b border-white/10">
              <th scope="col" className="px-5 py-4 font-sora text-[13px] font-bold text-[#FFFFEB]/60">
                <span className="sr-only">Feature</span>
              </th>
              {PLAN_PRICING.map((entry) => (
                <th key={entry.id} scope="col" className="px-5 py-4 font-sora text-[15px] font-bold text-[#FFFFEB]">
                  {entry.name}
                  {entry.id === "growth" && (
                    <span className="ml-2 rounded-full bg-[#34D399] px-2 py-0.5 align-middle text-[11px] font-bold text-[#0B1512]">
                      Best value
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-b-0">
                <th scope="row" className="px-5 py-3.5 font-semibold text-[#FFFFEB]/85">
                  {row.label}
                </th>
                {row.values.map((value, i) => (
                  <td key={PLAN_PRICING[i]!.id} className="px-5 py-3.5 text-[#FFFFEB]/85">
                    {row.id === "studio" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Check aria-hidden className="h-4 w-4 text-[#34D399]" />
                        <span className="sr-only">{value}</span>
                        <span aria-hidden>{value}</span>
                      </span>
                    ) : (
                      value
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
