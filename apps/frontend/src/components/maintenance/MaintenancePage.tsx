import { LEGAL } from "@/lib/legal";

/**
 * Maintenance holding page (production-pages audit). Shown by the root
 * layout when MAINTENANCE_MODE=true, and directly at /maintenance for
 * preview. It promises no return time — none is known when the flag is
 * set — and points at the support inbox for anything urgent.
 */
export function MaintenancePage() {
  return (
    <main id="main-content" className="grid min-h-[100svh] place-items-center bg-[#141412] px-6 text-center text-[#FFFFEB]">
      <div>
        <p className="font-mono text-sm text-[#FFFFEB]/60">Maintenance</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Captionit is down for maintenance</h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-[15px] leading-relaxed text-[#FFFFEB]/65">
          We are doing planned work on the site. Please check back soon — your projects are safe and will be here when we are back.
        </p>
        <p className="mt-6 text-[14px] text-[#FFFFEB]/60">
          Something urgent? Write to{" "}
          <a className="font-semibold text-[#FFFFEB] underline decoration-[#34D399]/60 underline-offset-2" href={`mailto:${LEGAL.email}`}>
            {LEGAL.email}
          </a>
          .
        </p>
      </div>
    </main>
  );
}
