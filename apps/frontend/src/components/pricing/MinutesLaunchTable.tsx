import { FREE_LAUNCH_END_LABEL, PAID_FROM_LABEL, isFreeLaunchWindow } from "@/lib/billing/freeLaunch";

/**
 * Minutes pricing, previewed on /pricing during the 5-day free launch
 * window (owner, 2026-11-15): what paid becomes from 21 Nov. TEMPORARY —
 * the minutes deploy (separate sequence, gated on Cashfree Subscriptions
 * approval) replaces this table with the real pricing config; do not edit
 * these numbers here, edit them on that branch.
 *
 * INR-only: the minutes model has no USD prices yet (owner decision
 * pending on the minutes branch), so the table shows ₹ with the note
 * below — it never mixes ₹ and $ on one card.
 */
export const MINUTES_LAUNCH_PLANS = [
  { name: "Free", price: "₹0", minutes: "5 minutes, one-time", tagline: "Try the full studio." },
  { name: "Starter", price: "₹149", minutes: "40 minutes a month", tagline: "For a posting habit." },
  { name: "Creator", price: "₹349", minutes: "100 minutes a month", tagline: "For regular creators." },
  { name: "Pro", price: "₹749", minutes: "250 minutes a month", tagline: "For heavy schedules." },
] as const;

export default function MinutesLaunchTable({ windowActive = isFreeLaunchWindow() }: { windowActive?: boolean }) {
  // After the window the table disappears: /pricing returns exactly to
  // the pre-window state unless the minutes deploy has landed by then.
  if (!windowActive) return null;
  return (
    <section aria-label={`Minutes pricing from ${PAID_FROM_LABEL}`} className="mt-14">
      <h2 className="font-sora text-[16px] font-bold text-[#FFFFEB]">From {PAID_FROM_LABEL} — minutes pricing</h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#FFFFEB]/70">
        Pay for the minutes you use. Everything is free till {FREE_LAUNCH_END_LABEL} — no card needed.
      </p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {MINUTES_LAUNCH_PLANS.map((entry) => (
          <section
            key={entry.name}
            className={`flex flex-col rounded-2xl border p-6 ${
              entry.name === "Creator" ? "border-[#34D399]/60 bg-[#1C1C1A]" : "border-white/10 bg-[#1C1C1A]"
            }`}
            aria-label={`${entry.name} plan from ${PAID_FROM_LABEL}`}
          >
            <h3 className="font-sora text-[17px] font-bold">{entry.name}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[#FFFFEB]/60">{entry.tagline}</p>
            <p className="mt-5">
              <span className="font-serif text-4xl font-semibold">{entry.price}</span>
              <span className="ml-2 text-[13px] text-[#FFFFEB]/60">{entry.name === "Free" ? "one-time" : "a month"}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-[13.5px] leading-relaxed text-[#FFFFEB]/85">
              <li className="flex gap-2">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" />
                <span>{entry.minutes}</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#34D399]" />
                <span>Editor and Creator Studio included</span>
              </li>
            </ul>
            <button
              type="button"
              disabled
              className="mt-6 inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-2.5 font-sora text-[13.5px] font-semibold text-[#FFFFEB] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Available {PAID_FROM_LABEL}
            </button>
          </section>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-[#FFFFEB]/55">Prices in Indian rupees.</p>
    </section>
  );
}
